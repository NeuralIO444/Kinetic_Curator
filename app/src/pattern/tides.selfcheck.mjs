// readout.selfcheck.mjs — PATTERN TIDES: a threshold grid that reads out a moving field (#1797).
//
// What the issue asks, as checks:
//   a fixed grid that never moves position; a travelling field sampled per cell; THREE colour states by threshold
//   (palette only); a drawn SIZE from the same value (swell ↔ dot); an "eye" on the mid state; the field breathes
//   from blotchy patches into horizontal bands and back; seed-deterministic (replay law); a cost tier declared at
//   registration.
import assert from 'node:assert';
import {
  assignTides,
  rasterTides,
  tidesCells,
  tidesCellOf,
  tidesBand,
  tidesCols,
  tidesRoles,
  tidesValue,
  tidesTau,
  TIDES_BREATH_S,
  TIDES_SIZE_MIN,
  TIDES_FILL,
  TIDES_SQUIRCLE_N,
  TIDES_EYE,
  TIDES_EYE_MIN_SIZE,
} from './tides.js';
import { createPatternFrames, patternPixels, patternKey } from './patternSource.js';
import { patternGround } from './ground.js';
import { dealPattern } from './patternRoll.js';
import { toRgba } from './engine.js';
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
const block = (over = {}) => sanitizePattern({ ...defaultPattern('TIDES', 0x1797), ...over });

ok('TIDES is a pattern mode the editor offers, opening at 20 cells across; KIN/CURATOR do not deal it', () => {
  assert.ok(PATTERN_MODES.includes('TIDES'));
  assert.ok(!PATTERN_DEAL_MODES.includes('TIDES'), 'hand-picked only (parked library work)');
  assert.deepEqual(PATTERN_DEAL_MODES, ['QUILT', 'GLYPH', 'FIELD'], 'existing seeded deals are unchanged');
  const rng = mkRng(7);
  for (let i = 0; i < 400; i++) assert.notEqual(dealPattern(block(), rng).mode, 'TIDES');
  assert.equal(tidesCols(block().density), 20);
  assert.equal(tidesCols(4), 8);
  assert.equal(tidesCols(12), 24);
});

ok('cost tier declared at registration: tier 0 (CPU raster, never shed), with a time estimate', () => {
  const d = getCostTier('pattern/tides');
  assert.ok(d, 'pattern/tides is registered');
  assert.equal(d.tier, 0);
  assert.ok(d.timeMs > 0 && /1797/.test(d.notes));
});

ok('the value → cell map: three states at 1/3 and 2/3; deep values swell, threshold-adjacent values are dots', () => {
  assert.equal(tidesCellOf(0).state, 0);
  assert.equal(tidesCellOf(0.5).state, 1);
  assert.equal(tidesCellOf(1).state, 2);
  assert.equal(tidesCellOf(0).size, 1, 'the field floor is a full cell');
  assert.equal(tidesCellOf(1).size, 1, 'the field ceiling is a full cell');
  assert.equal(tidesCellOf(0.5).size, 1, 'the middle of the mid band is a full cell');
  for (const edge of [1 / 3, 2 / 3]) {
    assert.ok(tidesCellOf(edge - 1e-9).size < TIDES_SIZE_MIN + 0.01, 'just under a threshold: a dot');
    assert.ok(tidesCellOf(edge + 1e-9).size < TIDES_SIZE_MIN + 0.01, 'just over a threshold: a dot');
  }
  for (let v = 0; v <= 1; v += 0.01) {
    const c = tidesCellOf(v);
    assert.ok(c.size >= TIDES_SIZE_MIN && c.size <= 1);
  }
});

ok('palette only: ground + three states, sorted dark → light; every pixel is one of those four colours', () => {
  const { ground, states } = tidesRoles(PAL);
  assert.equal(states.length, 3);
  const allowed = new Set([ground, ...states].map(toRgba));
  for (const t of [0, 3.3, 11]) {
    const px = patternPixels(block({ drift: 0.6 }), PAL, W, H, t);
    for (let i = 0; i < px.length; i++) assert.ok(allowed.has(px[i]), `pixel ${i} at t=${t} is off-palette`);
  }
  // a one- or two-swatch palette still renders (cycles; never throws)
  const thin = { swatches: ['#000000', '#ff2200'], bg: '#000000', ink: '#ffffff' };
  assert.equal(tidesRoles(thin).states.length, 3);
  patternPixels(block(), thin, 64, 48, 0);
});

