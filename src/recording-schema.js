import { cleanDecisionLog, validDecisionLog } from './telemetry.js';
import { validSettings, cleanSettings, validModel, DRIVER_IDS } from './race-config.js';
export function validRecord(r) {
  return (
    r &&
    (r.events === undefined ||
      (Array.isArray(r.events) &&
        r.events.length <= 120 &&
        r.events.every(
          (e) =>
            Number.isFinite(e.time) &&
            e.time >= 0 &&
            e.time <= 501 &&
            typeof e.id === 'string' &&
            e.id.length <= 20 &&
            typeof e.text === 'string' &&
            e.text.length <= 200,
        ))) &&
    (r.settings === undefined || validSettings(r.settings)) &&
    /^[a-f0-9-]{36}$/.test(r.id) &&
    typeof r.name === 'string' &&
    r.name.trim().length > 0 &&
    r.name.length <= 60 &&
    r.generator === 2 &&
    Number.isInteger(r.seed) &&
    r.seed >= 0 &&
    r.seed <= 4294967295 &&
    ['demo', 'jev'].includes(r.mode) &&
    Number.isInteger(r.laps) &&
    r.laps >= 1 &&
    r.laps <= 5 &&
    Number.isFinite(r.duration) &&
    r.duration >= 0 &&
    (r.startDelay === undefined ||
      (Number.isFinite(r.startDelay) && r.startDelay >= 0 && r.startDelay <= 10)) &&
    r.duration <= 501 &&
    Number.isFinite(r.created) &&
    Number.isInteger(r.decisions) &&
    (r.decisionLog === undefined || validDecisionLog(r.decisionLog)) &&
    typeof r.finished === 'boolean' &&
    Array.isArray(r.drivers) &&
    [5, 10].includes(r.drivers.length) &&
    new Set(r.drivers.map((d) => d?.id)).size === r.drivers.length &&
    r.drivers.every((d) => DRIVER_IDS.slice(0, r.drivers.length).includes(d?.id)) &&
    (!r.settings || r.settings.drivers.length === r.drivers.length) &&
    r.drivers.every(
      (d) =>
        (d.retirement == null || d.retirement === 'Mechanical failure') &&
        (d.retired === undefined || typeof d.retired === 'boolean') &&
        (d.resolvedModel == null || validModel(d.resolvedModel)) &&
        typeof d.name === 'string' &&
        d.name.length <= 40 &&
        (d.number === undefined || (typeof d.number === 'string' && /^\d{1,2}$/.test(d.number))) &&
        typeof d.id === 'string' &&
        /^#[a-f0-9]{6}$/i.test(d.color) &&
        Array.isArray(d.lapTimes) &&
        d.lapTimes.length <= 5 &&
        d.lapTimes.every(Number.isFinite) &&
        [d.progress, d.offTrack, d.collisions].every(Number.isFinite) &&
        (d.finishTime === null || Number.isFinite(d.finishTime)),
    ) &&
    Array.isArray(r.frames) &&
    r.frames.length > 0 &&
    r.frames.length <= 5100 &&
    r.frames.every(
      (f, i) =>
        Number.isFinite(f.t) &&
        f.t >= 0 &&
        f.t <= 501 &&
        (!i || f.t >= r.frames[i - 1].t) &&
        Array.isArray(f.cars) &&
        f.cars.length === r.drivers.length &&
        f.cars.every(
          (c) =>
            Array.isArray(c) &&
            [9, 15, 16].includes(c.length) &&
            c.length === r.frames[0].cars[0].length &&
            c.every(Number.isFinite),
        ),
    )
  );
}
// Explicit allowlist: credentials or unexpected client properties never reach storage.
export function cleanRecord(r) {
  return {
    id: r.id,
    name: r.name.trim(),
    ...(r.settings ? { settings: cleanSettings(r.settings) } : {}),
    created: r.created,
    generator: r.generator,
    seed: r.seed,
    mode: r.mode,
    laps: r.laps,
    duration: r.duration,
    ...(r.startDelay !== undefined ? { startDelay: r.startDelay } : {}),
    finished: r.finished,
    decisions: r.decisions,
    incidents: r.incidents === true,
    ...(r.events
      ? { events: r.events.map((e) => ({ id: e.id, time: e.time, text: e.text })) }
      : {}),
    ...(r.decisionLog ? { decisionLog: cleanDecisionLog(r.decisionLog) } : {}),
    drivers: r.drivers.map((d) => ({
      id: d.id,
      name: d.name,
      ...(d.number !== undefined ? { number: d.number } : {}),
      color: d.color,
      ...(d.resolvedModel ? { resolvedModel: d.resolvedModel } : {}),
      lapTimes: d.lapTimes,
      finishTime: d.finishTime,
      progress: d.progress,
      offTrack: d.offTrack,
      collisions: d.collisions,
      retired: d.retired === true,
      ...(d.retirement ? { retirement: d.retirement } : {}),
    })),
    frames: r.frames.map((f) => ({ t: f.t, cars: f.cars })),
  };
}
