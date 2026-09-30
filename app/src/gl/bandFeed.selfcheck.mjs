// bandFeed.selfcheck.mjs — #790 PR3: the seven meter bands as live route inputs.
//
//  A. the feed costs nothing and reads nothing unless a route reads a band.
//  B. silence is exactly zero: audio off, no tap, no data, and a FILE sidecar
//     driving all read 0, and the follower decays to 0 (no frozen ghost).
//  C. bands are shaped by the loop's ballistics (rise, then decay), per band.
//  D. a band route drives a target end to end (AIR → glow, SUB → breath), and
//     the route-input names line up with the meter's bands (band.pres ↔ PRES).
//  E. wiring: the loop asks the feed and passes shapedBands; the tap reads the
//     analyser itself, so it works with the meter panel closed; the matrix shows
//     exactly what the loop fed.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createBandFeed, getShapedBands, BAND_KEYS } from './bandFeed.mjs';
import { audioRoutes, DEFAULT_ROUTES, BAND_INPUTS, audioMatrixRows } from './audioRoutes.mjs';
import { METER_BANDS } from './meterBands.mjs';

const P = { depth: 1, scaleMod: 1, alphaMod: 1 };
const silent = { bass: 0, mid: 0, treble: 0, rms: 0, beatPulse: 0 };
const airGlow = [{ input: 'band.air', target: 'render.glow', depth: 0.8 }];
const subBreath = [{ input: 'band.sub', target: 'render.breath', depth: 0.1 }];
const loud = { sub: 1, bass: 1, mud: 1, mids: 1, edge: 1, pres: 1, air: 1 };

// ── D (vocabulary first: everything else leans on it) ────────────────────
assert.deepStrictEqual(BAND_KEYS, ['sub', 'bass', 'mud', 'mids', 'edge', 'pres', 'air'], 'feed keys are the meter labels, lowercased');
assert.deepStrictEqual(BAND_INPUTS, BAND_KEYS.map((k) => `band.${k}`), 'route inputs line up with the meter bands (band.pres, not band.presence)');
assert.strictEqual(BAND_KEYS.length, METER_BANDS.length);

// ── A ────────────────────────────────────────────────────────────────────
{
  const feed = createBandFeed();
  let reads = 0;
  const readBands = () => { reads++; return loud; };
  const go = (routes) => feed.read({ routes, enabled: true, sidecar: false, readBands, dtMs: 16 });
  assert.strictEqual(go(null), null, 'default table: no bands');
  assert.strictEqual(go(DEFAULT_ROUTES), null);
  assert.strictEqual(go([{ input: 'beat', target: 'render.scale', depth: 1 }]), null, 'a table with no band.* input: no bands');
  assert.strictEqual(reads, 0, 'and the analyser is never read');
  assert.strictEqual(getShapedBands(), null);
  assert.ok(go(airGlow), 'a band route turns the feed on');
  assert.strictEqual(reads, 1, 'one read per frame');
}

// ── B ────────────────────────────────────────────────────────────────────
{
  const step = (feed, o) => feed.read({ routes: airGlow, dtMs: 16, readBands: () => loud, enabled: true, sidecar: false, ...o });
  const zero = Object.fromEntries(BAND_KEYS.map((k) => [k, 0]));
  assert.deepStrictEqual(step(createBandFeed(), { enabled: false }), zero, 'audio off → exactly zero');
  assert.deepStrictEqual(step(createBandFeed(), { readBands: () => null }), zero, 'no tap → zero');
  assert.deepStrictEqual(step(createBandFeed(), { readBands: () => ({ air: NaN, sub: undefined }) }), zero, 'garbage data → zero, never NaN');
  assert.deepStrictEqual(step(createBandFeed(), { sidecar: true }), zero, 'a FILE sidecar is driving: bands idle (no per-band data, and live FFT would not repeat)');
  // the follower decays to an exact 0 when audio stops: no frozen ghost
  const f = createBandFeed();
  for (let i = 0; i < 30; i++) step(f, {});
  assert.ok(step(f, {}).air > 0.5, 'loud sustained → high');
  let v = 1;
  for (let i = 0; i < 400; i++) v = step(f, { enabled: false }).air;
  assert.strictEqual(v, 0, 'audio off → decays to exactly 0');
  // and the silence contract holds downstream for ANY band table
  assert.deepStrictEqual(audioRoutes(silent, P, airGlow, zero), { scaleMul: 1, alphaBoost: 0, breathAudio: 0, glow: 0 });
}

