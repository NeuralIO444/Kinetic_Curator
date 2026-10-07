// quilt.selfcheck.mjs — QUILT mode (#1040): all ten motifs render and none is
// degenerate, the hero lattice holds its rules, grout is an overlay in the
// darkest role on interior seams only, and the frame is a pure function of
// (seed, params, palette).
import assert from 'node:assert';
import { QUILT_MOTIFS, TILE_MOTIFS, HERO_MOTIFS, motifId, sampleQuilt, quiltParams } from './quilt.js';
import {
  assignQuilt, rasterQuilt, quiltColorAt, onGrout, hash32, paletteRoles, parseHex, toRgba,
  QUILT_MAX_GROUT,
} from './engine.js';
import { FIELD_PATTERNS } from './field.js';
import { mkRng } from '../engine/prng.js';
import { PALETTES } from '../data/palettes.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const PAL = { swatches: ['#ff2d6f', '#00d9ff', '#ffd400', '#ff6b00', '#00ff88', '#b400ff', '#f0f0e8', '#0a0a0a'] };
const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 31337, 0xdeadbeef, 0xffffffff];
const DENSITIES = [4, 5, 6, 7, 8, 9, 10, 11, 12];
const lum = (hex) => { const [r, g, b] = parseHex(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const raster = (grid, tileW, grout) => rasterQuilt(new Uint32Array(grid.cols * tileW * grid.rows * tileW), grid.cols * tileW, grid.rows * tileW, grid, tileW, grout);

ok('vocabulary is the spec ten, in order, ids 1–10', () => {
  assert.equal(QUILT_MOTIFS.length, 10);
  assert.deepEqual(QUILT_MOTIFS.map(motifId), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(motifId('cube'), 10);
  assert.ok(!TILE_MOTIFS.includes('cube'), 'cube is never a 1×1 tile');
  assert.deepEqual([...HERO_MOTIFS].sort(), ['cube', 'medallion']);
  assert.ok(TILE_MOTIFS.includes('medallion'), 'medallion is 1×1 or hero');
});

// ── 1) all ten render, none degenerate ──────────────────────────────────────
for (const name of QUILT_MOTIFS) {
  ok(`${name}: not degenerate at 64px (every param set)`, () => {
    for (const s of SEEDS) {
      const p = quiltParams(name, mkRng(hash32(s, 17)));
      const seen = new Set();
      for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) {
        const idx = sampleQuilt(name, (i + 0.5) / 64, (j + 0.5) / 64, p);
        assert.ok(idx === 0 || idx === 1 || idx === 2, `${name} returned ${idx}`);
        seen.add(idx);
      }
      if (name === 'solidBlock') assert.deepEqual([...seen], [1], 'solid block is one flat motif color');
      else assert.ok(seen.size >= 2, `${name} drew a single flat color with ${JSON.stringify(p)}`);
    }
  });
}

ok('all ten motif ids are drawn across a seed sweep (cube arrives via hero)', () => {
  const drawn = new Set();
  for (const s of SEEDS) for (const d of [4, 8, 12]) {
    const g = assignQuilt(s, d, 1, 1, PAL, d);
    g.tiles.forEach((t, i) => { if (g.heroAt[i] === -1) drawn.add(motifId(t.pattern)); });
    g.heroes.forEach((h) => drawn.add(motifId(h.pattern)));
  }
  assert.deepEqual([...drawn].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

ok('a two-color motif never goes flat on a two-swatch palette', () => {
  const two = { swatches: ['#000000', '#ffffff'] };
  for (const s of SEEDS) {
    const g = assignQuilt(s, 8, 1, 1, two, 8);
    for (const t of [...g.tiles, ...g.heroes]) {
      assert.equal(new Set(t.colors).size, 2, 'both swatches are in play');
      if (t.pattern === 'solidBlock') continue;
      const seen = new Set();
      for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) seen.add(t.colors[sampleQuilt(t.pattern, (i + 0.5) / 64, (j + 0.5) / 64, t.params)]);
      assert.equal(seen.size, 2, `${t.pattern} went flat on a two-swatch palette`);
    }
  }
});

// ── 2) hero lattice ─────────────────────────────────────────────────────────
ok('heroes: even anchors, in frame, no overlap, no edge or corner touch, count ≤ floor(cols/4)', () => {
  let total = 0;
  for (const s of SEEDS) for (const d of DENSITIES) for (const rows of [d, Math.ceil(d * 0.7), d + 1]) {
    const g = assignQuilt(s, d, 0.55, 1, PAL, rows);
    assert.ok(g.heroes.length <= Math.floor(d / 4), `density ${d}: ${g.heroes.length} heroes`);
    total += g.heroes.length;
    g.heroes.forEach((h, i) => {
      assert.ok(h.c % 2 === 0 && h.r % 2 === 0, 'hero anchors on the coarser lattice');
      assert.ok(h.c + 1 < g.cols && h.r + 1 < g.rows, 'a hero never hangs off the grid');
      assert.ok(HERO_MOTIFS.includes(h.pattern));
      g.heroes.forEach((q, j) => {
        if (j <= i) return;
        // cell rects [c, c+2) × [r, r+2): touching by edge or corner means the gap is 0 on both axes
        const gapC = Math.max(h.c, q.c) - (Math.min(h.c, q.c) + 2);
        const gapR = Math.max(h.r, q.r) - (Math.min(h.r, q.r) + 2);
        assert.ok(gapC > 0 || gapR > 0, `heroes ${i} and ${j} touch or overlap (seed ${s}, density ${d})`);
      });
    });
    // heroAt agrees with the hero list
    const cells = new Map();
    g.heroAt.forEach((hi, idx) => { if (hi !== -1) cells.set(hi, (cells.get(hi) || 0) + 1); });
    assert.equal(cells.size, g.heroes.length);
    for (const c of cells.values()) assert.equal(c, 4, 'a hero covers exactly four cells');
  }
  assert.ok(total > 0, 'HERO 100% places heroes somewhere in the sweep');
});

ok('HERO 0 places none; the cap binds at HERO 100', () => {
  let capped = 0;
  for (const s of SEEDS) {
    assert.equal(assignQuilt(s, 12, 0.55, 0, PAL, 12).heroes.length, 0);
    if (assignQuilt(s, 12, 0.55, 1, PAL, 12).heroes.length === 3) capped += 1;
  }
  assert.ok(capped > 0, 'density 12 reaches floor(12/4) = 3 heroes for some seed');
  for (const s of SEEDS) assert.equal(assignQuilt(s, 3, 0.55, 1, PAL, 3).heroes.length, 0, 'density < 4 has no room for a hero');
});

ok('a hero draws ONE motif at 2×, not four tiles', () => {
  const g = assignQuilt(7, 8, 0.55, 1, PAL, 8);
  assert.ok(g.heroes.length > 0);
  const h = g.heroes[0];
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
    const u = (i + 0.5) / 32; const v = (j + 0.5) / 32;
    assert.equal(quiltColorAt(g, h.c + u * 2, h.r + v * 2, 0), h.colors[sampleQuilt(h.pattern, u, v, h.params)]);
  }
});

// ── 3) + 4) grout ───────────────────────────────────────────────────────────
ok('grout color is the darkest role, on several palettes', () => {
  for (const pal of [PAL, ...PALETTES.slice(0, 12)]) {
    const g = assignQuilt(42, 8, 0.55, 0.25, pal, 8);
    const { ground } = paletteRoles(pal);
    const all = [ground, ...paletteRoles(pal).brights];
    assert.equal(lum(ground), Math.min(...all.map(lum)), 'ground is the min-luminance swatch');
    assert.equal(g.ground, ground);
    // a point on an interior seam that is not inside a hero
    let hit = 0;
    for (let k = 1; k < g.cols; k++) for (let r = 0; r < g.rows; r++) {
      if (!onGrout(g, k, r + 0.5, 0.05)) continue;
      assert.equal(quiltColorAt(g, k, r + 0.5, 0.05), ground);
      hit += 1;
    }
    assert.ok(hit > 0);
  }
});

ok('grout is an overlay: pixels outside the bands are identical at GROUT 0 and GROUT > 0', () => {
  for (const s of SEEDS.slice(0, 5)) for (const grout of [0.03, 0.08]) {
    const g = assignQuilt(s, 8, 0.55, 0.6, PAL, 6);
    const T = 40; const bw = g.cols * T;
    const a = raster(g, T, 0); const b = raster(g, T, grout);
    let inBand = 0;
    for (let i = 0; i < a.length; i++) {
      const X = ((i % bw) + 0.5) / T; const Y = (Math.floor(i / bw) + 0.5) / T;
      if (onGrout(g, X, Y, grout)) { inBand += 1; assert.equal(b[i], g.groundRgba, 'band pixel is the ground color'); }
      else assert.equal(b[i], a[i], `pixel ${i} outside the grout band changed`);
    }
    assert.ok(inBand > 0, 'the grout drew something');
  }
});

ok('grout: interior seams only, width = GROUT × tile, none inside a hero, capped at 8%', () => {
  const g = assignQuilt(7, 8, 0.55, 1, PAL, 8);
  for (let r = 0; r < g.rows; r++) {
    assert.ok(!onGrout(g, 0.001, r + 0.5, 0.08), 'no grout on the left frame edge');
    assert.ok(!onGrout(g, g.cols - 0.001, r + 0.5, 0.08), 'no grout on the right frame edge');
  }
  for (let c = 0; c < g.cols; c++) {
    assert.ok(!onGrout(g, c + 0.5, 0.001, 0.08), 'no grout on the top frame edge');
    assert.ok(!onGrout(g, c + 0.5, g.rows - 0.001, 0.08), 'no grout on the bottom frame edge');
  }
  assert.ok(g.heroes.length > 0);
  for (const h of g.heroes) {
    assert.ok(!onGrout(g, h.c + 1, h.r + 0.5, 0.08) && !onGrout(g, h.c + 1, h.r + 1.5, 0.08), 'no vertical seam inside a hero');
    assert.ok(!onGrout(g, h.c + 0.5, h.r + 1, 0.08) && !onGrout(g, h.c + 1.5, h.r + 1, 0.08), 'no horizontal seam inside a hero');
  }
  // width: centered on the seam, half the fraction either side. Row 1 col seam 1..: pick a non-hero seam.
  let seam = null;
  for (let k = 1; k < g.cols && !seam; k++) for (let r = 0; r < g.rows && !seam; r++) {
    if (g.heroAt[r * g.cols + k - 1] === -1 && g.heroAt[r * g.cols + k] === -1) seam = { k, r };
  }
  assert.ok(seam);
  const y = seam.r + 0.5;
  assert.ok(onGrout(g, seam.k - 0.019, y, 0.04) && onGrout(g, seam.k + 0.019, y, 0.04));
  assert.ok(!onGrout(g, seam.k - 0.021, y, 0.04) && !onGrout(g, seam.k + 0.021, y, 0.04));
  assert.ok(!onGrout(g, seam.k - 0.041, y, 0.5), `GROUT clamps to ${QUILT_MAX_GROUT}`);
  assert.ok(!onGrout(g, seam.k, y, 0), 'GROUT 0 draws nothing');
});

// ── 5) seed stability ───────────────────────────────────────────────────────
ok('same seed + params → zero pixel diff; a new seed changes the frame', () => {
  for (const s of SEEDS) {
    const a = raster(assignQuilt(s, 8, 0.55, 0.25, PAL, 6), 24, 0.03);
    const b = raster(assignQuilt(s, 8, 0.55, 0.25, PAL, 6), 24, 0.03);
    assert.deepEqual(a, b);
    const c = raster(assignQuilt((s + 1) >>> 0, 8, 0.55, 0.25, PAL, 6), 24, 0.03);
    assert.notDeepEqual(a, c);
  }
});

ok('the engine source reads no Math.random and no clock', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['./quilt.js', './engine.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/Math\.random|Date\.now|performance\.now/.test(src), `${f} must be seeded and timeless`);
  }
});

// ── 6) palette conformance ──────────────────────────────────────────────────
ok('every pixel is an exact palette color; a tile carries at most 3 hues', () => {
  for (const pal of [PAL, ...PALETTES.slice(0, 8)]) {
    const allowed = new Set((pal.swatches || []).map(toRgba));
    for (const s of SEEDS.slice(0, 4)) {
      const g = assignQuilt(s, 8, 1, 1, pal, 6);
      for (const t of [...g.tiles, ...g.heroes]) {
        assert.ok(new Set(t.colors).size <= 3);
        for (const c of t.colors) assert.ok(pal.swatches.includes(c), `${c} is not in the palette`);
      }
      for (const px of raster(g, 16, 0.05)) assert.ok(allowed.has(px), 'pixel is not a palette color');
    }
  }
});

// ── 7) MIX isolation ────────────────────────────────────────────────────────
ok('MIX 0 and 100: every motif is quilt vocabulary 1–10, never glyph or field', () => {
  for (const mix of [0, 0.5, 1]) for (const s of SEEDS) {
    const g = assignQuilt(s, 8, mix, 1, PAL, 8);
    for (const t of [...g.tiles, ...g.heroes]) {
      const id = motifId(t.pattern);
      assert.ok(id >= 1 && id <= 10, `${t.pattern} is not a quilt motif`);
      assert.ok(!FIELD_PATTERNS.includes(t.pattern), 'no field motif leaks into the quilt');
    }
    g.tiles.forEach((t) => assert.notEqual(t.pattern, 'cube', 'cube never lands on a 1×1 tile'));
  }
});

ok('MIX 0 is a two-motif checkerboard (bar the #1042 quota tile); MIX 100 uses the wider vocabulary', () => {
  for (const s of SEEDS) {
    const g = assignQuilt(s, 8, 0, 0, PAL, 8);
    const even = new Map(); const odd = new Map();
    g.tiles.forEach((t, i) => {
      const m = (((i % g.cols) + Math.floor(i / g.cols)) % 2 === 0) ? even : odd;
      m.set(t.pattern, (m.get(t.pattern) || 0) + 1);
    });
    // the never-static quota may replace at most one tile per run of 16 (tail included) with a pinwheel or medallion
    const rhythm = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const evenM = rhythm(even); const oddM = rhythm(odd);
    assert.notEqual(evenM, oddM, 'the rhythm alternates two different motifs');
    const strays = g.tiles.filter((t, i) => t.pattern !== ((((i % g.cols) + Math.floor(i / g.cols)) % 2 === 0) ? evenM : oddM));
    assert.ok(strays.length <= Math.ceil(g.tiles.length / 16), `${strays.length} tiles break the rhythm`);
    for (const t of strays) assert.ok(['pinwheel', 'medallion'].includes(t.pattern), `${t.pattern} is not a quota tile`);
    assert.ok(new Set(assignQuilt(s, 8, 1, 0, PAL, 8).tiles.map((t) => t.pattern)).size > 4);
  }
});

console.log(`quilt.selfcheck: ${n} checks passed`);
