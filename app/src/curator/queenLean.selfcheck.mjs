// queenLean.selfcheck.mjs — #1139 PR-2: the sway mechanics M1–M5.
//
// Proves the bounds from the 2026-10-08 magnitudes spec, the MIN_KEEPS
// identity, the closed-gate neutrality, and the deniability contract
// (no UI-surface file may reference her identifiers).
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIN_KEEPS,
  M1_BIAS, M1_PROXIMITY,
  M2_T0, M2_CAP, M2_FLOOR,
  M3_DRIFT,
  M4_ARM_MS, M4_HOLD_PCT,
  M5_GAIN_PEAK,
  BEAT_CONFIDENCE,
  NEUTRAL_SWAY,
  proximity, keptCentroid, rankBiases, applyRankBias,
  warmedTemperature,
  keptPaletteId, paletteDriftTarget,
  phraseTiming,
  reactivityGain,
  beatConfidentFromPeaks,
  swayOpen, swayBiases,
} from './queenLean.mjs';
import { GATE_OPEN } from './queenChannel.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// ─── fixtures ───
const layoutA = {
  count: 300, scale: [0.7, 1.1], rotate: [-15, 15], alpha: [55, 70],
  jitter: 18, displacement: 10, density: 70, zTiers: 4,
  noiseSpeed: 0.6, noiseFreq: 0.006, swarmCohesion: 1.3, gravityWells: 0.7,
  particleCount: 140, damping: 0.95, wind: 0.45, breath: 0.2, lifeDrift: 0.25, flap: 0.2,
};
const keep = (id, paletteId, layout = layoutA) => ({
  id, config: { layout: { ...layout }, palette: { id: paletteId } },
});
const eightKeeps = Array.from({ length: 8 }, (_, i) => keep(`k${i}`, i < 5 ? 'tidepool' : 'ember'));
const sevenKeeps = eightKeeps.slice(0, 7);

// ─── M1: rank bias ───
ok('M1: proximity of identical vectors is 1', () => {
  const f = { a: 0.5, b: 0.8 };
  assert.ok(Math.abs(proximity(f, f) - 1) < 1e-9);
});

ok('M1: bias +0.06 only at proximity ≥ 0.72, never negative', () => {
  const centroid = keptCentroid(eightKeeps);
  assert.ok(centroid, 'centroid exists');
  const near = rankBiases([{ ...layoutA }], centroid);
  assert.deepEqual(near, [M1_BIAS], 'identical layout is at proximity 1');
  assert.equal(M1_BIAS, 0.06);
  const far = rankBiases([{
    count: 40, scale: [0.15, 2.9], rotate: [-180, 180], alpha: [15, 100],
    jitter: 150, displacement: 150, density: 22, zTiers: 2,
    noiseSpeed: 1.9, noiseFreq: 0.014, swarmCohesion: 0.3, gravityWells: 0.2,
    particleCount: 55, damping: 0.91, wind: 1.9, breath: 0.75, lifeDrift: 0.85, flap: 0.88,
  }], centroid);
  assert.deepEqual(far, [0], 'distant candidate gets no bias');
  assert.ok(near.every((b) => b >= 0) && far.every((b) => b >= 0), 'never demotes');
});

ok('M1: one top-3 slot swap max, stable otherwise', () => {
  // scores: A best, then B, C. Bias lifts C above B but not A → one swap.
  const order = applyRankBias([0.9, 0.78, 0.76, 0.1], [0, 0, 0.06, 0]);
  assert.deepEqual(order, [0, 2, 1, 3], 'single adjacent swap in top 3');
  // bias too small to matter → order unchanged
  const same = applyRankBias([0.9, 0.8, 0.7], [0, 0, 0.01]);
  assert.deepEqual(same, [0, 1, 2]);
  // even a huge bias causes at most one swap (bounded, not argmax)
  const bounded = applyRankBias([0.9, 0.5, 0.4, 0.3], [0, 0, 0, 0.9]);
  assert.deepEqual(bounded.slice(0, 3), [0, 1, 2], '4th place cannot jump the top 3');
});

ok('M1: empty candidates → empty biases', () => {
  assert.deepEqual(rankBiases([], keptCentroid(eightKeeps)), []);
  assert.deepEqual(rankBiases(null, keptCentroid(eightKeeps)), []);
});

// ─── M2: temperature ───
ok('M2: T in [0.40, 0.55], FILE-quiet lands on the floor', () => {
  assert.equal(warmedTemperature(0), M2_FLOOR, 'honest zero richness → floor');
  assert.equal(warmedTemperature(1), M2_CAP, 'full richness → cap');
  assert.ok(Math.abs(warmedTemperature(0.5) - 0.475) < 1e-9, 'T = 0.4 + 0.15r');
  assert.equal(warmedTemperature(2), M2_CAP, 'clamped above');
  assert.equal(warmedTemperature(-1), M2_FLOOR, 'clamped below');
  assert.equal(M2_T0, 0.4);
});

// ─── M3: palette drift ───
ok('M3: drift toward the most-kept palette at confidence, else null', () => {
  assert.equal(keptPaletteId(eightKeeps), 'tidepool', 'mode of kept palettes');
  assert.equal(keptPaletteId([]), null);
  const t = paletteDriftTarget(eightKeeps, true);
  assert.deepEqual(t, { paletteId: 'tidepool', weight: M3_DRIFT });
  assert.equal(M3_DRIFT, 0.1, 'weight ≤ 0.10');
  assert.equal(paletteDriftTarget(eightKeeps, false), null, 'no confidence → no drift');
  assert.equal(paletteDriftTarget([], true), null, 'no kept palette → no drift');
});

