import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aggregateResults } from '../src/leaderboard.js';
test('leaderboard counts recorded finishes and wins, not new scores', () => {
  const races = JSON.parse(readFileSync('public/race-archive.json')).races;
  const rows = aggregateResults(races);
  assert.equal(rows.length, 10);
  for (const d of rows) {
    const results = races.flatMap((r) => r.results.filter((x) => x.id === d.id));
    assert.equal(d.races, results.length);
    assert.equal(d.wins, results.filter((r) => r.finished && r.position === 1).length);
    assert.equal(d.finishes, results.filter((r) => r.finished).length);
    assert.equal(
      d.bestLap,
      Math.min(...results.map((r) => r.bestLap).filter((n) => Number.isFinite(n) && n > 0)),
    );
  }
  assert.equal(
    rows.reduce((sum, d) => sum + d.wins, 0),
    races.length,
  );
  assert.equal(aggregateResults(races.filter((r) => r.phase === 'championship'))[0].races, 3);
});
