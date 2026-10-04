// node src/state/kineticRoll.selfcheck.mjs
//
// #942 — kineticRoll() is the KINETIC button's naive full re-roll. One tap
// must produce a complete, valid, undoable recipe: nonzero seed, catalog
// palette, known composition preset, non-empty asset pool, one FX layer with
// valid menu effects, valid blend modes — and one undo step takes it all back.
import assert from 'node:assert';
import { useStore } from './store.js';
import { PALETTES } from '../data/palettes.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { FX_MENU_KINDS, isFxLayer } from '../fx/fxFilters.js';
import { BLEND_MODES } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';

const S = () => useStore.getState();
const palIds = new Set(PALETTES.map((p) => p.id));
const compIds = new Set(COMPOSITION_PRESETS.map((p) => p.id));
const assetIds = new Set(ASSETS.map((a) => a.id));

// Lock density: the preset merge must respect lockedParams like applyPreset.
S().toggleParamLock('density');
const lockedDensity = S().layoutParams.density;
const seedBefore = S().seed;
const undoDepthBefore = S().historyUndoStack.length;

S().kineticRoll();
const s = S();

// 1. seed — nonzero uint32 (worker uses `seed || 1`; zero would alias).
assert.ok(Number.isInteger(s.seed) && s.seed >= 1 && s.seed <= 0xffffffff, `seed is a uint32, got ${s.seed}`);
assert.notStrictEqual(s.seed, seedBefore, 'a roll draws a fresh seed');

// 2. palette — real catalog id, overrides cleared (crossfade rides paletteMixSeconds).
assert.ok(palIds.has(s.paletteId), `paletteId ${s.paletteId} is in the catalog`);
assert.strictEqual(s.paletteOverrides, null, 'palette overrides clear on roll');

// 3. composition — real preset id; locked density untouched.
assert.ok(compIds.has(s.layoutParams.composition), `composition ${s.layoutParams.composition} is a known preset`);
assert.strictEqual(s.layoutParams.density, lockedDensity, 'locked density survives the roll');

// 4. assets — non-empty pool of known ids.
const on = Object.keys(s.enabledAssets || {}).filter((k) => s.enabledAssets[k]);
assert.ok(on.length > 0, 'asset pool is never empty after a roll');
assert.ok(on.every((id) => assetIds.has(id)), 'every enabled asset is a known id');

// 5. FX + blend — exactly one FX layer, valid menu effects, valid blends.
const fxLayers = s.layers.filter(isFxLayer);
assert.strictEqual(fxLayers.length, 1, `one FX layer after a roll, got ${fxLayers.length}`);
assert.ok(
  fxLayers[0].effects.every((e) => FX_MENU_KINDS.includes(e.kind)),
  'FX effects are menu kinds with default params',
);
assert.ok(
  s.layers.filter((l) => !isFxLayer(l)).every((l) => BLEND_MODES.includes(l.layerBlendMode)),
  'content layers carry valid blend modes',
);

// 6. undo — the whole roll is one step; one undo restores the seed.
assert.strictEqual(s.historyUndoStack.length, undoDepthBefore + 1, 'one roll = one undo entry');
S().undo();
assert.strictEqual(S().seed, seedBefore, 'undo restores the pre-roll seed');

// 7. second roll reuses the FX layer instead of stacking new ones.
S().kineticRoll();
assert.strictEqual(S().layers.filter(isFxLayer).length, 1, 'no FX layer sprawl across rolls');

console.log('kineticRoll.selfcheck ok');
