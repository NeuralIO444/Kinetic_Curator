// #1459 — discrete audio detections: onsets, tempo, energy level, silence, input; driven by synthetic signals.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createAudioEventDetector,
  estimateTempo,
  BANDS,
  REFRACTORY_MS,
  SILENCE_MS,
  TEMPO_STEP,
} from './audioEvents.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const FRAME = 1000 / 60;
const flat = (v) => Object.fromEntries(BANDS.map((k) => [k, v]));
/** Frames of a signal: fn(tMs) -> bands | null. Returns every event with its time. */
function play(fn, ms, { source = 'mic', start = 0, det = createAudioEventDetector() } = {}) {
  const evs = [];
  for (let t = start; t <= start + ms; t += FRAME)
    for (const e of det.update(t, fn(t - start), { source })) evs.push({ t, ...e });
  return { evs, det };
}
/** A kick drum: a bass-heavy pulse at `bpm`, decaying over ~90 ms, on a quiet bed. */
const kick =
  (bpm, bed = 0.06) =>
  (t) => {
    const period = 60000 / bpm;
    const ph = t % period;
    const hit = ph < 90 ? 1 - ph / 90 : 0;
    return {
      ...flat(bed),
      sub: Math.min(1, bed + 0.8 * hit),
      bass: Math.min(1, bed + 0.9 * hit),
      mud: Math.min(1, bed + 0.3 * hit),
    };
  };

ok('a 120 BPM kick train: one onset per hit, named for the band that rose, and a tempo near 120', () => {
  const { evs } = play(kick(120), 12000);
  const onsets = evs.filter((e) => e.type === 'onset');
  assert.ok(onsets.length >= 20 && onsets.length <= 26, `about 24 hits in 12 s (${onsets.length})`);
  assert.ok(
    onsets.filter((o) => o.band === 'bass' || o.band === 'sub').length / onsets.length > 0.9,
    'the hits are bass hits',
  );
  for (let i = 1; i < onsets.length; i++) assert.ok(onsets[i].t - onsets[i - 1].t >= REFRACTORY_MS, 'refractory held');
  const tempos = evs.filter((e) => e.type === 'tempo');
  assert.ok(tempos.length >= 1, 'a tempo was published');
  const last = tempos[tempos.length - 1];
  assert.ok(Math.abs(last.bpm - 120) <= 3, `tempo ${last.bpm}`);
  assert.ok(last.confidence >= 0.6, `confidence ${last.confidence}`);
});

ok('steady noise and a held tone make no onsets (a wall of sound is not a hit)', () => {
  let s = 12345;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const noise = () => Object.fromEntries(BANDS.map((k) => [k, 0.3 + 0.01 * (rnd() - 0.5)]));
  const { evs } = play(noise, 6000);
  assert.equal(evs.filter((e) => e.type === 'onset').length, 0);
  const tone = play(() => ({ ...flat(0.05), mids: 0.7 }), 4000);
  assert.equal(tone.evs.filter((e) => e.type === 'onset').length <= 1, true, 'at most the attack of the tone');
});

ok('the tempo estimate follows a change but is published only when it moves by more than the step', () => {
  const det = createAudioEventDetector();
  const a = play(kick(100), 10000, { det });
  const b = play(kick(140), 12000, { det, start: 10000 + FRAME });
  const tempos = [...a.evs, ...b.evs].filter((e) => e.type === 'tempo');
  for (let i = 1; i < tempos.length; i++)
    assert.ok(Math.abs(tempos[i].bpm - tempos[i - 1].bpm) > TEMPO_STEP, 'each publish moved > step');
  assert.ok(Math.abs(tempos[0].bpm - 100) <= 4, `first near 100 (${tempos[0].bpm})`);
  assert.ok(Math.abs(tempos[tempos.length - 1].bpm - 140) <= 5, `last near 140 (${tempos[tempos.length - 1].bpm})`);
});

