import { DRIVER_IDS, validModel } from './race-config.js';
import { validIntent, LINES, PACES, POWERS } from './driving.js';

const OPTIONS = { line: LINES, pace: PACES, power: POWERS };
const unit = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
// Only preserve the documented Choice fields; never save upstream envelopes.
export function cleanResponse(answers) {
  return Object.fromEntries(
    Object.entries(OPTIONS).flatMap(([key, options]) => {
      const answer = answers?.[key];
      if (!answer || !Object.hasOwn(options, answer.choice)) return [];
      const probabilities = Object.fromEntries(
        Object.keys(options)
          .filter((k) => unit(answer.probabilities?.[k]))
          .map((k) => [k, answer.probabilities[k]]),
      );
      return [
        [
          key,
          {
            choice: answer.choice,
            ...(unit(answer.confidence) ? { confidence: answer.confidence } : {}),
            ...(Object.keys(probabilities).length ? { probabilities } : {}),
          },
        ],
      ];
    }),
  );
}
function validResponse(value, answer) {
  return (
    value &&
    Object.keys(value).every((key) => {
      const v = value[key],
        options = Object.hasOwn(OPTIONS, key) ? OPTIONS[key] : null;
      return (
        options &&
        v?.choice === answer[key] &&
        (v.confidence === undefined || unit(v.confidence)) &&
        (v.probabilities === undefined ||
          (v.probabilities &&
            typeof v.probabilities === 'object' &&
            Object.entries(v.probabilities).every(
              ([k, n]) => Object.hasOwn(options, k) && unit(n),
            )))
      );
    })
  );
}
export function decisionObservation(state) {
  return {
    speed: state.speed_mps,
    battery: state.battery,
    grip: state.tire_grip,
    damage: state.damage,
    ahead: Math.min(
      42,
      ...state.nearby_cars
        .filter((c) => c.forward > 0 && Math.abs(c.right) < 3)
        .map((c) => c.forward),
    ),
    temperature: state.engine_temp_c ?? 90,
  };
}
const OBS_KEYS = ['speed', 'battery', 'grip', 'damage', 'ahead', 'temperature'];
// Save decisions, never raw requests: those may contain prompts and credentials.
export function cleanDecisionLog(log = []) {
  return log.map((batch) => ({
    t: batch.t,
    ...(Number.isFinite(batch.sent) ? { sent: batch.sent } : {}),
    ...(Number.isFinite(batch.ms) ? { ms: batch.ms } : {}),
    answers: batch.answers.map((answer) => ({
      id: answer.id,
      ...(validModel(answer.model) ? { model: answer.model } : {}),
      ...(answer.response ? { response: cleanResponse(answer.response) } : {}),
      ...(answer.observation
        ? {
            observation: Object.fromEntries(
              OBS_KEYS.filter((k) => Number.isFinite(answer.observation[k])).map((k) => [
                k,
                answer.observation[k],
              ]),
            ),
          }
        : {}),
      line: answer.line,
      pace: answer.pace,
      power: answer.power || 'neutral',
      ...(Number.isFinite(answer.confidence) ? { confidence: answer.confidence } : {}),
    })),
  }));
}
export function validDecisionLog(log) {
  return (
    Array.isArray(log) &&
    log.length <= 2000 &&
    log.every(
      (batch, i) =>
        Number.isFinite(batch?.t) &&
        batch.t >= -10 &&
        batch.t <= 501 &&
        (!i || batch.t >= log[i - 1].t) &&
        (batch.sent === undefined ||
          (Number.isFinite(batch.sent) && batch.sent >= -10 && batch.sent <= batch.t)) &&
        (batch.ms === undefined ||
          (Number.isFinite(batch.ms) && batch.ms >= 0 && batch.ms <= 30000)) &&
        Array.isArray(batch.answers) &&
        batch.answers.length > 0 &&
        batch.answers.length <= 10 &&
        new Set(batch.answers.map((a) => a?.id)).size === batch.answers.length &&
        batch.answers.every(
          (answer) =>
            DRIVER_IDS.includes(answer?.id) &&
            validIntent(answer) &&
            (answer.model === undefined || validModel(answer.model)) &&
            (answer.response === undefined || validResponse(answer.response, answer)) &&
            (answer.observation === undefined ||
              (answer.observation &&
                Object.entries(answer.observation).every(
                  ([k, v]) => OBS_KEYS.includes(k) && Number.isFinite(v) && Math.abs(v) <= 500,
                ))) &&
            (answer.confidence === undefined ||
              (Number.isFinite(answer.confidence) &&
                answer.confidence >= 0 &&
                answer.confidence <= 1)),
        ),
    )
  );
}
export function decisionActivity(log, time, driverId) {
  const bins = Array(24).fill(0);
  let count = 0,
    batches = 0,
    selected = null,
    last = null,
    selectedBatch = null;
  const history = [];
  for (const batch of log) {
    if (batch.t > time + 0.0005) break;
    count += batch.answers.length;
    batches++;
    last = batch;
    const bin = 23 - Math.floor((time - batch.t) / 0.5);
    if (bin >= 0 && bin < bins.length) bins[bin] += batch.answers.length;
    const answer = batch.answers.find((answer) => answer.id === driverId);
    if (answer) {
      selected = answer;
      selectedBatch = batch;
      history.push({ t: batch.t, answer });
    }
  }
  return {
    bins,
    count,
    batches,
    selected,
    last,
    selectedBatch,
    history: history.slice(-3).reverse(),
  };
}

// Find when the leader passed this distance; do not invent a time gap from speed.
export function timingGap(race, car, leader, frames = race.frames) {
  if (car === leader) return car.finished ? car.finishTime : null;
  if (car.finished && leader.finished) return car.finishTime - leader.finishTime;
  const index = race.cars.indexOf(leader);
  let before = null;
  for (const frame of frames) {
    if (frame.t > race.time) break;
    const progress = frame.cars[index]?.[5];
    if (progress === undefined) continue;
    if (progress >= car.progress) {
      if (!before) return null;
      const span = progress - before.progress;
      const crossed =
        before.t + (span > 0 ? (car.progress - before.progress) / span : 0) * (frame.t - before.t);
      return Math.max(0, race.time - crossed);
    }
    before = { t: frame.t, progress };
  }
  return null;
}
