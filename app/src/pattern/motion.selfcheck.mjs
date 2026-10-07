// motion.selfcheck.mjs — PATTERN motion (#1042): DRIFT means one thing per mode,
// nothing moves at DRIFT 0 and nothing sits still above it, and the DROP gate
// lands SHUFFLE on the bar. The 60fps check is manual (Perf HUD on Matt's Mac)
// and is NOT claimed here.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  motion, IDENTITY, quiltAngle, glyphPulse, fieldPan, phaseOf,
  QUILT_ROTATION_DEG, QUILT_PERIOD_S, GLYPH_PERIOD_S, FIELD_PAN_TILES_PER_S, QUILT_ROTATING,
} from './motion.js';
import {
  barMs, nextBarMs, beatRunning, createShuffleGate, requestShuffle, tickShuffle, BAR_BEATS,
} from './shuffleGate.js';
import {
  assignQuilt, assignGlyph, assign, rasterQuilt, rasterGlyph, rasterField, glyphScale, glyphLayout,
  panAngle, panOffset, QUILT_QUOTA_RUN,
} from './engine.js';
import { PALETTES } from '../data/palettes.js';
import { samplePattern } from './field.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const PAL = PALETTES[0];
const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 31337, 0xdeadbeef, 0xffffffff];
const DRIFTS = [0.01, 0.2, 1];
const frame = (g, drift, t) => rasterQuilt(new Uint32Array(160 * 128), 160, 128, g, 20, 0.03, drift, t);

// ── 1) identity at DRIFT 0 ──────────────────────────────────────────────────
ok('DRIFT 0: motion() is the frozen identity in every mode, and frames do not change across time', () => {
  for (const mode of ['QUILT', 'GLYPH', 'FIELD']) {
    assert.equal(motion(mode, 0, 123.4, { count: 20, angle: 1 }), IDENTITY);
    assert.ok(Object.isFrozen(IDENTITY));
  }
  assert.equal(quiltAngle(0, 55, 3, 20), 0);
  assert.equal(glyphPulse(0, 55, 3, 20), 1);
  assert.deepEqual(fieldPan(0, 55, 1), { x: 0, y: 0 });
  for (const s of SEEDS) {
    const q = assignQuilt(s, 8, 0.55, 0.6, PAL, 6);
    assert.deepEqual(frame(q, 0, 0), frame(q, 0, 7.3), 'quilt frame changed at DRIFT 0');
    const g = assignGlyph(s, 6, 0.55, PAL);
    assert.deepEqual(rasterGlyph(new Uint32Array(200 * 150), 200, 150, g, 0, 0), rasterGlyph(new Uint32Array(200 * 150), 200, 150, g, 0, 9.1));
    const f = assign(s, 6, 0.55, PAL, 5);
    const at = (t) => rasterField(new Uint32Array(120 * 100), 120, 100, f, 20, panOffset(s, 0, t));
    assert.deepEqual(at(0), at(11));
  }
});

