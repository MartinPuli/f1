export const DRIVERS = [
  {
    id: 'max',
    name: 'Max JEVstappen',
    short: 'JEVstappen',
    number: '3',
    color: '#ff775b',
    style: 'Aggressive',
    risk: 1.08,
  },
  {
    id: 'lewis',
    name: 'Lewis JEVmilton',
    short: 'JEVmilton',
    number: '44',
    color: '#b199eb',
    style: 'Adaptive',
    risk: 1.0,
  },
  {
    id: 'charles',
    name: 'Charles LeJEVclerc',
    short: 'LeJEVclerc',
    number: '16',
    color: '#efb83e',
    style: 'Precise',
    risk: 0.94,
  },
  {
    id: 'lando',
    name: 'Lando JEVrris',
    short: 'JEVrris',
    number: '1',
    color: '#58baa0',
    style: 'Opportunistic',
    risk: 1.04,
  },
  {
    id: 'franco',
    name: 'Franco ColJEVpinto',
    short: 'ColJEVpinto',
    number: '43',
    color: '#64b4e9',
    style: 'Patient',
    risk: 0.88,
  },
  {
    id: 'oscar',
    name: 'Oscar JEVastri',
    short: 'JEVastri',
    number: '81',
    color: '#e58cb6',
    style: 'Late attacker',
    risk: 1.02,
  },
  {
    id: 'fernando',
    name: 'Fernando AlonJEV',
    short: 'AlonJEV',
    number: '14',
    color: '#408c74',
    style: 'Defender',
    risk: 0.98,
  },
  {
    id: 'carlos',
    name: 'Carlos JEVainz',
    short: 'JEVainz',
    number: '55',
    color: '#dc8050',
    style: 'Energy saver',
    risk: 0.97,
  },
  {
    id: 'george',
    name: 'George JEVssell',
    short: 'JEVssell',
    number: '63',
    color: '#6284d8',
    style: 'Late braker',
    risk: 1.05,
  },
  {
    id: 'alex',
    name: 'Alex AlJEVbon',
    short: 'AlJEVbon',
    number: '23',
    color: '#939345',
    style: 'Slipstream hunter',
    risk: 1.01,
  },
];
export const DRIVER_IDS = DRIVERS.map((driver) => driver.id);
export const LEGACY_DRIVER_IDS = DRIVER_IDS.slice(0, 5);
export const MODEL_CHOICES = ['jev-latest'];
export const DEFAULT_PROMPT =
  'Race for position on an unknown circuit. Pass slower traffic on a clear lane and leave room for a car alongside. Use the road reading and closing speeds, not an unseen map. Manage battery and tire grip across the remaining laps. Contact damages the car. Recover if off track or facing away.';
const strategies = [
  'Attack early. When a slower car is within 18 m, take a clear side lane and deploy battery to complete the pass. Use attack pace on open exits, balanced through bends. Do not sit behind a slower car if a lane is open. Leave room alongside.',
  'Win through consistent exits. Run balanced through corners, attack when the road opens. Harvest while following; deploy for a clear pass or a close challenger. When tires drop below 60%, reduce unnecessary attacks.',
  'Prioritize corner exits. Set up a pass on a clear lane before a bend, use balanced pace through it, then attack and deploy on the exit. Save tires when no rival is within 20 m.',
  'Look for a pass at every gap. Choose whichever side is clear when closing on a car within 22 m. Attack and deploy while alongside; harvest only when boxed in or battery is below 20%. Never steer into an occupied lane.',
  'Keep the car intact in the opening lap, then attack. Follow with balanced pace and harvest until a clear passing lane appears. Deploy to finish a pass or during the final lap; use cautious only for tight corners or recovery.',
  'Save battery in the first half of the race. Use balanced pace and a clear lane to stay close. With one lap remaining, attack and deploy whenever grip and traffic permit. Avoid spending battery behind a blocked lane.',
  'Defend position. With a closing car behind, take one clear side lane early and deploy on the straight. Hold the lane when a car is alongside; do not weave. Attack an open exit and harvest when no rival is nearby.',
  'Build an energy advantage. Harvest through bends and while following, then use attack and deploy to pass on an open straight. Switch to neutral after clearing traffic. Keep tire grip for the final lap.',
  'Pressure the car ahead. Use attack pace up to the braking zone, a clear side lane to challenge, then balanced through the bend. Deploy while overtaking, neutral on open road, harvest when blocked. Avoid contact.',
  'Use the slipstream. Follow the center lane at balanced pace and harvest behind a rival, then pull into a clear side lane within 14 m and deploy to overtake. Attack on the final lap; leave room for cars alongside.',
];
export const validModel = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(value);
export function defaultSettings() {
  return {
    version: 1,
    prompt: DEFAULT_PROMPT,
    drivers: DRIVERS.map((d, i) => ({
      id: d.id,
      name: d.name,
      number: d.number,
      model: 'jev-latest',
      prompt: strategies[i],
    })),
  };
}
export function validSettings(value) {
  return (
    !!value &&
    value.version === 1 &&
    typeof value.prompt === 'string' &&
    value.prompt.length <= 2000 &&
    Array.isArray(value.drivers) &&
    [5, 10].includes(value.drivers.length) &&
    DRIVER_IDS.slice(0, value.drivers.length).every(
      (id) => value.drivers.filter((d) => d?.id === id).length === 1,
    ) &&
    value.drivers.every(
      (d) =>
        validModel(d.model) &&
        typeof d.prompt === 'string' &&
        d.prompt.length <= 1000 &&
        (d.name === undefined ||
          (typeof d.name === 'string' && d.name.trim().length > 0 && d.name.length <= 40)) &&
        (d.number === undefined || (typeof d.number === 'string' && /^\d{1,2}$/.test(d.number))),
    )
  );
}
export function cleanSettings(value) {
  if (!validSettings(value)) throw new Error('Invalid grid configuration.');
  return {
    version: 1,
    prompt: value.prompt,
    drivers: DRIVER_IDS.slice(0, value.drivers.length).map((id) => {
      const d = value.drivers.find((d) => d.id === id);
      const fallback = DRIVERS.find((driver) => driver.id === id);
      return {
        id,
        name: d.name?.trim() || fallback.name,
        number: d.number ?? fallback.number,
        model: d.model,
        prompt: d.prompt,
      };
    }),
  };
}
