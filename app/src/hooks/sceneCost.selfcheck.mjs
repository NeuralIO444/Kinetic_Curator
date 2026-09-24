// sceneCost.selfcheck — the FX-stack weight stays honest (#485 R4).
// Node-only, no GPU: pure lookup math over the registry + committed data.
import { strict as assert } from 'node:assert';
import { allCostTiers } from '../gl/costTiers.mjs';
// Import the registration sites so declarations land (same as costTiers.selfcheck).
import '../gl/effects/fxShaders.mjs';
import '../gl/bridge/builtinEffects.mjs';
import '../gl/accum.mjs';
import '../gl/renderer.mjs';
import { MEASURED_COSTS } from '../gl/effects/measuredCosts.mjs';
import { FX_EFFECT_DEFS, defaultFxEffects } from '../fx/fxFilters.js';
import {
  FX_KIND_TO_COST_ID,
  costIdForFxKind,
  sceneFxCost,
  activeFxKinds,
} from './sceneCost.js';

// Every layer effect kind resolves to a registered id (both ways: no
// orphan kinds, no orphan map entries).
{
  const registered = new Set(allCostTiers().map((d) => d.id));
  for (const kind of Object.keys(FX_EFFECT_DEFS)) {
    const id = costIdForFxKind(kind);
    assert.ok(id, `FX kind "${kind}" has no cost-id mapping`);
    assert.ok(registered.has(id), `mapped id "${id}" (kind "${kind}") is not registered`);
  }
  for (const kind of Object.keys(FX_KIND_TO_COST_ID)) {
    assert.ok(FX_EFFECT_DEFS[kind], `mapped kind "${kind}" is not a real FX kind`);
  }
  console.log('[selfcheck] sceneCost map covers all FX kinds, all registered');
}

// The default stack sums bench-measured ms only (all nine kinds measured).
{
  const kinds = defaultFxEffects().map((f) => f.kind);
  const c = sceneFxCost(kinds);
  const expect = kinds.reduce((s, k) => s + MEASURED_COSTS[costIdForFxKind(k)].ms, 0);
  assert.strictEqual(c.totalMs, expect, 'default stack sums measured ms');
  assert.strictEqual(c.measured, kinds.length, 'default stack fully measured');
  assert.strictEqual(c.declared, 0, 'no declared fallback on the default stack');
  assert.deepStrictEqual(c.unknown, [], 'no unknowns on the default stack');
  console.log(`[selfcheck] sceneCost default stack ≈ ${c.totalMs.toFixed(1)}ms bench`);
}

// Unknown kinds add 0 and are listed — cost is never invented.
{
  const c = sceneFxCost(['grain', 'nope', null, 42]);
  assert.deepStrictEqual(c.unknown, ['nope', null, 42], 'unknowns listed verbatim');
  assert.strictEqual(c.count, 4, 'count covers the whole stack');
  const grainMs = MEASURED_COSTS[costIdForFxKind('grain')].ms;
  assert.strictEqual(c.totalMs, grainMs, 'unknowns contribute 0');
  assert.deepStrictEqual(sceneFxCost(null).totalMs, 0, 'null stack is 0');
  console.log('[selfcheck] sceneCost unknown kinds contribute 0 and are listed');
}

// Active kinds: visible FX layers only, stack order kept.
{
  const layers = [
    { id: 'a', type: 'content', visible: true },
    { id: 'b', type: 'fx', visible: true, effects: [{ kind: 'grain', params: {} }] },
    { id: 'c', type: 'fx', visible: false, effects: [{ kind: 'edge', params: {} }] },
    { id: 'd', type: 'fx', visible: true, effects: [{ kind: 'tear', params: {} }, { bad: 1 }] },
  ];
  assert.deepStrictEqual(activeFxKinds(layers), ['grain', 'tear'], 'visible FX layers, order kept');
  assert.deepStrictEqual(activeFxKinds(null), [], 'null layers is empty');
  console.log('[selfcheck] sceneCost activeFxKinds reads visible FX layers only');
}
