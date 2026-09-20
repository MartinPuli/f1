import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => JSON.parse(readFileSync(p));
test('landing evidence matches completed Jev recordings and confirmed prompt comparisons', () => {
  const story = read('public/project-story.json'),
    search = read('public/prompt-search/season.json'),
    race = read('public/championship/round-3-20260920.json');
  assert.equal(story.count, search.rounds.length);
  assert.equal(story.drivers.length, 10);
  const batch = race.decisionLog.find(
    (b) => b.t === story.sample.t && b.answers.some((a) => a.id === story.sample.id),
  );
  assert.ok(batch);
  assert.deepEqual(story.sample, {
    t: batch.t,
    ms: batch.ms,
    ...batch.answers.find((a) => a.id === story.sample.id),
  });
  for (const driver of story.drivers) {
    assert.deepEqual(driver.comparison, search.confirmed[driver.id].confirmation);
    assert.equal(driver.prompt, search.confirmed[driver.id].prompt);
    assert.equal(driver.before, search.sourceSelected[driver.id].prompt);
    for (const version of driver.versions)
      for (const run of version.races) {
        const result = search.rounds.find((r) => r.id === run.id);
        assert.equal(result.phase, 'training');
        assert.equal(result.seed, run.seed);
        assert.equal(result.results.find((d) => d.id === driver.id).finishTime, run.time);
      }
  }
});
