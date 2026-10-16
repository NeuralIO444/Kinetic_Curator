// cellKinemePlayback.selfcheck.mjs — #1431 KINEME Build C playback: the cell
// kinemes (data/cellKinemes.js, #781) finally reach the render.
//
// Node: cell selection + UV windows for all 4 kinemes; the strip bake
// (frames contiguous in one wide atlas cell, frame 0 bit-identical to the
// pre-#1431 single-cell bake, non-strip layout unchanged); the pack seam
// (packInstanceData consults the strip table only when the caller supplies
// the frame clock, so every pre-#1431 caller's output is byte-identical);
// the contract (motion time rides even without an instance-kineme table;
// cellShed present only while shed, on the tier-2 rung).
// Browser (real WebGL2 through the parity driver): a strip asset visibly
// steps through its cells on the motion clock, one period wraps exactly,
// the same time renders the same frame, shed parks on cell 0 byte-
// identically, and a non-strip mark ignores the strip clock entirely.
import assert from 'node:assert';
import { Resvg } from '@resvg/resvg-js';
import {
  CELL_KINEMES, ASSET_CELL_KINEME, getCellKineme, cellIndexAt, cellUvWindow, stripFramesFor,
} from '../data/cellKinemes.js';
import { MICRO_HUD_STRIPS } from '../data/assets/assets-micro-hud-strips.js';
import { ASSETS } from '../data/assets/index.js';
import { applyGradient } from '../assets/gradient.js';
import { bakeAtlas, CELL_PX, CELL_UNITS, comboKey } from './atlas.mjs';
import { packInstanceData } from './renderer.mjs';
import { buildSceneContract, cellKinemesShed } from './sceneContract.js';

const STRIP_ASSETS = Object.keys(ASSET_CELL_KINEME);
const INK = '#f5f1e8';
const ACC = '#e4572e';

// ── cell selection: all 4 kinemes walk, wrap, and pin ────────────────────
for (const k of CELL_KINEMES) {
  assert.strictEqual(cellIndexAt(0, k), 0, `${k.id} starts on cell 0`);
  assert.strictEqual(cellIndexAt(k.period, k), 0, `${k.id} wraps at the period`);
  assert.strictEqual(cellIndexAt(k.period * 3 + 0.001, k), 0, `${k.id} is back on cell 0 just past 3 periods`);
  assert.strictEqual(cellIndexAt(((k.cells / 2) + 0.5) / k.cells * k.period, k), k.cells / 2, `${k.id} mid-strip cell`);
  assert.strictEqual(cellIndexAt(1.5 / k.cells * k.period, k), 1, `${k.id} reaches cell 1`);
  const seen = new Set();
  for (let s = 0; s < 400; s++) seen.add(cellIndexAt((s / 400) * k.period, k));
  assert.strictEqual(seen.size, k.cells, `${k.id} visits all ${k.cells} cells in one period`);
  assert.strictEqual(cellIndexAt(1.234, { ...k, shed: true }), 0, `${k.id} shed pins cell 0`);
  assert.strictEqual(cellIndexAt(-0.1, k), k.cells - 1, `${k.id} negative time wraps from the end`);
  assert.strictEqual(cellIndexAt(NaN, k), 0, `${k.id} garbage time is cell 0`);
}

// ── UV windows: tile the cell exactly, v untouched ───────────────────────
{
  const cell = { u0: 0.125, v0: 0.25, u1: 0.625, v1: 0.75 };
  for (const k of CELL_KINEMES) {
    const wins = Array.from({ length: k.cells }, (_, i) => cellUvWindow(cell, i, k.cells));
    assert.strictEqual(wins[0].u0, cell.u0, `${k.id} window 0 starts at the cell edge`);
    for (let i = 1; i < k.cells; i++) assert.strictEqual(wins[i].u0, wins[i - 1].u1, `${k.id} windows tile contiguously`);
    assert.ok(Math.abs(wins[k.cells - 1].u1 - cell.u1) < 1e-12, `${k.id} last window ends at the cell edge`);
    for (const w of wins) {
      assert.strictEqual(w.v0, cell.v0);
      assert.strictEqual(w.v1, cell.v1);
      assert.ok(w.u0 >= cell.u0 && w.u1 <= cell.u1 + 1e-12, `${k.id} window inside the cell`);
    }
  }
}