ok('half-time and double-time hit patterns fold into one tempo range (a 60 BPM kick reads 120)', () => {
  const t = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000];
  const est = estimateTempo(t);
  assert.ok(est && Math.abs(est.bpm - 120) <= 1, `${est && est.bpm}`);
  assert.equal(estimateTempo([0, 500, 1000]), null, 'too few hits: no estimate');
});

ok('energy: low / mid / high with hysteresis; a level jittering at a threshold does not flicker', () => {
  const det = createAudioEventDetector();
  const evs = [];
  const feed = (v, ms, start) => {
    for (let t = start; t < start + ms; t += FRAME) for (const e of det.update(t, flat(v), {})) evs.push(e);
    return start + ms;
  };
  let t = feed(0.05, 1500, 0);
  t = feed(0.25, 1500, t);
  t = feed(0.6, 1500, t);
  const seq = evs.filter((e) => e.type === 'energy').map((e) => e.level);
  assert.deepEqual(seq, ['low', 'mid', 'high']);
  const before = evs.length;
  for (let i = 0; i < 400; i++) {
    for (const e of det.update(t, flat(0.4 + (i % 2 ? 0.015 : -0.015)), {})) evs.push(e);
    t += FRAME;
  }
  assert.ok(evs.slice(before).filter((e) => e.type === 'energy').length <= 1, 'no flicker at the HIGH threshold');
});

ok('silence: after SILENCE_MS of quiet it starts, and when sound returns it ends with how long it lasted', () => {
  const { evs, det } = play((t) => (t < 3000 ? flat(0.4) : flat(0)), 9000);
  const starts = evs.filter((e) => e.type === 'silenceStart');
  assert.equal(starts.length, 1);
  assert.ok(
    starts[0].t >= 3000 + SILENCE_MS - 400 && starts[0].t <= 3000 + SILENCE_MS + 900,
    `start at ${starts[0].t}`,
  );
  const back = play(() => flat(0.5), 1500, { det, start: 9000 + FRAME });
  const ends = back.evs.filter((e) => e.type === 'silenceEnd');
  assert.equal(ends.length, 1);
  assert.ok(ends[0].ms > 5000, `it lasted ${ends[0].ms} ms`);
  assert.equal(
    evs.filter((e) => e.type === 'silenceStart').length + back.evs.filter((e) => e.type === 'silenceStart').length,
    1,
    'one start per silence',
  );
});

ok('input: mic, file and none are reported when the source changes, and only then', () => {
  const det = createAudioEventDetector();
  const seq = [];
  const feed = (bands, source, t) => {
    for (const e of det.update(t, bands, { source })) if (e.type === 'input') seq.push(e.source);
  };
  feed(null, 'none', 0);
  feed(null, 'none', 16);
  feed(flat(0.2), 'mic', 32);
  feed(flat(0.2), 'mic', 48);
  feed(flat(0.2), 'file', 64);
  feed(null, 'none', 80);
  assert.deepEqual(seq, ['none', 'mic', 'file', 'none']);
});

ok('deterministic: the same samples give the same events, byte for byte; junk input is ignored', () => {
  const a = JSON.stringify(play(kick(128), 8000).evs);
  const b = JSON.stringify(play(kick(128), 8000).evs);
  assert.equal(a, b);
  const det = createAudioEventDetector();
  assert.deepEqual(det.update(NaN, flat(0.5), {}), []);
  assert.doesNotThrow(() => det.update(10, { sub: 'x', bass: NaN, mud: Infinity }, {}));
});

ok('pure: no wall clock, timers or DOM', () => {
  const src = readFileSync(new URL('./audioEvents.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(
    !/Date\.now|performance\.now|setTimeout|setInterval|requestAnimationFrame|AudioContext|Math\.random|document|window/.test(
      src,
    ),
  );
});

console.log(`audioEvents.selfcheck: ${n} checks passed`);
