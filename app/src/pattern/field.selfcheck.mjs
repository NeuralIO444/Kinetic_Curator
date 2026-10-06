// field.selfcheck.mjs — FIELD mode (#1039): the ten patterns are proven periodic
// on a torus BEFORE anything else shares the draw list, then determinism,
// palette conformance, the 3-hue cap, pan, and SHUFFLE latency.
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { FIELD_PATTERNS, samplePattern, patternParams } from './field.js';
import {
  assign, rasterField, hash32, panAngle, panOffset, paletteRoles, parseHex, toRgba,
  FIELD_PAN_TILES_PER_S,
} from './engine.js';
import { mkRng } from '../engine/prng.js';
import { PALETTES } from '../data/palettes.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const PAL = { swatches: ['#ff2d6f', '#00d9ff', '#ffd400', '#ff6b00', '#00ff88', '#b400ff', '#f0f0e8', '#0a0a0a'] };
const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 31337, 0xdeadbeef, 0xffffffff];
const fr = (x) => x - Math.floor(x);

// Params for a pattern from a seed sweep, so parameter variation is covered.
const paramSets = (name) => SEEDS.map((s) => patternParams(name, mkRng(hash32(s, 17))));

// ── the gate: torus proof, per pattern ──────────────────────────────────────
for (const name of FIELD_PATTERNS) {
  ok(`${name}: period 1 on both axes (analytic, unwrapped coordinates)`, () => {
    for (const p of paramSets(name)) {
      for (const S of [64, 128]) {
        for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
          const x = (i + 0.5) / S; const y = (j + 0.5) / S;
          const base = samplePattern(name, x, y, p);
          assert.equal(samplePattern(name, x + 1, y, p), base, `${name} x+1 @${i},${j}`);
          assert.equal(samplePattern(name, x, y + 1, p), base, `${name} y+1 @${i},${j}`);
          assert.equal(samplePattern(name, x - 2, y + 3, p), base, `${name} (-2,+3) @${i},${j}`);
        }
      }
    }
  });

  ok(`${name}: raster edges wrap — right = left, bottom = top, at 1x and 2x, diff 0`, () => {
    for (const p of paramSets(name)) {
      for (const S of [48, 96, 37, 74, 60, 120]) { // 1x and 2x tile size, plus sizes that are not powers of two
        const W = S * 2;
        const px = (i, j) => samplePattern(name, (i + 0.5) / S, (j + 0.5) / S, p); // a 2x2 block of the SAME tile
        for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
          // sampling convention: pixel i = S-1 and the next tile's i = 0 continue the phase, not duplicate it
          const analytic = samplePattern(name, fr((i + 0.5) / S), fr((j + 0.5) / S), p);
          assert.equal(px(i, j), analytic, `${name} raster != analytic wrapped @${i},${j} S=${S}`);
          if (i >= S) assert.equal(px(i, j), px(i - S, j), `${name} right edge != left @${i},${j}`);
          if (j >= S) assert.equal(px(i, j), px(i, j - S), `${name} bottom != top @${i},${j}`);
        }
      }
    }
  });
}

ok('RAY BURST is in the torus gate and is a lattice, not one corner', () => {
  assert.ok(FIELD_PATTERNS.includes('rayBurst'));
  // a burst at every lattice point: the pattern at the four tile corners is identical
  for (const p of paramSets('rayBurst')) {
    const e = 1e-6;
    const near = (x, y) => samplePattern('rayBurst', x, y, p);
    const corners = [near(e, e), near(1 - e, e), near(e, 1 - e), near(1 - e, 1 - e)];
    assert.ok(corners.every((c) => c !== 0 || corners.every((d) => d === 0)), 'every corner carries the burst');
  }
});

ok('every pattern is covered and none is a placeholder', () => {
  assert.equal(FIELD_PATTERNS.length, 10);
  assert.equal(new Set(FIELD_PATTERNS).size, 10);
  for (const name of FIELD_PATTERNS) {
    const seen = new Set();
    for (const p of paramSets(name)) for (let k = 0; k < 400; k++) seen.add(samplePattern(name, fr(k * 0.6180339887), fr(k * 0.7548776662), p));
    assert.ok(seen.size >= 2, `${name} draws at least two colors`);
    assert.ok([...seen].every((i) => i === 0 || i === 1 || i === 2), `${name} only returns 0/1/2`);
  }
});

// ── determinism ─────────────────────────────────────────────────────────────
const frameHash = (seed, density, mix, t = 0, drift = 0) => {
  const rows = density; const bw = 128;
  const grid = assign(seed, density, mix, PAL, rows);
  const buf = new Uint32Array(bw * bw);
  rasterField(buf, bw, bw, grid, bw / density, panOffset(seed, drift, t));
  return createHash('sha256').update(Buffer.from(buf.buffer)).digest('hex');
};

