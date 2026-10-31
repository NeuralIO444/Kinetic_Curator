// regionLines.selfcheck.mjs — #1435 KINEME Build R4: waveform lines.
//
// Two mechanisms, one family behaviour:
// (1) The authored track grows teeth: line_squiggle_01 + line_squiggle_02
//     ship as boiled strips through the C-wire (stage 1) — frame 0 is the
//     asset's own svg (its bake bit-identical to the pre-R4 bake), each
//     later frame is the same wave translated along the stroke by exactly
//     one step, and frames x step == the wavelength, so the roll wraps
//     seamlessly. Shed pins cell 0.
// (2) The procedural bend (Matt's 2026-10-15 ruling on #1435): a
//     stroke-shaped region assigned the bend kineme subdivides at pack
//     time into slices along its length — ordinary region instances over
//     sub-windows of the region's own cell, phase stepped 1/N per slice —
//     so the stroke articulates and the wave travels along it. It is
//     stroke-aware by construction: only the stroke's region subdivides;
//     a non-stroke sharing the mark renders whole and does not bend.
//     The quad-wide shader stroke-warp stays parked (no shader change).
// Node: the strip data (frame 0 verbatim, translation-exact rasters),
// the stroke geometry rule, the family-default census, the contract
// (bend map only for selected stroke regions riding bend; placements
// untouched; the validator), the pack (slice tiling, phases, pivots;
// slot-0 and shed keep the pre-R4 paths byte-identical).
// Browser (real WebGL2 through the parity driver): the squiggles roll
// (cell steps, exact wrap, shed = cell 0), the bend moves and travels on
// line_squiggle_03, rest parity inside the bar, shed collapse is the
// pre-R2 render byte for byte, and on line_target_01 the ring bends
// while the centre dot — a non-stroke in the same quad — stays
// byte-still.
import assert from 'node:assert';
import { Resvg } from '@resvg/resvg-js';
import { ASSETS, ASSETS_AUTHORED } from '../data/assets/index.js';
import { LINE_STRIPS } from '../data/assets/assets-line-strips.js';
import { ASSET_CELL_KINEME, getCellKineme, stripFramesFor } from '../data/cellKinemes.js';
import { getKineme, kinemePhase } from '../data/kinemes.js';
import { isStrokeRegion, bendSlicesFor, regionAssignmentFor } from '../data/regionKinemes.js';
import { familyDefaultRegionKinemes } from '../data/regionDefaults.js';
import { applyGradient } from '../assets/gradient.js';
import { bakeAtlas, CELL_PX, CELL_UNITS, comboKey } from './atlas.mjs';
import { packInstanceData } from './renderer.mjs';
import { buildSceneContract, assertSceneContract } from './sceneContract.js';

const INK = '#ffffff';
const ACC = '#ff4444';
const SQ1 = 'line_squiggle_01';
const SQ2 = 'line_squiggle_02';
const SQ3 = 'line_squiggle_03';
const TARGET = 'line_target_01';
const asset = (id) => ASSETS.find((a) => a.id === id);
const sq3 = asset(SQ3);
const sq3Region = sq3.regions[0];
const target = asset(TARGET);
const tRing = target.regions.find((r) => r.color === '000000' && isStrokeRegion(r) && r.x1 - r.x0 > 0.8);
const tDot = target.regions.find((r) => r.color === 'ff2d95');
const tInner = target.regions.find((r) => r !== tRing && r !== tDot);
assert.ok(sq3.regions.length === 1, 'fixture: squiggle_03 is a single-region line');
assert.ok(tRing && tDot && tInner, 'fixture: target has a stroke ring, a centre dot, an inner region');

