// #702 pixel glyph pack — lattice, mass, speck, and sibling contract.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASSETS_PIXEL } from './assets-pixel-glyphs.js';

const PAIRS = [
  ['pxg_cross', 'pxg_cross_b'],
  ['pxg_plus', 'pxg_plus_b'],
  ['pxg_diamond', 'pxg_diamond_b'],
  ['pxg_frame', 'pxg_frame_b'],
  ['pxg_window', 'pxg_window_b'],
  ['pxg_totem', 'pxg_totem_b'],
  ['pxg_orbit', 'pxg_orbit_b'],
  ['pxg_nest', 'pxg_nest_b'],
];
const SPECKS = new Set(['pxg_speck', 'pxg_speck_ne', 'pxg_spark', 'pxg_dust']);
const LETTERS = new Set(['pxg_stem', 'pxg_bowl', 'pxg_arch', 'pxg_fork', 'pxg_serif', 'pxg_counter', 'pxg_ligature', 'pxg_flag']);

function rects(svg) {
  return [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="10" height="10" fill="(var\(--ink\)|var\(--accent\))"/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), fill: m[3] }));
}

test('#702 pixel glyphs: 32 unique stamps, token paint, snapped lattice', () => {
  assert.equal(ASSETS_PIXEL.length, 32);
  const ids = ASSETS_PIXEL.map((a) => a.id);
  assert.equal(new Set(ids).size, 32);
  for (const a of ASSETS_PIXEL) {
    assert.ok(a.id.startsWith('pxg_'), a.id);
    assert.ok(a.category === 'stamps' || a.category === 'dots', a.id);
    assert.deepEqual(a.scale, [0.22, 0.6]);
    assert.ok(a.tags.includes('pixel') && a.tags.includes('modular'), a.id);
    assert.equal(a.svg.includes('stroke'), false, `${a.id} is fill-only`);
    assert.equal(/#[0-9a-fA-F]{3,8}/.test(a.svg), false, `${a.id} uses tokens`);
    const rs = rects(a.svg);
    assert.equal(rs.length, (a.svg.match(/<rect /g) || []).length, `${a.id} has a non-cell rect`);
    for (const r of rs) {
      assert.ok([15, 25, 35, 45, 55, 65, 75].includes(r.x), `${a.id} x ${r.x}`);
      assert.ok([15, 25, 35, 45, 55, 65, 75].includes(r.y), `${a.id} y ${r.y}`);
    }
    const ink = rs.filter((r) => r.fill === 'var(--ink)').length;
    const acc = rs.filter((r) => r.fill === 'var(--accent)').length;
    if (SPECKS.has(a.id)) {
      assert.equal(ink, 0, a.id);
      assert.ok(acc >= 1 && acc <= 3, a.id);
      assert.equal(a.category, 'dots');
      assert.equal(a.rotate, 'free');
    } else {
      assert.ok(ink >= 8 && ink <= 22, `${a.id} ink ${ink}`);
      assert.equal(acc, 1, a.id);
      assert.equal(a.category, 'stamps');
      assert.equal(a.rotate, LETTERS.has(a.id) ? 'fixed' : 'free');
    }
  }
});

test('#702 pixel glyphs: each sibling is a real variation, not a duplicate', () => {
  const byId = Object.fromEntries(ASSETS_PIXEL.map((a) => [a.id, a]));
  for (const [a, b] of PAIRS) {
    assert.notEqual(byId[a].svg, byId[b].svg, `${a} sibling is a copy`);
    const acc = (svg) => (svg.match(/var\(--accent\)/g) || []).length;
    assert.equal(acc(byId[a].svg), 1, a);
    assert.equal(acc(byId[b].svg), 1, b);
    assert.equal(byId[a].category, byId[b].category);
  }
});
