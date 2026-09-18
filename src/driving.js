// Jev chooses a lane and pace. This shared actuator follows those targets using
// local road samples only; it has no track, seed, or other driver's memory.
export const LINES = {
  center: 'Follow the center of the road. Default when there is no car to pass.',
  left: 'Use the left side of the road to pass when that side is clear.',
  right: 'Use the right side of the road to pass when that side is clear.',
};
export const PACES = {
  attack: 'Fast pace within grip limits. Choose on clear road with the car aligned.',
  balanced: 'Normal racing pace. Choose for ordinary bends and moderate traffic.',
  cautious: 'Leave more braking margin. Choose for tight bends or traffic ahead.',
  recover: 'Roll slowly toward the road center. Choose when off track or facing away.',
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const validIntent = (value) =>
  !!value && Object.hasOwn(LINES, value.line) && Object.hasOwn(PACES, value.pace);

export function roadReading(state) {
  const points = state.visible_road;
  let maxCurvature = 0;
  let speedLimit = 34;
  for (let i = 0; i < points.length - 2; i++) {
    const a = points[i],
      b = points[i + 1],
      c = points[i + 2];
    const ab = Math.hypot(b.right - a.right, b.forward - a.forward);
    const bc = Math.hypot(c.right - b.right, c.forward - b.forward);
    const ac = Math.hypot(c.right - a.right, c.forward - a.forward);
    const cross =
      (b.right - a.right) * (c.forward - a.forward) - (b.forward - a.forward) * (c.right - a.right);
    const curvature = (2 * Math.abs(cross)) / Math.max(0.1, ab * bc * ac);
    maxCurvature = Math.max(maxCurvature, curvature);
    // Leave grip for line corrections and brake before the sampled bend.
    speedLimit = Math.min(
      speedLimit,
      Math.sqrt(10 / Math.max(0.001, curvature) + 2 * 12 * Math.max(0, a.distance - 5)),
    );
  }
  return {
    bend: maxCurvature > 0.055 ? 'tight' : maxCurvature > 0.022 ? 'medium' : 'gentle',
    position: state.off_track
      ? 'off track'
      : Math.abs(state.lateral_offset_m) < 1.5
        ? 'center'
        : state.lateral_offset_m > 0
          ? 'right side'
          : 'left side',
    alignment:
      Math.abs(state.heading_error) > 1.2
        ? 'facing away'
        : Math.abs(state.heading_error) > 0.4
          ? 'misaligned'
          : 'aligned',
    speed_limit_mps: +speedLimit.toFixed(1),
    traffic: state.nearby_cars
      .filter((c) => c.forward > 0 && c.forward < 25)
      .map((c) => ({
        side: Math.abs(c.right) < 2.2 ? 'ahead' : c.right < 0 ? 'left' : 'right',
        distance_m: +c.forward.toFixed(1),
      })),
  };
}

export function driveControls(state, intent, laneOffset = 0, dt = 0.025) {
  const recovering =
    state.off_track || Math.abs(state.heading_error) > 1.1 || intent.pace === 'recover';
  const lane = recovering
    ? 0
    : { left: -1, center: 0, right: 1 }[intent.line] *
      Math.min(2.5, Math.max(0, state.road_width_m / 2 - 2));
  const offset = laneOffset + clamp(lane - laneOffset, -2 * dt, 2 * dt);
  const points = state.visible_road;
  const lookahead = recovering ? 8 : clamp(7 + state.speed_mps * 0.5, 8, 20);
  let i = points.findIndex((p) => p.distance >= lookahead);
  if (i < 1) i = 1;
  const a = points[i - 1],
    b = points[i];
  const f = clamp((lookahead - a.distance) / Math.max(1, b.distance - a.distance), 0, 1);
  const dx = b.right - a.right,
    dz = b.forward - a.forward;
  const length = Math.max(0.1, Math.hypot(dx, dz));
  const right = a.right + dx * f + (dz / length) * offset;
  const forward = a.forward + dz * f - (dx / length) * offset;
  const bearing = Math.atan2(right, forward);
  let steer = clamp(Math.atan2(2 * 3.1 * right, right * right + forward * forward) / 0.42, -1, 1);
  // Pure pursuit has no useful turning direction for a target directly behind.
  if (forward < 1) steer = Math.sign(Math.abs(bearing) > 0.01 ? bearing : state.heading_error) || 1;
  const reading = roadReading(state);
  let desired = recovering
    ? 6
    : reading.speed_limit_mps *
      { attack: 1, balanced: 0.87, cautious: 0.7, recover: 0.3 }[intent.pace];
  desired = Math.min(
    desired,
    Math.sqrt(11 / Math.max(0.01, Math.abs(Math.tan(steer * 0.42) / 3.1))),
  );
  if (Math.abs(state.heading_error) > 0.55) desired = Math.min(desired, 9);
  for (const car of state.nearby_cars) {
    if (car.forward > 0 && car.forward < 25 && Math.abs(car.right) < 2.2) {
      desired = Math.min(
        desired,
        Math.sqrt(car.speed_mps ** 2 + 2 * 10 * Math.max(0, car.forward - 4)),
      );
    }
  }
  // A speed target keeps a recovering car rolling; braking and throttle never overlap.
  const error = desired - state.speed_mps;
  const drag = 0.007 * state.speed_mps ** 2 + state.speed_mps * (state.off_track ? 1.1 : 0.035);
  const acceleration = clamp(error * 3, -21, 10);
  return {
    steer,
    throttle: acceleration + drag > 0 ? clamp((acceleration + drag) / 10, 0, 1) : 0,
    brake: acceleration + drag < 0 ? clamp(-(acceleration + drag) / 21, 0, 1) : 0,
    laneOffset: offset,
  };
}
