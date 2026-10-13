// node src/assets/regionBake.selfcheck.mjs
// #1432 — the region mattes baked for the built-in library: fixtures, the cap, the slots, the shape, and that the
// committed data is exactly what the bake gives (bit for bit).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS, ASSETS_AUTHORED } from '../data/assets/index.js';
import { bakeAsset, bakeLibrary, capRegions, readingOrder, renderModule, REGION_CAP } from './regionBake.mjs';
import { normalizeRegions, normalizeRegionSlots, REGION_SLOTS } from './regionSlots.js';
import { BAKED_REGIONS } from '../data/assets/regions.generated.js';

const byId = (id) => ASSETS_AUTHORED.find((a) => a.id === id);

// 1. fixtures (the acceptance): a flora flower of disconnected petals and a centre; a solid line; a compound asset at the cap
{
  const flower = bakeAsset(byId('flora_flower_01').svg);
  assert.equal(flower.regions.length, 5, 'a flower: its petals and its centre are separate regions');
  const line = bakeAsset(byId('line_solid_01').svg);
  assert.equal(line.regions.length, 1, 'a solid line is one region');
  const compound = bakeAsset(byId('geo_burst_01').svg);
  assert.equal(compound.regions.length, REGION_CAP, 'a compound asset is held at the cap');
  assert.equal(REGION_CAP, 8);
}

// 2. the cap keeps the largest and folds the rest into the nearest kept region (area is conserved)
{
  const mk = (id, cx, cy, area) => ({ id, color: '000000', cx, cy, x0: cx - 0.01, y0: cy - 0.01, x1: cx + 0.01, y1: cy + 0.01, area });
  const regions = [mk('a', 0.1, 0.1, 100), mk('b', 0.9, 0.9, 90), mk('c', 0.11, 0.1, 5), mk('d', 0.5, 0.5, 80)];
  const capped = capRegions(regions, 3);
  assert.deepEqual(capped.map((r) => r.id), ['a', 'b', 'd'], 'the three largest, in the detector\'s own order');
  assert.equal(capped.reduce((s, r) => s + r.area, 0), 275, 'the folded region\'s area is not lost');
  assert.equal(capped.find((r) => r.id === 'a').area, 105, 'folded into the nearest kept region');
  assert.deepEqual(capRegions(regions, 8).map((r) => r.area), [100, 90, 5, 80], 'under the cap nothing changes');
  assert.deepEqual(capRegions(regions, 3).map((r) => r.id), capRegions(regions, 3).map((r) => r.id), 'deterministic');
}

// 3. reading order is top-left first, by line then left to right; slots A..D take the first four
{
  const mk = (id, cx, cy) => ({ id, cx, cy });
  const order = readingOrder([mk('br', 0.8, 0.8), mk('tl', 0.1, 0.1), mk('tr', 0.9, 0.12), mk('ml', 0.2, 0.5)]).map((r) => r.id);
  assert.deepEqual(order, ['tl', 'tr', 'ml', 'br']);
  const m = bakeAsset(byId('geo_burst_01').svg);
  REGION_SLOTS.forEach((s, i) => assert.equal(m.regionSlots[s], m.regions[i].id, `slot ${s} is the ${i + 1}st region in reading order`));
  assert.deepEqual(Object.keys(m.regionSlots), ['A', 'B', 'C', 'D']);
  const one = bakeAsset(byId('line_solid_01').svg);
  assert.deepEqual(one.regionSlots, { A: one.regions[0].id, B: null, C: null, D: null }, 'one region fills one slot, the others stay empty');
}

// 4. every built-in carries the exact shape overlay.js validates for user imports: nothing is dropped or invented
{
  assert.equal(ASSETS.length, ASSETS_AUTHORED.length);
  let withRegions = 0;
  for (const a of ASSETS) {
    const base = byId(a.id);
    assert.equal(a.svg, base.svg, `${a.id}: the art itself is untouched`);
    if (!a.regions) { assert.ok(!('regionSlots' in a), `${a.id}: no empty keys`); assert.equal(a, base, 'an asset with no matte is the same object'); continue; }
    withRegions++;
    assert.ok(a.regions.length >= 1 && a.regions.length <= REGION_CAP, `${a.id}: ${a.regions.length} regions`);
    assert.deepEqual(normalizeRegions(a.regions), a.regions, `${a.id}: regions survive the validator unchanged`);
    assert.deepEqual(normalizeRegionSlots(a.regionSlots), a.regionSlots, `${a.id}: slots survive the validator unchanged`);
    for (const id of Object.values(a.regionSlots).filter(Boolean)) assert.ok(a.regions.some((r) => r.id === id), `${a.id}: a slot names a real region`);
  }
  assert.ok(withRegions >= 250, `the library has mattes (${withRegions} of ${ASSETS.length})`);
  assert.equal(Object.keys(BAKED_REGIONS).length, withRegions);
  // nothing else about the records changed: same keys plus the two
  for (const a of ASSETS.slice(0, 40)) {
    const extra = Object.keys(a).filter((k) => !(k in byId(a.id)));
    assert.ok(extra.every((k) => k === 'regions' || k === 'regionSlots'), `${a.id}: only regions / regionSlots added`);
  }
}

// 5. bit for bit: the committed data module is exactly what the bake gives, and a second bake is the same bytes
{
  const text = renderModule(bakeLibrary(ASSETS_AUTHORED));
  assert.equal(readFileSync(new URL('../data/assets/regions.generated.js', import.meta.url), 'utf8'), text, 'run `npm run bake:regions`');
  assert.equal(renderModule(bakeLibrary(ASSETS_AUTHORED)), text, 'a second bake is the same bytes');
  const report = readFileSync(new URL('../../../docs/research/region-mattes-bake-report.md', import.meta.url), 'utf8');
  assert.ok(report.includes(`Assets in the library: ${ASSETS_AUTHORED.length}.`) && /Count histogram/.test(report), 'the report is committed');
}

// 6. runtime does no detection for built-ins: the catalogue is data, the bake is a build step
{
  const idx = readFileSync(new URL('../data/assets/index.js', import.meta.url), 'utf8');
  assert.ok(!/detectRegions|resvg/i.test(idx), 'the catalogue index only attaches the committed data');
}

console.log(`regionBake.selfcheck: ok (#1432, ${Object.keys(BAKED_REGIONS).length} assets, ${Object.values(BAKED_REGIONS).reduce((s, m) => s + m.regions.length, 0)} regions)`);