ok('same SEED + params at DRIFT 0 = a byte-identical frame, at any time t', () => {
  for (const seed of SEEDS) {
    const a = frameHash(seed, 6, 0.55, 0);
    assert.equal(frameHash(seed, 6, 0.55, 0), a);
    assert.equal(frameHash(seed, 6, 0.55, 123.4), a, 'DRIFT 0 does not move');
  }
  assert.notEqual(frameHash(1, 6, 0.55), frameHash(2, 6, 0.55), 'a different seed is a different frame');
  assert.notEqual(frameHash(1, 6, 0.55), frameHash(1, 6, 0.9), 'MIX changes the assignment');
});

ok('assign is a pure function of its inputs', () => {
  const a = assign(77, 8, 0.4, PAL); const b = assign(77, 8, 0.4, PAL);
  assert.deepEqual(a, b);
  assert.equal(a.tiles.length, 64);
});

// ── palette conformance + hue cap ───────────────────────────────────────────
ok('every fill is a palette color; each tile uses at most 3 hues', () => {
  for (const pal of [PAL, ...PALETTES.slice(0, 12)]) {
    const allowed = new Set(pal.swatches);
    for (const seed of SEEDS) {
      const g = assign(seed, 8, 0.7, pal);
      for (const t of g.tiles) {
        assert.ok(t.colors.length === 3 && new Set(t.colors).size <= 3);
        for (const c of t.colors) assert.ok(allowed.has(c), `${c} is not in the palette`);
      }
      const bw = 96; const buf = new Uint32Array(bw * bw);
      rasterField(buf, bw, bw, assign(seed, 4, 0.7, pal, 4), bw / 4);
      const ok32 = new Set(pal.swatches.map(toRgba));
      for (const v of buf) assert.ok(ok32.has(v), 'a pixel is not a palette color');
    }
  }
});

ok('ground is the darkest swatch', () => {
  assert.equal(paletteRoles(PAL).ground, '#0a0a0a');
  for (const pal of PALETTES) {
    const { ground } = paletteRoles(pal);
    const L = (c) => { const [r, g, b] = parseHex(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    assert.ok(pal.swatches.every((c) => L(ground) <= L(c)), pal.id);
  }
});

// ── pan ─────────────────────────────────────────────────────────────────────
ok('pan: zero at DRIFT 0, direction stable per seed, speed linear in DRIFT', () => {
  assert.deepEqual(panOffset(5, 0, 99), { x: 0, y: 0 });
  assert.equal(panAngle(5), panAngle(5));
  assert.notEqual(panAngle(5), panAngle(6));
  const o = panOffset(5, 1, 4);
  assert.ok(Math.abs(Math.hypot(o.x, o.y) - FIELD_PAN_TILES_PER_S * 4) < 1e-12);
  const h = panOffset(5, 0.5, 4);
  assert.ok(Math.abs(Math.hypot(h.x, h.y) - FIELD_PAN_TILES_PER_S * 2) < 1e-12);
});

ok('the whole grid wraps: a pan of exactly one grid period is the same frame', () => {
  const grid = assign(9, 6, 0.6, PAL, 4); const bw = 96; const bh = 64;
  const a = rasterField(new Uint32Array(bw * bh), bw, bh, grid, bw / 6);
  const b = rasterField(new Uint32Array(bw * bh), bw, bh, grid, bw / 6, { x: 6, y: 0 });
  const c = rasterField(new Uint32Array(bw * bh), bw, bh, grid, bw / 6, { x: 0, y: -4 });
  const d = rasterField(new Uint32Array(bw * bh), bw, bh, grid, bw / 6, { x: 12, y: 8 });
  assert.deepEqual(b, a); assert.deepEqual(c, a); assert.deepEqual(d, a);
});

ok('panning mid-frame never opens a hole: every pixel is a tile color', () => {
  const grid = assign(3, 6, 0.8, PAL, 4); const bw = 96; const bh = 64;
  for (const off of [{ x: 0.3, y: 0.7 }, { x: 5.99, y: 3.99 }, { x: -2.5, y: -1.25 }]) {
    const buf = rasterField(new Uint32Array(bw * bh), bw, bh, grid, bw / 6, off);
    const all = new Set(grid.tiles.flatMap((t) => t.rgba));
    for (const v of buf) assert.ok(all.has(v));
  }
});

// ── SHUFFLE latency ─────────────────────────────────────────────────────────
ok('SHUFFLE (assign + one draw) at 8x8 is under 100 ms, with no per-shuffle allocation beyond the assignment', () => {
  const bw = 512; const buf = new Uint32Array(bw * bw);
  const one = (seed) => {
    const t0 = process.hrtime.bigint();
    const g = assign(seed, 8, 0.55, PAL, 8);
    rasterField(buf, bw, bw, g, bw / 8, panOffset(seed, 0.5, 3));
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };
  one(1); one(2); // warm up
  const best = Math.min(one(10), one(11), one(12), one(13));
  console.log(`      shuffle best-of-4: ${best.toFixed(1)} ms (limit 100)`);
  assert.ok(best < 100, `shuffle took ${best.toFixed(1)} ms`);
});

console.log(`field.selfcheck: ${n} checks passed`);
