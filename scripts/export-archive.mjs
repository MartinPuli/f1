import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { makeTrack } from '../src/simulation.js';
import { validRecord } from '../src/recording-schema.js';
const state = JSON.parse(await readFile('public/prompt-search/season.json', 'utf8'));
const seen = new Set();
const races = [];
for (const round of state.rounds) {
  if (seen.has(round.id)) throw new Error(`Duplicate recording: ${round.id}`);
  seen.add(round.id);
  const raw = await readFile(`public/prompt-search/${round.file}`);
  const record = JSON.parse(raw);
  if (
    !validRecord(record) ||
    !record.finished ||
    record.mode !== 'jev' ||
    !record.decisionLog.length ||
    record.incidents
  )
    throw new Error(`Unverified race: ${round.id}`);
  if (createHash('sha256').update(raw).digest('hex') !== round.sha256)
    throw new Error(`Recording changed: ${round.id}`);
  const pts = makeTrack(record.seed).samples;
  const xs = pts.map((p) => p.x),
    zs = pts.map((p) => p.z);
  const minX = Math.min(...xs),
    minZ = Math.min(...zs);
  const scale = Math.min(260 / (Math.max(...xs) - minX), 140 / (Math.max(...zs) - minZ));
  const width = (Math.max(...xs) - minX) * scale,
    height = (Math.max(...zs) - minZ) * scale;
  const path =
    pts
      .filter((_, i) => i % 6 === 0)
      .map(
        (p, i) =>
          `${i ? 'L' : 'M'}${((p.x - minX) * scale + (320 - width) / 2).toFixed(1)},${((p.z - minZ) * scale + (200 - height) / 2).toFixed(1)}`,
      )
      .join(' ') + 'Z';
  races.push({
    id: round.id,
    phase: round.phase,
    seed: record.seed,
    created: record.created,
    duration: record.duration,
    laps: record.laps,
    calls: round.calls,
    drivers: record.drivers.length,
    path,
    results: round.results.map(({ name, position, finishTime, finished }) => ({
      name,
      position,
      finishTime,
      finished,
    })),
  });
}
await writeFile(
  'public/race-archive.json',
  JSON.stringify({
    races,
    grouping: 'Chronological recording collections; original session types retained.',
  }),
);
console.log(`${races.length} verified recordings`);