// ── the strip table: one source of truth, fail-closed ────────────────────
for (const a of STRIP_ASSETS) {
  const frames = stripFramesFor(a);
  assert.ok(Array.isArray(frames), `${a} has a playable strip`);
  assert.strictEqual(frames, MICRO_HUD_STRIPS[a], `${a} frames are the baked strip data`);
  assert.strictEqual(frames.length, getCellKineme(ASSET_CELL_KINEME[a]).cells, `${a} frame count matches its kineme`);
}
assert.strictEqual(stripFramesFor('geo_tri_01'), null, 'non-strip asset has no strip');
assert.strictEqual(stripFramesFor('nope'), null, 'unknown asset has no strip');
console.log('cellKinemePlayback node (selection/windows/table): OK');

// ── the bake: strips wide + contiguous, frame 0 bit-identical ───────────
const stripBakes = new Map();
for (const a of STRIP_ASSETS) {
  const atlas = bakeAtlas([{ asset: a, ink: INK, accent: ACC }]);
  const cell = atlas.cells.get(comboKey(a, INK, ACC));
  const k = getCellKineme(ASSET_CELL_KINEME[a]);
  assert.strictEqual(Math.round((cell.u1 - cell.u0) * atlas.width), k.cells * CELL_PX - 1, `${a} cell spans ${k.cells} frames of texels`);
  assert.strictEqual(Math.round((cell.v1 - cell.v0) * atlas.height), CELL_PX - 1, `${a} cell is one frame tall`);
  assert.ok(cell.ink, `${a} carries an ink bbox`);
  stripBakes.set(a, { atlas, cell });
}
{
  // Frame 0 must be the pre-#1431 bake, texel for texel: re-derive the old
  // single-cell bake from its recipe (atlas.mjs before this lane) and
  // compare against the strip bake's first frame block.
  const { atlas, cell } = stripBakes.get('mic_dial');
  const dial = ASSETS.find((a) => a.id === 'mic_dial');
  const sub = (svg) => svg.replace(/var\(--ink[^)]*\)/g, INK).replace(/var\(--accent[^)]*\)/g, ACC);
  const refSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_PX}" height="${CELL_PX}" ` +
    `viewBox="${CELL_UNITS.x0} ${CELL_UNITS.y0} ${CELL_UNITS.x1 - CELL_UNITS.x0} ${CELL_UNITS.y1 - CELL_UNITS.y0}">` +
    sub(applyGradient(dial.svg, dial.gradient, { ink: INK, accent: ACC })) +
    `</svg>`;
  const refPx = Buffer.from(new Resvg(refSvg).render().pixels);
  const cx = Math.round(cell.u0 * atlas.width - 0.5);
  const cy = Math.round(cell.v0 * atlas.height - 0.5);
  for (let y = 0; y < CELL_PX; y++) {
    const got = atlas.pixels.subarray(((cy + y) * atlas.width + cx) * 4, ((cy + y) * atlas.width + cx + CELL_PX) * 4);
    const want = refPx.subarray(y * CELL_PX * 4, (y + 1) * CELL_PX * 4);
    assert.strictEqual(Buffer.compare(got, want), 0, `frame 0 row ${y} is bit-identical to the pre-#1431 bake`);
  }
}
{
  // An atlas without strips lays out exactly as before this lane.
  const plain = bakeAtlas([
    { asset: 'geo_tri_01', ink: INK, accent: ACC },
    { asset: 'geo_chev_01', ink: INK, accent: ACC },
    { asset: 'mic_plus', ink: INK, accent: ACC },
    { asset: 'mic_dotgrid_5', ink: INK, accent: ACC },
  ]);
  // #1433: the region bake packs remainder/region cells into the same
  // sqrt grid as the mains, sized on the total slot count so combo-rich
  // atlases stay compact. What this pin can still assert is that every
  // main cell remains one whole stride-aligned frame; absolute grid
  // positions are R2's packing choice, not a stage-1 invariant.
  assert.ok(plain.width >= 432 && plain.width % 432 === 0, 'atlas width is whole strides');
  assert.ok(plain.height >= 432 && plain.height % 432 === 0, 'atlas height is whole strides');
  const c2 = plain.cells.get(comboKey('mic_plus', INK, ACC));
  assert.strictEqual(Math.round(c2.u0 * plain.width - 0.5) % 432, 0, 'plain cell starts on a stride boundary');
  assert.strictEqual(Math.round(c2.v0 * plain.height - 0.5) % 432, 0, 'plain cell starts on a stride row');
  assert.strictEqual(Math.round((c2.u1 - c2.u0) * plain.width), CELL_PX - 1, 'plain cell is one frame wide');
  stripBakes.set('__plain__', { atlas: plain, cell: c2 });
}
console.log('cellKinemePlayback node (bake): OK');

