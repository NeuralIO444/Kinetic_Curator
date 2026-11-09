// strataRebuild.selfcheck.mjs — #2038: the strata rebuild (Matt's
// ruling, 2026-11-08). Pins, at full strength:
//   · ONE content stratum — the cap is 1 in both modules that carry it,
//     the store refuses a second KC track, and the load door MIGRATES a
//     pre-rebuild two-content document: first content kept, second
//     named in the trims, patches pointing at it go inert — never a
//     refusal, never a silent drop;
//   · patterns pinned to the bottom, locked — the load door re-seats a
//     traded-up pattern into the bottom band, and canTrade no longer
//     lets a pattern swap with the content stratum;
//   · the full order is canonical (patterns → content → FX → MATH),
//     stable within a band;
//   · per-stratum rotation — detents only (0/15/45/90), the key exists
//     only while non-zero through store set / load / save round trips,
//     items rotate rigidly about the stage centre, and the contract
//     carries the detent on layer + wrap and refuses a non-detent.
import assert from 'node:assert';
import { useStore } from './store.js';
import { MAX_CONTENT_TRACKS as SLICE_MAX_CONTENT, isKcLayer, isPatternLayer } from './slices/layersSlice.js';
import { normalizeLayers, MAX_CONTENT_TRACKS as NORM_MAX_CONTENT } from './projectNormalize.js';
import { parseProject, serializeProject } from './projectDocument.js';
import { canonicalStrataOrder, canTrade } from './layerOrder.js';
import {
  STRATUM_ROTATIONS,
  sanitizeStratumRotation,
  stratumRotationOf,
  rotatePoint,
  rotateItems,
} from './stratumRotation.js';
import { buildSceneContract, assertSceneContract } from '../gl/sceneContract.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const L = (id, type, extra = {}) => ({
  id,
  name: id,
  type,
  visible: true,
  layerBlendMode: 'normal',
  layerOpacity: 1,
  ...(type === 'content' ? { patch: { mode: 'off', to: null, strength: 0.16 } } : {}),
  ...(type === 'pattern' ? { pattern: { mode: 'QUILT' } } : {}),
  ...(type === 'fx' || type === 'math' ? { effects: [] } : {}),
  ...extra,
});
const ids = (ls) => ls.map((l) => l.id);

ok('one content stratum: the cap is 1 in the slice and in the load door', () => {
  assert.equal(SLICE_MAX_CONTENT, 1);
  assert.equal(NORM_MAX_CONTENT, 1);
});

ok('migration: a pre-rebuild two-content document loads — first kept, second named, patch inert', () => {
  const raw = [
    L('kc-a', 'content', { name: 'Alpha' }),
    L('kc-b', 'content', {
      name: 'Beta',
      patch: { mode: 'mod', to: 'kc-a', strength: 0.5 },
    }),
    L('fx-1', 'fx'),
    L('m-1', 'math'),
  ];
  // Alpha patches at Beta (the stratum that will trim): the link must
  // go inert, not dangle.
  raw[0].patch = { mode: 'feed', to: 'kc-b', strength: 0.16 };
  const { layers, activeLayerId, trims } = normalizeLayers(raw, 'kc-a');
  assert.deepEqual(ids(layers), ['kc-a', 'fx-1', 'm-1'], 'exactly one content stratum survives');
  assert.deepEqual(trims, ['content stratum "Beta"'], 'the dropped stratum is named, out loud');
  assert.equal(activeLayerId, 'kc-a');
  const alpha = layers.find((l) => l.id === 'kc-a');
  assert.equal(alpha.patch.to, null, 'a patch pointing at the trimmed stratum goes inert');
});

ok('migration rides parseProject: the receipt names the trim (doc.layerTrims)', () => {
  const r = parseProject({
    version: 1,
    seed: 7,
    layers: [L('kc-a', 'content', { name: 'Alpha' }), L('kc-b', 'content', { name: 'Beta' })],
    activeLayerId: 'kc-a',
  });
  assert.equal(r.ok, true);
  assert.equal(r.doc.layers.filter((l) => l.type === 'content').length, 1);
  assert.ok(
    (r.doc.layerTrims || []).some((t) => t.includes('Beta')),
    `layerTrims names Beta (got ${JSON.stringify(r.doc.layerTrims)})`,
  );
});

ok('patterns pinned: a pattern stored above the content stratum is re-seated to the bottom', () => {
  const raw = [L('kc-a', 'content'), L('pt-1', 'pattern'), L('pt-2', 'pattern'), L('fx-1', 'fx')];
  const { layers } = normalizeLayers(raw, 'kc-a');
  assert.deepEqual(ids(layers), ['pt-1', 'pt-2', 'kc-a', 'fx-1'], 'patterns at the bottom, their own order kept');
});

