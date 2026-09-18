// Start lifting before traffic reaches the lens. Continuous falloff avoids a
// height jump when a neighbouring car crosses the clearance boundary.
const falloff = (distance, inner, outer) => {
  const t = Math.max(0, Math.min(1, (outer - distance) / (outer - inner)));
  return t * t * (3 - 2 * t);
};
export function clearChaseCamera(position, target, cars, selected) {
  const dx = position.x - target.x,
    dz = position.z - target.z;
  const length2 = dx * dx + dz * dz;
  let y = position.y;
  if (length2 < 0.01) return { ...position };
  for (let i = 0; i < cars.length; i++) {
    if (i === selected) continue;
    const car = cars[i];
    const nearLens = falloff(Math.hypot(car.x - position.x, car.z - position.z), 4, 10);
    y = Math.max(y, position.y + Math.max(0, 7.5 - position.y) * nearLens);
    const t = Math.max(
      0.15,
      Math.min(1, ((car.x - target.x) * dx + (car.z - target.z) * dz) / length2),
    );
    const distance = Math.hypot(car.x - target.x - dx * t, car.z - target.z - dz * t);
    const clearance = Math.min(13, (2.9 - target.y * (1 - t)) / t);
    y = Math.max(y, position.y + Math.max(0, clearance - position.y) * falloff(distance, 2.2, 5.5));
  }
  return { x: position.x, y: Math.min(13, y), z: position.z };
}