// ── the pack seam ────────────────────────────────────────────────────────
{
  // Packed UVs live in a Float32Array; compare against the float64 window
  // math with float32 tolerance.
  const assertUv = (buf, want, msg) => {
    const got = [buf[6], buf[7], buf[8], buf[9]];
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(got[i] - want[i]) < 2e-7, `${msg} (uv[${i}] ${got[i]} ≈ ${want[i]})`);
  };
  for (const a of STRIP_ASSETS) {
    const { atlas, cell } = stripBakes.get(a);
    const cellsObj = Object.fromEntries(atlas.cells);
    const k = getCellKineme(ASSET_CELL_KINEME[a]);
    const inst = { asset: a, tint: INK, accent: ACC, x: 10, y: 20, scaleX: 2, scaleY: 2, rotation: 0, opacity: 1 };
    // No clock → today's pack, the full cell.
    assertUv(packInstanceData([inst], cellsObj), [cell.u0, cell.v0, cell.u1, cell.v1], `${a}: no clock packs the full cell`);
    // Clock → the window of the cell the clock selects.
    for (const t of [0, 0.37, 1.5 / k.cells * k.period, k.period / 2, k.period - 0.01, k.period, k.period * 2.75, -0.5]) {
      const want = cellUvWindow(cell, cellIndexAt(t, k), k.cells);
      assertUv(
        packInstanceData([inst], cellsObj, 1, { motionTime: t, shed: false }),
        [want.u0, want.v0, want.u1, want.v1],
        `${a}: t=${t} packs cell ${cellIndexAt(t, k)}`,
      );
    }
    // Shed → window 0 at any time.
    const w0 = cellUvWindow(cell, 0, k.cells);
    assertUv(
      packInstanceData([inst], cellsObj, 1, { motionTime: k.period / 2, shed: true }),
      [w0.u0, w0.v0, w0.u1, w0.v1],
      `${a}: shed packs cell 0`,
    );
  }
  // A non-strip instance is untouched by the clock — byte for byte.
  const { atlas: plain } = stripBakes.get('__plain__');
  const plainCells = Object.fromEntries(plain.cells);
  const pinst = { asset: 'geo_tri_01', tint: INK, accent: ACC, x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
  const before = packInstanceData([pinst], plainCells);
  const clocked = packInstanceData([pinst], plainCells, 1, { motionTime: 2.3, shed: false });
  assert.deepStrictEqual(clocked, before, 'non-strip instance: the clock changes nothing');
  // The legacy producer branch (instance-carried cellIndex) still works.
  const legacy = packInstanceData([{ ...pinst, cellIndex: 1, cellCount: 4 }], plainCells);
  const pc = plain.cells.get(comboKey('geo_tri_01', INK, ACC));
  const w = (pc.u1 - pc.u0) / 4;
  assert.ok(Math.abs(legacy[6] - (pc.u0 + w)) < 1e-7 && Math.abs(legacy[8] - (pc.u0 + 2 * w)) < 1e-7, 'legacy cellIndex branch unchanged');
}
console.log('cellKinemePlayback node (pack): OK');

