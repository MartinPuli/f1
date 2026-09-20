import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validRecord } from '../src/recording-schema.js';
import { choosePrompts, standings, summarize } from '../src/championship.js';
import { defaultSettings } from '../src/race-config.js';

const source = resolve(process.argv[2] || '.races/championship');
const target = resolve(process.argv[3] || 'public/championship');
const season = JSON.parse(await readFile(resolve(source, 'season.json'), 'utf8'));
if (season.status !== 'complete' || season.rounds.length !== 11)
  throw new Error(
    'Export requires six training races, two validation races and three championship races.',
  );
const selected = choosePrompts(season.generations, season.rounds);
if (JSON.stringify(selected) !== JSON.stringify(season.selected))
  throw new Error('Prompt selection does not match measured results.');
const table = standings(season.rounds, defaultSettings().drivers);
if (JSON.stringify(table) !== JSON.stringify(season.standings))
  throw new Error('Standings do not match race results.');
await mkdir(target, { recursive: true });
const resolvedModels = new Set();
const csv = [
  [
    'race',
    'phase',
    'seed',
    'driver',
    'prompt',
    'position',
    'lap1_seconds',
    'lap2_seconds',
    'finish_seconds',
    'contacts',
    'finished',
  ],
];
for (const round of season.rounds) {
  if (!/^[a-z0-9-]+\.json$/.test(round.file)) throw new Error('Invalid recording filename.');
  const text = await readFile(resolve(source, round.file), 'utf8');
  const record = JSON.parse(text);
  if (
    !validRecord(record) ||
    record.mode !== 'jev' ||
    record.incidents ||
    !record.finished ||
    record.seed !== round.seed ||
    record.laps !== 2
  )
    throw new Error(`Race validation failed: ${round.id}`);
  if (!isDeepStrictEqual(summarize(record), round.results))
    throw new Error(`Summary does not match the recording: ${round.id}`);
  const grid =
    round.generation === 'selected'
      ? season.selected
      : season.generations.find((g) => g.id === round.generation)?.drivers;
  if (
    !grid ||
    record.settings.drivers.some(
      (d) => d.prompt !== grid[d.id]?.prompt || round.promptVersions[d.id] !== grid[d.id]?.version,
    )
  )
    throw new Error(`Prompt versions do not match the recording: ${round.id}`);
  round.sha256 = createHash('sha256').update(text).digest('hex');
  if (record.decisionLog.some((b) => b.failed))
    throw new Error(`Race contains failed requests: ${round.id}`);
  record.decisionLog.forEach((b) => b.answers.forEach((a) => resolvedModels.add(a.model)));
  if (resolvedModels.size !== 1 || ![...resolvedModels][0])
    throw new Error(`Resolved model changed or is missing: ${round.id}`);
  if (/apikey_[a-z0-9_]+/i.test(text)) throw new Error('Credential pattern found in recording.');
  await copyFile(resolve(source, round.file), resolve(target, round.file));
  for (const driver of round.results)
    csv.push([
      round.id,
      round.phase,
      round.seed,
      driver.id,
      round.promptVersions[driver.id],
      driver.position,
      ...[driver.lapTimes[0], driver.lapTimes[1], driver.finishTime].map((n) =>
        Number.isFinite(n) ? n.toFixed(3) : '',
      ),
      driver.collisions,
      driver.finished,
    ]);
}
season.resolvedModel = [...resolvedModels][0];
const serialized = JSON.stringify(season, null, 2);
if (/apikey_[a-z0-9_]+/i.test(serialized)) throw new Error('Credential pattern found in history.');
await writeFile(resolve(target, 'season.json'), serialized);
await writeFile(resolve(target, 'results.csv'), csv.map((row) => row.join(',')).join('\n') + '\n');
console.log(
  JSON.stringify({
    exported: season.rounds.length,
    drivers: 10,
    calls: season.calls,
    champion: table[0].name,
    path: target,
  }),
);
