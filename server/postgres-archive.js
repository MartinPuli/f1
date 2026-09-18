// query accepts SQL and separate parameters. Neither prompts nor IDs become SQL text.
export function postgresArchive(query) {
  return {
    async list(owner) {
      const rows = await query(
        'SELECT metadata FROM jevrace_races WHERE owner = $1 ORDER BY created DESC LIMIT 50',
        [owner],
      );
      return rows.map((r) => r.metadata);
    },
    async get(owner, id) {
      const rows = await query('SELECT recording FROM jevrace_races WHERE owner = $1 AND id = $2', [
        owner,
        id,
      ]);
      return rows[0]?.recording ?? null;
    },
    async put(owner, record) {
      const { frames, ...metadata } = record;
      const rows = await query('SELECT save_jevrace($1, $2, $3, $4::jsonb, $5::jsonb) AS saved', [
        owner,
        record.id,
        record.created,
        JSON.stringify(metadata),
        JSON.stringify(record),
      ]);
      if (!rows[0]?.saved) {
        const error = new Error('Archive full. Delete a saved race and retry.');
        error.code = 'ARCHIVE_FULL';
        throw error;
      }
    },
    async remove(owner, id) {
      await query('DELETE FROM jevrace_races WHERE owner = $1 AND id = $2', [owner, id]);
    },
    async prune() {
      await query("DELETE FROM jevrace_races WHERE updated_at < now() - interval '90 days'", []);
      await query(
        'DELETE FROM jevrace_limits WHERE window_start < extract(epoch from now()) - 86400',
        [],
      );
    },
    async allow(bucket, limit, seconds, now = Date.now()) {
      const start = Math.floor(now / (seconds * 1000)) * seconds;
      const rows = await query(
        `INSERT INTO jevrace_limits(bucket, window_start, count) VALUES($1, $2, 1)
        ON CONFLICT(bucket) DO UPDATE SET window_start = excluded.window_start,
        count = CASE WHEN jevrace_limits.window_start <> excluded.window_start THEN 1 ELSE jevrace_limits.count + 1 END
        WHERE jevrace_limits.window_start <> excluded.window_start OR jevrace_limits.count < $3
        RETURNING count`,
        [bucket, start, limit],
      );
      return rows.length > 0;
    },
  };
}
