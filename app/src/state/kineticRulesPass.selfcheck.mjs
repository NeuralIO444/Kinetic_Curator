// node src/state/kineticRulesPass.selfcheck.mjs
//
// #943 — kineticRulesPass() is the KINETIC button's RULES layer. One calm tap
// must re-work the composition under the four design rules while keeping the
// piece's DNA: same seed, same palette, same asset pool, same FX —
// recognizably related, visibly restructured, in one undo step.
import assert from 'node:assert';
import { useStore } from './store.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { MODE_IDS } from '../data/layout-modes.js';
import { isFxLayer } from '../fx/fxFilters.js';

const S = () => useStore.getState();
const compIds = new Set(COMPOSITION_PRESETS.map((p) => p.id));

// Setup: force density high so the separation clamp is exercised.
S().setLayoutParam('density', 90);
const before = S();
const seedBefore = before.seed;
const paletteBefore = before.paletteId;
const assetsBefore = JSON.stringify(before.enabledAssets);
const layersBefore = before.layers.length;
const fxBefore = JSON.stringify(before.layers.filter(isFxLayer).map((l) => l.effects));
const compBefore = before.layoutParams.composition;
const undoDepthBefore = before.historyUndoStack.length;

S().kineticRulesPass();
const s = S();

// 1. DNA kept: same seed, palette, assets, FX — a cousin, not a stranger.
assert.strictEqual(s.seed, seedBefore, 'RULES keeps the seed (same DNA)');
assert.strictEqual(s.paletteId, paletteBefore, 'RULES keeps the palette (not a recolor)');
assert.strictEqual(JSON.stringify(s.enabledAssets), assetsBefore, 'RULES keeps the asset pool');
assert.strictEqual(s.layers.length, layersBefore, 'RULES does not touch layer structure');
assert.strictEqual(
  JSON.stringify(s.layers.filter(isFxLayer).map((l) => l.effects)),
  fxBefore,
  'RULES does not touch the FX chain',
);

// 2. Structure re-worked: a different known composition, valid mode.
assert.ok(compIds.has(s.layoutParams.composition), `composition ${s.layoutParams.composition} is a known preset`);
assert.notStrictEqual(s.layoutParams.composition, compBefore, 'RULES re-works the composition');
assert.ok(MODE_IDS.includes(s.layoutParams.mode), `mode ${s.layoutParams.mode} is a valid layout mode`);

// 3. Rules imposed: separation (overlap off + density breathing room), bleed valid.
assert.strictEqual(s.layoutParams.overlap, false, 'separation rule: overlap is off');
assert.ok(
  s.layoutParams.density >= 10 && s.layoutParams.density <= 65,
  `separation rule: density in breathing room, got ${s.layoutParams.density}`,
);
assert.strictEqual(typeof s.layoutParams.bleed, 'boolean', 'bleed is a valid boolean');

// 4. One undo step restores the pre-pass structure.
assert.strictEqual(s.historyUndoStack.length, undoDepthBefore + 1, 'one pass = one undo entry');
S().undo();
const u = S();
assert.strictEqual(u.layoutParams.composition, compBefore, 'undo restores the composition');
assert.strictEqual(u.layoutParams.density, 90, 'undo restores density');
assert.strictEqual(u.seed, seedBefore, 'undo keeps the seed');

// 5. Locked params survive the pass.
S().toggleParamLock('overlap');
S().setLayoutParam('overlap', true);
S().kineticRulesPass();
assert.strictEqual(S().layoutParams.overlap, true, 'locked overlap survives the pass');
S().toggleParamLock('overlap');

console.log('kineticRulesPass.selfcheck ok');
