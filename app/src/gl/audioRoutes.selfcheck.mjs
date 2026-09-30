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
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { audioRoutes, audioMatrixRows } from './audioRoutes.mjs';
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
console.log('audioRoutes.selfcheck: OK');
