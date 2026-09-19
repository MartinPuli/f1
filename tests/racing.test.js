import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, observe, integrate } from '../src/simulation.js';
import { contactGeometry, resolveContact, slipstream, updateResources } from '../src/physics.js';
import { driveControls } from '../src/driving.js';
import { defaultSettings, validSettings } from '../src/race-config.js';
import { recordRace, applyReplay } from '../src/recording.js';
import { validRecord } from '../src/recording-schema.js';
const body = (x, z, speed = 0, heading = 0) => ({
  x,
  z,
  speed,
  heading,
  sideSpeed: 0,
  impactYaw: 0,
  damage: 0,
  collisions: 0,
  contactCooldown: 0,
});
const kinetic = (c) => c.speed ** 2 + c.sideSpeed ** 2;

test('rear impact uses the full car length, transfers momentum and cannot add energy', () => {
  const rear = body(0, 0, 28),
    front = body(0, 5.1, 12);
  assert.ok(contactGeometry(rear, front));
  const energy = kinetic(rear) + kinetic(front);
  const result = resolveContact(rear, front);
  assert.equal(result.impact, 16);
  assert.ok(rear.speed < 28 && front.speed > 12);
  assert.ok(kinetic(rear) + kinetic(front) <= energy);
  assert.ok(!contactGeometry(rear, front));
  assert.ok(rear.damage > 0 && front.damage > 0);
  assert.equal(rear.collisions, 1);
});

test('glancing contact creates lateral motion and yaw; separated cars and parked overlap add no impact', () => {
  const a = body(0, 0, 20, 0.25),
    b = body(2.7, 1, 18);
  const hit = resolveContact(a, b);
  assert.ok(hit.impact > 0);
  assert.ok(Math.abs(a.sideSpeed) + Math.abs(b.sideSpeed) > 0);
  assert.ok(Math.abs(a.impactYaw) + Math.abs(b.impactYaw) > 0);
  assert.equal(resolveContact(body(0, 0), body(8, 0)), null);
  const c = body(0, 0),
    d = body(0, 0);
  resolveContact(c, d);
  assert.equal(kinetic(c) + kinetic(d), 0);
  assert.equal(c.damage + d.damage, 0);
});

test('deploy consumes finite energy; harvesting and braking recharge; attacking wears more tire', () => {
  const car = {
    energy: 0.5,
    tires: 1,
    speed: 25,
    wheelSteer: 0.3,
    throttle: 1,
    brake: 0,
    intent: { power: 'deploy', pace: 'attack' },
  };
  const gentle = structuredClone(car);
  gentle.intent = { power: 'harvest', pace: 'balanced' };
  for (let i = 0; i < 400; i++) {
    updateResources(car, 0.025);
    updateResources(gentle, 0.025);
  }
  assert.ok(car.energy < 0.03 && car.energy >= 0);
  assert.ok(gentle.energy > 0.5 && gentle.energy <= 1);
  assert.ok(car.tires < gentle.tires);
  assert.equal(slipstream({ nearby_cars: [{ forward: 10, right: 0 }] }) > 0, true);
  assert.equal(
    slipstream({
      nearby_cars: [
        { forward: -10, right: 0 },
        { forward: 10, right: 4 },
      ],
    }),
    0,
  );
});

test('a clear side lane allows a faster driver to pass instead of queuing behind a slower car', () => {
  const race = new Race(8912),
    front = race.cars[0],
    rear = race.cars[2];
  const cars = [front, rear];
  front.intent = { line: 'center', pace: 'cautious', power: 'neutral' };
  rear.intent = { line: 'right', pace: 'attack', power: 'deploy' };
  for (let time = 0; time < 12; time += 0.025) {
    for (const car of cars) {
      Object.assign(
        car,
        driveControls(observe(car, cars, race.track, time), car.intent, car.laneOffset),
      );
      integrate(car, 0.025, race.track);
    }
    resolveContact(front, rear);
  }
  assert.ok(rear.progress > front.progress + 6);
  assert.equal(rear.offTrack, 0);
  assert.ok(rear.energy < front.energy);
});

test('ten independent driver strategies and telemetry survive recording; five-car replays remain valid', () => {
  const settings = defaultSettings();
  assert.equal(settings.drivers.length, 10);
  assert.equal(new Set(settings.drivers.map((d) => d.prompt)).size, 10);
  const race = new Race();
  race.cars[8].energy = 0.32;
  race.cars[8].intent = { line: 'left', pace: 'attack', power: 'deploy' };
  race.time = 1;
  race.captureFrame();
  const record = recordRace(race, '11111111-1111-4111-8111-111111111111', 'Grid', Date.now());
  assert.ok(validRecord(record));
  const replay = new Race();
  applyReplay(replay, record, 1);
  assert.equal(replay.cars[8].energy, 0.32);
  assert.deepEqual(replay.cars[8].intent, race.cars[8].intent);
  const legacy = { ...settings, drivers: settings.drivers.slice(0, 5) };
  assert.ok(validSettings(legacy));
  race.configure(legacy);
  race.reset();
  const old = recordRace(race, record.id, 'Earlier race', Date.now());
  old.frames.forEach((frame) => frame.cars.forEach((car) => car.splice(9)));
  assert.ok(validRecord(old));
  replay.configure(old.settings);
  applyReplay(replay, old, 0);
  assert.equal(replay.cars.length, 5);
  assert.ok(replay.cars.every((car) => Number.isFinite(car.x)));
  const bad = structuredClone(record);
  bad.drivers[0].id = bad.drivers[1].id;
  assert.equal(validRecord(bad), false);
});

