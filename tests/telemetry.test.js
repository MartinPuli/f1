import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decisionActivity,
  cleanDecisionLog,
  validDecisionLog,
  timingGap,
} from '../src/telemetry.js';
import { Race } from '../src/simulation.js';
import { recordRace, applyReplay } from '../src/recording.js';
import { validRecord, cleanRecord } from '../src/recording-schema.js';
import { renderSoundtrack } from '../src/sound.js';
const answer = { id: 'max', line: 'left', pace: 'attack', power: 'deploy', confidence: 0.9 };
test('request activity is causal, bounded and excludes credentials', () => {
  const log = [
    { t: -4, sent: -5, ms: 1000, answers: [{ ...answer, apiKey: 'secret' }], headers: 'secret' },
    { t: 2, answers: [{ ...answer, line: 'right' }] },
  ];
  assert.ok(validDecisionLog(log));
  assert.equal(decisionActivity(log, -5, 'max').count, 0);
  assert.equal(decisionActivity(log, 0, 'max').count, 1);
  assert.equal(decisionActivity(log, 3, 'max').selected.line, 'right');
  assert.equal(decisionActivity(log, 1.99999999999999, 'max').count, 2);
  assert.ok(!JSON.stringify(cleanDecisionLog(log)).includes('secret'));
  assert.equal(validDecisionLog([{ ...log[0], ms: Infinity }]), false);
  assert.equal(validDecisionLog([{ t: 2, answers: [{ ...answer, id: 'unknown' }] }]), false);
});
test('time gaps use recorded crossings and exact finish differences', () => {
  const a = { progress: 20 },
    b = { progress: 10 };
  const r = {
    cars: [a, b],
    time: 3,
    frames: [
      { t: 0, cars: [[0, 0, 0, 0, 0, 0]] },
      { t: 2, cars: [[0, 0, 0, 0, 0, 20]] },
    ],
  };
  assert.equal(timingGap(r, b, a), 2);
  a.finished = b.finished = true;
  a.finishTime = 10;
  b.finishTime = 12.315;
  assert.ok(Math.abs(timingGap(r, b, a) - 2.315) < 1e-9);
});
test('controlled faults produce contact and one DNF without trapping the other cars; replay retains it', () => {
  for (const seed of [42, 8912, 108]) {
    const race = new Race(seed);
    race.limit = 2;
    race.incidents = true;
    race.running = true;
    for (let i = 0; i < 1300 && !race.finished; i++) race.tick(0.1);
    assert.ok(race.finished, `${seed}: completed`);
    assert.equal(race.cars.filter((c) => c.finished).length, 9);
    assert.equal(race.cars.filter((c) => c.retired).length, 1);
    assert.ok(race.cars.reduce((n, c) => n + c.collisions, 0) > 0);
    assert.ok(race.events.some((e) => e.text.startsWith('Curb strike')));
    race.captureFrame();
    const record = recordRace(
      race,
      '11111111-1111-4111-8111-111111111111',
      'Incident race',
      Date.now(),
    );
    assert.ok(validRecord(record));
    const replay = new Race(seed);
    applyReplay(replay, cleanRecord(record), record.duration);
    assert.equal(replay.cars.filter((c) => c.retired).length, 1);
    assert.equal(record.drivers.at(-1).retirement, 'Engine overheating');
  }
});
test('synthetic soundtrack has finite stereo samples, audible effects and no clipping', () => {
  const race = new Race();
  race.startDuration = 0.5;
  race.time = 1;
  race.captureFrame();
  const record = recordRace(race, '11111111-1111-4111-8111-111111111111', 'Audio test', Date.now());
  const pcm = renderSoundtrack(record, 8000);
  assert.equal(pcm.length, Math.ceil((0.5 + 1 + 4) * 8000) * 2);
  let peak = 0;
  for (const sample of pcm) {
    assert.ok(Number.isFinite(sample));
    peak = Math.max(peak, Math.abs(sample));
  }
  assert.ok(peak > 0.05 && peak < 1);
});

test('selected driver response metadata stays causal and preserves probabilities', () => {
  const log = [
    {
      t: 1,
      ms: 123,
      answers: [
        {
          ...answer,
          response: {
            line: {
              choice: 'left',
              confidence: 0.8,
              probabilities: { left: 0.8, center: 0.1, right: 0.1 },
            },
          },
        },
      ],
    },
    { t: 2, ms: 300, answers: [{ ...answer, id: 'lewis' }] },
  ];
  const activity = decisionActivity(log, 2, 'max');
  assert.equal(activity.selectedBatch.ms, 123);
  assert.equal(activity.history.length, 1);
  assert.equal(decisionActivity(log, 0, 'max').selected, null);
  assert.equal(cleanDecisionLog(log)[0].answers[0].response.line.probabilities.left, 0.8);
  assert.equal(validDecisionLog(log), true);
  log[0].answers[0].response.line.probabilities.left = 1.1;
  assert.equal(validDecisionLog(log), false);
});

test('Jev activity distinguishes sent, pending, received and failed requests at replay time', async () => {
  const { requestActivity } = await import('../src/telemetry.js');
  const log = [
    { sent: 1, t: 2, ms: 500, answers: [answer] },
    { sent: 3, t: 4, ms: 800, failed: true, calls: 2, answers: [] },
  ];
  const pending = requestActivity(log, 1.5);
  assert.equal(pending.sent, 1);
  assert.equal(pending.replies, 0);
  assert.equal(pending.inFlight, 1);
  const done = requestActivity(log, 4.5, { sent: 4.2, calls: 3 });
  assert.equal(done.sent, 6);
  assert.equal(done.replies, 1);
  assert.equal(done.failed, 2);
  assert.equal(done.inFlight, 3);
  assert.equal(
    done.sentBins.reduce((a, b) => a + b, 0),
    6,
  );
  assert.equal(
    done.replyBins.reduce((a, b) => a + b, 0),
    1,
  );
  assert.ok(validDecisionLog(cleanDecisionLog(log)));
  assert.equal(
    requestActivity(log, 20).sentBins.reduce((a, b) => a + b, 0),
    0,
  );
});
