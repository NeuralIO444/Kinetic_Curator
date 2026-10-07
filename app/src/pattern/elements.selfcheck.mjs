// elements.selfcheck.mjs — KINEME motion for the individual elements of a pattern (#1137).
//
// What must hold: a SHARE of the elements moves (never all, never none), each in its own way, only while DRIFT is up;
// `kin: OFF` and DRIFT 0 are the picture that always was; and every fast raster draws exactly the reference pixels.
import assert from 'node:assert';
import { pickMovers, elementXform, REST, TURNING, BOB_TILES } from './elements.js';
import {
  assignQuilt, assignGlyph, rasterQuilt, rasterQuiltReference, createQuiltRaster, quiltMoverMap,
  rasterGlyph, rasterGlyphReference, glyphMoverMap, glyphLayout,
} from './engine.js';
import { createPatternFrames, patternPixels, patternKey } from './patternSource.js';
import { defaultPattern, sanitizePattern, PATTERN_KINS, PATTERN_PARAM_KEYS } from '../state/patternTrack.js';
import { resolvePalette } from '../data/palettes.js';
import { getKineme } from '../data/kinemes.js';
import { QUILT_ROTATING } from './motion.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const PAL = resolvePalette('praystation', null);
const same = (a, b, what) => { assert.equal(a.length, b.length, `${what}: length`); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) assert.fail(`${what}: pixel ${i} differs`); };
const cands = (k, turnsEvery = 2) => Array.from({ length: k }, (_, i) => ({ at: i, turns: i % turnsEvery === 0 }));

ok('the pattern block: kin and movers are part of it; a stored block without them stays OFF; a new track opens on MIX', () => {
  assert.deepEqual([...PATTERN_KINS], ['OFF', 'MIX', 'SPIN', 'ROCK', 'PULSE', 'BLINK', 'BOB']);
  assert.ok(PATTERN_PARAM_KEYS.includes('kin') && PATTERN_PARAM_KEYS.includes('movers'));
  assert.equal(sanitizePattern({ mode: 'QUILT', seed: 3 }).kin, 'OFF', 'legacy: the picture it was');
  assert.equal(sanitizePattern({ kin: 'WAT' }).kin, 'OFF'); assert.equal(sanitizePattern({ kin: 'BOB', movers: 9 }).movers, 1); assert.equal(sanitizePattern({ movers: -1 }).movers, 0);
  assert.equal(defaultPattern('QUILT', 1).kin, 'MIX'); assert.equal(defaultPattern('GLYPH', 1).movers, 0.3);
});

ok('pickMovers: a seeded share, never all, never none while the share is up; OFF and 0 move nothing; deterministic', () => {
  const c = cands(40);
  assert.equal(pickMovers(1, 'OFF', 0.5, c).size, 0); assert.equal(pickMovers(1, 'MIX', 0, c).size, 0); assert.equal(pickMovers(1, 'MIX', 0.5, []).size, 0);
  for (const share of [0.05, 0.3, 0.5]) {
    const m = pickMovers(7, 'MIX', share, c); assert.equal(m.size, Math.max(1, Math.ceil(share * 40)), `share ${share}`);
    assert.ok(m.size < 40);
  }
  assert.equal(pickMovers(7, 'MIX', 0.001, c).size, 1, 'at least one element moves while the share is above 0');
  const a = pickMovers(7, 'MIX', 0.3, c); const b = pickMovers(7, 'MIX', 0.3, c);
  assert.deepEqual([...a], [...b]); assert.notDeepEqual([...a.keys()], [...pickMovers(8, 'MIX', 0.3, c).keys()], 'another seed moves other elements');
  for (const [, mv] of a) assert.ok(mv.phase >= 0 && mv.phase < 1);
});

ok('pickMovers: rotating kinds go only to art that turns; MIX uses all five over a big field; a fixed kind is that kind', () => {
  const c = cands(200); const turnsAt = new Set(c.filter((x) => x.turns).map((x) => x.at));
  const mix = pickMovers(3, 'MIX', 1, c); const kinds = new Set();
  for (const [at, mv] of mix) { kinds.add(mv.kind); if (TURNING.includes(mv.kind)) assert.ok(turnsAt.has(at), `${mv.kind} on a motif that does not turn`); }
  assert.equal(kinds.size, 5, 'all five kinds appear');
  for (const kind of ['SPIN', 'ROCK']) { const m = pickMovers(3, kind, 1, c); assert.equal(m.size, turnsAt.size, `${kind} only reaches turning art`); for (const [at, mv] of m) { assert.ok(turnsAt.has(at)); assert.equal(mv.kind, kind); } }
  for (const kind of ['PULSE', 'BLINK', 'BOB']) { const m = pickMovers(3, kind, 1, c); assert.equal(m.size, 200); assert.ok([...m.values()].every((v) => v.kind === kind)); }
  assert.equal(pickMovers(3, 'SPIN', 1, cands(10, 99).map((x, i) => ({ ...x, turns: false }))).size, 0, 'nothing turns, so nothing spins');
});

