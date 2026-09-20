import { availableEdits, mutatePrompt, comparePairs } from '../src/prompt-search.js';
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
if (!state?.confirmed) throw new Error('Complete the broad search and paired confirmation first.');
if (state.status === 'stopped')
  throw new Error('The owner ended this search. No requests were sent.');
async function save() {
  state.updated = new Date().toISOString();
  const text = JSON.stringify(state, null, 2);
  if (text.includes(credential)) throw new Error('Credential rejected from history.');
  await writeFile(resolve(output, 'season.json.tmp'), text);
  await rename(resolve(output, 'season.json.tmp'), resolve(output, 'season.json'));
}
function countCall() {
  state.calls++;
  if (state.calls - state.sourceCalls > 200000)
    throw new Error('Search checkpoint: 200,000 new requests reached; review before continuing.');
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
globalThis.fetch = async (path, init) => {
  if (path === '/api/decide') return api(new Request('http://localhost/api/decide', init));
  if (String(path) === 'https://api.typesafe.ai/v1/systemone') countCall();
  const response = await send(path, init);
  if (!response.ok && String(path) === 'https://api.typesafe.ai/v1/systemone') {
    state.upstreamFailure = { status: response.status, at: new Date().toISOString() };
    console.error(JSON.stringify({ upstreamStatus: response.status }));
  }
  return response;
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
async function pickEdit(driver, incumbent, tried, history) {
  const criteria = availableEdits(incumbent, tried);
  if (!Object.keys(criteria).length) return null;
  const answer = await upstream({
    model: state.model,
    state: JSON.stringify({ driver: driver.name, incumbent, history }),
    questions: {
      edit: {
        type: 'choice',
        criteria,
        instructions: {
          question:
            'Choose one untested local policy edit to this driver prompt, using measured results. Minimize two-lap finish time and avoid unfinished races. This is an experiment, not a promise of improvement.',
        },
      },
    },
  });
  const choice = answer.answers?.edit?.choice;
  if (!Object.hasOwn(criteria, choice)) throw new Error('Invalid edit chosen by Jev.');
  return {
    choice,
    confidence: answer.answers.edit.confidence ?? null,
    probabilities: answer.answers.edit.probabilities || {},
  };
}
function meanScore(key, driver) {
  const rows = TRAINING_SEEDS.map((seed) => state.rounds.find((r) => r.id === `${key}-${seed}`));
  if (rows.some((r) => !r)) throw new Error('Incomplete local screening.');
  return (
    rows.reduce((sum, r) => sum + r.results.find((d) => d.id === driver).score, 0) / rows.length
  );
}
try {
  const models = await api(new Request('http://localhost/api/models', { headers }));
  if (!models.ok) throw new Error(`TypeSafe key check failed (${models.status}).`);
  if (!(await models.json()).models.some((m) => m.name === state.model))
    throw new Error('Requested model unavailable.');
  delete state.error;
  state.refinements ||= [];
  state.localSelected ||= structuredClone(state.confirmed);
  state.stableSweeps ||= 0;
  state.method =
    'Continued local prompt search after broad strategy screening. Jev chooses untested edits to pace, battery, lane choice and wording. Each sweep measures every available one-edit neighbor on the same two circuits. The strongest candidate grid faces the incumbent in eight paired races; promotion requires a 0.5% mean gain, at least seven wins and no additional unfinished races. Two full sweeps with no promotions trigger a final comparison on two fresh circuits. Six sweeps or 200,000 new requests trigger a review checkpoint, not an optimality claim. Model weights and physics stay fixed; traffic and response latency still vary.';
  state.status = 'refining';
  await save();
  while (state.stableSweeps < 2) {
    let cycle = state.refinements.at(-1);
    if (!cycle || cycle.complete) {
      if (state.refinements.length >= 6) {
        state.status = 'checkpoint';
        break;
      }
      cycle = {
        index: state.refinements.length,
        incumbent: structuredClone(state.localSelected),
        candidates: [],
        created: new Date().toISOString(),
      };
      state.refinements.push(cycle);
      await save();
    }
    const prefix = `local-${cycle.index}`;
    const baseKey = `${prefix}-base`;
    state.grids[baseKey] = cycle.incumbent;
    for (const seed of TRAINING_SEEDS)
      await run(`${baseKey}-${seed}`, 'refinement-screen', seed, baseKey, cycle.incumbent);
    for (let candidate = 0; candidate < 7; candidate++) {
      const key = `${prefix}-c${candidate}`;
      if (!state.grids[key]) {
        cycle.draft ||= { key, drivers: {} };
        for (const driver of defaultSettings().drivers) {
          if (cycle.draft.drivers[driver.id]) continue;
          const history = state.rounds
            .filter((r) => r.phase !== 'championship')
            .slice(-30)
            .map((r) => ({
              seed: r.seed,
              generation: r.generation,
              ...r.results.find((d) => d.id === driver.id),
            }));
          const tried = cycle.candidates.map((k) => state.grids[k][driver.id].edit).filter(Boolean);
          const selection = await pickEdit(driver, cycle.incumbent[driver.id], tried, history);
          cycle.draft.drivers[driver.id] = selection
            ? {
                ...mutatePrompt(
                  cycle.incumbent[driver.id],
                  selection.choice,
                  `${driver.id}-${key}`,
                ),
                selection,
                strategy: `local ${selection.choice}`,
              }
            : { ...cycle.incumbent[driver.id], edit: null };
          await save();
        }
        const grid = cycle.draft.drivers;
        if (Object.entries(grid).every(([id, d]) => d.prompt === cycle.incumbent[id].prompt)) {
          delete cycle.draft;
          await save();
          break;
        }
        state.grids[key] = grid;
        cycle.candidates.push(key);
        delete cycle.draft;
        await save();
      }
      for (const seed of TRAINING_SEEDS)
        await run(`${key}-${seed}`, 'refinement-screen', seed, key, state.grids[key]);
    }
    if (!cycle.proposed) {
      cycle.proposed = Object.fromEntries(
        defaultSettings().drivers.map((driver) => {
          const choices = [baseKey, ...cycle.candidates]
            .map((key) => ({ key, score: meanScore(key, driver.id) }))
            .sort((a, b) => a.score - b.score);
          return [
            driver.id,
            { ...state.grids[choices[0].key][driver.id], screeningScore: choices[0].score },
          ];
        }),
      );
      await save();
    }
    const candidateKey = `${prefix}-proposed`;
    state.grids[candidateKey] = cycle.proposed;
    const hasChange = Object.entries(cycle.proposed).some(
      ([id, d]) => d.prompt !== cycle.incumbent[id].prompt,
    );
    cycle.accepted ||= [];
    if (hasChange) {
      for (let pair = 0; pair < 8; pair++) {
        const seed = TRAINING_SEEDS[pair % 2];
        const order = [0, 3, 4, 7].includes(pair)
          ? [baseKey, candidateKey]
          : [candidateKey, baseKey];
        for (const key of order)
          await run(
            `${prefix}-pair-${pair}-${key}-${seed}`,
            'refinement-confirmation',
            seed,
            key,
            state.grids[key],
          );
      }
      cycle.comparisons = {};
      for (const driver of defaultSettings().drivers) {
        const samples = (key) =>
          Array.from({ length: 8 }, (_, pair) =>
            state.rounds
              .find((r) => r.id === `${prefix}-pair-${pair}-${key}-${TRAINING_SEEDS[pair % 2]}`)
              .results.find((d) => d.id === driver.id),
          );
        const result = comparePairs(
          samples(baseKey),
          samples(candidateKey),
          cycle.incumbent[driver.id].prompt === cycle.proposed[driver.id].prompt,
          8,
        );
        cycle.comparisons[driver.id] = result;
        if (result.accepted) {
          state.localSelected[driver.id] = { ...cycle.proposed[driver.id], confirmation: result };
          cycle.accepted.push(driver.id);
        }
      }
    }
    cycle.complete = true;
    state.stableSweeps = cycle.accepted.length ? 0 : state.stableSweeps + 1;
    await save();
    console.log(
      JSON.stringify({
        sweep: cycle.index,
        accepted: cycle.accepted,
        stableSweeps: state.stableSweeps,
      }),
    );
  }
  if (state.stableSweeps >= 2) {
    state.status = 'heldout';
    state.grids['final-incumbent'] = state.sourceSelected;
    state.grids['final-selected'] = state.localSelected;
    await save();
    for (let pair = 0; pair < 4; pair++) {
      const seed = [18493, 99251][pair % 2];
      const order = [0, 3].includes(pair)
        ? ['final-incumbent', 'final-selected']
        : ['final-selected', 'final-incumbent'];
      for (const key of order)
        await run(`heldout-${pair}-${key}-${seed}`, 'heldout', seed, key, state.grids[key]);
    }
    state.status = 'neighborhood-tested';
  }
  delete state.current;
  await save();
  console.log(
    JSON.stringify({
      status: state.status,
      sweeps: state.refinements.length,
      stableSweeps: state.stableSweeps,
      newCalls: state.calls - state.sourceCalls,
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
