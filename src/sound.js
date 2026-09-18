import { filmShot, reelFrame, GRID_HOLD, WINNER_HOLD } from './showcase.js';

// Original synthesized effects. The same sample generator feeds the browser
// and exported video, so engine pitch and impacts follow recorded motion.
export function renderSoundtrack(record, sampleRate = 44100) {
  const hold = record.startDelay ?? GRID_HOLD;
  const length = Math.ceil((hold + record.duration + WINNER_HOLD) * sampleRate);
  const pcm = new Float32Array(length * 2);
  const frames = record.frames;
  let cursor = 0,
    phase = 0,
    noise = 81723,
    filtered = 0;
  const hits = (record.events || [])
    .filter((e) => e.text.startsWith('Contact between'))
    .map((e) => e.time + hold);
  let frequency = 110,
    level = 0.035,
    tire = 0,
    pan = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate,
      racing = Math.max(0, Math.min(record.duration, t - hold));
    if (i % 220 === 0) {
      while (cursor < frames.length - 1 && frames[cursor + 1].t <= racing) cursor++;
      const view = reelFrame(t, record.duration, hold);
      const shot = filmShot(record, racing, view.shot);
      const order = record.settings?.drivers || record.drivers;
      const leader = order.findIndex((c) => c.id === record.drivers[0].id);
      const index =
        t >= hold + record.duration || shot.driver === 'leader'
          ? Math.max(0, leader)
          : Math.min(shot.driver, order.length - 1);
      const a = frames[cursor].cars[index];
      const b = frames[Math.min(cursor + 1, frames.length - 1)].cars[index];
      const f = Math.max(
        0,
        Math.min(
          1,
          (racing - frames[cursor].t) /
            Math.max(0.001, (frames[cursor + 1]?.t ?? frames[cursor].t) - frames[cursor].t),
        ),
      );
      const speed = a[3] + (b[3] - a[3]) * f;
      const gear = Math.min(6, Math.floor(speed / 7) + 1);
      const rpm =
        t < hold
          ? 4400 + 1800 * Math.sin(t * 2.6) ** 2
          : a[15]
            ? 2500
            : 5000 + (speed - (gear - 1) * 7) * 780;
      frequency = Math.max(55, rpm / 60);
      level = a[15]
        ? 0.012
        : t >= hold + record.duration
          ? 0.018
          : 0.04 + Math.min(speed / 600, 0.05);
      tire = t > hold && speed > 12 ? Math.max(0, Math.abs(a[4]) - 0.5) * 0.02 : 0;
      pan = shot.angle * 0.25;
    }
    phase += (2 * Math.PI * frequency) / sampleRate;
    if (phase > Math.PI * 2) phase -= Math.PI * 2;
    noise = (1664525 * noise + 1013904223) >>> 0;
    const white = noise / 2147483648 - 1;
    filtered = filtered * 0.97 + white * 0.03;
    let sample =
      level *
        (Math.sin(phase) * 0.35 +
          Math.sin(phase * 2) * 0.3 +
          Math.sin(phase * 4) * 0.24 +
          Math.sin(phase * 8) * 0.1) +
      white * tire +
      filtered * 0.1;
    for (let light = 0; light < 5; light++) {
      const age = t - light * (hold >= 5 ? 1 : 0.5);
      if (age >= 0 && age < 0.11)
        sample += 0.1 * Math.sin(2 * Math.PI * 880 * age) * Math.sin((Math.PI * age) / 0.11);
    }
    const go = t - hold;
    if (go >= 0 && go < 0.26)
      sample += 0.1 * Math.sin(2 * Math.PI * 1320 * go) * Math.sin((Math.PI * go) / 0.26);
    for (const hit of hits) {
      const age = t - hit;
      if (age >= 0 && age < 0.18)
        sample += (white * 0.16 + Math.sin(age * 420) * 0.12) * Math.exp(-age * 28);
    }
    const victory = t - hold - record.duration;
    if (victory >= 0) {
      for (const [n, hz] of [660, 830.61, 987.77, 1320].entries()) {
        const age = victory - n * 0.16;
        if (age >= 0 && age < 1.6)
          sample += Math.sin(2 * Math.PI * hz * age) * 0.035 * Math.exp(-age * 2.6);
      }
      sample += filtered * Math.max(0, 0.25 * (1 - victory / 4));
    }
    const fade = Math.min(1, t / 0.035, (length / sampleRate - t) / 0.5);
    sample = Math.tanh(sample * 1.8) * Math.max(0, fade);
    pcm[i * 2] = sample * (1 - pan);
    pcm[i * 2 + 1] = sample * (1 + pan);
  }
  return pcm;
}

export class RaceSound {
  constructor() {
    this.enabled = false;
    this.muted = false;
    this.record = null;
    this.source = null;
  }
  async unlock() {
    this.context ??= new AudioContext();
    await this.context.resume();
    this.enabled = true;
  }
  stop() {
    this.source?.stop();
    this.source = null;
    this.record = null;
  }
  setFilm(record, offset = 0) {
    if (!this.enabled || !this.context) return;
    this.stop();
    const pcm = renderSoundtrack(record, this.context.sampleRate);
    const buffer = this.context.createBuffer(2, pcm.length / 2, this.context.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = pcm[i * 2 + ch];
    }
    this.source = this.context.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.source.connect(this.context.destination);
    this.source.start(0, offset % buffer.duration);
    this.record = record;
  }
  async toggle() {
    if (this.enabled) {
      this.enabled = false;
      this.muted = true;
      this.stop();
    } else {
      this.muted = false;
      await this.unlock();
    }
  }
}
