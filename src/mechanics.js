const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const FAILURE_REASONS = ['Mechanical failure', 'Engine overheating', 'Suspension failure'];
export function retireCar(car, reason, emit = () => {}) {
  if (car.retired || car.finished) return;
  car.retired = true;
  car.retirement = reason;
  car.action = reason;
  car.pendingIntent = null;
  car.intent = null;
  car.throttle = 0;
  car.brake = 0.35;
  emit(`${reason} · ${car.short}`);
}
// Preserve world momentum while the chassis rotates; a spin never teleports a car.
export function startSpin(car, yaw) {
  if (car.retired || car.finished || car.spinTime > 0 || car.spinCooldown > 0 || car.speed < 7)
    return false;
  car.spinVX = Math.sin(car.heading) * car.speed + Math.cos(car.heading) * (car.sideSpeed || 0);
  car.spinVZ = Math.cos(car.heading) * car.speed - Math.sin(car.heading) * (car.sideSpeed || 0);
  car.impactYaw = clamp(yaw, -3.8, 3.8);
  car.spinTime = 1.8;
  car.spinCooldown = 6;
  car.spins = (car.spins || 0) + 1;
  car.tires = Math.max(0.35, (car.tires ?? 1) - 0.06);
  return true;
}
export function updateMechanical(car, dt, emit = () => {}) {
  if (car.finished || car.retired) return;
  const load = (car.pedalThrottle || 0) * (car.intent?.power === 'deploy' ? 1.25 : 1);
  const target = 86 + load * 18 + (car.coolingLeak ? 66 : 0);
  car.engineTemp = clamp(
    (car.engineTemp ?? 90) + (target - (car.engineTemp ?? 90)) * dt * 0.22,
    60,
    160,
  );
  if (car.engineTemp >= 115 && !car.heatWarning) {
    car.heatWarning = true;
    emit(`Engine temperature high · ${car.short}`);
  }
  // Sustained heat causes failure; lifting and harvesting reduce the heat input.
  car.overheatTime =
    car.engineTemp > 132 ? (car.overheatTime || 0) + dt : Math.max(0, (car.overheatTime || 0) - dt);
  if (car.overheatTime > 1.5) retireCar(car, 'Engine overheating', emit);
  if ((car.suspensionDamage || 0) >= 0.92) retireCar(car, 'Suspension failure', emit);
}
