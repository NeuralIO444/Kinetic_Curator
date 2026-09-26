// sceneCost — honest FX-stack weight for the PLAY readout (#485 R4).
//
// The tape fill + headroom needle (MasterBar/TapeCounter) already show the
// LIVE frame cost and its proximity to the shed floor. What nothing in
// production read — dev-X-ray-only until now — was the cost registry +
// measured costs. This module closes that half: given the active FX-layer
// stack, it sums bench-measured ms (measuredCosts.mjs) with the declared
// estimate (costTiers timeMs) as fallback.
//
// Honesty rules (same as the registry's own):
// - bench ms are 512x512-bench numbers, NOT frame math. They never go
//   against FRAME_BUDGET_MS here — the tape fill stays the only live truth.
// - unknown kinds add 0 and are listed, never invented.
// - pure (no React, no store): the component derives active kinds from
//   store layers via activeFxKinds() and reads only published inputs
//   (allCostTiers via getCostTier, MEASURED_COSTS). No new introspection
//   API, no ladder changes — presentation only.

import { getCostTier } from '../gl/costTiers.mjs';
import { MEASURED_COSTS } from '../gl/effects/measuredCosts.mjs';

/**
 * Layer effect kind → cost-registry id. Explicit, not convention-guessed:
 * builtins register as `builtin/<kind>` (bridge/builtinEffects.mjs),
 * GL passes as `fx/<kind>` (effects/fxShaders.mjs). The selfcheck asserts
 * every FX_EFFECT_DEFS kind resolves to a registered id, both ways.
 */
export const FX_KIND_TO_COST_ID = {
  rgbSplit: 'builtin/rgbSplit',
  grain: 'builtin/grain',
  invert: 'builtin/invert',
  posterize: 'builtin/posterize',
  scanlines: 'fx/scanlines',
  displace: 'fx/displace',
  tear: 'fx/tear',
  solarize: 'fx/solarize',
  edge: 'fx/edge',
  grade: 'fx/grade',
};

/** Registry id for one layer effect kind, or null when unmapped. */
export function costIdForFxKind(kind) {
  return Object.prototype.hasOwnProperty.call(FX_KIND_TO_COST_ID, kind)
    ? FX_KIND_TO_COST_ID[kind]
    : null;
}

function measuredMsFor(id) {
  const v = MEASURED_COSTS[id];
  return v && typeof v.ms === 'number' && Number.isFinite(v.ms) ? v.ms : undefined;
}

/**
 * Bench-cost weight of one FX stack.
 * @param {string[]} kinds — effect kinds, stack order (see activeFxKinds).
 * @returns {{ totalMs, shedFirstMs, count, measured, declared, unknown[] }}
 *   totalMs: Σ measured ms, else declared timeMs; unknown kinds add 0.
 *   shedFirstMs: the tier-1 (shed-first) subset of totalMs.
 */
export function sceneFxCost(kinds) {
  const list = Array.isArray(kinds) ? kinds : [];
  let totalMs = 0;
  let shedFirstMs = 0;
  let measured = 0;
  let declared = 0;
  const unknown = [];
  for (const kind of list) {
    const id = costIdForFxKind(kind);
    const decl = id ? getCostTier(id) : undefined;
    const m = id ? measuredMsFor(id) : undefined;
    if (m !== undefined) {
      totalMs += m;
      measured += 1;
      if (decl && decl.tier === 1) shedFirstMs += m;
    } else if (decl) {
      totalMs += decl.timeMs;
      declared += 1;
      if (decl.tier === 1) shedFirstMs += decl.timeMs;
    } else {
      unknown.push(kind);
    }
  }
  return { totalMs, shedFirstMs, count: list.length, measured, declared, unknown };
}

/**
 * Effect kinds on visible FX layers, in stack order. Hidden layers cost
 * nothing (skipped in render); content layers carry no effects.
 */
export function activeFxKinds(layers) {
  const out = [];
  for (const l of layers || []) {
    if (!l || l.type !== 'fx' || l.visible === false) continue;
    for (const fx of l.effects || []) {
      if (fx && typeof fx.kind === 'string') out.push(fx.kind);
    }
  }
  return out;
}
