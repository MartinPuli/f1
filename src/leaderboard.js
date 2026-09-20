// Rank recorded outcomes by wins, then mean finishing position; do not create new race scores.
export function aggregateResults(races) {
  const drivers = new Map();
  for (const race of races)
    for (const result of race.results) {
      if (!drivers.has(result.id))
        drivers.set(result.id, {
          id: result.id,
          name: result.name,
          wins: 0,
          finishes: 0,
          races: 0,
          positions: 0,
          bestLap: Infinity,
        });
      const d = drivers.get(result.id);
      d.races++;
      d.positions += result.position;
      if (result.finished) {
        d.finishes++;
        if (result.position === 1) d.wins++;
      }
      if (Number.isFinite(result.bestLap) && result.bestLap > 0)
        d.bestLap = Math.min(d.bestLap, result.bestLap);
    }
  return [...drivers.values()]
    .map((d) => ({ ...d, averagePosition: d.positions / d.races }))
    .sort(
      (a, b) =>
        b.wins - a.wins || a.averagePosition - b.averagePosition || a.id.localeCompare(b.id),
    );
}
