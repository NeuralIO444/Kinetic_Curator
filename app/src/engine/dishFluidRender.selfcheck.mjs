// dishFluidRender.selfcheck.mjs — FERROFLUID (#1997): the attached body (engine/dishFluidRender.mjs).
//
// Matt's presentation law (2026-11-08): the system is invisible and assets attach to it. Pinned here:
//   A absent     an inactive plan, a missing density, a field under the floor — no body at all
//   B seating    matter seats ONLY on dense cells (never below the floor, never on bedrock,
//                never outside the dish), wearing the nearest dealt mark, deterministically
//   C pull       the body's count at a magnet rises monotonically with the PULL dial — and
//                PULL cannot create matter where the field is thin (no density, no seat)
//   D governed   the cap binds at saturation; the rung's matter fraction scales the body;
//                a coarser seat grid seats on the coarser centres
//   E fallback   with no dealt marks to wear, the body is dealt from the stage's asset pool —
//                any pool shape, letterforms and stamps included — in the palette's ink, from
//                the seeded stream (same plan = same body); no pool supplied = the module's
//                seed shapes; an explicitly empty pool seats no body at all
import assert from 'node:assert/strict';
import {
  fluidMatterItems,
  seatDensity,
  isFluidMatter,
  MATTER_DENSITY_FLOOR,
  MAX_FLUID_ITEMS,
  FLUID_PRIMITIVE_ASSETS,
} from './dishFluidRender.mjs';
import { createDishFluidStage } from './dishFluidStage.mjs';
import { fluidStamp, FLUID_GRID_COLS, FLUID_GRID_ROWS } from './dishFluid.mjs';

const W = 1000;
const H = 700;
const N = FLUID_GRID_COLS * FLUID_GRID_ROWS;

const densityOf = (fn) => {
  const d = new Float32Array(N);
  for (let y = 0; y < FLUID_GRID_ROWS; y++)
    for (let x = 0; x < FLUID_GRID_COLS; x++)
      d[y * FLUID_GRID_COLS + x] = fn((x + 0.5) / FLUID_GRID_COLS, (y + 0.5) / FLUID_GRID_ROWS);
  return d;
};
const planOf = (over = {}) => ({
  active: true,
  seedKey: 1234,
  wakeMs: 0,
  step: 10,
  density: densityOf(() => 0),
  magnets: [],
  dial: { flow: 0.5, pull: 0.7, couple: 0.5 },
  seatCols: FLUID_GRID_COLS,
  seatRows: FLUID_GRID_ROWS,
  matterFrac: 1,
  aspectHW: 0.7,
  ...over,
});
const MARKS = [
  {
    assetId: 'shape-a',
    x: 200,
    y: 200,
    scale: 1.2,
    scaleY: 1.2,
    rotation: 10,
    alpha: 80,
    color: '#aabbcc',
    accent: '#112233',
    key: 'm-a',
  },
  {
    assetId: 'shape-b',
    x: 700,
    y: 450,
    scale: 0.8,
    scaleY: 0.8,
    rotation: -20,
    alpha: 60,
    color: '#445566',
    accent: '#ddeeff',
    key: 'm-b',
  },
  {
    assetId: 'shape-c',
    x: 500,
    y: 120,
    scale: 1,
    scaleY: 1,
    rotation: 0,
    alpha: 100,
    color: '#778899',
    accent: '#000000',
    key: 'm-c',
  },
];
const nearMagnet = (items, mx, my, r) =>
  items.filter((it) => {
    const dx = it.x / W - mx;
    const dy = (it.y / H - my) * 0.7;
    return dx * dx + dy * dy <= r * r;
  }).length;

// ---- A: absent / thin fields grow no body
{
  assert.deepEqual(fluidMatterItems(null, MARKS, { canvasW: W, canvasH: H }), [], 'no plan, no body');
  assert.deepEqual(
    fluidMatterItems(planOf({ active: false }), MARKS, { canvasW: W, canvasH: H }),
    [],
    'inactive plan, no body',
  );
  assert.deepEqual(
    fluidMatterItems(planOf({ density: null }), MARKS, { canvasW: W, canvasH: H }),
    [],
    'no density, no body',
  );
  assert.deepEqual(fluidMatterItems(planOf(), MARKS, { canvasW: W, canvasH: H }), [], 'an empty field seats nothing');
  assert.deepEqual(
    fluidMatterItems(planOf({ density: densityOf(() => MATTER_DENSITY_FLOOR - 0.01) }), MARKS, {
      canvasW: W,
      canvasH: H,
    }),
    [],
    'a field everywhere under the floor seats nothing',
  );
  assert.deepEqual(
    fluidMatterItems(planOf({ density: densityOf(() => 0.9), matterFrac: 0 }), MARKS, { canvasW: W, canvasH: H }),
    [],
    'a zero matter fraction seats nothing',
  );
}

