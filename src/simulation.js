import { raceIncidents } from './incidents.js';
import { resolveContact, updateResources } from './physics.js';
import { driveControls, validIntent, roadReading } from './driving.js';
import { defaultSettings, cleanSettings, DRIVERS } from './race-config.js';
import { CatmullRomCurve3, Vector3 } from 'three';

export { DRIVERS } from './race-config.js';
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (x) => ((x % 1) + 1) % 1;
const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function makeTrack(seed = 42) {
  let n = seed >>> 0;
  const rand = () => (n = (1664525 * n + 1013904223) >>> 0) / 4294967296;
  // Smooth radial harmonics produce closed, non-crossing circuits across a 32-bit seed space.
  // Bounded amplitudes keep the inner turns wide enough for the 12 m roadway.
  const rx = 58 + rand() * 24,
    rz = 39 + rand() * 20,
    phase = rand() * Math.PI * 2;
  const harmonics = Array.from({ length: 3 }, (_, i) => ({
    frequency: i + 2,
    amplitude: (0.1 + rand() * 0.09) / (i + 1),
    phase: rand() * Math.PI * 2,
  }));
  const rotation = rand() * Math.PI * 2;
  const pts = Array.from({ length: 96 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2 + phase;
    const radius =
      1 + harmonics.reduce((sum, h) => sum + h.amplitude * Math.sin(a * h.frequency + h.phase), 0);
    const x = Math.cos(a) * rx * radius,
      z = Math.sin(a) * rz * radius;
    return new Vector3(
      x * Math.cos(rotation) - z * Math.sin(rotation),
      0,
      x * Math.sin(rotation) + z * Math.cos(rotation),
    );
  });
  const curve = new CatmullRomCurve3(pts, true, 'centripetal');
  curve.arcLengthDivisions = 2000;
  const length = curve.getLength(),
    count = 900;
  const samples = Array.from({ length: count }, (_, i) => curve.getPointAt(i / count));
  return {
    seed,
    curve,
    length,
    samples,
    width: 12,
    count,
    at(s) {
      return curve.getPointAt(wrap(s / length));
    },
    tangent(s) {
      return curve.getTangentAt(wrap(s / length));
    },
    nearest(x, z) {
      let best = Infinity,
        idx = 0;
      for (let i = 0; i < count; i++) {
        const p = samples[i],
          d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < best) {
          best = d;
          idx = i;
        }
      }
      const s = (idx / count) * length,
        p = samples[idx],
        t = this.tangent(s);
      return {
        s,
        index: idx,
        distance: Math.sqrt(best),
        offset: (x - p.x) * t.z - (z - p.z) * t.x,
        tangent: t,
      };
    },
  };
}
export function createCars(track, count = DRIVERS.length) {
  return DRIVERS.slice(0, count).map((d, i) => {
    const s = 4 + Math.floor(i / 2) * -6,
      p = track.at(s),
      t = track.tangent(s),
      offset = (i % 2 === 0 ? -1 : 1) * 2.2;
    return {
      ...d,
      x: p.x + t.z * offset,
      z: p.z - t.x * offset,
      heading: Math.atan2(t.x, t.z),
      speed: 0,
      steer: 0,
      wheelSteer: 0,
      laneOffset: offset,
      sideSpeed: 0,
      impactYaw: 0,
      energy: 1,
      tires: 1,
      damage: 0,
      boost: 0,
      tow: 0,
      overtakes: 0,
      passLane: null,
      passUntil: 0,
      intent: null,
      pendingIntent: null,
      reactionTime: 0.16 + ((((track.seed >>> 0) ^ ((i + 1) * 2654435761)) >>> 0) % 141) / 1000,
      launchTime: null,
      throttle: 0,
      brake: 0,
      pedalThrottle: 0,
      pedalBrake: 0,
      progress: s - 4,
      lastS: wrap(s / track.length) * track.length,
      startS: s,
      lap: 0,
      lapStart: 0,
      lapTimes: [],
      finished: false,
      retired: false,
      retirement: null,
      gripLoss: 0,
      brakeFault: 0,
      finishTime: null,
      offTrack: 0,
      collisions: 0,
      off: false,
      contactCooldown: 0,
      seen: new Set(),
      memory: [],
      action: 'On the grid',
      confidence: null,
      history: [],
      distance: 0,
    };
  });
}
export function observe(car, cars, track, time, laps = 3) {
  const road = track.nearest(car.x, car.z),
    sin = Math.sin(car.heading),
    cos = Math.cos(car.heading);
  const ahead = [5, 10, 18, 28, 42].map((distance) => {
    const p = track.at(road.s + distance),
      dx = p.x - car.x,
      dz = p.z - car.z;
    return {
      distance,
      right: +(dx * cos - dz * sin).toFixed(2),
      forward: +(dx * sin + dz * cos).toFixed(2),
    };
  });
  return {
    speed_mps: +car.speed.toFixed(2),
    heading_error: +angle(Math.atan2(road.tangent.x, road.tangent.z) - car.heading).toFixed(3),
    road_width_m: track.width,
    lateral_offset_m: +road.offset.toFixed(2),
    visible_road: ahead,
    nearby_cars: cars
      .filter((c) => c !== car && !c.finished && Math.hypot(c.x - car.x, c.z - car.z) < 42)
      .map((c) => {
        const dx = c.x - car.x,
          dz = c.z - car.z;
        return {
          right: +(dx * cos - dz * sin).toFixed(1),
          forward: +(dx * sin + dz * cos).toFixed(1),
          speed_mps: +c.speed.toFixed(1),
        };
      }),
    lap: car.lap + 1,
    laps_remaining: Math.max(1, laps - car.lap),
    position: [...cars].sort((a, b) => b.progress - a.progress).indexOf(car) + 1,
    battery: +(car.energy ?? 1).toFixed(3),
    tire_grip: +(car.tires ?? 1).toFixed(3),
    damage: +(car.damage ?? 0).toFixed(3),
    off_track: road.distance > track.width / 2,
    style: car.style,
    elapsed_seconds: +time.toFixed(1),
    memory: car.memory.slice(-8),
  };
}
export function demoDecision(observation, car) {
  const road = roadReading(observation);
  const ahead = observation.nearby_cars
    .filter((c) => c.forward > 0 && c.forward < 24 && Math.abs(c.right) < 3)
    .sort((a, b) => a.forward - b.forward)[0];
  const challenger = observation.nearby_cars.some(
    (c) => c.forward < -1 && c.forward > -18 && c.speed_mps > car.speed,
  );
  const clear = ['left', 'right'].filter((lane) => road.lanes[lane].clear);
  const late = ['oscar', 'franco'].includes(car.id);
  const saver = ['carlos', 'alex'].includes(car.id);
  let line = observation.elapsed_seconds < car.passUntil ? car.passLane : 'center';
  if (ahead && clear.length && (car.speed >= ahead.speed_mps - 1 || ahead.forward < 12)) {
    line =
      clear[
        (car.number.charCodeAt(0) + Math.floor(observation.elapsed_seconds / 7)) % clear.length
      ];
    car.passLane = line;
    car.passUntil = observation.elapsed_seconds + 2.5;
  } else if (car.id === 'fernando' && challenger && clear.length && line === 'center') {
    line = clear[0];
    car.passLane = line;
    car.passUntil = observation.elapsed_seconds + 3;
  }
  const passing = line !== 'center' && ahead;
  const push =
    passing ||
    (late ? observation.laps_remaining === 1 : ['max', 'lando', 'george'].includes(car.id));
  const pace = observation.off_track
    ? 'recover'
    : road.bend === 'tight' && ['charles', 'franco'].includes(car.id)
      ? 'cautious'
      : push
        ? 'attack'
        : 'balanced';
  const power =
    car.energy > 0.15 && (passing || challenger || (late && observation.laps_remaining === 1))
      ? 'deploy'
      : ahead || saver || (late && observation.laps_remaining > 1)
        ? 'harvest'
        : 'neutral';
  return { intent: { line, pace, power }, confidence: null, label: `${pace} · ${line} · ${power}` };
}

