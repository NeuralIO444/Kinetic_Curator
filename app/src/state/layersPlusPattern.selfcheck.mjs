// node src/state/layersPlusPattern.selfcheck.mjs
//
// #1014 (mockup C rebuild): per-section "+" — one-tap replays last-used
// defaults; chooser picks record them; boot/shuffle system arms never
// touch them (they build layers directly in layoutSlice).
//
// #1609 re-choreography: the fixed skeleton caps the stack (2 content /
// 1 MATH / 1 FX), and D6 killed the FX per-ordinal family binding — a
// chooser pick of any add-menu kind arms the one FX layer, and one-tap
// replays the last-used kind with no ordinal condition. The flows below
// make room (remove before re-add) instead of stacking past the caps,
// and pin the caps' refusals where the old flow relied on headroom.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { useStore } from './store.js';

const S = () => useStore.getState();
const contentLayers = () => S().layers.filter((l) => l.type === 'content');
const fxLayers = () => S().layers.filter((l) => l.type === 'fx');

// --- last-used starts empty ---------------------------------------------
assert.strictEqual(S().lastUsedContentBlend, null, 'lastUsedContentBlend starts null');
assert.strictEqual(S().lastUsedFxKind, null, 'lastUsedFxKind starts null');

// --- CONTENT: one-tap with no history → built-in default, records nothing
S().addLayer();
let kc = S().layers.at(-1);
assert.strictEqual(kc.type, 'content');
assert.strictEqual(kc.layerBlendMode, 'normal');
assert.strictEqual(S().lastUsedContentBlend, null, 'one-tap replay must not record');
assert.strictEqual(contentLayers().length, 2, 'the skeleton cap is 2 — the stack is now full');

// --- the cap refuses a third content stratum ------------------------------
S().addLayer();
assert.strictEqual(contentLayers().length, 2, 'ADD refuses at the content cap (D3)');

// --- DUP is not a "+" tap: must not record --------------------------------
S().removeLayer(kc.id); // make room under the cap
S().duplicateLayer('layer-1');
assert.strictEqual(contentLayers().length, 2, 'the dup lands under the cap');
assert.strictEqual(S().lastUsedContentBlend, null, 'duplicateLayer must not touch last-used');

// --- CONTENT: chooser pick arms with the pick AND records it --------------
S().removeLayer(contentLayers().find((l) => l.id !== 'layer-1').id);
S().addLayer('screen');
kc = S().layers.at(-1);
assert.strictEqual(kc.layerBlendMode, 'screen');
assert.strictEqual(S().lastUsedContentBlend, 'screen');

// --- CONTENT: one-tap now replays the pick --------------------------------
S().removeLayer('layer-1');
S().addLayer();
kc = S().layers.at(-1);
assert.strictEqual(kc.layerBlendMode, 'screen', 'one-tap must replay last-used blend');

// --- CONTENT: invalid family falls back to last-used, corrupts nothing -----
S().removeLayer(kc.id);
S().addLayer('bogus-mode');
kc = S().layers.at(-1);
assert.strictEqual(kc.layerBlendMode, 'screen', 'invalid family falls back to last-used');
assert.strictEqual(S().lastUsedContentBlend, 'screen');

// --- FX: one-tap with no history → empty layer, records nothing ------------
S().addFxLayer();
let fx = S().layers.at(-1);
assert.strictEqual(fx.type, 'fx');
assert.deepStrictEqual(fx.effects, [], 'no history → empty layer (old ghost-tap default)');
assert.strictEqual(S().lastUsedFxKind, null, 'one-tap replay must not record');

// --- the cap refuses a second FX layer -------------------------------------
S().addFxLayer();
assert.strictEqual(fxLayers().length, 1, 'ADD refuses at the FX cap (D6)');
S().removeLayer(fx.id);

// --- FX: a pick outside the add-menu is a one-tap, records nothing ---------
// (hueShift renders but is not on the curated add-menu — #310/#704.)
S().addFxLayer('hueShift');
fx = S().layers.at(-1);
assert.deepStrictEqual(fx.effects, [], 'non-menu pick falls back to the replay (empty: no history)');
assert.strictEqual(S().lastUsedFxKind, null, 'invalid pick must not record');
S().removeLayer(fx.id);

// --- FX: chooser pick arms the layer AND records it (any family — D6) ------
S().addFxLayer('invert');
fx = S().layers.at(-1);
assert.strictEqual(fx.effects.length, 1);
assert.strictEqual(fx.effects[0].kind, 'invert');
assert.ok(fx.effects[0].params && typeof fx.effects[0].params === 'object', 'invert carries default params');
assert.strictEqual(S().lastUsedFxKind, 'invert');

// --- DUP is not a "+" tap: must not record ----------------------------------
// (Under the skeleton the dup also refuses — there is no second FX layer.)
S().duplicateLayer(fxLayers()[0].id);
assert.strictEqual(fxLayers().length, 1, 'FX dup refuses at the cap');
assert.strictEqual(S().lastUsedFxKind, 'invert', 'duplicateLayer must not touch last-used');

// --- FX: one-tap replays the last-used kind — no ordinal condition (D6) -----
S().removeLayer(fx.id);
S().addFxLayer();
fx = S().layers.at(-1);
assert.strictEqual(fx.effects.length, 1);
assert.strictEqual(fx.effects[0].kind, 'invert', 'one-tap replays last-used on the fresh layer');
assert.strictEqual(S().lastUsedFxKind, 'invert', 'replay must not clobber last-used');

// --- swapLayerPositions: same-class swap --------------------------------------
{
  const ids = contentLayers().map((l) => l.id);
  assert.ok(ids.length >= 2, 'need two content layers to swap');
  const [a, b] = ids;
  const before = S().layers.map((l) => l.id);
  S().swapLayerPositions(a, b);
  const after = S().layers.map((l) => l.id);
  const ia = before.indexOf(a);
  const ib = before.indexOf(b);
  assert.strictEqual(after[ia], b, 'positions trade');
  assert.strictEqual(after[ib], a, 'positions trade');
  S().swapLayerPositions(a, b); // restore
  assert.deepStrictEqual(
    S().layers.map((l) => l.id),
    before,
    'swap back restores order',
  );
}

// --- swapLayerPositions: content never crosses the adjustment line ------------
{
  const c = contentLayers()[0].id;
  const f = fxLayers()[0].id;
  const before = S().layers.map((l) => l.id);
  S().swapLayerPositions(c, f);
  assert.deepStrictEqual(
    S().layers.map((l) => l.id),
    before,
    'cross-class swap refused',
  );
}

// --- boot/shuffle isolation: layoutSlice never writes last-used ---------------
{
  const src = readFileSync(new URL('./slices/layoutSlice.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('lastUsed'), 'layoutSlice must not reference lastUsed* (system arms stay out)');
}

console.log('layersPlusPattern.selfcheck: ok');
