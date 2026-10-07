// rasterFast.selfcheck.mjs — the fast pattern rasterizers draw EXACTLY the reference pixels (#1101).
//
// DRIFT used to cost 18–40 ms a frame at 1000×700. The three rasterizers were rewritten to avoid per-pixel
// allocation and lookup, and QUILT can repaint only its turning tiles. A speed-up that changes a pixel is a
// bug, so every fast path is compared, pixel for pixel, with the slow reference that IS the spec.
import assert from 'node:assert';
import {
  assign, assignQuilt, assignGlyph,
  rasterField, rasterFieldReference, rasterQuilt, rasterQuiltReference, rasterGlyph, rasterGlyphReference,
  createQuiltRaster, panOffset, quiltMoverMap, glyphMoverMap,
} from './engine.js';
import { createPatternFrames, patternPixels, patternDrawSize, patternBytes, PATTERN_LIVE_MAX_W } from './patternSource.js';
import { GLYPH_MARKS, POSES, buildMark, sampleMark } from './glyph.js';
import { defaultPattern } from '../state/patternTrack.js';
import { PALETTES, resolvePalette } from '../data/palettes.js';
import { mkRng } from '../engine/prng.js';
import { hash32 } from './engine.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const same = (a, b, what) => {
  assert.equal(a.length, b.length, `${what}: length`);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) assert.fail(`${what}: pixel ${i} differs: ${a[i].toString(16)} vs ${b[i].toString(16)}`);
};
const PAL = resolvePalette('praystation', null);
const SEEDS = [1, 7, 42, 31337, 0xdeadbeef];
// awkward sizes on purpose: non-integer tile widths, 16:9, a tall frame, a tiny one
const SIZES = [[1000, 700], [997, 701], [640, 360], [333, 555], [160, 96]];
const alloc = (w, h) => new Uint32Array(w * h);

ok('QUILT: the fast raster is the reference, over seeds × sizes × density × mix × hero × grout × drift × time', () => {
  let frames = 0;
  for (const seed of SEEDS) for (const [w, h] of SIZES) for (const density of [4, 7, 12]) {
    for (const [mix, hero, grout, drift, t] of [[0.55, 0.25, 0.03, 0, 0], [1, 1, 0.08, 0.7, 3.1], [0, 0, 0, 1, 7.7], [0.3, 0.6, 0.05, 0.2, 12.5]]) {
      if (w * h > 400000 && (density === 7 || seed !== 7)) continue; // keep the sweep fast; the big frame still runs for one seed
      const tileW = w / density; const rows = Math.max(1, Math.ceil(h / tileW));
      const grid = assignQuilt(seed, density, mix, hero, PAL, rows);
      const a = alloc(w, h); const b = alloc(w, h);
      rasterQuilt(a, w, h, grid, tileW, grout, drift, t); rasterQuiltReference(b, w, h, grid, tileW, grout, drift, t);
      same(a, b, `quilt seed ${seed} ${w}x${h} d${density} drift ${drift}`);
      frames += 1;
    }
  }
  assert.ok(frames > 150, `${frames} frames compared`);
});

ok('QUILT incremental: repainting only the turning tiles is the full raster, frame after frame, in any order of time', () => {
  let compared = 0;
  for (const seed of SEEDS) for (const [w, h] of [[1000, 700], [997, 701], [333, 555]]) for (const [density, mix, hero, grout] of [[6, 0.55, 0.25, 0.03], [12, 1, 1, 0.08], [4, 0, 0, 0], [9, 0.8, 0.5, 0.05]]) {
    const tileW = w / density; const rows = Math.max(1, Math.ceil(h / tileW));
    const grid = assignQuilt(seed, density, mix, hero, PAL, rows);
    const qr = createQuiltRaster(grid, w, h, tileW, grout);
    assert.ok(qr.movers >= 1, 'the never-static quota guarantees something turns');
    const out = alloc(w, h); const want = alloc(w, h);
    // out of order and repeated: a frame must not depend on the one before it
    for (const [drift, t] of [[1, 0], [1, 5.5], [0.4, 2.2], [1, 5.5], [0, 9], [0.9, 0.01], [1, 123.4]]) {
      qr.draw(out, drift, t);
      rasterQuiltReference(want, w, h, grid, tileW, grout, drift, t);
      same(out, want, `incremental seed ${seed} ${w}x${h} d${density} drift ${drift} t ${t}`);
      compared += 1;
    }
    same(qr.base, rasterQuiltReference(alloc(w, h), w, h, grid, tileW, grout, 0, 0), 'the still picture is never touched by a later frame');
  }
  assert.ok(compared > 300);
});