ok('elementXform: at rest at DRIFT 0; each kind moves as the kineme library says; amount follows DRIFT; held clock holds', () => {
  const mv = (kind, phase = 0) => ({ kind, phase });
  for (const k of ['SPIN', 'ROCK', 'PULSE', 'BLINK', 'BOB']) assert.equal(elementXform(mv(k), 0, 1.7), REST, `${k} at DRIFT 0`);
  assert.equal(elementXform(null, 1, 1), REST);
  const sp = getKineme('spin').period;
  assert.ok(Math.abs(elementXform(mv('SPIN'), 1, sp / 4).a - Math.PI / 2) < 1e-12, 'a quarter period = a quarter turn');
  assert.ok(Math.abs(elementXform(mv('SPIN'), 1, 0).a) < 1e-12);
  const rk = getKineme('rock'); const q = elementXform(mv('ROCK'), 1, rk.period / 4);
  assert.ok(Math.abs(q.a - (rk.amp * Math.PI) / 180) < 1e-12, 'rock peaks at +amp degrees');
  assert.ok(Math.abs(elementXform(mv('ROCK'), 0.5, rk.period / 4).a - ((rk.amp * Math.PI) / 360)) < 1e-12, 'and halves at DRIFT 0.5');
  const pl = getKineme('pulse'); assert.ok(Math.abs(elementXform(mv('PULSE'), 1, pl.period / 4).s - (1 + pl.amp)) < 1e-12); assert.ok(Math.abs(elementXform(mv('PULSE'), 1, (3 * pl.period) / 4).s - (1 - pl.amp)) < 1e-12);
  const bl = getKineme('blink'); assert.equal(elementXform(mv('BLINK'), 1, bl.period * 0.25).vis, true); assert.equal(elementXform(mv('BLINK'), 1, bl.period * 0.75).vis, false);
  const bb = getKineme('bob'); assert.ok(Math.abs(elementXform(mv('BOB'), 1, bb.period / 4).dy - BOB_TILES) < 1e-12);
  assert.deepEqual(elementXform(mv('ROCK', 0.3), 1, 5.5), elementXform(mv('ROCK', 0.3), 1, 5.5), 'a function of time');
  assert.equal(elementXform(mv('SPIN', 0.25), 1, 0).a, Math.PI / 2, 'the per-element phase offsets it');
});

// ── fast = reference, for every kin, over seeds × sizes × drift × time ────────────────────────────────────────
const SEEDS = [1, 42, 31337]; const SIZES = [[640, 360], [333, 555], [160, 96]];
const KINS = ['MIX', 'SPIN', 'ROCK', 'PULSE', 'BLINK', 'BOB'];
const alloc = (w, h) => new Uint32Array(w * h);

ok('QUILT: the fast raster and the incremental one draw the reference pixels, for every kin (heroes, grout, any time order)', () => {
  let frames = 0;
  for (const seed of SEEDS) for (const [w, h] of SIZES) for (const kin of KINS) for (const [density, hero, grout, share] of [[6, 0.6, 0.05, 0.5], [10, 1, 0, 1], [4, 0.3, 0.08, 0.2]]) {
    const tileW = w / density; const rows = Math.max(1, Math.ceil(h / tileW));
    const grid = assignQuilt(seed, density, 0.55, hero, PAL, rows);
    const movers = quiltMoverMap(grid, seed, kin, share);
    const inc = createQuiltRaster(grid, w, h, tileW, grout, movers);
    for (const [drift, t] of [[1, 0.37], [0.6, 2.6], [1, 9.1], [0.2, 0.37], [0, 5]]) {
      const want = rasterQuiltReference(alloc(w, h), w, h, grid, tileW, grout, drift, t, movers);
      same(rasterQuilt(alloc(w, h), w, h, grid, tileW, grout, drift, t, movers), want, `quilt ${kin} seed ${seed} ${w}x${h} d${density} drift ${drift} t ${t}`);
      same(inc.draw(alloc(w, h), drift, t), want, `incremental ${kin} seed ${seed} ${w}x${h} d${density} drift ${drift} t ${t}`);
      frames += 1;
    }
  }
  assert.ok(frames > 400, `${frames} frames`);
});

