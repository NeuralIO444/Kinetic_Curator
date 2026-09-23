// governorCuts — the Showrunner's cut ORDER, as a pure module (#192).
//
// usePerformanceGovernor owns timing (sustain windows, cooldown); this
// module owns the ORDER of cuts. The order is the contract:
//
//   cut 1: dynamic resolution scaling (renderScale 1 → 0.75 → 0.5 → 0.33)
//          gated on the gpuSaturated signal (#259): fires only when the GPU
//          is the bottleneck — otherwise it only pixelates.
//   cut 2: quality tier step high → balanced → performance
//   cut 3: mirror/gloss/ACCUM shed (perfTier1 — independent, lower FPS floor)
//   cut 4: cost-aware asset thinning
//   cut 5: render-only count clamp below the PERF floor
//   cut 6: freeze motion via slowRender
//   cut 7: watchdog hard stop
//
// Phase 6 change: cuts 1–2 of the old ladder (FX simplify, then FX bypass —
// the fxShedLevel mechanism) are GONE. On the GPU, FX compositing is one
// extra FBO pair + one filter pass per wrap — 10–50x headroom — so shedding
// FX layers buys nothing and caused the silent-cull trap: an FX layer shown
// in the UI while its wrap was culled. The primary shed is now dynamic
// resolution scaling: render scale drops before anything is cut. FX layers
// are never culled in normal operation.
//
// Hardening 3/6: the ladder's per-effect knowledge now comes from the cost
// registry (gl/costTiers.mjs) instead of hard-coded comments. The ORDER
// above is unchanged — the contract — but the inputs are honest: cut 3's
// coverage is tier1ShedIds(), the memory gate on echoes is declared on
// accum/echo and enforced by the recipe, and the CI gate
// (gl/costTiers.selfcheck.mjs) proves declared tiers match measured GPU
// cost. Every cut is still a render-only overlay: it never writes
// layoutParams, never serializes into project JSON, and auto-clears on
// recovery — except the hard stop, which needs manual resume (panic-key
// precedent, #107).
//
// Kept pure (no React, no store) so the order is unit-testable — see
// gl/phase6.selfcheck.mjs, which asserts resolution sheds before effects
// and that no FX-culling cut exists.

import { tier1ShedIds } from '../gl/costTiers.mjs';

/**
 * #265 — when is the GPU the binding constraint? Cut 1 (resolution) may
 * only fire when dropping pixels can buy frames back: the GPU-implied rate
 * is below the shed floor AND at or below the rAF rate. The old predicate
 * also required rAF fps to stay healthy — false exactly when BOTH rates
 * were below the floor, the case where the GPU is demonstrably the
 * bottleneck and resolution is the one cut that would buy frames back.
 */
export function isGpuBinding(fps, gpuFps, shedFps) {
  return gpuFps < shedFps && gpuFps <= fps;
}

/**
 * #264 — the restore contract, declarative. Every kind nextGovernorCut can
 * produce MUST appear here: recovery iterates this table in REVERSE shed
 * order, so a shed cut with no entry here is a structural impossibility —
 * not a forgotten line in a hand-maintained block (the trap that left
 * quality shed forever). needsRestore is pure: a state snapshot plus
 * ctx { healthy } (the main ladder's recover condition). The hook binds
 * the restore actions per kind.
 *
 * Not here by design: cut 3 (perfTier1) is the independent mechanism with
 * its own hysteresis, and cut 7 (watchdog) is the hard stop — it needs
 * manual resume and never auto-restores.
 */
export const GOVERNOR_RESTORE_CUTS = [
  {
    kind: 'renderScale',
    needsRestore: (s, ctx) => ctx.healthy && Number(s.renderScale) < 1 - 1e-9,
    restoredLabel: 'PIXEL TRIM off — full pixels back',
  },
  {
    kind: 'quality',
    // #264 M1 — quality restores only when the GOVERNOR shed it
    // (qualityShedFrom tracks the tier it stepped down from); a
    // user-chosen tier is never "restored" over.
    needsRestore: (s, ctx) => ctx.healthy && s.qualityShedFrom != null,
    restoredLabel: 'tier restored',
  },
  {
    kind: 'assetThin',
    needsRestore: (s, ctx) => ctx.healthy && !!s.assetThin,
    restoredLabel: 'dead weight back — full cast',
  },
  {
    kind: 'countClamp',
    // The count clamp's premise is "still struggling at the lowest tier",
    // so it also clears on tier change — the nuance the old block carried.
    needsRestore: (s, ctx) => !!s.perfClampOverride && (ctx.healthy || s.quality !== 'performance'),
    restoredLabel: 'crowd control lifted',
  },
  {
    kind: 'slowRender',
    // #264 — the auto-clear applies ONLY to the cut-6 soft freeze. The
    // watchdog hard stop (source 'watchdog') needs manual resume.
    needsRestore: (s, ctx) => ctx.healthy && !!s.slowRender && s.slowRenderSource === 'cut6',
    restoredLabel: 'freeze frame off — motion back',
  },
];

/** Dynamic resolution ladder — the primary shed. GPU headroom means the
 *  live canvas can drop pixels before it drops anything visible. */
export const RENDER_SCALES = [1, 0.75, 0.5, 0.33];

/** The lowest render scale the ladder reaches. */
export const MIN_RENDER_SCALE = RENDER_SCALES[RENDER_SCALES.length - 1];

