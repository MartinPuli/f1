import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { readSession, issueSession, SESSION_SECONDS } from '../server/session.js';
import { postgresArchive } from '../server/postgres-archive.js';
import { createVercelHandler, normalizeVercelRequest } from '../server/vercel.js';
import { Race } from '../src/simulation.js';
import { recordRace } from '../src/recording.js';
const secret = 'test-only-secret-with-at-least-32-characters';
const origin = 'https://race.test';
const id = '11111111-1111-4111-8111-111111111111';

test('archive cookies reject forgery and expiry and carry browser protections', () => {
  const now = Date.now(),
    session = issueSession(secret, now);
  assert.equal(readSession(session.cookie, secret, now), session.owner);
  assert.equal(readSession(session.cookie, secret + 'wrong', now), null);
  assert.equal(
    readSession(
      session.cookie.replace(session.owner, '22222222-2222-4222-8222-222222222222'),
      secret,
      now,
    ),
    null,
  );
  assert.equal(readSession(session.cookie, secret, now + (SESSION_SECONDS + 1) * 1000), null);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/'])
    assert.ok(session.cookie.includes(flag));
});

test('Postgres saves are scoped, quota checked, and rate counters reset across windows', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(new URL('../db/postgres/001_archive.sql', import.meta.url), 'utf8'),
    );
    const store = postgresArchive(async (text, params) => (await db.query(text, params)).rows);
    const race = recordRace(new Race(), id, 'Production test', Date.now());
    await store.put('alice', race);
    assert.equal((await store.get('alice', id)).name, 'Production test');
    assert.equal(await store.get('bob', id), null);
    await store.remove('bob', id);
    assert.equal((await store.list('alice')).length, 1);
    assert.equal((await store.list('bob')).length, 0);
    assert.equal('frames' in (await store.list('alice'))[0], false);
    await store.put('alice', { ...race, name: 'Renamed' });
    assert.equal((await store.get('alice', id)).name, 'Renamed');
    for (let i = 1; i <= 49; i++)
      await store.put('alice', {
        ...race,
        id: `${String(i).padStart(8, '0')}-2222-4222-8222-222222222222`,
      });
    await assert.rejects(
      store.put('alice', { ...race, id: '99999999-2222-4222-8222-222222222222' }),
      { code: 'ARCHIVE_FULL' },
    );
    await store.remove('alice', id);
    await store.put('alice', { ...race, id: '99999999-2222-4222-8222-222222222222' });
    assert.equal(await store.allow('test', 2, 60, 100000), true);
    assert.equal(await store.allow('test', 2, 60, 100000), true);
    assert.equal(await store.allow('test', 2, 60, 100000), false);
    assert.equal(await store.allow('test', 2, 60, 180000), true);
    await db.query(
      "UPDATE jevrace_races SET updated_at = now() - interval '91 days' WHERE owner = $1",
      ['alice'],
    );
    await store.prune();
    assert.equal((await store.list('alice')).length, 0);
  } finally {
    await db.close();
  }
});

test('Vercel requires a signed session, ignores forged host identity, and fails closed', async () => {
  const owners = [],
    store = {
      admit: async () => ({ allowed: true, blocked: [] }),
      list: async (owner) => {
        owners.push(owner);
        return [];
      },
    };
  const handler = createVercelHandler({
    env: { APP_ORIGIN: origin, SESSION_SECRET: secret },
    store,
  });
  const req = (path, opts = {}) => new Request(origin + '/api/' + path, opts);
  const bootstrap = await handler(req('status'));
  assert.equal(bootstrap.status, 200);
  const cookie = bootstrap.headers.get('set-cookie');
  const sessionOwner = readSession(cookie, secret);
  assert.equal(
    (await handler(req('races', { headers: { 'oai-authenticated-user-id': 'victim' } }))).status,
    401,
  );
  assert.equal(
    (await handler(req('races', { headers: { cookie, 'oai-authenticated-user-id': 'victim' } })))
      .status,
    200,
  );
  assert.deepEqual(owners, [sessionOwner]);
  assert.equal(
    (
      await handler(
        req('races', {
          method: 'POST',
          headers: { cookie, origin: 'https://attacker.test' },
          body: '{}',
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await handler(req('races', { method: 'POST', headers: { cookie }, body: '{}' }))).status,
    403,
  );
  assert.equal((await handler(new Request('https://wrong.test/api/status'))).status, 403);
  const unconfigured = createVercelHandler({ env: {}, store });
  assert.equal((await unconfigured(req('status'))).status, 503);
  const broken = createVercelHandler({
    env: { APP_ORIGIN: origin, SESSION_SECRET: secret },
    store: {
      admit: async () => {
        throw new Error('secret-db-url');
      },
    },
  });
  const result = await broken(req('status'));
  assert.equal(result.status, 503);
  assert.ok(!(await result.text()).includes('secret-db-url'));
  assert.equal(bootstrap.headers.get('cache-control'), 'no-store');
});

test('maintenance requires its own secret', async () => {
  let pruned = false;
  const handler = createVercelHandler({
    env: { APP_ORIGIN: origin, SESSION_SECRET: secret, CRON_SECRET: 'cron-secret' },
    store: {
      prune: async () => {
        pruned = true;
      },
    },
  });
  assert.equal((await handler(new Request(origin + '/api/maintenance'))).status, 401);
  assert.equal(pruned, false);
  assert.equal(
    (
      await handler(
        new Request('https://deployment.vercel.app/api/maintenance', {
          headers: { authorization: 'Bearer cron-secret' },
        }),
      )
    ).status,
    200,
  );
  assert.equal(pruned, true);
});

test('Vercel rewrites preserve API paths and request bodies', async () => {
  const input = new Request(origin + '/api?__path=races', {
    method: 'POST',
    headers: { origin },
    body: '{"name":"Cup"}',
  });
  const normalized = normalizeVercelRequest(input);
  assert.equal(new URL(normalized.url).pathname, '/api/races');
  assert.equal(await normalized.text(), '{"name":"Cup"}');
  const original = new Request(origin + '/api/models?__path=models');
  assert.equal(normalizeVercelRequest(original), original);
});
