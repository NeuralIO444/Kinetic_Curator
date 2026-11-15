// node src/gl/worldInk.selfcheck.mjs — #2104 Q2 (second half): line work takes
// the ink, at both consumers. Marks: packInstanceData packs a standing world's
// ink for stroke-only assets only, the dealt tint for everything else, and the
// accent floats never move (Q1–Q3). Patterns: a GLYPH tile painted with
// stroked ops only draws in the ink; every other tile — and every other mode —
// is pixel-identical to the world-less frame (Q4). No world → byte-identical.
import assert from 'node:assert';
import { packInstanceData, INSTANCE_STRIDE } from './renderer.mjs';
import { createPatternFrames, patternKey, patternPixels, patternPalette } from '../pattern/patternSource.js';
import { assignGlyph, glyphLayout, toRgba } from '../pattern/engine.js';
import { isStrokeOnlyOps } from '../pattern/glyph.js';
import { getCatalogPalette } from '../data/palettes.js';

const INK = '#b400ff'; // the praystation world's ink — loud, and not a dealt tint below
const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
const near = (a, b) => Math.abs(a - b) < 1e-6;

// ── the pack seam ────────────────────────────────────────────────────────
{
  const cell = { u0: 0, v0: 0, u1: 0.1, v1: 0.1 };
  const TINT = '#224466';
  const ACCENT = '#dd2211';
  const inst = (asset) => ({
    asset,
    tint: TINT,
    accent: ACCENT,
    x: 10,
    y: 20,
    scaleX: 2,
    scaleY: 2,
    rotation: 0,
    opacity: 1,
  });
  // one of each class: stroke-only, fill-only, mixed (Q1), a letterform, no ink slot
  const assets = ['geo_circle_02', 'geo_tri_01', 'mic_dial', 'typ_A', 'xsh01'];
  const cells = Object.fromEntries(assets.map((a) => [a, cell]));
  const list = assets.map(inst);

  const base = packInstanceData(list, cells);
  const framedNoInk = packInstanceData(list, cells, 1, { motionTime: 0, shed: false });
  const inked = packInstanceData(list, cells, 1, { motionTime: 0, shed: false, ink: INK });
  assert.strictEqual(inked.length, base.length, 'the ink changes values, never the stride');

  const wantInk = rgb(INK);
  const wantTint = rgb(TINT);
  const wantAccent = rgb(ACCENT);
  for (let i = 0; i < assets.length; i++) {
    const o = i * INSTANCE_STRIDE;
    const want = i === 0 ? wantInk : wantTint; // only the stroke-only asset takes the ink
    for (let c = 0; c < 3; c++) {
      assert.ok(
        near(inked[o + 12 + c], want[c]),
        `${assets[i]}: packed ink channel ${c} is ${i === 0 ? 'the world ink' : 'its dealt tint'}`,
      );
      assert.ok(near(inked[o + 15 + c], wantAccent[c]), `${assets[i]}: accent channel ${c} never moves (Q3)`);
      assert.ok(near(base[o + 12 + c], wantTint[c]), `${assets[i]}: world-less pack is the dealt tint`);
    }
    // every other float of the instance is untouched by the ink (same frame,
    // with and without it — the frame clock's own strip windows ride both)
    for (let f = 0; f < INSTANCE_STRIDE; f++) {
      if (f >= 12 && f <= 14) continue;
      assert.strictEqual(
        inked[o + f],
        framedNoInk[o + f],
        `${assets[i]}: float ${f} identical with and without a world`,
      );
    }
  }
  // the contract instance is never mutated: the tint stays the dealt colour
  for (const it of list) assert.strictEqual(it.tint, TINT, 'the packer reads the tint, never writes it');

  // a strip asset (the cell library's line-boil squiggle, stroke-only) takes
  // the ink too, and the ink touches nothing else the frame clock drives:
  // same frame with and without ink differs only in the ink floats.
  const stripCells = { line_squiggle_01: cell };
  const stripFrame = { motionTime: 0.3, shed: false };
  const stripPlain = packInstanceData([inst('line_squiggle_01')], stripCells, 1, stripFrame);
  const stripInked = packInstanceData([inst('line_squiggle_01')], stripCells, 1, { ...stripFrame, ink: INK });
  for (let f = 0; f < INSTANCE_STRIDE; f++) {
    if (f >= 12 && f <= 14) {
      assert.ok(near(stripInked[f], wantInk[f - 12]), `strip: ink float ${f} is the world ink`);
      assert.ok(near(stripPlain[f], wantTint[f - 12]), `strip: world-less ink float ${f} is the dealt tint`);
    } else {
      assert.strictEqual(stripInked[f], stripPlain[f], `strip: float ${f} (UV window, accent, …) identical`);
    }
  }

  // the stills bake keys cells by combo (asset|ink|accent): the packer's cell
  // lookup carries the EFFECTIVE ink, so under a world a stroke-only instance
  // finds the cell baked in the world's ink (glDriver bakes it there) — and
  // without that bake it is skipped whole (Spine B), never drawn dealt.
  const comboCells = Object.fromEntries([
    [`geo_circle_02|${INK}|${ACCENT}`, cell],
    ...assets.slice(1).map((a) => [`${a}|${TINT}|${ACCENT}`, cell]),
  ]);
  const comboInked = packInstanceData(list, comboCells, 1, { motionTime: 0, shed: false, ink: INK });
  assert.strictEqual(comboInked.length, list.length * INSTANCE_STRIDE, 'inked frame: every instance finds its cell');
  for (let c = 0; c < 3; c++)
    assert.ok(near(comboInked[12 + c], wantInk[c]), 'inked frame: the stroke-only instance packs the world ink');
  const comboPlain = packInstanceData(list, comboCells, 1, { motionTime: 0, shed: false });
  assert.strictEqual(
    comboPlain.length,
    (list.length - 1) * INSTANCE_STRIDE,
    'world-less frame: the ink-baked combo is not a dealt cell — the stroke-only instance waits for its own bake',
  );
}

