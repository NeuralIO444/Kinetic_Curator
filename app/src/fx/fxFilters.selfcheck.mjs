// fxFilters.selfcheck.mjs — FX layer system (#180): compiler recipes,
// fail-closed behavior, Showrunner shed wiring, layer model, and
// project round-trip.
import assert from 'node:assert';
import {
  FX_EFFECT_DEFS,
  sanitizeFxEffects,
  defaultFxEffects,
  defaultFxParams,
  compileFxPrimitives,
  renderFxFilterString,
  fxFilterId,
  fxFilterStringForLayer,
  isFxLayer,
} from './fxFilters.js';
import { createLayersSlice } from '../state/slices/layersSlice.js';
import { normalizeLayers, serializeProject, parseProject } from '../state/projectDocument.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// --- sanitize ---------------------------------------------------------------
ok('sanitize drops unknown kinds, clamps params, fills defaults', () => {
  const out = sanitizeFxEffects([
    { kind: 'rgbSplit', params: { dx: 999 } },
    { kind: 'explode', params: {} },
    null,
    { kind: 'grain' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].kind, 'rgbSplit');
  assert.equal(out[0].params.dx, 24); // clamped to max
  assert.equal(out[1].params.amount, 0.4); // defaulted
});
ok('sanitize on non-array returns []', () => {
  assert.deepEqual(sanitizeFxEffects(null), []);
  assert.deepEqual(sanitizeFxEffects('nope'), []);
});

// --- compiler recipes -------------------------------------------------------
ok('rgbSplit compiles to 7 prims in recipe order', () => {
  const prims = compileFxPrimitives([{ kind: 'rgbSplit', params: { dx: 3 } }]);
  assert.deepEqual(prims.map((p) => p.prim),
    ['feColorMatrix', 'feColorMatrix', 'feColorMatrix', 'feOffset', 'feOffset', 'feBlend', 'feBlend']);
  assert.equal(prims[3].attrs.dx, 3);
  assert.equal(prims[4].attrs.dx, -3);
  assert.equal(prims[6].attrs.mode, 'screen');
});
ok('rgbSplit dx accepts live modulation', () => {
  const prims = compileFxPrimitives([{ kind: 'rgbSplit', params: { dx: 3 } }], { dxMod: 2 });
  assert.equal(prims[3].attrs.dx, 5);
  assert.equal(prims[4].attrs.dx, -5);
});
ok('displace: turbulence + displacement map, octaves clamped', () => {
  const prims = compileFxPrimitives([{ kind: 'displace', params: { scale: 24, seed: 7 } }], { octaves: 2 });
  assert.deepEqual(prims.map((p) => p.prim), ['feTurbulence', 'feDisplacementMap']);
  assert.equal(prims[0].attrs.numOctaves, 2);
  assert.equal(prims[0].attrs.seed, 7);
  assert.equal(prims[1].attrs.scale, 24);
});
ok('tear: x-only displacement via flattened Y channel', () => {
  const prims = compileFxPrimitives([{ kind: 'tear', params: { bands: 18, amount: 12 } }]);
  assert.deepEqual(prims.map((p) => p.prim),
    ['feTurbulence', 'feComponentTransfer', 'feDisplacementMap']);
  const flat = prims[1].children[0];
  assert.equal(flat.prim, 'feFuncG');
  assert.equal(flat.attrs.intercept, 0.5); // Y displacement exactly 0
  assert.equal(prims[2].attrs.scale, 48); // amount * 4
});
ok('grain: noise alpha composited over source', () => {
  const prims = compileFxPrimitives([{ kind: 'grain', params: { amount: 0.4 } }]);
  assert.deepEqual(prims.map((p) => p.prim), ['feTurbulence', 'feColorMatrix', 'feComposite', 'feComposite']);
  assert.equal(prims[2].attrs.operator, 'in'); // alpha-aware: grain masked by source alpha
  assert.equal(prims[2].attrs.in2, 'SourceAlpha');
  assert.equal(prims[3].attrs.operator, 'over');
  assert.equal(prims[3].attrs.in2, 'SourceGraphic');
});
ok('shedLevel 1: grain dropped, turbulence octaves forced to 1', () => {
  const withGrain = compileFxPrimitives([{ kind: 'grain', params: { amount: 0.4 } }], { shedLevel: 1 });
  assert.equal(withGrain.length, 0);
  const disp = compileFxPrimitives([{ kind: 'displace', params: { scale: 24, seed: 7 } }], { shedLevel: 1, octaves: 3 });
  assert.equal(disp[0].attrs.numOctaves, 1);
  const rgb = compileFxPrimitives([{ kind: 'rgbSplit', params: { dx: 3 } }], { shedLevel: 1 });
  assert.equal(rgb.length, 7); // non-grain effects survive, simplified only where turbulence is involved
});
ok('unknown kinds fail closed mid-stack', () => {
  const prims = compileFxPrimitives([
    { kind: 'rgbSplit', params: { dx: 3 } },
    { kind: 'vaporwave' },
    { kind: 'grain', params: { amount: 0.4 } },
  ]);
  assert.equal(prims.length, 11); // 7 + 4, the unknown one skipped
});
ok('primBudget warns but never drops (binding degradation is the shed ladder)', () => {
  const prims = compileFxPrimitives([{ kind: 'rgbSplit', params: { dx: 3 } }], { primBudget: 4 });
  assert.equal(prims.length, 7);
});

// --- string renderer ----------------------------------------------------------
ok('renderFxFilterString: region clamped, ids unique and sanitized', () => {
  const prims = compileFxPrimitives([{ kind: 'rgbSplit', params: { dx: 3 } }]);
  const s = renderFxFilterString(fxFilterId('layer-abc 123'), prims);
  assert.ok(s.includes('id="fx-layer-abc_123"'));
  assert.ok(s.includes('x="0%" y="0%" width="100%" height="100%"'));
  const ids = [...s.matchAll(/result="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length); // unique
  for (const id of ids) assert.ok(s.includes(`in="${id}"`) || s.includes(`in2="${id}"`)); // all wired
});
ok('fxFilterStringForLayer returns null for empty stacks', () => {
  assert.equal(fxFilterStringForLayer({ id: 'x', effects: [] }), null);
  assert.equal(fxFilterStringForLayer({ id: 'x', effects: [{ kind: 'nope' }] }), null);
});

// --- layer model --------------------------------------------------------------
function driveSlice() {
  let state = {
    layers: [{ id: 'layer-1', name: 'Layer 1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'layer-1',
    layerSnapshots: {},
    selectedFxLayerId: null,
    seed: 42,
    paletteId: 'praystation',
    paletteOverrides: null,
    layoutParams: { count: 100 },
    lockedParams: {},
    caGrid: null,
    enabledAssets: {},
  };
  const set = (fn) => { state = { ...state, ...fn(state) }; };
  return { api: createLayersSlice(set), get: () => state };
}

ok('addFxLayer: fx layer on top, content state untouched', () => {
  const { api, get } = driveSlice();
  api.addFxLayer();
  const s = get();
  assert.equal(s.layers.length, 2);
  const fx = s.layers[1];
  assert.equal(fx.type, 'fx');
  assert.equal(fx.name, 'FX 1');
  assert.deepEqual(fx.effects, defaultFxEffects());
  assert.equal(s.activeLayerId, 'layer-1'); // not stolen
  assert.deepEqual(s.layerSnapshots, {}); // no snapshot created
  assert.equal(s.selectedFxLayerId, fx.id);
  assert.ok(isFxLayer(fx) && !isFxLayer(s.layers[0]));
});
ok('setActiveLayer ignores FX targets', () => {
  const { api, get } = driveSlice();
  api.addFxLayer();
  const fxId = get().layers[1].id;
  api.setActiveLayer(fxId);
  assert.equal(get().activeLayerId, 'layer-1');
});
ok('duplicateLayer deep-clones the effect stack', () => {
  const { api, get } = driveSlice();
  api.addFxLayer();
  const fxId = get().layers[1].id;
  api.fxEffectSetParam(fxId, 0, 'dx', 10);
  api.duplicateLayer(fxId);
  const s = get();
  assert.equal(s.layers.length, 3);
  const copy = s.layers[2];
  assert.equal(copy.type, 'fx');
  assert.equal(copy.effects[0].params.dx, 10);
  assert.notEqual(copy.effects, s.layers[1].effects); // deep clone
});
ok('effect CRUD is fail-closed', () => {
  const { api, get } = driveSlice();
  api.addFxLayer();
  const fxId = get().layers[1].id;
  api.fxEffectAdd('nope', 'tear');
  api.fxEffectAdd(fxId, 'vaporwave');
  assert.equal(get().layers[1].effects.length, 2); // unchanged
  api.fxEffectAdd(fxId, 'tear');
  assert.equal(get().layers[1].effects.length, 3);
  assert.deepEqual(get().layers[1].effects[2].params, defaultFxParams('tear'));
  api.fxEffectRemove(fxId, 99);
  api.fxEffectReorder(fxId, 0, 99);
  api.fxEffectSetParam(fxId, 0, 'dx', 'not-a-number');
  api.fxEffectSetParam(fxId, 0, 'bogus', 5);
  assert.equal(get().layers[1].effects.length, 3);
  assert.equal(get().layers[1].effects[0].params.dx, 3); // NaN -> default
  api.fxEffectSetParam(fxId, 0, 'dx', 1000);
  assert.equal(get().layers[1].effects[0].params.dx, 24); // clamped
  api.fxEffectReorder(fxId, 0, 1);
  assert.equal(get().layers[1].effects[0].kind, 'grain');
  api.fxEffectRemove(fxId, 0);
  assert.equal(get().layers[1].effects.length, 2);
});
ok('setSelectedFxLayer only accepts fx ids', () => {
  const { api, get } = driveSlice();
  api.addFxLayer();
  const fxId = get().layers[1].id;
  api.setSelectedFxLayer('layer-1');
  assert.equal(get().selectedFxLayerId, null);
  api.setSelectedFxLayer(fxId);
  assert.equal(get().selectedFxLayerId, fxId);
  api.setSelectedFxLayer(null);
  assert.equal(get().selectedFxLayerId, null);
});

// --- round-trip -----------------------------------------------------------------
ok('normalizeLayers sanitizes fx and repairs fx-pointing activeLayerId', () => {
  const { layers, activeLayerId } = normalizeLayers([
    { id: 'a', name: 'A', type: 'content', visible: true },
    { id: 'b', name: 'B', type: 'fx', visible: true, effects: [{ kind: 'rgbSplit', params: { dx: 500 } }, { kind: 'nope' }] },
  ], 'b');
  assert.equal(layers[1].effects.length, 1);
  assert.equal(layers[1].effects[0].params.dx, 24);
  assert.equal(activeLayerId, 'a'); // repaired: fx can't be content-active
});
ok('project JSON round-trips fx layers exactly', () => {
  const { api, get } = driveSlice();
  api.addFxLayer();
  const fxId = get().layers[1].id;
  api.fxEffectSetParam(fxId, 0, 'dx', 7);
  api.fxEffectAdd(fxId, 'tear');
  const doc = serializeProject({ ...get(), quality: 'high', assetWeightOverrides: null, paletteOverrides: null, customAssets: [] });
  const json = JSON.parse(JSON.stringify(doc)); // through the wire
  const parsed = parseProject(json);
  assert.ok(parsed.ok);
  const fx = parsed.doc.layers.find((l) => l.id === fxId);
  assert.equal(fx.type, 'fx');
  assert.deepEqual(fx.effects, get().layers.find((l) => l.id === fxId).effects);
  // same filter chain after the round-trip
  const before = fxFilterStringForLayer(get().layers.find((l) => l.id === fxId), {});
  const after = fxFilterStringForLayer(fx, {});
  assert.equal(before, after);
});

ok('blur: single feGaussianBlur, radius passes through', () => {
  const prims = compileFxPrimitives([{ kind: 'blur', params: { radius: 6 } }]);
  assert.deepEqual(prims.map((p) => p.prim), ['feGaussianBlur']);
  assert.equal(prims[0].attrs.stdDeviation, 6);
  assert.equal(prims[0].attrs.in, 'SourceGraphic');
});
ok('scanlines: anisotropic noise, alpha-masked, octaves shed like other turbulence', () => {
  const prims = compileFxPrimitives([{ kind: 'scanlines', params: { density: 0.35, amount: 0.5 } }]);
  assert.deepEqual(prims.map((p) => p.prim), ['feTurbulence', 'feColorMatrix', 'feComposite', 'feComposite']);
  assert.equal(prims[2].attrs.operator, 'in'); // alpha-aware: no filter-region box
  assert.equal(prims[2].attrs.in2, 'SourceAlpha');
  assert.equal(prims[3].attrs.operator, 'over');
  const shed = compileFxPrimitives([{ kind: 'scanlines', params: { density: 0.35, amount: 0.5 } }], { shedLevel: 1, octaves: 3 });
  assert.equal(shed[0].attrs.numOctaves, 1);
  assert.ok(shed.length > 0); // scanlines survive shed 1 (unlike grain)
});
ok('posterize: discrete component transfer, alpha untouched', () => {
  const prims = compileFxPrimitives([{ kind: 'posterize', params: { levels: 4 } }]);
  assert.deepEqual(prims.map((p) => p.prim), ['feComponentTransfer']);
  assert.deepEqual(prims[0].children.map((c) => c.prim), ['feFuncR', 'feFuncG', 'feFuncB']);
  for (const c of prims[0].children) {
    assert.equal(c.attrs.type, 'discrete');
    assert.equal(c.attrs.tableValues, '0 0.333 0.667 1');
  }
});

console.log(`fxFilters.selfcheck: OK (${n} cases)`);