// deal/beastAdapter.mjs — #2232 step 6: the beast builder's deal adapter. Strandbeest linkages, for KINETIC and CURATOR.
//
// A candidate is a plain measure set (engine/beastBuilder.js sanitizeMeasures: the 13 bar genes, legCount, scale) — not a
// record. That is the point of this adapter: the engines deal numbers here exactly as they deal creature records in the
// WetLab. Pure: no store, no React, no clock, no Math.random. Every draw is a string-keyed hash of (seed, press, scope,
// attempt), so a hand re-derives from its inputs alone.
//
// The host reads nothing for this adapter: `ctx` is unused (the wild type is the only thing a beast is dealt from).
// A host applies a pick itself (beastTile → the pool); this file never writes state.
//
// The ladder: how far a dealt bar may stray from the wild type, as a fraction of its legal range (engine/jansenMeasures
// MEASURE_RANGES). TAME is the existing ASSEMBLE A BEAST button's own stray (beastTile BEAST_STRAY), so the first press
// feels like the button it replaces; FERAL spans the whole legal range, where most of the draws die in the gate.
// The gate is the S2 stillbirth test. The read is the gait itself: how near a linkage walks to the wild type's own gait.
import { MEASURE_IDS, MEASURE_RANGES, wildTypeMeasures } from '../engine/jansenMeasures.js';
import { sanitizeMeasures } from '../engine/beastBuilder.js';
import { evaluateGenome, isStillborn } from '../engine/jansenSolver.js';
import { BEAST_STRAY } from '../engine/beastTile.js';
import { hash32, u01 } from './dealKey.mjs';

/** The ladder, narrowest first: the fraction of each bar's range a dealt beast may stray from the wild type. */
export const BEAST_SCOPES = Object.freeze([
  { id: 'tame', label: 'TAME', stray: BEAST_STRAY },
  { id: 'loose', label: 'LOOSE', stray: 0.25 },
  { id: 'wild', label: 'WILD', stray: 0.5 },
  { id: 'feral', label: 'FERAL', stray: 1 },
]);
/** Where a bare press opens: the same stray as the ASSEMBLE A BEAST button (a quiet first press). */
export const BEAST_DEFAULT_SCOPE = 'tame';

/** The genes whose distance counts: the 13 bars, the leg count and the size. The per-leg phases do not (they are dealt, not strayed). */
const GENES = Object.freeze([...MEASURE_IDS, 'legCount', 'scale']);
const span = (id) => MEASURE_RANGES[id].max - MEASURE_RANGES[id].min;
const strayOf = (scope) => (BEAST_SCOPES.find((s) => s.id === scope) || BEAST_SCOPES[0]).stray;

/** A float rounded to 4 places: the same animal keeps the same key whatever float noise a nudge left behind. */
const r4 = (n) => Math.round(n * 10000) / 10000;

/** A measure set cleaned and rounded; null for anything that is not a measure set. */
function tidy(raw) {
  const m = sanitizeMeasures(raw);
  if (!m) return null;
  const out = {};
  for (const k of Object.keys(m).sort()) out[k] = k === 'legCount' ? m[k] : r4(m[k]);
  return out;
}

/** The stable id of a measure set: beastTile's own pool-tile id, so a pick banks under the key it was dealt with. */
export function beastKey(measures) {
  const m = sanitizeMeasures(measures);
  return m ? `user:beast-${hash32(JSON.stringify(m)).toString(16).padStart(8, '0')}` : '';
}

/**
 * How far apart two beasts are, 0..1: the mean of each gene's change as a fraction of its legal range
 * (the 13 bars, the leg count and the size). Identical measures → 0.
 */
export function beastDistance(a, b) {
  const x = sanitizeMeasures(a);
  const y = sanitizeMeasures(b);
  if (!x || !y) return 1;
  let sum = 0;
  for (const g of GENES) sum += Math.min(1, Math.abs(x[g] - y[g]) / span(g));
  return sum / GENES.length;
}

let wildGait = null;
/** The wild type's gait metrics, from the same solver as every candidate (one sweep, then kept — it is a constant). */
function wildMetrics() {
  if (!wildGait) {
    const w = sanitizeMeasures(wildTypeMeasures());
    wildGait = evaluateGenome(w, w.scale);
  }
  return wildGait;
}