test('Jev drivers request independently and keep driving while a slow rival waits', async (t) => {
  const pending = new Map(),
    calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body),
      id = body.driverIds[0];
    assert.equal(body.states.length, 1);
    calls.push(id);
    await new Promise((resolve) => pending.set(id, resolve));
    return Response.json({ decisions: [{ line: 'center', pace: 'balanced', power: 'neutral' }] });
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const race = new Race();
  race.mode = 'jev';
  race.running = true;
  race.tick(0.025);
  assert.equal(calls.length, 10);
  pending.get('max')();
  pending.delete('max');
  await flush();
  race.tick(0.025);
  assert.equal(calls.length, 10, 'The grid only needs one initial answer per driver');
  for (const resolve of pending.values()) resolve();
  pending.clear();
  await flush();
  while (race.phase === 'lights') race.tick(0.025);
  race.tick(0.025);
  assert.equal(calls.length, 20);
  pending.get('max')();
  pending.delete('max');
  await flush();
  race.tick(0.025);
  assert.equal(calls.filter((id) => id === 'max').length, 3);
  assert.equal(calls.filter((id) => id === 'lewis').length, 2);
  const time = race.time;
  for (let i = 0; i < 20; i++) race.tick(0.1);
  assert.ok(race.time > time + 1.9);
  assert.equal(calls.length, 21, 'Never overlap requests for the same driver');
  race.running = false;
  for (const resolve of pending.values()) resolve();
  pending.clear();
  await flush();
  race.tick(0.1);
  assert.equal(calls.length, 21, 'Pause stops new paid calls');
  assert.equal(race.waiting, false);
  assert.equal(race.error, '');
});

test('lights hold every car; individual reaction times delay the launch after lights out', () => {
  const race = new Race(42);
  race.running = true;
  const initial = race.cars.map((car) => ({ x: car.x, z: car.z }));
  while (race.startClock < race.startDuration - 0.05) race.tick(0.025);
  assert.equal(race.time, 0);
  race.cars.forEach((car, i) => {
    assert.equal(car.x, initial[i].x);
    assert.equal(car.z, initial[i].z);
    assert.equal(car.speed, 0);
  });
  while (race.phase === 'lights') race.tick(0.025);
  const moved = new Map();
  for (let i = 0; i < 60; i++) {
    race.tick(0.025);
    for (const car of race.cars)
      if (car.speed > 0 && !moved.has(car.id)) moved.set(car.id, race.time);
  }
  assert.equal(moved.size, 10);
  assert.ok(new Set(moved.values()).size > 2);
  race.cars.forEach((car) => {
    assert.ok(moved.get(car.id) >= car.reactionTime);
    assert.ok(moved.get(car.id) < car.reactionTime + 1);
    if (['max', 'lewis'].includes(car.id)) assert.ok(moved.get(car.id) < car.reactionTime + 0.026);
  });
});

test('a received lane change waits for the driver reaction and then moves the steering progressively', () => {
  const race = new Race(42);
  race.running = true;
  while (race.phase !== 'racing' || race.time < 1) race.tick(0.025);
  race.nextDecision = Infinity;
  const car = race.cars[0];
  const before = car.intent;
  const target = { line: 'right', pace: 'attack', power: 'deploy' };
  race.apply(
    car,
    { intent: target, label: 'Attack right', confidence: 1 },
    observe(car, race.cars, race.track, race.time),
  );
  const receivedAt = race.time;
  assert.equal(car.intent, before);
  while (race.time + 0.025 < receivedAt + car.reactionTime) race.tick(0.025);
  assert.equal(car.intent, before);
  const steering = car.wheelSteer;
  race.tick(0.025);
  assert.deepEqual(car.intent, target);
  assert.ok(Math.abs(car.wheelSteer - steering) <= 2.8 * 0.025 + 1e-9);
});

test('a red-light pause freezes countdown and a reset clears pending reactions', () => {
  const race = new Race(91);
  race.running = true;
  for (let i = 0; i < 20; i++) race.tick(0.1);
  const clock = race.startClock;
  race.running = false;
  race.tick(0.1);
  assert.equal(race.startClock, clock);
  race.cars[0].pendingIntent = { intent: { line: 'left' }, at: 1 };
  race.reset();
  assert.equal(race.startClock, 0);
  assert.equal(race.phase, 'lights');
  assert.ok(race.cars.every((car) => !car.pendingIntent && car.speed === 0));
});
