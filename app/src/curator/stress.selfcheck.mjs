// node src/curator/stress.selfcheck.mjs
// #1354 — stress, bands, smoothing, hysteresis. One check per behaviour the roadmap decided.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STRESS_WEIGHTS, stressValue, tastePressure, activityPressure, bandFor, quantizeStress, createStressTracker,
  BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN, BANDS, RELAX_BELOW, TIGHTEN_ABOVE, HYSTERESIS_GAP,
  passShare, tasteWithVerdicts, VERDICT_WINDOW, VERDICT_MIN, PASS_SHARE_WEIGHT,
} from './stress.js';

// 1. three honest signals, weights sum to 1, and instrument load is NOT one of them (decision 2)
{
  assert.deepEqual(Object.keys(STRESS_WEIGHTS).sort(), ['activity', 'dish', 'taste']);
  const sum = Object.values(STRESS_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12, `weights sum to 1 (got ${sum})`);
  assert.equal(stressValue({ activity: 1, dish: 1, taste: 1 }), 1);
  assert.equal(stressValue({}), 0);
  assert.equal(stressValue({ activity: 1, dish: 1, taste: 1, load: 1, instrumentLoad: 1 }), 1, 'a load field is ignored');
  assert.equal(stressValue({ load: 1, instrumentLoad: 1 }), 0, 'load alone is no stress: the governor owns load');
  assert.ok(Math.abs(stressValue({ activity: 1 }) - 0.38) < 1e-12 && Math.abs(stressValue({ taste: 1 }) - 0.24) < 1e-12);
  // junk degrades by reduction, never by invention
  assert.equal(stressValue({ activity: NaN, dish: -5, taste: 'x' }), 0);
  assert.equal(stressValue({ activity: 9, dish: 9, taste: 9 }), 1, 'clamped');
}

// 2. the pressures count actions and events, never time
{
  assert.equal(tastePressure(0), 0);
  assert.equal(tastePressure(12), 0.5);
  assert.equal(tastePressure(240), 1, 'saturates');
  assert.equal(tastePressure(-3), 0);
  assert.equal(tastePressure(NaN), 0);
  assert.equal(activityPressure(6), 0.5);
  assert.equal(activityPressure(99), 1);
  const src = readFileSync(new URL('./stress.js', import.meta.url), 'utf8');
  assert.ok(!/Date\.now|performance\.now|setTimeout|setInterval|new Date/.test(src), 'no clock anywhere in the module');
  assert.ok(!/Math\.random/.test(src), 'and no randomness');
}

// 3. the bands, at the roadmap's edges
{
  assert.deepEqual([...BANDS], [BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN]);
  assert.equal(RELAX_BELOW, 0.28);
  assert.equal(TIGHTEN_ABOVE, 0.72);
  assert.equal(bandFor(0), BAND_RELAX);
  assert.equal(bandFor(0.2799), BAND_RELAX);
  assert.equal(bandFor(0.28), BAND_NORMAL);
  assert.equal(bandFor(0.72), BAND_NORMAL);
  assert.equal(bandFor(0.7201), BAND_TIGHTEN);
  assert.equal(bandFor(1), BAND_TIGHTEN);
}

// 4. smoothing: the first frame is taken as-is; a step is eased, not jumped; it converges
{
  const t = createStressTracker({ smoothFrames: 12, hysteresis: 0 });
  const all = (v) => ({ activity: v, dish: v, taste: v }); // stress == v
  assert.equal(t.update(all(0.5)).smoothed, 0.5, 'no ramp up from zero on the first frame');
  const r = t.update(all(1));
  assert.ok(r.smoothed > 0.5 && r.smoothed < 0.6, `one frame of a step is a small move (${r.smoothed})`);
  assert.equal(r.stress, 1, 'the raw value is reported too');
  let last = r.smoothed;
  for (let i = 0; i < 200; i++) { const n = t.update(all(1)).smoothed; assert.ok(n >= last); last = n; }
  assert.ok(last > 0.999, 'it converges on the held value');
}