// ── 2) never static above DRIFT 0 ───────────────────────────────────────────
ok('DRIFT > 0: nothing sits still, in every mode (incl. a low-MIX quilt and a small default-shaped grid)', () => {
  // The transform differs between t and t + 16 ms at every DRIFT. Pixels differ from DRIFT 0.2 up:
  // at DRIFT 0.01 a breath is 0.15° and moves an edge hundredths of a pixel per frame, which no
  // integer raster can show, so the check there is on the transform, not the pixels.
  const big = (g, drift, t) => rasterQuilt(new Uint32Array(480 * 384), 480, 384, g, 120, 0.03, drift, t);
  let pixels = 0;
  for (const s of SEEDS) for (const drift of DRIFTS) for (const t of [0, 1.7, 5]) {
    for (const [density, mix] of [[8, 0], [8, 0.55], [8, 1], [4, 0], [4, 1]]) {
      const rows = density === 4 ? 3 : 6;
      const q = assignQuilt(s, density, mix, 0, PAL, rows);
      const m0 = motion('QUILT', drift, t, { count: q.tiles.length }); const m1 = motion('QUILT', drift, t + 0.016, { count: q.tiles.length });
      const moving = q.tiles.some((tl, i) => QUILT_ROTATING.includes(tl.pattern) && m0.angle(i) !== m1.angle(i));
      assert.ok(moving, `no tile turns (seed ${s}, density ${density}, mix ${mix}, drift ${drift}, t ${t})`);
      if (drift >= 0.2 && density === 4) {
        assert.notDeepEqual(big(q, drift, t), big(q, drift, t + 1), `quilt frame static (seed ${s}, drift ${drift}, mix ${mix}, t ${t})`);
        pixels += 1;
      }
    }
    const gl = assignGlyph(s, 4, 0.55, PAL);
    const count = gl.cols * gl.rows;
    assert.ok(gl.tiles.some((_, i) => glyphPulse(drift, t, i, count) !== glyphPulse(drift, t + 0.016, i, count)), `no glyph pulses (seed ${s}, drift ${drift})`);
    if (drift === 1) {
      assert.notDeepEqual(
        rasterGlyph(new Uint32Array(800 * 640), 800, 640, gl, 1, t),
        rasterGlyph(new Uint32Array(800 * 640), 800, 640, gl, 1, t + 0.016), `glyph frame static (seed ${s})`);
    }
    const f = assign(s, 6, 0.55, PAL, 5);
    const o0 = panOffset(s, drift, t); const o1 = panOffset(s, drift, t + 0.016);
    assert.ok(o0.x !== o1.x || o0.y !== o1.y, `field offset static (seed ${s}, drift ${drift})`);
    // pixels: the field has moved by 2 px of a 20 px tile
    const at = (tt) => rasterField(new Uint32Array(120 * 100), 120, 100, f, 20, panOffset(s, drift, tt));
    assert.notDeepEqual(at(t), at(t + 0.1 / (FIELD_PAN_TILES_PER_S * drift)), `field frame static (seed ${s}, drift ${drift})`);
  }
  assert.ok(pixels > 0);
});

ok('the quilt quota: every aligned run of 16 (tail included) holds a rotating tile (pinwheel or medallion), hero medallions included', () => {
  for (const mix of [0, 0.3, 0.55, 1]) for (const s of SEEDS) for (const d of [4, 6, 8, 12]) for (const hero of [0, 1]) {
    const g = assignQuilt(s, d, mix, hero, PAL, d);
    const turns = (i) => (g.heroAt[i] !== -1 ? g.heroes[g.heroAt[i]].pattern === 'medallion' : QUILT_ROTATING.includes(g.tiles[i].pattern));
    for (let start = 0; start < g.tiles.length; start += QUILT_QUOTA_RUN) {
      let has = false;
      for (let i = start; i < Math.min(start + QUILT_QUOTA_RUN, g.tiles.length); i++) has = has || turns(i);
      assert.ok(has, `run ${start} cannot rotate (seed ${s}, density ${d}, mix ${mix}, hero ${hero})`);
    }
    // a quota replacement never lands under a hero, and the grid is unchanged otherwise
    g.heroes.forEach((h, i) => assert.equal(g.heroAt.filter((v) => v === i).length, 4));
  }
});

