// regionPlayback.selfcheck.mjs — #1433 KINEME Build R2: per-region
// playback — the cryptomatte break-apart (R1's mattes) reaches the render.
//
// Node: the tracked cap merge is the bake's merge (one implementation);
// the pixel partition tiles the mark and matches every committed record
// (zero drift on the resvg path); the region-cell geometry (centroid
// pivot, centroid-centred rect); the bake (remainder + region cells
// whose bytes sum back to the whole cell exactly; strip assets
// excluded); the assignment surface (sanitize / selection / phase);
// the contract (regionAnim rides only with assignments, region kinemes
// join the shared table after instance kinemes, placements identical,
// the governor predicates); the pack (expansion math, shed collapse
// byte-identical to the pre-R2 pack, fail-closed without cells).
// Browser (real WebGL2 through the parity driver): a flora mark's
// petals move independently on their own phases, the rest frame lands
// inside the parity bar against the shed (pre-R2) render, the shed
// render is byte-identical to the no-regionAnim render, and a forced
// low budget animates fewer petals while the mark stays complete.
import assert from 'node:assert';
import { Resvg } from '@resvg/resvg-js';
import { ASSETS, ASSETS_AUTHORED } from '../data/assets/index.js';
import { detectRegions } from '../assets/regionMattes.js';
import { capRegions, canonicalSvg, REGION_CAP } from '../assets/regionBake.mjs';
import { capRegionsTracked, buildRegionPartition, regionCellGeometry } from '../assets/regionPartition.js';
import {
  regionsForAsset, sanitizeRegionKinemes, regionAssignmentFor, selectAnimatedRegions,
  regionKinemePhase, REGION_TAG_CAP,
} from '../data/regionKinemes.js';
import { getKineme, kinemePhase } from '../data/kinemes.js';
import { bakeAtlas, CELL_PX, comboKey } from './atlas.mjs';
import { packInstanceData } from './renderer.mjs';
import {
  buildSceneContract, regionKinemesFrozen, regionCollapseShed, regionAnimBudget,
} from './sceneContract.js';

// The fixture items below carry tint #ffffff / accent #ff4444 (the
// stage-1 suite's shape); the bakes must use the same combo colours or
// the pack's cell lookup misses by design (Spine B).
const INK = '#ffffff';
const ACC = '#ff4444';
const FLORA = 'flora_flower_01';
const flora = ASSETS.find((a) => a.id === FLORA);
const PETALS = flora.regions.filter((r) => r.color === '000000').map((r) => r.id);
const CENTRE = flora.regions.find((r) => r.color === 'ff2d95').id;
assert.strictEqual(flora.regions.length, 5, 'fixture: the flower has 4 petals + a centre');
assert.strictEqual(PETALS.length, 4, 'fixture: 4 petals');

// ── the tracked cap merge IS the bake's cap merge (library-wide) ──────
{
  for (const a of ASSETS_AUTHORED) {
    const img = new Resvg(canonicalSvg(a.svg)).render();
    const { regions } = detectRegions(new Uint8Array(img.pixels), img.width, img.height);
    const tracked = capRegionsTracked(regions, REGION_CAP);
    assert.deepEqual(tracked.kept, capRegions(regions, REGION_CAP), `${a.id}: tracked cap == bake cap`);
    tracked.kept.forEach((k, pos) => {
      const di = regions.findIndex((r) => r.id === k.id);
      assert.strictEqual(tracked.assign[di], pos, `${a.id}: a kept region assigns to itself`);
    });
    for (let i = 0; i < regions.length; i++) {
      assert.ok(tracked.assign[i] >= 0 && tracked.assign[i] < tracked.kept.length, `${a.id}: every region assigns`);
    }
    assert.ok(tracked.kept.length <= REGION_TAG_CAP, `${a.id}: kept within the tag cap`);
  }
}
console.log('regionPlayback node (cap merge): OK');

