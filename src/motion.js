const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

// Render between completed physics steps; gameplay continues to use the exact state.
export function renderPose(car, previous, fraction) {
  if (!previous) return car;
  const f = Math.max(0, Math.min(1, fraction));
  const pose = { ...car };
  for (const key of ['x', 'z', 'distance', 'wheelSteer'])
    pose[key] = previous[key] + (car[key] - previous[key]) * f;
  pose.heading = previous.heading + angleDelta(previous.heading, car.heading) * f;
  return pose;
}

// Monotone cubic interpolation softens sparse replays without overshooting a
// recorded position. A contact or change of direction flattens the tangent.
export function replayCoordinate(frames, index, driver, field, fraction) {
  const a = frames[index],
    b = frames[Math.min(index + 1, frames.length - 1)];
  const p = a.cars[driver][field],
    q0 = b.cars[driver][field];
  const angular = field === 2;
  const q = angular ? p + angleDelta(p, q0) : q0;
  if (a === b) return p;
  const before = frames[Math.max(0, index - 1)];
  const after = frames[Math.min(frames.length - 1, index + 2)];
  const h = b.t - a.t;
  const slope = (q - p) / h;
  const beforeValue = before.cars[driver][field];
  const afterValue = after.cars[driver][field];
  const left =
    before === a
      ? slope
      : (angular ? angleDelta(beforeValue, p) : p - beforeValue) / (a.t - before.t);
  const right =
    after === b
      ? slope
      : (angular ? angleDelta(q0, afterValue) : afterValue - q0) / (after.t - b.t);
  const tangent = (u, v) => (u * v <= 0 ? 0 : (2 * u * v) / (u + v));
  const m0 = tangent(left, slope) * h,
    m1 = tangent(slope, right) * h;
  const f = Math.max(0, Math.min(1, fraction)),
    f2 = f * f,
    f3 = f2 * f;
  return (
    (2 * f3 - 3 * f2 + 1) * p + (f3 - 2 * f2 + f) * m0 + (-2 * f3 + 3 * f2) * q + (f3 - f2) * m1
  );
}
