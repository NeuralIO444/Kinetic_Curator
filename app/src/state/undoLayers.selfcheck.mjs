// node src/state/undoLayers.selfcheck.mjs
//
// #223: bounded global undo for parameter, layer, and palette actions.
import assert from 'node:assert';
import { useStore } from './store.js';
import {
  UNDO_MAX_DEPTH,
  UNDO_MAX_BYTES,
  UNDO_KIND_EDIT,
  UNDO_KIND_LAYERS,
  trimUndoStack,
  entryApplies,
} from './history.js';

const { getState } = useStore;
const S = () => getState();
const undoDepth = () => S().historyUndoStack.length;
const redoDepth = () => S().historyRedoStack.length;
const topKind = () => S().historyUndoStack.at(-1)?.kind;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

assert.strictEqual(UNDO_MAX_DEPTH, 50, 'depth bound must be 50');
assert.strictEqual(UNDO_MAX_BYTES, 8 * 1024 * 1024, 'memory bound must be 8 MiB');

{
  const stack = Array.from({ length: 60 }, (_, i) => ({ bytes: 10, n: i }));
  const t = trimUndoStack(stack);
  assert.strictEqual(t.length, UNDO_MAX_DEPTH);
  assert.strictEqual(t[0].n, 10, 'oldest entries evicted first');
}
{
  const big = { bytes: 6 * 1024 * 1024 };
  assert.strictEqual(trimUndoStack([big, { ...big }]).length, 1);
  assert.strictEqual(trimUndoStack([{ bytes: 20 * 1024 * 1024 }]).length, 1);
}
assert.ok(entryApplies({ kind: UNDO_KIND_LAYERS, layerId: 'x' }, 'y'), 'layers entries always apply');
assert.ok(entryApplies({ kind: UNDO_KIND_EDIT, layerId: 'x' }, 'x'));
assert.ok(!entryApplies({ kind: UNDO_KIND_EDIT, layerId: 'x' }, 'y'), '#92: mismatched edit never applies');
assert.ok(!entryApplies(null, 'y'));

const layerA = S().activeLayerId;
const count0 = S().layers.length;
S().addLayer();
const layerB = S().activeLayerId;
assert.notStrictEqual(layerB, layerA, 'addLayer must switch to a new layer id');
assert.strictEqual(S().layers.length, count0 + 1);
assert.strictEqual(topKind(), UNDO_KIND_LAYERS, 'addLayer must push a layers entry');
assert.ok(S().historyUndoStack.at(-1).bytes > 0, 'entries carry their estimated size');

S().undo();
assert.strictEqual(S().layers.length, count0, 'undo removes the added layer');
assert.strictEqual(S().activeLayerId, layerA, 'undo restores the pre-add active layer');
assert.strictEqual(S().historyRedoStack.at(-1).kind, UNDO_KIND_LAYERS);

S().redo();
assert.strictEqual(S().layers.length, count0 + 1, 'redo re-adds the layer');
assert.strictEqual(S().activeLayerId, layerB);

S().setSeed(777);
assert.strictEqual(topKind(), UNDO_KIND_EDIT);
S().removeLayer(layerB);
assert.strictEqual(S().layers.length, count0);
assert.strictEqual(S().activeLayerId, layerA);
assert.strictEqual(topKind(), UNDO_KIND_LAYERS, 'removeLayer must push a layers entry');

S().undo();
assert.strictEqual(S().layers.length, count0 + 1, 'undo restores the removed layer');
assert.strictEqual(S().activeLayerId, layerB);
assert.strictEqual(S().seed, 777, "removed layer's own content comes back with it");
S().redo();
assert.strictEqual(S().layers.length, count0, 'redo re-removes the layer');
assert.strictEqual(S().activeLayerId, layerA);

S().toggleLayerVisible(layerA);
assert.strictEqual(topKind(), UNDO_KIND_LAYERS);
assert.strictEqual(S().layers.find((l) => l.id === layerA).visible, false);
S().undo();
assert.strictEqual(S().layers.find((l) => l.id === layerA).visible, true, 'undo restores visibility');

S().setLayerBlendMode(layerA, 'multiply');
assert.strictEqual(topKind(), UNDO_KIND_LAYERS);
S().undo();
assert.strictEqual(S().layers.find((l) => l.id === layerA).layerBlendMode, 'normal');

S().renameLayer(layerA, 'Renamed');
S().undo();
assert.strictEqual(S().layers.find((l) => l.id === layerA).name, 'KC-1');

S().addLayer();
const layerC = S().activeLayerId;
const orderBefore = S().layers.map((l) => l.id);
S().reorderLayer(layerC, -1);
assert.notDeepStrictEqual(S().layers.map((l) => l.id), orderBefore);
assert.strictEqual(topKind(), UNDO_KIND_LAYERS);
S().undo();
assert.deepStrictEqual(S().layers.map((l) => l.id), orderBefore, 'undo restores layer order');

