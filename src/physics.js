// Scaled open-wheel dynamics for short circuits, not a regulation F1 simulator.
// Equal mass and grip for every driver; speed differences come from decisions.
export const CAR_LENGTH = 5.6;
export const CAR_WIDTH = 2.8;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dot = (a, b) => a.x * b.x + a.z * b.z;
const axes = (c) => [
  { x: Math.sin(c.heading), z: Math.cos(c.heading) },
  { x: Math.cos(c.heading), z: -Math.sin(c.heading) },
];
const velocity = (c) => {
  if (c.spinTime > 0) return { x: c.spinVX, z: c.spinVZ };
  const [f, r] = axes(c);
  return {
    x: f.x * c.speed + r.x * (c.sideSpeed || 0),
    z: f.z * c.speed + r.z * (c.sideSpeed || 0),
  };
};
function setVelocity(c, v) {
  if (c.spinTime > 0) {
    c.spinVX = v.x;
    c.spinVZ = v.z;
  }
  const [f, r] = axes(c);
  c.speed = Math.max(0, dot(v, f));
  c.sideSpeed = clamp(dot(v, r), -12, 12);
}

// The separating-axis test uses the same footprint as the rendered car.
export function contactGeometry(a, b) {
  const aa = axes(a),
    bb = axes(b),
    delta = { x: b.x - a.x, z: b.z - a.z };
  let depth = Infinity,
    normal;
  for (const axis of [...aa, ...bb]) {
    const extent = (basis) =>
      (Math.abs(dot(axis, basis[0])) * CAR_LENGTH) / 2 +
      (Math.abs(dot(axis, basis[1])) * CAR_WIDTH) / 2;
    const overlap = extent(aa) + extent(bb) - Math.abs(dot(delta, axis));
    if (overlap <= 0) return null;
    if (overlap < depth) {
      depth = overlap;
      const sign = dot(delta, axis) < 0 ? -1 : 1;
      normal = { x: axis.x * sign, z: axis.z * sign };
    }
  }
  return { depth, normal };
}

export function resolveContact(a, b) {
  if (a.finished || b.finished || Math.hypot(b.x - a.x, b.z - a.z) > CAR_LENGTH + CAR_WIDTH)
    return null;
  const contact = contactGeometry(a, b);
  if (!contact) return null;
  const { normal: n, depth } = contact;
  const av = velocity(a),
    bv = velocity(b);
  const closing = -dot({ x: bv.x - av.x, z: bv.z - av.z }, n);
  // Correct overlap separately from velocity; resting contact cannot add energy.
  const correction = (depth + 0.001) / 2;
  a.x -= n.x * correction;
  a.z -= n.z * correction;
  b.x += n.x * correction;
  b.z += n.z * correction;
  if (closing <= 0) return { impact: 0, counted: false };
  const impulse = closing * 0.54; // Equal masses, restitution 0.08.
  setVelocity(a, { x: av.x - n.x * impulse, z: av.z - n.z * impulse });
  setVelocity(b, { x: bv.x + n.x * impulse, z: bv.z + n.z * impulse });
  // A glancing hit introduces yaw and a short lateral slide, rather than a spin lottery.
  for (const [car, sign] of [
    [a, -1],
    [b, 1],
  ]) {
    const side = dot(axes(car)[1], n);
    const other = car === a ? b : a;
    const forward = axes(car)[0];
    // Offset contact puts torque into the chassis. Nose-to-tail contact has little yaw.
    const lever = clamp(
      ((other.x - car.x) * forward.x + (other.z - car.z) * forward.z) / 2,
      -2.8,
      2.8,
    );
    const torque = sign * side * closing * (0.04 + Math.abs(lever) * 0.055) * (lever < 0 ? -1 : 1);
    car.impactYaw = clamp((car.impactYaw || 0) + torque, -3.8, 3.8);
    const severity = Math.max(0, closing - 3);
    car.suspensionDamage = clamp(
      (car.suspensionDamage || 0) + severity * Math.abs(side) * 0.025,
      0,
      1,
    );
    car.wingDamage = clamp((car.wingDamage || 0) + severity * (1 - Math.abs(side)) * 0.018, 0, 1);
    car.damage = clamp((car.damage || 0) + severity * 0.012, 0, 1);
  }
  const counted = closing > 0.7 && a.contactCooldown <= 0 && b.contactCooldown <= 0;
  if (counted) {
    a.collisions++;
    b.collisions++;
    a.contactCooldown = b.contactCooldown = 0.7;
  }
  return { impact: closing, counted };
}

export function slipstream(state) {
  return state.nearby_cars.reduce((best, car) => {
    if (car.forward < 5.6 || car.forward > 30 || Math.abs(car.right) > 1.6) return best;
    return Math.max(best, (1 - (car.forward - 5.6) / 24.4) * (1 - Math.abs(car.right) / 1.6));
  }, 0);
}

export function updateResources(car, dt) {
  const power = car.intent?.power || 'neutral';
  const deploying = power === 'deploy' && car.energy > 0.02 && car.throttle > 0.25 && !car.off;
  car.boost = deploying ? 3.5 : 0;
  const regen = car.brake * 0.05 + (power === 'harvest' ? 0.035 : 0.005);
  car.energy = clamp((car.energy ?? 1) + (deploying ? -0.065 : regen) * dt, 0, 1);
  const loading = (Math.abs(car.wheelSteer || 0) * car.speed) / 25;
  const paceWear =
    car.intent?.pace === 'attack' ? 0.0084 : car.intent?.pace === 'cautious' ? 0.0015 : 0.0036;
  car.tires = clamp(
    (car.tires ?? 1) - (paceWear * (0.25 + loading) + Math.abs(car.sideSpeed || 0) * 0.0008) * dt,
    0.35,
    1,
  );
}