// ── 3) GLYPH ────────────────────────────────────────────────────────────────
ok('GLYPH: scale = 1 + 0.2·DRIFT·sin(2πt/6 + phase), always in [0.8, 1.2] (peak 72%, trough 48% of the tile)', () => {
  const N = 20;
  let lo = 2; let hi = 0;
  for (const drift of [0.1, 0.5, 1]) for (let k = 0; k < 240; k++) for (let i = 0; i < N; i++) {
    const t = (k / 240) * GLYPH_PERIOD_S * 2;
    const sc = glyphPulse(drift, t, i, N);
    assert.ok(Math.abs(sc - (1 + 0.2 * drift * Math.sin((2 * Math.PI * t) / 6 + (2 * Math.PI * i) / N))) < 1e-12);
    assert.ok(sc >= 1 - 0.2 * drift - 1e-12 && sc <= 1 + 0.2 * drift + 1e-12);
    assert.equal(glyphScale(i, N, drift, t), sc, 'the engine reads motion.js');
    if (drift === 1) { lo = Math.min(lo, sc); hi = Math.max(hi, sc); }
  }
  assert.ok(Math.abs(hi - 1.2) < 1e-3 && Math.abs(lo - 0.8) < 1e-3);
  assert.ok(Math.abs(0.6 * hi - 0.72) < 1e-3 && Math.abs(0.6 * lo - 0.48) < 1e-3);
  assert.ok(Math.abs(glyphPulse(1, 2.2, 20, 20) - glyphPulse(1, 2.2, 0, 20)) < 1e-12, 'one full wave across the grid');
});

ok('GLYPH: no mark pixel leaves its tile rect across a full period at DRIFT 100%', () => {
  for (const s of SEEDS.slice(0, 4)) {
    const g = assignGlyph(s, 4, 1, PAL);
    const bw = 320; const bh = 256;
    const { tile, x0, y0 } = glyphLayout(g, bw, bh);
    for (let k = 0; k < 12; k++) {
      const px = rasterGlyph(new Uint32Array(bw * bh), bw, bh, g, 1, (k / 12) * GLYPH_PERIOD_S);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const c = Math.floor((x + 0.5 - x0) / tile); const r = Math.floor((y + 0.5 - y0) / tile);
        if (c < 0 || c >= g.cols || r < 0 || r >= g.rows) { assert.equal(px[y * bw + x], g.groundRgba); continue; }
        const ex = (x + 0.5 - x0) / tile - c; const ey = (y + 0.5 - y0) / tile - r;
        if (ex < 0.02 || ex > 0.98 || ey < 0.02 || ey > 0.98) assert.equal(px[y * bw + x], g.groundRgba, 'a mark reached the tile edge');
      }
    }
  }
});

// ── 4) QUILT ────────────────────────────────────────────────────────────────
ok('QUILT: angle is ±15° · DRIFT, a breath not a spin (bounded, returns every period), phase-offset per tile', () => {
  const lim = (QUILT_ROTATION_DEG * Math.PI) / 180;
  for (const drift of [0.2, 1]) for (let k = 0; k < 400; k++) for (let i = 0; i < 16; i++) {
    const t = (k / 400) * QUILT_PERIOD_S * 3;
    const a = quiltAngle(drift, t, i, 16);
    assert.ok(Math.abs(a) <= lim * drift + 1e-12);
    assert.ok(Math.abs(a - quiltAngle(drift, t + QUILT_PERIOD_S, i, 16)) < 1e-9, 'periodic: it never accumulates a spin');
  }
  assert.notEqual(quiltAngle(1, 1, 0, 16), quiltAngle(1, 1, 5, 16), 'tiles are phase-offset');
  assert.equal(phaseOf(8, 16), Math.PI);
});

ok('QUILT: only pinwheels and medallions change under rotation; every other motif is byte-identical', () => {
  for (const s of SEEDS) {
    const g = assignQuilt(s, 8, 1, 0, PAL, 6); // no heroes: every tile is a 1×1
    const T = 20; const bw = g.cols * T;
    const a = rasterQuilt(new Uint32Array(bw * g.rows * T), bw, g.rows * T, g, T, 0, 1, 1.3);
    const b = rasterQuilt(new Uint32Array(bw * g.rows * T), bw, g.rows * T, g, T, 0, 1, 4.1);
    const moved = new Set(); const still = new Set();
    for (let i = 0; i < a.length; i++) {
      const c = Math.floor((i % bw) / T); const r = Math.floor(Math.floor(i / bw) / T);
      const name = g.tiles[r * g.cols + c].pattern;
      if (a[i] !== b[i]) moved.add(name); else still.add(name);
    }
    for (const name of moved) assert.ok(QUILT_ROTATING.includes(name), `${name} moved but is not a rotating motif`);
  }
});