// ── the strip data: frame 0 verbatim, frames translate exactly ──────
{
  assert.deepEqual(Object.keys(LINE_STRIPS).sort(), [SQ1, SQ2], 'the line strips are the two squiggles');
  for (const id of [SQ1, SQ2]) {
    const frames = LINE_STRIPS[id];
    const k = getCellKineme(ASSET_CELL_KINEME[id]);
    assert.strictEqual(frames.length, k.cells, `${id}: frame count == its kineme's cells`);
    assert.strictEqual(frames[0], asset(id).svg, `${id}: frame 0 is the asset's own svg, verbatim`);
    assert.strictEqual(stripFramesFor(id), frames, `${id}: the strip table resolves it`);
    for (let f = 1; f < frames.length; f++)
      assert.notStrictEqual(frames[f], frames[0], `${id}: frame ${f} is a new drawing`);
  }
  // The roll, proven on rasters: each frame is the previous frame's wave
  // translated by exactly the step (16px / 8px at the bake's 2px per
  // unit) — byte-identical over the band both windows cover.
  const raster = (fragment) => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="-50 -50 200 200">` +
      fragment.replace(/var\(--ink[^)]*\)/g, '#000000') +
      `</svg>`;
    const img = new Resvg(svg).render();
    return new Uint8Array(img.pixels);
  };
  for (const [id, stepPx] of [
    [SQ1, 16],
    [SQ2, 8],
  ]) {
    const frames = LINE_STRIPS[id].map(raster);
    for (let f = 1; f + 1 < frames.length; f++) {
      const a = frames[f];
      const b = frames[f + 1];
      // The band asset x in [-12, 112]: inside the covered window of both
      // frames, clear of the entry/exit humps at the window's edges.
      for (let y = 0; y < 400; y++) {
        for (let x = 76; x < 324; x++) {
          const si = (y * 400 + x + stepPx) * 4;
          const di = (y * 400 + x) * 4;
          for (let ch = 0; ch < 4; ch++) {
            assert.strictEqual(
              b[di + ch],
              a[si + ch],
              `${id}: frame ${f + 1} == frame ${f} translated by the step (px ${x},${y} ch ${ch})`,
            );
          }
        }
      }
    }
    // Every ROLLING frame's ink covers frame 0's own footprint (the
    // original spans ~109..282px here): the wave never gaps mid-roll.
    for (let f = 1; f < frames.length; f++) {
      let minX = 400,
        maxX = -1;
      const px = frames[f];
      for (let i = 3; i < px.length; i += 4) {
        if (px[i] > 4) {
          const x = ((i / 4) | 0) % 400;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
      assert.ok(
        minX <= 112 && maxX >= 280,
        `${id}: frame ${f} ink covers the canonical footprint (${minX}..${maxX}px)`,
      );
    }
  }
}
console.log('regionLines node (strip data): OK');

// ── the strip bake: frame 0 bit-identical to the pre-R4 bake ────────
for (const id of [SQ1, SQ2]) {
  const atlas = bakeAtlas([{ asset: id, ink: INK, accent: ACC }]);
  const cell = atlas.cells.get(comboKey(id, INK, ACC));
  const k = getCellKineme(ASSET_CELL_KINEME[id]);
  assert.strictEqual(
    Math.round((cell.u1 - cell.u0) * atlas.width),
    k.cells * CELL_PX - 1,
    `${id}: strip cell spans ${k.cells} frames`,
  );
  const a = asset(id);
  const sub = (svg) => svg.replace(/var\(--ink[^)]*\)/g, INK).replace(/var\(--accent[^)]*\)/g, ACC);
  const refSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_PX}" height="${CELL_PX}" ` +
    `viewBox="${CELL_UNITS.x0} ${CELL_UNITS.y0} ${CELL_UNITS.x1 - CELL_UNITS.x0} ${CELL_UNITS.y1 - CELL_UNITS.y0}">` +
    sub(applyGradient(a.svg, a.gradient, { ink: INK, accent: ACC })) +
    `</svg>`;
  const refPx = Buffer.from(new Resvg(refSvg).render().pixels);
  const cx = Math.round(cell.u0 * atlas.width - 0.5);
  const cy = Math.round(cell.v0 * atlas.height - 0.5);
  for (let y = 0; y < CELL_PX; y++) {
    const got = atlas.pixels.subarray(((cy + y) * atlas.width + cx) * 4, ((cy + y) * atlas.width + cx + CELL_PX) * 4);
    const want = refPx.subarray(y * CELL_PX * 4, (y + 1) * CELL_PX * 4);
    assert.strictEqual(Buffer.compare(got, want), 0, `${id}: frame 0 row ${y} is bit-identical to the pre-R4 bake`);
  }
  assert.ok(
    ![...atlas.cells.keys()].some((key) => key.includes('#r:') || key.endsWith('#rem')),
    `${id}: a strip asset gains no region cells`,
  );
}
console.log('regionLines node (strip bake): OK');

