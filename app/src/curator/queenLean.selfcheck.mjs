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
  M6_KEEPS, M6_STRENGTH, warmCentreOpen, warmCentre,
  M7_CONFIDENCE, M7_STEP, M7_DEADBAND, M7_RANGE, tempoEaseOpen, tempoEase,
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

// ─── M6: a moth's birth warms toward the last 3 keeps (#1356 step 5) ──────
const DEF = { spread: 0, wing: 1, body: 1, swatch: 0 };
const mk = (spread, wing, body, swatch) => ({ spread, wing, body, swatch });
ok('M6: below MIN_KEEPS, or with no hand (allowance 0), or with no moths remembered, she does not nudge', () => {
  const ring = [[mk(10, 1.2, 1.1, 2)]];
  assert.equal(warmCentreOpen(ring, DEF, 1, MIN_KEEPS - 1), null);
  assert.equal(warmCentreOpen(ring, DEF, 0, MIN_KEEPS), null);
  assert.equal(warmCentreOpen([], DEF, 1, MIN_KEEPS), null);
  assert.equal(warmCentreOpen(null, DEF, 1, MIN_KEEPS), null);
});

ok('M6: the centre moves from the default toward the mean of the last M6_KEEPS keeps by M6_STRENGTH x allowance', () => {
  const ring = [[mk(-18, 0.8, 0.85, 0)], [mk(10, 1.2, 1.0, 2)], [mk(14, 1.0, 1.2, 2)], [mk(12, 1.2, 1.1, 3)]]; // the first is older than 3
  const c = warmCentreOpen(ring, DEF, 1, MIN_KEEPS);
  const mean = (k) => (ring.slice(-M6_KEEPS).map((e) => e[0][k]).reduce((a, b) => a + b, 0)) / M6_KEEPS;
  for (const k of Object.keys(DEF)) assert.ok(Math.abs(c[k] - (DEF[k] + M6_STRENGTH * (mean(k) - DEF[k]))) < 1e-9, k);
  assert.ok(c.spread > 0, 'toward the kept moths, not away');
  const half = warmCentreOpen(ring, DEF, 0.5, MIN_KEEPS);
  assert.ok(Math.abs(half.spread - c.spread / 2) < 1e-9, 'a room that gives her half a hand halves the nudge');
});

ok('M6: it never leaves the span between the default and the kept moths (a nudge, not a takeover)', () => {
  const ring = [[mk(18, 1.25, 1.2, 3)]];
  const c = warmCentreOpen(ring, DEF, 1, MIN_KEEPS);
  assert.ok(c.spread > 0 && c.spread < 18 && c.wing > 1 && c.wing < 1.25 && c.body > 1 && c.body < 1.2);
  assert.ok(c.spread <= 18 * M6_STRENGTH + 1e-9);
});

ok('M6: the gate decides: open reads through, and warmCentre is exactly warmCentreOpen', () => {
  const ring = [[mk(10, 1.2, 1.1, 2)]];
  assert.deepEqual(warmCentre(ring, DEF, 1, MIN_KEEPS), GATE_OPEN ? warmCentreOpen(ring, DEF, 1, MIN_KEEPS) : null);
});

// ─── M7: ease the BEAT toward a confident audio tempo (#1460) ─────────────────────────────────────────────
ok('M7: below MIN_KEEPS, with no hand, or with a doubtful tempo, she does not move the BPM', () => {
  const base = { current: 100, target: 130, confidence: 0.9, nKeeps: MIN_KEEPS, allowance: 1 };
  assert.ok(tempoEaseOpen(base) > 100, 'the open case moves');
  assert.equal(tempoEaseOpen({ ...base, nKeeps: MIN_KEEPS - 1 }), null);
  assert.equal(tempoEaseOpen({ ...base, allowance: 0 }), null);
  assert.equal(tempoEaseOpen({ ...base, confidence: M7_CONFIDENCE - 0.01 }), null);
  assert.equal(tempoEaseOpen({ ...base, target: NaN }), null);
});

ok('M7: a bounded step toward the target, never past it, never chasing a wobble', () => {
  const at = (cur, tgt, allowance = 1) => tempoEaseOpen({ current: cur, target: tgt, confidence: 0.9, nKeeps: MIN_KEEPS, allowance });
  assert.equal(at(100, 130), 100 + M7_STEP, 'a full hand moves M7_STEP');
  assert.equal(at(130, 100), 130 - M7_STEP, 'and downwards');
  assert.ok(at(100, 130, 0.25) - 100 < M7_STEP && at(100, 130, 0.25) > 100, 'a small hand moves less');
  assert.equal(at(100, 101), null, 'inside the deadband she is done');
  assert.equal(at(100, 100 + M7_DEADBAND), null);
  assert.equal(at(100, 104), 103, 'a gap of 4 moves by 3, not past');
  assert.equal(at(100, 102.5), 102.5, 'a gap just over the deadband closes exactly');
  let v = 100; for (let i = 0; i < 40; i++) { const nx = at(v, 140); if (nx === null) break; v = nx; }
  assert.ok(v >= 140 - M7_DEADBAND && v <= 140, `converges into the deadband (${v})`);
  assert.equal(at(100, 400), 103, 'a target above the span is clamped to it');
  assert.ok(M7_RANGE[0] < M7_RANGE[1]);
});

ok('M7: the gate decides: open reads through', () => {
  const a = { current: 100, target: 130, confidence: 0.9, nKeeps: MIN_KEEPS, allowance: 1 };
  assert.equal(tempoEase(a), GATE_OPEN ? tempoEaseOpen(a) : null);
});

console.log(`\nqueenLean: ${n} checks passed`);
