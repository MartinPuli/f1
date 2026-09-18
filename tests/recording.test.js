import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, makeTrack } from '../src/simulation.js';
import { recordRace, applyReplay } from '../src/recording.js';
import { api } from '../server/api.js';
import { cleanRecord, validRecord } from '../server/archive.js';
const id = '11111111-1111-4111-8111-111111111111';
test('the replay endpoint includes finish flags when the rounded frame is after duration', () => {
  const race = new Race(8912);
  race.time = 23.624999999999726;
  race.cars.forEach((car) => {
    car.finished = true;
    car.lap = 1;
    car.finishTime = race.time;
  });
  race.captureFrame();
  const record = recordRace(race, id, 'Finished race', Date.now());
  const replay = new Race(record.seed);
  assert.ok(record.frames.at(-1).t > record.duration);
  applyReplay(replay, record, record.duration);
  assert.ok(replay.cars.every((car) => car.finished && car.lap === 1));
});
function fixture() {
  const race = new Race(77);
  race.apiKey = 'never-store-this';
  race.running = true;
  for (let i = 0; i < 25; i++) race.tick(0.1);
  return recordRace(race, id, 'Test Grand Prix', Date.now());
}
test('recordings preserve replay positions and exclude API credentials', () => {
  const r = fixture();
  assert.ok(validRecord(r));
  assert.ok(r.frames.length > 10);
  assert.equal(JSON.stringify(r).includes('never-store-this'), false);
  const race = new Race(r.seed),
    f = r.frames[5];
  applyReplay(race, r, f.t);
  assert.equal(race.cars[0].x, f.cars[0][0]);
  assert.equal(race.cars[0].z, f.cars[0][1]);
  applyReplay(race, r, -10);
  assert.equal(race.time, 0);
  applyReplay(race, r, 10000);
  assert.equal(race.time, r.duration);
});
test('archive rejects malformed frames and strips unexpected credentials', () => {
  const r = fixture();
  assert.ok(!validRecord({ ...r, seed: -1 }));
  assert.ok(!validRecord({ ...r, frames: [{ t: 0, cars: [] }] }));
  r.apiKey = 'secret';
  r.drivers[0].key = 'secret';
  r.frames[0].apiKey = 'secret';
  assert.equal(JSON.stringify(cleanRecord(r)).includes('secret'), false);
});
test('archive requires identity and isolates read, update, and delete per owner', async () => {
  const rows = new Map();
  const local = {
    list: async (owner) => [...rows.values()].filter((r) => r.owner === owner).map((r) => r.record),
    get: async (owner, id) => rows.get(owner + id)?.record,
    put: async (owner, r) => rows.set(owner + r.id, { owner, record: r }),
    remove: async (owner, id) => rows.delete(owner + id),
  };
  const env = { LOCAL_ARCHIVE: local };
  const req = (owner, method = 'GET', suffix = '', body) =>
    new Request('https://race.test/api/races' + suffix, {
      method,
      headers: {
        ...(owner ? { 'oai-authenticated-user-id': owner } : {}),
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await api(req(null), env)).status, 401);
  assert.equal((await api(req('a', 'POST', '', fixture()), env)).status, 200);
  assert.equal((await api(req('b', 'GET', '/' + id), env)).status, 404);
  await api(req('b', 'DELETE', '/' + id), env);
  assert.equal((await api(req('a', 'GET', '/' + id), env)).status, 200);
  assert.equal((await (await api(req('b'), env)).json()).races.length, 0);
});
test('Jev uses only visitor keys and passes isolated observations to the upstream', async () => {
  const original = globalThis.fetch,
    requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(
      JSON.stringify({
        answers: {
          line: { choice: 'center', confidence: 0.8 },
          pace: { choice: 'balanced', confidence: 0.8 },
        },
      }),
    );
  };
  try {
    const race = new Race();
    const states = race.cars.map(() => ({
      speed_mps: 0,
      visible_road: Array.from({ length: 5 }, () => ({ right: 0, forward: 5 })),
    }));
    const make = (key) =>
      new Request('https://race.test/api/decide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { authorization: 'Bearer ' + key } : {}),
        },
        body: JSON.stringify({ states }),
      });
    assert.equal((await api(make(), { TYPESAFE_API_KEY: 'server-key' })).status, 401);
    const response = await api(make('visitor-key'), { TYPESAFE_API_KEY: 'server-key' });
    assert.equal(response.status, 200);
    assert.equal(requests.length, 5);
    assert.ok(requests.every((r) => r.init.headers.Authorization === 'Bearer visitor-key'));
    assert.equal((await response.json()).decisions.length, 5);
  } finally {
    globalThis.fetch = original;
  }
});
test('seed space yields varied road geometry, separated segments, and finishable demo races', () => {
  const lengths = new Set();
  for (let i = 0; i < 40; i++) {
    const seed = Math.imul(i + 1, 2654435761) >>> 0,
      track = makeTrack(seed);
    lengths.add(track.length.toFixed(4));
    assert.ok(track.length > 250 && track.length < 650);
    for (let a = 0; a < 900; a += 15)
      for (let b = a + 60; b < 900; b += 15) {
        if ((Math.min(b - a, 900 - (b - a)) / 900) * track.length < 24) continue;
        assert.ok(
          track.samples[a].distanceTo(track.samples[b]) > 13,
          `nearby road segments seed ${seed}`,
        );
      }
    const race = new Race(seed);
    race.limit = (i % 5) + 1;
    race.running = true;
    for (let j = 0; j < 5000 && !race.finished; j++) race.tick(0.1);
    assert.ok(
      race.cars.every((c) => c.finished),
      `drivers should finish seed ${seed}`,
    );
  }
  assert.equal(lengths.size, 40);
});
