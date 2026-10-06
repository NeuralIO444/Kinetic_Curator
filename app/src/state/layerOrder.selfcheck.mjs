// layerOrder.selfcheck.mjs — FX folds before MATH, always (#1048).
import assert from 'node:assert';
import { fxBeforeMath, canTrade } from './layerOrder.js';
import { normalizeLayers } from './projectNormalize.js';
import { useStore } from './store.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import { getRenderCaps } from '../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const L = (id, type) => ({ id, type });
const ids = (ls) => ls.map((l) => l.id);

ok('interleaved adjustment tracks: FX move before MATH, content keeps its exact slots', () => {
  const layers = [L('kc', 'content'), L('m1', 'math'), L('f1', 'fx'), L('kc2', 'content'), L('f2', 'fx'), L('m2', 'math')];
  const r = fxBeforeMath(layers);
  assert.equal(r.moved, true);
  assert.deepEqual(ids(r.layers), ['kc', 'f1', 'f2', 'kc2', 'm1', 'm2']);
  // content did not move
  assert.equal(r.layers[0].id, 'kc');
  assert.equal(r.layers[3].id, 'kc2');
  assert.deepEqual(ids(layers), ['kc', 'm1', 'f1', 'kc2', 'f2', 'm2'], 'the input is not mutated');
});

ok('stable: order inside FX, and inside MATH, is preserved', () => {
  const r = fxBeforeMath([L('m2', 'math'), L('f2', 'fx'), L('m1', 'math'), L('f1', 'fx')]);
  assert.deepEqual(ids(r.layers), ['f2', 'f1', 'm2', 'm1']);
});

ok('already ordered: nothing moves and the same array comes back', () => {
  const layers = [L('kc', 'content'), L('f1', 'fx'), L('m1', 'math')];
  const r = fxBeforeMath(layers);
  assert.equal(r.moved, false);
  assert.equal(r.layers, layers);
  const again = fxBeforeMath(fxBeforeMath([L('m', 'math'), L('f', 'fx')]).layers);
  assert.equal(again.moved, false, 'idempotent');
});

ok('no adjustment tracks, only FX, only MATH, empty, junk: all safe', () => {
  for (const ls of [[], [L('a', 'content')], [L('f', 'fx'), L('g', 'fx')], [L('m', 'math')]]) {
    assert.equal(fxBeforeMath(ls).moved, false);
  }
  assert.equal(fxBeforeMath(null).moved, false);
  assert.equal(fxBeforeMath(undefined).moved, false);
});

ok('canTrade: same kind trades; content never crosses the adjustment line; FX never crosses MATH', () => {
  const c = L('c', 'content'); const f = L('f', 'fx'); const m = L('m', 'math');
  assert.equal(canTrade(c, L('c2', 'content')), true);
  assert.equal(canTrade(f, L('f2', 'fx')), true);
  assert.equal(canTrade(m, L('m2', 'math')), true);
  assert.equal(canTrade(f, m), false);
  assert.equal(canTrade(m, f), false);
  assert.equal(canTrade(c, f), false);
  assert.equal(canTrade(m, c), false);
  assert.equal(canTrade(c, null), false);
});

