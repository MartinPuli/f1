import test from 'node:test';
import assert from 'node:assert/strict';
import { showcaseAccess, hasAdmin } from '../server/showcase-access.js';
const env = {
  APP_ORIGIN: 'https://race.test',
  ADMIN_PASSWORD: 'a-long-test-only-admin-password',
  SESSION_SECRET: 'a-test-only-signing-secret-at-least-32',
};
const req = (path, options = {}) => new Request('https://race.test' + path, options);
test('public showcase cannot call Jev or create races, even with a TypeSafe key', async () => {
  for (const path of ['/api/decide', '/api/models', '/api/races']) {
    const r = await showcaseAccess(
      req(path, {
        method: path.endsWith('models') ? 'GET' : 'POST',
        headers: { authorization: 'Bearer user-typesafe-key' },
      }),
      env,
    );
    assert.equal(r.status, 401);
  }
  assert.equal(await showcaseAccess(req('/api/community'), env), null);
  assert.equal((await showcaseAccess(req('/api/admin'), env)).status, 200);
});
test('admin login fails closed, rejects foreign origins and verifies signed sessions', async () => {
  const login = (password, origin = env.APP_ORIGIN) =>
    req('/api/admin', { method: 'POST', headers: { origin }, body: JSON.stringify({ password }) });
  assert.equal(
    (await showcaseAccess(login(env.ADMIN_PASSWORD), { ...env, ADMIN_PASSWORD: '' })).status,
    503,
  );
  assert.equal((await showcaseAccess(login(env.ADMIN_PASSWORD), '')).status, 403);
  assert.equal(
    (await showcaseAccess(login(env.ADMIN_PASSWORD, 'https://other.test'), env)).status,
    403,
  );
  assert.equal((await showcaseAccess(login('wrong'), env)).status, 401);
  const r = await showcaseAccess(login(env.ADMIN_PASSWORD), env);
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  const authenticated = req('/api/decide', { method: 'POST', headers: { cookie } });
  assert.equal(await showcaseAccess(authenticated, env), null);
  assert.equal(await hasAdmin(authenticated, env, Date.now() + 9 * 60 * 60 * 1000), false);
  assert.equal(
    await hasAdmin(authenticated, { ...env, ADMIN_PASSWORD: 'rotated-password' }),
    false,
  );
  assert.equal(
    await hasAdmin(
      req('/api/decide', { headers: { cookie: cookie.replace(/\.[a-f0-9]/, '.z') } }),
      env,
    ),
    false,
  );
});
