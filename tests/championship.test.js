import test from 'node:test';
import assert from 'node:assert/strict';
import {
  choosePrompts,
  standings,
  summarize,
  STRATEGIES,
  TRAINING_SEEDS,
} from '../src/championship.js';
import { defaultSettings, validSettings } from '../src/race-config.js';

test('selection requires both circuits and keeps a faster baseline', () => {
  const generations = [0, 1].map((id) => ({ id, drivers: { max: { version: `v${id}` } } }));
  const rounds = TRAINING_SEEDS.flatMap((seed) =>
    [0, 1].map((generation) => ({
      phase: 'training',
      generation,
      seed,
      results: [{ id: 'max', score: generation ? 42 : 40 }],
    })),
  );
  assert.equal(choosePrompts(generations, rounds).max.version, 'v0');
  assert.throws(() =>
    choosePrompts(
      generations,
      rounds.filter((r) => r.seed === TRAINING_SEEDS[0]),
    ),
  );
});

test('DNFs receive no championship points and training never changes points', () => {
  const drivers = [{ id: 'a' }, { id: 'b' }];
  const results = [
    { id: 'a', position: 1, finished: true },
    { id: 'b', position: 2, finished: false },
  ];
  const table = standings(
    [
      { phase: 'training', results },
      { phase: 'championship', results },
    ],
    drivers,
  );
  assert.equal(table[0].points, 25);
  assert.equal(table[1].points, 0);
});

test('unfinished and missing laps never become a zero-second improvement', () => {
  const [row] = summarize({
    duration: 200,
    drivers: [{ id: 'a', lapTimes: [], finishTime: null, retired: false }],
    decisionLog: [],
  });
  assert.equal(row.bestLap, null);
  assert.equal(row.flyingLap, null);
  assert.equal(row.score, 1200);
});

test('all candidate prompts fit the production request limits', () => {
  for (const strategy of Object.values(STRATEGIES)) {
    const settings = defaultSettings();
    settings.drivers.forEach((d) => {
      d.prompt += `\n\nCurrent priority: ${strategy}`;
    });
    assert.ok(validSettings(settings));
  }
});
