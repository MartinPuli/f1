import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { postgresArchive } from '../server/postgres-archive.js';
import { policiesFor } from '../server/traffic.js';
import { createVercelHandler } from '../server/vercel.js';
import { issueSession } from '../server/session.js';
import { boundedJson } from '../server/archive.js';
import { api, cleanObservation } from '../server/api.js';
import { Race, observe } from '../src/simulation.js';

const secret = 'test-only-secret-with-at-least-32-characters';
const origin = 'https://race.test';
const env = { APP_ORIGIN: origin, SESSION_SECRET: secret };
const cookie = issueSession(secret).cookie;
const req = (path, opts = {}) => new Request(origin + '/api/' + path, opts);
const post = (body, extra = {}) => ({
  method: 'POST',
  headers: { cookie, origin, 'content-type': 'application/json', ...extra },
  body: JSON.stringify(body),
});

test('shared admission bounds parallel visitors, bytes, calendar windows, and stale requests', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(new URL('../db/postgres/001_archive.sql', import.meta.url), 'utf8'),
    );
    let queries = 0;
    const store = postgresArchive(async (sql, params) => {
      queries++;
      return (await db.query(sql, params)).rows;
    });
    const p = [{ bucket: 'global:test', cost: 1, limit: 3, start: 100, end: 200 }];
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        store.admit([...p, { bucket: `owner:${i}`, cost: 1, limit: 1, start: 100, end: 200 }]),
      ),
    );
    assert.equal(results.filter((r) => r.allowed).length, 3);
    assert.equal(queries, 12, 'one query per admission');
    assert.equal(
      (await db.query('SELECT count(*) AS n FROM jevrace_limits')).rows[0].n,
      4,
      'global rejection does not create rotating visitor rows',
    );
    assert.equal((await store.admit([{ ...p[0], start: 200 }])).allowed, true);
    assert.equal(
      (await store.admit(p)).allowed,
      false,
      'late requests cannot reset a newer window',
    );
    assert.equal(
      (await store.admit([{ ...p[0], bucket: 'global:bytes', cost: 7, limit: 10 }])).allowed,
      true,
    );
    assert.equal(
      (await store.admit([{ ...p[0], bucket: 'global:bytes', cost: 7, limit: 10 }])).allowed,
      false,
    );
    const current = policiesFor({ owner: 'alice', ip: 'ip', group: 'write', bytes: 100 });
    assert.equal((await store.admit(current)).allowed, true);
    await store.prune();
    assert.equal(
      (await db.query("SELECT count FROM jevrace_limits WHERE bucket='global:upload-month'"))
        .rows[0].count,
      100,
      'cleanup keeps the active monthly budget',
    );
    const jan = policiesFor({
      owner: 'a',
      ip: 'b',
      group: 'read',
      now: Date.UTC(2026, 0, 31),
    }).find((p) => p.bucket === 'global:month');
    const feb = policiesFor({ owner: 'a', ip: 'b', group: 'read', now: Date.UTC(2026, 1, 1) }).find(
      (p) => p.bucket === 'global:month',
    );
    assert.equal(jan.end, feb.start);
  } finally {
    await db.close();
  }
});

test('invalid requests and returning status avoid Postgres; cached rejections avoid repeated queries', async () => {
  let reads = 0;
  const handler = createVercelHandler({
    env,
    store: {
      admit: async (policies) => {
        reads++;
        return { allowed: false, blocked: [policies[0]] };
      },
    },
  });
  assert.equal((await handler(req('races'))).status, 401);
  assert.equal(
    (await handler(req('decide', post({}, { 'content-length': '9999999' })))).status,
    413,
  );
  assert.equal((await handler(req('decide', post({})))).status, 401);
  assert.equal((await handler(req('status', post({})))).status, 405);
  assert.equal((await handler(req('status', { headers: { cookie } }))).status, 200);
  assert.equal(reads, 0);
  assert.equal((await handler(req('races', { headers: { cookie } }))).status, 429);
  assert.equal((await handler(req('races', { headers: { cookie } }))).status, 429);
  assert.equal(reads, 1);
});

test('simultaneous decisions from one browser reserve their slot before database I/O', async () => {
  let release,
    reads = 0;
  const handler = createVercelHandler({
    env,
    store: {
      admit: async () => {
        reads++;
        await new Promise((r) => (release = r));
        return { allowed: true, blocked: [] };
      },
    },
  });
  const first = handler(req('decide', post({}, { authorization: 'Bearer test' })));
  // Let the first request finish its bounded body read and enter the deferred query.
  while (!release) await new Promise((r) => setImmediate(r));
  const second = await handler(req('decide', post({}, { authorization: 'Bearer test' })));
  assert.equal(second.status, 429);
  assert.equal(reads, 1);
  release();
  assert.equal((await first).status, 400);
});

test('slow and oversized streams are cancelled', async () => {
  let cancelled = false;
  const slow = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(boundedJson(slow, 100, 10), /timed out/);
  assert.equal(cancelled, true);
  await assert.rejects(boundedJson(new Response('x'.repeat(101)), 100), /too large/);
});

test('model observations discard arbitrary payloads and failed batches abort their siblings', async (t) => {
  const race = new Race();
  const states = race.cars.map((c) => observe(c, race.cars, race.track, 0));
  const clean = cleanObservation({
    ...states[0],
    injected: 'secret',
    nearby_cars: Array(100).fill({ right: Infinity }),
    memory: Array(100).fill({ action: 'x'.repeat(1000) }),
  });
  assert.equal(clean.injected, undefined);
  assert.equal(clean.nearby_cars.length, 4);
  assert.equal(clean.memory.length, 8);
  assert.equal(clean.memory[0].action.length, 40);
  let calls = 0,
    cancelled = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    if (++calls === 1) return new Response('{}', { status: 429 });
    return new Promise((_, reject) =>
      options.signal.addEventListener(
        'abort',
        () => {
          cancelled++;
          reject(new Error('aborted'));
        },
        { once: true },
      ),
    );
  });
  const result = await api(req('decide', post({ states }, { authorization: 'Bearer test' })));
  assert.equal(result.status, 429);
  assert.equal(calls, 5);
  assert.equal(cancelled, 4);
});

test('Jev batches stay two wall-clock seconds apart even at 4x playback and stop on rate limits', async (t) => {
  let now = 100000,
    calls = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({ decisions: Array(5).fill({ choice: 'push_straight' }) });
  });
  const race = new Race();
  race.mode = 'jev';
  race.running = true;
  for (let i = 0; i < 100; i++) {
    race.tick(0.1, 4);
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(calls, 1);
  now += 2000;
  race.tick(0.1, 4);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 2);
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Wait' }, { status: 429, headers: { 'Retry-After': '120' } }),
  );
  now += 2000;
  await race.decide();
  assert.equal(race.retryNotBefore, now + 120000);
  race.running = true;
  race.tick(0.1);
  assert.equal(race.running, false);
});
