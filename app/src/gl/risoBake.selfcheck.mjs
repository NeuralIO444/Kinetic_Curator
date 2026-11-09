// risoBake.selfcheck.mjs — RISO stamp-bake integration (#2008).
// Composed icons instance IDENTICALLY to deck stamps: they bake through the
// same offline atlas path (gl/atlas.mjs bakeAtlas — resvg, the pinned font,
// the same cell geometry) as any catalogue asset, produce real ink inside the
// cell, and rebake byte-identically (the recompute discipline at the raster).
import assert from 'node:assert/strict';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const { bakeAtlas, CELL_PX, CELL_UNITS, comboKey } = await import('./atlas.mjs');
const { ASSETS_RISO } = await import('../data/assets/assets-riso.js');

const INK = '#20242c';
const ACC = '#d43d6f';
const DECK_STAMP = 'mrk_ring_01'; // an authored Marks stamp — the deck comparison

function bakeOne(id) {
  const atlas = bakeAtlas([{ asset: id, ink: INK, accent: ACC }]);
  const cell = atlas.cells.get(comboKey(id, INK, ACC));
  assert.ok(cell, `${id} produced a cell`);
  return { atlas, cell };
}

function cellBytes(atlas, cell) {
  // Slice the cell's texels out of the atlas raster (row-major, gutter layout
  // is the baker's; read back through the cell's own UV rect).
  const x0 = Math.round(cell.u0 * atlas.width);
  const y0 = Math.round((1 - cell.v1) * atlas.height);
  const w = Math.round((cell.u1 - cell.u0) * atlas.width);
  const h = Math.round((cell.v1 - cell.v0) * atlas.height);
  const out = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = ((y0 + y) * atlas.width + (x0 + x)) * 4;
      out.push(atlas.pixels[o], atlas.pixels[o + 1], atlas.pixels[o + 2], atlas.pixels[o + 3]);
    }
  return Buffer.from(out);
}

ok('composed icons bake through the deck path: cells, ink bboxes inside the cell units', () => {
  for (const rec of ASSETS_RISO.slice(0, 8)) {
    const { cell } = bakeOne(rec.id);
    assert.ok(cell.ink, `${rec.id} has ink`);
    const [x0, y0, x1, y1] = cell.ink;
    assert.ok(
      x0 >= CELL_UNITS.x0 && y0 >= CELL_UNITS.y0 && x1 <= CELL_UNITS.x1 && y1 <= CELL_UNITS.y1,
      `${rec.id} ink inside the cell`,
    );
    assert.ok(x1 > x0 && y1 > y0, `${rec.id} ink has extent`);
  }
});

ok('same geometry as a deck stamp: one cell, CELL_PX square, same UV discipline', () => {
  const deck = bakeOne(DECK_STAMP);
  const riso = bakeOne(ASSETS_RISO[0].id);
  for (const { atlas, cell } of [deck, riso]) {
    const cw = Math.round((cell.u1 - cell.u0) * atlas.width);
    const ch = Math.round((cell.v1 - cell.v0) * atlas.height);
    assert.ok(cw >= CELL_PX - 1 && cw <= CELL_PX, `cell is CELL_PX wide (${cw}; half-texel inset may read CELL_PX-1)`);
    assert.ok(ch >= CELL_PX - 1 && ch <= CELL_PX, `cell is CELL_PX tall (${ch})`);
  }
});

ok('rebake is byte-identical: a composed icon rasterizes the same twice (recompute, not storage)', () => {
  const id = ASSETS_RISO[3].id;
  const a = bakeOne(id);
  const b = bakeOne(id);
  assert.ok(cellBytes(a.atlas, a.cell).equals(cellBytes(b.atlas, b.cell)), `${id} rebakes identically`);
  const d = bakeOne(DECK_STAMP);
  const e = bakeOne(DECK_STAMP);
  assert.ok(cellBytes(d.atlas, d.cell).equals(cellBytes(e.atlas, e.cell)), 'deck control rebakes identically');
});

ok('a mixed bake (deck + composed) lays out every combo — the field’s atlas demand', () => {
  const combos = [
    { asset: DECK_STAMP, ink: INK, accent: ACC },
    ...ASSETS_RISO.slice(0, 6).map((r) => ({ asset: r.id, ink: INK, accent: ACC })),
  ];
  const atlas = bakeAtlas(combos);
  assert.ok(
    atlas.cells.size >= combos.length,
    'every combo gets a cell (regioned deck stamps add their region cells beside)',
  );
  for (const c of combos)
    assert.ok(atlas.cells.get(comboKey(c.asset, INK, ACC))?.ink, `${c.asset} ink in the mixed bake`);
});

console.log(`risoBake.selfcheck: ${n} checks passed`);
