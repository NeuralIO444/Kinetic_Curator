// dishLifeCouple.mjs — DISH LIFE coupling: the READ side of the field culture (#1923 Phase 2, slice A: SCALE;
// slice B: FIELD glyph breathing; slice C: the pattern modes).
//
// Phase 1 (#1994) made the stage PUBLISH: a persistent invisible culture, seeded from the stage, evolving
// while the performer plays, its `level` / `activity` readable on the stage's stable `publishedField`
// holder. This module is where consumers read that publication — THE shared seam, built once for every
// consumer the ruling names (scale in slice A; FIELD glyph breathing in slice B; the pattern modes
// here in slice C; CONTENT backgrounds in a later slice of #1923). A consumer never touches the culture
// or the stage: it samples this seam.
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
/** Slice C — the field activity that is neutral for a pattern's motion: a half-active dish leaves the dealt DRIFT exact. */
export const PATTERN_NEUTRAL_ACTIVITY = 0.5;
/**
 * Slice C — the most the coupling may move a pattern's DRIFT, as a fraction of its dealt drift, at full
 * dial and an extreme mean activity: lively (activity 1) → ×1.50, dead (activity 0) → ×0.50. The bias is
 * MULTIPLICATIVE on the dealt drift, so a pattern dealt still (DRIFT 0) stays still — the coupling never
 * invents motion — and dealt motion is never fully frozen (the floor is a slower motion, not a stop).
 * It lands on the modes whose DRIFT is an amplitude over a periodic anchor (QUILT's rotation breath,
 * GLYPH's and PICTURE's scale pulse): scaling the amplitude keeps the anchor and the zero-crossings, the
 * slice-B depth defence. It never lands on a RATE over absolute loop time (FIELD's pan, TIDES' τ): a rate
 * bias at time t would move the texture by (factor − 1) × rate × t in one step — a teleport, not a bias.
 */
export const PATTERN_DRIFT_SWELL = 0.5;
/** Slice C — the field level that is neutral for a TIDES cell: a cell over a half-alive patch keeps its dealt value. */
export const TIDES_NEUTRAL_LEVEL = 0.5;
/**
 * Slice C — the most the coupling may shift a TIDES cell's field value, at full dial and an extreme
 * level: alive (level 1) → +0.25, dead (level 0) → −0.25 — up to three quarters of a state band (the
 * bands are 1/3 wide), so a strong colony can lift a borderline cell one state and a dead patch can
 * drop one, but the mode's own noise weather still decides most cells. The issue's own words for this
 * consumer: cells light with colony activity — LEVEL (where the culture is) drives the readout's
 * magnitude, the same doctrine as slice A's scale; ACTIVITY (where it moves) drives motion, as in B.
 */
export const TIDES_LEVEL_SWELL = 0.25;

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

// ---------------------------------------------------------------- slice C: the pattern modes
//
// Pattern modes place no items — a layer resolves to ONE generated texture from its dealt parameters —
// so this consumer cannot sample per item like slices A/B. It reads field STATISTICS through the seam
// and biases EXISTING parameters of the mode, on the resolved block only (the #1110 patternAudio
// precedent: resolved-block biases, replaced never mutated, the stored layer.pattern untouched):
//   · the dish-mean ACTIVITY scales DRIFT for QUILT / GLYPH / PICTURE (their drift is an amplitude);
//   · the LEVEL under each TIDES cell shifts that cell's field value (a regional statistic).
// FIELD (pattern mode), REWRITE and BLOCKS take no bias: FIELD's drift is a pan RATE over absolute
// loop time (a rate bias teleports the texture), REWRITE's continuous knobs are baked into its growth
// plan at assign time and its drift is an integer step clock, and BLOCKS is a still whose only
// parameters bake the dealt partition. The survey is recorded in STAGING-REPORT-1923-P2C.md.
//
// Patterns are drawn by the renderer AFTER the resolve returns, and the stage applies (steps) the
// culture at the bottom of the same resolve — mutating the holder's live arrays in place. So the
// regional statistic cannot ride as a sampler over the live arrays (slices A/B sample during the
// resolve, the frame they are handed the publication): the resolver SNAPSHOTS the level grid here,
// at the coupling read, and the snapshot — plain data, gen-stamped — rides the block to the draw.
// Same publication slices A/B read, one frame behind, never a post-step read.