/**
 * Cut 3's coverage — the passes the independent perfTier1 mechanism sheds.
 * Read from the cost registry (tier 1 = "shed first": the ACCUM chain),
 * not hard-coded here. Resolved at call time: registrations land when the
 * effect modules load, so this must not be snapshotted at import time.
 * The shed ORDER is unchanged; this is the input the registry owns.
 *
 * @returns {string[]} effect ids at cost tier 1 (e.g. accum/fade, …).
 */
export function perfTier1Passes() {
  return tier1ShedIds();
}

/**
 * Decide the next governor cut, given the current governor state.
 *
 * @param {object} s
 *   { renderScale, quality, assetThin, perfClampOverride, effectiveCount, slowRender, gpuSaturated }
 *   gpuSaturated: the governor's GPU-saturation signal — the GPU-implied
 *   rate is the binding constraint (at/below the rAF rate and below the
 *   shed floor, see isGpuBinding). Cut 1 (renderScale) only fires when
 *   true: if the GPU is NOT the bottleneck, the bottleneck is main-thread
 *   JS and cutting resolution cannot recover frames — it only pixelates.
 *   Omitted (older callers, selfchecks) defaults to true: resolution still
 *   sheds first when the signal is unknown.
 * @returns {{ kind: string, label: string, ... } | null} the cut to apply,
 *   or null when the ladder is exhausted (the hook then holds — the
 *   watchdog is a separate, faster mechanism).
 */
export function nextGovernorCut(s) {
  const gpuSaturated = s.gpuSaturated !== false; // unknown signal: shed as before
  const scale = Number(s.renderScale);
  // Cut 1: dynamic resolution scaling. Unknown/NaN scale snaps to full.
  // Skipped outright when the GPU is not the bottleneck (#259): pixels
  // drop only when dropping pixels can buy frames back.
  const cur = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const next = gpuSaturated ? RENDER_SCALES.find((step) => step < cur - 1e-9) : undefined;
  if (next !== undefined) {
    return {
      kind: 'renderScale',
      scale: next,
      label: `PIXEL TRIM → ${Math.round(next * 100)}%`,
    };
  }

  // Cut 2: quality tier step (placement + particle budgets).
  if (s.quality === 'high') {
    return { kind: 'quality', quality: 'balanced', label: 'TIER DROP → BALANCED' };
  }
  if (s.quality === 'balanced') {
    return { kind: 'quality', quality: 'performance', label: 'TIER DROP → PERF' };
  }

  // Cut 4: cost-aware asset thinning. (Cut 3 — mirror/gloss/ACCUM — is the
  // independent perfTier1 mechanism at its own lower FPS floor; its pass
  // coverage is perfTier1Passes(), read from the cost registry.)
  if (!s.assetThin) {
    return { kind: 'assetThin', label: 'DEAD WEIGHT — costliest assets cut first' };
  }

  // Cut 5: render-only count clamp below the PERF floor. A live-only
  // performance cut must never be what a snapshot inherits, so this lands
  // on perfClampOverride, never on layoutParams.
  const eff = s.perfClampOverride?.count ?? s.effectiveCount;
  if (Number.isFinite(eff) && eff > 120) {
    const count = Math.max(80, Math.floor(eff * 0.7));
    return { kind: 'countClamp', count, label: `CROWD CONTROL → ${count} (live only)` };
  }

  // Cut 6: freeze motion. Reuses the tested slowRender path (pauses
  // evolve/ambient-drift/ACCUM/swarm). A still instrument beats a dead one.
  if (!s.slowRender) {
    return { kind: 'slowRender', label: 'FREEZE FRAME — motion held' };
  }

  // Ladder exhausted — hold. The watchdog (cut 7) is a separate mechanism.
  return null;
}

/**
 * Honest shed summary for the UI badge (#192, coordinates with #177).
 * Returns null when nothing is shed; otherwise a short list of what's cut.
 */
export function shedSummary(s) {
  const out = [];
  if (Number(s.renderScale) < 1 - 1e-9) {
    out.push(`pixel trim ${Math.round(Number(s.renderScale) * 100)}%`);
  }
  // #264 — governor-shed quality is a shed like any other: the badge shows
  // it. qualityShedFrom is only set by the governor's own shed, so a
  // user-chosen tier never appears here.
  if (s.qualityShedFrom != null && s.quality !== s.qualityShedFrom) {
    out.push(`tier → ${String(s.quality).toUpperCase()}`);
  }
  if (s.perfTier1) out.push('shine off');
  if (s.assetThin) out.push('dead weight cut');
  if (s.perfClampOverride) out.push(`crowd control → ${s.perfClampOverride.count}`);
  if (s.slowRender) out.push('freeze frame');
  if (s.watchdogTripped) out.push('watchdog — hard stop');
  return out.length ? out : null;
}

/**
 * #103 Track A — GPU-implied frame rate from the live loop's per-tick GPU
 * timing (stageTimings.gpuFrame, rolling-average ms reported by the live
 * loop via reportStage). Under vsync the rAF cadence lies: the GPU can be
 * saturated (fill-rate, ACCUM ping-pong) while FPS reads 60. Absent timing
 * (no live loop, no samples yet) this returns Infinity so the governor
 * reduces exactly to the rAF rate.
 */
export function gpuImpliedFps(stageTimings) {
  const ms = Number(stageTimings?.gpuFrame) || 0;
  return ms > 0 ? 1000 / ms : Infinity;
}

/**
 * The rate the governor's sustain windows run against: the worse of the
 * rAF rate and the GPU-implied rate. A GPU-bound instrument (rAF 60, GPU
 * frame 40ms → 25fps) trips the same sustain windows as sustained low FPS.
 */
export function effectiveGovernorFps(fps, stageTimings) {
  return Math.min(fps, gpuImpliedFps(stageTimings));
}
