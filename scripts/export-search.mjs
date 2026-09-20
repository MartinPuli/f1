import { readFile, writeFile, mkdir, copyFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validRecord } from '../src/recording-schema.js';
import { summarize } from '../src/championship.js';
import { comparePairs } from '../src/prompt-search.js';

const source = resolve(process.argv[2] || '.races/prompt-search');
const target = resolve(process.argv[3] || 'public/prompt-search');
const state = JSON.parse(await readFile(resolve(source, 'season.json'), 'utf8'));
if (state.confirmed) {
  for (const [id, driver] of Object.entries(state.confirmed)) {
    const samples = (label) =>
      Array.from({ length: 4 }, (_, pair) =>
        state.rounds
          .find((r) => r.id.startsWith(`confirm-${pair}-${label}-`))
          .results.find((d) => d.id === id),
      );
    const comparison = comparePairs(
      samples('incumbent'),
      samples('challenger'),
      state.grids.incumbent[id].prompt === state.grids.challenger[id].prompt,
    );
    if (
      comparison.accepted !== driver.confirmation.accepted ||
      comparison.before !== driver.confirmation.before ||
      comparison.after !== driver.confirmation.after
    )
      throw new Error(`Confirmation mismatch: ${id}`);
    driver.confirmation.samePrompt = comparison.samePrompt;
    if (state.localSelected?.[id]?.version === driver.version)
      state.localSelected[id].confirmation.samePrompt = comparison.samePrompt;
  }
}
await mkdir(target, { recursive: true });
for (const round of state.rounds) {
  if (!/^[a-z0-9-]+\.json$/.test(round.file)) throw new Error('Invalid recording path.');
  const text = await readFile(resolve(source, round.file), 'utf8');
  const record = JSON.parse(text);
  if (
    !validRecord(record) ||
    !record.finished ||
    record.incidents ||
    record.mode !== 'jev' ||
    !isDeepStrictEqual(summarize(record), round.results)
  )
    throw new Error(`Invalid search recording: ${round.id}`);
  if (
    record.decisionLog.some(
      (b) => b.failed || b.answers.some((a) => a.model !== state.resolvedModel),
    )
  )
    throw new Error(`Failed decision or model drift: ${round.id}`);
  const grid =
    state.grids?.[round.generation] ||
    (round.generation === 'selected'
      ? state.sourceSelected
      : state.generations.find((g) => g.id === round.generation)?.drivers);
  if (
    !grid ||
    record.settings.drivers.some(
      (d) => grid[d.id].prompt !== d.prompt || grid[d.id].version !== round.promptVersions[d.id],
    )
  )
    throw new Error(`Prompt mismatch: ${round.id}`);
  if (/apikey_[a-z0-9_]+/i.test(text)) throw new Error('Credential pattern found.');
  round.sha256 = createHash('sha256').update(text).digest('hex');
  await copyFile(resolve(source, round.file), resolve(target, round.file));
}
const text = JSON.stringify(state, null, 2);
if (/apikey_[a-z0-9_]+/i.test(text)) throw new Error('Credential pattern found.');
await writeFile(resolve(target, 'season.json.tmp'), text);
await rename(resolve(target, 'season.json.tmp'), resolve(target, 'season.json'));
console.log(
  JSON.stringify({
    status: state.status,
    recordedRaces: state.rounds.length,
    versions: state.generations.length,
  }),
);
