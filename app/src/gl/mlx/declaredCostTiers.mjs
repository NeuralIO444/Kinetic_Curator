/**
 * Declared cost-tier registry — MLX harness intelligence (backend hardening 6/6).
 *
 * Browser-safe wrapper over declaredCostTiers.json (the single source of truth).
 * These tiers are HAND-DECLARED: they stand in for the governor cost-tier
 * contract until per-effect registration (architecture Phase 3) and measured
 * tiers (backend-hardening item 5) land. The learned cost model predicts a
 * tier from shader source alone; app/scripts/predictCostTier.mjs fails when a
 * prediction disagrees with this table.
 */

import declared from './declaredCostTiers.json' with { type: 'json' };

export const DECLARED_TIERS_SCHEMA = declared.schema;

/** All effect kinds with a declared tier. */
export function declaredKinds() {
  return Object.keys(declared.effects);
}

/**
 * Declared tier for an effect kind.
 * @returns {{ tier: number, rationale: string }} — throws naming the kind if undeclared.
 */
export function declaredTier(kind) {
  const rec = declared.effects[kind];
  if (!rec) throw new Error(`[mlx] no declared cost tier for effect "${kind}" — add it to declaredCostTiers.json`);
  return { tier: rec.tier, rationale: rec.rationale };
}

/** Human description of a tier (0..3). */
export function tierName(tier) {
  return declared.tiers[String(tier)] || `tier ${tier}`;
}
