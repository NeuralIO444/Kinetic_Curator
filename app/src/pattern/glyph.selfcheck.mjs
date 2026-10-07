// glyph.selfcheck.mjs — GLYPH mode (#1041): the 5:4 letterboxed board, thirteen
// constructed marks inside the 60% box, the restricted palette, the neighbor
// and quota rules, the DRIFT pulse inside the tile rect, and the 64px read.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  GLYPH_MARKS, FILLED_MARKS, RHYTHM_MARKS, POSES, MARK_BOX, MIN_STROKE,
  markId, buildMark, sampleMark, markBounds, strokeWidths, motifRoles,
} from './glyph.js';
import {
  assignGlyph, rasterGlyph, drawGlyph, glyphGrid, glyphRoles, glyphLayout, glyphScale, hash32, parseHex, toRgba,
  GLYPH_MAX_ROLES, GLYPH_QUOTA_RUN,
} from './engine.js';
import { QUILT_MOTIFS } from './quilt.js';
import { FIELD_PATTERNS } from './field.js';
import { rankedSwatches } from '../data/swatchWeights.js';
import { mkRng } from '../engine/prng.js';
import { PALETTES } from '../data/palettes.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const PAL = PALETTES[0];
const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 31337, 0xdeadbeef, 0xffffffff];
const DENSITIES = [4, 5, 6, 7, 8, 9, 10, 11, 12];
const lum = (hex) => { const [r, g, b] = parseHex(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
// Every variant a mark can take: a sweep of rng streams.
const variants = (name, pose = 0) => SEEDS.flatMap((s) => [0, 1, 2].map((k) => buildMark(name, mkRng(hash32(s, 50 + k)), pose)));
// MARK-on-GROUND binary mask at S px: any painted, non-knockout pixel.
const mask = (ops, S = 64, scale = 1) => {
  const m = new Uint8Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const role = sampleMark(ops, (i + 0.5) / S - 0.5, (j + 0.5) / S - 0.5, scale);
    m[j * S + i] = role && role !== 'ground' ? 1 : 0;
  }
  return m;
};
const area = (m) => m.reduce((a, v) => a + v, 0);

// ── 1) grid ─────────────────────────────────────────────────────────────────
ok('grid: cols = round(5·D/4), rows = D, 5:4, clamped; default is 5×4', () => {
  assert.deepEqual(glyphGrid(4), { cols: 5, rows: 4 });
  assert.deepEqual(glyphGrid(8), { cols: 10, rows: 8 });
  assert.deepEqual(glyphGrid(12), { cols: 15, rows: 12 });
  assert.deepEqual(glyphGrid(undefined), { cols: 5, rows: 4 });
  for (const d of DENSITIES) {
    const g = glyphGrid(d);
    assert.equal(g.cols, Math.round((5 * d) / 4)); assert.equal(g.rows, d);
    assert.ok(Math.abs(g.cols / g.rows - 1.25) <= 0.5 / g.rows + 1e-9, `density ${d} is 5:4 within rounding`);
  }
  assert.deepEqual(glyphGrid(1), { cols: 4, rows: 3 }, 'clamps low (MOD overshoot)');
  assert.deepEqual(glyphGrid(40), { cols: 16, rows: 12 }, 'clamps high (MOD overshoot)');
});

ok('tiles are square, the grid is centered, the letterbox is the ground role', () => {
  for (const [bw, bh] of [[320, 180], [256, 256], [200, 320]]) for (const d of [4, 8, 12]) {
    const g = assignGlyph(7, d, 0.55, PAL);
    const { tile, x0, y0 } = glyphLayout(g, bw, bh);
    assert.ok(Math.abs(tile * g.cols - bw) < 1e-9 || Math.abs(tile * g.rows - bh) < 1e-9, 'the grid fills one axis');
    assert.ok(Math.abs(x0 - (bw - tile * g.cols) / 2) < 1e-9 && Math.abs(y0 - (bh - tile * g.rows) / 2) < 1e-9);
    assert.ok(x0 >= -1e-9 && y0 >= -1e-9, 'the grid never overflows the frame');
    const px = rasterGlyph(new Uint32Array(bw * bh), bw, bh, g, 1, 0.7);
    let bars = 0;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const inGrid = x + 0.5 >= x0 && x + 0.5 < x0 + tile * g.cols && y + 0.5 >= y0 && y + 0.5 < y0 + tile * g.rows;
      if (inGrid) continue;
      bars += 1;
      assert.equal(px[y * bw + x], g.groundRgba, 'letterbox pixel is not the ground role');
    }
    if (bw === 320 && bh === 180) assert.ok(bars > 0, '16:9 pillarboxes');
  }
});