ok('QUILT: no corner of a rotated pinwheel shows ground, and a hero medallion rotates as one motif', () => {
  const two = { swatches: ['#000000', '#ff2d6f', '#00d9ff'] }; // ground distinct from both motif colors
  for (const s of SEEDS) {
    const g = assignQuilt(s, 8, 1, 1, two, 8);
    const T = 24; const bw = g.cols * T; const bh = g.rows * T;
    for (const t of [0, 1.3, 2.9, 4.4]) {
      const px = rasterQuilt(new Uint32Array(bw * bh), bw, bh, g, T, 0, 1, t);
      g.tiles.forEach((tl, i) => {
        if (tl.pattern !== 'pinwheel' || g.heroAt[i] !== -1) return;
        const c = i % g.cols; const r = Math.floor(i / g.cols);
        for (const [dx, dy] of [[0, 0], [T - 1, 0], [0, T - 1], [T - 1, T - 1]]) {
          assert.notEqual(px[(r * T + dy) * bw + c * T + dx], g.groundRgba, 'ground shows in a pinwheel corner');
        }
      });
    }
    const med = g.heroes.find((h) => h.pattern === 'medallion');
    if (med) {
      const a = rasterQuilt(new Uint32Array(bw * bh), bw, bh, g, T, 0, 1, 0.5);
      const b = rasterQuilt(new Uint32Array(bw * bh), bw, bh, g, T, 0, 1, 3.5);
      let diff = 0;
      for (let y = med.r * T; y < (med.r + 2) * T; y++) for (let x = med.c * T; x < (med.c + 2) * T; x++) diff += a[y * bw + x] !== b[y * bw + x] ? 1 : 0;
      assert.ok(diff > 0, 'the hero medallion is static');
    }
  }
});

// ── 5) FIELD ────────────────────────────────────────────────────────────────
ok('FIELD: pan direction is seed-stable, speed is 0.25 tile/s × DRIFT, offset is continuous in t, wrap stays exact', () => {
  for (const s of SEEDS) {
    assert.equal(panAngle(s), panAngle(s));
    const ang = panAngle(s);
    const o1 = panOffset(s, 1, 4);
    assert.ok(Math.abs(Math.hypot(o1.x, o1.y) - 4 * FIELD_PAN_TILES_PER_S) < 1e-12);
    assert.ok(Math.abs(Math.atan2(o1.y, o1.x) - Math.atan2(Math.sin(ang), Math.cos(ang))) < 1e-9);
    assert.ok(Math.abs(Math.hypot(panOffset(s, 0.4, 4).x, panOffset(s, 0.4, 4).y) - 0.4 * 4 * 0.25) < 1e-12, 'linear in DRIFT');
    let prev = panOffset(s, 1, 0);
    for (let k = 1; k <= 600; k++) {
      const cur = panOffset(s, 1, k / 60);
      assert.ok(Math.hypot(cur.x - prev.x, cur.y - prev.y) < 0.25 / 60 + 1e-9, 'a frame steps at most one pan increment');
      prev = cur;
    }
    // the torus holds at a nonzero t: the field at (x + cols, y) equals the field at (x, y)
    const f = assign(s, 6, 0.55, PAL, 5);
    const off = panOffset(s, 1, 37.25);
    const w = 96; const h = 80;
    const a = rasterField(new Uint32Array(w * h), w, h, f, 16, off);
    const b = rasterField(new Uint32Array(w * h), w, h, f, 16, { x: off.x + f.cols, y: off.y + f.rows });
    assert.deepEqual(a, b, 'the pan wraps exactly');
  }
  assert.notEqual(panAngle(1), panAngle(2));
  assert.equal(typeof samplePattern, 'function');
});

// ── 6) DROP gate ────────────────────────────────────────────────────────────
const run = (gate, ev) => ({ ...tickShuffle(gate, ev) });

