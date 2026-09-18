import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, integrate, observe } from '../src/simulation.js';
import { startSpin, updateMechanical } from '../src/mechanics.js';
import { resolveContact } from '../src/physics.js';
import { driveControls } from '../src/driving.js';
import { clearChaseCamera } from '../src/camera.js';
import { recordRace, applyReplay } from '../src/recording.js';
import { validRecord } from '../src/recording-schema.js';

test('a spin retains momentum, dissipates energy and can recover without teleporting', () => {
  const race = new Race(8912),
    car = race.cars[0];
  car.speed = 24;
  const heading = car.heading;
  assert.equal(startSpin(car, 3.2), true);
  assert.equal(startSpin(car, 3.2), false);
  for (let i = 0; i < 72; i++) {
    const x = car.x,
      z = car.z,
      speed = car.speed;
    integrate(car, 0.025, race.track);
    assert.ok(Math.hypot(car.x - x, car.z - z) <= speed * 0.025 + 0.01);
  }
  assert.ok(Math.abs(car.heading - heading) > 2);
  assert.ok(car.speed < 8);
  for (let t = 0; t < 30; t += 0.025) {
    Object.assign(
      car,
      driveControls(
        observe(car, [car], race.track, t),
        { line: 'center', pace: 'recover' },
        car.laneOffset,
      ),
    );
    integrate(car, 0.025, race.track);
  }
  assert.equal(car.off, false);
  assert.ok(car.speed > 1);
});

test('cooling leaks precede measured overheating; healthy cars do not fail under full load', () => {
  const race = new Race();
  const hot = race.cars[0],
    healthy = race.cars[1];
  hot.coolingLeak = true;
  hot.pedalThrottle = healthy.pedalThrottle = 1;
  hot.intent = healthy.intent = { power: 'deploy' };
  const events = [];
  for (let i = 0; i < 1200; i++) {
    updateMechanical(hot, 0.025, (m) => events.push(m));
    updateMechanical(healthy, 0.025);
  }
  assert.equal(hot.retirement, 'Engine overheating');
  assert.ok(hot.engineTemp > 132);
  assert.ok(events[0].startsWith('Engine temperature high'));
  assert.equal(healthy.retired, false);
  assert.ok(healthy.engineTemp < 115);
});

test('hard lateral impact damages suspension; parked overlap cannot cause a retirement', () => {
  const race = new Race();
  const [a, b] = race.cars;
  Object.assign(a, { x: 0, z: 0, heading: 0, speed: 15, sideSpeed: 42 });
  Object.assign(b, { x: 2.7, z: 1.5, heading: 0, speed: 15, sideSpeed: 0 });
  resolveContact(a, b);
  updateMechanical(a, 0.025);
  assert.equal(a.retirement, 'Suspension failure');
  const [c, d] = new Race().cars;
  Object.assign(c, { x: 0, z: 0 });
  Object.assign(d, { x: 0, z: 0 });
  resolveContact(c, d);
  updateMechanical(c, 0.025);
  assert.equal(c.retired, false);
});

test('chase camera clears traffic without mutating or excluding finished and retired cars', () => {
  const cars = [
    { x: 0, z: 0 },
    { x: 0, z: -8, finished: true },
    { x: 0, z: -4, retired: true },
  ];
  const before = structuredClone(cars);
  const camera = clearChaseCamera({ x: 0, y: 4, z: -12 }, { x: 0, y: 1, z: 5 }, cars, 0);
  assert.ok(camera.y > 4);
  assert.deepEqual(cars, before);
  assert.deepEqual(clearChaseCamera({ x: 20, y: 5, z: -12 }, { x: 20, y: 1, z: 5 }, cars, 0), {
    x: 20,
    y: 5,
    z: -12,
  });
});

test('mechanical state and spin survive a saved replay', () => {
  const race = new Race();
  const car = race.cars[0];
  Object.assign(car, {
    engineTemp: 123,
    coolingLeak: true,
    suspensionDamage: 0.3,
    wingDamage: 0.2,
    spinTime: 1,
  });
  race.time = 2;
  race.captureFrame();
  const record = recordRace(race, '11111111-1111-4111-8111-111111111111', 'Physics', Date.now());
  assert.ok(validRecord(record));
  const replay = new Race();
  applyReplay(replay, record, 2);
  for (const key of ['engineTemp', 'coolingLeak', 'suspensionDamage', 'wingDamage', 'spinTime'])
    assert.equal(replay.cars[0][key], car[key]);
});

test('finishers keep rolling beyond the line without changing their result', () => {
  const r = new Race(8912);
  r.limit = 1;
  r.running = true;
  while (!r.cars.some((c) => c.finished)) r.tick(0.025);
  const c = r.cars.find((c) => c.finished),
    before = { distance: c.distance, progress: c.progress, time: c.finishTime };
  for (let i = 0; i < 15; i++) r.tick(0.025);
  assert.ok(c.distance > before.distance);
  assert.equal(c.progress, before.progress);
  assert.equal(c.finishTime, before.time);
});