// ── 2) vocabulary, no empties ───────────────────────────────────────────────
ok('vocabulary is the spec thirteen, ids 11–23, sharing nothing with quilt or field', () => {
  assert.equal(GLYPH_MARKS.length, 13);
  assert.deepEqual(GLYPH_MARKS.map(markId), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
  for (const m of GLYPH_MARKS) assert.ok(!QUILT_MOTIFS.includes(m) && !FIELD_PATTERNS.includes(m), `${m} leaks from another mode`);
  assert.deepEqual([...FILLED_MARKS].sort(), ['bolt', 'capsule', 'crossedDisc', 'slab']);
  assert.deepEqual([...RHYTHM_MARKS], ['sunburst', 'crossedDisc']);
  assert.ok(!GLYPH_MARKS.includes('solidBlock'), 'GLYPH has no solid-block mark');
});

ok('a seed sweep draws all thirteen; every tile has a mark from the thirteen; no tile is empty at 64px', () => {
  const drawn = new Set();
  for (const s of SEEDS) for (const d of [4, 8, 12]) for (const mix of [0, 0.55, 1]) {
    const g = assignGlyph(s, d, mix, PAL);
    assert.equal(g.tiles.length, g.cols * g.rows);
    for (const t of g.tiles) {
      assert.ok(GLYPH_MARKS.includes(t.mark), `${t.mark} is not a glyph mark`);
      drawn.add(t.mark);
      assert.ok(area(mask(t.ops)) > 0, `${t.mark} pose ${t.pose} is empty at 64px (seed ${s})`);
    }
  }
  assert.deepEqual([...drawn].sort(), [...GLYPH_MARKS].sort());
});

// ── 3) the 60% box at DRIFT 0 ───────────────────────────────────────────────
for (const name of GLYPH_MARKS) {
  ok(`${name}: inside the 60% box in all 4 poses (analytic bounds with caps, raster cross-check)`, () => {
    for (const pose of POSES) for (const ops of variants(name, pose)) {
      const b = markBounds(ops);
      for (const v of [b.minX, b.maxX, b.minY, b.maxY]) assert.ok(Math.abs(v) < MARK_BOX, `${name} pose ${pose} reaches ${v.toFixed(4)}: it kisses or leaves the box`);
      // raster cross-check, AA off: no painted pixel center at or beyond ±0.30, and the
      // analytic bounds are not loose (the raster comes within 2px of them)
      const S = 64; let far = 0;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const x = (i + 0.5) / S - 0.5; const y = (j + 0.5) / S - 0.5;
        if (!sampleMark(ops, x, y, 1)) continue;
        far = Math.max(far, Math.abs(x), Math.abs(y));
        assert.ok(x > b.minX - 1e-9 && x < b.maxX + 1e-9 && y > b.minY - 1e-9 && y < b.maxY + 1e-9, `${name} paints outside its analytic bounds`);
      }
      assert.ok(far < MARK_BOX);
      assert.ok(far > Math.max(-b.minX, b.maxX, -b.minY, b.maxY) - 2.5 / S, `${name} analytic bounds are loose`);
    }
  });
}

ok('Sunburst is the signed edit: 12 rays, length 0.16, butt caps, outer reach 0.28', () => {
  const ops = buildMark('sunburst', mkRng(1), 0);
  const rays = ops.filter((o) => o.type === 'seg');
  assert.equal(rays.length, 12);
  for (const r of rays) {
    assert.equal(r.cap, 'butt');
    assert.ok(Math.abs(Math.hypot(r.x2 - r.x1, r.y2 - r.y1) - 0.16) < 1e-9);
    assert.ok(Math.abs(Math.hypot(r.x2, r.y2) - 0.28) < 1e-9);
  }
  // the spec's original 0.18 with round caps would reach 0.3075 and fail the box
  assert.ok(0.12 + 0.18 + 0.0075 > MARK_BOX);
  assert.match(readFileSync(new URL('../../../docs/PATTERN_SPEC.md', import.meta.url), 'utf8'), /\| Sunburst \|[^\n]*length 0\.16[^\n]*butt caps/, 'docs/PATTERN_SPEC.md carries the Sunburst edit');
});

