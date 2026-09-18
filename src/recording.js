import { cleanDecisionLog } from './telemetry.js';
import { cleanSettings } from './race-config.js';
export const GENERATOR_VERSION = 2;
// Copy only replay data: the live Race object also holds the session credential.
export function recordRace(race, id, name, created) {
  const drivers = race.ranking().map((c) => ({
    id: c.id,
    name: c.name,
    number: c.number,
    color: c.color,
    resolvedModel: c.resolvedModel || null,
    lapTimes: [...c.lapTimes],
    finishTime: c.finishTime,
    progress: c.progress,
    offTrack: c.offTrack,
    collisions: c.collisions,
    retired: !!c.retired,
    retirement: c.retirement,
  }));
  return {
    id,
    name,
    created,
    settings: cleanSettings(race.settings),
    generator: GENERATOR_VERSION,
    seed: race.seed,
    mode: race.mode,
    laps: race.limit,
    duration: race.time,
    startDelay: race.startDuration,
    finished: race.finished,
    decisions: race.decisions,
    decisionLog: cleanDecisionLog(race.decisionLog),
    incidents: !!race.incidents,
    events: race.events.filter((e) => !e.text.includes('Ready.')).map((e) => ({ ...e })),
    drivers,
    frames: race.frames.map((f) => ({ t: f.t, cars: f.cars.map((c) => [...c]) })),
  };
}
export function applyReplay(race, recording, time) {
  const frames = recording.frames;
  if (!frames.length) return;
  const t = Math.max(0, Math.min(time, recording.duration));
  // Find surrounding frames without scanning the entire recording on every render.
  // Frame timestamps are rounded to milliseconds; duration can retain a fraction
  // just below the last timestamp. At the endpoint, use the final flags exactly.
  let lo = t >= recording.duration ? frames.length - 1 : 0,
    hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = frames[lo],
    b = frames[Math.min(lo + 1, frames.length - 1)],
    f = b.t > a.t ? Math.min(1, (t - a.t) / (b.t - a.t)) : 0;
  race.time = t;
  race.cars.forEach((car, i) => {
    const p = a.cars[i],
      q = b.cars[i];
    const mix = (j) => p[j] + (q[j] - p[j]) * f;
    Object.assign(car, {
      x: mix(0),
      z: mix(1),
      heading: p[2] + Math.atan2(Math.sin(q[2] - p[2]), Math.cos(q[2] - p[2])) * f,
      speed: mix(3),
      steer: mix(4),
      wheelSteer: mix(4),
      progress: mix(5),
      lap: p[6],
      finished: !!p[7],
      retired: !!p[15],
      retirement: recording.drivers.find((d) => d.id === car.id)?.retirement,
      distance: mix(8),
      energy: p.length > 9 ? mix(9) : 1,
      tires: p.length > 9 ? mix(10) : 1,
      damage: p.length > 9 ? mix(11) : 0,
      engineTemp: p.length > 16 ? mix(16) : null,
      suspensionDamage: p.length > 16 ? mix(17) : null,
      wingDamage: p.length > 16 ? mix(18) : null,
      spinTime: p.length > 16 ? p[19] : 0,
      coolingLeak: p.length > 16 ? !!p[20] : false,
      intent:
        p.length > 9
          ? {
              power: ['neutral', 'deploy', 'harvest'][p[12]],
              line: ['center', 'left', 'right'][p[13]],
              pace: ['balanced', 'attack', 'cautious', 'recover'][p[14]],
            }
          : null,
      finishTime: recording.drivers.find((d) => d.id === car.id)?.finishTime,
      lapTimes: recording.drivers.find((d) => d.id === car.id)?.lapTimes.slice(0, p[6]) || [],
    });
  });
}
