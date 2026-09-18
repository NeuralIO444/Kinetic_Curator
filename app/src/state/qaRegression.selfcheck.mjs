// node src/state/qaRegression.selfcheck.mjs
//
// QA sweep regressions (2026-09-17, qa/main-sweep). Each block pins a bug
// found by the QA audit so a future refactor can't silently reintroduce it.
// Plain unit checks against the real store / real engine — no browser needed.
import assert from 'node:assert';
import { useStore } from './store.js';
import {
  serializeProject, parseProject, normalizeSnapshots, normalizeLayers,
  PROJECT_VERSION,
} from './projectDocument.js';
import { normalizeLayoutParams } from '../data/layout-modes.js';
import { PALETTE_IDS } from './paramUtils.js';
import { mkRng } from '../engine/prng.js';
import { hashU32 } from '../engine/kernel/rng.js';
import { colorForPlacement } from '../engine/color.js';
import { ParticleSystem } from '../engine/particles.js';
import { registerBuiltinEffects } from '../gl/bridge/builtinEffects.mjs';

let n = 0;
const ok = (name, fn) => { n++; fn(); console.log(`  ok ${n} - ${name}`); };

// --- Export data-loss: custom SVG assets must survive save → load (#QA-2) ---
ok('customAssets survive serialize → parse', () => {
  const asset = { id: 'user:skull', category: 'fragments', svg: '<svg><circle r="5"/></svg>' };
  const doc = serializeProject({ ...useStore.getState(), customAssets: [asset] });
  assert.ok(Array.isArray(doc.customAssets) && doc.customAssets.length === 1, 'serialized');
  assert.strictEqual(doc.customAssets[0].id, 'user:skull');
  const rt = parseProject(JSON.parse(JSON.stringify(doc)));
  assert.ok(rt.ok, 'parses');
  assert.strictEqual(rt.doc.customAssets[0].id, 'user:skull');
  assert.ok(rt.doc.customAssets[0].svg.includes('<circle'), 'svg kept');
});

// --- applyProject symmetry: lockedParams + caGrid restored, stale weight
// overrides cleared (#QA-3, #QA-7) ---
ok('applyProject restores lockedParams/caGrid and resets absent weight overrides', () => {
  const s0 = useStore.getState();
  useStore.setState({ lockedParams: { count: true }, caGrid: [[9]], seed: 1234 });
  const doc = serializeProject(useStore.getState());
  assert.deepStrictEqual(doc.layerSnapshots[doc.activeLayerId].lockedParams, { count: true });
  assert.deepStrictEqual(doc.layerSnapshots[doc.activeLayerId].caGrid, [[9]]);

  // Pollute live state, then load a doc WITHOUT assetWeightOverrides.
  useStore.setState({ lockedParams: {}, caGrid: null, assetWeightOverrides: { 'some-asset': 'heavy' } });
  delete doc.assetWeightOverrides;
  useStore.getState().applyProject(JSON.parse(JSON.stringify(doc)));

  const s1 = useStore.getState();
  assert.deepStrictEqual(s1.lockedParams, { count: true }, 'lockedParams restored');
  assert.deepStrictEqual(s1.caGrid, [[9]], 'caGrid restored');
  assert.deepStrictEqual(s1.assetWeightOverrides, {}, 'absent overrides reset, not kept');
  // Restore a sane baseline for later blocks.
  useStore.setState({ lockedParams: {}, caGrid: null });
});

// --- normalizeSnapshots fills every field CanvasPanel dereferences (#QA-4) ---
ok('normalizeSnapshots fills seed/paletteId/enabledAssets on sparse snapshots', () => {
  const out = normalizeSnapshots({ l1: { layoutParams: { mode: 'grid' } } });
  const s = out.l1;
  assert.strictEqual(typeof s.seed, 'number');
  assert.strictEqual(typeof s.paletteId, 'string');
  assert.ok(s.layoutParams && typeof s.layoutParams.count === 'number', 'layoutParams normalized');
  assert.deepStrictEqual(s.lockedParams, {});
  assert.strictEqual(s.caGrid, null);
  assert.ok(s.enabledAssets && typeof s.enabledAssets === 'object', 'enabledAssets defaulted');
  assert.deepStrictEqual(normalizeSnapshots(null), {});
});

