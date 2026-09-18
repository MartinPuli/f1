import { archiveApi, boundedJson, communityApi } from './archive.js';
import { LINES, PACES, POWERS, validIntent, roadReading } from '../src/driving.js';
import { DRIVER_IDS, defaultSettings, validSettings, validModel } from '../src/race-config.js';
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
const rules =
  'You race on an unknown circuit. Use only this local observation and your own memory. Choose a target for the next 0.5 simulation seconds. A shared controller follows the chosen lane and pace, with steering and grip limits. Left and right mean road lanes, not wheel direction. Recover when off track or facing away; the controller slowly returns to the center. No circuit map or other driver memory is available.';
function upstreamError(status) {
  if (status === 401 || status === 403)
    return json({ error: 'TypeSafe rejected the key. Check your connection.' }, 401);
  if (status === 429) return json({ error: 'TypeSafe rate limit reached. Wait and resume.' }, 429);
  if (status === 400 || status === 404 || status === 422)
    return json({ error: 'TypeSafe rejected the model or configuration. Check your grid.' }, 400);
  return json({ error: 'TypeSafe is unavailable. Try again.' }, 502);
}
class UpstreamFailure extends Error {
  constructor(status) {
    super('Upstream request failed');
    this.status = status;
  }
}
export async function api(request, env = {}) {
  const url = new URL(request.url),
    path = url.pathname;
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'Origin not allowed.' }, 403);
  if (path.startsWith('/api/community')) return communityApi(request, env);
  if (path.startsWith('/api/races')) return archiveApi(request, env);
  if (path === '/api/status') return json({ byok: true });
  if (!['/api/decide', '/api/models'].includes(path)) return json({ error: 'Not found.' }, 404);
  if (request.method !== (path === '/api/models' ? 'GET' : 'POST'))
    return json({ error: 'Method not allowed.' }, 405);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    return json({ error: 'Use HTTPS to connect your key.' }, 400);
  const key = request.headers.get('authorization')?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!key || key.length > 512) return json({ error: 'Add your TypeSafe API key.' }, 401);
  try {
    if (path === '/api/models') {
      const response = await fetch('https://api.typesafe.ai/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
        redirect: 'error',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
      });
      if (!response.ok) return upstreamError(response.status);
      const data = await boundedJson(response, 256000),
        list = Array.isArray(data) ? data : data.models;
      if (!Array.isArray(list))
        return json({ error: 'TypeSafe returned an invalid model list.' }, 502);
      return json({
        models: list
          .filter((m) => validModel(m?.name))
          .slice(0, 100)
          .map((m) => ({ name: m.name })),
      });
    }
    let body;
    try {
      body = await boundedJson(request, 60000);
    } catch {
      return json({ error: 'Invalid or oversized request.' }, 400);
    }
    if (!Array.isArray(body?.states) || body.states.length < 1 || body.states.length > 10)
      return json({ error: 'Provide 1 to 10 observations.' }, 400);
    const states = body.states,
      settings = body.settings ?? defaultSettings(),
      ids = body.driverIds ?? DRIVER_IDS.slice(0, states.length);
    if (
      !validSettings(settings) ||
      !Array.isArray(ids) ||
      ids.length !== states.length ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => settings.drivers.some((driver) => driver.id === id))
    )
      return json({ error: 'Invalid grid configuration.' }, 400);
    if (key.length >= 12 && JSON.stringify(settings).includes(key))
      return json({ error: 'Keep your API key out of prompts.' }, 400);
    for (const s of states)
      if (
        !s ||
        !Number.isFinite(s.speed_mps) ||
        !Array.isArray(s.visible_road) ||
        s.visible_road.length !== 5 ||
        !s.visible_road.every((p) => p && Number.isFinite(p.right) && Number.isFinite(p.forward))
      )
        return json({ error: 'Invalid observation.' }, 400);
    const controller = new AbortController();
    const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(12000)]);
    const decisions = await Promise.all(
      states.map(async (state, i) => {
        const driver = settings.drivers.find((d) => d.id === ids[i]);
        const response = await fetch('https://api.typesafe.ai/v1/systemone', {
          method: 'POST',
          redirect: 'error',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            model: driver.model,
            state: JSON.stringify({
              ...cleanObservation(state),
              road: roadReading(cleanObservation(state)),
            }),
            questions: {
              power: {
                type: 'choice',
                instructions: {
                  question:
                    'Spend, preserve, or recharge battery now? Deploy to finish a pass, defend from a closing rival, or push on the final lap. Harvest when blocked or saving for later. Follow this driver strategy and the actual battery level.',
                  rules,
                  race: settings.prompt,
                  driver: driver.prompt,
                },
                criteria: POWERS,
              },
              line: {
                type: 'choice',
                instructions: {
                  question:
                    'Which lane advances this driver strategy? Use road.lanes and closing speeds to pass a slower car on a clear side. Defend early if the driver wants it; hold your lane alongside another car. Choose center for recovery or a deliberate slipstream tow.',
                  rules,
                  race: settings.prompt,
                  driver: driver.prompt,
                },
                criteria: LINES,
              },
              pace: {
                type: 'choice',
                instructions: {
                  question:
                    'Which pace advances the driver strategy given tire grip and local traffic? Attack to pass or close a gap; the controller still brakes for corners. Balanced conserves grip. Cautious gives extra margin for damage or tight traffic. Recover only when off track or facing away.',
                  rules,
                  race: settings.prompt,
                  driver: driver.prompt,
                },
                criteria: PACES,
              },
            },
          }),
        });
        if (!response.ok) throw new UpstreamFailure(response.status);
        const data = await boundedJson(response, 256000);
        const line = data.answers?.line,
          pace = data.answers?.pace,
          power = data.answers?.power;
        const intent = { line: line?.choice, pace: pace?.choice, power: power?.choice };
        if (!validIntent(intent) || !Object.hasOwn(POWERS, intent.power))
          throw new Error('Invalid decision');
        return {
          ...intent,
          confidence:
            Number.isFinite(line.confidence) &&
            Number.isFinite(pace.confidence) &&
            Number.isFinite(power.confidence)
              ? Math.min(line.confidence, pace.confidence, power.confidence)
              : null,
          model: validModel(data.model) ? data.model : driver.model,
        };
      }),
    ).catch((error) => {
      controller.abort();
      throw error;
    });
    return json({ decisions });
  } catch (e) {
    if (e instanceof UpstreamFailure) return upstreamError(e.status);
    return json(
      {
        error:
          e.name === 'TimeoutError'
            ? 'TypeSafe timed out. Try again.'
            : 'Could not complete the TypeSafe request. Try again.',
      },
      502,
    );
  }
}

