import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePairs, mutatePrompt, availableEdits } from '../src/prompt-search.js';
import { defaultSettings } from '../src/race-config.js';
import { STRATEGIES } from '../src/championship.js';

const scores = (values) => values.map((score) => ({ score, finished: true }));
test('one lucky result cannot replace the incumbent and identical prompts cannot claim a gain', () => {
  assert.equal(comparePairs(scores([40, 40, 40, 40]), scores([20, 41, 41, 41])).accepted, false);
  assert.equal(
    comparePairs(scores([40, 40, 40, 40]), scores([38, 38, 38, 38]), true).accepted,
    false,
  );
  assert.equal(comparePairs(scores([40, 40, 40, 40]), scores([39, 39, 39, 40])).accepted, true);
  assert.equal(
    comparePairs(scores([40, 40, 40, 40]), scores([39.9, 39.9, 39.9, 39.9])).accepted,
    false,
  );
  assert.throws(() => comparePairs(scores([40]), scores([30])));
});
test('a candidate cannot trade an extra unfinished race for fast completed races', () => {
  const candidate = scores([20, 20, 20, 20]);
  candidate[0].finished = false;
  assert.equal(comparePairs(scores([40, 40, 40, 40]), candidate).accepted, false);
});
test('refinement promotion requires seven wins in eight paired races', () => {
  const baseline = scores(Array(8).fill(40));
  assert.equal(
    comparePairs(baseline, scores([38, 38, 38, 38, 38, 38, 41, 41]), false, 8).accepted,
    false,
  );
  assert.equal(
    comparePairs(baseline, scores([38, 38, 38, 38, 38, 38, 38, 41]), false, 8).accepted,
    true,
  );
  assert.throws(() => comparePairs(baseline.slice(0, 4), baseline.slice(0, 4), false, 8));
});
test('local edits preserve the base and remain within the production prompt limit', () => {
  for (const d of defaultSettings().drivers)
    for (const strategy of Object.values(STRATEGIES)) {
      let prompt = { prompt: `${d.prompt}\n\nCurrent priority: ${strategy}`, version: 'v1' };
      const base = prompt.prompt;
      for (const edit of ['concise', 'attack', 'spend', 'hold']) {
        prompt = mutatePrompt(prompt, edit, 'v2');
        assert.equal(prompt.basePrompt, base);
        assert.ok(prompt.prompt.length <= 1000);
        assert.ok(!Object.hasOwn(availableEdits(prompt), edit));
      }
    }
});
