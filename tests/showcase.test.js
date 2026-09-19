import test from 'node:test';
import assert from 'node:assert/strict';
import { reelFrame, GRID_HOLD, WINNER_HOLD, REEL_SHOTS } from '../src/showcase.js';

test('the reel holds the grid, runs the camera sequence, shows the winner, and loops', () => {
  const duration = 30;
  assert.equal(reelFrame(0, duration).lights, 1);
  assert.equal(reelFrame(GRID_HOLD - 0.1, duration).lights, 5);
  assert.equal(reelFrame(GRID_HOLD, duration).lights, 0);
  assert.equal(reelFrame(GRID_HOLD, duration).time, 0);
  assert.equal(reelFrame(GRID_HOLD + duration, duration).finished, true);
  assert.equal(reelFrame(GRID_HOLD + duration + WINNER_HOLD, duration).time, 0);
  assert.equal(
    new Set(Array.from({ length: 300 }, (_, i) => reelFrame(GRID_HOLD + i / 10, duration).shot))
      .size,
    REEL_SHOTS.length,
  );
});

test('older recordings start after the short countdown and keep the finish in sync', () => {
  assert.equal(reelFrame(1.49, 30, 6.4).lights, 5);
  assert.equal(reelFrame(1.5, 30, 6.4).lights, 0);
  assert.equal(reelFrame(1.75, 30, 6.4).time, 0.25);
  assert.equal(reelFrame(31.5, 30, 6.4).finished, true);
});
