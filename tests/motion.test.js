import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPose, replayCoordinate } from '../src/motion.js';
import { clearChaseCamera } from '../src/camera.js';
import { Race } from '../src/simulation.js';

test('rendering fills the 40 Hz gaps without changing physics or spinning across the angle seam', () => {
  const previous = { x: 0, z: 0, distance: 0, heading: Math.PI - 0.1, wheelSteer: 0 };
  const current = { x: 1, z: 2, distance: 1, heading: -Math.PI + 0.1, wheelSteer: 1 };
  const before = structuredClone(current);
  const pose = renderPose(current, previous, 0.5);
  assert.equal(pose.x, 0.5);
  assert.equal(pose.z, 1);
  assert.equal(pose.heading, Math.PI);
  assert.deepEqual(current, before);
  const race = new Race(8912);
  race.phase = 'racing';
  race.running = true;
  race.tick(0.041);
  assert.equal(race.previousPoses.length, 10);
  assert.ok(race.accumulator > 0 && race.accumulator < 0.025);
});

test('sparse replay motion has continuous velocity, exact samples and no position overshoot', () => {
  const frames = [0, 1, 4, 5, 5, 3].map((x, i) => ({ t: i * 0.2, cars: [[x, 0, 0]] }));
  for (let i = 0; i < frames.length - 1; i++) {
    const p = frames[i].cars[0][0],
      q = frames[i + 1].cars[0][0];
    assert.equal(replayCoordinate(frames, i, 0, 0, 0), p);
    assert.equal(replayCoordinate(frames, i, 0, 0, 1), q);
    for (let f = 0; f <= 1; f += 0.01) {
      const x = replayCoordinate(frames, i, 0, 0, f);
      assert.ok(x >= Math.min(p, q) - 1e-10 && x <= Math.max(p, q) + 1e-10);
    }
  }
  const epsilon = 1e-5;
  const left = (1 - replayCoordinate(frames, 0, 0, 0, 1 - epsilon)) / epsilon;
  const right = (replayCoordinate(frames, 1, 0, 0, epsilon) - 1) / epsilon;
  assert.ok(Math.abs(left - right) < 0.001);
  const turn = [
    { t: 0, cars: [[0, 0, Math.PI - 0.1]] },
    { t: 0.2, cars: [[0, 0, -Math.PI + 0.1]] },
  ];
  assert.ok(Math.abs(replayCoordinate(turn, 0, 0, 2, 0.5) - Math.PI) < 1e-10);
});

test('camera clearance has no height step as traffic enters or leaves the shot', () => {
  let last;
  for (let x = 0; x <= 12; x += 0.01) {
    const y = clearChaseCamera(
      { x: 0, y: 4.8, z: -12 },
      { x: 0, y: 1, z: 6 },
      [{ x, z: -8 }],
      -1,
    ).y;
    if (last !== undefined) assert.ok(Math.abs(y - last) < 0.04);
    last = y;
  }
  assert.equal(last, 4.8);
});