ok('a frame shows all three states, both swollen cells and dots, and eyes on the mid state', () => {
  // look across a few seeds and times: the claim is about the mode, not one lucky frame
  let states = new Set();
  let big = 0;
  let dots = 0;
  let eyes = 0;
  for (const seed of [1, 2, 3]) {
    const g = assignTides(seed, 10, 0.4, PAL, 14);
    for (const t of [0, 4, 9]) {
      for (const c of tidesCells(g, 1, t)) {
        states.add(c.state);
        if (c.size > 0.85) big++;
        if (c.size < 0.35) dots++;
        if (c.state === 1 && c.size >= TIDES_EYE_MIN_SIZE) eyes++;
      }
    }
  }
  assert.equal(states.size, 3, 'all three threshold states appear');
  assert.ok(big > 50 && dots > 20 && eyes > 20, `variety: big ${big}, dots ${dots}, eyes ${eyes}`);
});

ok('replay law: same seed + params + t = identical pixels; another seed differs; DRIFT 0 is one still frame', () => {
  const a = patternPixels(block({ drift: 0.5 }), PAL, W, H, 2.25);
  const b = patternPixels(block({ drift: 0.5 }), PAL, W, H, 2.25);
  assert.deepEqual(a, b);
  const c = patternPixels(block({ drift: 0.5, seed: 0xabc }), PAL, W, H, 2.25);
  assert.notDeepEqual(a, c);
  const s0 = patternPixels(block({ drift: 0 }), PAL, W, H, 0);
  const s9 = patternPixels(block({ drift: 0 }), PAL, W, H, 9.5);
  assert.deepEqual(s0, s9, 'DRIFT 0 ignores the clock');
  assert.equal(patternKey(block(), PAL, W, H, 0), patternKey(block(), PAL, W, H, 99), 'and caches as a still');
  const m1 = patternPixels(block({ drift: 0.5 }), PAL, W, H, 1);
  const m2 = patternPixels(block({ drift: 0.5 }), PAL, W, H, 1.5);
  assert.notDeepEqual(m1, m2, 'DRIFT above 0: the field moves');
  // kin / movers are element motion; TIDES has no separate elements, so they change nothing
  assert.deepEqual(
    patternPixels(block({ drift: 0.5, kin: 'SPIN', movers: 1 }), PAL, W, H, 1),
    patternPixels(block({ drift: 0.5, kin: 'OFF', movers: 0 }), PAL, W, H, 1),
  );
});

ok('the grid never moves: every cell centre is always painted, in its cell, and every gap pixel is ground', () => {
  const g = assignTides(0x1797, 10, 0.4, PAL, Math.ceil(H / (W / 20)));
  const cell = W / g.cols;
  const groundPx = toRgba(g.ground);
  for (const t of [0, 2, 5]) {
    const buf = rasterTides(new Uint32Array(W * H), W, H, g, 1, t);
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const cy = Math.floor((r + 0.5) * cell);
        if (cy >= H) continue;
        const cx = Math.floor((c + 0.5) * cell);
        assert.notEqual(buf[cy * W + cx], groundPx, `cell ${c},${r} centre is painted at t=${t}`);
      }
    }
    // the gutter between cells (outside TIDES_FILL of the cell) is never painted
    for (let c = 1; c < g.cols; c++) {
      const x = Math.floor(c * cell);
      for (let y = 0; y < H; y++) assert.equal(buf[y * W + x], groundPx, `gutter column ${x} stays ground`);
    }
  }
});

