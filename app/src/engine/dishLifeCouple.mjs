// dishLifeCouple.mjs — DISH LIFE coupling: the READ side of the field culture (#1923 Phase 2, slice A: SCALE;
// slice B: FIELD glyph breathing).
//
// Phase 1 (#1994) made the stage PUBLISH: a persistent invisible culture, seeded from the stage, evolving
// while the performer plays, its `level` / `activity` readable on the stage's stable `publishedField`
// holder. This module is where consumers read that publication — THE shared seam, built once for every
// consumer the ruling names (scale in slice A; FIELD glyph breathing here in slice B; the pattern modes
// and CONTENT backgrounds in later slices of #1923). A consumer never touches the culture or the stage:
// it samples this seam.
//
// Matt's rulings (2026-11-06, on #1923): the on-switch is coupling ABOVE ZERO — no chip, no toggle; the
// dial starts at 0 and the performer raises it. First modulation = SCALE: marks swell where the culture
// is alive, shrink where it is dead. Second modulation = BREATH: the field's ACTIVITY under a glyph
// drives the DEPTH of the breath it already has (the kineme breath driver, engine/kineme.js) — a lively
// patch breathes deeper, a dead patch shallower, a mid patch exactly its own breath. Depth is the
// honest axis: the breath's RATE is its phase law (an anchored function of loop time), and a
// per-mark rate change cannot be written as a pure function of (time, phase) — it would have to
// integrate, and the anchor at driver time 0 would break. Depth scales the existing oscillation's
// amplitude, so the anchor stays exact and the phase never jumps. One-way influence is law: this
// seam reads the holder's live arrays and writes nothing back — not into the culture, not into the
// holder.
//
// The four-part admission test, as this seam passes it:
//   SEEDED / REPLAYABLE  every function here is pure over (published field, coupling, item). The dial and
//                        the shed ride the recorded input stream (liveLoop stamps `dishField` +
//                        `dishFieldCoupling`), so a take replays its coupling exactly, frame by frame.
//   SHEDDABLE            effectiveCoupling folds the governor's CULTURE HELD (shed ≥ 2) to 0: under that
//                        cut the coupling reads as zero and the frame is the uncoupled frame, whole —
//                        never a degraded half-effect. (Trickle, shed 1, leaves the dial live: the field
//                        itself steps slower, and consumers read the slower field.)
//   LOCK-RESPECTING      the applier skips the artist's still-pinned marks (the #1128 pin every driver
//                        honours), and the marks it can reach are the placement SoA only — FIELD form
//                        items are built outside the SoA, so the poem is structurally out of reach.
//   LOG-ACCOUNTABLE      no silent state: the acting strength is stamped on the resolver input each
//                        frame it acts (see liveLoop), beside the shed on the culture stamp itself.

/** The coupling dial's range: 0 = nothing reads the field; 1 = the full ruled effect. */
export const COUPLING_MAX = 1;
/** The field level that is neutral for scale: a mark over a half-alive cell keeps its dealt size. */
export const SCALE_NEUTRAL_LEVEL = 0.5;
/**
 * The most the coupling may move a mark's scale, as a fraction of its dealt scale, at full dial and an
 * extreme level: alive (level 1) → ×1.40, dead (level 0) → ×0.60, centred on the neutral level above.
 */
export const SCALE_SWELL = 0.4;
/** The governor's top culture shed step (CULTURE HELD — the stage's SHED_STEPS hold): coupling reads 0. */
export const SHED_HOLD = 2;
/** Slice B — the field activity that is neutral for breath: a glyph over a half-active cell breathes its own breath. */
export const BREATH_NEUTRAL_ACTIVITY = 0.5;
/**
 * Slice B — the most the coupling may move a glyph's breath DEPTH, as a fraction of its dealt depth, at
 * full dial and an extreme activity: lively (activity 1) → ×1.60, dead (activity 0) → ×0.40. The floor
 * is a shallower breath, never silence — the living-motion floor's law is that the canvas never sits
 * still, and a dead patch of culture is not a dead patch of stage.
 */
export const BREATH_SWELL = 0.6;

const clamp01 = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0);

/** A dial value, clamped to the ruled range; junk reads as 0 (off — the safe direction). Pure. */
export function clampCoupling(v) {
  return Math.min(COUPLING_MAX, clamp01(v));
}