const fxDepthBefore = undoDepth();
S().addFxLayer();
const fxId = S().selectedFxLayerId;
assert.ok(fxId, 'addFxLayer selects the new FX layer');
assert.strictEqual(topKind(), UNDO_KIND_LAYERS);
const fxEffects0 = S().layers.find((l) => l.id === fxId).effects.length;

S().fxEffectAdd(fxId, 'grain');
assert.strictEqual(S().layers.find((l) => l.id === fxId).effects.length, fxEffects0 + 1);
S().undo();
assert.strictEqual(S().layers.find((l) => l.id === fxId).effects.length, fxEffects0, 'undo removes the added effect');

S().fxEffectRemove(fxId, 99);
assert.strictEqual(undoDepth(), fxDepthBefore + 1, 'no-op FX remove must not push');
S().fxEffectReorder(fxId, 0, -5);
assert.strictEqual(undoDepth(), fxDepthBefore + 1, 'no-op FX reorder must not push');

await sleep(900);
const d0 = undoDepth();
S().fxEffectSetParam(fxId, 0, 'dx', 9);
assert.strictEqual(undoDepth(), d0 + 1, 'first slider tick pushes');
S().fxEffectSetParam(fxId, 0, 'dx', 11);
assert.strictEqual(undoDepth(), d0 + 1, 'rapid slider ticks share one debounced entry');
S().undo();
assert.strictEqual(
  S().layers.find((l) => l.id === fxId).effects[0].params.dx, 3,
  'undo restores the pre-drag FX param',
);
S().undo();
assert.ok(!S().layers.some((l) => l.id === fxId), 'undo removes the FX layer');

S().setActiveLayer(layerA);
const seedA0 = S().seed;
S().setSeed(111);
assert.strictEqual(S().historyUndoStack.at(-1).layerId, layerA);
S().setActiveLayer(layerC);
const seedC0 = S().seed;
S().setSeed(222);
assert.strictEqual(S().historyUndoStack.at(-1).layerId, layerC);
S().setActiveLayer(layerA);
assert.strictEqual(S().seed, 111, "switching back restores A's own snapshot");

const undoBefore = undoDepth();
S().undo();
assert.strictEqual(S().seed, 111, 'undo on A must not be corrupted by a C-tagged entry');
assert.notStrictEqual(S().seed, seedC0, 'A must never receive C\'s value');
assert.strictEqual(undoDepth(), undoBefore, 'mismatched undo must not pop the stack');
assert.strictEqual(S().activeLayerId, layerA, 'edit undo must never change the active layer');

S().setActiveLayer(layerC);
assert.strictEqual(S().seed, 222, "switching to C restores C's own snapshot");
S().undo();
assert.strictEqual(S().seed, seedC0, "undo on C applies C's own entry");

S().setActiveLayer(layerA);
assert.strictEqual(S().seed, 111);
const redoBefore = redoDepth();
S().redo();
assert.strictEqual(S().seed, 111, 'redo on A must not be corrupted by a C-tagged redo entry');
assert.strictEqual(redoDepth(), redoBefore, 'mismatched redo must not pop the stack');

S().undo();
assert.strictEqual(S().seed, seedA0, "undo on A applies A's own entry");
S().redo();
assert.strictEqual(S().seed, 111, "redo on A restores A's edit");

for (let i = 0; i < 60; i++) S().setSeed(1000 + i);
assert.strictEqual(undoDepth(), UNDO_MAX_DEPTH, 'live stack honors the depth cap');
assert.ok(S().historyUndoStack.every((e) => e.bytes > 0), 'every entry carries its size');
const totalBytes = S().historyUndoStack.reduce((n, e) => n + e.bytes, 0);
assert.ok(totalBytes <= UNDO_MAX_BYTES, `live stack honors the memory cap (${totalBytes} bytes)`);

const liveDepth = undoDepth();
S().setFps(60);
S().setAudioStimulus(0.5);
S().setBeatPulse(0.3);
assert.strictEqual(undoDepth(), liveDepth, 'fps/audio/beat must not create undo entries');

const palBefore = S().paletteId;
S().setPaletteId('v01d');
assert.strictEqual(topKind(), UNDO_KIND_EDIT, 'palette change pushes an edit entry');
assert.strictEqual(undoDepth(), UNDO_MAX_DEPTH, 'push at the cap evicts oldest, depth unchanged');
S().undo();
assert.strictEqual(S().paletteId, palBefore, 'undo restores the palette');
S().redo();
assert.strictEqual(S().paletteId, 'v01d', 'redo re-applies the palette');

console.log('undoLayers.selfcheck: OK');