// ─── M4: phrase timing ───
ok('M4: arm ≤ 40ms early, hold ≤ +8%, zeros when not confident', () => {
  const on = phraseTiming(true);
  assert.ok(on.armEarlyMs <= M4_ARM_MS && on.armEarlyMs === 40);
  assert.ok(on.holdPct <= M4_HOLD_PCT && on.holdPct === 0.08);
  assert.deepEqual(phraseTiming(false), { armEarlyMs: 0, holdPct: 0 });
});

// ─── M5: lean-in ───
ok('M5: 1.18 → 1.00 over one phrase, 1.00 otherwise, never stacks', () => {
  assert.ok(Math.abs(reactivityGain(true, 0) - M5_GAIN_PEAK) < 1e-9);
  assert.ok(Math.abs(reactivityGain(true, 1) - 1.0) < 1e-9);
  assert.ok(Math.abs(reactivityGain(true, 0.5) - 1.09) < 1e-9, 'linear decay');
  assert.equal(reactivityGain(false, 0), 1.0, 'no return → no gain');
  // stateless: same inputs → same output, cannot compound
  assert.equal(reactivityGain(true, 0), reactivityGain(true, 0));
});

// ─── beat confidence ───
ok('beat confidence: two attacks ≥ 0.62', () => {
  assert.equal(beatConfidentFromPeaks([0.7, 0.8]), true);
  assert.equal(beatConfidentFromPeaks([0.7]), false, 'needs two');
  assert.equal(beatConfidentFromPeaks([0.9, 0.5]), false, 'both must clear');
  assert.equal(beatConfidentFromPeaks([]), false);
  assert.equal(beatConfidentFromPeaks(null), false);
  assert.equal(BEAT_CONFIDENCE, 0.62);
});

// ─── identity below MIN_KEEPS ───
ok(`identity below ${MIN_KEEPS} keeps (proven on the ungated path)`, () => {
  assert.equal(MIN_KEEPS, 8);
  const signals = { richness: 1, attackPeaks: [0.9, 0.9], audioReturned: true, phraseProgress: 0, source: 'mic' };
  assert.deepEqual(swayOpen(sevenKeeps, signals), NEUTRAL_SWAY, '7 keeps → neutral even with hot signals');
  const live = swayOpen(eightKeeps, signals);
  assert.notDeepEqual(live, NEUTRAL_SWAY, '8 keeps → she leans');
  assert.ok(live.temperature > M2_T0, 'M2 warms');
  assert.ok(live.palette && live.palette.weight === M3_DRIFT, 'M3 drifts');
  assert.ok(live.phrase.armEarlyMs === 40, 'M4 arms');
  assert.ok(live.reactivity > 1.0, 'M5 leans in');
});

// ─── gate open (2026-10-08) → the public output IS the open computation; the MIN_KEEPS floor still holds ───
ok('gate open: public output is the open computation, and neutral below the minimum or without signals', () => {
  assert.equal(GATE_OPEN, true);
  const signals = { richness: 1, attackPeaks: [0.9, 0.9], audioReturned: true, phraseProgress: 0, source: 'mic' };
  assert.deepEqual(swayBiases(eightKeeps, signals), swayOpen(eightKeeps, signals));
  assert.deepEqual(swayBiases(eightKeeps.slice(0, 7), signals), NEUTRAL_SWAY, '7 keeps: provably neutral');
  assert.deepEqual(swayBiases(eightKeeps, null), swayOpen(eightKeeps, null));
  assert.ok(Object.isFrozen(NEUTRAL_SWAY), 'neutral is frozen');
});

// ─── M5 never fires on FILE/unsupported/denied ───
ok('M5: only mic/midi returns count', () => {
  const sig = (source) => ({ richness: 0, attackPeaks: [], audioReturned: true, phraseProgress: 0, source });
  assert.ok(swayOpen(eightKeeps, sig('mic')).reactivity > 1.0);
  assert.ok(swayOpen(eightKeeps, sig('midi')).reactivity > 1.0);
  assert.equal(swayOpen(eightKeeps, sig('file')).reactivity, 1.0, 'FILE is not a return');
  assert.equal(swayOpen(eightKeeps, sig(null)).reactivity, 1.0);
  assert.equal(swayOpen(eightKeeps, sig('denied')).reactivity, 1.0);
});

// ─── deniability: UI source must not reference her identifiers ───
ok('no UI-surface file references her identifiers', () => {
  const ids = ['lean_lois', 'lean_davis', 'queenLean', 'GATE_OPEN', 'queenChannel'];
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (e === 'curator') continue; // implementation lives here, not a surface
        walk(p);
        continue;
      }
      if (!/\.(js|jsx|mjs)$/.test(e)) continue;
      const rel = relative(srcRoot, p);
      const src = readFileSync(p, 'utf8');
      for (const id of ids) {
        if (src.includes(id)) hits.push(`${rel}:${id}`);
      }
    }
  };
  walk(srcRoot);
  assert.deepEqual(hits, [], `surface leaks: ${hits.join(', ')}`);
});

console.log(`\nqueenLean: ${n} checks passed`);
