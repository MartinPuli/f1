import { defaultSettings } from './race-config.js';
import { CatmullRomCurve3, Vector3 } from 'three';

export const DRIVERS = [
  {
    id: 'max',
    name: 'Max JEVstappen',
    short: 'JEVstappen',
    number: '01',
    color: '#ff775b',
    style: 'Aggressive',
    risk: 1.08,
  },
  {
    id: 'lewis',
    name: 'Lewis JEVmilton',
    short: 'JEVmilton',
    number: '44',
    color: '#b199eb',
    style: 'Adaptive',
    risk: 1.0,
  },
  {
    id: 'charles',
    name: 'Charles LeJEVclerc',
    short: 'LeJEVclerc',
    number: '16',
    color: '#efb83e',
    style: 'Precise',
    risk: 0.94,
  },
  {
    id: 'lando',
    name: 'Lando JEVrris',
    short: 'JEVrris',
    number: '04',
    color: '#58baa0',
    style: 'Opportunistic',
    risk: 1.04,
  },
  {
    id: 'franco',
    name: 'Franco ColJEVpinto',
    short: 'ColJEVpinto',
    number: '43',
    color: '#64b4e9',
    style: 'Patient',
    risk: 0.88,
  },
];
export const ACTIONS = {
  push_left: { throttle: 1, brake: 0, steer: -0.3 },
  push_straight: { throttle: 1, brake: 0, steer: 0 },
  push_right: { throttle: 1, brake: 0, steer: 0.3 },
  coast_left: { throttle: 0, brake: 0, steer: -0.38 },
  coast_straight: { throttle: 0, brake: 0, steer: 0 },
  coast_right: { throttle: 0, brake: 0, steer: 0.38 },
  brake_left: { throttle: 0, brake: 0.8, steer: -0.5 },
  brake_straight: { throttle: 0, brake: 0.8, steer: 0 },
  brake_right: { throttle: 0, brake: 0.8, steer: 0.5 },
  sharp_left: { throttle: 0.12, brake: 0.25, steer: -0.8 },
  sharp_right: { throttle: 0.12, brake: 0.25, steer: 0.8 },
};
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
export function createCars(track) {
  return DRIVERS.map((d, i) => {
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
      throttle: 0,
      brake: 0,
      progress: s - 4,
      lastS: wrap(s / track.length) * track.length,
      startS: s,
      lap: 0,
      lapStart: 0,
      lapTimes: [],
      finished: false,
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
export function observe(car, cars, track, time) {
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
      .filter((c) => c !== car && Math.hypot(c.x - car.x, c.z - car.z) < 42)
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
    off_track: road.distance > track.width / 2,
    style: car.style,
    elapsed_seconds: +time.toFixed(1),
    memory: car.memory.slice(-8),
  };
}
export function demoDecision(observation, car) {
  const target = observation.visible_road[car.speed > 24 ? 2 : 1];
  const steer = clamp(
    Math.atan2(2 * 3.1 * target.right, target.right ** 2 + target.forward ** 2) / 0.42,
    -1,
    1,
  );
  const curve = Math.max(
    ...observation.visible_road.slice(1).map((p) => Math.abs(Math.atan2(p.right, p.forward))),
  );
  let desired = clamp(35 - curve * 30, 9, 35) * car.risk;
  if (observation.off_track) desired = 7;
  const obstacle = observation.nearby_cars.find(
    (c) => c.forward > 0 && c.forward < 8 && Math.abs(c.right) < 2.2,
  );
  if (obstacle) desired = Math.min(desired, Math.max(6, obstacle.speed_mps - 2));
  const throttle = car.speed < desired ? 1 : 0,
    brake = car.speed > desired + 2 ? 0.65 : 0;
  return {
    throttle,
    brake,
    steer,
    confidence: null,
    label: observation.off_track
      ? 'Recovering'
      : brake
        ? 'Braking'
        : Math.abs(steer) > 0.25
          ? 'Cornering'
          : throttle
            ? 'Accelerating'
            : 'Holding',
  };
}
export function integrate(car, dt, track) {
  if (car.finished) return;
  const road = track.nearest(car.x, car.z),
    off = road.distance > track.width / 2;
  if (off && !car.off) car.offTrack++;
  car.off = off;
  car.contactCooldown = Math.max(0, car.contactCooldown - dt);
  const drag = 0.007 * car.speed * car.speed + (off ? car.speed * 1.1 : car.speed * 0.035);
  car.speed = clamp(car.speed + (car.throttle * 10 - car.brake * 21 - drag) * dt, 0, 52);
  // Bicycle steering with a lateral grip limit; leaving the tarmac costs traction.
  const yaw = (car.speed / 3.1) * Math.tan(car.steer * 0.42),
    limit = (off ? 6 : 18) / Math.max(car.speed, 3);
  car.heading += clamp(yaw, -limit, limit) * dt;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
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
    this.settings = defaultSettings();
    this.limit = 3;
    this.generation = 0;
    this.reset(seed);
  }
  reset(seed = this.seed) {
    this.generation++;
    this.seed = seed;
    this.track = makeTrack(seed);
    this.cars = createCars(this.track);
    this.time = 0;
    this.running = false;
    this.waiting = false;
    this.finished = false;
    this.error = '';
    this.nextDecision = 0;
    this.networkNotBefore = 0;
    this.retryNotBefore = 0;
    this.decisions = 0;
    this.events = [];
    this.accumulator = 0;
    this.lastLog = 0;
    this.frames = [];
    this.lastFrame = -1;
    this.captureFrame();
    this.addEvent('system', 'Ready. Drivers have not seen the circuit.');
  }
  addEvent(id, text) {
    this.events.unshift({ id, text, time: this.time });
    this.events = this.events.slice(0, 40);
  }
  async decide() {
    const active = this.cars.filter((c) => !c.finished),
      states = active.map((c) => observe(c, this.cars, this.track, this.time));
    if (this.mode === 'demo') {
      active.forEach((c, i) => this.apply(c, demoDecision(states[i], c), states[i]));
      return;
    }
    const generation = this.generation;
    this.waiting = true;
    this.networkNotBefore = Date.now() + 2000;
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
        if (!ACTIONS[d.choice]) throw new Error('Jev returned an invalid action.');
      });
      body.decisions.forEach((d, i) => {
        active[i].resolvedModel =
          d.model || this.settings.drivers.find((p) => p.id === active[i].id).model;
        this.apply(
          active[i],
          { ...ACTIONS[d.choice], confidence: d.confidence, label: d.choice.replaceAll('_', ' ') },
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
    Object.assign(car, {
      throttle: d.throttle,
      brake: d.brake,
      steer: d.steer,
      action: d.label,
      confidence: d.confidence,
    });
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
    if (!this.running || this.waiting || this.finished) return;
    if (this.mode === 'jev' && Date.now() < this.retryNotBefore) {
      this.running = false;
      return;
    }
    this.accumulator += Math.min(realDelta, 0.1) * speed;
    while (this.accumulator >= 0.025) {
      if (this.time >= this.nextDecision) {
        if (this.mode === 'jev' && Date.now() < this.networkNotBefore) {
          this.accumulator = 0;
          return;
        }
        this.nextDecision = this.time + (this.mode === 'jev' ? 0.5 : 0.25);
        this.decide();
        if (this.waiting) {
          this.accumulator = 0;
          break;
        }
      }
      this.accumulator -= 0.025;
      this.time += 0.025;
      for (const car of this.cars) {
        integrate(car, 0.025, this.track);
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
            b = this.cars[j],
            dx = b.x - a.x,
            dz = b.z - a.z,
            d = Math.hypot(dx, dz);
          if (d < 2.0 && !a.finished && !b.finished) {
            const nx = d > 0.001 ? dx / d : 1,
              nz = d > 0.001 ? dz / d : 0,
              push = (2.0 - d) / 2;
            a.x -= nx * push;
            a.z -= nz * push;
            b.x += nx * push;
            b.z += nz * push;
            if (a.contactCooldown === 0 && b.contactCooldown === 0) {
              a.collisions++;
              b.collisions++;
              a.speed *= 0.7;
              b.speed *= 0.7;
              a.contactCooldown = b.contactCooldown = 1.5;
              this.addEvent(a.id, `Contact between ${a.name} and ${b.name}.`);
            }
          }
        }
      if (this.time - this.lastLog > 1) {
        this.lastLog = this.time;
        for (const car of this.cars) {
          car.history.push(car.speed * 3.6);
          if (car.history.length > 80) car.history.shift();
        }
      }
      if (this.time - this.lastFrame >= 0.1) this.captureFrame();
      if (this.cars.every((c) => c.finished)) {
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
          c.steer,
          c.progress,
          c.lap,
          c.finished ? 1 : 0,
          c.distance,
        ].map((v) => +v.toFixed(4)),
      ),
    });
  }
  ranking() {
    return [...this.cars].sort((a, b) =>
      a.finished && b.finished
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