// ── C ────────────────────────────────────────────────────────────────────
{
  const f = createBandFeed();
  const feed = (levels) => f.read({ routes: airGlow, enabled: true, sidecar: false, readBands: () => levels, dtMs: 16.7 });
  const rise = [1, 2, 3].map(() => feed({ ...Object.fromEntries(BAND_KEYS.map((k) => [k, 0])), air: 1, sub: 0 }).air);
  assert.ok(rise[0] > 0 && rise[0] < rise[1] && rise[1] < rise[2], 'shaped: it rises, not a hard jump per frame');
  const onlyAir = feed({ ...Object.fromEntries(BAND_KEYS.map((k) => [k, 0])), air: 1 });
  assert.ok(onlyAir.air > 0 && onlyAir.sub === 0, 'bands are independent');
  assert.strictEqual(getShapedBands(), onlyAir, 'the last shaped bands are published for the matrix');
  // routes leaving bands resets the follower: no stale level when a band route comes back
  f.read({ routes: null, enabled: true, sidecar: false, readBands: () => loud, dtMs: 16 });
  assert.strictEqual(getShapedBands(), null, 'unused → nothing published');
  const back = feed({ ...Object.fromEntries(BAND_KEYS.map((k) => [k, 0])), air: 1 });
  assert.ok(back.air < 0.5, 'a band route coming back starts from rest, not from a stale level');
}

// ── D (end to end) ───────────────────────────────────────────────────────
{
  const airOn = { ...Object.fromEntries(BAND_KEYS.map((k) => [k, 0])), air: 0.5 };
  assert.ok(Math.abs(audioRoutes(silent, P, airGlow, airOn).glow - 0.4) < 1e-12, 'AIR 0.5 × 0.8 → glow 0.4');
  const subOn = { ...Object.fromEntries(BAND_KEYS.map((k) => [k, 0])), sub: 1 };
  assert.ok(Math.abs(audioRoutes(silent, P, subBreath, subOn).breathAudio - 0.1) < 1e-12, 'SUB 1 × 0.1 → breath 0.1');
  assert.strictEqual(audioRoutes(silent, P, subBreath, airOn).breathAudio, 0, 'a different band does not leak in');
  const rows = audioMatrixRows(silent, P, true, airGlow, airOn);
  assert.ok(Math.abs(rows[0].live - 0.4) < 1e-12 && rows[0].input === 'BAND AIR', 'the matrix row shows the same number the loop renders');
}

// ── E ────────────────────────────────────────────────────────────────────
{
  const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const loop = src('./liveLoop.mjs');
  assert.ok(/bandFeed\.read\(\{[^}]*routes: s\.audioRoutes[^}]*sidecar: !!\(s\.audioSidecar && s\.audioSource\?\.type === 'file'\)[^}]*readBands: readMeterBandLevels/s.test(loop), 'the loop asks the feed, gated on the sidecar');
  assert.ok(/s\.audioRoutes, shapedBands\)/.test(loop), 'and hands the shaped bands to the routes');
  const tap = src('../hooks/audioMeterTap.js');
  assert.ok(/getByteFrequencyData\(freqBytes\)/.test(tap) && !/MeterHero/.test(tap.replace(/\/\/.*$/gm, '')), 'the tap reads the analyser itself: no dependency on the meter panel being mounted');
  assert.ok(/setAudioMeterTap\(\{ analyser: meterAnalyser/.test(src('../hooks/useAudioInput.js')), 'the hook publishes the analyser whenever audio is on');
  assert.ok(/getShapedBands\(\)/.test(src('../panels/stimulus/ModMatrix.jsx')), 'the matrix shows exactly what the loop fed');
  // the store's band shape is untouched (audioPipeline.selfcheck pins it)
  assert.ok(!/band\./.test(src('../state/slices/audioSlice.js').replace(/\/\/.*$/gm, '')), 'no band data in the store');
}
console.log('bandFeed.selfcheck: OK');
