// node src/state/shapeMix.selfcheck.mjs
//
// #733: the 4-state shape mixer. off → 1 → 2 → 3 → off on the 12 layout-costume
// shape chips, up to four on, a fifth refused, and the live pool is a
// normalized-weight mix — first-render picks lean toward the louder chip.
import assert from 'node:assert';
import { useStore } from './store.js';
import {
  SHAPE_SETS, MIXABLE_SHAPE_IDS, SHAPE_MIX_MAX, shapeMixIds, shapeMixWeights, liveShapeLevels,
} from '../data/voices.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const S = () => useStore.getState();
const set = (id) => SHAPE_SETS.find((x) => x.id === id);
const [A, B, C, D, E] = MIXABLE_SHAPE_IDS;
assert.strictEqual(MIXABLE_SHAPE_IDS.length, 12, 'the twelve layout-costume chips');
assert.strictEqual(SHAPE_MIX_MAX, 4);

// ── weights: normalize to 1; set-level lean is level : level ─────────────
{
  const w = shapeMixWeights({ [A]: 3, [B]: 1 });
  const sum = Object.values(w).reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12, 'weights add to 1');
  const share = (id) => set(id).ids.reduce((s, i) => s + (w[i] || 0), 0);
  const overlap = set(A).ids.filter((i) => set(B).ids.includes(i)).length;
  if (!overlap) {
    assert.ok(Math.abs(share(A) - 0.75) < 1e-9 && Math.abs(share(B) - 0.25) < 1e-9, 'level 3 vs 1 → 3/4 : 1/4 of the pool');
  }
  assert.strictEqual(shapeMixWeights({}), null, 'nothing on → no mix');
  // overlapping sets (if any ids are shared) still normalize: add first, then divide
  const two = shapeMixWeights({ [A]: 2, [B]: 2 });
  assert.ok(Math.abs(Object.values(two).reduce((s, x) => s + x, 0) - 1) < 1e-12);
}

// ── the store action: cycle, cap, refusal ────────────────────────────────
S().loadShapeSet('swarm'); // start from a flagship pool (not a mix)
const lv = () => liveShapeLevels(S().shapeLevels, S().enabledAssets);
assert.deepStrictEqual(lv(), {}, 'a flagship pool is not a mix');
S().cycleShapeLevel(A);
assert.deepStrictEqual(lv(), { [A]: 1 }, 'first tap → 1, pool = that set');
assert.deepStrictEqual(Object.keys(S().enabledAssets).sort(), [...set(A).ids].sort());
S().cycleShapeLevel(B); // second chip so A may go off
S().cycleShapeLevel(A); S().cycleShapeLevel(A);
assert.strictEqual(lv()[A], 3, 'off→1→2→3');
S().cycleShapeLevel(A);
assert.strictEqual(lv()[A], undefined, '3 → off');
assert.deepStrictEqual(Object.keys(lv()), [B]);
S().cycleShapeLevel(B); S().cycleShapeLevel(B); // 1→2→3
S().cycleShapeLevel(B); // last chip at 3: refused, never an empty pool
assert.strictEqual(lv()[B], 3, 'the last chip cannot go off');
assert.ok(Object.keys(S().enabledAssets).length > 0);

// fifth tap refused
S().cycleShapeLevel(A); S().cycleShapeLevel(C); S().cycleShapeLevel(D);
assert.strictEqual(Object.keys(lv()).length, 4, 'four chips on');
const before = { pool: { ...S().enabledAssets }, levels: { ...lv() }, undo: S().historyUndoStack.length };
S().cycleShapeLevel(E);
assert.deepStrictEqual(S().enabledAssets, before.pool, 'fifth tap: pool untouched');
assert.deepStrictEqual(lv(), before.levels, 'fifth tap: the chip does not light');
assert.strictEqual(S().historyUndoStack.length, before.undo, 'fifth tap: no undo entry');
S().cycleShapeLevel(A); // an already-on chip still cycles
assert.strictEqual(lv()[A], 2);
S().cycleShapeLevel('swarm'); // flagship ids are not mixable
assert.strictEqual(Object.keys(lv()).length, 4, 'flagship chip ignored by the mixer');

// levels retire when anything else rewrites the pool (no invalidation hooks)
{
  const lvls = { ...lv() };
  assert.deepStrictEqual(liveShapeLevels(lvls, null), {}, "the 'all' sentinel is not a mix");
  assert.deepStrictEqual(liveShapeLevels(lvls, { ...S().enabledAssets, extra: true }), {}, 'pool changed elsewhere → levels retire');
  S().loadShapeSet('hype');
  assert.deepStrictEqual(lv(), {}, 'a flagship swap retires the mix');
}

// ── first-render lean: seeded, deterministic, not 50/50 ──────────────────
function shares(levels, over = {}) {
  const enabled = {};
  for (const id of shapeMixIds(levels)) enabled[id] = true;
  const r = createLiveResolver();
  const out = r.resolveLayers({
    layers: [{ id: 'lyr-a', name: 'A', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'lyr-a', layerSnapshots: {}, seed: 4242, paletteId: 'bone', paletteOverrides: null,
    userPalettes: [], layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 400 }, caGrid: null,
    enabledAssets: enabled, shapeLevels: levels, assetWeightOverrides: {}, customAssets: [], quality: 'final',
    lockedParams: {}, batchPaused: false, focusSwap: false, loopTimeMs: 0, perfClampOverride: null,
    perfTier1: false, assetThin: false, slowRender: false, scaleMul: 1, alphaBoost: 0,
    effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null, ...over,
  }).find((l) => l.id === 'lyr-a');
  const inA = new Set(set(A).ids);
  const n = out.items.length;
  return { fracA: out.items.filter((it) => inA.has(it.assetId)).length / n, n };
}
{
  const loud = shares({ [A]: 3, [B]: 1 });
  const flat = shares({ [A]: 1, [B]: 1 });
  const rev = shares({ [A]: 1, [B]: 3 });
  assert.ok(loud.n >= 200, `enough nodes to measure (${loud.n})`);
  assert.ok(loud.fracA > 0.62, `louder chip leans: A share ${loud.fracA.toFixed(2)} at 3:1`);
  assert.ok(rev.fracA < 0.38, `and the other way: A share ${rev.fracA.toFixed(2)} at 1:3`);
  assert.ok(loud.fracA > flat.fracA + 0.1, 'a lean, not a 50/50');
  assert.deepStrictEqual(shares({ [A]: 3, [B]: 1 }), loud, 'fixed seed → same lean every time');
  // stale levels (pool no longer the union) fall back to default weights
  const stale = shares({ [A]: 3, [B]: 1 }, { enabledAssets: null });
  assert.ok(stale.fracA < loud.fracA, 'retired levels no longer lean');
}

console.log('shapeMix.selfcheck: OK');