// ── the stroke rule + the family census ─────────────────────────────
{
  assert.ok(isStrokeRegion(sq3Region), 'squiggle_03: the long thin region is a stroke');
  assert.strictEqual(bendSlicesFor(sq3Region), 7, 'squiggle_03: 92 units of length -> 7 slices');
  assert.ok(
    isStrokeRegion(asset(SQ1).regions[0]),
    'squiggle_01 region is a stroke (data-level; the strip owns its motion)',
  );
  assert.strictEqual(bendSlicesFor(asset(SQ1).regions[0]), 6, 'squiggle_01: 87 units -> 6 slices');
  assert.ok(!isStrokeRegion(asset('line_solid_01').regions[0]), 'a solid bar fills its bbox (fill 1.0): not a stroke');
  assert.ok(!isStrokeRegion(asset('flora_flower_01').regions[0]), 'a petal is not a stroke');
  assert.ok(
    !isStrokeRegion({ id: 'x', cx: 0.5, cy: 0.5, x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.55, area: 100 }),
    'thin but short (20 x 15 units): not a stroke — nothing to travel along',
  );
  assert.ok(
    isStrokeRegion({ id: 'x', cx: 0.5, cy: 0.5, x0: 0.45, y0: 0.05, x1: 0.55, y1: 0.95, area: 500 }),
    'a tall thin region is a stroke on the vertical axis (10 x 90 units, fill 0.14)',
  );
  assert.ok(!isStrokeRegion(null) && bendSlicesFor(null) === 0, 'no record, no stroke');
  // The baked census (measured at build): of linework's 89 assigned
  // regions, 35 ride bend and 54 ride bob; bend appears nowhere else.
  // #1854 re-measure: the Marks pool's linework regions join the census —
  // 102 assigned linework regions, 36 bend (the spear's shaft among them), 66 bob.
  let bend = 0,
    bob = 0,
    bendOutsideLine = 0;
  for (const a of ASSETS) {
    for (const kid of Object.values(a.regionKinemes || {})) {
      if (kid === 'bend') {
        bend++;
        if (a.category !== 'linework') bendOutsideLine++;
      }
      if (kid === 'bob') bob++;
    }
  }
  assert.strictEqual(bend, 36, 'library-wide: 36 regions default to bend'); // #1854 re-measure (was 35)
  assert.strictEqual(bob, 66, 'library-wide: 66 regions default to bob'); // #1854 re-measure (was 54)
  assert.strictEqual(bendOutsideLine, 0, 'bend defaults live only in the line family');
  // The defaults the contract will read for the fixtures:
  assert.deepEqual(regionAssignmentFor(SQ3, null), { [sq3Region.id]: 'bend' }, 'squiggle_03 defaults to bend');
  assert.deepEqual(
    regionAssignmentFor(TARGET, null),
    { [tRing.id]: 'bend', [tDot.id]: 'bob', [tInner.id]: 'bend' },
    'target: the strokes bend, the dot bobs — the split is per-region geometry',
  );
}
console.log('regionLines node (stroke rule): OK');

