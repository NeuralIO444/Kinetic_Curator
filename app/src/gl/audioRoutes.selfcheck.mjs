// audioRoutes.selfcheck.mjs — #613 STIMULI meter + matrix truth.
//
//  A. audioRoutes() is bit-for-bit the live loop's pre-#613 inline math
//     (the old expressions are kept verbatim below as the oracle).
//  B. the matrix rows are those same routes: scale rows sum to scaleMul−1,
//     glow rows to glow (unclipped); audio off → every live value is 0;
//     MID / TREBLE are listed unrouted (they drive nothing today).
//  C. liveLoop.mjs calls audioRoutes and no longer carries its own copy.
//  D. meter bands: seven named, log-spaced, SUB split from BASS at the meter
//     FFT size; peak-hold rises instantly and falls at its rate.
//  E. (#790 engine) routes are DATA: DEFAULT_ROUTES evaluates to today's numbers
//     (within float rounding) over 2000 random samples; routes == null is still
//     the untouched inline path; tables clamp, cap, ignore junk, read bands,
//     and the matrix rows sum to what they render.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  audioRoutes, audioMatrixRows, evaluateRoutes, routesUseBands,
  DEFAULT_ROUTES, MAX_ROUTES, ROUTE_INPUTS, ROUTE_TARGETS, COARSE_INPUTS, BAND_INPUTS,
} from './audioRoutes.mjs';
import { METER_BANDS, METER_FFT_SIZE, meterBandLevels, holdPeaks } from './meterBands.mjs';

// ── A ────────────────────────────────────────────────────────────────────
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
for (let n = 0; n < 2000; n++) {
  const a = { bass: rnd(), rms: rnd(), beatPulse: rnd() };
  const p = { depth: rnd(), scaleMod: rnd(), alphaMod: rnd() };
  const r = audioRoutes(a, p);
  // oracle: liveLoop.mjs before #613, verbatim
  const scaleMul = 1 + (a.beatPulse * 0.38 * p.scaleMod + (a.bass * 0.55 + a.rms * 0.35) * 0.28) * p.depth;
  const alphaBoost = a.beatPulse * 18 * p.alphaMod * p.depth;
  const breath = a.beatPulse * 0.035 * p.depth;
  const glow = Math.min(1, a.beatPulse * 0.8 + a.rms * 0.4) * p.depth;
  assert.ok(Object.is(r.scaleMul, scaleMul) && Object.is(r.alphaBoost, alphaBoost)
    && Object.is(r.breathAudio, breath) && Object.is(r.glow, glow), `route drift at sample ${n}`);
}
const silent = audioRoutes({ bass: 0, rms: 0, beatPulse: 0 }, { depth: 0.65, scaleMod: 0.45, alphaMod: 0.25 });
assert.deepStrictEqual(silent, { scaleMul: 1, alphaBoost: 0, breathAudio: 0, glow: 0 }, 'silence is zero');

// ── B ────────────────────────────────────────────────────────────────────
{
  const a = { bass: 0.6, mid: 0.9, treble: 0.9, rms: 0.3, beatPulse: 0.5 };
  const p = { depth: 0.65, scaleMod: 0.45, alphaMod: 0.25 };
  const rows = audioMatrixRows(a, p, true);
  const r = audioRoutes(a, p);
  const sum = (t) => rows.filter((x) => x.target === t).reduce((s, x) => s + x.live, 0);
  assert.ok(Math.abs(sum('scale') - (r.scaleMul - 1)) < 1e-12, 'scale rows = scaleMul − 1');
  assert.ok(Math.abs(sum('alpha') - r.alphaBoost) < 1e-12);
  assert.ok(Math.abs(sum('breath') - r.breathAudio) < 1e-12);
  assert.ok(Math.abs(sum('glow') - r.glow) < 1e-12, 'glow rows = glow (unclipped)');
  for (const row of rows.filter((x) => x.target)) assert.ok(row.depth > 0 && row.live >= 0);
  assert.deepStrictEqual(rows.filter((x) => !x.target).map((x) => x.input), ['MID', 'TREBLE'], 'mid/treble honestly unrouted');
  const off = audioMatrixRows(a, p, false);
  assert.ok(off.every((x) => x.live === 0), 'audio off → idle, no frozen ghost values');
  assert.deepStrictEqual(off.map((x) => x.depth), rows.map((x) => x.depth), 'depth (the knob side) still shows when idle');
}