// ── 4) tile rect at DRIFT 100% ──────────────────────────────────────────────
ok('DRIFT 100%: scale stays in [0.8, 1.2], one full wave across the grid, and no mark pixel leaves its tile rect', () => {
  const g = assignGlyph(42, 4, 1, PAL);
  const count = g.cols * g.rows;
  let lo = 2; let hi = 0;
  for (let k = 0; k < 64; k++) for (let i = 0; i < count; i++) {
    const s = glyphScale(i, count, 1, (k / 64) * Math.PI * 2);
    lo = Math.min(lo, s); hi = Math.max(hi, s);
    assert.equal(glyphScale(i, count, 0, k), 1, 'DRIFT 0 is static');
  }
  assert.ok(lo >= 0.8 - 1e-9 && hi <= 1.2 + 1e-9 && hi > 1.19 && lo < 0.81);
  assert.ok(Math.abs(glyphScale(count, count, 1, 0.3) - glyphScale(0, count, 1, 0.3)) < 1e-9, 'phase wraps once across the grid');
  // 72% of the tile at the peak, 48% at the trough
  assert.ok(Math.abs(2 * MARK_BOX * 1.2 - 0.72) < 1e-9 && Math.abs(2 * MARK_BOX * 0.8 - 0.48) < 1e-9);
  for (const name of GLYPH_MARKS) for (const pose of POSES) for (const ops of variants(name, pose).slice(0, 6)) {
    for (const scale of [0.8, 1, 1.2]) {
      const S = 64;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const edge = i === 0 || j === 0 || i === S - 1 || j === S - 1;
        if (edge) assert.equal(sampleMark(ops, (i + 0.5) / S - 0.5, (j + 0.5) / S - 0.5, scale), null, `${name} touches the tile edge at scale ${scale}`);
      }
      // and nothing is painted outside the tile at all
      for (const [x, y] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.52, 0.52], [-0.6, 0.1]]) assert.equal(sampleMark(ops, x, y, scale), null);
    }
  }
  // full frame over a period: neighbors never bleed into each other
  const bw = 320; const bh = 256;
  const { tile, x0, y0 } = glyphLayout(g, bw, bh);
  for (let k = 0; k < 8; k++) {
    const px = rasterGlyph(new Uint32Array(bw * bh), bw, bh, g, 1, (k / 8) * Math.PI * 2);
    for (let c = 1; c < g.cols; c++) for (let y = 0; y < bh; y++) {
      const x = Math.round(x0 + c * tile);
      assert.equal(px[y * bw + x], g.groundRgba); assert.equal(px[y * bw + x - 1], g.groundRgba);
    }
    for (let r = 1; r < g.rows; r++) for (let x = 0; x < bw; x++) {
      const y = Math.round(y0 + r * tile);
      assert.equal(px[y * bw + x], g.groundRgba); assert.equal(px[(y - 1) * bw + x], g.groundRgba);
    }
  }
});

ok('strokes: none under 0.012 in the table, and the floor holds after the DRIFT scale', () => {
  for (const name of GLYPH_MARKS) for (const ops of variants(name)) for (const w of strokeWidths(ops)) assert.ok(w >= MIN_STROKE, `${name} stroke ${w}`);
  // a 0.012-wide stroke at the 0.8 trough would be 0.0096; the clamp holds it at 0.012 of the tile
  const thin = [{ type: 'seg', role: 'mark', x1: -0.2, y1: 0, x2: 0.2, y2: 0, w: 0.012, cap: 'butt' }];
  const width = (scale) => { let c = 0; const S = 4000; for (let j = 0; j < S; j++) if (sampleMark(thin, 0, (j + 0.5) / S - 0.5, scale)) c += 1; return c / S; };
  assert.ok(Math.abs(width(1) - 0.012) < 0.001);
  assert.ok(Math.abs(width(0.8) - 0.012) < 0.001, `trough width ${width(0.8)}`);
  assert.ok(Math.abs(width(1.2) - 0.0144) < 0.001, 'above the floor a stroke scales with the mark');
});

