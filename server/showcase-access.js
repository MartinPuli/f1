import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
const cookieName = '__Host-jevrace-admin';
const mac = (text, secret) => createHmac('sha256', secret).update(text).digest('hex');
const digest = (value) => createHash('sha256').update(value).digest();
export function hasAdmin(request, env, now = Date.now()) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return false;
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
  if (!token) return false;
  const [expires, signature] = token.split('.');
  if (
    !/^\d{13}$/.test(expires) ||
    !/^[a-f0-9]{64}$/.test(signature || '') ||
    Number(expires) <= now ||
    Number(expires) > now + 86400000
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(mac(expires, env.SESSION_SECRET + env.ADMIN_PASSWORD)),
  );
}
// Enforce showcase access at the deployment entry point, before race APIs run.
export async function showcaseAccess(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const json = (body, status = 200, headers = {}) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
  if (path === '/api/admin') {
    if (request.method === 'GET') return json({ admin: hasAdmin(request, env) });
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    if (request.headers.get('origin') !== env.APP_ORIGIN || url.origin !== env.APP_ORIGIN)
      return json({ error: 'Origin not allowed.' }, 403);
    if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 24 || !env.SESSION_SECRET)
      return json({ error: 'Admin access is not configured.' }, 503);
    let data;
    try {
      const body = await request.text();
      if (body.length > 1024) throw new Error();
      data = JSON.parse(body);
    } catch {
      return json({ error: 'Invalid request.' }, 400);
    }
    if (
      typeof data.password !== 'string' ||
      !timingSafeEqual(digest(data.password), digest(env.ADMIN_PASSWORD))
    )
      return json({ error: 'Incorrect password.' }, 401);
    const expires = String(Date.now() + 8 * 60 * 60 * 1000);
    return json({ admin: true }, 200, {
      'Set-Cookie': `${cookieName}=${expires}.${mac(expires, env.SESSION_SECRET + env.ADMIN_PASSWORD)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,
    });
  }
  const privateAction =
    path === '/api/decide' ||
    path === '/api/models' ||
    (path.startsWith('/api/races') && !['GET', 'HEAD'].includes(request.method));
  if (privateAction && !hasAdmin(request, env))
    return json({ error: 'Admin access required.' }, 401);
  return null;
}
