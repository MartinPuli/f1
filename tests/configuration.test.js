import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, validSettings } from '../src/race-config.js';
import { Race, observe } from '../src/simulation.js';
import { recordRace } from '../src/recording.js';
import { cleanRecord, validRecord } from '../server/archive.js';
import { api } from '../server/api.js';
import worker from '../server/worker.js';
const request = (path, body, key = 'test-visitor-key') =>
  new Request('https://race.test/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
test('per-driver models and prompts are routed independently and resolved versions are returned', async () => {
  const old = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(
      JSON.stringify({
        model: 'jev-1.13.0',
        answers: {
          power: { choice: 'neutral', confidence: 0.9 },
          line: {
            choice: 'center',
            confidence: 0.9,
            probabilities: { center: 0.9, left: 0.06, right: 0.04 },
            private: 'drop-me',
          },
          pace: { choice: 'balanced', confidence: 0.8 },
        },
      }),
    );
  };
  try {
    const race = new Race(),
      settings = defaultSettings();
    settings.prompt = 'Hold a clean racing line.';
    settings.drivers[1].model = 'jev-preview';
    settings.drivers[1].prompt = 'Brake early.';
    const states = [
      observe(race.cars[1], race.cars, race.track, 0),
      observe(race.cars[4], race.cars, race.track, 0),
    ];
    const result = await api(
      request('decide', { states, settings, driverIds: ['lewis', 'franco'] }),
    );
    assert.equal(result.status, 200);
    assert.equal(calls[0].model, 'jev-preview');
    assert.equal(calls[0].questions.line.instructions.driver, 'Brake early.');
    assert.equal(calls[1].questions.line.instructions.driver, settings.drivers[4].prompt);
    assert.equal(calls[0].questions.line.instructions.race, settings.prompt);
    assert.equal(calls[0].questions.pace.instructions.driver, 'Brake early.');
    assert.equal(calls[0].questions.pace.instructions.race, settings.prompt);
    assert.deepEqual(Object.keys(calls[0].questions).sort(), ['line', 'pace', 'power']);
    assert.ok(JSON.parse(calls[0].state).road.speed_limit_mps > 0);
    assert.ok(!calls[0].state.includes('seed'));
    const decision = (await result.json()).decisions[0];
    assert.equal(decision.model, 'jev-1.13.0');
    assert.deepEqual(decision.response.line.probabilities, {
      center: 0.9,
      left: 0.06,
      right: 0.04,
    });
    assert.equal(decision.response.line.private, undefined);
  } finally {
    globalThis.fetch = old;
  }
});
test('an invalid pace rejects the entire batch rather than applying partial decisions', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      answers: {
        power: { choice: 'neutral', confidence: 0.9 },
        line: { choice: 'center' },
        pace: { choice: 'full-throttle-forever' },
      },
    }),
  );
  const race = new Race();
  const response = await api(
    request('decide', {
      states: [observe(race.cars[0], race.cars, race.track, 0)],
    }),
  );
  assert.equal(response.status, 502);
  assert.equal((await response.json()).decisions, undefined);
});
test('model lookup uses the fixed TypeSafe endpoint, strips extra data and does not cache keys', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/models');
    assert.equal(init.redirect, 'error');
    return new Response(
      JSON.stringify({
        models: [{ name: 'jev-latest', private: 'ignored' }, { name: 'https://host.test' }],
      }),
    );
  };
  try {
    const res = await api(request('models'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { models: [{ name: 'jev-latest' }] });
  } finally {
    globalThis.fetch = old;
  }
});
test('network exceptions never echo a supplied credential', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Request failed for test-visitor-key');
  };
  try {
    const res = await api(request('models'));
    assert.equal(res.status, 502);
    assert.ok(!(await res.text()).includes('test-visitor-key'));
  } finally {
    globalThis.fetch = old;
  }
});
test('recordings retain configured and resolved models and prompts, exclude credentials, and support older races', () => {
  const race = new Race();
  race.apiKey = 'secret-never-save';
  race.settings.drivers[0].prompt = 'Keep it clean.';
  race.cars[0].resolvedModel = 'jev-1.13.0';
  const record = recordRace(race, '11111111-1111-4111-8111-111111111111', 'Cup', Date.now());
  assert.ok(validRecord(record));
  const clean = cleanRecord(record);
  assert.equal(clean.settings.drivers[0].prompt, 'Keep it clean.');
  assert.equal(clean.drivers.find((c) => c.id === 'max').resolvedModel, 'jev-1.13.0');
  assert.ok(!JSON.stringify(clean).includes(race.apiKey));
  race.settings.drivers[0].prompt = 'Changed';
  assert.equal(clean.settings.drivers[0].prompt, 'Keep it clean.');
  delete record.settings;
  assert.ok(validRecord(record));
  assert.equal(cleanRecord(record).settings, undefined);
});
test('malformed configs and keys in prompts are rejected before upstream calls', async () => {
  const cfg = defaultSettings();
  cfg.drivers[1].id = cfg.drivers[0].id;
  assert.equal(validSettings(cfg), false);
  cfg.drivers[1].id = 'lewis';
  cfg.drivers[0].prompt = 'x'.repeat(1001);
  assert.equal(validSettings(cfg), false);
  const race = new Race(),
    settings = defaultSettings();
  settings.prompt = 'test-visitor-key';
  const res = await api(
    request('decide', {
      states: [observe(race.cars[0], race.cars, race.track, 0)],
      driverIds: ['max'],
      settings,
    }),
  );
  assert.equal(res.status, 400);
});
test('Worker preserves response bytes and includes key-protecting content policy', async () => {
  const response = await worker.fetch(new Request('https://race.test/'), {
    ASSETS: {
      fetch: async () =>
        new Response('<html>race</html>', { headers: { 'Content-Type': 'text/html' } }),
    },
  });
  assert.equal(await response.text(), '<html>race</html>');
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});
