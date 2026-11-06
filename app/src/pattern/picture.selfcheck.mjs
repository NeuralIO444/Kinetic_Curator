// picture.selfcheck.mjs — PATTERN PICTURE: an image sampled into a grid of shapes (#1795).
//
// What the issue asks, as checks:
//   an image sampled into a grid (existing density controls); each cell drawn with a shape from the pool
//   (GLYPH's thirteen constructed marks — the pattern engine's rasterizable pool); the cell's tone driving
//   the shape's SCALE (primary), ROTATION (quarter-turn pose by tone band) and COLOUR (snapped to the
//   active palette — every painted colour is an exact palette string); seed-deterministic like every
//   pattern mode (replay law: same seed + same image + same settings = identical field); DRIFT, the DROP
//   gate's shuffle and per-element kinemes ridden, not reinvented; a cost tier declared at registration.
import assert from 'node:assert';
import {
  assignPicture,
  rasterPicture,
  rasterPictureReference,
  pictureMoverMap,
  samplePictureCells,
  pictureScale,
  picturePose,
  pictureCols,
  normalizePictureImage,
  PICTURE_SEED_IMAGE,
  PICTURE_SCALE_MIN,
  PICTURE_SCALE_MAX,
} from './picture.js';
import { GLYPH_MARKS, POSES } from './glyph.js';
import { createPatternFrames, patternPixels, patternKey } from './patternSource.js';
import { patternGround } from './ground.js';
import { dealPattern } from './patternRoll.js';
import { toRgba, glyphRoles, parseHex } from './engine.js';
import { PATTERN_MODES, PATTERN_DEAL_MODES, defaultPattern, sanitizePattern } from '../state/patternTrack.js';
import { getCostTier } from '../engine/kernel/costRegistry.mjs';
import { PALETTES, resolvePalette } from '../data/palettes.js';
import { mkRng } from '../engine/prng.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const PAL_ID = Object.keys(PALETTES).find((k) => (PALETTES[k].swatches || []).length >= 4) || Object.keys(PALETTES)[0];
const PAL = resolvePalette(PAL_ID, null, []);
const W = 400;
const H = 280;
const block = (over = {}) => sanitizePattern({ ...defaultPattern('PICTURE', 0x1795), ...over });

/** A synthetic still: a w×h RGB image from a per-pixel function. */
const synth = (id, w, h, fn) => {
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const o = (y * w + x) * 3;
      rgb[o] = r;
      rgb[o + 1] = g;
      rgb[o + 2] = b;
    }
  }
  return { id, w, h, rgb };
};
const HALF = synth('test:half', 40, 28, (x) => (x < 20 ? [0, 0, 0] : [255, 255, 255]));
const RAMP = synth('test:ramp', 40, 28, (x) => {
  const v = Math.floor((x / 40) * 4) * 85;
  return [v, v, v];
});

ok('PICTURE is a pattern mode the editor offers, opening at 20 cells across; KIN/CURATOR do not deal it', () => {
  assert.ok(PATTERN_MODES.includes('PICTURE'));
  assert.ok(!PATTERN_DEAL_MODES.includes('PICTURE'), 'hand-picked only (parked library work)');
  assert.deepEqual(PATTERN_DEAL_MODES, ['QUILT', 'GLYPH', 'FIELD'], 'existing seeded deals are unchanged');
  const rng = mkRng(7);
  for (let i = 0; i < 400; i++) assert.notEqual(dealPattern(block(), rng).mode, 'PICTURE');
  assert.equal(pictureCols(block().density), 20);
  assert.equal(pictureCols(4), 8);
  assert.equal(pictureCols(12), 24);
  assert.equal(defaultPattern('PICTURE').density, 10);
  assert.equal(defaultPattern('PICTURE').mix, 0.55);
});

ok('cost tier declared at registration: tier 0 (CPU raster, never shed), with a time estimate', () => {
  const d = getCostTier('pattern/picture');
  assert.ok(d, 'pattern/picture is registered');
  assert.equal(d.tier, 0);
  assert.ok(d.timeMs > 0 && /1795/.test(d.notes));
});

ok('the bundled seed picture is a real image grid, and junk images fall back to it', () => {
  assert.equal(PICTURE_SEED_IMAGE.w, 64);
  assert.equal(PICTURE_SEED_IMAGE.h, 48);
  assert.equal(PICTURE_SEED_IMAGE.rgb.length, 64 * 48 * 3);
  assert.ok(new Set(PICTURE_SEED_IMAGE.rgb).size > 32, 'the seed is a photograph, not a flat fill');
  assert.equal(normalizePictureImage(null), PICTURE_SEED_IMAGE);
  assert.equal(normalizePictureImage({ w: 2, h: 2, rgb: new Uint8Array(3) }), PICTURE_SEED_IMAGE, 'short pixels: seed');
  const mine = { id: 'x', w: 2, h: 2, rgb: new Uint8Array(12) };
  assert.equal(normalizePictureImage(mine).id, 'x');
  assert.equal(
    normalizePictureImage({ w: 2, h: 2, rgb: new Uint8Array(12) }).id,
    'custom',
    'pixels without an id share one',
  );
});

