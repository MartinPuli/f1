import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validRecord } from '../src/recording-schema.js';
import { summarize, choosePrompts, standings } from '../src/championship.js';
import { defaultSettings } from '../src/race-config.js';

const root = new URL('../public/championship/', import.meta.url);
const season = JSON.parse(readFileSync(new URL('season.json', root)));

test('published season contains eleven complete, real-Jev races and no injected incidents', () => {
  assert.equal(season.status, 'complete');
  assert.equal(new Set(season.rounds.map((r) => r.id)).size, 11);
  assert.deepEqual(
    ['training', 'validation', 'championship'].map(
      (phase) => season.rounds.filter((r) => r.phase === phase).length,
    ),
    [6, 2, 3],
  );
  let calls = 0;
  for (const round of season.rounds) {
    const source = readFileSync(new URL(round.file, root), 'utf8');
    const record = JSON.parse(source);
    assert.ok(validRecord(record), round.id);
    assert.equal(record.incidents, false);
    assert.equal(record.mode, 'jev');
    assert.equal(record.finished, true);
    assert.equal(createHash('sha256').update(source).digest('hex'), round.sha256);
    assert.deepEqual(summarize(record), round.results);
    assert.equal(record.drivers.length, 10);
    assert.ok(record.decisionLog.length > 10);
    assert.ok(
      record.decisionLog.every(
        (b) => !b.failed && b.answers.every((a) => a.model === season.resolvedModel && a.response),
      ),
    );
    assert.ok(!/apikey_[a-z0-9_]+/i.test(source));
    const versions =
      round.generation === 'selected'
        ? season.selected
        : season.generations.find((g) => g.id === round.generation).drivers;
    for (const driver of record.settings.drivers)
      assert.equal(driver.prompt, versions[driver.id].prompt);
    calls += round.calls;
  }
  assert.equal(
    season.calls,
    calls + 20,
    'twenty real strategy-selection calls accompany the driving calls',
  );
});

test('published selections and championship points agree with all results', () => {
  assert.deepEqual(choosePrompts(season.generations, season.rounds), season.selected);
  assert.deepEqual(standings(season.rounds, defaultSettings().drivers), season.standings);
  assert.equal(season.generations.length, 3);
  for (const generation of season.generations)
    assert.equal(Object.keys(generation.drivers).length, 10);
  const trainingSeeds = new Set(
    season.rounds.filter((r) => r.phase === 'training').map((r) => r.seed),
  );
  for (const r of season.rounds.filter((r) => r.phase !== 'training'))
    assert.ok(!trainingSeeds.has(r.seed));
});
