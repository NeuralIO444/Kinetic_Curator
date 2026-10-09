// biology/lifecycle.js — #793: the lifecycle driver for living forms.
//
// Pure policy decisions over the aggregates that engine/kernel/sample/growth.js
// grows. Mechanism lives in GrowthHooks (cellAge, age01, fadeWeight,
// clearGrowth, regrowGrowth); this module is the policy — WHEN to fade, clear,
// and regrow. Deterministic and browser-free: every function here is a pure
// function of (aggregate stats, policy, tick), so the selfcheck exercises the
// whole lifecycle without a renderer.
//
// The live wiring: gl/liveResolve.mjs consults decideLifecycle() at each
// growth-tick advance and performs the regrow through GrowthHooks; engine/
// buildPlacements.js applies fadeForAge() to per-item alpha for dla/eden
// layers (the same alpha channel stage C already owns — the render path is
// untouched).

import { GrowthHooks, liveCount, liveCell } from '../engine/kernel/sample/growth.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Read the vital signs of one aggregate at its current tick.
 * O(cells) — trivial next to the growth itself.
 * Reads the LIVE window only (#1242): cells[0..head) have aged out and
 * must not count toward population, age, or saturation.
 */
export function assessAggregate(agg) {
  const tick = agg.tick;
  const n = liveCount(agg);
  let oldestAge = 0;
  let sumAge01 = 0;
  for (let k = 0; k < n; k++) {
    const cell = liveCell(agg, k);
    const age = GrowthHooks.cellAge(cell, tick);
    if (age > oldestAge) oldestAge = age;
    sumAge01 += GrowthHooks.age01(cell.birth, tick);
  }
  return {
    cellCount: n,
    oldestAge,
    meanAge01: n ? sumAge01 / n : 0,
    saturation01: clamp01(n / GrowthHooks.constants.MAX_GROWTH_CELLS),
  };
}

/**
 * The policy decision for one form at one tick. Returns
 * { action: 'none' } or { action: 'regrow', reason }.
 *
 * Triggers (OR'd):
 *  - population: cellCount >= softCap — the form is getting unreadable;
 *    rebirth keeps it legible well before the 2048 hard cap.
 *  - lifespan: oldestAge >= maxLifespan — natural death; nothing lives forever.
 *  - senescence: meanAge01 >= regrowMeanAge — the form is mostly old growth.
 * All three are gated by minLifetime so no tuning can thrash rebirth.
 */
export function decideLifecycle(stats, growth, tick) {
  const g = growth || {};
  const age = Number.isFinite(tick) ? tick : 0;
  if (age < (g.minLifetime ?? 0)) return { action: 'none', reason: 'young' };
  if (stats.cellCount >= (g.softCap ?? Infinity)) {
    return { action: 'regrow', reason: `population ${stats.cellCount} >= softCap ${g.softCap}` };
  }
  if (stats.oldestAge >= (g.maxLifespan ?? Infinity)) {
    return { action: 'regrow', reason: `oldest cell ${stats.oldestAge}t >= maxLifespan ${g.maxLifespan}t` };
  }
  if (stats.meanAge01 >= (g.regrowMeanAge ?? Infinity)) {
    return { action: 'regrow', reason: `mean age ${stats.meanAge01.toFixed(2)} >= ${g.regrowMeanAge}` };
  }
  return { action: 'none', reason: 'alive' };
}

/**
 * Fade factor for one cell's age01 under policy. Drives
 * GrowthHooks.fadeWeight: 1 while young, easing to 0 as the cell fully ages.
 * Applied per-item in buildPlacements — old growth dissolves instead of
 * popping, and because young cells are always being born (cellsPerTick floors
 * at 1), the form never goes fully dark: subtle motion and vibe always.
 */
export function fadeForAge(age01, growth) {
  const g = growth || {};
  const start = Number.isFinite(g.fadeStart) ? g.fadeStart : 0;
  const end = Number.isFinite(g.fadeEnd) ? g.fadeEnd : 1;
  const a = clamp01(Number.isFinite(age01) ? age01 : 0);
  if (a <= start) return 1;
  const span = Math.max(1e-6, end - start);
  return GrowthHooks.fadeWeight(clamp01((a - start) / span));
}

// ── Introspection for the DEV panel (not on the hot path) ───────────────────

const _stateByLayer = new Map(); // layerId -> { mode, gen, tick, stats, decision, at }

/** Recorded by the live wiring once per frame per growth layer. */
export function recordLifecycleState(layerId, entry) {
  _stateByLayer.set(layerId, { ...entry, at: Date.now() });
  if (_stateByLayer.size > 16) {
    const first = _stateByLayer.keys().next().value;
    _stateByLayer.delete(first);
  }
}

/** Prune entries for layers that no longer exist; returns the live map. */
export function getLifecycleState(liveIds) {
  if (liveIds) {
    for (const k of [..._stateByLayer.keys()]) {
      if (!liveIds.has(k)) _stateByLayer.delete(k);
    }
  }
  return _stateByLayer;
}