ok('GLYPH: the culled, per-tile raster is the reference, over seeds × sizes × density × drift × time', () => {
  let frames = 0;
  for (const seed of SEEDS) for (const [w, h] of SIZES) for (const density of [4, 8, 12]) for (const [mix, drift, t] of [[0.55, 0, 0], [1, 1, 2.3], [0, 0.5, 9.9], [0.7, 1, 0.01]]) {
    if (w * h > 400000 && seed !== 7) continue;
    const grid = assignGlyph(seed, density, mix, PAL);
    const a = alloc(w, h); const b = alloc(w, h);
    rasterGlyph(a, w, h, grid, drift, t); rasterGlyphReference(b, w, h, grid, drift, t);
    same(a, b, `glyph seed ${seed} ${w}x${h} d${density} drift ${drift}`);
    frames += 1;
  }
  assert.ok(frames > 120, `${frames} frames`);
});

ok('GLYPH shape culling is conservative: with and without per-shape boxes, every sample of every mark in every pose and scale agrees', () => {
  const S = 96;
  let samples = 0;
  for (const name of GLYPH_MARKS) for (const pose of POSES) for (let k = 0; k < 4; k++) {
    const ops = buildMark(name, mkRng(hash32(11 + k, 3)), pose);
    assert.ok(ops.every((o) => o.bb), `${name}: every op carries a box`);
    const bare = ops.map(({ bb, ...rest }) => rest);
    for (const scale of [0.8, 1, 1.2]) for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = (i + 0.5) / S - 0.5; const y = (j + 0.5) / S - 0.5;
      assert.equal(sampleMark(ops, x, y, scale), sampleMark(bare, x, y, scale), `${name} pose ${pose} scale ${scale} @${i},${j}`);
      samples += 1;
    }
  }
  assert.ok(samples > 1_000_000, `${samples} samples`);
});

ok('FIELD: the hoisted raster is the reference, over seeds × sizes × pan offsets (negative, fractional, huge)', () => {
  let frames = 0;
  for (const seed of SEEDS) for (const [w, h] of SIZES) for (const density of [4, 6, 12]) {
    if (w * h > 400000 && seed !== 7) continue;
    const tileW = w / density; const rows = Math.max(1, Math.ceil(h / tileW));
    const grid = assign(seed, density, 0.55, PAL, rows);
    for (const off of [{ x: 0, y: 0 }, panOffset(seed, 1, 3.7), panOffset(seed, 0.4, 50), { x: -2.5, y: 7.25 }, { x: 1e4 + 0.3, y: -1e4 - 0.7 }]) {
      const a = alloc(w, h); const b = alloc(w, h);
      rasterField(a, w, h, grid, tileW, off); rasterFieldReference(b, w, h, grid, tileW, off);
      same(a, b, `field seed ${seed} ${w}x${h} d${density} off ${JSON.stringify(off)}`);
      frames += 1;
    }
  }
  assert.ok(frames > 150, `${frames} frames`);
});

