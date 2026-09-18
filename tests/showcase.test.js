import test from 'node:test';
import assert from 'node:assert/strict';
import { reelFrame, GRID_HOLD, WINNER_HOLD, REEL_SHOTS } from '../src/showcase.js';

test('the reel holds the grid, runs the camera sequence, shows the winner, and loops', () => {
  const duration = 30;
  assert.equal(reelFrame(0, duration).lights, 1);
  assert.equal(reelFrame(2.9, duration).lights, 5);
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