// ---- B: seating law
{
  const blob = densityOf((nx, ny) => ((nx - 0.3) ** 2 + ((ny - 0.4) * 0.7) ** 2 <= 0.02 ? 0.9 : 0));
  const plan = planOf({ density: blob });
  const items = fluidMatterItems(plan, MARKS, { canvasW: W, canvasH: H });
  assert.ok(items.length > 20, `the dense blob grows a body (${items.length} items)`);
  const seat = seatDensity(blob, FLUID_GRID_COLS, FLUID_GRID_ROWS);
  for (const it of items) {
    assert.ok(isFluidMatter(it), 'every item carries the fluid key');
    assert.ok(it.x >= 0 && it.x <= W && it.y >= 0 && it.y <= H, 'every item sits inside the dish');
    const cell = Math.floor((it.y / H) * FLUID_GRID_ROWS) * FLUID_GRID_COLS + Math.floor((it.x / W) * FLUID_GRID_COLS);
    assert.ok(seat[cell] >= MATTER_DENSITY_FLOOR, 'every item seats on a cell at or over the floor');
    assert.ok(
      MARKS.some((m) => m.assetId === it.assetId),
      'every item wears a dealt mark’s asset',
    );
    assert.ok(it.alpha > 0 && it.alpha <= 100, 'alpha is a placement alpha');
  }
  assert.deepEqual(fluidMatterItems(plan, MARKS, { canvasW: W, canvasH: H }), items, 'same plan + marks = same body');
  // bedrock: block the blob's cells; a second blob elsewhere still seats, the blocked one does not
  const blocked = new Uint8Array(N);
  for (let y = 0; y < FLUID_GRID_ROWS; y++)
    for (let x = 0; x < FLUID_GRID_COLS; x++) {
      const nx = (x + 0.5) / FLUID_GRID_COLS;
      const ny = (y + 0.5) / FLUID_GRID_ROWS;
      if ((nx - 0.3) ** 2 + ((ny - 0.4) * 0.7) ** 2 <= 0.03) blocked[y * FLUID_GRID_COLS + x] = 1;
    }
  const two = densityOf((nx, ny) =>
    (nx - 0.3) ** 2 + ((ny - 0.4) * 0.7) ** 2 <= 0.02 || (nx - 0.8) ** 2 + ((ny - 0.7) * 0.7) ** 2 <= 0.02 ? 0.9 : 0,
  );
  const onBedrock = fluidMatterItems(planOf({ density: two }), MARKS, { canvasW: W, canvasH: H, blocked });
  assert.ok(onBedrock.length > 10, 'the unblocked blob still seats');
  for (const it of onBedrock) {
    const cell = Math.floor((it.y / H) * FLUID_GRID_ROWS) * FLUID_GRID_COLS + Math.floor((it.x / W) * FLUID_GRID_COLS);
    assert.equal(blocked[cell], 0, 'no item ever seats on bedrock');
  }
}

// ---- C: PULL gathers the body at the magnets — and cannot create matter from nothing
{
  // the field runs DENSER far from the magnet than at it, so at PULL 0 the cap is spent on the
  // far cells; as PULL rises the magnet's seats outscore them and the body gathers in
  const gradient = densityOf((nx, ny) => {
    const dx = nx - 0.5;
    const dy = (ny - 0.5) * 0.7;
    return 0.5 + 0.2 * Math.min(1, Math.sqrt(dx * dx + dy * dy) / 0.3);
  });
  const counts = [0, 0.5, 1].map((pull) =>
    nearMagnet(
      fluidMatterItems(
        planOf({ density: gradient, magnets: [{ x: 0.5, y: 0.5 }], dial: { flow: 0.5, pull, couple: 0.5 } }),
        MARKS,
        {
          canvasW: W,
          canvasH: H,
        },
      ),
      0.5,
      0.5,
      0.12,
    ),
  );
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2], `matter at the magnet rises with PULL (${counts})`);
  // a magnet standing in a thin region seats nothing there, at any PULL
  const thin = densityOf((nx, ny) => ((nx - 0.5) ** 2 + ((ny - 0.5) * 0.7) ** 2 <= 0.09 ? 0 : 0.9));
  const items = fluidMatterItems(
    planOf({ density: thin, magnets: [{ x: 0.5, y: 0.5 }], dial: { flow: 0.5, pull: 1, couple: 0.5 } }),
    MARKS,
    { canvasW: W, canvasH: H },
  );
  assert.ok(items.length > 0, 'the dense rim still seats');
  assert.equal(nearMagnet(items, 0.5, 0.5, 0.2), 0, 'no density at the magnet = no matter at the magnet, PULL at full');
}