// ── the partition: every record matched, pixels tile, no drift ────────
for (const id of [FLORA, 'dot_field_01', 'geo_burst_01']) {
  const asset = ASSETS.find((a) => a.id === id);
  const img = new Resvg(canonicalSvg(asset.svg)).render();
  const px = new Uint8Array(img.pixels);
  const part = buildRegionPartition(px, img.width, img.height, asset.regions);
  assert.strictEqual(part.matched, asset.regions.length, `${id}: every record matched by id`);
  assert.strictEqual(part.drifted, 0, `${id}: zero drifted pixels on the resvg path`);
  const { idMap } = detectRegions(px, img.width, img.height, { wantMap: true });
  const owned = new Array(asset.regions.length).fill(0);
  for (let p = 0; p < 200 * 200; p++) {
    if (idMap[p] === -1) assert.strictEqual(part.owner[p], -1, `${id}: unclaimed pixel is remainder`);
    else {
      assert.ok(part.owner[p] >= 0 && part.owner[p] < asset.regions.length, `${id}: claimed pixel has an owner`);
      owned[part.owner[p]]++;
    }
  }
  owned.forEach((n, i) => assert.ok(n > 0, `${id}: region ${asset.regions[i].id} owns pixels`));
}
console.log('regionPlayback node (partition): OK');

// ── region cell geometry: centroid pivot, bbox contained, in-cell ─────
for (const r of flora.regions) {
  const g = regionCellGeometry(r);
  const pxOf = (v) => 100 + v * 200;
  assert.ok(g.x0 <= pxOf(r.x0) && g.x0 + g.w >= pxOf(r.x1), `${r.id}: rect contains the bbox (x)`);
  assert.ok(g.y0 <= pxOf(r.y0) && g.y0 + g.h >= pxOf(r.y1), `${r.id}: rect contains the bbox (y)`);
  assert.ok(g.x0 >= 0 && g.y0 >= 0 && g.x0 + g.w <= CELL_PX && g.y0 + g.h <= CELL_PX, `${r.id}: rect inside the cell`);
  assert.strictEqual(g.pivotX, (Math.round(pxOf(r.cx)) - 100) / 2, `${r.id}: pivot is the rounded centroid (x)`);
  assert.strictEqual(g.pivotY, (Math.round(pxOf(r.cy)) - 100) / 2, `${r.id}: pivot is the rounded centroid (y)`);
  assert.strictEqual(g.scaleX, g.w / 2 / 199.5, `${r.id}: scale vs the quad span (x)`);
  assert.strictEqual(g.x0 + g.w / 2, Math.round(pxOf(r.cx)), `${r.id}: rect is centred on the centroid`);
}
console.log('regionPlayback node (geometry): OK');

