import { DRIVER_IDS } from './race-config.js';
import { validIntent } from './driving.js';

// Save decisions, never raw requests: those may contain prompts and credentials.
export function cleanDecisionLog(log = []) {
  return log.map((batch) => ({
    t: batch.t,
    ...(Number.isFinite(batch.sent) ? { sent: batch.sent } : {}),
    ...(Number.isFinite(batch.ms) ? { ms: batch.ms } : {}),
    answers: batch.answers.map((answer) => ({
      id: answer.id,
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
    last = null;
  for (const batch of log) {
    if (batch.t > time) break;
    count += batch.answers.length;
    batches++;
    last = batch;
    const bin = 23 - Math.floor((time - batch.t) / 0.5);
    if (bin >= 0 && bin < bins.length) bins[bin] += batch.answers.length;
    selected = batch.answers.find((answer) => answer.id === driverId) || selected;
  }
  return { bins, count, batches, selected, last };
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
