// node src/state/undoLayers.selfcheck.mjs
//
// #92: undo/redo entries are tagged with the layerId they were captured
// for, and the shared historyUndoStack/historyRedoStack survive a layer
// switch instead of being wiped. The invariant that must never break:
// undo/redo must never restore one layer's values onto a different layer.
import assert from 'node:assert';
import { useStore } from './store.js';

const { getState } = useStore;

// --- Layer A: one edit ---------------------------------------------------
const layerA = getState().activeLayerId;
const seedA0 = getState().seed; // A's original seed
getState().setSeed(111);
assert.strictEqual(getState().seed, 111);
assert.strictEqual(getState().historyUndoStack.at(-1).layerId, layerA);

// --- Create layer B, edit it too -----------------------------------------
getState().addLayer();
const layerB = getState().activeLayerId;
assert.notStrictEqual(layerB, layerA, 'addLayer must switch to a new layer id');
const seedB0 = getState().seed; // B's fresh seed, before B's edit
getState().setSeed(222);
assert.strictEqual(getState().seed, 222);
assert.strictEqual(getState().historyUndoStack.at(-1).layerId, layerB);

// History must NOT have been wiped by the switch/creation (the bug this
// issue fixes) — both entries are still present.
assert.strictEqual(getState().historyUndoStack.length, 2);

// --- Switch back to A: the invariant check --------------------------------
getState().setActiveLayer(layerA);
assert.strictEqual(getState().seed, 111, 'switching back must restore A\'s own snapshot');

// Top of the shared undo stack belongs to B. Undo while A is active must
// refuse (no-op), NEVER apply B's stored seed onto A.
const undoStackBefore = getState().historyUndoStack.length;
getState().undo();
assert.strictEqual(getState().seed, 111, 'undo on A must not be corrupted by a B-tagged entry');
assert.notStrictEqual(getState().seed, seedB0, 'A must never receive B\'s value');
assert.strictEqual(getState().historyUndoStack.length, undoStackBefore, 'mismatched undo must not pop the stack');
assert.strictEqual(getState().activeLayerId, layerA, 'undo must never change the active layer');

// --- Switch to B: the same entry now legitimately applies -----------------
getState().setActiveLayer(layerB);
assert.strictEqual(getState().seed, 222, 'switching to B restores B\'s own snapshot');
getState().undo();
assert.strictEqual(getState().seed, seedB0, 'undo on B applies B\'s own entry');
assert.strictEqual(getState().historyUndoStack.length, 1, 'B\'s entry was popped');
assert.strictEqual(getState().historyRedoStack.at(-1).layerId, layerB);

// --- Cross-layer redo refusal ----------------------------------------------
getState().setActiveLayer(layerA);
assert.strictEqual(getState().seed, 111);
// Top of redo stack belongs to B; redo while A is active must refuse.
const redoStackBefore = getState().historyRedoStack.length;
getState().redo();
assert.strictEqual(getState().seed, 111, 'redo on A must not be corrupted by a B-tagged redo entry');
assert.strictEqual(getState().historyRedoStack.length, redoStackBefore, 'mismatched redo must not pop the stack');

// A's own undo entry is still there and still applies correctly.
getState().undo();
assert.strictEqual(getState().seed, seedA0, 'undo on A applies A\'s own entry');
assert.strictEqual(getState().historyUndoStack.length, 0);

getState().redo();
assert.strictEqual(getState().seed, 111, 'redo on A restores A\'s edit');

// Redo stack still holds B's entry, untouched throughout — confirms it was
// never consulted while A was active.
assert.strictEqual(getState().historyRedoStack.length, 1);
assert.strictEqual(getState().historyRedoStack[0].layerId, layerB);

console.log('undoLayers.selfcheck: OK');
