// node src/curator/stress.selfcheck.mjs
// #1354 — stress, bands, smoothing, hysteresis. One check per behaviour the roadmap decided.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STRESS_WEIGHTS, stressValue, tastePressure, activityPressure, bandFor, quantizeStress, createStressTracker,
  BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN, BANDS, RELAX_BELOW, TIGHTEN_ABOVE, HYSTERESIS_GAP,
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

// 7. #1636 — the issue's done-when cases, in the form it specifies them. The dead-band already lives in
//    the reader above (HYSTERESIS_GAP straddling each edge, one place, no per-consumer debounce); these
//    cases are the evidence. WIDTH REASONING (the statement the issue asks for): the gap is 0.04 wide —
//    ±0.02 around each edge. That swallows the ±0.01 parked probe below with 2x margin, the two dead-bands
//    (0.26–0.30 and 0.70–0.74) keep 0.40 of clear water between them so they can never interact, and a
//    genuine transition is delayed only until the smoothed value clears the edge by 0.02 — case (c) shows
//    a hard crash pays ZERO extra frames for it, so the kill criteria (a band that lags the show) do not bite.
{
  const all = (v) => ({ activity: v, dish: v, taste: v });
  const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); // seeded: same sweep every run

  // (a) a seeded stress sweep driven slowly through each edge in both directions: exactly one band
  //     transition per crossing — four in all, in order — and the same sequence on a re-run (the band
  //     sequence is a pure function of the stress sequence; replay reproduces it exactly).
  const sweep = (opts = {}) => {
    const rand = lcg(1636);
    const t = createStressTracker(opts);
    const changes = [];
    let prev = null;
    const drive = (v, f) => {
      const r = t.update(all(v));
      if (prev !== null && r.band !== prev) changes.push([f, r.band]);
      prev = r.band;
    };
    let f = 0;
    for (let i = 0; i <= 2000; i++, f++) drive(Math.min(1, i / 2000) + (rand() - 0.5) * 0.004, f); // up, slowly, seeded jitter
    for (let i = 2000; i >= 0; i--, f++) drive(Math.max(0, i / 2000) + (rand() - 0.5) * 0.004, f); // and back down
    return changes;
  };
  for (const opts of [{}, { smoothFrames: 1 }]) {
    const changes = sweep(opts);
    assert.deepEqual(changes.map((c) => c[1]), [BAND_NORMAL, BAND_TIGHTEN, BAND_NORMAL, BAND_RELAX],
      `exactly one transition per crossing, in order (opts ${JSON.stringify(opts)})`);
    assert.deepEqual(sweep(opts), changes, 'the same seeded sweep replays to the same band sequence');
  }

  // (b) a signal parked oscillating ±0.01 around an edge holds one band for the duration of the probe —
  //     at BOTH edges, approached from BOTH adjacent bands, with the reader as shipped and with the
  //     smoothing isolated (so the dead-band itself, not the EMA, is what is proven to hold it).
  const probe = (edge, settle, opts) => {
    const t = createStressTracker(opts);
    for (let i = 0; i < 120; i++) t.update(all(settle));
    const start = t.band;
    let changes = 0;
    for (let i = 0; i < 1200; i++) {
      if (t.update(all(edge + (i % 2 === 0 ? 0.01 : -0.01))).events.some((e) => e.type === 'band')) changes += 1;
    }
    assert.equal(changes, 0, `parked ±0.01 at ${edge} from ${start}: the band holds`);
    assert.equal(t.band, start);
  };
  for (const opts of [{}, { smoothFrames: 1 }]) {
    probe(TIGHTEN_ABOVE, 0.5, opts); // NORMAL side of 0.72
    probe(TIGHTEN_ABOVE, 0.95, opts); // TIGHTEN side of 0.72
    probe(RELAX_BELOW, 0.5, opts); // NORMAL side of 0.28
    probe(RELAX_BELOW, 0.1, opts); // RELAX side of 0.28
  }

  // (c) the kill-criteria guard: a genuine crash into TIGHTEN arrives on the SAME frame with the
  //     dead-band as without it — hysteresis costs a real transition nothing.
  for (const from of [0.5, 0.6, 0.7]) {
    const framesToTighten = (hysteresis) => {
      const t = createStressTracker({ hysteresis });
      for (let i = 0; i < 200; i++) t.update(all(from));
      for (let i = 1; i <= 60; i++) if (t.update(all(1)).band === BAND_TIGHTEN) return i;
      return -1;
    };
    assert.equal(framesToTighten(HYSTERESIS_GAP), framesToTighten(0),
      `crash from ${from}: the dead-band adds no frames of latency`);
  }
}

console.log('stress.selfcheck: ok (#1354)');