ok('the sampler: cover-fit mean colours — a half-black image samples to exact 0 and 1 tones', () => {
  const cells = samplePictureCells(HALF, 20, 14);
  assert.equal(cells.length, 20 * 14);
  for (let r = 0; r < 14; r++) {
    for (let c = 0; c < 20; c++) {
      const s = cells[r * 20 + c];
      if (c < 10) assert.ok(Math.abs(s.tone) < 1e-9, `dark cell ${c},${r} tone ${s.tone}`);
      else assert.ok(Math.abs(s.tone - 1) < 1e-9, `bright cell ${c},${r} tone ${s.tone}`);
    }
  }
  // deterministic, and a grid finer than the source still samples (nearest fallback)
  assert.deepEqual(samplePictureCells(HALF, 20, 14), cells);
  assert.equal(samplePictureCells(HALF, 80, 56).length, 80 * 56);
});

ok('tone → scale: linear between the signed endpoints, monotone across a grey ramp', () => {
  assert.equal(pictureScale(0), PICTURE_SCALE_MIN);
  assert.equal(pictureScale(1), PICTURE_SCALE_MAX);
  assert.ok(
    Math.abs(pictureScale(0.5) - (PICTURE_SCALE_MIN + PICTURE_SCALE_MAX) / 2) < 1e-12,
    'the midpoint is the midpoint',
  );
  const g = assignPicture(3, 10, 0.55, PAL, 14, RAMP);
  const byBand = [[], [], [], []];
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++)
      byBand[Math.min(3, Math.floor((c / g.cols) * 4))].push(g.tiles[r * g.cols + c].scale);
  for (let b = 0; b < 4; b++) {
    assert.ok(byBand[b].length > 0);
    if (b > 0) assert.ok(byBand[b][0] > byBand[b - 1][0], `band ${b} scales above band ${b - 1}`);
  }
  assert.ok(Math.abs(byBand[0][0] - PICTURE_SCALE_MIN) < 0.02, 'the black band sits at the scale floor');
  assert.ok(byBand[3][0] > PICTURE_SCALE_MAX - 0.35, 'the white band nears the scale ceiling');
  // and the assignment carries the sampler's tone verbatim
  const s = samplePictureCells(RAMP, g.cols, g.rows);
  g.tiles.forEach((tl, i) => assert.equal(tl.tone, s[i].tone));
});

ok('tone → rotation: the four tone bands take the four quarter-turn poses', () => {
  const poses = [0.1, 0.35, 0.6, 0.85].map((tone) => picturePose(tone, 0));
  assert.deepEqual(poses, [...POSES], 'band by band, the poses walk the quarter turns in order');
  assert.deepEqual(
    new Set([0.1, 0.35, 0.6, 0.85].map((tone) => picturePose(tone, 2))).size,
    4,
    'a seed offset still gives four distinct poses',
  );
  const g = assignPicture(3, 10, 0.55, PAL, 14, RAMP);
  const seen = new Set(g.tiles.map((tl) => tl.pose));
  assert.equal(seen.size, 4, 'a full-range picture poses its marks all four ways');
  for (const tl of g.tiles) assert.ok(POSES.includes(tl.pose));
});

ok('palette snap: a cell colour becomes the NEAREST pool swatch; every painted colour is a palette string', () => {
  const snapPal = { swatches: ['#101010', '#e02020', '#2040e0', '#e0e020', '#20c060'], bg: '#101010', ink: '#ffffff' };
  const { ground, pool } = glyphRoles(snapPal);
  assert.equal(ground, '#101010');
  const px = (hex) => parseHex(hex);
  const nearestOf = (rgb) =>
    pool.reduce((best, c) => {
      const d = (px(c)[0] - rgb[0]) ** 2 + (px(c)[1] - rgb[1]) ** 2 + (px(c)[2] - rgb[2]) ** 2;
      return !best || d < best.d ? { c, d } : best;
    }, null).c;
  const red = synth('test:red', 8, 8, () => [255, 0, 0]);
  const blue = synth('test:blue', 8, 8, () => [30, 60, 255]);
  const white = synth('test:white', 8, 8, () => [255, 255, 255]);
  for (const [img, rgb] of [
    [red, [255, 0, 0]],
    [blue, [30, 60, 255]],
    [white, [255, 255, 255]],
  ]) {
    const g = assignPicture(5, 10, 0.55, snapPal, 14, img);
    for (const tl of g.tiles) {
      assert.equal(tl.roles.mark, nearestOf(rgb), 'MARK is the nearest pool swatch to the cell colour');
      assert.ok(pool.includes(tl.roles.cut) && pool.includes(tl.roles.accent), 'CUT / ACCENT are pool swatches too');
      assert.notEqual(tl.roles.cut, tl.roles.mark, 'CUT differs from MARK while the pool offers another');
    }
  }
  assert.equal(
    assignPicture(5, 10, 0.55, snapPal, 14, red).tiles[0].roles.mark,
    '#e02020',
    'a red cell snaps to the red swatch',
  );
  // pixel-level: a frame contains palette colours only, in any palette
  const allowed = new Set(PAL.swatches.map(toRgba));
  for (const img of [undefined, HALF, RAMP]) {
    const frame = patternPixels(block(), PAL, W, H, 0, img);
    for (let i = 0; i < frame.length; i++) assert.ok(allowed.has(frame[i]), `pixel ${i} is off-palette`);
  }
});