ok('bar = 4 beats, grid absolute on the loop clock; nextBarMs is strictly after (a tap on a boundary lands on the next bar)', () => {
  assert.equal(BAR_BEATS, 4);
  assert.equal(barMs(120), 2000); assert.equal(barMs(60), 4000); assert.equal(barMs(180), 4000 / 3); assert.equal(barMs(300), 800); assert.equal(barMs(30), 8000);
  assert.equal(nextBarMs(0.5, 120), 2000);
  assert.equal(nextBarMs(2000, 120), 4000, 'exactly on a boundary → the NEXT bar');
  assert.equal(nextBarMs(1999.9, 120), 2000);
  assert.equal(barMs(NaN), 2000, 'an unusable BPM falls back to 120');
});

ok('DROP on + BEAT running: SHUFFLE fires on the first frame at or after the boundary, never before, within one frame, at 60/120/180/300 BPM', () => {
  for (const bpm of [60, 120, 180, 300]) for (const tap of [10, 333.3, 1000, 1999, 2000, 3999.9, 5555]) {
    let { gate, fire } = requestShuffle(createShuffleGate(), { drop: true, bpm, loopMs: tap });
    assert.equal(fire, false, 'a tap never fires in its own frame');
    const target = nextBarMs(tap, bpm);
    assert.ok(target > tap);
    let firedAt = null;
    for (let t = tap + 16.7; t < tap + barMs(bpm) * 2; t += 16.7) {
      const r = run(gate, { drop: true, bpm, loopMs: t });
      gate = r.gate;
      if (r.fire) { firedAt = t; break; }
    }
    assert.ok(firedAt !== null, `never fired (bpm ${bpm}, tap ${tap})`);
    assert.ok(firedAt >= target, 'fired before the bar');
    assert.ok(firedAt - target < 16.7 + 1e-6, `fired ${firedAt - target}ms late`);
    assert.equal(gate.pendingAt, null);
  }
});