ok('GLYPH: the culled raster draws the reference pixels, for every kin', () => {
  let frames = 0;
  for (const seed of SEEDS) for (const [w, h] of SIZES) for (const kin of KINS) for (const [density, share] of [[4, 0.5], [8, 1], [12, 0.25]]) {
    const grid = assignGlyph(seed, density, 0.55, PAL); const movers = glyphMoverMap(grid, seed, kin, share);
    for (const [drift, t] of [[1, 0.37], [0.6, 2.6], [1, 9.1], [0, 5]]) {
      same(rasterGlyph(alloc(w, h), w, h, grid, drift, t, movers), rasterGlyphReference(alloc(w, h), w, h, grid, drift, t, movers), `glyph ${kin} seed ${seed} ${w}x${h} d${density} drift ${drift} t ${t}`);
      frames += 1;
    }
  }
  assert.ok(frames > 300, `${frames} frames`);
});

ok('OFF, no movers and DRIFT 0 are exactly the picture that always was', () => {
  const [w, h] = [400, 280]; const density = 8; const tileW = w / density; const rows = Math.ceil(h / tileW);
  const grid = assignQuilt(5, density, 0.55, 0.5, PAL, rows);
  assert.equal(quiltMoverMap(grid, 5, 'OFF', 1), null);
  const mv = quiltMoverMap(grid, 5, 'MIX', 0.5);
  same(rasterQuilt(alloc(w, h), w, h, grid, tileW, 0.03, 0, 0, mv), rasterQuilt(alloc(w, h), w, h, grid, tileW, 0.03, 0, 0, null), 'DRIFT 0 with movers = without');
  same(rasterQuilt(alloc(w, h), w, h, grid, tileW, 0.03, 0.7, 3, null), rasterQuiltReference(alloc(w, h), w, h, grid, tileW, 0.03, 0.7, 3, null), 'no movers: the original');
  const gg = assignGlyph(5, 6, 0.55, PAL); const gm = glyphMoverMap(gg, 5, 'MIX', 0.5);
  same(rasterGlyph(alloc(w, h), w, h, gg, 0, 3, gm), rasterGlyph(alloc(w, h), w, h, gg, 0, 3, null), 'GLYPH DRIFT 0 with movers = without');
  same(patternPixels({ ...defaultPattern('QUILT', 5), kin: 'OFF', drift: 0.7 }, PAL, 200, 140, 2), patternPixels({ ...defaultPattern('QUILT', 5), kin: 'OFF', movers: 1, drift: 0.7 }, PAL, 200, 140, 2), 'OFF ignores movers');
});

ok('not a wallpaper maker: the still elements stay put while the few movers move', () => {
  const [w, h] = [600, 420]; const density = 8; const tileW = w / density; const rows = Math.ceil(h / tileW);
  const grid = assignQuilt(11, density, 0.55, 0, PAL, rows); // no heroes: every element is a 1x1 tile
  for (const kin of ['PULSE', 'BOB', 'BLINK']) {
    const movers = quiltMoverMap(grid, 11, kin, 0.25);
    const total = grid.tiles.length;
    assert.ok(movers.size <= Math.ceil(0.25 * total) && movers.size >= 1, `${kin}: ${movers.size} of ${total} elements move`);
    const base = rasterQuilt(alloc(w, h), w, h, grid, tileW, 0, 0, 0, null);
    const turnsAt = new Set(grid.tiles.map((tl, i) => (QUILT_ROTATING.includes(tl.pattern) ? i : -1)).filter((i) => i >= 0));
    let movedPixels = 0; let strayPixels = 0;
    for (const t of [1.1, 2.3, 3.7, 5.9]) {
      const f = rasterQuilt(alloc(w, h), w, h, grid, tileW, 0, 1, t, movers);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = Math.min(grid.cols - 1, Math.floor((x + 0.5) / tileW)); const r = Math.min(grid.rows - 1, Math.floor((y + 0.5) / tileW)); const at = r * grid.cols + c;
        if (f[y * w + x] === base[y * w + x]) continue;
        if (movers.has(at) || turnsAt.has(at)) movedPixels += 1; else strayPixels += 1; // DRIFT itself turns pinwheels and medallions
      }
    }
    assert.ok(movedPixels > 0, `${kin}: something visibly moves`); assert.equal(strayPixels, 0, `${kin}: no still element changed a pixel`);
  }
  // and the whole point: with movers at 0.25 most of the board is the base picture at any moment
  const movers = quiltMoverMap(grid, 11, 'MIX', 0.25); const f = rasterQuilt(alloc(w, h), w, h, grid, tileW, 0, 1, 4.4, movers);
  const base = rasterQuilt(alloc(w, h), w, h, grid, tileW, 0, 0, 0, null); let diff = 0; for (let i = 0; i < f.length; i++) if (f[i] !== base[i]) diff += 1;
  assert.ok(diff / f.length < 0.45, `${((100 * diff) / f.length).toFixed(0)}% of the pixels differ from the still`);
});