ok("pool sourcing: every cell's shape is one of GLYPH's thirteen marks; MIX is mark entropy over them", () => {
  const g = assignPicture(9, 10, 0.55, PAL, 14, HALF);
  for (const tl of g.tiles) {
    assert.ok(GLYPH_MARKS.includes(tl.mark), `${tl.mark} is in the mark pool`);
    assert.ok(tl.ops.length > 0, 'every mark is drawn (no empty cells)');
  }
  const still = assignPicture(9, 10, 0, PAL, 14, HALF);
  assert.ok(
    still.tiles.every((tl) => tl.mark === still.hero),
    'MIX 0: the whole picture is the one hero mark',
  );
  const free = assignPicture(9, 10, 1, PAL, 14, HALF);
  assert.ok(new Set(free.tiles.map((tl) => tl.mark)).size >= 5, 'MIX 1: the cells draw freely from the pool');
  assert.ok(GLYPH_MARKS.includes(still.hero));
});

ok(
  'replay law: same seed + image + settings = identical field; seed or image changes it; DRIFT 0 is one still frame',
  () => {
    const a = patternPixels(block({ drift: 0.5 }), PAL, W, H, 2.25);
    const b = patternPixels(block({ drift: 0.5 }), PAL, W, H, 2.25);
    assert.deepEqual(a, b);
    assert.notDeepEqual(
      a,
      patternPixels(block({ drift: 0.5, seed: 0xabc }), PAL, W, H, 2.25),
      'another seed, another dealing of the marks',
    );
    assert.notDeepEqual(
      patternPixels(block(), PAL, W, H, 0, HALF),
      patternPixels(block(), PAL, W, H, 0, RAMP),
      'another image, another picture',
    );
    assert.deepEqual(
      patternPixels(block(), PAL, W, H, 0, HALF),
      patternPixels(block(), PAL, W, H, 0, HALF),
      'the same image twice is the same field',
    );
    const s0 = patternPixels(block({ drift: 0 }), PAL, W, H, 0);
    assert.deepEqual(s0, patternPixels(block({ drift: 0 }), PAL, W, H, 9.5), 'DRIFT 0 ignores the clock');
    assert.equal(patternKey(block(), PAL, W, H, 0), patternKey(block(), PAL, W, H, 99), 'and caches as a still');
    assert.notEqual(
      patternKey(block(), PAL, W, H, 0, HALF),
      patternKey(block(), PAL, W, H, 0, RAMP),
      'the image is in the frame key',
    );
    assert.equal(
      patternKey(block(), PAL, W, H, 0),
      patternKey(block(), PAL, W, H, 0, PICTURE_SEED_IMAGE),
      'no image = the seed image',
    );
    const m1 = patternPixels(block({ drift: 0.5, kin: 'OFF' }), PAL, W, H, 1);
    const m2 = patternPixels(block({ drift: 0.5, kin: 'OFF' }), PAL, W, H, 1.5);
    assert.notDeepEqual(m1, m2, 'DRIFT above 0: the pulse moves the marks');
  },
);