// ── 5) roles ────────────────────────────────────────────────────────────────
ok('roles: ≤ 3 motif colors per tile, ≤ 6 global, all from the palette; ground is the darkest of the restricted set', () => {
  for (const pal of PALETTES) {
    const { ground, pool } = glyphRoles(pal);
    const set = [ground, ...pool];
    assert.ok(set.length <= GLYPH_MAX_ROLES);
    assert.equal(new Set(set).size, set.length);
    for (const c of set) assert.ok(pal.swatches.includes(c), `${c} is not in ${pal.id}`);
    assert.equal(lum(ground), Math.min(...set.map(lum)));
    assert.deepEqual([...set].sort(), [...new Set(rankedSwatches(pal))].slice(0, GLYPH_MAX_ROLES).sort(), 'the set is the strongest roles by weight');
    const allowed = new Set(set.map(toRgba));
    for (const s of SEEDS.slice(0, 3)) {
      const g = assignGlyph(s, 8, 1, pal);
      const global = new Set([g.ground]);
      for (const t of g.tiles) {
        assert.ok(t.used.length >= 1 && t.used.length <= 3, `${t.mark} uses ${t.used.length} motif colors`);
        assert.ok(!motifRoles(t.ops).includes('ground'));
        t.used.forEach((c) => global.add(c));
        if (pool.length >= 3) assert.equal(new Set([t.roles.mark, t.roles.cut, t.roles.accent]).size, 3, 'MARK, CUT and ACCENT are distinct');
        if (pool.length >= 2) assert.notEqual(t.roles.mark, t.roles.cut);
        assert.notEqual(t.roles.mark, g.ground, 'a mark is never the ground color');
      }
      assert.ok(global.size <= GLYPH_MAX_ROLES);
      for (const px of rasterGlyph(new Uint32Array(160 * 128), 160, 128, g, 1, 1)) assert.ok(allowed.has(px), 'pixel is not in the restricted set');
    }
  }
});

ok('Crossed disc knocks out in the ground role; a palette with fewer than 4 swatches uses all of them', () => {
  const ops = buildMark('crossedDisc', mkRng(1), 0);
  assert.deepEqual(motifRoles(ops), ['mark']);
  assert.equal(sampleMark(ops, 0, 0, 1), 'ground');
  const three = { bg: '#000000', swatches: ['#111111', '#ff0000', '#00ff00'] };
  const { ground, pool } = glyphRoles(three);
  assert.equal(ground, '#111111'); assert.equal(pool.length, 2);
});

// ── 6) neighbor rule ────────────────────────────────────────────────────────
ok('orthogonal neighbors never share a MARK color (pool ≥ 3, and the pool-of-2 parity branch)', () => {
  const two = { bg: '#000000', swatches: ['#101010', '#ff2d6f', '#00d9ff'] };
  assert.equal(glyphRoles(two).pool.length, 2);
  for (const pal of [PAL, PALETTES[1], PALETTES[5], two]) for (const s of SEEDS) for (const d of [4, 8, 12]) {
    const g = assignGlyph(s, d, 0.55, pal);
    g.tiles.forEach((t, i) => {
      const c = i % g.cols;
      if (c > 0) assert.notEqual(t.roles.mark, g.tiles[i - 1].roles.mark, `left neighbor shares MARK (seed ${s})`);
      if (i >= g.cols) assert.notEqual(t.roles.mark, g.tiles[i - g.cols].roles.mark, `upper neighbor shares MARK (seed ${s})`);
    });
  }
  // pool of one: the rule is waived, and every tile still draws
  const one = { bg: '#000000', swatches: ['#101010', '#ff2d6f'] };
  const g = assignGlyph(7, 4, 1, one);
  assert.equal(new Set(g.tiles.map((t) => t.roles.mark)).size, 1);
  for (const t of g.tiles) assert.ok(area(mask(t.ops)) > 0);
});

