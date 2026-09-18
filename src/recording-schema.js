import { validSettings, cleanSettings, validModel } from './race-config.js';
export function validRecord(r) {
  return (
    r &&
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
    r.duration <= 501 &&
    Number.isFinite(r.created) &&
    Number.isInteger(r.decisions) &&
    typeof r.finished === 'boolean' &&
    Array.isArray(r.drivers) &&
    r.drivers.length === 5 &&
    r.drivers.every(
      (d) =>
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
        f.cars.length === 5 &&
        f.cars.every((c) => Array.isArray(c) && c.length === 9 && c.every(Number.isFinite)),
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
    finished: r.finished,
    decisions: r.decisions,
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
    })),
    frames: r.frames.map((f) => ({ t: f.t, cars: f.cars })),
  };
}