ok('createPatternFrames: every frame equals the stateless reference path, through changes of mode, seed, size, palette and DRIFT', () => {
  const frames = createPatternFrames();
  const ref = (p, pal, w, h, t) => {
    // the reference: build the grid fresh and use the slow rasterizers
    const tileW = w / p.density; const rows = Math.max(1, Math.ceil(h / tileW)); const b = alloc(w, h);
    if (p.mode === 'GLYPH') { const g = assignGlyph(p.seed, p.density, p.mix, pal); return rasterGlyphReference(b, w, h, g, p.drift, t, glyphMoverMap(g, p.seed, p.kin, p.movers)); }
    if (p.mode === 'FIELD') return rasterFieldReference(b, w, h, assign(p.seed, p.density, p.mix, pal, rows), tileW, panOffset(p.seed, p.drift, t));
    const q = assignQuilt(p.seed, p.density, p.mix, p.hero, pal, rows); // #1137: a new track carries element motion (kin MIX)
    return rasterQuiltReference(b, w, h, q, tileW, p.grout, p.drift, t, quiltMoverMap(q, p.seed, p.kin, p.movers));
  };
  const pal2 = resolvePalette('v01d', null);
  const script = [];
  for (const mode of ['QUILT', 'GLYPH', 'FIELD']) {
    const base = { ...defaultPattern(mode, 9), density: mode === 'GLYPH' ? 4 : 6 };
    script.push([base, PAL, 320, 224, 0], [{ ...base, drift: 0.5 }, PAL, 320, 224, 1.5], [{ ...base, drift: 0.5 }, PAL, 320, 224, 1.516],
      [{ ...base, drift: 0 }, PAL, 320, 224, 9], [{ ...base, drift: 1, seed: 10 }, PAL, 320, 224, 2], [{ ...base, drift: 1, seed: 10 }, pal2, 320, 224, 2.1],
      [{ ...base, drift: 1, seed: 10 }, pal2, 301, 199, 2.2], [{ ...base, drift: 0, seed: 10 }, pal2, 301, 199, 4], [{ ...base, drift: 0, seed: 10 }, pal2, 301, 199, 400]);
  }
  for (const [p, pal, w, h, t] of script) {
    const f = frames.frame(p, pal, w, h, t);
    assert.equal(f.w, w); assert.equal(f.h, h);
    same(f.pixels, ref(p, pal, w, h, t), `${p.mode} drift ${p.drift} seed ${p.seed} ${w}x${h} t ${t}`);
    assert.equal(patternBytes(f).byteLength, w * h * 4);
  }
  // stateless callers get their own copy: they may keep it
  const keep = patternPixels(defaultPattern('QUILT', 9), PAL, 64, 48, 0);
  patternPixels({ ...defaultPattern('QUILT', 9), drift: 1 }, PAL, 64, 48, 3);
  assert.deepEqual(keep, patternPixels(defaultPattern('QUILT', 9), PAL, 64, 48, 0));
});

ok('a still frame is drawn once and handed back untouched; a moving frame never corrupts it', () => {
  const frames = createPatternFrames();
  const still = defaultPattern('QUILT', 5);
  const a = frames.frame(still, PAL, 200, 140, 0);
  const copy = a.pixels.slice();
  frames.frame({ ...still, drift: 1 }, PAL, 200, 140, 3); // a moving frame in between (same picture)
  const b = frames.frame(still, PAL, 200, 140, 77);
  same(b.pixels, copy, 'the still picture survived a moving frame');
  assert.equal(a.key, b.key, 'a still pattern keeps one key, so the renderer uploads it once');
  assert.notEqual(frames.frame({ ...still, drift: 1 }, PAL, 200, 140, 1).key, frames.frame({ ...still, drift: 1 }, PAL, 200, 140, 2).key, 'a moving one is new every frame');
});

ok('a moving pattern is drawn no wider than the scene (1000); a still one at the full target size', () => {
  assert.equal(PATTERN_LIVE_MAX_W, 1000);
  assert.deepEqual(patternDrawSize(0, 3840, 2160), { w: 3840, h: 2160, scaled: false });
  assert.deepEqual(patternDrawSize(0.5, 3840, 2160), { w: 1000, h: 563, scaled: true });
  assert.deepEqual(patternDrawSize(0.5, 1000, 700), { w: 1000, h: 700, scaled: false });
  assert.deepEqual(patternDrawSize(1, 640, 480), { w: 640, h: 480, scaled: false });
  assert.deepEqual(patternDrawSize(0.5, 2000, 700), { w: 1000, h: 350, scaled: true });
  for (const [w, h] of [[1920, 1080], [2560, 1440], [3000, 800]]) { const s = patternDrawSize(0.3, w, h); assert.ok(Math.abs(s.w / s.h - w / h) < 0.02, 'the aspect is kept'); }
});

console.log(`rasterFast.selfcheck: ${n} checks passed`);
