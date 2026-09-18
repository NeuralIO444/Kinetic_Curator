// governorXray — the data behind the dev-only X-ray guide view (backend
// hardening 5/6, "Diagnostics as guide").
//
// Given the cost registry (hardening 3/6), the measured costs, and the
// current governor state, build the live pass chain: effect name, declared
// tier, declared estimate, measured cost, and CURRENT shed state.
//
// Pure (no React, no store) so the selfcheck can prove the X-ray reflects
// the registry honestly. The silent-cull trap rule applies here too: the
// UI never shows an effect as active while the governor has it shed — a
// row is marked shed exactly when the governor's state says it is.

import { COST_TIER_INFO, shedOrder } from './costTiers.mjs';
import { SHED_STEPS } from './governorEventLog.mjs';

/** Bytes → "8.3 MB" style. */
export function formatMemoryMB(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${mb.toFixed(0)} MB` : `${mb.toFixed(1)} MB`;
}

/**
 * Build the X-ray snapshot.
 *
 * @param {object} args
 *   { tiers: [{id, tier, timeMs, memoryBytes, notes}],        // allCostTiers()
 *     measuredMs: (id) => number|undefined | Record<string, number>,
 *     shed: { perfTier1, renderScale, assetThin, perfClampOverride,
 *             slowRender, watchdogTripped } }                  // store state
 * @returns { cuts: [...], passes: [...] }
 *   cuts: one row per shed-ladder step with its live state:
 *     { step, cutKind, label, active, state }
 *   passes: one row per registered pass, in shed-first order:
 *     { id, tier, tierName, declaredMs, measuredMs, memoryMB, notes,
 *       shed, shedBy }
 */
export function buildXray({ tiers = [], measuredMs = {}, shed = {} }) {
  // Accepts a lookup fn, a plain { id: ms } map, or the item-3 measurement
  // shape { id: { ms, method, draws } }.
  const asMs = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (v && typeof v.ms === 'number' && Number.isFinite(v.ms)) return v.ms;
    return undefined;
  };
  const lookup = typeof measuredMs === 'function'
    ? (id) => asMs(measuredMs(id))
    : (id) => asMs(measuredMs?.[id]);
  const s = {
    perfTier1: !!shed.perfTier1,
    renderScale: Number.isFinite(Number(shed.renderScale)) ? Number(shed.renderScale) : 1,
    assetThin: !!shed.assetThin,
    perfClampOverride: shed.perfClampOverride ?? null,
    slowRender: !!shed.slowRender,
    watchdogTripped: !!shed.watchdogTripped,
    quality: shed.quality,
    qualityShedFrom: shed.qualityShedFrom ?? null,
  };

  const cuts = [
    {
      step: SHED_STEPS.renderScale, cutKind: 'renderScale',
      label: 'resolution scale (dynamic)',
      active: s.renderScale < 1 - 1e-9,
      state: `${Math.round(s.renderScale * 100)}%`,
    },
    {
      step: SHED_STEPS.quality, cutKind: 'quality',
      label: 'quality tier step',
      // #264 — governor-shed quality is tracked (qualityShedFrom); a
      // user-chosen tier is not a shed, so the row stays informational then.
      active: s.qualityShedFrom != null && s.quality !== s.qualityShedFrom,
      state: s.qualityShedFrom != null ? `SHED → ${s.quality}` : 'follows the cut ladder (step 2)',
    },
    {
      step: SHED_STEPS.perfTier1, cutKind: 'perfTier1',
      label: 'mirror/gloss/ACCUM (tier-1 passes)',
      active: s.perfTier1,
      state: s.perfTier1 ? 'SHED' : 'active',
    },
    {
      step: SHED_STEPS.assetThin, cutKind: 'assetThin',
      label: 'asset thinning (highest-cost assets drop first)',
      active: s.assetThin,
      state: s.assetThin ? 'SHED' : 'active',
    },
    {
      step: SHED_STEPS.countClamp, cutKind: 'countClamp',
      label: 'count clamp (live only)',
      active: !!s.perfClampOverride,
      state: s.perfClampOverride ? `count → ${s.perfClampOverride.count}` : 'not applied',
    },
    {
      step: SHED_STEPS.slowRender, cutKind: 'slowRender',
      label: 'motion freeze (slowRender)',
      active: s.slowRender,
      state: s.slowRender ? 'FROZEN' : 'running',
    },
    {
      step: SHED_STEPS.watchdog, cutKind: 'watchdog',
      label: 'watchdog hard stop',
      active: s.watchdogTripped,
      state: s.watchdogTripped ? 'TRIPPED (manual resume)' : 'armed',
    },
  ];

  // Passes: honest shed state. The governor's only per-pass shed is cut 3
  // (perfTier1 covering tier-1 passes — see perfTier1Passes() in
  // governorCuts.js). Resolution scaling drops pixels, not passes; asset
  // thinning drops assets, not passes. FX layers are never culled (#192).
  const ids = shedOrder(tiers.map((t) => t.id), lookup);
  const byId = new Map(tiers.map((t) => [t.id, t]));
  const passes = ids.map((id) => {
    const t = byId.get(id) ?? { id, tier: 3, timeMs: 0, memoryBytes: 0, notes: '' };
    const tierShed = t.tier === 1 && s.perfTier1;
    const measured = lookup(id);
    return {
      id,
      tier: t.tier,
      tierName: COST_TIER_INFO[t.tier]?.name ?? 'unknown',
      declaredMs: t.timeMs,
      measuredMs: typeof measured === 'number' && Number.isFinite(measured) ? measured : null,
      memoryMB: formatMemoryMB(t.memoryBytes),
      notes: t.notes ?? '',
      shed: tierShed,
      shedBy: tierShed ? 'perfTier1 (cut 3)' : null,
    };
  });

  return { cuts, passes };
}