// ── the assignment surface: sanitize, selection, phase ────────────────
{
  const records = flora.regions;
  assert.deepEqual(sanitizeRegionKinemes({ [PETALS[0]]: 'rock', nope: 'rock', [PETALS[1]]: 'nope' }, records),
    { [PETALS[0]]: 'rock' }, 'unknown regions and kinemes are dropped');
  assert.strictEqual(sanitizeRegionKinemes({}, records), null, 'empty assignment is null');
  assert.strictEqual(sanitizeRegionKinemes({ [PETALS[0]]: 'rock' }, null), null, 'no records, no assignment');
  // Selection: largest first (areas: west petal 2581, the other petals
  // 2580 in record order, centre 1294), record order breaks ties.
  const all = Object.fromEntries(records.map((r) => [r.id, 'rock']));
  const byAreaDesc = [...records].sort((a, b) => b.area - a.area).map((r) => r.id);
  assert.deepEqual([...selectAnimatedRegions(records, all, 2)], byAreaDesc.slice(0, 2), 'budget 2 picks the two largest');
  assert.strictEqual(selectAnimatedRegions(records, all, 0).size, 0, 'budget 0 animates nothing');
  assert.strictEqual(selectAnimatedRegions(records, all, 12).size, 5, 'full budget animates every assigned region');
  assert.strictEqual(selectAnimatedRegions(records, { [CENTRE]: 'pulse' }, 12).size, 1, 'only assigned regions can be selected');
  // Phase: the house hash of (asset id, region id); distinct per region.
  const phases = records.map((r) => regionKinemePhase(FLORA, r.id));
  for (const [i, r] of records.entries()) {
    assert.strictEqual(phases[i], kinemePhase(FLORA, r.id), `${r.id}: phase is kinemePhase(asset, region)`);
    assert.ok(phases[i] >= 0 && phases[i] < 1, `${r.id}: phase in [0, 1)`);
  }
  assert.strictEqual(new Set(phases).size, records.length, 'regions never share a phase (no lockstep)');
  // regionAssignmentFor: doc wins per region; nothing assigned -> null.
  // R3 (#1434) — flora now carries BAKED family defaults (petals sway,
  // centre pulses), so no doc at all resolves to the defaults; a doc
  // entry wins per region over the default it names.
  const DEFAULTS = { ...Object.fromEntries(PETALS.map((p) => [p, 'rock'])), [CENTRE]: 'pulse' };
  assert.deepEqual(regionAssignmentFor(FLORA, null), DEFAULTS, 'R3: baked family defaults resolve with no doc');
  assert.deepEqual(regionAssignmentFor(FLORA, { [FLORA]: { [PETALS[0]]: 'bob' } }),
    { ...DEFAULTS, [PETALS[0]]: 'bob' }, 'doc wins per region over the default');
  assert.strictEqual(regionAssignmentFor('geo_tri_01', { geo_tri_01: { 'rm-xxxxxx-0-0': 'rock' } }), null, 'invalid entries sanitize away');
  assert.deepEqual(regionsForAsset(FLORA), flora.regions, 'records come from the catalogue');
}
console.log('regionPlayback node (assignment surface): OK');

// ── the bake: region cells tile back to the whole cell, byte for byte ─
{
  const atlas = bakeAtlas([{ asset: FLORA, ink: INK, accent: ACC }]);
  const base = comboKey(FLORA, INK, ACC);
  const whole = atlas.cells.get(base);
  const rem = atlas.cells.get(`${base}#rem`);
  assert.ok(whole && rem, 'whole + remainder cells baked');
  const origin = (cell) => [Math.round(cell.u0 * atlas.width - 0.5), Math.round(cell.v0 * atlas.height - 0.5)];
  const [wx, wy] = origin(whole);
  const sum = Buffer.alloc(CELL_PX * CELL_PX * 4);
  const addCell = (cell, sx0, sy0) => {
    const [cx, cy] = origin(cell);
    const w = Math.round((cell.u1 - cell.u0) * atlas.width) + 1;
    const h = Math.round((cell.v1 - cell.v0) * atlas.height) + 1;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const s = ((cy + j) * atlas.width + (cx + i)) * 4;
        const d = ((sy0 + j) * CELL_PX + (sx0 + i)) * 4;
        for (let ch = 0; ch < 4; ch++) sum[d + ch] += atlas.pixels[s + ch];
      }
    }
  };
  addCell(rem, 0, 0); // the remainder's frame IS the whole cell's frame
  for (const r of flora.regions) {
    const cell = atlas.cells.get(`${base}#r:${r.id}`);
    assert.ok(cell && cell.geo, `${r.id}: region cell with geometry`);
    const g = regionCellGeometry(r);
    assert.strictEqual(cell.geo.px, g.pivotX, `${r.id}: geo pivot matches the geometry module`);
    assert.strictEqual(cell.geo.sx, g.scaleX, `${r.id}: geo scale matches the geometry module`);
    addCell(cell, g.x0, g.y0);
  }
  let wholeSum = 0;
  for (let p = 0; p < CELL_PX * CELL_PX; p++) {
    const o = ((wy + (p / CELL_PX | 0)) * atlas.width + (wx + (p % CELL_PX))) * 4;
    for (let ch = 0; ch < 4; ch++) {
      assert.strictEqual(sum[p * 4 + ch], atlas.pixels[o + ch], `tiled bytes == whole-cell bytes (px ${p} ch ${ch})`);
      wholeSum += atlas.pixels[o + ch];
    }
  }
  assert.ok(wholeSum > 0, 'the whole cell has ink');
  // Strip assets never gain region cells (cell kinemes own them).
  const stripAtlas = bakeAtlas([{ asset: 'mic_dial', ink: INK, accent: ACC }]);
  assert.ok(![...stripAtlas.cells.keys()].some((k) => k.includes('#r:') || k.endsWith('#rem')), 'strip asset: no region cells');
  // Region cells are baked on demand: an empty demand set is the
  // pre-R2 atlas (one cell, one slot); naming the asset bakes them.
  const noDemand = bakeAtlas([{ asset: FLORA, ink: INK, accent: ACC }], { regionAssets: new Set() });
  assert.strictEqual(noDemand.cells.size, 1, 'no demand -> no region cells');
  assert.strictEqual(noDemand.width, 432, 'no demand -> the pre-R2 atlas width');
  assert.strictEqual(noDemand.height, 432, 'no demand -> the pre-R2 atlas height');
  const demanded = bakeAtlas([{ asset: FLORA, ink: INK, accent: ACC }], { regionAssets: new Set([FLORA]) });
  assert.strictEqual(demanded.cells.size, flora.regions.length + 2, 'demand -> whole + remainder + region cells');
  // Mains keep their pre-R2 layout: a single combo's whole cell starts the atlas.
  assert.strictEqual(wx, 0, 'whole cell at the atlas origin (mains zone first)');
}
console.log('regionPlayback node (bake): OK');