const mk = (id, type, extra = {}) => ({ id, name: id, type, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const doc = () => [
  mk('kc', 'content', { patch: { mode: 'off', to: null, strength: 0.16 } }),
  mk('m1', 'math', { effects: [{ kind: 'gain', params: {} }] }),
  mk('f1', 'fx', { effects: [{ kind: 'rgbSplit', params: { dx: 3 } }] }),
  mk('kc2', 'content', { patch: { mode: 'off', to: null, strength: 0.16 } }),
  mk('f2', 'fx', { effects: [{ kind: 'invert', params: {} }] }),
];

ok('loading an interleaved project migrates it, warns once, and keeps content in place', () => {
  const warns = [];
  const w = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  let r;
  try { r = normalizeLayers(doc(), 'kc'); } finally { console.warn = w; }
  assert.deepEqual(ids(r.layers), ["kc", "f1", "f2", "kc2", "m1"]);
  assert.equal(warns.filter((m) => /#1048/.test(m)).length, 1, 'the render change is announced');
  assert.equal(r.activeLayerId, 'kc');
});

ok('a project already in order loads silently and is untouched; normalizing twice is a fixed point', () => {
  const ordered = [mk('kc', 'content', { patch: { mode: 'off', to: null, strength: 0.16 } }), mk('f1', 'fx', { effects: [] }), mk('m1', 'math', { effects: [] })];
  const warns = [];
  const w = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  let once; let twice;
  try { once = normalizeLayers(ordered, 'kc'); twice = normalizeLayers(once.layers, 'kc'); } finally { console.warn = w; }
  assert.equal(warns.length, 0);
  assert.deepEqual(ids(once.layers), ['kc', 'f1', 'm1']);
  assert.deepEqual(twice.layers, once.layers);
});

// ── the store: add / reorder / swap / duplicate hold the invariant ──────────
const S = () => useStore.getState();
const adjOrder = () => S().layers.filter((l) => l.type !== 'content').map((l) => l.type);
const holds = () => { const t = adjOrder(); const lastFx = t.lastIndexOf('fx'); const firstMath = t.indexOf('math'); return firstMath === -1 || lastFx === -1 || lastFx < firstMath; };

ok('adding FX after MATH puts the FX below it; adding MATH always lands last', () => {
  S().addMathLayer();
  S().addFxLayer();
  assert.deepEqual(adjOrder(), ['fx', 'math'], 'a new FX goes under the existing MATH');
  S().addFxLayer();
  S().addMathLayer();
  assert.deepEqual(adjOrder(), ['fx', 'fx', 'math', 'math']);
  assert.ok(holds());
});

ok('reorderLayer and swapLayerPositions refuse FX <-> MATH, and still trade same kinds', () => {
  const fx = S().layers.filter((l) => l.type === 'fx');
  const math = S().layers.filter((l) => l.type === 'math');
  const before = S().layers.map((l) => l.id);
  S().swapLayerPositions(fx[0].id, math[0].id);
  assert.deepEqual(S().layers.map((l) => l.id), before, 'FX <-> MATH swap refused');
  const lastFxIdx = S().layers.findIndex((l) => l.id === fx[fx.length - 1].id);
  S().reorderLayer(S().layers[lastFxIdx].id, +1); // would step onto the first MATH
  assert.deepEqual(S().layers.map((l) => l.id), before, 'reorder across the FX/MATH line refused');
  S().swapLayerPositions(fx[0].id, fx[1].id);
  assert.deepEqual(S().layers.filter((l) => l.type === 'fx').map((l) => l.id), [fx[1].id, fx[0].id], 'FX still trade with FX');
  S().swapLayerPositions(math[0].id, math[1].id);
  assert.deepEqual(S().layers.filter((l) => l.type === 'math').map((l) => l.id), [math[1].id, math[0].id], 'MATH still trade with MATH');
  assert.ok(holds());
});

ok('duplicating the last FX, or the last MATH, never breaks the order', () => {
  const lastFx = S().layers.filter((l) => l.type === 'fx').at(-1);
  S().duplicateLayer(lastFx.id);
  assert.ok(holds(), 'copy of the FX that sits right under MATH');
  const lastMath = S().layers.filter((l) => l.type === 'math').at(-1);
  S().duplicateLayer(lastMath.id);
  assert.ok(holds());
});

// ── the real acceptance: the scene contract folds every FX before every MATH ──
ok('scene contract: for a migrated project, every FX wrap precedes every MATH wrap', () => {
  const w = console.warn; console.warn = () => {};
  let layers;
  try { layers = normalizeLayers(doc(), 'kc').layers; } finally { console.warn = w; }
  const caps = getRenderCaps('balanced', false);
  const docObj = {
    version: 1, seed: 1, paletteId: 'praystation', paletteOverrides: null,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0, count: 8 }, enabledAssets: {}, quality: 'balanced',
    layers, activeLayerId: 'kc', layerSnapshots: {},
  };
  const resolved = layers.filter((l) => l.type !== 'content').map((l) => ({
    id: l.id, isFx: true, isMath: l.type === 'math', layer: l, layerOpacity: l.layerOpacity ?? 1, soloGrade: false,
  }));
  const scene = buildSceneContract({ doc: docObj, resolvedLayers: resolved, caps });
  const kindOf = (id) => layers.find((l) => l.id === id).type;
  const seq = scene.fxWraps.map((x) => kindOf(x.fxLayerId));
  assert.ok(seq.length >= 3, 'all three adjustment tracks wrap');
  assert.ok(seq.lastIndexOf('fx') < seq.indexOf('math'), `fold order ${seq.join(' → ')}`);
});

console.log(`layerOrder.selfcheck: ${n} checks passed`);