ok('canonical order: stable within bands, moved flag honest', () => {
  const scrambled = [L('m', 'math'), L('kc', 'content'), L('p2', 'pattern'), L('f', 'fx'), L('p1', 'pattern')];
  const r = canonicalStrataOrder(scrambled);
  assert.equal(r.moved, true);
  assert.deepEqual(
    ids(r.layers),
    ['p2', 'p1', 'kc', 'f', 'm'],
    'band order fixed, pattern order stable (p2 stayed ahead of p1)',
  );
  const again = canonicalStrataOrder(r.layers);
  assert.equal(again.moved, false);
  assert.equal(canonicalStrataOrder(null).moved, false);
});

ok('canTrade: a pattern trades only with a pattern — never up past the content stratum', () => {
  const p = L('p', 'pattern');
  const c = L('c', 'content');
  assert.equal(canTrade(p, c), false);
  assert.equal(canTrade(c, p), false);
  assert.equal(canTrade(p, L('p2', 'pattern')), true);
  assert.equal(canTrade(c, L('f', 'fx')), false);
  assert.equal(canTrade(L('f', 'fx'), L('m', 'math')), false);
});

ok('the store refuses a second content stratum, and a new one seats below the grade', () => {
  useStore.setState({
    layers: [L('kc-a', 'content'), L('m-1', 'math'), L('fx-1', 'fx')],
    activeLayerId: 'kc-a',
    layerSnapshots: {},
    seed: 1,
    seedOffsets: undefined,
    paletteId: 'praystation',
    paletteOverrides: null,
    layoutParams: {},
    lockedParams: {},
    caGrid: null,
    enabledAssets: {},
  });
  // Canonicalize the seeded stack the way a load would leave it.
  useStore.setState({ layers: canonicalStrataOrder(useStore.getState().layers).layers });
  useStore.getState().addLayer();
  assert.equal(useStore.getState().layers.filter(isKcLayer).length, 1, 'addLayer refused: still one content stratum');
  // With the content stratum removed, a fresh one seats into the band.
  useStore.setState({ layers: useStore.getState().layers.filter((l) => l.type !== 'content') });
  useStore.getState().addLayer();
  const ls = useStore.getState().layers;
  assert.deepEqual(
    ls.map((l) => l.type),
    ['content', 'fx', 'math'],
    'the new content stratum seats below FX and MATH',
  );
});

ok('rotation detents: sanitize is exact — detents only, everything else is 0', () => {
  assert.deepEqual([...STRATUM_ROTATIONS], [0, 15, 45, 90]);
  assert.equal(sanitizeStratumRotation(15), 15);
  assert.equal(sanitizeStratumRotation(45), 45);
  assert.equal(sanitizeStratumRotation(90), 90);
  assert.equal(sanitizeStratumRotation(0), 0);
  assert.equal(sanitizeStratumRotation(30), 0, 'a non-detent is dropped, never clamped to a neighbour');
  assert.equal(
    sanitizeStratumRotation('45'),
    45,
    'a numeric string coerces (document JSON is numbers; be lenient on read)',
  );
  assert.equal(sanitizeStratumRotation(NaN), 0);
  assert.equal(sanitizeStratumRotation(undefined), 0);
  assert.equal(stratumRotationOf({ rotation: 45 }), 45);
  assert.equal(stratumRotationOf({}), 0);
  assert.equal(stratumRotationOf(null), 0);
});

ok('rotation in the store: key exists only while non-zero; duplicates carry it', () => {
  useStore.setState({
    layers: [L('kc-a', 'content'), L('fx-1', 'fx')],
    activeLayerId: 'kc-a',
    layerSnapshots: {},
  });
  const S = () => useStore.getState();
  S().setLayerRotation('fx-1', 45);
  assert.equal(S().layers.find((l) => l.id === 'fx-1').rotation, 45);
  S().setLayerRotation('fx-1', 30);
  assert.ok(
    !('rotation' in S().layers.find((l) => l.id === 'fx-1')),
    'a non-detent set clears the key (sanitizes to 0)',
  );
  S().setLayerRotation('kc-a', 90);
  assert.equal(S().layers.find((l) => l.id === 'kc-a').rotation, 90);
  S().setLayerRotation('kc-a', 0);
  assert.ok(!('rotation' in S().layers.find((l) => l.id === 'kc-a')), 'setting 0 deletes the key');
});