// ── the contract ──────────────────────────────────────────────────────
const item = (assetId, key) => ({ assetId, x: 500, y: 350, scale: 2.5, rotation: 0, color: '#ffffff', accent: '#ff4444', alpha: 100, key, seedOffset: 0 });
const layer = (items) => [{ id: 'L', isFx: false, items }];
const contract = (doc, items) => buildSceneContract({ doc: { seed: 1, ...doc }, resolvedLayers: layer(items) });
const ASSIGN = { [FLORA]: { ...Object.fromEntries(PETALS.map((p) => [p, 'rock'])), [CENTRE]: 'pulse' } };
// #1434 — flora's baked defaults ARE the ASSIGN map, so the pre-R3
// no-regionAnim state is now the artist's deliberate still: every region
// tombstoned in the doc. The pins below use it wherever R2 said "bare".
const STILL = { regionKinemes: { [FLORA]: Object.fromEntries(flora.regions.map((r) => [r.id, null])) } };
{
  const bare = contract(STILL, [item(FLORA, 'a')]);
  assert.ok(!('regionAnim' in bare), 'all regions cleared -> no regionAnim key (hashes unchanged)');
  const defaulted = contract({}, [item(FLORA, 'a')]);
  assert.ok(defaulted.regionAnim, 'R3: the baked family defaults alone raise regionAnim');
  assert.deepEqual(defaulted.instances, bare.instances, 'defaults never move placements');
  const c = contract({ regionKinemes: ASSIGN }, [item(FLORA, 'a')]);
  assert.deepEqual(c.instances, bare.instances, 'placements byte-identical to the single-quad run');
  assert.strictEqual(c.regionAnim.budget, 12, 'no caller budget -> the tag cap');
  const slotOf = (kind, period, amp) => c.kinemes.findIndex((k) => k.kind === kind && k.period === period && k.amp === amp) + 1;
  const rockSlot = slotOf(2, 2.4, 18);
  const pulseSlot = slotOf(3, 1.6, 0.12);
  assert.ok(rockSlot > 0 && pulseSlot > 0 && rockSlot !== pulseSlot, 'region kinemes joined the shared table');
  for (const p of PETALS) assert.strictEqual(c.regionAnim.assets[FLORA][p], rockSlot, `${p}: petal rides the rock slot`);
  assert.strictEqual(c.regionAnim.assets[FLORA][CENTRE], pulseSlot, 'centre rides the pulse slot');
  assert.ok(!('shed' in c.regionAnim), 'healthy governor -> no shed flag');
  // Instance kinemes keep the first slots; region slots append after.
  const both = contract({ assetKineme: { [FLORA]: 'bob' }, regionKinemes: ASSIGN }, [item(FLORA, 'a')]);
  assert.strictEqual(both.instances[0].kineme, 1, 'the mark kineme takes slot 1, as before R2');
  assert.ok(both.regionAnim.assets[FLORA][PETALS[0]] > 1, 'region slots append after instance slots');
  // The governor predicates + the budget they produce.
  assert.strictEqual(regionKinemesFrozen({ perfTier1: true, quality: 'performance' }), true);
  assert.strictEqual(regionKinemesFrozen({ perfTier1: true, quality: 'balanced' }), false, 'tier-2 rung needs PERF too');
  assert.strictEqual(regionKinemesFrozen({ quality: 'performance' }), false, 'tier-2 rung needs perfTier1');
  assert.strictEqual(regionCollapseShed({ perfTier1: true, quality: 'performance' }), false, 'freeze alone does not collapse');
  assert.strictEqual(regionCollapseShed({ perfTier1: true, quality: 'performance', assetThin: true }), true, 'a deeper cut collapses');
  assert.strictEqual(regionCollapseShed({ perfTier1: true, quality: 'performance', slowRender: true }), true);
  assert.strictEqual(regionAnimBudget({}), 12);
  assert.strictEqual(regionAnimBudget({ regionBudget: 8 }), 8, 'the iPad-class ceiling');
  assert.strictEqual(regionAnimBudget({ regionBudget: 99 }), 12, 'clamped to the tag cap');
  assert.strictEqual(regionAnimBudget({ reducedMotion: true }), 0, 'reduced motion: regions hold rest');
  assert.strictEqual(regionAnimBudget({ perfTier1: true, quality: 'performance', regionBudget: 8 }), 0, 'the freeze tightens to 0');
  // Budget through the contract: 1 -> only the largest petal is slotted.
  const low = contract({ regionKinemes: ASSIGN, regionBudget: 1 }, [item(FLORA, 'a')]);
  const entries = Object.entries(low.regionAnim.assets[FLORA]);
  assert.strictEqual(entries.filter(([, s]) => s > 0).length, 1, 'budget 1: one region animates');
  const largest = [...flora.regions].sort((a, b) => b.area - a.area)[0].id;
  assert.ok(low.regionAnim.assets[FLORA][largest] > 0, 'the largest region wins the budget');
  assert.strictEqual(low.regionAnim.assets[FLORA][CENTRE], 0, 'unselected regions carry slot 0 (merged at rest)');
  // Freeze + collapse ride the contract.
  const frozen = contract({ regionKinemes: ASSIGN, perfTier1: true, quality: 'performance' }, [item(FLORA, 'a')]);
  assert.strictEqual(frozen.regionAnim.budget, 0, 'frozen: budget 0');
  assert.ok(Object.values(frozen.regionAnim.assets[FLORA]).every((s) => s === 0), 'frozen: every region at rest');
  const collapsed = contract({ regionKinemes: ASSIGN, perfTier1: true, quality: 'performance', assetThin: true }, [item(FLORA, 'a')]);
  assert.strictEqual(collapsed.regionAnim.shed, true, 'collapsed: shed flag set');
}
console.log('regionPlayback node (contract): OK');

