// dishCoalesce.mjs — petri dish B2 (#1411): coalescence. The law lives
// here; particles.js takes call sites only (the B1 pattern — one writer
// per law, see dishDeform.mjs). Spec: docs/research/
// petri-dish-physics-scope-2026-10-12.md §5.
//
// Two bodies of the SAME family in sustained contact grow a membrane at
// their seam: they read as one colony that touches without dissolving.
// "Family" in v1 is the stratum (the ParticleSystem): dwell is fed ONLY
// by the per-system contact pass, so cross-strata pairs — different
// families by construction — can never merge (spec open question 2,
// recommended same-family-only scope; flagged for Matt's review on the
// PR). The merge is a finish: a local threshold blend at the contact
// point (gl/coalesceFinish.mjs), never a blend mode over the frame, and
// never physics — this module writes no position, velocity, or mass.
// B1's proof shape holds: with the effect on and off, the physics
// columns are bit-identical (pinned in dishCoalesce.selfcheck.mjs).
//
// The law, in steps (the engine's determinism unit — the state is a pure
// function of (seed, params, steps), so bake equals live by
// construction):
//   - A pair accrues 1 dwell per step it spends in contact. Contact
//     includes a NEAR touch (within COALESCE_TOUCH × the disc sum):
//     positional depenetration leaves a resting pair exactly at the disc
//     sum, on the rejected side of the contact test — without the
//     tolerance a resting pair would strobe in and out of contact and
//     never read as sustained.
//   - Below COALESCE_DWELL_GATE steps of dwell the merge factor is 0: a
//     glancing touch never merges. Past the gate the factor ramps
//     linearly over COALESCE_RAMP_STEPS to 1.
//   - Out of contact, dwell drains at COALESCE_DRAIN_PER_STEP per step
//     and the entry is deleted at zero: separation restores two clean
//     discs within a beat, and no strobing (approach-fired, dwell-gated,
//     never per-frame).
//   - A slot recycled by breed inherits no pair's dwell (the call site
//     sits beside B1's clearDishDeform); a pair touching a dead body is
//     purged at the step.
//   - Reduced-motion renders no fields while the state tracks
//     underneath — the same stillness split as B1: the law restrains
//     the render, never the world.
//
// Governor: cost tier 1 — coalescence sheds WITH the FX finishes, first
// on the ladder (spec §5/§7): sceneContract omits the fields whenever
// the governor's tier-1 shed is active (doc.perfTier1). Stills and
// exports carry no governor state, so they never shed it.

import { registerCostTier } from '../gl/costTiers.mjs';
import { contactBodyRadius } from './dishRadius.mjs';

/** Steps of sustained contact before any merge shows (0.4 s at 60 fps). */
export const COALESCE_DWELL_GATE = 24;
/** Steps over which the merge factor ramps from the gate to full. */
export const COALESCE_RAMP_STEPS = 30;
/** Dwell drained per step out of contact: a full merge clears in ~8 steps. */
export const COALESCE_DRAIN_PER_STEP = 4;
/** A pair counts as touching while its centre distance is within this
 *  multiple of the disc sum (depenetration parks resting pairs at 1.0). */
export const COALESCE_TOUCH = 1.06;
/** A field is composed only while the centres are within this multiple
 *  of the disc sum — a membrane cannot span a wide gap. */
export const COALESCE_MAX_GAP = 1.1;
/** Field radius as a fraction of the smaller disc, at rest factor. */
export const COALESCE_FIELD_RADIUS_K = 0.6;
/** Per-layer field cap (the finish's uniform array size; strongest win). */
export const COALESCE_MAX_FIELDS = 24;

/** Pair key: canonical (i < j) packed into one number. Populations are
 *  capped in the low thousands by the quality caps — 2^20 of headroom. */
const pairKey = (i, j) => i * 1048576 + j;

registerCostTier('engine/dish-coalesce', {
  tier: 1,
  // one full-frame RGBA16F working target at 1080p, allocated lazily by
  // the finish and only while a layer actually coalesces
  memoryBytes: 1920 * 1080 * 8,
  timeMs: 0.25,
  notes:
    '#1411 coalescence: dwell tracking is free (contact-pass call site); the finish is one fullscreen threshold-blend pass per coalescing layer. Tier 1 — sheds with the FX finishes, first on the ladder.',
});

/** The merge factor for a dwell count: 0 below the gate, linear to 1. */
export function coalesceFactor(dwell) {
  const f = (dwell - COALESCE_DWELL_GATE) / COALESCE_RAMP_STEPS;
  return f <= 0 ? 0 : f >= 1 ? 1 : f;
}

function trackerFor(sys) {
  if (!sys._coalesce) sys._coalesce = { step: 0, pairs: new Map() };
  return sys._coalesce;
}

/**
 * Feed one in-contact (or near-touch) pair for this step. Called from
 * the per-system contact pass only — same-system pairs are the family,
 * so different families never accrue dwell. State only.
 */
export function feedDishCoalesce(sys, i, j) {
  if (sys._coalesceOn === false) return;
  if (i === j) return;
  const a = i < j ? i : j;
  const b = i < j ? j : i;
  const tr = trackerFor(sys);
  const key = pairKey(a, b);
  let e = tr.pairs.get(key);
  if (!e) {
    e = { i: a, j: b, dwell: 0, seen: -1 };
    tr.pairs.set(key, e);
  }
  e.dwell += 1;
  e.seen = tr.step;
}