ok('each kin shows: blink blanks the element, pulse and bob change it, spin turns a pinwheel', () => {
  const [w, h] = [400, 280]; const density = 6; const tileW = w / density; const rows = Math.ceil(h / tileW);
  const grid = assignQuilt(2, density, 0.55, 0, PAL, rows);
  const pin = grid.tiles.findIndex((tl) => QUILT_ROTATING.includes(tl.pattern)); assert.ok(pin >= 0);
  const only = (kind, phase) => new Map([[pin, { kind, phase }]]);
  const px = (m, t) => rasterQuilt(alloc(w, h), w, h, grid, tileW, 0, 1, t, m);
  const c = pin % grid.cols; const r = (pin / grid.cols) | 0;
  const cell = (f) => { const out = []; for (let y = Math.floor(r * tileW); y < Math.floor((r + 1) * tileW); y++) for (let x = Math.floor(c * tileW); x < Math.floor((c + 1) * tileW); x++) out.push(f[y * w + x]); return out; };
  const bl = getKineme('blink'); const off = cell(px(only('BLINK', 0), bl.period * 0.75));
  assert.ok(off.every((v) => v === off[0]), 'a blinked element is one flat ground colour');
  assert.ok(new Set(cell(px(only('BLINK', 0), bl.period * 0.25))).size > 1, 'and visible in its window');
  const base = cell(px(null, 0));
  const pl = getKineme('pulse'); assert.notDeepEqual(cell(px(only('PULSE', 0), pl.period * 0.75)), base, 'pulse changes the element');
  const bb = getKineme('bob'); assert.notDeepEqual(cell(px(only('BOB', 0), bb.period / 4)), base, 'bob moves the element');
  const sp = getKineme('spin'); assert.notDeepEqual(cell(px(only('SPIN', 0), sp.period / 8)), base, 'spin turns the pinwheel');
});

ok('the frame source: kin and movers reach the picture, change the key only while it moves, and FIELD ignores them', () => {
  const f = createPatternFrames();
  const mk = (over) => ({ ...defaultPattern('QUILT', 9), drift: 0.8, ...over });
  const a = f.frame(mk({ kin: 'OFF' }), PAL, 300, 210, 2.2).pixels.slice(); const b = f.frame(mk({ kin: 'MIX', movers: 0.5 }), PAL, 300, 210, 2.2).pixels.slice();
  assert.notDeepEqual(Array.from(a), Array.from(b), 'MIX at DRIFT 0.8 differs from OFF');
  same(f.frame(mk({ kin: 'MIX', movers: 0.5 }), PAL, 300, 210, 2.2).pixels, b, 'stable for the same inputs');
  assert.notEqual(patternKey(mk({ kin: 'OFF' }), PAL, 300, 210, 1), patternKey(mk({ kin: 'MIX' }), PAL, 300, 210, 1));
  assert.equal(patternKey(mk({ kin: 'OFF', drift: 0 }), PAL, 300, 210, 1), patternKey(mk({ kin: 'MIX', drift: 0 }), PAL, 300, 210, 9), 'a still frame is one frame whatever the kin');
  const field = (kin) => patternKey({ ...defaultPattern('FIELD', 9), drift: 0.8, kin }, PAL, 300, 210, 1);
  assert.equal(field('OFF'), field('MIX'), 'FIELD has no discrete elements');
  const g = (over) => patternPixels({ ...defaultPattern('GLYPH', 9), drift: 0.8, ...over }, PAL, 300, 210, 2.2);
  assert.notDeepEqual(Array.from(g({ kin: 'OFF' })), Array.from(g({ kin: 'MIX', movers: 0.5 })), 'GLYPH takes it too');
});

console.log(`elements.selfcheck: ${n} checks passed`);
