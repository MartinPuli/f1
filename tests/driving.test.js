import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, observe, integrate } from '../src/simulation.js';
import { driveControls, roadReading } from '../src/driving.js';

function step(race, car, intent, time) {
  const state = observe(car, [car], race.track, time);
  const controls = driveControls(state, intent, car.laneOffset);
  assert.ok(!(controls.throttle > 0 && controls.brake > 0));
  Object.assign(car, controls);
  integrate(car, 0.025, race.track);
}

test('local steering executes every pace through seeded bends without leaving the road', () => {
  // Includes the circuits reported by the player, plus deterministic fresh seeds.
  const seeds = [
    42,
    108,
    8912,
    665136426,
    2394718402,
    ...Array.from({ length: 12 }, (_, i) => (i * 2654435761) >>> 0),
  ];
  for (const seed of seeds) {
    for (const pace of ['attack', 'balanced', 'cautious', 'recover']) {
      const race = new Race(seed),
        car = race.cars[0];
      for (let t = 0; t < 100 && car.progress < race.track.length; t += 0.025)
        step(race, car, { line: 'center', pace }, t);
      assert.ok(car.progress >= race.track.length, `${seed}/${pace}: finish`);
      assert.equal(car.offTrack, 0, `${seed}/${pace}: road departures`);
    }
  }
});

test('recovery keeps rolling from either verge and a reversed heading without teleporting', () => {
  for (const seed of [42, 665136426, 2394718402]) {
    for (const side of [-1, 1]) {
      for (const heading of [-Math.PI / 2, Math.PI / 2, Math.PI]) {
        const race = new Race(seed),
          car = race.cars[0];
        const p = race.track.at(10),
          tangent = race.track.tangent(10);
        car.x = p.x + tangent.z * 10 * side;
        car.z = p.z - tangent.x * 10 * side;
        car.heading = Math.atan2(tangent.x, tangent.z) + heading;
        car.lastS = 10;
        for (let t = 0; t < 25; t += 0.025) {
          const { x, z } = car;
          // Even an unsuitable model target must not disable physical recovery.
          step(race, car, { line: side < 0 ? 'left' : 'right', pace: 'attack' }, t);
          assert.ok(Math.hypot(car.x - x, car.z - z) <= 52 * 0.025 + 0.001);
        }
        assert.equal(car.off, false, `${seed}/${side}/${heading}: back on road`);
        assert.ok(car.progress > 40);
        assert.ok(car.speed > 2);
      }
    }
  }
});

test('model lane and pace choices change the driven path and lap time', () => {
  const results = [];
  for (const intent of [
    { line: 'left', pace: 'attack' },
    { line: 'right', pace: 'cautious' },
  ]) {
    const race = new Race(42),
      car = race.cars[0];
    let time = 0,
      offset = 0,
      samples = 0;
    while (time < 100 && car.progress < race.track.length) {
      step(race, car, intent, time);
      time += 0.025;
      if (time > 5) {
        offset += race.track.nearest(car.x, car.z).offset;
        samples++;
      }
    }
    results.push({ time, offset: offset / samples });
  }
  assert.ok(results[0].offset < -1);
  assert.ok(results[1].offset > 1);
  assert.ok(results[0].time < results[1].time);
});

test('steering slew and grip limits bound sudden steering commands', () => {
  const race = new Race(),
    car = race.cars[0];
  car.speed = 30;
  car.steer = 1;
  const heading = car.heading;
  integrate(car, 0.025, race.track);
  assert.ok(car.wheelSteer <= 2.8 * 0.025);
  assert.ok(Math.abs(car.heading - heading) <= (18 / car.speed) * 0.025 + 1e-9);
});

test('changing lane and pace every half-second does not strand the car', () => {
  for (const seed of [42, 8912, 665136426, 2394718402]) {
    const race = new Race(seed),
      car = race.cars[0];
    for (let t = 0; t < 100 && car.progress < race.track.length; t += 0.025) {
      const decision = Math.floor(t / 0.5);
      step(
        race,
        car,
        {
          line: ['left', 'right', 'center'][decision % 3],
          pace: ['attack', 'recover', 'balanced', 'cautious'][decision % 4],
        },
        t,
      );
    }
    assert.ok(car.progress >= race.track.length, `${seed}: finish`);
    assert.equal(car.offTrack, 0);
  }
});

test('road readings depend on visible samples, not a seed or hidden geometry', () => {
  const race = new Race(),
    state = observe(race.cars[0], race.cars, race.track, 0);
  const reading = roadReading(state);
  assert.deepEqual(roadReading({ ...state, seed: 123, track: 'unseen' }), reading);
  assert.ok(reading.speed_limit_mps > 0);
});

test('ten Jev cars finish with mocked independent lane and pace targets', async (t) => {
  let clock = 100000;
  t.mock.method(Date, 'now', () => clock);
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body);
    return Response.json({
      decisions: body.driverIds.map((id, i) => ({
        line: ['left', 'center', 'right'][i % 3],
        pace: ['attack', 'balanced', 'cautious'][i % 3],
        confidence: 0.9,
      })),
    });
  });
  for (const seed of [42, 665136426, 2394718402]) {
    const race = new Race(seed);
    race.mode = 'jev';
    race.limit = 1;
    race.running = true;
    for (let i = 0; i < 1800 && !race.finished; i++) {
      clock += 2000;
      race.tick(0.1);
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(race.error, '');
    assert.equal(race.finished, true);
    for (const car of race.cars) {
      assert.equal(car.lap, 1, `${seed}/${car.id}`);
      assert.ok(car.offTrack < 3, `${seed}/${car.id}: departures`);
    }
  }
});