// ── atlas demand: the parity driver bakes region cells only for the
// assets the contract expands (none without region state, none under
// the collapse shed) ──────────────────────────────────────────────────
{
  const { buildRenderPayload } = await import('./parity/glDriver.mjs');
  const hasRegionCells = (payload) => Object.keys(payload.cells).some((k) => k.includes('#r:') || k.endsWith('#rem'));
  const barePayload = buildRenderPayload(contract(STILL, [item(FLORA, 'a')]), { width: 400, height: 280 });
  assert.ok(!hasRegionCells(barePayload), 'no region state -> the payload atlas has no region cells');
  assert.strictEqual(barePayload.atlasW, 432, 'no region state -> the pre-R2 atlas size');
  const assignedPayload = buildRenderPayload(contract({ regionKinemes: ASSIGN }, [item(FLORA, 'a')]), { width: 400, height: 280 });
  assert.ok(hasRegionCells(assignedPayload), 'assignments -> the payload atlas carries region cells');
  const shedContract = contract({ regionKinemes: ASSIGN }, [item(FLORA, 'a')]);
  shedContract.regionAnim = { ...shedContract.regionAnim, shed: true };
  const shedPayload = buildRenderPayload(shedContract, { width: 400, height: 280 });
  assert.ok(!hasRegionCells(shedPayload), 'collapse shed -> no region cells (the pack reads none)');
}
console.log('regionPlayback node (atlas demand): OK');