// ── 7) quota ────────────────────────────────────────────────────────────────
ok('every full aligned run of 8 holds a filled mark at MIX 0, 55 and 100', () => {
  let repaired = 0;
  for (const mix of [0, 0.55, 1]) for (const s of SEEDS) for (const d of DENSITIES) {
    const g = assignGlyph(s, d, mix, PAL);
    for (let start = 0; start + GLYPH_QUOTA_RUN <= g.tiles.length; start += GLYPH_QUOTA_RUN) {
      const run = g.tiles.slice(start, start + GLYPH_QUOTA_RUN).map((t) => t.mark);
      assert.ok(run.some((m) => FILLED_MARKS.includes(m)), `run at ${start} is all stroke marks (seed ${s}, density ${d}, mix ${mix})`);
    }
    repaired += 1;
  }
  assert.ok(repaired > 0);
});

ok('MIX 0 is the sunburst / crossed disc checkerboard; MIX 100 uses the wider vocabulary', () => {
  for (const s of SEEDS) {
    const g = assignGlyph(s, 4, 0, PAL);
    g.tiles.forEach((t, i) => assert.equal(t.mark, RHYTHM_MARKS[((i % g.cols) + Math.floor(i / g.cols)) % 2]));
    assert.ok(new Set(assignGlyph(s, 12, 1, PAL).tiles.map((t) => t.mark)).size >= 10);
  }
});

// ── 8) pose set ─────────────────────────────────────────────────────────────
ok('poses are quarter turns only; a quarter turn is exact', () => {
  assert.deepEqual([...POSES], [0, 90, 180, 270]);
  const seen = new Set();
  for (const s of SEEDS) for (const t of assignGlyph(s, 12, 1, PAL).tiles) { assert.ok(POSES.includes(t.pose)); seen.add(t.pose); }
  assert.equal(seen.size, 4);
  assert.throws(() => buildMark('bolt', mkRng(1), 45));
  // posing swaps the bounds' axes exactly, with no trig drift
  for (const name of GLYPH_MARKS) {
    const a = markBounds(buildMark(name, mkRng(9), 0)); const b = markBounds(buildMark(name, mkRng(9), 90));
    assert.ok(Math.abs((a.maxX - a.minX) - (b.maxY - b.minY)) < 1e-12 && Math.abs((a.maxY - a.minY) - (b.maxX - b.minX)) < 1e-12, name);
  }
});

// ── 9) seed stability ───────────────────────────────────────────────────────
ok('same seed + params → identical assignment and zero pixel diff at DRIFT 0; a new seed changes the frame', () => {
  const strip = (g) => JSON.stringify(g.tiles.map((t) => [t.mark, t.pose, t.roles, t.ops]));
  for (const s of SEEDS) {
    const a = assignGlyph(s, 8, 0.55, PAL); const b = assignGlyph(s, 8, 0.55, PAL);
    assert.equal(strip(a), strip(b));
    const ra = rasterGlyph(new Uint32Array(320 * 180), 320, 180, a, 0, 0);
    assert.deepEqual(ra, rasterGlyph(new Uint32Array(320 * 180), 320, 180, b, 0, 0));
    assert.deepEqual(ra, rasterGlyph(new Uint32Array(320 * 180), 320, 180, a, 0, 99), 'time does nothing at DRIFT 0');
    assert.notEqual(strip(a), strip(assignGlyph((s + 1) >>> 0, 8, 0.55, PAL)));
  }
});