// ── the contract ─────────────────────────────────────────────────────────
const item = (assetId, key) => ({ assetId, x: 500, y: 350, scale: 2.5, rotation: 0, color: '#ffffff', accent: '#ff4444', alpha: 100, key, seedOffset: 0 });
const layer = (items) => [{ id: 'L', isFx: false, items }];
const contract = (doc, items) => buildSceneContract({ doc: { seed: 1, ...doc }, resolvedLayers: layer(items) });
{
  const bare = contract({}, [item('mic_dial', 'a')]);
  assert.ok(!('kinemeTime' in bare) && !('kinemes' in bare) && !('cellShed' in bare), 'motionless doc → no motion keys (hashes unchanged)');
  const timed = contract({ kinemeTime: 1.25 }, [item('mic_dial', 'a')]);
  assert.strictEqual(timed.kinemeTime, 1.25, 'motion time rides without an instance-kineme table');
  assert.ok(!('kinemes' in timed) && !('cellShed' in timed), 'timed but unshed: no table, no shed key');
  const shed = contract({ kinemeTime: 2, perfTier1: true, quality: 'performance' }, [item('mic_dial', 'a')]);
  assert.strictEqual(shed.cellShed, true, 'tier-2 rung sheds the strips');
  assert.ok(!('cellShed' in contract({ perfTier1: true, quality: 'balanced' }, [item('mic_dial', 'a')])), 'tier-1 alone does not shed');
  assert.ok(!('cellShed' in contract({ quality: 'performance' }, [item('mic_dial', 'a')])), 'PERF quality alone does not shed');
  assert.strictEqual(cellKinemesShed({ perfTier1: true, quality: 'performance' }), true);
  assert.strictEqual(cellKinemesShed({ perfTier1: true, quality: 'balanced' }), false);
  assert.strictEqual(cellKinemesShed({}), false);
  assert.strictEqual(cellKinemesShed(null), false);
}
console.log('cellKinemePlayback node (contract): OK');

// ── GPU: real WebGL2 through the parity driver ───────────────────────────
async function runBrowserTests() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const shot = async (doc, asset = 'mic_dial') =>
    (await renderViaGL(contract(doc, [item(asset, 'solo')]), { width: 400, height: 280, bg: '#000000' })).pixels;
  const same = (a, b) => Buffer.compare(a, b) === 0;
  const diffPx = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
    }
    return n;
  };
  try {
    const report = [];
    // Every strip asset steps from cell 0 to cell 1 on the clock.
    for (const a of STRIP_ASSETS) {
      const k = getCellKineme(ASSET_CELL_KINEME[a]);
      const c0 = await shot({ kinemeTime: 0 }, a);
      const c1 = await shot({ kinemeTime: 1.5 / k.cells * k.period }, a);
      const d = diffPx(c0, c1);
      report.push(`${a} cell0→cell1 ${d}px`);
      assert.ok(d > 40, `${a} visibly steps to cell 1 (${d} differing px)`);
    }
    // The dial: opposite cell, exact wrap, determinism, shed, no-clock.
    const d0 = await shot({ kinemeTime: 0 });
    const dHalf = await shot({ kinemeTime: 2.0 }); // cell 4 of 8 — needle opposite
    const halfDiff = diffPx(d0, dHalf);
    assert.ok(halfDiff > 200, `dial cell 0 → cell 4 moves the needle (${halfDiff} differing px)`);
    assert.ok(same(d0, await shot({ kinemeTime: 4.0 })), 'one full period wraps to the identical frame');
    assert.ok(same(dHalf, await shot({ kinemeTime: 2.0 })), 'same motion time → same frame (deterministic)');
    const shedShot = await shot({ kinemeTime: 2.0, perfTier1: true, quality: 'performance' });
    assert.ok(same(d0, shedShot), 'shed parks on cell 0 — byte-identical to the cell-0 frame');
    assert.ok(same(d0, await shot({})), 'a doc with no clock renders cell 0');
    // A non-strip mark ignores the strip clock entirely.
    const g0 = await shot({ kinemeTime: 0 }, 'geo_tri_01');
    const g1 = await shot({ kinemeTime: 2.3 }, 'geo_tri_01');
    assert.ok(same(g0, g1), 'non-strip mark: byte-identical at any motion time');
    console.log(`cellKinemePlayback GPU: OK — ${report.join('; ')}; mic_dial cell0→cell4 ${halfDiff}px`);
  } finally {
    await closeGlDriver();
  }
}
try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser cell-kineme tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}
console.log('cellKinemePlayback.selfcheck: OK');