// 5. hysteresis: noise around an edge does not chatter the band
{
  const all = (v) => ({ activity: v, dish: v, taste: v });
  const count = (hysteresis) => {
    const t = createStressTracker({ smoothFrames: 1, hysteresis }); // no smoothing: isolate the hysteresis
    let changes = 0;
    t.update(all(0.5));
    for (let i = 0; i < 400; i++) {
      const wobble = 0.72 + 0.015 * (i % 2 === 0 ? 1 : -1); // straddles the TIGHTEN edge every frame
      if (t.update(all(wobble)).events.some((e) => e.type === 'band')) changes += 1;
    }
    return changes;
  };
  assert.ok(count(0) > 100, 'without hysteresis the band chatters on every wobble');
  assert.equal(count(HYSTERESIS_GAP), 0, 'with the gap, a wobble inside it never changes the band');
  // a real crossing still goes through, both ways, and needs to clear the edge by half the gap
  const t = createStressTracker({ smoothFrames: 1, hysteresis: 0.04 });
  t.update(all(0.5));
  assert.equal(t.update(all(0.73)).band, BAND_NORMAL, 'just over the edge is not enough');
  assert.equal(t.update(all(0.75)).band, BAND_TIGHTEN);
  assert.equal(t.update(all(0.71)).band, BAND_TIGHTEN, 'and it holds until clearly back');
  assert.equal(t.update(all(0.69)).band, BAND_NORMAL);
  assert.equal(t.update(all(0.27)).band, BAND_NORMAL);
  assert.equal(t.update(all(0.25)).band, BAND_RELAX);
  assert.equal(t.update(all(0.29)).band, BAND_RELAX);
  assert.equal(t.update(all(0.31)).band, BAND_NORMAL);
  assert.equal(t.update(all(0.1)).band, BAND_RELAX);
  assert.equal(t.update(all(0.95)).band, BAND_TIGHTEN, 'a big jump crosses both edges in one frame');
  assert.equal(t.update(all(0.05)).band, BAND_RELAX);
}

// 6. the log: only what changed, quantized, and identical for the same signal sequence
{
  const all = (v) => ({ activity: v, dish: v, taste: v });
  const seq = [];
  for (let i = 0; i < 300; i++) seq.push(0.5 + 0.45 * Math.sin(i / 20));
  const run = () => {
    const t = createStressTracker();
    const log = [];
    seq.forEach((v, f) => { for (const e of t.update(all(v)).events) log.push([f, e.type, e.band ?? e.value]); });
    return log;
  };
  const a = run();
  assert.deepEqual(run(), a, 'deterministic: same signals, same events');
  assert.deepEqual(a[0], [0, 'band', BAND_NORMAL], 'the first frame announces its band');
  const bands = a.filter((e) => e[1] === 'band').map((e) => e[2]);
  assert.ok(bands.includes(BAND_TIGHTEN) && bands.includes(BAND_RELAX), 'the sweep visits every band');
  for (let i = 1; i < bands.length; i++) assert.notEqual(bands[i], bands[i - 1], 'a band event is always a change');
  const stress = a.filter((e) => e[1] === 'stress');
  for (const e of stress) assert.equal(e[2], quantizeStress(e[2]), 'logged stress is quantized to 1/100');
  for (let i = 1; i < stress.length; i++) assert.notEqual(stress[i][2], stress[i - 1][2], 'a stress event is always a change');
  assert.ok(a.length < seq.length * 1.2, 'far fewer events than two per frame');
  // a held value logs once and then nothing
  const t = createStressTracker();
  let n = 0;
  for (let i = 0; i < 200; i++) n += t.update(all(0.5)).events.length;
  assert.equal(n, 2, 'a steady room logs one band and one stress value, then stays silent');
}

// #1753 (decision 5) — the keeps-vs-passes share joins taste pressure
{
  // no verdicts, or fewer than the minimum: identical to rolls-since-keep alone (today's behaviour)
  for (const v of [undefined, null, [], ['pass'], ['pass', 'pass', 'pass']]) {
    assert.equal(tasteWithVerdicts(12, v), tastePressure(12), `unchanged with ${JSON.stringify(v)}`);
  }
  assert.equal(VERDICT_MIN, 4);
  assert.equal(passShare(['keep', 'pass', 'pass', 'pass']), 0.75);
  assert.equal(passShare(['pass', 'junk', 'keep', 'keep', 'keep']), 0.25, 'only keep/pass count');
  // only the last VERDICT_WINDOW count
  const old = Array(20).fill('pass').concat(Array(VERDICT_WINDOW).fill('keep'));
  assert.equal(passShare(old), 0, 'old passes age out of the window');
  // all passes press harder than all keeps, at the same rolls-since-keep
  const allPass = tasteWithVerdicts(6, ['pass', 'pass', 'pass', 'pass']);
  const allKeep = tasteWithVerdicts(6, ['keep', 'keep', 'keep', 'keep']);
  assert.ok(allPass > allKeep, 'passes raise taste pressure');
  assert.equal(allPass, Math.min(1, (1 - PASS_SHARE_WEIGHT) * tastePressure(6) + PASS_SHARE_WEIGHT * 1));
  for (const t of [allPass, allKeep, tasteWithVerdicts(999, Array(8).fill('pass'))]) assert.ok(t >= 0 && t <= 1, 'stays in 0..1');
}

console.log('stress.selfcheck: ok (#1354, #1753)');
