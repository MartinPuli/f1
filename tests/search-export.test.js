import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Tampered copies stay in a temporary directory; published race history is immutable.
async function rejectTampering(change, expected) {
  const directory = await mkdtemp(join(tmpdir(), 'jevrace-export-test-'));
  try {
    const state = JSON.parse(await readFile('public/prompt-search/season.json', 'utf8'));
    change(state);
    await writeFile(join(directory, 'season.json'), JSON.stringify(state));
    const target = join(directory, 'published');
    const result = spawnSync(process.execPath, ['scripts/export-search.mjs', directory, target], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
    await assert.rejects(access(join(target, 'season.json')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('export rejects a falsely completed refinement with untested edits', async () => {
  await rejectTampering((state) => {
    state.refinements[0].complete = true;
    state.refinements[0].accepted = [];
  }, /Incomplete prompt neighborhood/);
});

test('export rejects an altered promotion before publishing the archive', async () => {
  await rejectTampering((state) => {
    state.confirmed.oscar.confirmation.after -= 1;
  }, /Confirmation mismatch: oscar/);
});