// ---- C2: through the real stage — the kernel grows the field at a gripped magnet, and the
// body follows (the emergent half of the same law)
{
  const drive = (pull) => {
    const st = createDishFluidStage();
    const ctx = {
      seed: 7,
      magnets: [{ x: 0.5, y: 0.5 }],
      dial: { flow: 0.5, pull, couple: 0 },
      coupleField: null,
      W,
      H,
    };
    for (let t = 16.7; t < 4000; t += 16.7) st.apply(fluidStamp(t, { shed: 0 }), ctx);
    st.apply(fluidStamp(4000, { shed: 0 }), ctx);
    return fluidMatterItems(st.plan, MARKS, { canvasW: W, canvasH: H });
  };
  const loose = nearMagnet(drive(0), 0.5, 0.5, 0.15);
  const gripped = nearMagnet(drive(1), 0.5, 0.5, 0.15);
  assert.ok(gripped > loose, `the stepped field seats more matter at a gripped magnet (${loose} → ${gripped})`);
}

// ---- D: the governed body
{
  const saturated = planOf({ density: densityOf(() => 0.9) });
  assert.equal(fluidMatterItems(saturated, MARKS, { canvasW: W, canvasH: H }).length, MAX_FLUID_ITEMS, 'the cap binds');
  assert.equal(
    fluidMatterItems(planOf({ density: saturated.density, matterFrac: 0.5 }), MARKS, { canvasW: W, canvasH: H }).length,
    Math.floor(MAX_FLUID_ITEMS * 0.5),
    'the matter rung halves the body',
  );
  assert.equal(
    fluidMatterItems(planOf({ density: saturated.density, matterFrac: 0.25 }), MARKS, { canvasW: W, canvasH: H })
      .length,
    Math.floor(MAX_FLUID_ITEMS * 0.25),
    'the matter rung quarters the body',
  );
  const coarse = fluidMatterItems(planOf({ density: saturated.density, seatCols: 32, seatRows: 18 }), MARKS, {
    canvasW: W,
    canvasH: H,
  });
  assert.ok(coarse.length > 0 && coarse.length <= 32 * 18, 'the coarse body fits its grid');
  for (const it of coarse) {
    const gx = it.x / (W / 32) - 0.5;
    const gy = it.y / (H / 18) - 0.5;
    assert.ok(
      Math.abs(gx - Math.round(gx)) < 1e-6 && Math.abs(gy - Math.round(gy)) < 1e-6,
      'coarse seats land on coarse centres',
    );
  }
}

// ---- E: the no-marks deal — the stage's whole pool is the vocabulary (letters included)
{
  const blob = densityOf((nx, ny) => ((nx - 0.3) ** 2 + ((ny - 0.4) * 0.7) ** 2 <= 0.02 ? 0.9 : 0));
  // real pool ids: a mark, a letterform (assets-letterforms), a stamp (assets-stamp-radial)
  const POOL = ['mrk_dots_01', 'typ_3', 'stamp_num_02', 'mrk_ring_01'];
  const items = fluidMatterItems(planOf({ density: blob }), [], {
    canvasW: W,
    canvasH: H,
    paletteInk: '#e8e0cc',
    poolIds: POOL,
  });
  assert.ok(items.length > 20, 'an empty stage still grows a body from the pool');
  for (const it of items) {
    assert.ok(POOL.includes(it.assetId), 'pool-dealt items wear pool shapes only');
    assert.equal(it.color, '#e8e0cc', 'pool-dealt items wear the palette ink');
  }
  assert.ok(
    items.some((it) => it.assetId === 'typ_3'),
    'letterforms are seatable matter',
  );
  assert.ok(
    items.some((it) => it.assetId === 'stamp_num_02'),
    'stamps are seatable matter',
  );
  assert.deepEqual(
    fluidMatterItems(planOf({ density: blob }), [], { canvasW: W, canvasH: H, paletteInk: '#e8e0cc', poolIds: POOL }),
    items,
    'the pool deal is seeded: same plan = same body',
  );
  assert.deepEqual(
    fluidMatterItems(planOf({ density: blob }), [], { canvasW: W, canvasH: H, poolIds: [] }),
    [],
    'an explicitly empty pool seats no body — nothing lawful to wear',
  );
  // no pool supplied at all: the module's seed shapes (the pure-caller default)
  const seeded = fluidMatterItems(planOf({ density: blob }), [], { canvasW: W, canvasH: H, paletteInk: '#e8e0cc' });
  assert.ok(seeded.length > 20, 'a pool-less caller still grows a body of seed shapes');
  for (const it of seeded) {
    assert.ok(FLUID_PRIMITIVE_ASSETS.includes(it.assetId), 'seed-default items wear the seed shapes');
  }
}

// seatDensity: identity at the dish grid (a copy), honest averages below it
{
  const src = densityOf((nx) => nx);
  const id = seatDensity(src, FLUID_GRID_COLS, FLUID_GRID_ROWS);
  assert.deepEqual([...id], [...src], 'identity at the dish grid');
  assert.notEqual(id, src, 'a copy, never the published array itself');
  const half = seatDensity(src, 48, 27);
  assert.equal(half.length, 48 * 27);
  assert.ok(Math.abs(half[0] - (0.5 / 96 + 1.5 / 96) / 2) < 1e-6, 'box averages, not samples');
}

console.log('dishFluidRender.selfcheck: ok');
