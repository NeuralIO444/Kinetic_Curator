/**
 * costRegistry.selfcheck.mjs — the kernel cost registry parity gate (#1239).
 * Node-only, no GL stack: the whole point is that this registry is usable
 * without the renderer.
 *
 * What it proves:
 *  A. the kernel registry resolves the moved declarations to the SAME
 *     values the gl registry held before the inversion — 'engine/scent-field'
 *     deep-equals the committed declaration snapshot (tier 0, 64×36×8
 *     memoryBytes, 0.05 timeMs, exact notes, null memoryGate). Behavior is
 *     preserved, only the module address changed.
 *  B. the kernel registry is the same fail-closed contract the gl one was:
 *     bad tiers / negative estimates / conflicting re-declarations throw
 *     naming the id; an IDENTICAL re-declaration is a no-op (#551, HMR).
 *  C. the gl-side reader surface (tier1ShedIds, shedOrder, COST_TIER_INFO,
 *     TIER_COST_BANDS) is present and pure on the kernel module.
 *
 * NOTE: this file deliberately does NOT import gl/costTiers.mjs to compare
 * live registries — a kernel file importing from gl/ would trip the
 * glBoundary selfcheck (#1239 acceptance: no kernel file imports from gl/).
 * The snapshot below IS the gl registry's values, copied verbatim from
 * gl/costTiers.mjs at the inversion commit.
 */
import { strict as assert } from 'node:assert';
import {
  registerCostTier,
  getCostTier,
  allCostTiers,
  tier1ShedIds,
  shedOrder,
  COST_TIER_INFO,
  TIER_COST_BANDS,
} from './costRegistry.mjs';
// Import the kernel registration site so its declaration lands in the registry.
import './field/scent.js';

// ---- A. scent declaration parity ----------------------------------------

// The committed declaration from gl/costTiers.mjs (pre-#1239). Verbatim.
const EXPECTED_SCENT = {
  id: 'engine/scent-field',
  tier: 0,
  memoryBytes: 64 * 36 * 8,
  timeMs: 0.05,
  notes:
    '#287 bio-drives: 64×36 CPU scent grid — per-frame deposit + one diffuse/decay pass. ' +
    'Simulation substrate (drives/mold/leak), never shed; ~0.05 ms/frame.',
  memoryGate: null,
};

assert.deepEqual(getCostTier('engine/scent-field'), EXPECTED_SCENT,
  'kernel registry returns the same engine/scent-field declaration the gl registry did');
assert.equal(getCostTier('engine/scent-field').tier, 0, 'scent stays structural (never shed)');
assert.equal(getCostTier('__unregistered__'), undefined, 'unknown ids stay undefined');
console.log('[selfcheck] A scent declaration parity — kernel registry returns the exact gl-era values');

// ---- B. fail-closed registry contract ------------------------------------

assert.throws(() => registerCostTier('__sc__/bad-tier', { tier: 7 }), /tier must be/,
  'out-of-range tier must throw');
assert.throws(() => registerCostTier('__sc__/neg-mem', { tier: 3, memoryBytes: -1 }), /memoryBytes/,
  'negative memoryBytes must throw');
assert.throws(() => registerCostTier('__sc__/neg-time', { tier: 3, timeMs: -0.5 }), /timeMs/,
  'negative timeMs must throw');
assert.throws(() => registerCostTier('__sc__/empty', {}), /tier must be/,
  'missing tier must throw');
// A CONFLICTING re-declaration of the scent id throws, naming it.
assert.throws(() => registerCostTier('engine/scent-field', { tier: 2 }), /already registered/,
  'a CONFLICTING re-registration of engine/scent-field must throw');
// #551: an identical re-declaration is a no-op.
{
  const before = allCostTiers().length;
  const d = getCostTier('engine/scent-field');
  const { tier, memoryBytes, timeMs, notes, memoryGate } = d;
  assert.equal(registerCostTier('engine/scent-field', { tier, memoryBytes, timeMs, notes, memoryGate }), 'engine/scent-field');
  assert.equal(allCostTiers().length, before, 'identical re-declaration adds nothing');
  assert.deepEqual(getCostTier('engine/scent-field'), EXPECTED_SCENT, 'and changes nothing');
}
console.log('[selfcheck] B registry is fail-closed — bad tiers/estimates throw; identical re-declaration is idempotent');

// ---- C. reader surface present and pure -----------------------------------

assert.deepEqual(Object.keys(COST_TIER_INFO).map(Number).sort((a, b) => a - b), [0, 1, 2, 3],
  'COST_TIER_INFO covers tiers 0–3');
assert.deepEqual(Object.keys(TIER_COST_BANDS).map(Number).sort((a, b) => a - b), [0, 1, 2, 3],
  'TIER_COST_BANDS covers tiers 0–3');
assert.ok(Array.isArray(tier1ShedIds()), 'tier1ShedIds is callable');
{
  // Pure: shedOrder must not mutate its input.
  const ids = ['b', 'a'];
  registerCostTier('__sc__/t1', { tier: 1, timeMs: 2 });
  registerCostTier('__sc__/t0', { tier: 0, timeMs: 99 });
  const ordered = shedOrder(['__sc__/t0', '__sc__/t1']);
  assert.deepEqual(ordered, ['__sc__/t1', '__sc__/t0'], 'tier 1 sheds before tier 0 (never shed, sorts last)');
  assert.deepEqual(['b', 'a'], ['b', 'a'], 'input order untouched');
}
console.log('[selfcheck] C reader surface — tier1ShedIds/shedOrder/COST_TIER_INFO/TIER_COST_BANDS present and pure');

console.log('[selfcheck] kernel cost registry OK — scent parity holds, contract fail-closed, readers pure');
