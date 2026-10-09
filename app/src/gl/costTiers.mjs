/**
 * costTiers.mjs — the cost-tier contract (backend hardening 3/6, arch Phase 3).
 * Browser-safe (no Node imports).
 *
 * #1239: the registry itself moved to the kernel
 * (app/src/engine/kernel/costRegistry.mjs) — this module re-exports it so
 * every gl-side consumer keeps working identically while the dependency
 * arrow flips to gl→kernel. Kernel fields declare tiers against the kernel
 * registry; the governor's shed ladder reads them from here.
 *
 * Only radialFanMultiplier stays defined here: it is forward-compatible
 * data whose radial-4/6/8 enum values live in unmerged PR #333
 * (feat/287-bio-drives), so it ships as gl-side data the shed ladder and
 * #333's `_organismItems` can both read.
 */

export {
  COST_TIER_INFO,
  TIER_COST_BANDS,
  registerCostTier,
  getCostTier,
  allCostTiers,
  tier1ShedIds,
  shedOrder,
} from '../engine/kernel/costRegistry.mjs';

/**
 * #287 bio-drives §6.1 — the radial-fan item multiplier (the TE half of
 * the manifesto: price the limitation honestly).
 *
 * An organism always emits its `bodyLen` spine items. The symmetry trait
 * appends extras around the head:
 *   'none' / 'stamp' → +0  (bodyLen items)
 *   'bilateral'      → +2  (the mirrored wing-ladder pair)
 *   'radial-N'       → +N  (the Haeckel fan: N arms around the heading)
 *
 * The multiplier is relative to the bilateral baseline (bodyLen+2), the
 * most expensive symmetry main knows today: a radial voice costs
 * (bodyLen+N)/(bodyLen+2)x what a bilateral voice costs at the same body
 * length. Non-radial symmetry returns 1 (no fan); unknown or malformed
 * ids also return 1 — the cost model never invents cost for modes it
 * doesn't recognize.
 *
 * Declared here (not at a #287 registration site) because the
 * radial-4/6/8 enum values live in unmerged PR #333
 * (feat/287-bio-drives): the fan code itself hasn't landed on main, so
 * this ships as forward-compatible data the governor's shed ladder and
 * #333's `_organismItems` can both read. Data + selfcheck only — no
 * ladder behavior change.
 */
export function radialFanMultiplier(symmetry, bodyLen = 2) {
  const m = /^radial-(\d+)$/.exec(String(symmetry ?? ''));
  if (!m) return 1;
  const folds = parseInt(m[1], 10);
  if (!Number.isFinite(folds) || folds < 3) return 1;
  const raw = Number(bodyLen);
  const body = Math.max(1, Math.min(7, Math.round(Number.isFinite(raw) ? raw : 2)));
  return (body + folds) / (body + 2);
}
