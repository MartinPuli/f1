import { timingSafeEqual } from 'node:crypto';
import { api } from './api.js';
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
  return async (request) => {
    request = normalizeVercelRequest(request);
    let cookie;
    const finish = (result) => {
      const response = secureResponse(result);
      if (cookie) response.headers.set('Set-Cookie', cookie);
      return response;
    };
    try {
      if (
        !env.SESSION_SECRET ||
        Buffer.byteLength(env.SESSION_SECRET) < 32 ||
        !env.APP_ORIGIN ||
        !store
      )
        return finish(json({ error: 'Server setup is incomplete.' }, 503));
      const url = new URL(request.url),
        allowed = new URL(env.APP_ORIGIN);
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
      if (!/^\/api\/(status|models|decide|races(?:\/[a-f0-9-]{36})?)$/.test(path))
        return finish(json({ error: 'Not found.' }, 404));

      // Vercel overwrites x-forwarded-for at its edge. Don't run this adapter behind an untrusted proxy.
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      if (!(await store.allow('ip:' + rateIdentity(ip, env.SESSION_SECRET), 1200, 60)))
        return finish(json({ error: 'Too many requests. Wait a minute and retry.' }, 429));
      let owner = readSession(request.headers.get('cookie'), env.SESSION_SECRET);
      if (!owner) {
        if (path !== '/api/status' || request.method !== 'GET')
          return finish(json({ error: 'Reload the page to start a browser session.' }, 401));
        ({ owner, cookie } = issueSession(env.SESSION_SECRET));
      }
      const group =
        path === '/api/decide' ? 'drive' : path === '/api/models' ? 'connect' : 'archive';
      const limit = group === 'drive' ? 600 : group === 'connect' ? 12 : 120;
      if (!(await store.allow(`${owner}:${group}`, limit, 60)))
        return finish(json({ error: 'Too many requests. Wait a minute and retry.' }, 429));
      if (path === '/api/status')
        return finish(json({ byok: true, archive: 'browser', retentionDays: 90 }));

      // Ignore Sites identity headers on Vercel. Only our signed cookie selects the archive owner.
      const headers = new Headers(request.headers);
      headers.delete('oai-authenticated-user-id');
      return finish(
        await api(new Request(request, { headers }), { ARCHIVE: store, ARCHIVE_OWNER: owner }),
      );
    } catch {
      // Driver errors can contain SQL values. Keep them out of responses and platform logs.
      return finish(
        json({ error: 'Service unavailable. Try again or download your recording.' }, 503),
      );
    }
  };
}
