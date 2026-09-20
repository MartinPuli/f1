export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const TRAINING_SEEDS = [8912, 2046];
export const VALIDATION_SEED = 73091;
export const CHAMPIONSHIP_SEEDS = [66103, 91827, 20260920];

// Prompts change; the driving controller, physics and model stay fixed.
export const STRATEGIES = {
  clean:
    'Reduce contact and lane changes. Hold the current lane alongside another car. Prefer center on clear road. Pass only when a side lane is clear. Use balanced pace through traffic and attack on a clear exit; recover only when off track or facing away. Deploy on open exits and harvest when blocked.',
  attack:
    'Prioritize lap time. Use attack pace when aligned with the road and grip is above 55%; the controller handles braking for corners. Deploy battery on clear road and during a pass while battery exceeds 15%. Harvest when blocked, not on a clear straight. Hold a clear lane rather than switching repeatedly. Recover only when off track or facing away.',
  exits:
    'Prioritize corner exit speed. Choose the clearest lane before a bend and hold it through the corner. Use balanced pace in a tight bend, then attack and deploy as soon as the road opens. Avoid defensive weaving. Harvest when blocked or battery is below 15%. Recover only when off track or facing away.',
  energy:
    'Spend battery where it gains positions: deploy on an open exit or alongside a rival, harvest only while blocked or in tight corners. On the final lap spend the remaining battery. Use attack pace on clear road with good grip and balanced pace near traffic. Hold your lane alongside another car. Recover only when off track or facing away.',
  passing:
    'When closing on a slower car within 18 m, choose a clear side lane early and hold it until the pass is complete. Attack and deploy while passing if grip permits. Do not switch into an occupied lane or follow a blocked lane when a side is open. On clear road attack with neutral battery, deploying on the final lap. Recover only when off track or facing away.',
};

export function summarize(record) {
  return record.drivers.map((driver, index) => {
    const replies = record.decisionLog
      .flatMap((entry) => entry.answers)
      .filter((a) => a.id === driver.id);
    const laps = driver.lapTimes.filter(Number.isFinite);
    const finished = Number.isFinite(driver.finishTime) && !driver.retired;
    return {
      id: driver.id,
      name: driver.name,
      position: index + 1,
      finished,
      finishTime: driver.finishTime,
      lapTimes: laps,
      bestLap: laps.length ? Math.min(...laps) : null,
      flyingLap: laps.length > 1 ? laps.at(-1) : null,
      collisions: driver.collisions,
      offTrack: driver.offTrack,
      retirement: driver.retirement || (!finished ? 'Time limit' : null),
      decisions: replies.length,
      attackShare: replies.length
        ? replies.filter((a) => a.pace === 'attack').length / replies.length
        : 0,
      harvestShare: replies.length
        ? replies.filter((a) => a.power === 'harvest').length / replies.length
        : 0,
      finalBattery: replies.at(-1)?.observation?.battery ?? null,
      score: finished ? driver.finishTime : 1000 + record.duration,
    };
  });
}

export function choosePrompts(generations, rounds) {
  const baseline = generations[0];
  return Object.fromEntries(
    Object.keys(baseline.drivers).map((id) => {
      const candidates = generations
        .map((generation) => {
          const samples = rounds.filter(
            (r) => r.phase === 'training' && r.generation === generation.id,
          );
          if (!TRAINING_SEEDS.every((seed) => samples.some((r) => r.seed === seed))) return null;
          const mean =
            samples.reduce((sum, r) => sum + r.results.find((d) => d.id === id).score, 0) /
            samples.length;
          return { generation: generation.id, score: mean, ...generation.drivers[id] };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score || a.generation - b.generation);
      if (!candidates.length)
        throw new Error('Complete both training circuits before selecting prompts.');
      return [id, candidates[0]];
    }),
  );
}

export function standings(rounds, drivers) {
  const table = drivers.map((d) => ({
    id: d.id,
    name: d.name,
    points: 0,
    wins: 0,
    finishes: 0,
    positions: [],
  }));
  for (const round of rounds.filter((r) => r.phase === 'championship')) {
    for (const result of round.results) {
      const driver = table.find((d) => d.id === result.id);
      if (!driver) continue;
      driver.positions.push(result.position);
      if (result.finished) {
        driver.points += POINTS[result.position - 1] || 0;
        driver.finishes++;
        if (result.position === 1) driver.wins++;
      }
    }
  }
  return table.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    for (let position = 1; position <= drivers.length; position++) {
      const diff =
        b.positions.filter((p) => p === position).length -
        a.positions.filter((p) => p === position).length;
      if (diff) return diff;
    }
    return a.id.localeCompare(b.id);
  });
}
