/**
 * glassSort.mjs — #1129 PR1: translucent sort for glass-type instances.
 *
 * The quad pass composites premultiplied in a single pass
 * (gl.ONE, gl.ONE_MINUS_SRC_ALPHA) — the blend is right, but stacked
 * translucency only deepens correctly when instances arrive back-to-front.
 * This module orders the glass set back-to-front by z-tier before packing.
 *
 * Direction: ascending z-tier. Tier 0 is the back plate; higher tiers sit
 * nearer the viewer. That matches the parallax convention (higher tiers move
 * more with the camera) and CHIAROSCURO's phase 5 (haze falls on the distant
 * tiers).
 *
 * Slot-preserving: only glass-flagged instances move, and only relative to
 * each other. Non-glass instances keep their exact array positions, so the
 * RULES small-first order (overlap:false) and #565's first-frame z-fight fix
 * are untouched. Stable on z-tier ties (original index breaks ties), so the
 * order never flickers frame to frame.
 *
 * Returns a NEW array; the input is never mutated. buildPlacements pools
 * arrays by soa slot — a sorted array must never be stashed in the pool.
 *
 * GPU cost tier: 0 — the sort is CPU-side (one O(n log n) pass over the
 * glass set per placement build); zero GPU cost: no shader change, no new
 * pass, no new texture. Declared honestly per the governor rules.
 */
import { registerCostTier } from '../gl/costTiers.mjs';

registerCostTier('engine/glass-sort', {
  tier: 0, memoryBytes: 0, timeMs: 0.01,
  notes: '#1129 PR1: CPU-side back-to-front z-tier sort of glass instances; zero GPU cost (no shader/pass/texture change)',
});

/**
 * Order glass-flagged instances back-to-front by ascending z-tier.
 *
 * @param {Array} items — placement items, each optionally { glass, zTier }.
 * @returns {Array} a new array: the glass subsequence sorted back-to-front,
 *   spliced back into its original slots; everything else untouched.
 */
export function sortGlassInstances(items) {
  const n = items ? items.length : 0;
  if (n < 2) return items ? items.slice() : [];
  const slots = [];
  for (let i = 0; i < n; i++) {
    if (items[i] && items[i].glass) slots.push(i);
  }
  if (slots.length < 2) return items.slice();
  const sorted = slots
    .map((pos, k) => ({ pos, k, z: Number(items[pos].zTier) || 0 }))
    .sort((a, b) => (a.z - b.z) || (a.k - b.k))
    .map((e) => items[e.pos]);
  const out = items.slice();
  for (let k = 0; k < slots.length; k++) out[slots[k]] = sorted[k];
  return out;
}