/**
 * The coupling that ACTS on a frame: the performer's dial, folded by the governor's culture shed.
 * Shed 0/1 (catch up / trickle) pass the dial through; shed ≥ SHED_HOLD (held) reads as 0. Pure.
 */
export function effectiveCoupling(dial, shed = 0) {
  return (shed | 0) >= SHED_HOLD ? 0 : clampCoupling(dial);
}

/**
 * The scale factor for one mark: 1 + coupling × (level − neutral) × 2 × SWELL. Level and coupling are
 * clamped, so the factor always lands in [1 − SWELL, 1 + SWELL] and is exactly 1 at the neutral level
 * (and at coupling 0, for any level). Pure.
 */
export function cultureScaleFactor(level, coupling) {
  const c = clampCoupling(coupling);
  if (!(c > 0)) return 1;
  return 1 + c * (clamp01(level) - SCALE_NEUTRAL_LEVEL) * 2 * SCALE_SWELL;
}

/**
 * Slice B — the breath-depth factor for one glyph: 1 + coupling × (activity − neutral) × 2 ×
 * BREATH_SWELL. Activity and coupling are clamped, so the factor always lands in
 * [1 − BREATH_SWELL, 1 + BREATH_SWELL] and is exactly 1 at the neutral activity (and at coupling 0,
 * for any activity). It multiplies the kineme breath driver's own term, so at factor 1 the breath
 * is the glyph's dealt breath, number for number. Pure.
 */
export function cultureBreathFactor(activity, coupling) {
  const c = clampCoupling(coupling);
  if (!(c > 0)) return 1;
  return 1 + c * (clamp01(activity) - BREATH_NEUTRAL_ACTIVITY) * 2 * BREATH_SWELL;
}

/**
 * The sampler over a stage's published field — the one read every coupling consumer shares.
 * `published` is the stage's stable holder ({ active, cols, rows, gen, level, activity }); the sampler
 * closes over the holder's LIVE arrays (no copy — the holder's read-this-frame contract: sample the
 * frame you are handed it). Returns null when no field is published, so a consumer's off path is a
 * null check, never a stale read.
 *   sample(x, y, out) — nearest cell for the canvas point; writes { level, activity } into `out` and
 *   returns true, or false outside the canvas (the consumer leaves such a mark alone).
 */
export function fieldSampler(published, canvasW, canvasH) {
  if (!published || published.active !== true || !published.level || !published.activity) return null;
  const { cols, rows, gen, level, activity } = published;
  if (!(cols > 0 && rows > 0)) return null;
  const W = Number(canvasW) || 1;
  const H = Number(canvasH) || 1;
  return {
    cols,
    rows,
    gen,
    sample(x, y, out) {
      const cx = Math.floor((x / W) * cols);
      const cy = Math.floor((y / H) * rows);
      if (!(cx >= 0 && cx < cols && cy >= 0 && cy < rows)) return false;
      const i = cy * cols + cx;
      out.level = level[i];
      out.activity = activity[i];
      return true;
    },
  };
}

/**
 * The scale consumer's applier, in the buildPlacements ephemeral-pass shape (the kineme drivers'
 * discipline): folds the culture's scale factor into the SoA's stage-C scale channels at each mark's
 * presented position. ctx = { coupling, sampler } with the coupling ALREADY shed-folded by the caller.
 * Scale needs no undo: stage C recomputes it from the recipe on every buildPlacements call, so the
 * fold never accumulates (the kineme scale fold's precedent). Marks the artist pinned still
 * (`still[k]`) are skipped, as every driver skips them. Returns how many marks were moved (0 when the
 * gate is closed: no ctx, dial 0, or no sampler — the caller can then prove the pass was a no-op).
 */
export function applyCultureScale(soa, ctx, still = null) {
  if (!soa || !ctx || !(ctx.coupling > 0) || !ctx.sampler || typeof ctx.sampler.sample !== 'function') return 0;
  const n = soa.n | 0;
  const out = { level: 0, activity: 0 };
  let touched = 0;
  for (let k = 0; k < n; k++) {
    if (still && still[k]) continue;
    if (!ctx.sampler.sample(soa.x[k], soa.y[k], out)) continue;
    const f = cultureScaleFactor(out.level, ctx.coupling);
    if (f === 1) continue;
    soa.scale[k] *= f;
    soa.scaleY[k] *= f;
    touched++;
  }
  return touched;
}