// ── the contract ─────────────────────────────────────────────────────
const item = (assetId, key) => ({
  assetId,
  x: 500,
  y: 350,
  scale: 2.5,
  rotation: 0,
  color: '#ffffff',
  accent: '#ff4444',
  alpha: 100,
  key,
  seedOffset: 0,
});
const layer = (items) => [{ id: 'L', isFx: false, items }];
const contract = (doc, items) => buildSceneContract({ doc: { seed: 1, ...doc }, resolvedLayers: layer(items) });
{
  const c = contract({}, [item(SQ3, 'a')]);
  const slot = c.regionAnim.assets[SQ3][sq3Region.id];
  assert.ok(slot > 0, 'the bend region is selected under the default budget');
  assert.deepEqual(
    { kind: c.kinemes[slot - 1].kind, period: c.kinemes[slot - 1].period, amp: c.kinemes[slot - 1].amp },
    { kind: 2, period: 3.6, amp: 6 },
    'the slot rides the bend kineme (osc, 3.6s, ±6°)',
  );
  assert.deepEqual(c.regionAnim.bend, { [SQ3]: { [sq3Region.id]: 7 } }, 'the bend map carries the slice count');
  assert.strictEqual(assertSceneContract(c), true, 'a bend contract validates');
  // Placements never move (the R2/R3 pin, restated for bend scenes).
  const bare = contract({ regionKinemes: { [SQ3]: { [sq3Region.id]: null } } }, [item(SQ3, 'a')]);
  assert.ok(!('regionAnim' in bare), 'tombstoned: no regionAnim');
  assert.deepEqual(c.instances, bare.instances, 'bend never moves placements');
  // Budget 0 / freeze: no bend, everything at rest.
  const rest = contract({ regionBudget: 0 }, [item(SQ3, 'a')]);
  assert.ok(!('bend' in rest.regionAnim), 'budget 0: no bend map');
  assert.strictEqual(rest.regionAnim.assets[SQ3][sq3Region.id], 0, 'budget 0: slot 0');
  const frozen = contract({ perfTier1: true, quality: 'performance' }, [item(SQ3, 'a')]);
  assert.ok(!('bend' in frozen.regionAnim), 'frozen (tier-2 rung): no bend map');
  // The artist's word beats the geometry: bob on the stroke -> no bend.
  const bobbed = contract({ regionKinemes: { [SQ3]: { [sq3Region.id]: 'bob' } } }, [item(SQ3, 'a')]);
  assert.ok(!('bend' in bobbed.regionAnim), 'an override to bob removes the bend');
  assert.ok(bobbed.regionAnim.assets[SQ3][sq3Region.id] > 0, 'the override still animates (as a bob)');
  // Bend assigned to a NON-stroke: animates whole, never subdivides.
  const FLORA = 'flora_flower_01';
  const petal = asset(FLORA).regions[0];
  const bentPetal = contract({ regionKinemes: { [FLORA]: { [petal.id]: 'bend' } } }, [item(FLORA, 'a')]);
  assert.ok(bentPetal.regionAnim.assets[FLORA][petal.id] > 0, 'bend on a petal still slots');
  assert.ok(!('bend' in bentPetal.regionAnim), 'bend on a petal: no subdivision (geometry gate)');
  // Target through the contract: per-region split.
  const tc = contract({}, [item(TARGET, 'a')]);
  assert.deepEqual(
    tc.regionAnim.bend[TARGET],
    { [tRing.id]: 6, [tInner.id]: 3 },
    'target: both strokes carry slice counts',
  );
  assert.ok(!(tDot.id in (tc.regionAnim.bend[TARGET] || {})), 'target: the dot has no bend entry');
  // The validator, fail-closed on the bend map.
  const good = contract({}, [item(SQ3, 'a')]);
  const bad = (mutate) => {
    const m = JSON.parse(JSON.stringify(good));
    mutate(m);
    return m;
  };
  assert.throws(
    () =>
      assertSceneContract(
        bad((m) => {
          m.regionAnim.bend[SQ3][sq3Region.id] = 9;
        }),
      ),
    /bend/,
    'slices above 8 rejected',
  );
  assert.throws(
    () =>
      assertSceneContract(
        bad((m) => {
          m.regionAnim.bend[SQ3][sq3Region.id] = 2;
        }),
      ),
    /bend/,
    'slices below 3 rejected',
  );
  assert.throws(
    () =>
      assertSceneContract(
        bad((m) => {
          m.regionAnim.bend[SQ3]['rm-ghost'] = 4;
        }),
      ),
    /bend/,
    'a bend for an unknown region rejected',
  );
  assert.throws(
    () =>
      assertSceneContract(
        bad((m) => {
          m.regionAnim.bend = 7;
        }),
      ),
    /bend/,
    'a non-object bend rejected',
  );
}
console.log('regionLines node (contract): OK');

