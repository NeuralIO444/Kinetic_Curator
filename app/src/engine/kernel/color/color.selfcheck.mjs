// node src/engine/kernel/color/color.selfcheck.mjs
// K5 (#64) AC1: colour is a channel. Changing strategy or palette must
// repaint the composition without moving a single coordinate.
import assert from 'node:assert';
import { assignColor, resolveStrategy } from './index.js';
import { buildPlacements } from '../../buildPlacements.js';
import { DEFAULT_LAYOUT_PARAMS } from '../../../data/layout-modes.js';

const PAL_A = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'] };
const PAL_B = { swatches: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'] };

// --- strategy resolution ----------------------------------------------------
assert.strictEqual(resolveStrategy({ paletteShift: 'zone' }, { paletteShift: 'band' }), 'zone',
  'explicit operator choice wins');
assert.strictEqual(resolveStrategy({ paletteShift: 'auto' }, { paletteShift: 'split' }), 'split',
  'auto defers to the preset');
assert.strictEqual(resolveStrategy({}, {}), 'band', 'falls back to band');

// --- determinism ------------------------------------------------------------
const ctx = { seed: 1234, index: 7, t: 0.4 };
assert.deepStrictEqual(assignColor(ctx, PAL_A, 'band'), assignColor(ctx, PAL_A, 'band'),
  'same input must give the same colour');
assert.notStrictEqual(
  assignColor({ ...ctx, index: 8 }, PAL_A, 'split').color,
  assignColor({ ...ctx, index: 400 }, PAL_A, 'split').color,
  'different placements should not all be one colour',
);

// --- empty palette is handled, not thrown on --------------------------------
const empty = assignColor(ctx, { swatches: [] }, 'band');
assert.strictEqual(empty.slot, -1);
assert.ok(empty.color && empty.accent, 'must still return usable colours');
assert.ok(assignColor(ctx, null, 'band').color, 'null palette must not throw');

// --- accent comes from the SLOT, not indexOf --------------------------------
// A palette with a repeated hex: indexOf would give both duplicates the same
// accent. Slot arithmetic gives each its own.
const DUP = { swatches: ['#aaaaaa', '#bbbbbb', '#aaaaaa', '#dddddd', '#eeeeee', '#ffffff'] };
for (let i = 0; i < 50; i++) {
  const r = assignColor({ seed: 9, index: i, t: i / 50 }, DUP, 'band');
  if (r.slot >= 0) {
    assert.strictEqual(
      r.accent, DUP.swatches[(r.slot + 3) % DUP.swatches.length],
      'accent must be the slot+3 swatch',
    );
  }
}

// --- AC1: GEOMETRY IS UNTOUCHED BY COLOUR -----------------------------------
const base = {
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, count: 60, mode: 'fibonacci' },
  seed: 0xbeef,
  activeAssets: [{ id: 'a', weight: 'medium' }, { id: 'b', weight: 'light' }],
  caGrid: null,
  caps: { maxCount: 800, maxCountMirrored: 650, maxParticles: 350, allowMirror: true },
  canvasW: 1000,
  canvasH: 700,
};
const geom = (items) => items.map((i) => [i.x, i.y, i.rotation, i.scale, i.alpha, i.assetId]);

const bandA = buildPlacements({ ...base, palette: PAL_A });
const zoneA = buildPlacements({
  ...base,
  layoutParams: { ...base.layoutParams, paletteShift: 'zone' },
  palette: PAL_A,
});
const bandB = buildPlacements({ ...base, palette: PAL_B });

assert.deepStrictEqual(geom(zoneA.items), geom(bandA.items),
  'AC1: changing colour STRATEGY must not move geometry');
assert.deepStrictEqual(geom(bandB.items), geom(bandA.items),
  'AC1: changing PALETTE must not move geometry');

// ...and colour genuinely did change, so the test above isn't vacuous
const colours = (items) => items.map((i) => i.color).join(',');
assert.notStrictEqual(colours(zoneA.items), colours(bandA.items),
  'strategy change must actually repaint');
assert.notStrictEqual(colours(bandB.items), colours(bandA.items),
  'palette change must actually repaint');

console.log('kernel/color.selfcheck: OK (K5)', { placements: bandA.items.length });