ok('the fast raster is the reference raster, pixel for pixel — stills, pulses and kineme movers alike', () => {
  const g = assignPicture(0x1795, 10, 0.55, PAL, 14, HALF);
  const cases = [
    [0, 0, null],
    [0.7, 2.3, null],
    [0.7, 2.3, pictureMoverMap(g, 0x1795, 'SPIN', 1)],
    [1, 0.4, pictureMoverMap(g, 0x1795, 'MIX', 0.6)],
    [0.9, 5.1, pictureMoverMap(g, 42, 'BOB', 1)],
  ];
  for (const [drift, t, movers] of cases) {
    const fast = rasterPicture(new Uint32Array(W * H), W, H, g, drift, t, movers);
    const ref = rasterPictureReference(new Uint32Array(W * H), W, H, g, drift, t, movers);
    assert.deepEqual(fast, ref, `drift ${drift} t ${t} movers ${movers ? movers.size : 0}`);
  }
  // through the frame source too: a moving frame equals the stateless reference path
  const frames = createPatternFrames();
  const p = block({ drift: 0.8, kin: 'SPIN', movers: 0.5 });
  const f = frames.frame(p, PAL, W, H, 1.25, HALF);
  const g2 = assignPicture(p.seed, p.density, p.mix, PAL, Math.ceil(H / (W / pictureCols(p.density))), HALF);
  const ref = rasterPictureReference(
    new Uint32Array(W * H),
    W,
    H,
    g2,
    p.drift,
    1.25,
    pictureMoverMap(g2, p.seed, p.kin, p.movers),
  );
  assert.deepEqual(f.pixels, ref);
});

ok('kinemes ride the existing rails: movers change a drifting frame and nothing else', () => {
  const spun = patternPixels(block({ drift: 0.8, kin: 'SPIN', movers: 1 }), PAL, W, H, 1.1);
  const plain = patternPixels(block({ drift: 0.8, kin: 'OFF', movers: 0 }), PAL, W, H, 1.1);
  assert.notDeepEqual(spun, plain, 'a spinning share of the cells turns');
  assert.deepEqual(
    patternPixels(block({ drift: 0, kin: 'SPIN', movers: 1 }), PAL, W, H, 3),
    patternPixels(block({ drift: 0, kin: 'OFF', movers: 0 }), PAL, W, H, 3),
    'at DRIFT 0 the kinemes are still, like every mode',
  );
});

ok('the picture reads: bright cells carry bigger marks than dark cells in the same frame', () => {
  const g = assignPicture(0x1795, 10, 0.55, PAL, 14, HALF);
  const px = rasterPicture(new Uint32Array(W * H), W, H, g, 0, 0);
  const cell = W / g.cols;
  const painted = (c, r) => {
    let count = 0;
    for (let y = Math.floor(r * cell); y < Math.floor((r + 1) * cell); y++)
      for (let x = Math.floor(c * cell); x < Math.floor((c + 1) * cell); x++)
        if (px[y * W + x] !== g.groundRgba) count++;
    return count;
  };
  let dark = 0;
  let bright = 0;
  for (let r = 1; r < 6; r++) {
    dark += painted(2, r);
    bright += painted(17, r);
  }
  assert.ok(bright > dark * 1.5, `bright cells paint ${bright}px of mark against dark cells' ${dark}px`);
});

ok('ground sampler (#1183) agrees with the assignment: at() is the cell’s snapped MARK colour', () => {
  const p = block({ drift: 0.7 });
  const ground = patternGround(p, PAL, W, H);
  const g = assignPicture(p.seed, p.density, p.mix, PAL, Math.ceil(H / (W / pictureCols(p.density))));
  const cell = W / g.cols;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 20; c += 3) {
      const x = (c + 0.5) * cell;
      const y = (r + 0.5) * cell;
      const tl = g.tiles[r * g.cols + c];
      assert.equal(ground.at(x, y, 1), tl.roles.mark, `cell ${c},${r} main colour`);
      const roles = ground.roles(x, y, 1);
      assert.equal(roles[0], tl.roles.mark.toLowerCase(), 'roles lead with the main colour');
      const cellRoles = [tl.roles.mark, tl.roles.accent, tl.roles.cut].map((col) => col.toLowerCase());
      assert.ok(
        roles.every((col) => cellRoles.includes(col)),
        'roles are the cell’s own snapped colours',
      );
    }
  }
  const cl = ground.cell(cell * 2.25, cell * 1.5, 0);
  assert.ok(Math.abs(cl.u - 0.25) < 1e-9 && Math.abs(cl.v - 0.5) < 1e-9 && Math.abs(cl.size - cell) < 1e-9);
});

ok('cost: a moving 1000×700 frame stays inside the declared budget (median of 30)', () => {
  const p = block({ drift: 0.8 });
  const frames = createPatternFrames();
  frames.frame(p, PAL, 1000, 700, 0); // build the grid once, like the live loop does
  const ms = [];
  for (let i = 1; i <= 30; i++) {
    const t0 = performance.now();
    frames.frame(p, PAL, 1000, 700, i / 60);
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  const med = ms[15];
  const declared = getCostTier('pattern/picture').timeMs;
  console.log(`      moving frame 1000×700: median ${med.toFixed(2)} ms (declared ${declared} ms)`);
  // CI machines vary; the gate is generous (4× the declaration), the log line is the honest number
  assert.ok(med < declared * 4, `median ${med.toFixed(2)} ms is far over the ${declared} ms declaration`);
});

console.log(`picture.selfcheck: ${n} checks passed`);