// ── C ────────────────────────────────────────────────────────────────────
{
  const loop = readFileSync(new URL('./liveLoop.mjs', import.meta.url), 'utf8');
  assert.ok(/audioRoutes\(shapedAudio,/.test(loop), 'liveLoop renders through audioRoutes');
  assert.ok(!/beatPulse \* 0\.38/.test(loop) && !/beatPulse \* 0\.8 \+/.test(loop), 'no second copy of the routes in liveLoop');
}

// ── D ────────────────────────────────────────────────────────────────────
assert.deepStrictEqual(METER_BANDS.map((b) => b.label), ['SUB', 'BASS', 'MUD', 'MIDS', 'EDGE', 'PRES', 'AIR']);
for (let i = 1; i < METER_BANDS.length; i++) assert.strictEqual(METER_BANDS[i].lo, METER_BANDS[i - 1].hi, 'bands tile with no gaps');
{
  const sr = 48000;
  const bins = METER_FFT_SIZE / 2;
  const at = (hz) => { const f = new Uint8Array(bins); f[Math.floor((hz / (sr / 2)) * bins)] = 255; return meterBandLevels(f, sr); };
  const idx = (id) => METER_BANDS.findIndex((b) => b.id === id);
  const sub = at(40), bass = at(150), air = at(10000);
  assert.ok(sub[idx('sub')] > 0 && sub[idx('bass')] === 0, 'a 40 Hz tone reads SUB, not BASS');
  assert.ok(bass[idx('bass')] > 0 && bass[idx('sub')] === 0, 'a 150 Hz tone reads BASS, not SUB');
  assert.ok(air[idx('air')] > 0 && air.slice(0, idx('air')).every((v) => v === 0), 'a 10 kHz tone reads AIR only');
  assert.deepStrictEqual(meterBandLevels(new Uint8Array(0), sr), METER_BANDS.map(() => 0), 'no data → idle');
  const full = meterBandLevels(new Uint8Array(bins).fill(255), sr);
  assert.ok(full.every((v) => v === 1), 'full-scale spectrum → every band at 1');
}
{
  const p1 = holdPeaks([0, 0], [0.8, 0.2], 0.016);
  assert.deepStrictEqual(p1, [0.8, 0.2], 'peaks rise instantly');
  const p2 = holdPeaks(p1, [0, 0], 0.5, 0.6);
  assert.ok(Math.abs(p2[0] - 0.5) < 1e-12 && p2[1] === 0, 'peaks fall at 0.6/s, never below the live level');
}
// ── E ────────────────────────────────────────────────────────────────────
{
  const close = (x, y, tol = 1e-12) => Math.abs(x - y) <= tol;
  // E1: the default table IS today's behaviour
  let worst = 0;
  for (let n = 0; n < 2000; n++) {
    const a = { bass: rnd(), mid: rnd(), treble: rnd(), rms: rnd(), beatPulse: rnd() };
    const p = { depth: rnd(), scaleMod: rnd(), alphaMod: rnd() };
    const legacy = audioRoutes(a, p);          // routes == null: the original math
    const table = audioRoutes(a, p, DEFAULT_ROUTES);
    for (const k of Object.keys(legacy)) {
      worst = Math.max(worst, Math.abs(legacy[k] - table[k]));
      assert.ok(close(legacy[k], table[k]), `default table drifted on ${k} at sample ${n}: ${legacy[k]} vs ${table[k]}`);
    }
  }
  assert.ok(worst < 1e-12, `worst default-table drift ${worst}`);
  assert.deepStrictEqual(audioRoutes({ bass: 0.5, rms: 0.5, beatPulse: 0.5 }, { depth: 1, scaleMod: 1, alphaMod: 1 }, null),
    audioRoutes({ bass: 0.5, rms: 0.5, beatPulse: 0.5 }, { depth: 1, scaleMod: 1, alphaMod: 1 }), 'null routes = the untouched path');
  assert.strictEqual(DEFAULT_ROUTES.length, 7);

  // E2: vocabulary is MIDI-addressable (dotted ids) and closed
  assert.ok(COARSE_INPUTS.length === 5 && BAND_INPUTS.length === 7 && ROUTE_INPUTS.length === 12);
  // (second segment may be camelCase: clock.kinemeRate is the issue-mandated #790 id)
  for (const t of Object.keys(ROUTE_TARGETS)) assert.match(t, /^[a-z]+\.[a-zA-Z]+$/, `${t} is dotted`);
  for (const r of DEFAULT_ROUTES) assert.ok(ROUTE_INPUTS.includes(r.input) && ROUTE_TARGETS[r.target], 'default routes use the vocabulary');
  assert.strictEqual(Object.isFrozen(DEFAULT_ROUTES) && Object.isFrozen(DEFAULT_ROUTES[0]), true, 'defaults are immutable');

  // E3: silence is zero for ANY table (still contract)
  const silent = { bass: 0, mid: 0, treble: 0, rms: 0, beatPulse: 0 };
  const P = { depth: 0.65, scaleMod: 0.45, alphaMod: 0.25 };
  const weird = [{ input: 'band.air', target: 'render.glow', depth: 5 }, { input: 'beat', target: 'render.scale', depth: -2 }];
  for (const t of [DEFAULT_ROUTES, weird, []]) {
    assert.deepStrictEqual(audioRoutes(silent, P, t, { sub: 0, air: 0 }), { scaleMul: 1, alphaBoost: 0, breathAudio: 0, glow: 0 }, 'silence → no modulation');
  }
  assert.deepStrictEqual(audioRoutes({ bass: 1, rms: 1, beatPulse: 1 }, P, []), { scaleMul: 1, alphaBoost: 0, breathAudio: 0, glow: 0 },
    'an empty table (the user deleted every route) drives nothing');

  // E4: a band can drive a target (AIR → glow, SUB → breath): the point of the matrix
  const airGlow = [{ input: 'band.air', target: 'render.glow', depth: 0.8 }];
  const g = audioRoutes(silent, { depth: 1, scaleMod: 1, alphaMod: 1 }, airGlow, { air: 0.5 });
  assert.ok(close(g.glow, 0.4), 'AIR at 0.5 × 0.8 → glow 0.4');
  assert.strictEqual(audioRoutes(silent, { depth: 1, scaleMod: 1, alphaMod: 1 }, airGlow, null).glow, 0, 'no band data reads 0, not NaN');
  assert.strictEqual(routesUseBands(airGlow), true);
  assert.strictEqual(routesUseBands(DEFAULT_ROUTES), false, 'the default table never asks for bands');
  assert.strictEqual(routesUseBands(null), false);

  // E5: composition rules: glow keeps its min(1, Σ) nonlinearity; alphaMod scales all alpha terms; scaleMod only beat → scale
  const hot = { bass: 1, rms: 1, beatPulse: 1 };
  const two = [{ input: 'beat', target: 'render.glow', depth: 0.8 }, { input: 'level', target: 'render.glow', depth: 0.8 }];
  assert.ok(close(audioRoutes(hot, { depth: 1, scaleMod: 1, alphaMod: 1 }, two).glow, 1), 'two glow routes saturate at 1');
  const sc = (input) => audioRoutes(hot, { depth: 1, scaleMod: 0.5, alphaMod: 1 }, [{ input, target: 'render.scale', depth: 0.2 }]).scaleMul;
  assert.ok(close(sc('beat'), 1 + 0.2 * 0.5), 'scaleMod scales the beat → scale term');
  assert.ok(close(sc('bass'), 1 + 0.2), 'and only that term');
  const al = (input) => audioRoutes(hot, { depth: 1, scaleMod: 1, alphaMod: 0.5 }, [{ input, target: 'render.alpha', depth: 10 }]).alphaBoost;
  assert.ok(close(al('beat'), 5) && close(al('bass'), 5), 'alphaMod scales every alpha term');

  // E6: outputs are clamped, so a wild table can never feed ACCUM / layout a non-finite or absurd value
  const wild = [{ input: 'beat', target: 'render.scale', depth: 1e9 }, { input: 'beat', target: 'render.alpha', depth: 1e9 },
    { input: 'beat', target: 'render.breath', depth: 1e9 }, { input: 'beat', target: 'render.glow', depth: 1e9 }];
  const w = audioRoutes(hot, { depth: 1, scaleMod: 1, alphaMod: 1 }, wild);
  assert.deepStrictEqual([w.scaleMul, w.alphaBoost, w.breathAudio, w.glow], [3, 60, 0.2, 1], 'clamped to each target\'s bounds');
  const neg = audioRoutes(hot, { depth: 1, scaleMod: 1, alphaMod: 1 }, [{ input: 'beat', target: 'render.scale', depth: -1e9 }]);
  assert.strictEqual(neg.scaleMul, 0.5, 'a negative route clamps at the floor');
  const junk = audioRoutes({ bass: NaN, rms: Infinity, beatPulse: undefined }, P, DEFAULT_ROUTES);
  for (const v of Object.values(junk)) assert.ok(Number.isFinite(v), 'non-finite audio never escapes');

  // E7: hostile tables: unknown ids and non-finite depths are ignored, the table is capped
  const dirty = [null, 7, 'x', { input: 'nope', target: 'render.scale', depth: 1 }, { input: 'beat', target: 'nope', depth: 1 },
    { input: 'beat', target: 'render.scale', depth: NaN }, { input: 'beat', target: 'render.scale', depth: 0.1 }];
  assert.ok(close(audioRoutes(hot, { depth: 1, scaleMod: 1, alphaMod: 1 }, dirty).scaleMul, 1.1), 'junk entries ignored, the good one applies');
  const many = Array.from({ length: MAX_ROUTES + 10 }, () => ({ input: 'beat', target: 'render.breath', depth: 0.001 }));
  assert.ok(close(audioRoutes(hot, { depth: 1, scaleMod: 1, alphaMod: 1 }, many).breathAudio, 0.001 * MAX_ROUTES), `only the first ${MAX_ROUTES} routes count`);

  // E8: an edit (new array) is never served from a stale compile
  const t1 = [{ input: 'beat', target: 'render.breath', depth: 0.01 }];
  const t2 = [{ input: 'beat', target: 'render.breath', depth: 0.02 }];
  assert.ok(close(audioRoutes(hot, P, t1).breathAudio, 0.01 * P.depth) && close(audioRoutes(hot, P, t2).breathAudio, 0.02 * P.depth));
  assert.ok(close(audioRoutes(hot, P, t1).breathAudio, 0.01 * P.depth), 'and back');

  // E9: matrix rows follow a table exactly
  for (let n = 0; n < 200; n++) {
    const a = { bass: rnd(), mid: rnd(), treble: rnd(), rms: rnd(), beatPulse: rnd() };
    const bands = { sub: rnd(), bass: rnd(), mud: rnd(), mids: rnd(), edge: rnd(), pres: rnd(), air: rnd() };
    const p = { depth: rnd(), scaleMod: rnd(), alphaMod: rnd() };
    const table = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => ({
      input: ROUTE_INPUTS[Math.floor(rnd() * ROUTE_INPUTS.length)],
      target: Object.keys(ROUTE_TARGETS)[Math.floor(rnd() * 4)],
      depth: rnd() * 0.05, // small enough that nothing clamps
    }));
    const rows = audioMatrixRows(a, p, true, table, bands);
    const r = audioRoutes(a, p, table, bands);
    const sum = (t) => rows.filter((x) => x.targetId === `render.${t}`).reduce((s, x) => s + x.live, 0);
    assert.ok(close(sum('scale'), r.scaleMul - 1), 'scale rows sum to scaleMul − 1');
    assert.ok(close(sum('alpha'), r.alphaBoost), 'alpha rows sum to alphaBoost');
    assert.ok(close(sum('breath'), r.breathAudio), 'breath rows sum to breathAudio');
    if (sum('glow') <= p.depth && table.filter((x) => x.target === 'render.glow').reduce((m, x) => m + x.depth, 0) < 1) {
      assert.ok(close(sum('glow'), r.glow), 'glow rows sum to glow (below saturation)');
    }
    assert.ok(audioMatrixRows(a, p, false, table, bands).every((x) => x.live === 0), 'audio off → idle');
  }
  const labelled = audioMatrixRows({ rms: 0 }, P, true, [{ input: 'band.air', target: 'render.glow', depth: 1 }, { input: 'bass', target: 'render.scale', depth: 1 }]);
  assert.deepStrictEqual(labelled.map((x) => x.input), ['BAND AIR', 'BASS'], 'a band and the coarse input of the same name stay distinguishable');
  assert.deepStrictEqual(audioMatrixRows({}, P, true, []), [], 'an empty table has no rows');
  assert.strictEqual(audioMatrixRows({ beatPulse: 1 }, P, true).length, 9, 'no table → today\'s nine rows, unchanged');
  // C still holds: the loop has not grown a table yet (PR2), it still calls the shared function
  const loop2 = readFileSync(new URL('./liveLoop.mjs', import.meta.url), 'utf8');
  assert.ok(/audioRoutes\(shapedAudio,/.test(loop2));
}
console.log('audioRoutes.selfcheck: OK');