/** init: no pair history survives a re-seed. */
export function clearDishCoalesce(sys) {
  sys._coalesce = null;
  sys._coalesceFields = null;
}

/** Breed: a recycled slot starts with no pair history (B1's rule). */
export function clearDishCoalesceSlot(sys, idx) {
  const tr = sys._coalesce;
  if (!tr) return;
  for (const [key, e] of tr.pairs) {
    if (e.i === idx || e.j === idx) tr.pairs.delete(key);
  }
}

const HEX6 = /^#([0-9a-f]{6})$/i;

/** The pair's membrane tint: the two bodies' colours averaged in sRGB,
 *  or null when either colour is not a #rrggbb hex (fail-closed). */
export function blendPairTint(colorA, colorB) {
  const ma = HEX6.exec(String(colorA ?? ''));
  const mb = HEX6.exec(String(colorB ?? ''));
  if (!ma || !mb) return null;
  const na = parseInt(ma[1], 16);
  const nb = parseInt(mb[1], 16);
  const ch = (shift) => Math.round((((na >> shift) & 255) + ((nb >> shift) & 255)) / 2);
  const v = (ch(16) << 16) | (ch(8) << 8) | ch(0);
  return `#${v.toString(16).padStart(6, '0')}`;
}

/**
 * End-of-step: advance the dwell clock, drain pairs that left contact,
 * purge pairs touching dead bodies, and compose the system's merge
 * fields into sys._coalesceFields: [{ x, y, r, f, tint }] at each active
 * pair's contact midpoint, radius from the pair's discs, strongest
 * first (then canonical pair order), capped at COALESCE_MAX_FIELDS.
 * Under reduced-motion the composed list is empty — the state still
 * tracks, so un-stilling resumes mid-merge honestly.
 */
export function stepDishCoalesce(sys, { reducedMotion = false } = {}) {
  const empty = () => {
    sys._coalesceFields = EMPTY_FIELDS;
  };
  if (sys._coalesceOn === false) {
    empty();
    return;
  }
  const tr = sys._coalesce;
  if (!tr) {
    empty();
    return;
  }
  tr.step += 1;
  const fedStep = tr.step - 1;
  for (const [key, e] of tr.pairs) {
    if (sys.alive[e.i] !== 1 || sys.alive[e.j] !== 1) {
      tr.pairs.delete(key);
      continue;
    }
    if (e.seen !== fedStep) {
      e.dwell -= COALESCE_DRAIN_PER_STEP;
      if (e.dwell <= 0) tr.pairs.delete(key);
    }
  }
  if (reducedMotion) {
    empty();
    return;
  }
  const baseR = sys._layout ? Number(sys._layout.contactRadius) || 0 : 0;
  if (!(baseR > 0) || tr.pairs.size === 0) {
    empty();
    return;
  }
  const fields = [];
  for (const e of tr.pairs.values()) {
    const f = coalesceFactor(e.dwell);
    if (!(f > 0)) continue;
    const ri = contactBodyRadius(baseR, sys.scale[e.i], sys.contactTrim[e.i]);
    const rj = contactBodyRadius(baseR, sys.scale[e.j], sys.contactTrim[e.j]);
    if (!(ri > 0) || !(rj > 0)) continue;
    const dx = sys.x[e.j] - sys.x[e.i];
    const dy = sys.y[e.j] - sys.y[e.i];
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > (ri + rj) * COALESCE_MAX_GAP) continue;
    const tint = blendPairTint(sys.color[e.i], sys.color[e.j]);
    if (!tint) continue;
    fields.push({
      x: (sys.x[e.i] + sys.x[e.j]) / 2,
      y: (sys.y[e.i] + sys.y[e.j]) / 2,
      r: Math.min(ri, rj) * COALESCE_FIELD_RADIUS_K * (0.55 + 0.45 * f),
      f,
      tint,
      _i: e.i,
      _j: e.j,
    });
  }
  fields.sort((a, b) => b.f - a.f || a._i - b._i || a._j - b._j);
  const capped = fields.slice(0, COALESCE_MAX_FIELDS).map(({ x, y, r, f, tint }) => ({ x, y, r, f, tint }));
  sys._coalesceFields = capped.length ? capped : EMPTY_FIELDS;
}

const EMPTY_FIELDS = Object.freeze([]);

/** The system's current composed merge fields (never null). */
export function coalescenceFields(sys) {
  return (sys && sys._coalesceFields) || EMPTY_FIELDS;
}

const EMPTY_PAIRS = Object.freeze([]);

/**
 * The tracked pairs whose merge factor is above zero — [{ i, j, f }]
 * in canonical pair order. The read API B3's pigment exchange
 * (dishPigment.mjs, #1412) consumes: the dwell law stays written
 * here, once; readers never touch the tracker. Run after
 * stepDishCoalesce, which has already purged pairs touching dead
 * bodies and drained the ones that left contact.
 */
export function coalescePairs(sys) {
  const tr = sys && sys._coalesce;
  if (!tr || tr.pairs.size === 0) return EMPTY_PAIRS;
  const out = [];
  for (const e of tr.pairs.values()) {
    const f = coalesceFactor(e.dwell);
    if (f > 0) out.push({ i: e.i, j: e.j, f });
  }
  if (out.length === 0) return EMPTY_PAIRS;
  out.sort((a, b) => a.i - b.i || a.j - b.j);
  return out;
}