/** 1 when `v` is as good as `ref` or better, falling toward 0 as it gets worse (`lowerBetter`: flatness, ripple). */
function nearRef(v, ref, lowerBetter) {
  if (!(Number.isFinite(v) && Number.isFinite(ref)) || ref <= 0) return 0;
  const ratio = lowerBetter ? ref / Math.max(v, 1e-9) : v / ref;
  return Math.max(0, Math.min(1, ratio));
}

/** One dealt beast: the wild type, each bar strayed by up to `stray` of its range; the leg count and size dealt across theirs. */
function dealt(stem, stray) {
  const wild = sanitizeMeasures(wildTypeMeasures());
  const raw = { ...wild };
  for (const id of MEASURE_IDS) raw[id] = wild[id] + (u01(`${stem}|${id}`) * 2 - 1) * stray * span(id);
  const lc = MEASURE_RANGES.legCount;
  raw.legCount = lc.min + Math.floor(u01(`${stem}|legCount`) * (lc.max - lc.min + 1));
  const sc = MEASURE_RANGES.scale;
  raw.scale = sc.min + u01(`${stem}|scale`) * (sc.max - sc.min);
  return tidy(raw);
}

/** The adapter the engines take: `kineticEngine.press(beastAdapter, …)` and `curatorEngine.funnel(…)`. */
export const beastAdapter = Object.freeze({
  scopes: BEAST_SCOPES.map(({ id, label }) => ({ id, label })),
  defaultScope: BEAST_DEFAULT_SCOPE,

  /** The wide deal: `maxDraws` beasts strayed from the wild type by the scope's fraction. The gate culls in the hand. */
  deal(scope, { seed, press, maxDraws }) {
    const stray = strayOf(scope);
    const out = [];
    for (let attempt = 0; attempt < maxDraws; attempt++) {
      const c = dealt(`beast-deal|${seed}|${press}|${scope}|${attempt}`, stray);
      if (c) out.push(c);
    }
    return out;
  },

  /**
   * The fine deal: beasts within `cap` of the subject (a fraction of the legal range, averaged over the genes). Every
   * gene moves by at most `cap` of its own range, so every neighbour is inside the cap; a draw that rounds back to the
   * subject is dropped.
   */
  near(subject, cap, { seed, press, maxDraws }) {
    const base = sanitizeMeasures(subject);
    if (!base) return [];
    const subjectKey = beastKey(base);
    const out = [];
    for (let attempt = 0; attempt < maxDraws; attempt++) {
      const stem = `beast-near|${seed}|${press}|${subjectKey}|${attempt}`;
      const raw = { ...base };
      for (const g of GENES) {
        // each gene moves about half the time, so a neighbour changes a few things and not always everything
        if (u01(`${stem}|${g}|moves`) < 0.5) continue;
        const step = (u01(`${stem}|${g}`) * 2 - 1) * cap * span(g);
        raw[g] = base[g] + (g === 'legCount' ? Math.round(step) : step);
      }
      const c = tidy(raw);
      if (c && beastKey(c) !== subjectKey && beastDistance(base, c) <= cap) out.push(c);
    }
    return out;
  },

  /** Hard viability: the S2 stillbirth test. A linkage that cannot turn a full crank, or has no stance foot, dies in the hand. */
  gate(candidate) {
    const m = sanitizeMeasures(candidate);
    return !!m && !isStillborn(m, m.scale);
  },

  /**
   * The measured read: how near the gait is to the wild type's own — flatness and ripple no worse (lower is better),
   * clearance no lower — each 0..1, and `total` their mean. A linkage that cannot turn reads 0.
   */
  read(candidate) {
    const m = sanitizeMeasures(candidate);
    const gait = m && evaluateGenome(m, m.scale);
    if (!gait || !gait.feasible) return { total: 0, flatness: 0, ripple: 0, clearance: 0 };
    const w = wildMetrics();
    const flatness = nearRef(gait.flatness, w.flatness, true);
    const ripple = nearRef(gait.ripple, w.ripple, true);
    // clearance scales with the size gene, so it is read per unit of scale: the shape of the step, not the size of the animal
    const clearance = nearRef(gait.clearance / m.scale, w.clearance, false);
    return { total: (flatness + ripple + clearance) / 3, flatness, ripple, clearance };
  },

  key(candidate) {
    return beastKey(candidate);
  },
});
