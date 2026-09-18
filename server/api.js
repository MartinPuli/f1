import { archiveApi, boundedJson } from './archive.js';
import { ACTIONS } from '../src/simulation.js';
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
  'You drive a race car on an unknown closed circuit. Choose one action for the next 0.25 simulation seconds. You only know the supplied local observation. Right is positive to your right; forward is positive ahead. Road points are centerline samples in car-relative meters. Positive heading_error means turn right. Negative means left. Steering is normalized [-1,1] times 0.42 radians, wheelbase 3.1 m. Grip allows at most 18 m/s² lateral acceleration. Use your recent observations. Do not assume knowledge of unseen track.';
const criteria = {
  push_left: 'Accelerate, gentle left steering (-0.30).',
  push_straight: 'Accelerate, straight steering.',
  push_right: 'Accelerate, gentle right steering (+0.30).',
  coast_left: 'Coast, medium left steering (-0.38).',
  coast_straight: 'Coast, steering centered.',
  coast_right: 'Coast, medium right steering (+0.38).',
  brake_left: 'Brake strongly and turn left (-0.50).',
  brake_straight: 'Brake strongly, steering centered.',
  brake_right: 'Brake strongly and turn right (+0.50).',
  sharp_left: 'Slow tight left turn (-0.80).',
  sharp_right: 'Slow tight right turn (+0.80).',
};
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
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return upstreamError(response.status);
      const data = await response.json(),
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
    if (!Array.isArray(body?.states) || body.states.length < 1 || body.states.length > 5)
      return json({ error: 'Provide 1 to 5 observations.' }, 400);
    const states = body.states,
      settings = body.settings ?? defaultSettings(),
      ids = body.driverIds ?? DRIVER_IDS.slice(0, states.length);
    if (
      !validSettings(settings) ||
      !Array.isArray(ids) ||
      ids.length !== states.length ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => DRIVER_IDS.includes(id))
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
    const decisions = await Promise.all(
      states.map(async (state, i) => {
        const driver = settings.drivers.find((d) => d.id === ids[i]);
        const response = await fetch('https://api.typesafe.ai/v1/systemone', {
          method: 'POST',
          redirect: 'error',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            model: driver.model,
            state: JSON.stringify(state),
            questions: {
              drive: {
                type: 'choice',
                instructions: { rules, race: settings.prompt, driver: driver.prompt },
                criteria,
              },
            },
          }),
        });
        if (!response.ok) throw new UpstreamFailure(response.status);
        const data = await response.json(),
          a = data.answers?.drive;
        if (!a || !Object.hasOwn(ACTIONS, a.choice)) throw new Error('Invalid decision');
        return {
          choice: a.choice,
          confidence: Number.isFinite(a.confidence) ? a.confidence : null,
          model: validModel(data.model) ? data.model : driver.model,
        };
      }),
    );
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
