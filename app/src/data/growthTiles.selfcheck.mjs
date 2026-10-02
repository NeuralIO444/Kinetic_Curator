// node src/data/growthTiles.selfcheck.mjs
//
// #834 — DLA / Eden growth modes are directly reachable from the mode picker.
// The two stub-voice tiles ride loadStubMode (MIX road) to set layout mode, and
// the LIVING REEF look showcases the DLA organism. No engine changes here:
// the sampler, hooks, and mode-gated sliders all ship in #833.
import assert from 'node:assert';
import { STUB_VOICES } from './voices.js';
import { getPreset, COMPOSITION_PRESETS } from './presets.js';
import { validateLayoutParams } from './layout-modes.js';

// ── the two tiles exist, with the coral/bloom glyphs from layout-modes.js ──
const dla = STUB_VOICES.find((v) => v.id === 'dla');
const eden = STUB_VOICES.find((v) => v.id === 'eden');
assert.ok(dla, 'DLA growth tile is registered');
assert.ok(eden, 'Eden growth tile is registered');
assert.strictEqual(dla.glyph, 'coral', 'DLA tile uses the coral glyph');
assert.strictEqual(eden.glyph, 'bloom', 'Eden tile uses the bloom glyph');
assert.strictEqual(dla.name, 'DLA growth');
assert.strictEqual(eden.name, 'Eden growth');

// ── tiles are layout-axis only: no motion block, like every other stub ─────
for (const t of [dla, eden]) {
  assert.ok(!('motion' in t), `${t.id} tile carries no motion block`);
  assert.ok(Array.isArray(t.assets) && t.assets.length === 4, `${t.id} tile has a 4-asset pool`);
}

// ── clicking a tile sets layout mode to dla/eden (what loadStubMode does) ───
for (const id of ['dla', 'eden']) {
  const { params, rejected } = validateLayoutParams({ mode: id });
  assert.deepStrictEqual(rejected, [], `${id} mode validates clean`);
  assert.strictEqual(params.mode, id, `${id} survives param validation`);
}

// ── LIVING REEF look: bio-group showcase for the DLA organism ───────────────
const reef = getPreset('bio-reef');
assert.strictEqual(reef.id, 'bio-reef', 'LIVING REEF look resolves');
assert.strictEqual(reef.group, 'bio', 'LIVING REEF lives in the Bio-Drives group');
assert.strictEqual(reef.params.mode, 'dla', 'LIVING REEF lands on DLA growth');
const pv = validateLayoutParams(reef.params);
assert.deepStrictEqual(pv.rejected, [], 'LIVING REEF params validate clean');
assert.ok(pv.params.growthRate > 0, 'LIVING REEF carries a growthRate (sliders wake up)');
const ids = COMPOSITION_PRESETS.map((p) => p.id);
assert.strictEqual(new Set(ids).size, ids.length, 'look ids stay unique');

console.log('growthTiles.selfcheck: 2 tiles + LIVING REEF look OK');