// ── the pack: slices tile, step, and stand down ─────────────────────
{
  const atlas = bakeAtlas([{ asset: SQ3, ink: INK, accent: ACC }]);
  const cellsObj = Object.fromEntries(atlas.cells);
  const c = contract({ kinemeTime: 0 }, [item(SQ3, 'a')]);
  const inst = c.instances[0];
  const frame = { motionTime: 0, shed: false, regions: c.regionAnim };
  const packed = packInstanceData([inst], cellsObj, 1, frame);
  assert.strictEqual(packed.length, 8 * 45, 'one mark expands to remainder + 7 slices');
  const base = comboKey(SQ3, inst.tint, inst.accent);
  const cell = atlas.cells.get(`${base}#r:${sq3Region.id}`);
  const slot = c.regionAnim.assets[SQ3][sq3Region.id];
  const phase0 = kinemePhase(SQ3, sq3Region.id);
  let prevU1 = null;
  for (let j = 0; j < 7; j++) {
    const o = (j + 1) * 45;
    assert.ok(
      Math.abs(packed[o + 6] - (cell.u0 + ((cell.u1 - cell.u0) * j) / 7)) < 2e-7,
      `slice ${j}: u0 is the window's left edge`,
    );
    assert.ok(
      Math.abs(packed[o + 8] - (cell.u0 + ((cell.u1 - cell.u0) * (j + 1)) / 7)) < 2e-7,
      `slice ${j}: u1 is the window's right edge`,
    );
    if (prevU1 !== null) assert.ok(Math.abs(packed[o + 6] - prevU1) < 2e-7, `slice ${j}: windows tile contiguously`);
    prevU1 = packed[o + 8];
    assert.ok(Math.abs(packed[o + 7] - cell.v0) < 2e-7, `slice ${j}: v0 untouched`);
    assert.ok(Math.abs(packed[o + 9] - cell.v1) < 2e-7, `slice ${j}: v1 untouched`);
    assert.strictEqual(packed[o + 18], slot, `slice ${j}: the region's kineme slot`);
    assert.ok(Math.abs(packed[o + 19] - ((phase0 + j / 7) % 1)) < 2e-3, `slice ${j}: phase steps 1/7 along the length`);
    assert.ok(
      Math.abs(packed[o + 2] - inst.scaleX * (cell.geo.sx / 7)) < 1e-5,
      `slice ${j}: scale is the region's, cut 7 ways`,
    );
    if (j > 0) assert.ok(packed[o] > packed[o - 45], `slice ${j}: pivots advance along the stroke`);
  }
  assert.ok(
    Math.abs(packed[45 + 6] - cell.u0) < 2e-7 && Math.abs(prevU1 - cell.u1) < 2e-7,
    'the slices span the region cell exactly',
  );
  // Determinism: the same frame packs byte-identically twice.
  assert.deepStrictEqual(
    packInstanceData([inst], cellsObj, 1, frame),
    packed,
    'same frame -> same pack (deterministic)',
  );
  // Slot 0 stands the slices down even if a bend map is present (the
  // pack's own guard, behind the contract's): remainder + ONE region.
  const stood = packInstanceData([inst], cellsObj, 1, {
    motionTime: 0,
    shed: false,
    regions: { budget: 0, assets: { [SQ3]: { [sq3Region.id]: 0 } }, bend: { [SQ3]: { [sq3Region.id]: 7 } } },
  });
  assert.strictEqual(stood.length, 2 * 45, 'slot 0: the region packs whole, no slices');
  // The collapse shed is the pre-R2 pack, byte for byte.
  const barePack = packInstanceData([inst], cellsObj);
  assert.deepStrictEqual(
    packInstanceData([inst], cellsObj, 1, { motionTime: 0, shed: false, regions: { ...c.regionAnim, shed: true } }),
    barePack,
    'shed collapse packs exactly the single quad',
  );
  // Target pack: the ring slices (6), the dot does not (1 instance).
  const tAtlas = bakeAtlas([{ asset: TARGET, ink: INK, accent: ACC }]);
  const tCells = Object.fromEntries(tAtlas.cells);
  const tc = contract({ kinemeTime: 0 }, [item(TARGET, 'a')]);
  const tPacked = packInstanceData([tc.instances[0]], tCells, 1, {
    motionTime: 0,
    shed: false,
    regions: tc.regionAnim,
  });
  assert.strictEqual(tPacked.length, (1 + 6 + 1 + 3) * 45, 'target: remainder + ring x6 + dot x1 + inner x3');
}
console.log('regionLines node (pack): OK');

