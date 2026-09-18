import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveQueue } from '../src/save-queue.js';
const record = (duration = 1, id = 'a') => ({
  id,
  name: 'Race',
  duration,
  finished: false,
  frames: [{}],
  settings: {},
});
const flush = () => new Promise((r) => setImmediate(r));
function clock() {
  let time = 100000;
  const jobs = new Map();
  let next = 0;
  return {
    now: () => time,
    schedule: (fn, ms) => {
      jobs.set(++next, { fn, at: time + ms });
      return next;
    },
    cancel: (id) => jobs.delete(id),
    async advance(ms) {
      time += ms;
      for (const [id, job] of jobs) {
        if (job.at <= time) {
          jobs.delete(id);
          job.fn();
        }
      }
      await flush();
    },
  };
}
test('saves coalesce newer snapshots, preserve order, deduplicate, and wait between writes', async () => {
  const timer = clock(),
    writes = [];
  const queue = createSaveQueue({
    ...timer,
    write: async (r) => {
      writes.push(r.duration);
    },
  });
  await queue.enqueue(record());
  await queue.enqueue(record());
  assert.deepEqual(writes, [1]);
  const earlier = queue.enqueue(record(2));
  const later = queue.enqueue(record(3));
  assert.equal(earlier, later);
  await timer.advance(14999);
  assert.deepEqual(writes, [1]);
  await timer.advance(1);
  await later;
  assert.deepEqual(writes, [1, 3]);
  queue.dispose();
});
test('failed saves respect the server cooldown without automatically retrying', async () => {
  const timer = clock();
  let calls = 0;
  const queue = createSaveQueue({
    ...timer,
    write: async () => {
      calls++;
      throw Object.assign(new Error('Wait'), { retryAt: timer.now() + 120000 });
    },
  });
  await queue.enqueue(record());
  await timer.advance(60000);
  assert.equal(calls, 1);
  queue.enqueue(record(2));
  await timer.advance(59999);
  assert.equal(calls, 1);
  await timer.advance(1);
  assert.equal(calls, 2);
  queue.dispose();
});
