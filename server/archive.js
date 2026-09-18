import { validRecord, cleanRecord } from '../src/recording-schema.js';
export { validRecord, cleanRecord } from '../src/recording-schema.js';
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
export async function boundedJson(request, max = 3500000, timeoutMs = 5000) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body.');
  let timer;
  const read = async () => {
    let length = 0;
    const parts = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) {
        await reader.cancel();
        throw new Error('Request is too large.');
      }
      parts.push(value);
    }
    const raw = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      raw.set(part, offset);
      offset += part.length;
    }
    return JSON.parse(new TextDecoder().decode(raw));
  };
  try {
    return await Promise.race([
      read(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Request body timed out.'));
          reader.cancel().catch(() => {});
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function store(env) {
  if (env.ARCHIVE) return env.ARCHIVE;
  if (env.LOCAL_ARCHIVE) return env.LOCAL_ARCHIVE;
  if (!env.DB || !env.BUCKET)
    throw new Error('Archive unavailable. You can still download this race.');
  return {
    async list(owner) {
      const { results } = await env.DB.prepare(
        'SELECT metadata FROM races WHERE owner = ? ORDER BY created DESC LIMIT 50',
      )
        .bind(owner)
        .all();
      return results.map((r) => JSON.parse(r.metadata));
    },
    async get(owner, id) {
      const row = await env.DB.prepare('SELECT recording FROM races WHERE owner = ? AND id = ?')
        .bind(owner, id)
        .first();
      if (!row) return null;
      const object = await env.BUCKET.get(row.recording);
      return object ? object.json() : null;
    },
    async put(owner, r) {
      const old = await env.DB.prepare('SELECT owner FROM races WHERE id = ?').bind(r.id).first();
      if (old && old.owner !== owner) throw new Error('Race ID unavailable.');
      const { frames, ...meta } = r;
      const key = `races/${encodeURIComponent(owner)}/${r.id}/${crypto.randomUUID()}.json`;
      await env.BUCKET.put(key, JSON.stringify(r), {
        httpMetadata: { contentType: 'application/json' },
      });
      const previous = await env.DB.prepare(
        'SELECT recording FROM races WHERE owner = ? AND id = ?',
      )
        .bind(owner, r.id)
        .first();
      try {
        await env.DB.prepare(
          'INSERT INTO races (id,owner,name,created,metadata,recording) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,metadata=excluded.metadata,recording=excluded.recording WHERE races.owner=excluded.owner',
        )
          .bind(r.id, owner, r.name, r.created, JSON.stringify(meta), key)
          .run();
      } catch (e) {
        await env.BUCKET.delete(key);
        throw e;
      }
      if (previous) await env.BUCKET.delete(previous.recording);
    },
    async remove(owner, id) {
      const row = await env.DB.prepare('SELECT recording FROM races WHERE owner = ? AND id = ?')
        .bind(owner, id)
        .first();
      if (!row) return;
      await env.DB.prepare('DELETE FROM races WHERE owner = ? AND id = ?').bind(owner, id).run();
      await env.BUCKET.delete(row.recording);
    },
  };
}
export async function archiveApi(request, env) {
  const owner =
    env.ARCHIVE_OWNER || env.LOCAL_OWNER || request.headers.get('oai-authenticated-user-id');
  if (!owner) return json({ error: 'Sign in to save or view your races.' }, 401);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: 'Origin not allowed.' }, 403);
  const path = new URL(request.url).pathname;
  const id = path.split('/')[3];
  const publishing = path.endsWith('/publish');
  if (id && !/^[a-f0-9-]{36}$/.test(id)) return json({ error: 'Invalid race ID.' }, 400);
  try {
    const db = store(env);
    if (publishing && request.method === 'POST') {
      if (!db.publish)
        return json({ error: 'Sharing is available on the Vercel deployment.' }, 503);
      const data = await boundedJson(request, 100);
      if (typeof data.published !== 'boolean') return json({ error: 'Choose a visibility.' }, 400);
      const publicId = await db.publish(owner, id, data.published);
      return publicId
        ? json({ published: data.published, id: publicId })
        : json({ error: 'Save a finished race before publishing.' }, 409);
    }
    if (request.method === 'GET') {
      if (!id) return json({ races: await db.list(owner) });
      const race = await db.get(owner, id);
      return race ? json(race) : json({ error: 'Race not found.' }, 404);
    }
    if (request.method === 'POST' && !id) {
      let data;
      try {
        data = await boundedJson(request);
        if (!validRecord(data)) return json({ error: 'Invalid race recording.' }, 400);
      } catch {
        return json({ error: 'Invalid or oversized recording.' }, 400);
      }
      const r = cleanRecord(data);
      await db.put(owner, r);
      return json({ saved: true, id: r.id });
    }
    if (request.method === 'DELETE' && id) {
      await db.remove(owner, id);
      return json({ deleted: true });
    }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (e) {
    if (e.code === 'ARCHIVE_FULL')
      return json({ error: 'Archive full. Delete a saved race and retry.' }, 409);
    return json(
      { error: 'The race archive is unavailable. Try again or download your recording.' },
      503,
    );
  }
}

export async function communityApi(request, env) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  const id = new URL(request.url).pathname.split('/')[3];
  if (id && !/^[a-f0-9-]{36}$/.test(id)) return json({ error: 'Invalid race ID.' }, 400);
  try {
    const db = store(env);
    if (!db.community)
      return json({ error: 'Community replays are available on the Vercel deployment.' }, 503);
    if (!id) return json({ races: await db.community() });
    const record = await db.publicRace(id);
    return record ? json(record) : json({ error: 'This replay is no longer public.' }, 404);
  } catch {
    return json({ error: 'Community replays are unavailable. Try again later.' }, 503);
  }
}
