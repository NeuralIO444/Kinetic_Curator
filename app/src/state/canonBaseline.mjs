// state/canonBaseline.mjs — #2048 (Canon S5): put a baseline on the stage.
//
// data/canon/baselines.js says what a baseline IS; this says what the instrument's state is when one is
// applied. Pure: (state, baseline, rng) → a state patch, the same shape a KINETIC pass commits —
// `{ layoutParams, paletteId, paletteOverrides, paletteLocks, enabledAssets }` — store keys only, nothing new. No store import, no side
// effects, no Math.random: the caller owns the commit and supplies the seeded stream that deals the marks.
//
// What it honours, the instrument's standing laws:
//   • locked params stay locked (the same discipline as applyPreset and the Look pass)
//   • the marks are DEALT from the baseline's pairing by the pool dealer every pass uses (state/rollPool.mjs),
//     so a baseline's marks are real library assets, a coherent pool when the pairing has enough to deal
//   • every value lands through the validating door (baselineRecipe)
//
// Nothing in the running instrument calls this yet — there is no baseline control on the surface. It is the
// door the weighted mix (#2049 onward) and a future control will use.
import { baselineRecipe, canonBaseline } from '../data/canon/baselines.js';
import { validateLayoutParams } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';
import { dealableRecords, dealPoolFor, poolToEnabled } from './rollPool.mjs';

/**
 * The state patch that puts `baseline` on the stage, or null for an unknown baseline.
 * `rng` deals the mark pool (seeded — same seed, same pool). `records` is injectable for tests.
 */
export function baselinePatch(state, baselineOrId, rng, { records } = {}) {
  const baseline = typeof baselineOrId === 'string' ? canonBaseline(baselineOrId) : baselineOrId;
  const recipe = baselineRecipe(baseline);
  if (!recipe) return null;
  const locked = state?.lockedParams || {};
  const standing = state?.layoutParams || {};
  const merged = { ...standing };
  for (const [k, v] of Object.entries(recipe.layoutParams)) {
    if (k === 'composition' || locked[k]) continue; // a baseline is not a Look; a lock is a lock
    merged[k] = v;
  }
  const pool = dealPoolFor(records ?? dealableRecords(ASSETS, state?.customAssets), rng, recipe.pairing);
  return {
    layoutParams: validateLayoutParams(merged).params,
    paletteId: recipe.paletteId,
    paletteOverrides: null,
    paletteLocks: {},
    enabledAssets: poolToEnabled(pool.ids),
  };
}