// ── the pack ──────────────────────────────────────────────────────────
{
  const atlas = bakeAtlas([{ asset: FLORA, ink: INK, accent: ACC }]);
  const cellsObj = Object.fromEntries(atlas.cells);
  const c = contract({ regionKinemes: ASSIGN, kinemeTime: 0 }, [item(FLORA, 'a')]);
  const inst = { ...c.instances[0], rotation: 30 }; // rotated, to prove the parenting math
  const frame = { motionTime: 0, shed: false, regions: c.regionAnim };
  const packed = packInstanceData([inst], cellsObj, 1, frame);
  assert.strictEqual(packed.length, (flora.regions.length + 1) * 29, 'one mark expands to remainder + R region instances');
  // Remainder first: the mark's own transform and kineme, the remainder cell.
  const base = comboKey(FLORA, inst.tint, inst.accent);
  const remCell = atlas.cells.get(`${base}#rem`);
  assert.strictEqual(packed[0], inst.x, 'remainder at the mark x');
  assert.strictEqual(packed[1], inst.y, 'remainder at the mark y');
  assert.ok(Math.abs(packed[6] - remCell.u0) < 2e-7 && Math.abs(packed[8] - remCell.u1) < 2e-7, 'remainder packs the remainder cell');
  // Each region: pivot = the mark affine applied to the centroid,
  // scale = mark scale x geometry, kineme slot + hash phase.
  const th = (inst.rotation * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th);
  flora.regions.forEach((r, i) => {
    const o = (i + 1) * 29;
    const cell = atlas.cells.get(`${base}#r:${r.id}`);
    const g = cell.geo;
    const lx = (g.px - 50) * inst.scaleX, ly = (g.py - 50) * inst.scaleY;
    assert.ok(Math.abs(packed[o] - (inst.x + lx * co - ly * si)) < 1e-3, `${r.id}: pivot x = mark affine(centroid)`);
    assert.ok(Math.abs(packed[o + 1] - (inst.y + lx * si + ly * co)) < 1e-3, `${r.id}: pivot y = mark affine(centroid)`);
    assert.ok(Math.abs(packed[o + 2] - inst.scaleX * g.sx) < 1e-6, `${r.id}: scale x = mark x geometry`);
    assert.ok(Math.abs(packed[o + 4] - inst.rotation) < 1e-6, `${r.id}: rotation is the mark's`);
    assert.strictEqual(packed[o + 18], c.regionAnim.assets[FLORA][r.id], `${r.id}: kineme slot from the contract`);
    assert.ok(Math.abs(packed[o + 19] - kinemePhase(FLORA, r.id)) < 2e-3, `${r.id}: phase = seed hash (asset, region)`);
    assert.ok(Math.abs(packed[o + 6] - cell.u0) < 2e-7, `${r.id}: packs its own cell`);
  });
  // The collapse shed and the no-state path are the pre-R2 pack, byte for byte.
  const bare = packInstanceData([inst], cellsObj);
  assert.deepStrictEqual(packInstanceData([inst], cellsObj, 1, { motionTime: 0, shed: false, regions: { ...c.regionAnim, shed: true } }), bare,
    'shed collapse packs exactly the single quad');
  assert.deepStrictEqual(packInstanceData([inst], cellsObj, 1, { motionTime: 0, shed: false, regions: null }), bare,
    'no region state packs exactly the single quad');
  assert.strictEqual(bare.length, 29, 'the single quad is one instance');
  // Fail-closed: region state but no region cells -> the single quad.
  const wholeOnly = { [base]: atlas.cells.get(base) };
  assert.deepStrictEqual(packInstanceData([inst], wholeOnly, 1, frame), packInstanceData([inst], wholeOnly),
    'missing region cells: the mark still draws, as one quad');
  // An unselected region (slot 0) inherits the mark's kineme, not silence.
  const low = contract({ regionKinemes: ASSIGN, regionBudget: 1, assetKineme: { [FLORA]: 'bob' }, kinemeTime: 0 }, [item(FLORA, 'a')]);
  const lowInst = low.instances[0];
  const lowPacked = packInstanceData([lowInst], cellsObj, 1, { motionTime: 0, shed: false, regions: low.regionAnim });
  const centreIdx = flora.regions.findIndex((r) => r.id === CENTRE);
  assert.strictEqual(lowPacked[(centreIdx + 1) * 29 + 18], lowInst.kineme, 'unselected region inherits the mark kineme');
  assert.ok(Math.abs(lowPacked[(centreIdx + 1) * 29 + 19] - lowInst.kinemePhase) < 2e-3, 'unselected region inherits the mark phase');
  // Two marks expand independently.
  const two = packInstanceData([inst, { ...inst, x: 100, y: 100 }], cellsObj, 1, frame);
  assert.strictEqual(two.length, 2 * (flora.regions.length + 1) * 29, 'two marks -> two expansions');
}
console.log('regionPlayback node (pack): OK');

