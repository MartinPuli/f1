// Optional race-control scenario. These faults are injected by the simulation,
// not presented as choices made by Jev. Their consequences use normal physics.
export function raceIncidents(race) {
  if (!race.incidents || race.phase !== 'racing') return;
  const active = race.ranking().filter((car) => !car.finished && !car.retired);
  if (!race.incidentFlags.contact && race.time >= 7) {
    let pair = null,
      distance = 8;
    for (const a of active.slice(1))
      for (const b of active) {
        if (a === b) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < distance) {
          pair = [a, b];
          distance = d;
        }
      }
    if (pair) {
      const [a, b] = pair;
      const lateral = (b.x - a.x) * Math.cos(a.heading) - (b.z - a.z) * Math.sin(a.heading);
      a.gripLoss = 1.1;
      if (Math.abs(lateral) > 1) a.sideSpeed = Math.sign(lateral) * 5;
      else {
        const front = a.progress > b.progress ? a : b;
        front.brakeFault = 0.9;
      }
      race.incidentFlags.contact = true;
      race.addEvent(a.id, `Curb strike · ${a.short}`);
    }
  }
  if (!race.incidentFlags.failure && active.some((car) => car.lap >= 1)) {
    const car = active.find((c) => c.id === 'carlos') || active.at(-1);
    if (!car) return;
    car.retired = true;
    car.retirement = 'Mechanical failure';
    car.action = 'Mechanical failure';
    car.pendingIntent = null;
    car.intent = null;
    car.throttle = 0;
    car.brake = 0.35;
    race.incidentFlags.failure = true;
    race.addEvent(car.id, `Mechanical failure · ${car.short}`);
  }
}
