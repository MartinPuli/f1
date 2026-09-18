export const GRID_HOLD = 3;
export const WINNER_HOLD = 4;

export function reelFrame(elapsed, duration) {
  const total = GRID_HOLD + duration + WINNER_HOLD;
  const clock = ((elapsed % total) + total) % total;
  const time = Math.max(0, Math.min(duration, clock - GRID_HOLD));
  const progress = time / Math.max(1, duration);
  const shot =
    progress < 0.2 ? 0 : progress < 0.31 ? 1 : progress < 0.52 ? 2 : progress < 0.73 ? 3 : 4;
  return {
    time,
    shot,
    lights: clock < GRID_HOLD ? Math.min(5, Math.floor(clock / 0.5) + 1) : 0,
    finished: clock >= GRID_HOLD + duration,
  };
}

export const REEL_SHOTS = [
  { driver: 4, mode: 'follow', angle: 0, height: 0 },
  { driver: 0, mode: 'orbit', angle: 0, height: 0 },
  { driver: 3, mode: 'follow', angle: -0.5, height: 0.6 },
  { driver: 1, mode: 'follow', angle: 0.55, height: -0.4 },
  { driver: 'leader', mode: 'follow', angle: 0, height: 0 },
];