// ── GPU: real WebGL2 through the parity driver ────────────────────────
async function runBrowserTests() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const shot = async (doc, extra) => {
    const c = contract({ kinemeTime: 0, ...doc }, [item(FLORA, 'solo')]);
    if (extra) extra(c);
    return (await renderViaGL(c, { width: 400, height: 280, bg: '#000000' })).pixels;
  };
  const same = (a, b) => Buffer.compare(a, b) === 0;
  const diffPx = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
    }
    return n;
  };
  const alphaSum = (a) => { let s = 0; for (let i = 3; i < a.length; i += 4) s += a[i]; return s; };
  // Screen rect (400x280 render of the 1000x700 contract) of an asset-space rect, shrunk 2px off the edges.
  const rectOf = (r) => {
    const X = (u) => (500 + (u * 100 - 50) * 2.5) * 0.4;
    const Y = (v) => (350 + (v * 100 - 50) * 2.5) * 0.4;
    return [Math.ceil(X(r.x0)) + 2, Math.ceil(Y(r.y0)) + 2, Math.floor(X(r.x1)) - 2, Math.floor(Y(r.y1)) - 2];
  };
  const diffIn = (a, b, [x0, y0, x1, y1]) => {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * 400 + x) * 4;
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
    }
    return n;
  };
  try {
    // Rest parity, measured the honest way: with the budget tightened
    // to 0 every region slot is 0, so the expansion draws the mark
    // tiled (remainder + region cells) with every kineme at rest. That
    // frame must match the single-quad (pre-R2) render inside the bar.
    const restTiled = await shot({ regionKinemes: ASSIGN, regionBudget: 0, kinemeTime: 0.6 });
    const plainShot = await shot({ ...STILL, kinemeTime: 0 });
    const parity = diffPx(restTiled, plainShot) / (400 * 280);
    assert.ok(parity < 0.10, `rest parity inside the WebGL bar: ${(parity * 100).toFixed(3)}% of pixels differ`);
    // The shed render IS the pre-R2 render: byte-identical to no regionAnim at all.
    const shedShot = await shot({ regionKinemes: ASSIGN, kinemeTime: 0.6 }, (c) => { c.regionAnim = { ...c.regionAnim, shed: true }; });
    assert.ok(same(shedShot, plainShot), 'shed collapse renders byte-identically to the pre-R2 path');
    assert.ok(same(restTiled, await shot({ regionKinemes: ASSIGN, regionBudget: 0, kinemeTime: 0.6 })), 'same state -> same frame (deterministic)');
    // Petals move independently: at t=0.6 the rock (period 2.4) has
    // swung each petal by its own hash phase; the centre's pulse is
    // its own motion, on its own region.
    const moved = await shot({ regionKinemes: ASSIGN, kinemeTime: 0.6 });
    const petalDiffs = PETALS.map((id) => diffIn(restTiled, moved, rectOf(flora.regions.find((r) => r.id === id))));
    petalDiffs.forEach((d, i) => assert.ok(d > 20, `petal ${PETALS[i]} moves (${d}px)`));
    assert.ok(new Set(petalDiffs).size > 1, `petals move independently (diffs ${petalDiffs.join('/')})`);
    const centreDiff = diffIn(restTiled, moved, rectOf(flora.regions.find((r) => r.id === CENTRE)));
    assert.ok(centreDiff > 0, `the centre pulses on its own region (${centreDiff}px)`);
    // One full period wraps to the identical frame (petals-only scene:
    // every animated region rides the rock, period 2.4 — the mixed
    // fixture's centre pulse, period 1.6, does not wrap at 2.4).
    // #1434: petals-only now needs the centre TOMBSTONED — left alone it
    // would keep its baked pulse default.
    const PETALS_ONLY = { [FLORA]: { ...Object.fromEntries(PETALS.map((p) => [p, 'rock'])), [CENTRE]: null } };
    const restPetals = await shot({ regionKinemes: PETALS_ONLY, kinemeTime: 0 });
    assert.ok(same(restPetals, await shot({ regionKinemes: PETALS_ONLY, kinemeTime: 2.4 })), 'one full period wraps exactly');
    // Governor selection: budget 1 animates only the largest petal —
    // motion is present but smaller, confined to that petal, and the
    // mark stays complete.
    const lowMoved = await shot({ regionKinemes: ASSIGN, regionBudget: 1, kinemeTime: 0.6 });
    const lowDiff = diffPx(restTiled, lowMoved);
    const fullDiff = diffPx(restTiled, moved);
    assert.ok(lowDiff > 20 && lowDiff < fullDiff, `budget 1 moves less than budget 12 (${lowDiff}px vs ${fullDiff}px)`);
    const largest = [...flora.regions].sort((a, b) => b.area - a.area)[0].id;
    assert.ok(diffIn(restTiled, lowMoved, rectOf(flora.regions.find((r) => r.id === largest))) > 20, 'budget 1: the largest petal moves');
    for (const id of PETALS.filter((p) => p !== largest)) {
      assert.strictEqual(diffIn(restTiled, lowMoved, rectOf(flora.regions.find((r) => r.id === id))), 0, `budget 1: petal ${id} is byte-still`);
    }
    assert.ok(Math.abs(alphaSum(lowMoved) - alphaSum(restTiled)) / alphaSum(restTiled) < 0.02, 'budget 1: the mark still draws complete (alpha within 2%)');
    console.log(`regionPlayback GPU: OK — rest parity ${(parity * 100).toFixed(3)}% of pixels; petal diffs ${petalDiffs.join('/')}; centre ${centreDiff}; budget1 ${lowDiff}px vs full ${fullDiff}px`);
  } finally {
    await closeGlDriver();
  }
}
try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser region tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}
console.log('regionPlayback.selfcheck: OK');
