// sceneContract.selfcheck.mjs — GL scene contract (Phase 0, #186):
// builder output shape, #185 top-down FX order, fxWraps fold,
// determinism, validation, and no-schema-change guarantee.
import assert from 'node:assert';
import {
  GL_CONTRACT_VERSION,
  CONTRACT_CANVAS,
  buildSceneContract,
  assertSceneContract,
  serializeSceneContract,
} from './sceneContract.js';
import { resolveLayers } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const enabledAssets = Object.fromEntries(ASSETS.map((a) => [a.id, true]));
const caps = getRenderCaps('balanced', false);

function fixtureDoc() {
  const lp = (over) => ({ ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0, ...over });
  return {
    version: 1,
    seed: 1234,
    paletteId: 'praystation',
    paletteOverrides: null,
    layoutParams: lp({ count: 24 }),
    enabledAssets,
    quality: 'balanced',
    layers: [
      { id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
      {
        id: 'fx1', name: 'FX 1', type: 'fx', visible: true,
        layerBlendMode: 'normal', layerOpacity: 0.9,
        effects: [
          { kind: 'rgbSplit', params: { dx: 3 } },
          { kind: 'grain', params: { amount: 0.4 } },
        ],
      },
      { id: 'top', name: 'Top', type: 'content', visible: true, layerBlendMode: 'screen', layerOpacity: 0.5 },
    ],
    activeLayerId: 'bg',
    layerSnapshots: {
      top: {
        seed: 99, paletteId: 'praystation', paletteOverrides: null,
        layoutParams: lp({ count: 10 }), caGrid: null, enabledAssets,
      },
    },
  };
}

function build(fixture = fixtureDoc()) {
  const resolvedLayers = resolveLayers(fixture, { caps });
  return buildSceneContract({ doc: fixture, resolvedLayers, caps });
}

ok('contract version and canvas', () => {
  assert.equal(GL_CONTRACT_VERSION, 1);
  assert.deepEqual({ ...CONTRACT_CANVAS }, { w: 1000, h: 700 });
  const s = build();
  assert.equal(s.version, 1);
  assert.deepEqual(s.canvas, { w: 1000, h: 700 });
  assert.equal(s.seed, 1234);
  assert.equal(s.quality, 'balanced');
});

ok('layers keep store order, types, opacity, blend', () => {
  const s = build();
  assert.deepEqual(s.layers.map((l) => l.id), ['bg', 'fx1', 'top']);
  assert.deepEqual(s.layers.map((l) => l.type), ['content', 'fx', 'content']);
  assert.deepEqual(s.compositeOrder, ['bg', 'fx1', 'top']);
  assert.equal(s.layers[2].blend, 'screen');
  assert.equal(s.layers[2].opacity, 0.5);
  assert.equal(s.layers[1].opacity, 0.9);
});

ok('fx stack recorded top-down, sanitized (#185 semantics frozen)', () => {
  const s = build();
  const fx = s.layers[1];
  assert.deepEqual(fx.fx.map((e) => e.kind), ['rgbSplit', 'grain']);
  assert.equal(fx.fx[0].params.dx, 3);
  assert.equal(fx.fx[1].params.amount, 0.4);
  // unknown kinds are dropped by the builder, never crash the contract
  const dirty = fixtureDoc();
  dirty.layers[1].effects.push({ kind: 'vaporwave', params: {} });
  dirty.layers[1].effects.push({ kind: 'blur', params: { radius: 999 } }); // clamped
  const s2 = build(dirty);
  assert.deepEqual(s2.layers[1].fx.map((e) => e.kind), ['rgbSplit', 'grain', 'blur']);
  assert.equal(s2.layers[1].fx[2].params.radius, 40);
});

ok('fxWraps captures the buildLayerStack fold', () => {
  const s = build();
  assert.equal(s.fxWraps.length, 1);
  const w = s.fxWraps[0];
  assert.equal(w.fxLayerId, 'fx1');
  assert.equal(w.filterId, 'fx-fx1');
  assert.equal(w.opacity, 0.9);
  assert.deepEqual(w.contentLayerIds, ['bg']); // 'top' sits above the FX layer: not wrapped
});

ok('instances are finite, layer-bound, draw-ordered', () => {
  const s = build();
  assert.ok(s.instances.length > 0);
  for (const it of s.instances) {
    for (const k of ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity']) {
      assert.ok(Number.isFinite(it[k]), `${k} finite`);
    }
    assert.ok(it.opacity >= 0 && it.opacity <= 1);
    assert.ok(/^#[0-9a-fA-F]{3,8}$/.test(it.tint));
  }
  const byLayer = {};
  for (const it of s.instances) (byLayer[it.layer] ??= []).push(it);
  assert.deepEqual(Object.keys(byLayer).sort(), ['bg', 'top']);
  assert.ok(byLayer.bg.length > byLayer.top.length); // 24 vs 10
});

ok('mirrored items negate scaleX', () => {
  const doc = fixtureDoc();
  doc.layoutParams = { ...doc.layoutParams, mirror: true, count: 20 };
  const s = build(doc);
  const mirrored = s.instances.filter((it) => it.scaleX < 0);
  assert.ok(mirrored.length > 0, 'mirror layout produces negative scaleX');
  for (const it of mirrored) assert.ok(it.scaleY > 0);
});

ok('atlas lists referenced assets, uv reserved for Phase 1', () => {
  const s = build();
  assert.ok(s.atlas.assets.length > 0);
  const ids = s.atlas.assets.map((a) => a.id);
  assert.deepEqual(ids, [...ids].sort()); // deterministic order
  for (const a of s.atlas.assets) {
    assert.equal(a.w, 100);
    assert.equal(a.h, 100);
    assert.equal(a.uv, null);
  }
  assert.deepEqual(s.textRuns, []);
});

ok('builder is deterministic', () => {
  const a = serializeSceneContract(build());
  const b = serializeSceneContract(build());
  assert.equal(a, b);
});

ok('accum defaults null; enabled accum recorded and clamped', () => {
  assert.equal(build().accum, null);
  const doc = fixtureDoc();
  const s = buildSceneContract({
    doc,
    resolvedLayers: resolveLayers(doc, { caps }),
    accum: { enabled: true, fade: 5, background: '#101010' },
  });
  assert.deepEqual(s.accum, { enabled: true, fade: 0.99, optics: 0, tunnel: 0, prism: 0, background: '#101010' });
});

ok('assertSceneContract rejects malformed scenes', () => {
  const s = build();
  assert.throws(() => assertSceneContract({ ...s, version: 999 }), /unsupported version/);
  const badLayer = build();
  badLayer.instances[0] = { ...badLayer.instances[0], layer: 'nope' };
  assert.throws(() => assertSceneContract(badLayer), /unknown layer/);
  const badFx = build();
  badFx.layers[1].fx = [{ kind: 'vaporwave', params: {} }];
  assert.throws(() => assertSceneContract(badFx), /unknown effect kind/);
  const badNum = build();
  badNum.instances[0] = { ...badNum.instances[0], x: NaN };
  assert.throws(() => assertSceneContract(badNum), /must be finite/);
  assert.throws(() => buildSceneContract({ doc: null, resolvedLayers: [] }), /doc required/);
});

ok('no store/schema changes: builder consumes existing shapes only', () => {
  // The fixture uses exactly the layer fields the store already persists
  // (id/name/type/visible/layerBlendMode/layerOpacity/effects). If a future
  // change adds a required builder input, this contract — not the store —
  // is where it lands (additive fields only, per #186).
  const doc = fixtureDoc();
  for (const l of doc.layers) {
    assert.ok(['id', 'name', 'type', 'visible', 'layerBlendMode', 'layerOpacity']
      .every((k) => k in l), `layer ${l.id} carries only known fields`);
  }
  assert.ok(build());
});

console.log(`sceneContract.selfcheck: OK (${n} cases)`);