// --- Hostile caGrid is rejected, not bloat-persisted (#269) ---
ok('normalizeSnapshots rejects oversized/ragged caGrid', () => {
  const big = Array.from({ length: 1000 }, () => new Array(1000).fill(0));
  const out = normalizeSnapshots({
    l1: { caGrid: big },
    l2: { caGrid: [[1], 'nope'] },
    l3: { caGrid: [[9]] },
  });
  assert.strictEqual(out.l1.caGrid, null, '1000x1000 rejected');
  assert.strictEqual(out.l2.caGrid, null, 'ragged rejected');
  assert.deepStrictEqual(out.l3.caGrid, [[9]], 'real grid kept');
});

// --- normalizeLayers: dedupe, all-FX rejection, FX never content-active (#QA-9) ---
ok('normalizeLayers dedupes ids, rejects all-FX docs, never FX-activates', () => {
  const dup = normalizeLayers([
    { id: 'a', type: 'content' }, { id: 'a', type: 'content' }, { id: 'b', type: 'fx' },
  ], 'a');
  assert.deepStrictEqual(dup.layers.map((l) => l.id), ['a', 'b'], 'duplicate id dropped');

  const allFx = normalizeLayers([{ id: 'x', type: 'fx' }], 'x');
  assert.strictEqual(allFx.layers, null, 'all-FX doc invalid like an empty one');
  assert.strictEqual(allFx.activeLayerId, null);

  const fxActive = normalizeLayers(
    [{ id: 'c', type: 'content' }, { id: 'f', type: 'fx' }], 'f');
  assert.strictEqual(fxActive.activeLayerId, 'c', 'FX active falls back to content');
});

