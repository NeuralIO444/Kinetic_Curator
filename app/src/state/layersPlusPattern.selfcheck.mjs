// node src/state/layersPlusPattern.selfcheck.mjs
//
// #1014 (mockup C rebuild): per-section "+" — one-tap replays last-used
// defaults; chooser picks record them; boot/shuffle system arms never
// touch them (they build layers directly in layoutSlice).
//
// FX ordinals are bound to one family each (#520/#732: FX-1 Distort, FX-2
// Tonal, FX-3 Blur, FX-4 Finish), so a kind only replays when the new
// track's family can hold it — replay goes live on remove/re-add at an
// ordinal; cross-family falls back to the empty rack (never a phantom
// effect the row editor can't show).
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

// --- DUP is not a "+" tap: must not record --------------------------------
S().duplicateLayer(kc.id);
assert.strictEqual(S().lastUsedContentBlend, null, 'duplicateLayer must not touch last-used');
assert.strictEqual(contentLayers().length, 3);

// --- CONTENT: chooser pick arms with the pick AND records it --------------
S().addLayer('screen');
kc = S().layers.at(-1);
assert.strictEqual(kc.layerBlendMode, 'screen');
assert.strictEqual(S().lastUsedContentBlend, 'screen');

// --- CONTENT: one-tap now replays the pick --------------------------------
S().removeLayer(contentLayers().find((l) => l.id !== 'layer-1' && l.layerBlendMode === 'normal').id);
S().addLayer();
kc = S().layers.at(-1);
assert.strictEqual(kc.layerBlendMode, 'screen', 'one-tap must replay last-used blend');

// --- CONTENT: invalid family falls back to last-used, corrupts nothing -----
S().removeLayer(kc.id);
S().addLayer('bogus-mode');
kc = S().layers.at(-1);
assert.strictEqual(kc.layerBlendMode, 'screen', 'invalid family falls back to last-used');
assert.strictEqual(S().lastUsedContentBlend, 'screen');

// --- FX: one-tap with no history → empty rack, records nothing -------------
// (FX-1 = Distort family)
S().addFxLayer();
let fx = S().layers.at(-1);
assert.strictEqual(fx.type, 'fx');
assert.deepStrictEqual(fx.effects, [], 'no history → empty rack (old ghost-tap default)');
assert.strictEqual(S().lastUsedFxKind, null, 'one-tap replay must not record');

// --- FX: pick for the WRONG family → treated as one-tap, records nothing ---
// (next = FX-2 = Tonal; tear is a Distort kind)
S().addFxLayer('tear');
fx = S().layers.at(-1);
assert.deepStrictEqual(fx.effects, [], 'cross-family pick falls back to empty rack');
assert.strictEqual(S().lastUsedFxKind, null, 'invalid pick must not record');
S().removeLayer(fx.id);

// --- FX: chooser pick for the right family arms it AND records it ----------
S().addFxLayer('invert'); // FX-2 = Tonal
fx = S().layers.at(-1);
assert.strictEqual(fx.effects.length, 1);
assert.strictEqual(fx.effects[0].kind, 'invert');
assert.ok(fx.effects[0].params && typeof fx.effects[0].params === 'object', 'invert carries default params');
assert.strictEqual(S().lastUsedFxKind, 'invert');

// --- DUP is not a "+" tap: must not record ----------------------------------
S().duplicateLayer(fxLayers()[0].id); // FX-3 = Blur, copy of empty FX-1
assert.strictEqual(S().lastUsedFxKind, 'invert', 'duplicateLayer must not touch last-used');

// --- FX: one-tap cross-family → honest empty rack ----------------------------
// (next = FX-4 = Finish; invert is a Tonal kind)
S().addFxLayer();
fx = S().layers.at(-1);
assert.deepStrictEqual(fx.effects, [], 'cross-family replay falls back to empty rack');
assert.strictEqual(S().lastUsedFxKind, 'invert', 'fallback replay must not clobber last-used');

// --- FX: remove/re-add at an ordinal → replay goes live ----------------------
for (const id of fxLayers().slice(1).map((l) => l.id)) S().removeLayer(id); // keep FX-1
assert.strictEqual(fxLayers().length, 1);
S().addFxLayer(); // FX-2 = Tonal again → invert replays
fx = S().layers.at(-1);
assert.strictEqual(fx.effects.length, 1);
assert.strictEqual(fx.effects[0].kind, 'invert', 'replay goes live on remove/re-add at an ordinal');

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
  assert.deepStrictEqual(S().layers.map((l) => l.id), before, 'swap back restores order');
}

// --- swapLayerPositions: content never crosses the adjustment line ------------
{
  const c = contentLayers()[0].id;
  const f = fxLayers()[0].id;
  const before = S().layers.map((l) => l.id);
  S().swapLayerPositions(c, f);
  assert.deepStrictEqual(S().layers.map((l) => l.id), before, 'cross-class swap refused');
}

// --- boot/shuffle isolation: layoutSlice never writes last-used ---------------
{
  const src = readFileSync(new URL('./slices/layoutSlice.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('lastUsed'), 'layoutSlice must not reference lastUsed* (system arms stay out)');
}

console.log('layersPlusPattern.selfcheck: ok');
