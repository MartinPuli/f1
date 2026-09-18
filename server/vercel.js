import { timingSafeEqual } from 'node:crypto';
import { api } from './api.js';
import { boundedJson } from './archive.js';
import { policiesFor, rejectionCache } from './traffic.js';
import { secureResponse } from './security.js';
import { readSession, issueSession, rateIdentity } from './session.js';

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Vercel can expose either the original URL or the rewrite destination to a Web handler.
export function normalizeVercelRequest(request) {
  const url = new URL(request.url);
  if (['/api', '/api/', '/api/index'].includes(url.pathname) && url.searchParams.has('__path')) {
    url.pathname = '/api/' + url.searchParams.get('__path');
    url.searchParams.delete('__path');
    return new Request(url, request);
  }
  return request;
}

// Inject the store in tests; production uses Postgres, never a function's temporary disk.
export function createVercelHandler({ env, store }) {
  const denied = rejectionCache();
  const active = new Set();
  const uploads = new Set();
  let circuitUntil = 0;
  return async (request) => {
    request = normalizeVercelRequest(request);
    let cookie, activeOwner, uploadOwner;
    let phase = 'configuration';
    const finish = (result) => {
      const response = secureResponse(result);
      if (result.status === 429 && !response.headers.has('Retry-After'))
        response.headers.set('Retry-After', '60');
      if (cookie) response.headers.set('Set-Cookie', cookie);
      return response;
    };
    try {
      if (Date.now() < circuitUntil)
        return finish(json({ error: 'Service is cooling down. Try again shortly.' }, 503));
      if (
        !env.SESSION_SECRET ||
        Buffer.byteLength(env.SESSION_SECRET) < 32 ||
        !env.APP_ORIGIN ||
        !store
      )
        return finish(json({ error: 'Server setup is incomplete.' }, 503));
      const url = new URL(request.url);
      let allowed;
      try {
        allowed = new URL(env.APP_ORIGIN);
      } catch {
        return finish(
          json(
            {
              error: 'APP_ORIGIN must be a full HTTPS URL, without a path.',
              code: 'INVALID_APP_ORIGIN',
            },
            503,
          ),
        );
      }
      const path = url.pathname;
      // Cron may use Vercel's deployment hostname rather than the browser's custom domain.
      if (path === '/api/maintenance' && url.protocol === 'https:') {
        const expected = env.CRON_SECRET ? `Bearer ${env.CRON_SECRET}` : '';
        const actual = request.headers.get('authorization') || '';
        if (
          request.method !== 'GET' ||
          !expected ||
          Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
          !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
        )
          return finish(json({ error: 'Not authorized.' }, 401));
        await store.prune();
        return finish(json({ cleaned: true }));
      }
      if (env.API_PAUSED === '1')
        return finish(
          json({ error: 'Online racing is temporarily paused. Demo mode still works.' }, 503),
        );
      if (
        allowed.protocol !== 'https:' ||
        allowed.origin !== env.APP_ORIGIN ||
        url.origin !== allowed.origin
      )
        return finish(json({ error: 'Host not allowed.' }, 403));
      const origin = request.headers.get('origin');
      if (
        (origin && origin !== allowed.origin) ||
        request.headers.get('sec-fetch-site') === 'cross-site' ||
        (!['GET', 'HEAD'].includes(request.method) && origin !== allowed.origin)
      )
        return finish(json({ error: 'Origin not allowed.' }, 403));
      if (
        !/^\/api\/(status|models|decide|community(?:\/[a-f0-9-]{36})?|races(?:\/[a-f0-9-]{36}(?:\/publish)?)?)$/.test(
          path,
        )
      )
        return finish(json({ error: 'Not found.' }, 404));

      const methods =
        path === '/api/status' || path === '/api/models' || path.startsWith('/api/community')
          ? ['GET']
          : path === '/api/decide' || path.endsWith('/publish')
            ? ['POST']
            : path === '/api/races'
              ? ['GET', 'POST']
              : ['GET', 'DELETE'];
      if (!methods.includes(request.method))
        return finish(json({ error: 'Method not allowed.' }, 405));
      if (request.headers.has('content-encoding'))
        return finish(json({ error: 'Encoded request bodies are not supported.' }, 415));
      const maximum = path.endsWith('/publish') ? 100 : path === '/api/decide' ? 30000 : 3500000;
      const size = request.headers.get('content-length');
      if (size && (!/^\d+$/.test(size) || Number(size) > maximum))
        return finish(json({ error: 'Request is too large.' }, 413));
      if (
        request.method === 'POST' &&
        request.headers.get('content-type')?.split(';')[0] !== 'application/json'
      )
        return finish(json({ error: 'Send JSON.' }, 415));
      let owner = readSession(request.headers.get('cookie'), env.SESSION_SECRET);
      if (!owner && path !== '/api/status')
        return finish(json({ error: 'Reload the page to start a browser session.' }, 401));
      // A returning page only needs to verify its signature; it doesn't need a database read.
      if (owner && path === '/api/status')
        return finish(json({ byok: true, archive: 'browser', retentionDays: 90, community: true }));
      if (
        (path === '/api/decide' || path === '/api/models') &&
        !/^Bearer [^\s]{1,512}$/i.test(request.headers.get('authorization') || '')
      )
        return finish(json({ error: 'Add your TypeSafe API key.' }, 401));
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const group = !owner
        ? 'session'
        : path === '/api/decide'
          ? 'drive'
          : path === '/api/models'
            ? 'connect'
            : ['POST', 'DELETE'].includes(request.method)
              ? 'write'
              : 'read';
      const rateIp = rateIdentity(ip, env.SESSION_SECRET);
      const isUpload = path === '/api/races' && request.method === 'POST';
      // Look up known rejections before reading a potentially large recording body.
      const cachedWait = denied.get(
        policiesFor({ owner, ip: rateIp, group, bytes: isUpload ? 1 : 0 }),
      );
      if (cachedWait) {
        const result = finish(
          json({ error: 'Usage limit reached. Wait before trying again.' }, 429),
        );
        result.headers.set('Retry-After', String(cachedWait));
        return result;
      }
      if (isUpload) {
        if (uploads.has(owner) || uploads.size >= 4)
          return finish(json({ error: 'A save is already running. Try again shortly.' }, 429));
        uploadOwner = owner;
        uploads.add(owner);
      }
      if (group === 'drive' && active.has(owner))
        return finish(json({ error: 'A decision is already running. Wait and resume.' }, 409));
      if (group === 'drive') {
        activeOwner = owner;
        active.add(owner);
      }
      let bytes = 0;
      if (request.method === 'POST') {
        let body;
        try {
          body = JSON.stringify(await boundedJson(request, maximum));
        } catch {
          return finish(json({ error: 'Invalid, oversized, or slow request body.' }, 400));
        }
        bytes = path === '/api/races' ? new TextEncoder().encode(body).length : 0;
        request = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body,
          signal: request.signal,
        });
      }
      const policies = policiesFor({
        owner,
        ip: rateIp,
        group,
        bytes,
      });
      phase = 'traffic';
      const admission = policies.length ? await store.admit(policies) : { allowed: true };
      if (!admission.allowed) {
        denied.set(admission.blocked);
        const retry = Math.max(
          1,
          ...admission.blocked.map((p) => Math.ceil(p.end - Date.now() / 1000)),
        );
        const result = finish(
          json({ error: 'Usage limit reached. Try again later; Demo mode still works.' }, 429),
        );
        result.headers.set('Retry-After', String(retry));
        return result;
      }
      phase = 'session';
      if (!owner) {
        ({ owner, cookie } = issueSession(env.SESSION_SECRET));
        return finish(json({ byok: true, archive: 'browser', retentionDays: 90, community: true }));
      }

      phase = 'archive';
      // Ignore Sites identity headers on Vercel. Only our signed cookie selects the archive owner.
      const headers = new Headers(request.headers);
      headers.delete('oai-authenticated-user-id');
      return finish(
        await api(new Request(request, { headers }), { ARCHIVE: store, ARCHIVE_OWNER: owner }),
      );
    } catch (error) {
      circuitUntil = Date.now() + 10000;
      // Driver errors can contain SQL values. Keep them out of responses and platform logs.
      return finish(
        json(
          {
            code: `UNAVAILABLE_${phase.toUpperCase()}`,
            reason: ['42P01', '42703', '28P01', '3D000', '53300', '57P03'].includes(error.code)
              ? error.code
              : error.name === 'TimeoutError'
                ? 'TIMEOUT'
                : 'REQUEST_FAILED',
            error: ['42P01', '42703'].includes(error.code)
              ? 'Cloud archive setup is incomplete. Download your race to keep it.'
              : 'Service unavailable. Try again or download your recording.',
          },
          503,
        ),
      );
    } finally {
      if (activeOwner) active.delete(activeOwner);
      if (uploadOwner) uploads.delete(uploadOwner);
    }
  };
}