/**
 * The published field's means over the whole dish: { level, activity }, each in [0, 1]. Null when no
 * field is published (the same gate as fieldSampler). Pure: reads the holder's arrays, writes nothing.
 */
export function fieldMean(published) {
  if (!published || published.active !== true || !published.level || !published.activity) return null;
  const { cols, rows, level, activity } = published;
  const n = (cols | 0) * (rows | 0);
  if (!(n > 0) || level.length < n || activity.length < n) return null;
  let lv = 0;
  let ac = 0;
  for (let i = 0; i < n; i++) {
    lv += level[i];
    ac += activity[i];
  }
  return { level: lv / n, activity: ac / n };
}

/**
 * Slice C — the DRIFT factor for a pattern mode whose drift is an amplitude: 1 + coupling ×
 * (meanActivity − neutral) × 2 × PATTERN_DRIFT_SWELL. Exactly 1 at the neutral activity (any dial) and
 * at coupling 0 (any activity); bounded to [1 − PATTERN_DRIFT_SWELL, 1 + PATTERN_DRIFT_SWELL]. The
 * caller multiplies the DEALT drift by it (and clamps to drift's [0, 1] domain): dealt 0 stays 0.
 * Pure.
 */
export function culturePatternDriftFactor(activity, coupling) {
  const c = clampCoupling(coupling);
  if (!(c > 0)) return 1;
  return 1 + c * (clamp01(activity) - PATTERN_NEUTRAL_ACTIVITY) * 2 * PATTERN_DRIFT_SWELL;
}

/**
 * A snapshot of the published LEVEL grid: { cols, rows, gen, level } with `level` a COPY of the
 * holder's array as of this call. Null when no field is published (fieldMean's gate). This is the one
 * deliberate copy on the coupling's read side: the pattern draw happens after the resolve that read
 * the publication, and the culture steps (in place) at the bottom of that resolve — a live reference
 * would read the NEXT generation, breaking the one-frame-behind contract slices A/B keep. The copy is
 * taken only while the dial is up and a TIDES layer is resolving. Pure with respect to the holder:
 * the copy is the caller's; the holder's arrays are never written.
 */
export function fieldLevelGrid(published) {
  if (!published || published.active !== true || !published.level) return null;
  const { cols, rows, gen, level } = published;
  const n = (cols | 0) * (rows | 0);
  if (!(n > 0) || level.length < n) return null;
  return {
    cols,
    rows,
    gen: Number.isFinite(Number(gen)) ? Number(gen) : -1,
    level: Float32Array.from(level.subarray(0, n)),
  };
}

/**
 * The level of a level-grid snapshot at normalized frame coords (x01, y01 in [0, 1] across the whole
 * frame — a pattern texture spans the frame, so a cell's centre is its normalized position): nearest
 * cell, the fieldSampler discipline at grid resolution. Junk or outside reads the NEUTRAL level, so a
 * bad coordinate biases nothing. Pure.
 */
export function cultureLevelAt(grid, x01, y01) {
  if (!grid || !grid.level || !(grid.cols > 0 && grid.rows > 0)) return TIDES_NEUTRAL_LEVEL;
  if (!Number.isFinite(Number(x01)) || !Number.isFinite(Number(y01))) return TIDES_NEUTRAL_LEVEL;
  const cx = Math.floor(Number(x01) * grid.cols);
  const cy = Math.floor(Number(y01) * grid.rows);
  if (!(cx >= 0 && cx < grid.cols && cy >= 0 && cy < grid.rows)) return TIDES_NEUTRAL_LEVEL;
  return clamp01(grid.level[cy * grid.cols + cx]);
}

/**
 * Slice C — the additive shift for one TIDES cell: coupling × (level − neutral) × 2 ×
 * TIDES_LEVEL_SWELL, in [−TIDES_LEVEL_SWELL, +TIDES_LEVEL_SWELL]; exactly 0 at the neutral level (any
 * dial) and at coupling 0 (any level). The raster adds it to the cell's dealt field value and clamps
 * to [0, 1] with the value's own clamp (tidesCellOf). Pure.
 */
export function cultureTidesShift(level, coupling) {
  const c = clampCoupling(coupling);
  if (!(c > 0)) return 0;
  return c * (clamp01(level) - TIDES_NEUTRAL_LEVEL) * 2 * TIDES_LEVEL_SWELL;
}