export function integrate(car, dt, track) {
  if (car.finished) return;
  const road = track.nearest(car.x, car.z),
    off = road.distance > track.width / 2;
  if (off && !car.off) car.offTrack++;
  car.off = off;
  car.gripLoss = Math.max(0, (car.gripLoss || 0) - dt);
  car.brakeFault = Math.max(0, (car.brakeFault || 0) - dt);
  car.contactCooldown = Math.max(0, car.contactCooldown - dt);
  car.pedalThrottle =
    (car.pedalThrottle || 0) + clamp(car.throttle - (car.pedalThrottle || 0), -12 * dt, 6 * dt);
  car.pedalBrake =
    (car.pedalBrake || 0) + clamp(car.brake - (car.pedalBrake || 0), -12 * dt, 10 * dt);
  if (car.pedalBrake > 0.01) car.pedalThrottle = 0;
  updateResources(car, dt);
  const drag =
    0.007 * car.speed * car.speed * (1 - (car.tow || 0) * 0.32) +
    (off ? car.speed * 1.1 : car.speed * 0.035);
  const engine =
    (10 + car.boost) * (car.intent?.power === 'harvest' ? 0.8 : 1) * (1 - car.damage * 0.22);
  const traction = (off ? 4 : 9.5 + Math.min(car.speed * 0.3, 8)) * (0.8 + car.tires * 0.2);
  const lateralLoad = Math.min(
    0.8,
    (Math.abs(Math.tan((car.wheelSteer || 0) * 0.42)) * car.speed ** 2) / (3.1 * 25),
  );
  const gripForAcceleration = traction * Math.sqrt(1 - lateralLoad ** 2);
  const drive = Math.min(car.pedalThrottle * engine, gripForAcceleration);
  const braking = Math.min(car.pedalBrake * 21, (off ? 5 : 21) * Math.sqrt(1 - lateralLoad ** 2));
  car.speed = clamp(car.speed + (drive - braking - drag) * dt, 0, 52);
  // Bicycle steering with a lateral grip limit; leaving the tarmac costs traction.
  car.wheelSteer =
    (car.wheelSteer ?? 0) + clamp(car.steer - (car.wheelSteer ?? 0), -2.8 * dt, 2.8 * dt);
  const yaw = (car.speed / 3.1) * Math.tan(car.wheelSteer * 0.42),
    limit =
      (off
        ? 6
        : 18 * (car.gripLoss > 0 ? 0.55 : 1) * (0.8 + car.tires * 0.2) * (1 - car.damage * 0.2)) /
      Math.max(car.speed, 3);
  car.heading += (clamp(yaw, -limit, limit) + (car.impactYaw || 0)) * dt;
  car.impactYaw = (car.impactYaw || 0) * Math.exp(-4 * dt);
  car.sideSpeed = (car.sideSpeed || 0) * Math.exp(-(off ? 1.8 : 5) * dt);
  car.x += (Math.sin(car.heading) * car.speed + Math.cos(car.heading) * car.sideSpeed) * dt;
  car.z += (Math.cos(car.heading) * car.speed - Math.sin(car.heading) * car.sideSpeed) * dt;
  const now = track.nearest(car.x, car.z);
  let delta = now.s - car.lastS;
  if (delta > track.length / 2) delta -= track.length;
  if (delta < -track.length / 2) delta += track.length;
  // A car cannot gain a lap by jumping across the track.
  if (Math.abs(delta) < Math.max(5, car.speed * dt * 3)) car.progress += delta;
  car.lastS = now.s;
  car.distance += car.speed * dt;
  [0, 10, 20, 30, 42].forEach((d) =>
    car.seen.add(Math.floor(wrap((now.s + d) / track.length) * 90)),
  );
}
export class Race {
  constructor(seed = 42) {
    this.seed = seed;
    this.mode = 'demo';
    this.incidents = false;
    this.settings = defaultSettings();
    this.limit = 3;
    this.generation = 0;
    this.reset(seed);
  }
  reset(seed = this.seed) {
    this.generation++;
    this.seed = seed;
    this.track = makeTrack(seed);
    this.cars = createCars(this.track, this.settings.drivers.length);
    this.configure(this.settings);
    this.time = 0;
    this.startClock = 0;
    this.startDuration = 5.5 + ((seed >>> 0) % 1000) / 1000;
    this.phase = 'lights';
    this.running = false;
    this.waiting = false;
    this.finished = false;
    this.error = '';
    this.nextDecision = 0;
    this.retryNotBefore = 0;
    this.decisions = 0;
    this.decisionLog = [];
    this.events = [];
    this.incidentFlags = { contact: false, failure: false };
    this.accumulator = 0;
    this.lastLog = 0;
    this.frames = [];
    this.lastFrame = -1;
    this.captureFrame();
    this.addEvent('system', 'Ready. Drivers have not seen the circuit.');
  }
  configure(settings) {
    this.settings = cleanSettings(settings);
    if (this.cars.length !== this.settings.drivers.length)
      this.cars = createCars(this.track, this.settings.drivers.length);
    for (const car of this.cars) {
      const driver = this.settings.drivers.find((d) => d.id === car.id);
      car.name = driver.name;
      car.number = driver.number;
      car.short = driver.name.split(' ').at(-1);
    }
  }
  addEvent(id, text) {
    this.events.unshift({ id, text, time: this.time });
    this.events = this.events.slice(0, 120);
  }
  async decide() {
    const active = this.cars.filter((c) => !c.finished && !c.retired),
      states = active.map((c) => observe(c, this.cars, this.track, this.time, this.limit));
    if (this.mode === 'demo') {
      active.forEach((c, i) => this.apply(c, demoDecision(states[i], c), states[i]));
      return;
    }
    const generation = this.generation;
    const sent = this.phase === 'lights' ? this.startClock - this.startDuration : this.time,
      requestedAt = performance.now();
    this.waiting = true;
    try {
      const response = await fetch('/api/decide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          states,
          driverIds: active.map((c) => c.id),
          settings: this.settings,
        }),
        signal: AbortSignal.timeout(25000),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 429 || response.status === 503)
          this.retryNotBefore =
            Date.now() +
            Math.max(10, Math.min(86400, Number(response.headers.get('Retry-After')) || 60)) * 1000;
        throw new Error(body.error || 'Jev could not respond.');
      }
      if (generation !== this.generation) return;
      if (!Array.isArray(body.decisions) || body.decisions.length !== active.length)
        throw new Error('Incomplete Jev response.');
      body.decisions.forEach((d, i) => {
        if (!validIntent(d)) throw new Error('Jev returned an invalid driving target.');
      });
      this.decisionLog.push({
        t: +(this.phase === 'lights' ? this.startClock - this.startDuration : this.time).toFixed(3),
        sent: +sent.toFixed(3),
        ms: Math.round(performance.now() - requestedAt),
        answers: body.decisions.map((d, i) => ({
          id: active[i].id,
          line: d.line,
          pace: d.pace,
          power: d.power || 'neutral',
          ...(Number.isFinite(d.confidence) ? { confidence: d.confidence } : {}),
        })),
      });
      body.decisions.forEach((d, i) => {
        if (active[i].finished || active[i].retired) return;
        active[i].resolvedModel =
          d.model || this.settings.drivers.find((p) => p.id === active[i].id).model;
        this.apply(
          active[i],
          {
            intent: { line: d.line, pace: d.pace, power: d.power || 'neutral' },
            confidence: d.confidence,
            label: `${d.pace} · ${d.line} · ${d.power || 'neutral'}`,
          },
          states[i],
        );
      });
    } catch (e) {
      if (generation === this.generation) {
        this.error =
          e.name === 'TimeoutError'
            ? 'Jev timed out. The race is paused; you can retry.'
            : e.message;
        this.running = false;
        this.nextDecision = this.time;
        this.addEvent('system', this.error);
      }
    } finally {
      if (generation === this.generation) this.waiting = false;
    }
  }
  apply(car, d, state) {
    // Keep a received decision pending for this driver's reaction time. The
    // first decision is ready on the grid; the launch has its own reaction delay.
    if (d.intent) {
      if (!car.intent) car.intent = d.intent;
      else if (!car.pendingIntent)
        car.pendingIntent = {
          intent: d.intent,
          at: this.time + car.reactionTime,
          label: d.label,
          confidence: d.confidence,
        };
    } else Object.assign(car, { throttle: d.throttle, brake: d.brake, steer: d.steer });
    if (!car.pendingIntent) Object.assign(car, { action: d.label, confidence: d.confidence });
    car.memory.push({
      speed: state.speed_mps,
      heading_error: state.heading_error,
      off_track: state.off_track,
      action: d.label,
    });
    if (car.memory.length > 24) car.memory.shift();
    this.decisions++;
  }
  tick(realDelta, speed = 1) {
    if (!this.running || this.finished) return;
    if (this.mode === 'jev' && Date.now() < this.retryNotBefore) {
      this.running = false;
      return;
    }
    this.accumulator += Math.min(realDelta, 0.1) * speed;
    while (this.accumulator >= 0.025) {
      if (this.time >= this.nextDecision && !this.waiting) {
        this.nextDecision = this.time + (this.mode === 'jev' ? 0.5 : 0.25);
        this.decide();
      }
      // Only the first grid decision holds the cars. Later requests run alongside
      // physics, which follows each driver's last validated targets at 40 Hz.
      if (
        this.mode === 'jev' &&
        this.startClock >= this.startDuration &&
        this.cars.some((car) => !car.finished && !car.retired && !car.intent)
      ) {
        this.accumulator = 0;
        break;
      }
      this.accumulator -= 0.025;
      if (this.phase === 'lights') {
        this.startClock += 0.025;
        if (
          this.startClock < this.startDuration ||
          (this.mode === 'jev' && this.cars.some((car) => !car.retired && !car.intent))
        )
          continue;
        this.phase = 'racing';
        this.cars.forEach((car) => {
          car.launchTime = car.reactionTime;
        });
        this.addEvent('system', 'Lights out.');
        continue;
      }
      this.time += 0.025;
      raceIncidents(this);
      for (const car of this.cars) {
        if (this.time < (car.launchTime ?? 0)) continue;
        if (car.pendingIntent && this.time >= car.pendingIntent.at) {
          Object.assign(car, {
            intent: car.pendingIntent.intent,
            action: car.pendingIntent.label,
            confidence: car.pendingIntent.confidence,
          });
          car.pendingIntent = null;
        }
        if (car.intent && !car.finished && !car.retired) {
          const controls = driveControls(
            observe(car, this.cars, this.track, this.time, this.limit),
            car.intent,
            car.laneOffset,
          );
          Object.assign(car, controls);
        }
        if (car.retired) {
          // An engine failure still leaves steering: coast toward the nearest
          // runoff area before stopping, without moving the car by teleport.
          const road = this.track.nearest(car.x, car.z);
          const p = this.track.at(road.s + 10),
            t = this.track.tangent(road.s + 10);
          car.retireSide ??= road.offset < 0 ? -1 : 1;
          const dx = p.x + t.z * car.retireSide * 8.5 - car.x;
          const dz = p.z - t.x * car.retireSide * 8.5 - car.z;
          car.steer = clamp(angle(Math.atan2(dx, dz) - car.heading) * 2, -1, 1);
          car.throttle = 0;
          car.brake = road.distance > 7 ? 0.45 : 0.04;
        }
        if (car.brakeFault > 0) {
          car.throttle = 0;
          car.brake = 1;
        }
        integrate(car, 0.025, this.track);
        if (car.retired) continue;
        const lap = Math.min(this.limit, Math.max(0, Math.floor(car.progress / this.track.length)));
        if (lap > car.lap) {
          car.lapTimes.push(this.time - car.lapStart);
          car.lapStart = this.time;
          car.lap = lap;
          this.addEvent(
            car.id,
            `${car.name} completed lap ${lap} in ${formatTime(car.lapTimes.at(-1))}.`,
          );
        }
        if (car.lap >= this.limit && !car.finished) {
          car.finished = true;
          car.finishTime = this.time;
          car.speed = 0;
          car.action = 'Finished';
          this.addEvent(car.id, `${car.name} crossed the finish line.`);
        }
      }
      for (let i = 0; i < this.cars.length; i++)
        for (let j = i + 1; j < this.cars.length; j++) {
          const a = this.cars[i],
            b = this.cars[j];
          const hit = resolveContact(a, b);
          if (hit?.counted) this.addEvent(a.id, `Contact between ${a.name} and ${b.name}.`);
        }
      if (this.time - this.lastLog > 1) {
        this.lastLog = this.time;
        for (const car of this.cars) {
          car.history.push(car.speed * 3.6);
          if (car.history.length > 80) car.history.shift();
        }
      }
      if (this.time - this.lastFrame >= (this.cars.length > 5 ? 0.2 : 0.1)) this.captureFrame();
      if (this.cars.every((c) => c.finished || c.retired)) {
        this.finished = true;
        this.running = false;
        this.addEvent('system', 'Checkered flag. Race finished.');
        break;
      }
      if (this.time > this.limit * 100) {
        this.finished = true;
        this.running = false;
        this.addEvent('system', 'Time limit reached. Ranked by distance.');
        break;
      }
    }
  }
  captureFrame() {
    this.lastFrame = this.time;
    this.frames.push({
      t: +this.time.toFixed(3),
      cars: this.cars.map((c) =>
        [
          c.x,
          c.z,
          c.heading,
          c.speed,
          c.wheelSteer,
          c.progress,
          c.lap,
          c.finished ? 1 : 0,
          c.distance,
          c.energy,
          c.tires,
          c.damage,
          ['neutral', 'deploy', 'harvest'].indexOf(c.intent?.power || 'neutral'),
          ['center', 'left', 'right'].indexOf(c.intent?.line || 'center'),
          ['balanced', 'attack', 'cautious', 'recover'].indexOf(c.intent?.pace || 'balanced'),
          c.retired ? 1 : 0,
        ].map((v) => +v.toFixed(4)),
      ),
    });
  }
  ranking() {
    return [...this.cars].sort((a, b) =>
      a.retired !== b.retired
        ? a.retired
          ? 1
          : -1
        : a.finished && b.finished
          ? a.finishTime - b.finishTime
          : a.finished
            ? -1
            : b.finished
              ? 1
              : b.progress - a.progress,
    );
  }
}
export function formatTime(s) {
  if (s == null) return '—';
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
}