ok('the glyph source reads no Math.random and no clock', () => {
  const src = readFileSync(new URL('./glyph.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/Math\.random|Date\.now|performance\.now/.test(src));
});

// ── the screen renderer draws the same board ────────────────────────────────
ok('drawGlyph: same ops, layout, colors and stroke floor as the reference sampler', () => {
  // a recording 2D context: no canvas in node
  const rec = () => {
    const calls = []; let path = [];
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
      fillRect: (x, y, w, h) => calls.push({ kind: 'rect', x, y, w, h, color: ctx.fillStyle }),
      beginPath: () => { path = []; },
      // a full circle records its box; a partial arc (the eye's almond) records its ends and
      // its midpoint, which is the arc's furthest reach
      arc: (x, y, r, a0, a1) => {
        if (a1 - a0 >= Math.PI * 2 - 1e-9) { path.push([x - r, y - r], [x + r, y + r]); return; }
        for (const a of [a0, (a0 + a1) / 2, a1]) path.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
      },
      moveTo: (x, y) => path.push([x, y]), lineTo: (x, y) => path.push([x, y]), closePath: () => {},
      fill: () => calls.push({ kind: 'fill', color: ctx.fillStyle, path }),
      stroke: () => calls.push({ kind: 'stroke', color: ctx.strokeStyle, width: ctx.lineWidth, cap: ctx.lineCap, path }),
    };
    return { ctx, calls };
  };
  for (const s of SEEDS.slice(0, 4)) for (const [w, h] of [[1920, 1080], [800, 800]]) for (const drift of [0, 1]) {
    const g = assignGlyph(s, 8, 1, PAL);
    const { ctx, calls } = rec();
    drawGlyph(ctx, g, w, h, drift, 1.3);
    assert.deepEqual(calls[0], { kind: 'rect', x: 0, y: 0, w, h, color: g.ground }, 'the frame is filled with the ground first');
    assert.equal(calls.length - 1, g.tiles.reduce((a, t) => a + t.ops.length, 0), 'one draw per op');
    const { tile, x0, y0 } = glyphLayout(g, w, h);
    const set = new Set([g.ground, ...g.pool]);
    let k = 1;
    g.tiles.forEach((t, i) => {
      const left = x0 + (i % g.cols) * tile; const top = y0 + Math.floor(i / g.cols) * tile;
      for (const op of t.ops) {
        const c = calls[k++];
        assert.equal(c.color, t.roles[op.role], `${t.mark} ${op.type} color`);
        assert.ok(set.has(c.color));
        assert.equal(c.kind, op.type === 'ring' || op.type === 'seg' ? 'stroke' : 'fill');
        const pad = c.kind === 'stroke' ? c.width / 2 : 0;
        if (c.kind === 'stroke') {
          assert.ok(c.width >= MIN_STROKE * tile - 1e-9, `${t.mark} stroke ${c.width / tile} of a tile is under the floor`);
          if (op.type === 'seg') assert.equal(c.cap, op.cap);
        }
        for (const [x, y] of c.path) {
          assert.ok(x - pad > left && x + pad < left + tile && y - pad > top && y + pad < top + tile, `${t.mark} draws outside its tile rect (drift ${drift})`);
        }
      }
    });
  }
});

// ── 10) 64px silhouette read (signed proxy: coverage ≥ 3%, pairwise IoU ≤ 0.85) ──
ok('64px read: every mark covers ≥ 3% of the tile (bolt and pixel cluster ≥ 2%), and no two marks have mask IoU > 0.85', () => {
  const masks = GLYPH_MARKS.map((name) => ({ name, m: mask(buildMark(name, mkRng(hash32(7, 3)), 0)) }));
  for (const name of GLYPH_MARKS) for (const ops of variants(name)) {
    const cover = area(mask(ops)) / (64 * 64);
    // Floor retuned from the proposed 3% to 2% (#1041 decision 2 allows it). The spec's own
    // dimensions cap two marks under 3% at hard-edged 64px: the bolt (0.16 × 0.40, six
    // vertices: 2.3%) and a bare tetromino (four 0.09 cells: 2.4%). Every other mark is ≥ 3%.
    const floor = name === 'bolt' || name === 'pixelCluster' ? 0.02 : 0.03;
    assert.ok(cover >= floor, `${name} covers ${(cover * 100).toFixed(1)}% at 64px`);
  }
  for (let i = 0; i < masks.length; i++) for (let j = i + 1; j < masks.length; j++) {
    let inter = 0; let uni = 0;
    for (let k = 0; k < masks[i].m.length; k++) { inter += masks[i].m[k] & masks[j].m[k]; uni += masks[i].m[k] | masks[j].m[k]; }
    assert.ok(inter / uni <= 0.85, `${masks[i].name} and ${masks[j].name} read alike: IoU ${(inter / uni).toFixed(2)}`);
  }
});

console.log(`glyph.selfcheck: ${n} checks passed`);