// ── GPU: real WebGL2 through the parity driver ───────────────────────
async function runBrowserTests() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const shot = async (doc, assetId, extra) => {
    const c = contract({ kinemeTime: 0, ...doc }, [item(assetId, 'solo')]);
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
  const rectOf = (r) => {
    const X = (u) => (500 + (u * 100 - 50) * 2.5) * 0.4;
    const Y = (v) => (350 + (v * 100 - 50) * 2.5) * 0.4;
    return [Math.ceil(X(r.x0)) + 2, Math.ceil(Y(r.y0)) + 2, Math.floor(X(r.x1)) - 2, Math.floor(Y(r.y1)) - 2];
  };
  const diffIn = (a, b, [x0, y0, x1, y1]) => {
    let n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * 400 + x) * 4;
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
      }
    return n;
  };
  try {
    // (1) The strips roll: cell step moves the wave, the period wraps
    // exactly, shed parks on cell 0 byte-identically.
    const rollReport = [];
    for (const id of [SQ1, SQ2]) {
      const k = getCellKineme(ASSET_CELL_KINEME[id]);
      const c0 = await shot({ kinemeTime: 0 }, id);
      const c1 = await shot({ kinemeTime: (1.5 / k.cells) * k.period }, id);
      const d = diffPx(c0, c1);
      rollReport.push(`${id} roll cell0->cell1 ${d}px`);
      assert.ok(d > 200, `${id}: the wave visibly rolls (${d}px)`);
      assert.ok(same(c0, await shot({ kinemeTime: k.period }, id)), `${id}: one period wraps to the identical frame`);
      const shed = await shot({ kinemeTime: (1.5 / k.cells) * k.period, perfTier1: true, quality: 'performance' }, id);
      assert.ok(same(c0, shed), `${id}: shed pins cell 0, byte-identical`);
    }
    // (2) The bend on squiggle_03: rest parity, motion, travel, wrap,
    // shed collapse.
    const STILL3 = { regionKinemes: { [SQ3]: { [sq3Region.id]: null } } };
    const plain3 = await shot({ ...STILL3, kinemeTime: 0 }, SQ3);
    const rest3 = await shot({ regionBudget: 0, kinemeTime: 0.9 }, SQ3);
    const parity = diffPx(rest3, plain3) / (400 * 280);
    assert.ok(parity < 0.1, `bend rest parity inside the bar: ${(parity * 100).toFixed(3)}% of pixels differ`);
    const bent1 = await shot({ kinemeTime: 0.9 }, SQ3);
    const bent2 = await shot({ kinemeTime: 1.8 }, SQ3);
    const dBend = diffPx(rest3, bent1);
    const dTravel = diffPx(bent1, bent2);
    assert.ok(dBend > 100, `the stroke bends (${dBend}px vs rest)`);
    assert.ok(dTravel > 100, `the bend travels: the pose at t=1.8 differs from t=0.9 (${dTravel}px)`);
    assert.ok(diffPx(rest3, bent2) > 100, 'still bent at t=1.8 (motion is continuous, not a blink)');
    assert.ok(same(bent1, await shot({ kinemeTime: 0.9 }, SQ3)), 'same time -> same frame (deterministic)');
    assert.ok(
      same(await shot({ kinemeTime: 0 }, SQ3), await shot({ kinemeTime: 3.6 }, SQ3)),
      'one bend period wraps exactly',
    );
    const shed3 = await shot({ kinemeTime: 0.9 }, SQ3, (c) => {
      c.regionAnim = { ...c.regionAnim, shed: true };
    });
    assert.ok(same(shed3, plain3), 'shed collapse renders byte-identically to the pre-R2 path');
    // (3) Stroke-awareness on line_target_01: the ring bends under its
    // default; the centre dot — a non-stroke sharing the quad — is held
    // still by a tombstone and must not move a single pixel.
    const T_DOC = { regionKinemes: { [TARGET]: { [tRing.id]: 'bend', [tDot.id]: null, [tInner.id]: null } } };
    const restT = await shot({ ...T_DOC, regionBudget: 0, kinemeTime: 0.9 }, TARGET);
    const bentT = await shot({ ...T_DOC, kinemeTime: 0.9 }, TARGET);
    const ringDiff = diffIn(restT, bentT, rectOf(tRing));
    const dotDiff = diffIn(restT, bentT, rectOf(tDot));
    assert.ok(ringDiff > 30, `the ring bends (${ringDiff}px in its bbox)`);
    assert.strictEqual(dotDiff, 0, `the dot does not bend: byte-still (${dotDiff}px)`);
    console.log(
      `regionLines GPU: OK — ${rollReport.join('; ')}; bend ${dBend}px, travel ${dTravel}px, rest parity ${(parity * 100).toFixed(3)}%; target ring ${ringDiff}px vs dot ${dotDiff}px`,
    );
  } finally {
    await closeGlDriver();
  }
}
try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser line tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}
console.log('regionLines.selfcheck: OK');