// Drop extra fields and bound the observation sent to the paid endpoint.
export function cleanObservation(s) {
  const number = (v, min, max, fallback = 0) =>
    Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  return {
    speed_mps: number(s.speed_mps, 0, 60),
    heading_error: number(s.heading_error, -Math.PI, Math.PI),
    road_width_m: number(s.road_width_m, 1, 30, 10),
    lateral_offset_m: number(s.lateral_offset_m, -500, 500),
    visible_road: s.visible_road.map((p) => ({
      distance: number(p.distance, 0, 42),
      right: number(p.right, -500, 500),
      forward: number(p.forward, -500, 500),
    })),
    nearby_cars: (Array.isArray(s.nearby_cars) ? s.nearby_cars : []).slice(0, 9).map((p) => ({
      right: number(p?.right, -42, 42),
      forward: number(p?.forward, -42, 42),
      speed_mps: number(p?.speed_mps, 0, 60),
    })),
    lap: number(s.lap, 1, 5, 1),
    laps_remaining: number(s.laps_remaining, 1, 5, 1),
    position: number(s.position, 1, 10, 1),
    battery: number(s.battery, 0, 1, 1),
    tire_grip: number(s.tire_grip, 0.35, 1, 1),
    damage: number(s.damage, 0, 0.7),
    off_track: s.off_track === true,
    elapsed_seconds: number(s.elapsed_seconds, 0, 501),
    memory: (Array.isArray(s.memory) ? s.memory : []).slice(-8).map((m) => ({
      speed: number(m?.speed, 0, 60),
      heading_error: number(m?.heading_error, -Math.PI, Math.PI),
      off_track: m?.off_track === true,
      action: typeof m?.action === 'string' ? m.action.slice(0, 40) : '',
    })),
  };
}
