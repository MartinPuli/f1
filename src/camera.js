// Lift the chase camera above traffic instead of hiding cars near the lens.
export function clearChaseCamera(position, target, cars, selected) {
  const dx = position.x - target.x,
    dz = position.z - target.z;
  const length2 = dx * dx + dz * dz;
  let y = position.y;
  if (length2 < 0.01) return { ...position };
  for (let i = 0; i < cars.length; i++) {
    if (i === selected) continue;
    const car = cars[i];
    if (Math.hypot(car.x - position.x, car.z - position.z) < 7) y = Math.max(y, 7.5);
    const t = Math.max(
      0.15,
      Math.min(1, ((car.x - target.x) * dx + (car.z - target.z) * dz) / length2),
    );
    const distance = Math.hypot(car.x - target.x - dx * t, car.z - target.z - dz * t);
    if (distance < 3.2) y = Math.max(y, (2.9 - target.y * (1 - t)) / t);
  }
  return { x: position.x, y: Math.min(13, y), z: position.z };
}
