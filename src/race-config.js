export const DRIVERS = [
  {
    id: 'max',
    name: 'Max JEVstappen',
    short: 'JEVstappen',
    number: '01',
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
    number: '04',
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
];
export const DRIVER_IDS = ['max', 'lewis', 'charles', 'lando', 'franco'];
export const MODEL_CHOICES = ['jev-latest'];
export const DEFAULT_PROMPT =
  'Finish the race on the road. Choose a pace for the visible bend and traffic; use the center lane unless passing on a clear side. Recover at low speed if off track or facing away. Never assume an unseen turn.';
const strategies = [
  'Attack on clear straights and corner exits. Use a clear side lane to pass. Return to balanced pace before a bend; recover immediately if off track.',
  'Favor balanced pace and the center lane. Use cautious pace for tight bends or close traffic. Pass only with a clear side lane; recover if off track.',
  'Use cautious pace through tight bends and balanced pace elsewhere. Stay near the center and attack only on a clear straight. Recover if off track.',
  'Pass slower cars using whichever side lane is clear. Attack when aligned with open road, balanced through bends, cautious in traffic. Recover if off track.',
  'Favor cautious pace near bends and traffic. Use balanced pace on clear road, keep the center lane, and pass only with ample space. Recover if off track.',
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
    value.drivers.length === 5 &&
    DRIVER_IDS.every((id) => value.drivers.filter((d) => d?.id === id).length === 1) &&
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
    drivers: DRIVER_IDS.map((id) => {
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