// ── the pattern seam (Q4) ────────────────────────────────────────────────
{
  const pal = getCatalogPalette('praystation');
  const block = { mode: 'GLYPH', seed: 1234, density: 6, mix: 0.5, drift: 0, kin: 'OFF', movers: 0 };
  const W = 240;
  const H = 200;

  const grid = assignGlyph(block.seed, block.density, block.mix, patternPalette(pal));
  const strokeTiles = grid.tiles.map((t, i) => (isStrokeOnlyOps(t.ops) ? i : -1)).filter((i) => i >= 0);
  assert.ok(strokeTiles.length >= 2, `fixture: the board holds stroke-only tiles (got ${strokeTiles.length})`);
  const strokeSet = new Set(strokeTiles);

  const base = patternPixels(block, pal, W, H, 0);
  const inked = patternPixels(block, pal, W, H, 0, null, null, INK);
  assert.strictEqual(inked.length, base.length);
  assert.notDeepStrictEqual(inked, base, 'a standing world’s ink visibly moves the board');

  const inkRgba = toRgba(INK);
  const { tile, x0, y0 } = glyphLayout(grid, W, H);
  let changed = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = y * W + x;
      if (inked[px] === base[px]) continue;
      changed++;
      assert.strictEqual(inked[px], inkRgba, `pixel ${x},${y}: a changed pixel is the world ink, nothing else`);
      const c = Math.floor((x + 0.5 - x0) / tile);
      const r = Math.floor((y + 0.5 - y0) / tile);
      assert.ok(
        c >= 0 && c < grid.cols && r >= 0 && r < grid.rows,
        `pixel ${x},${y}: changed pixels stay on the board`,
      );
      assert.ok(strokeSet.has(r * grid.cols + c), `pixel ${x},${y}: changed pixels live only in stroke-only tiles`);
    }
  }
  assert.ok(changed > 0, 'at least one line pixel took the ink');

  // keys: the ink keys apart only while it rides; the world-less key is the pre-ink key
  assert.strictEqual(
    patternKey(block, pal, W, H, 0),
    patternKey(block, pal, W, H, 0, null, null, 0),
    'no ink: the pre-ink key',
  );
  assert.notStrictEqual(
    patternKey(block, pal, W, H, 0, null, null, 0, INK),
    patternKey(block, pal, W, H, 0),
    'an ink rides its key apart',
  );
  const frames = createPatternFrames();
  const fInk = frames.frame(block, pal, W, H, 0, null, null, 0, INK);
  assert.strictEqual(
    fInk.key,
    patternKey(block, pal, W, H, 0, null, null, 0, INK),
    'frame key and patternKey agree under ink',
  );
  assert.deepStrictEqual(fInk.pixels, inked, 'the frame source and patternPixels draw the same inked board');
  const fPlain = frames.frame(block, pal, W, H, 0);
  assert.strictEqual(fPlain.key, patternKey(block, pal, W, H, 0), 'the same source, world-less, keys as before');
  assert.deepStrictEqual(fPlain.pixels, base, 'the same source, world-less, draws the dealt board byte for byte');

  // other modes carry no stroke painting: the ink reaches nothing there
  const field = { mode: 'FIELD', seed: 99, density: 5, mix: 0.5, drift: 0, kin: 'OFF', movers: 0 };
  assert.deepStrictEqual(
    patternPixels(field, pal, W, H, 0, null, null, INK),
    patternPixels(field, pal, W, H, 0),
    'FIELD: colour cells are fills — the ink changes nothing',
  );
}

console.log('worldInk.selfcheck: OK');