ok('unquantized paths: DROP off, or BEAT not running, reseed in the same frame', () => {
  for (const drift of [0, 1]) { // DRIFT never implies DROP: the gate does not even take it
    assert.equal(requestShuffle(createShuffleGate(), { drop: false, bpm: 120, loopMs: 1234 }).fire, true);
    assert.equal(requestShuffle(createShuffleGate(), { drop: true, bpm: undefined, loopMs: 1234 }).fire, true, 'no BPM');
    assert.equal(requestShuffle(createShuffleGate(), { drop: true, bpm: null, loopMs: 1234 }).fire, true);
    assert.equal(requestShuffle(createShuffleGate(), { drop: true, bpm: 120, loopMs: 0 }).fire, true, 'clock not observed yet');
    assert.equal(drift >= 0, true);
  }
  assert.ok(beatRunning(120, 5000) && !beatRunning(120, 0) && !beatRunning(NaN, 5000) && !beatRunning(undefined, 5000));
  assert.ok(!/drift/i.test(readFileSync(new URL('./shuffleGate.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')), 'the gate never reads DRIFT');
});

ok('coalescing: taps while pending do nothing; one reseed per bar, and the next tap after it arms a new one', () => {
  let { gate } = requestShuffle(createShuffleGate(), { drop: true, bpm: 120, loopMs: 100 });
  const armed = gate.pendingAt;
  for (let k = 0; k < 5; k++) {
    const r = requestShuffle(gate, { drop: true, bpm: 120, loopMs: 200 + k * 50 });
    assert.equal(r.fire, false); assert.equal(r.gate.pendingAt, armed);
    gate = r.gate;
  }
  let fires = 0;
  for (let t = 300; t < 2200; t += 16.7) { const r = run(gate, { drop: true, bpm: 120, loopMs: t }); gate = r.gate; fires += r.fire ? 1 : 0; }
  assert.equal(fires, 1);
  // a tap that lands AFTER the boundary but BEFORE the next tick must not push the reseed a bar later
  const early = requestShuffle(createShuffleGate(), { drop: true, bpm: 120, loopMs: 100 }).gate;
  const late = requestShuffle(early, { drop: true, bpm: 120, loopMs: 2005 });
  assert.equal(late.fire, false); assert.equal(late.gate.pendingAt, 2000, 'a late tap is coalesced, not re-armed a bar out');
  assert.equal(tickShuffle(late.gate, { drop: true, bpm: 120, loopMs: 2005 }).fire, true, 'and it fires on the next tick');
  const again = requestShuffle(gate, { drop: true, bpm: 120, loopMs: 2300 });
  assert.equal(again.gate.pendingAt, 4000);
});

ok('flush: DROP turned off while pending fires immediately, it is never stranded', () => {
  let { gate } = requestShuffle(createShuffleGate(), { drop: true, bpm: 120, loopMs: 100 });
  const r = tickShuffle(gate, { drop: false, bpm: 120, loopMs: 150 });
  assert.equal(r.fire, true); assert.equal(r.gate.pendingAt, null);
});

ok('BPM change while pending recomputes the bar from the current loop time', () => {
  let { gate } = requestShuffle(createShuffleGate(), { drop: true, bpm: 60, loopMs: 100 });
  assert.equal(gate.pendingAt, 4000);
  const r = tickShuffle(gate, { drop: true, bpm: 240, loopMs: 1200 }); // 240 BPM: a bar is 1000 ms → next boundary 2000
  assert.equal(r.fire, false); assert.equal(r.gate.pendingAt, 2000);
  assert.equal(tickShuffle(r.gate, { drop: true, bpm: 240, loopMs: 2000 }).fire, true);
});

ok('held clock holds the pending shuffle; a thaw fires it once', () => {
  let { gate } = requestShuffle(createShuffleGate(), { drop: true, bpm: 120, loopMs: 500 });
  for (let k = 0; k < 300; k++) { const r = run(gate, { drop: true, bpm: 120, loopMs: 500 }); assert.equal(r.fire, false); gate = r.gate; }
  const thaw = run(gate, { drop: true, bpm: 120, loopMs: 9000 }); // a huge jump after a freeze
  assert.equal(thaw.fire, true);
  assert.equal(run(thaw.gate, { drop: true, bpm: 120, loopMs: 9016 }).fire, false, 'fires AT MOST once, no catch-up burst');
});

ok('a clock rolled back re-arms to the next bar instead of waiting out a stale target', () => {
  let { gate } = requestShuffle(createShuffleGate(), { drop: true, bpm: 120, loopMs: 90000 });
  const r = tickShuffle(gate, { drop: true, bpm: 120, loopMs: 100 });
  assert.equal(r.fire, false); assert.equal(r.gate.pendingAt, 2000);
});

// ── 7) purity and no rebake ─────────────────────────────────────────────────
ok('motion.js imports nothing: no beat, palette, store or color code, no Math.random, no clock', () => {
  const src = readFileSync(new URL('./motion.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/^\s*import\b/m.test(src), 'motion.js must have no imports');
  assert.ok(!/Math\.random|Date\.now|performance\.now|beat|palette|hue/i.test(src), 'motion is time, not color or beat');
  for (const f of ['./shuffleGate.js']) {
    const g = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/Math\.random|Date\.now|performance\.now/.test(g));
  }
});

ok('a reseed allocates only the assignment: assign / assignQuilt / assignGlyph take no canvas and no atlas', () => {
  for (const s of SEEDS.slice(0, 3)) {
    const before = Object.keys(globalThis).length;
    assign(s, 6, 0.5, PAL, 5); assignQuilt(s, 8, 0.5, 0.25, PAL, 6); assignGlyph(s, 4, 0.5, PAL);
    assert.equal(Object.keys(globalThis).length, before, 'assignment leaked a global');
  }
  for (const f of ['./engine.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('export function assignQuilt'), src.indexOf('export function onGrout'));
    assert.ok(!/OffscreenCanvas|createImageData|getContext|document\./.test(body), 'a quilt reseed must not touch a canvas');
  }
});

console.log(`motion.selfcheck: ${n} checks passed`);
