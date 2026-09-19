export const GRID_HOLD = 1.5;
export const filmGridHold = (recordedHold = GRID_HOLD) => Math.min(recordedHold, GRID_HOLD);
export const WINNER_HOLD = 4;

export function reelFrame(elapsed, duration, gridHold = GRID_HOLD) {
  gridHold = filmGridHold(gridHold);
  const total = gridHold + duration + WINNER_HOLD;
  const clock = ((elapsed % total) + total) % total;
  const time = Math.max(0, Math.min(duration, clock - gridHold));
  const progress = time / Math.max(1, duration);
  const shot =
    progress < 0.2 ? 0 : progress < 0.31 ? 1 : progress < 0.52 ? 2 : progress < 0.73 ? 3 : 4;
  return {
    time,
    shot,
    lights: clock < gridHold ? Math.min(5, Math.floor(clock / (gridHold / 6)) + 1) : 0,
    finished: clock >= gridHold + duration,
  };
}

export const REEL_SHOTS = [
  { driver: 4, mode: 'follow', angle: 0, height: 0 },
  { driver: 0, mode: 'orbit', angle: 0, height: 0 },
  { driver: 3, mode: 'follow', angle: -0.5, height: 0.6 },
  { driver: 1, mode: 'follow', angle: 0.55, height: -0.4 },
  { driver: 'leader', mode: 'follow', angle: 0, height: 0 },
];

// Give a recorded incident a short onboard shot; the camera never changes the race.
export function filmShot(record, time, shotIndex) {
  const event = record.events?.find(
    (e) =>
      e.time <= time &&
      time - e.time < 3.2 &&
      (e.text.startsWith('Curb strike') ||
        e.text.startsWith('Mechanical failure') ||
        e.text.startsWith('Spin ·') ||
        e.text.startsWith('Cooling leak') ||
        e.text.startsWith('Engine overheating') ||
        e.text.startsWith('Suspension failure')),
  );
  if (event) {
    const driver = record.settings?.drivers.findIndex((c) => c.id === event.id) ?? -1;
    if (driver >= 0) return { driver, mode: 'follow', angle: -0.5, height: 0.7 };
  }
  return REEL_SHOTS[shotIndex];
}
