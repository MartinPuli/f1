import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Race } from '../src/simulation.js';
import { recordRace } from '../src/recording.js';
import { validRecord } from '../src/recording-schema.js';
import { defaultSettings, validSettings } from '../src/race-config.js';
import { api } from '../server/api.js';
import {
  STRATEGIES,
  TRAINING_SEEDS,
  VALIDATION_SEED,
  CHAMPIONSHIP_SEEDS,
  summarize,
  choosePrompts,
  standings,
} from '../src/championship.js';

const output = resolve(process.argv[2] || '.races/prompt-search');
const send = globalThis.fetch;
const input = createInterface({ input: process.stdin, terminal: false });
console.log('Paste the TypeSafe key into hidden stdin. It will not be saved.');
let credential =
  process.env.TYPESAFE_API_KEY || (await new Promise((resolve) => input.once('line', resolve)));
input.close();
credential = credential.trim();
if (!credential) throw new Error('A TypeSafe key is required.');
const headers = { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(output, { recursive: true });
let state;
try {
  state = JSON.parse(await readFile(resolve(output, 'season.json'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (!state) {
  const seed = JSON.parse(await readFile(resolve('public/championship/season.json'), 'utf8'));
  state = structuredClone(seed);
  state.name = 'JEVRACE · Continued prompt search';
  state.status = 'searching';
  state.sourceSeason = 'Season 01';
  state.sourceCalls = seed.calls;
  state.sourceSelected = structuredClone(seed.selected);
  state.checks = [];
  state.method =
    'Continues the existing history, tests all five strategy priorities for each driver, then compares the strongest new grid against the Season 01 selected grid in four paired races. Both grids run the same seed and fixed starting positions within each pair; AB/BA order alternates. A prompt is promoted only with at least 0.5% faster mean finish time, wins in at least three of four pairs and no additional unfinished races. This is a noisy multi-car comparison, not proof of globally optimal prompts.';
  for (const round of seed.rounds)
    await copyFile(resolve('public/championship', round.file), resolve(output, round.file));
}
async function save() {
  state.updated = new Date().toISOString();
  const text = JSON.stringify(state, null, 2);
  if (text.includes(credential)) throw new Error('Credential rejected from history.');
  await writeFile(resolve(output, 'season.json.tmp'), text);
  await rename(resolve(output, 'season.json.tmp'), resolve(output, 'season.json'));
}
function countCall() {
  state.calls++;
  if (state.calls - state.sourceCalls > 100000)
    throw new Error('Search checkpoint: 100,000 new requests reached; review before continuing.');
}
async function upstream(body) {
  countCall();
  const response = await send('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`TypeSafe strategy request failed (${response.status}).`);
  return response.json();
}
// Reuse the production request validation and parser; only the transport is local.
globalThis.fetch = (path, init) => {
  if (path === '/api/decide') return api(new Request('http://localhost/api/decide', init));
  if (String(path) === 'https://api.typesafe.ai/v1/systemone') countCall();
  return send(path, init);
};
function settingsFor(drivers) {
  const settings = defaultSettings();
  settings.drivers = settings.drivers.map((d) => ({
    ...d,
    model: state.model,
    prompt: drivers[d.id].prompt,
  }));
  if (!validSettings(settings)) throw new Error('Invalid training prompts.');
  return settings;
}
async function run(id, phase, seed, generation, drivers) {
  if (state.rounds.some((r) => r.id === id)) return;
  const race = new Race(seed);
  race.configure(settingsFor(drivers));
  race.limit = 2;
  race.mode = 'jev';
  race.apiKey = credential;
  race.incidents = false;
  race.running = true;
  state.current = { id, phase, seed, generation };
  await save();
  console.log(JSON.stringify({ started: id, seed, phase }));
  const started = Date.now(),
    callsBefore = state.calls;
  let lastLog = 0;
  while (!race.finished && !race.error) {
    race.tick(0.025, 1);
    await sleep(25);
    if (Date.now() - started > 360000) {
      race.error = 'Race exceeded six minutes wall time.';
      race.running = false;
    }
    if (race.time - lastLog >= 15) {
      lastLog = race.time;
      state.current.seconds = race.time;
      await save();
      console.log(
        JSON.stringify({ race: id, seconds: +race.time.toFixed(1), decisions: race.decisions }),
      );
    }
  }
  while (race.waiting) await sleep(25);
  race.captureFrame();
  const record = recordRace(race, crypto.randomUUID(), id, Date.now());
  const models = new Set(record.decisionLog.flatMap((b) => b.answers.map((a) => a.model)));
  if (models.size) {
    state.resolvedModel ||= [...models][0];
    if (models.size !== 1 || !models.has(state.resolvedModel))
      race.error = 'The resolved Jev model changed during the season.';
  }
  const text = JSON.stringify(record);
  if (text.includes(credential)) throw new Error('Credential rejected from recording.');
  if (!validRecord(record)) throw new Error('Invalid race recording.');
  if (race.error) {
    const file = `${id}-failed-${Date.now()}.json`;
    await writeFile(resolve(output, file), text);
    state.failures.push({ id, file, error: race.error, at: new Date().toISOString() });
    state.status = 'paused';
    await save();
    throw new Error(race.error);
  }
  const file = `${id}.json`;
  await writeFile(resolve(output, file), text);
  state.rounds.push({
    id,
    phase,
    seed,
    generation,
    file,
    promptVersions: Object.fromEntries(Object.entries(drivers).map(([id, d]) => [id, d.version])),
    created: new Date().toISOString(),
    duration: record.duration,
    calls: state.calls - callsBefore,
    results: summarize(record),
    latencyMs: record.decisionLog.reduce((s, b) => s + (b.ms || 0), 0) / record.decisionLog.length,
  });
  state.standings = standings(state.rounds, defaultSettings().drivers);
  delete state.current;
  await save();
  console.log(
    JSON.stringify({
      completed: id,
      winner: record.drivers[0].name,
      calls: state.calls - callsBefore,
    }),
  );
  race.apiKey = '';
}
try {
  const models = await api(new Request('http://localhost/api/models', { headers }));
  if (!models.ok) throw new Error(`TypeSafe key check failed (${models.status}).`);
  const available = (await models.json()).models.map((m) => m.name);
  state.model ||= available.includes('jev-1.13.0')
    ? 'jev-1.13.0'
    : available.find((m) => /^jev-\d/.test(m)) || available[0];
  if (!state.model || !available.includes(state.model))
    throw new Error('Pinned model unavailable.');
  if (!state.generations.length)
    state.generations.push({
      id: 0,
      created: new Date().toISOString(),
      drivers: Object.fromEntries(
        defaultSettings().drivers.map((d) => [
          d.id,
          {
            version: `${d.id}-v0`,
            prompt: d.prompt,
            strategy: 'baseline',
            reason: 'Original driver prompt.',
          },
        ]),
      ),
    });
  delete state.error;
  await save();
  for (let generation = 0; generation < 6; generation++) {
    if (!state.generations.some((g) => g.id === generation)) {
      const selected = choosePrompts(state.generations, state.rounds);
      const drivers = {};
      for (const driver of defaultSettings().drivers) {
        const tried = state.generations.map((g) => g.drivers[driver.id].strategy);
        const criteria = Object.fromEntries(
          Object.entries(STRATEGIES).filter(([id]) => !tried.includes(id)),
        );
        const history = state.rounds
          .filter((r) => r.phase === 'training')
          .map((r) => ({
            seed: r.seed,
            generation: r.generation,
            ...r.results.find((d) => d.id === driver.id),
          }));
        const answer = await upstream({
          model: state.model,
          state: JSON.stringify({ driver: driver.name, incumbent: selected[driver.id], history }),
          questions: {
            strategy: {
              type: 'choice',
              instructions: {
                question:
                  'Choose the next driving prompt to test for this driver. Minimize total finish time while finishing both laps. Diagnose collisions, off-track time, unused battery and pace from these measured results. Select one untested strategy. Do not assume the candidate will improve; it will be measured.',
              },
              criteria,
            },
          },
        });
        const choice = answer.answers?.strategy?.choice;
        if (!Object.hasOwn(criteria, choice))
          throw new Error('Invalid strategy selection from Jev.');
        drivers[driver.id] = {
          version: `${driver.id}-v${generation}`,
          prompt: `${driver.prompt}\n\nCurrent priority: ${STRATEGIES[choice]}`,
          strategy: choice,
          comparedAgainst: selected[driver.id].version,
          reason: 'Jev selected this untested strategy from recorded training results.',
          selection: {
            choice,
            confidence: answer.answers.strategy.confidence ?? null,
            probabilities: answer.answers.strategy.probabilities || {},
          },
        };
      }
      state.generations.push({ id: generation, created: new Date().toISOString(), drivers });
      await save();
    }
    const grid = state.generations.find((g) => g.id === generation).drivers;
    for (const seed of TRAINING_SEEDS)
      await run(`training-v${generation}-${seed}`, 'training', seed, generation, grid);
  }
  state.proposed = choosePrompts(state.generations, state.rounds);
  state.grids ||= { incumbent: state.sourceSelected, challenger: state.proposed };
  state.status = 'confirmation';
  await save();
  for (let pair = 0; pair < 4; pair++) {
    const seed = TRAINING_SEEDS[pair % TRAINING_SEEDS.length];
    const order = [0, 3].includes(pair) ? ['incumbent', 'challenger'] : ['challenger', 'incumbent'];
    for (const label of order)
      await run(
        `confirm-${pair}-${label}-${seed}`,
        'confirmation',
        seed,
        label,
        state.grids[label],
      );
  }
  state.confirmed = {};
  for (const driver of defaultSettings().drivers) {
    const incumbent = [],
      challenger = [];
    for (let pair = 0; pair < 4; pair++) {
      for (const [label, scores] of [
        ['incumbent', incumbent],
        ['challenger', challenger],
      ]) {
        const round = state.rounds.find((r) => r.id.startsWith(`confirm-${pair}-${label}-`));
        scores.push(round.results.find((d) => d.id === driver.id));
      }
    }
    const before = incumbent.reduce((s, d) => s + d.score, 0) / 4;
    const after = challenger.reduce((s, d) => s + d.score, 0) / 4;
    const wins = challenger.filter((d, i) => d.score < incumbent[i].score).length;
    const accepted =
      state.grids.challenger[driver.id].prompt !== state.grids.incumbent[driver.id].prompt &&
      after < before * 0.995 &&
      wins >= 3 &&
      challenger.filter((d) => !d.finished).length <= incumbent.filter((d) => !d.finished).length;
    state.confirmed[driver.id] = {
      ...state.grids[accepted ? 'challenger' : 'incumbent'][driver.id],
      confirmation: { before, after, wins, pairs: 4, accepted },
    };
  }
  state.status = 'screened';
  delete state.current;
  await save();
  console.log(
    JSON.stringify({
      screened: true,
      newCalls: state.calls - state.sourceCalls,
      promoted: Object.entries(state.confirmed)
        .filter(([, d]) => d.confirmation.accepted)
        .map(([id]) => id),
      output,
    }),
  );
} catch (error) {
  state.status = 'paused';
  state.error = String(error.message).replaceAll(credential, '[redacted]');
  await save();
  console.error(state.error);
  process.exitCode = 1;
} finally {
  credential = '';
  globalThis.fetch = send;
}
