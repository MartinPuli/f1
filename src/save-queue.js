// Keep only the newest unsent snapshot of each race, with one request in flight.
export function createSaveQueue({
  write,
  onState = () => {},
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
  interval = 15000,
}) {
  const pending = new Map(),
    saved = new Map();
  let active = null,
    nextAt = 0,
    timer = null;
  const signature = (r) =>
    JSON.stringify([r.id, r.name, r.duration, r.finished, r.frames.length, r.settings]);
  const report = (message) => onState({ saving: !!active || pending.size > 0, message });
  const pump = async () => {
    if (active || !pending.size) return;
    if (now() < nextAt) {
      if (!timer)
        timer = schedule(() => {
          timer = null;
          pump();
        }, nextAt - now());
      return;
    }
    const [id, entry] = pending.entries().next().value;
    pending.delete(id);
    active = { id, ...entry };
    nextAt = now() + interval;
    report('Saving…');
    try {
      await write(entry.record);
      if (saved.size >= 50) saved.delete(saved.keys().next().value);
      saved.set(id, entry.signature);
      entry.resolve();
      active = null;
      report(pending.size ? 'Saving…' : 'Saved');
    } catch (error) {
      nextAt = Math.max(nextAt, error.retryAt || now() + 60000);
      entry.resolve();
      active = null;
      report(error.message || 'Could not save. Download your recording.');
    }
    pump();
  };
  return {
    enqueue(record) {
      const key = signature(record);
      if (saved.get(record.id) === key) return Promise.resolve();
      if (active?.id === record.id && active.signature === key) return active.promise;
      const existing = pending.get(record.id);
      if (existing) {
        existing.record = record;
        existing.signature = key;
        return existing.promise;
      }
      if (pending.size >= 5) {
        report('Too many pending saves. Download this recording.');
        return Promise.resolve();
      }
      let resolve;
      const promise = new Promise((r) => (resolve = r));
      pending.set(record.id, { record, signature: key, promise, resolve });
      report('Saving…');
      pump();
      return promise;
    },
    dispose() {
      if (timer) cancel(timer);
      for (const entry of pending.values()) entry.resolve();
      pending.clear();
    },
  };
}
