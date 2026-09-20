import { readFile, writeFile } from 'node:fs/promises';
const search = JSON.parse(await readFile('public/prompt-search/season.json', 'utf8'));
const race = JSON.parse(await readFile('public/championship/round-3-20260920.json', 'utf8'));
const batch = race.decisionLog.find((b) => b.t > 14 && b.answers.some((a) => a.id === 'franco'));
if (!batch || race.mode !== 'jev' || !race.finished)
  throw new Error('A completed Jev recording is required.');
const story = {
  count: search.rounds.length,
  model: search.resolvedModel,
  sample: { t: batch.t, ms: batch.ms, ...batch.answers.find((a) => a.id === 'franco') },
  drivers: Object.entries(search.confirmed).map(([id, driver]) => ({
    id,
    name: race.settings.drivers.find((d) => d.id === id).name,
    selected: driver.version,
    prompt: driver.prompt,
    before: search.sourceSelected[id].prompt,
    comparison: driver.confirmation,
    versions: search.generations.map((g) => ({
      version: g.id,
      prompt: g.drivers[id].prompt,
      strategy: g.drivers[id].strategy,
      races: search.rounds
        .filter(
          (r) =>
            (r.phase === 'training' && r.generation === g.id) ||
            (!search.trainingSeeds.includes(r.seed) &&
              r.promptVersions[id] === g.drivers[id].version),
        )
        .map((r) => ({
          id: r.id,
          seed: r.seed,
          time: r.results.find((d) => d.id === id).finishTime,
        })),
    })),
  })),
};
await writeFile('public/project-story.json', JSON.stringify(story));