ok('span fill matches the per-pixel superellipse + eye reference (pixel centres, hard edges)', () => {
  const rows = Math.ceil(H / (W / 20));
  const g = assignTides(42, 10, 0.55, PAL, rows);
  const t = 3.7;
  const fast = rasterTides(new Uint32Array(W * H), W, H, g, 0.8, t);
  const cells = tidesCells(g, 0.8, t);
  const cell = W / g.cols;
  let diff = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = Math.min(g.cols - 1, Math.floor((x + 0.5) / cell));
      const r = Math.floor((y + 0.5) / cell);
      let want = g.groundRgba;
      if (r < g.rows) {
        const { state, size } = cells[r * g.cols + c];
        const R = size * TIDES_FILL * cell;
        const dx = Math.abs(x + 0.5 - (c + 0.5) * cell);
        const dy = Math.abs(y + 0.5 - (r + 0.5) * cell);
        if (dx <= R && dy <= R && (dx / R) ** TIDES_SQUIRCLE_N + (dy / R) ** TIDES_SQUIRCLE_N <= 1) {
          want = g.rgba[state];
          const e = R * TIDES_EYE;
          if (state === 1 && size >= TIDES_EYE_MIN_SIZE && dx <= e && dy <= e) want = g.rgba[2];
        }
      }
      if (fast[y * W + x] !== want) diff++;
    }
  }
  // only exact-boundary float ties may differ
  assert.ok(diff <= W * H * 1e-4, `${diff} pixels differ from the reference`);
});

ok('it breathes: blotchy patches at the start of a breath, broad horizontal bands at its peak, blotchy again', () => {
  assert.equal(tidesBand(0), 0);
  assert.ok(Math.abs(tidesBand(TIDES_BREATH_S / 2) - 1) < 1e-12);
  assert.ok(tidesBand(TIDES_BREATH_S) < 1e-12);
  // horizontal coherence: share of horizontally adjacent cells in the same state, minus vertical
  const coherence = (tau) => {
    let h = 0;
    let v = 0;
    let hn = 0;
    let vn = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = assignTides(seed, 10, 0.5, PAL, 20);
      const st = (c, r) => tidesCellOf(tidesValue(g, c, r, tau)).state;
      for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
          if (c + 1 < g.cols) {
            hn++;
            if (st(c, r) === st(c + 1, r)) h++;
          }
          if (r + 1 < g.rows) {
            vn++;
            if (st(c, r) === st(c, r + 1)) v++;
          }
        }
      }
    }
    return h / hn - v / vn;
  };
  const blotchy = coherence(0);
  const banded = coherence(TIDES_BREATH_S / 2);
  assert.ok(banded > 0.25, `at the peak, rows agree far more than columns (${banded.toFixed(3)})`);
  assert.ok(banded > blotchy + 0.2, `bands (${banded.toFixed(3)}) vs patches (${blotchy.toFixed(3)})`);
  assert.ok(Math.abs(blotchy) < 0.15, `patches have no strong direction (${blotchy.toFixed(3)})`);
});

ok('DRIFT scales time; it is not a different picture', () => {
  assert.equal(tidesTau(0, 50), 0);
  assert.equal(tidesTau(0.5, 4), 2);
  const g = assignTides(9, 10, 0.4, PAL, 14);
  assert.deepEqual(tidesCells(g, 0.5, 4), tidesCells(g, 1, 2), 'half speed at twice the time = the same frame');
});

ok('ground sampler (#1183) agrees with the pixels: at() is the colour painted at the cell centre', () => {
  const p = block({ drift: 0.7 });
  const ground = patternGround(p, PAL, W, H);
  const frames = createPatternFrames();
  for (const t of [0, 1.5, 6]) {
    const f = frames.frame(p, PAL, W, H, t);
    const cell = W / tidesCols(p.density);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 20; c += 3) {
        const x = (c + 0.5) * cell;
        const y = (r + 0.5) * cell;
        const px = f.pixels[Math.floor(y) * W + Math.floor(x)];
        const roles = ground.roles(x, y, t);
        assert.ok(roles.map(toRgba).includes(px), `the centre pixel is one of the cell's role colours at t=${t}`);
        assert.equal(roles[0], ground.at(x, y, t).toLowerCase(), 'roles lead with the main colour');
      }
    }
    const cl = ground.cell(cell * 2.25, cell * 1.5, t);
    assert.ok(Math.abs(cl.u - 0.25) < 1e-9 && Math.abs(cl.v - 0.5) < 1e-9 && Math.abs(cl.size - cell) < 1e-9);
  }
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
  const declared = getCostTier('pattern/tides').timeMs;
  console.log(`      moving frame 1000×700: median ${med.toFixed(2)} ms (declared ${declared} ms)`);
  // CI machines vary; the gate is generous (4× the declaration), the log line is the honest number
  assert.ok(med < declared * 4, `median ${med.toFixed(2)} ms is far over the ${declared} ms declaration`);
});

console.log(`tides.selfcheck: ${n} checks passed`);