ok('a duplicated pattern stratum carries its rotation (key only while non-zero)', () => {
  useStore.setState({
    layers: [L('kc-a', 'content'), L('pt-1', 'pattern', { rotation: 45 })],
    activeLayerId: 'kc-a',
    layerSnapshots: {},
  });
  const S = () => useStore.getState();
  S().duplicateLayer('pt-1');
  const patterns = S().layers.filter(isPatternLayer);
  assert.equal(patterns.length, 2);
  assert.ok(
    patterns.every((p) => p.rotation === 45),
    'both the source and the copy carry the detent',
  );
});

ok('rotation through the load door: detents survive, non-detents drop, round trip is stable', () => {
  const { layers } = normalizeLayers(
    [L('kc-a', 'content', { rotation: 15 }), L('fx-1', 'fx', { rotation: 30 }), L('m-1', 'math', { rotation: 90 })],
    'kc-a',
  );
  assert.equal(layers.find((l) => l.id === 'kc-a').rotation, 15);
  assert.ok(!('rotation' in layers.find((l) => l.id === 'fx-1')), 'rotation 30 dropped at the door');
  assert.equal(layers.find((l) => l.id === 'm-1').rotation, 90);
  // Save → load → save: the serialized layer set is byte-stable.
  const state = {
    seed: 3,
    seedOffsets: undefined,
    paletteId: 'praystation',
    paletteOverrides: null,
    layoutParams: {},
    enabledAssets: {},
    quality: 'balanced',
    autoQuality: true,
    layers,
    activeLayerId: 'kc-a',
    layerSnapshots: {},
    customAssets: [],
  };
  const once = serializeProject(state).layers;
  const twice = parseProject(JSON.parse(JSON.stringify(serializeProject(state)))).doc.layers;
  assert.equal(JSON.stringify(twice), JSON.stringify(once), 'rotation survives the round trip byte-identically');
});

ok('rotateItems: rigid about the centre, angles advance, 0 is the same array', () => {
  const items = [{ assetId: 'a', x: 110, y: 50, rotation: 10 }];
  const out = rotateItems(items, 200, 100, 90);
  // (110, 50) is 10px right of centre (100, 50); 90° clockwise in
  // screen space lands it 10px BELOW centre.
  assert.deepEqual({ x: out[0].x, y: out[0].y }, { x: 100, y: 60 });
  assert.equal(out[0].rotation, 100, 'the mark’s own angle advances by the detent');
  assert.equal(rotateItems(items, 200, 100, 0), items, 'detent 0 returns the same array');
  assert.equal(rotateItems(items, 200, 100, 30), items, 'a non-detent returns the same array');
  const p = rotatePoint(100, 0, 100, 50, 90);
  assert.deepEqual(p, { x: 150, y: 50 }, 'above centre at 90° lands right of centre');
});

ok('the contract carries the detent on layer + wrap, and refuses a non-detent', () => {
  const doc = {
    seed: 1,
    quality: 'balanced',
    layers: [L('kc-a', 'content'), L('fx-1', 'fx', { rotation: 45, effects: [{ kind: 'invert', params: {} }] })],
  };
  const resolved = [
    { id: 'kc-a', layer: doc.layers[0], layoutParams: {}, palette: null, items: [], layerOpacity: 1 },
    {
      id: 'fx-1',
      isFx: true,
      layer: doc.layers[1],
      rotation: 45,
      layerOpacity: 1,
    },
  ];
  const scene = buildSceneContract({ doc, resolvedLayers: resolved });
  const wrap = scene.fxWraps.find((w) => w.fxLayerId === 'fx-1');
  assert.equal(wrap.rotation, 45, 'the wrap carries the detent');
  assert.equal(scene.layers.find((l) => l.id === 'fx-1').rotation, 45, 'the layer entry carries it too');
  assert.ok(!('rotation' in scene.layers.find((l) => l.id === 'kc-a')), 'unrotated layers carry no key');
  const bad = JSON.parse(JSON.stringify(scene));
  bad.layers.find((l) => l.id === 'fx-1').rotation = 30;
  assert.throws(() => assertSceneContract(bad), /rotation is only ever a detent/);
  const badWrap = JSON.parse(JSON.stringify(scene));
  badWrap.fxWraps[0].rotation = 12;
  assert.throws(() => assertSceneContract(badWrap), /rotation is only ever a detent/);
});

ok('a pattern layer is never the active layer and spends no content slot at the door', () => {
  const { layers, activeLayerId } = normalizeLayers([L('pt-1', 'pattern'), L('kc-a', 'content')], 'pt-1');
  assert.equal(layers.filter(isPatternLayer).length, 1);
  assert.equal(layers.filter(isKcLayer).length, 1);
  assert.equal(activeLayerId, 'kc-a');
});

console.log(`strataRebuild.selfcheck: ${n} checks passed`);
