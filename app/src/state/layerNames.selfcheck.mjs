// node src/state/layerNames.selfcheck.mjs
//
// displayLayerName: one naming source. Auto names (baked KC-n / FX n, 'Layer N',
// 'copy') always show the POSITIONAL ordinal, so rows agree with the PATCH
// dropdown and diag line even after a delete leaves two layers with the same
// stored name. A real rename shows 'KC-n · name' (Matt's call, 2026-09-23).
import assert from 'node:assert';
import { displayLayerName } from './slices/layersSlice.js';

const kc = (name) => ({ id: 'x', name, type: 'content' });
const fx = (name) => ({ id: 'x', name, type: 'fx' });

// KC-1,KC-2,KC-3 -> delete KC-2 -> add: stored names KC-1,KC-3,KC-3.
assert.strictEqual(displayLayerName(kc('KC-1'), 1), 'KC-1');
assert.strictEqual(displayLayerName(kc('KC-3'), 2), 'KC-2', 'stale stored ordinal shows the position');
assert.strictEqual(displayLayerName(kc('KC-3'), 3), 'KC-3');

assert.strictEqual(displayLayerName(kc('Layer 4'), 2), 'KC-2');
assert.strictEqual(displayLayerName(kc('Layer'), 2), 'KC-2');
assert.strictEqual(displayLayerName(kc('KC-1 copy'), 2), 'KC-2');
assert.strictEqual(displayLayerName(kc('smoke'), 2), 'KC-2 · smoke', 'rename keeps the position visible');

// FX has the same collision (FX ${count+1}).
assert.strictEqual(displayLayerName(fx('FX 2'), 1), 'FX 1');
assert.strictEqual(displayLayerName(fx('FX 1 copy'), 2), 'FX 2');
assert.strictEqual(displayLayerName(fx('grain'), 1), 'FX 1 · grain');

assert.strictEqual(displayLayerName(null, 1), '');
console.log('layerNames.selfcheck ok');