// --- removeLayer: content-active invariant + FX selection cleanup (#QA-6, #QA-27) ---
ok('removeLayer keeps a content layer active and clears dead FX selection', () => {
  const layers = [
    { id: 'c1', name: 'A', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
    { id: 'c2', name: 'B', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
    { id: 'f1', name: 'FX', type: 'fx', visible: true, layerBlendMode: 'normal', layerOpacity: 1, effects: [] },
  ];
  useStore.setState({ layers, activeLayerId: 'c1', selectedFxLayerId: 'f1', layerSnapshots: {} });
  useStore.getState().removeLayer('c1');
  let s = useStore.getState();
  assert.strictEqual(s.activeLayerId, 'c2', 'active moves to a content layer, not the FX layer');
  assert.strictEqual(s.selectedFxLayerId, 'f1', 'unrelated FX selection kept');
  useStore.getState().removeLayer('f1');
  s = useStore.getState();
  assert.strictEqual(s.selectedFxLayerId, null, 'deleted FX selection cleared');
  assert.deepStrictEqual(s.layers.map((l) => l.id), ['c2']);
});

// --- prng: the 1.0 edge is clamped, every other value bit-identical (#QA-6m) ---
ok('mkRng never returns exactly 1.0', () => {
  // Inverse-xorshift seed search: this seed's stream visits the 0xffffffff
  // state on its second draw, which mapped to exactly 1.0 pre-fix.
  const invL = (y, sh) => {
    let x = 0;
    for (let i = 0; i < 32; i++) {
      const yb = (y >>> i) & 1;
      const xp = i >= sh ? (x >>> (i - sh)) & 1 : 0;
      x |= ((yb ^ xp) << i);
    }
    return x >>> 0;
  };
  const invR = (y, sh) => {
    let x = 0;
    for (let i = 31; i >= 0; i--) {
      const yb = (y >>> i) & 1;
      const xn = i + sh < 32 ? (x >>> (i + sh)) & 1 : 0;
      x |= ((yb ^ xn) << i);
    }
    return x >>> 0;
  };
  const invStep = (st) => invL(invR(invL(st, 5), 17), 13);
  const seed = invStep(invStep(0xffffffff)) | 0;
  const rng = mkRng(seed);
  rng();
  const edge = rng();
  assert.ok(edge < 1, `edge draw must be < 1, got ${edge}`);
  assert.strictEqual(edge, 1 - Number.EPSILON, 'only the 1.0 case is touched');
  // Spot-check the ordinary path is untouched: first draws of seed 1.
  const r1 = mkRng(1);
  assert.ok(r1() >= 0 && r1() < 1);
});

// --- kernel RNG: string channels isolated, numeric channels frozen (#QA-7m) ---
ok("hashU32 isolates 'field' vs 'ca'; numeric channels bit-identical", () => {
  assert.notStrictEqual(
    hashU32(12345, 'field', 7), hashU32(12345, 'ca', 7),
    "'field' and 'ca' must not share a stream",
  );
  // Pin the pre-fix formula for numeric channels: the fix must not move them.
  const oldHashU32 = (seed, channel, index = 0) => {
    let h = (seed | 0) ^ Math.imul(channel | 0, 0x9e3779b9) ^ Math.imul(index | 0, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h || 1;
  };
  for (const [seed, ch, i] of [[1, 1, 0], [999, 4, 17], [42, 7, 7919], [0x1a4f, 3, 5]]) {
    assert.strictEqual(hashU32(seed, ch, i), oldHashU32(seed, ch, i),
      `numeric channel ${ch} must be bit-identical`);
  }
});

// --- accent slot: duplicate swatches resolve to the chosen slot (#QA-H2) ---
ok('colorForPlacement reports the true slot with duplicate swatches', () => {
  const swatches = ['#111111', '#222222', '#111111', '#333333'];
  // band t=0.6 → slot 2 (the second '#111111'); indexOf would say slot 0.
  const { color, slot } = colorForPlacement({
    swatches, strategy: 'band', t: 0.6, index: 0, rng: mkRng(1),
  });
  assert.strictEqual(color, '#111111');
  assert.strictEqual(slot, 2, `slot must be 2, not indexOf's 0`);
  // zone / split / random still return in-range slots.
  for (const strategy of ['zone', 'split', 'random']) {
    const r = colorForPlacement({ swatches, strategy, t: 0.3, index: 5, rng: mkRng(7) });
    assert.ok(r.slot >= 0 && r.slot < swatches.length, `${strategy} slot in range`);
    assert.strictEqual(r.color, swatches[r.slot], `${strategy} color matches slot`);
  }
});

// --- breed growth survives the next update (#QA-H1) ---
ok('breed-grown population is not wiped by the next update', () => {
  const ps = new ParticleSystem();
  const assets = [{ id: 'a' }];
  const palette = { swatches: ['#ffffff'] };
  ps.init(10, 400, 280, assets, palette, 42);
  const cs = ps._breed(0, 1, 42, 20, 0.4, 1.6, 40, 100);
  assert.ok(cs >= 0, 'breed produced a child');
  assert.strictEqual(ps.n, 11);
  // Authored count unchanged (10): pre-fix, update() re-init to 10 here.
  ps.update(normalizeLayoutParams({ mode: 'cloud', particleCount: 10 }), assets, palette, 42, 0, null);
  assert.strictEqual(ps.n, 11, 'newborn survives the frame');
  // And a real authored change still re-inits (20 is inside the 10..500 clamp).
  ps.update(normalizeLayoutParams({ mode: 'cloud', particleCount: 20 }), assets, palette, 42, 0, null);
  assert.strictEqual(ps.n, 20, 'authored count change re-inits');
});

// --- new palettes join Evolve's cycle without a second edit site (#QA-14) ---
ok('PALETTE_IDS tracks the palette catalog', () => {
  assert.ok(PALETTE_IDS.includes('kiln-columns'), 'kiln-columns in cycle');
  assert.ok(PALETTE_IDS.includes('vortex-rwb'), 'vortex-rwb in cycle');
});

// --- gaussian blur is gone from the GPU path (#308) ---
// The old QA-H4 block pinned blur-radius pass behavior; #308 removed gaussian
// blur by design, so the regression is now the opposite: the 'blur' kind is
// no longer registered as a builtin, and the FX roster's Blur entry dies on
// the GPU path until #310 cuts it from the UI.
ok('gaussian blur is gone from the GPU builtins (#308)', () => {
  const defs = {};
  registerBuiltinEffects({
    registerProgram() {},
    defineEffect: (kind, def) => { defs[kind] = def; },
  });
  assert.ok(!('blur' in defs), 'blur is not a registered builtin effect');
  assert.ok(!defs.blur?.passes, 'no blur pass machinery survives');
});

console.log(`\nqaRegression: ${n} checks passed`);
