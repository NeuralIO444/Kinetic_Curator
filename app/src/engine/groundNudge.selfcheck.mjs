// node src/engine/groundNudge.selfcheck.mjs
// #1183 tile-edge nudge — marks ease off the edges of the PATTERN tile beneath them. Off at 0 (byte-identical),
// monotonic, bounded, never crosses a tile edge, per frame (never accumulates), and a still equals the live frame.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EDGE_BAND, nudgeAxis, applyGroundNudge } from './groundNudge.js';
import { patternGround } from '../pattern/ground.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC } from '../data/layout-modes.js';
import { defaultPattern } from '../state/patternTrack.js';
import { resolvePalette } from '../data/palettes.js';

// 1. the curve
{
  assert.equal(nudgeAxis(0.01, 0), 0, 'amount 0 never moves');
  assert.equal(nudgeAxis(0.5, 1), 0, 'the middle of a tile is still');
  assert.equal(nudgeAxis(EDGE_BAND, 1), 0, 'the band edge is still (no seam)');
  assert.equal(nudgeAxis(1 - EDGE_BAND, 1), 0);
  assert.ok(nudgeAxis(0.01, 1) > 0, 'near the low edge: pushed up (inward)');
  assert.ok(nudgeAxis(0.99, 1) < 0, 'near the high edge: pushed down (inward)');
  assert.ok(Math.abs(nudgeAxis(0.05, 1) + nudgeAxis(0.95, 1)) < 1e-12, 'symmetric about the tile centre');
  assert.equal(nudgeAxis(NaN, 1), 0);
  for (const a of [0.1, 0.25, 0.5, 0.75, 1, 3]) {
    let prev = -Infinity;
    for (let i = 0; i <= 1000; i++) {
      const d = (i / 1000) * 0.5;
      const moved = d + nudgeAxis(d, a);
      assert.ok(moved >= prev - 1e-12, `amount ${a}: monotonic at d=${d} (marks never swap order)`);
      assert.ok(moved <= 0.5 && moved >= 0, `amount ${a}: stays on its side of the tile`);
      assert.ok(Math.abs(nudgeAxis(d, a)) <= (Math.min(1, a) * EDGE_BAND) / 2 + 1e-12, `amount ${a}: bounded`);
      prev = moved;
    }
  }
  // smooth at the band edge: the slope of the offset goes to 0
  const eps = 1e-4;
  assert.ok(Math.abs(nudgeAxis(EDGE_BAND - eps, 1)) / eps < 1e-3, 'zero slope at the band edge');
}

// 2. the applier: in place, still marks untouched, undo restores exactly
{
  const soa = { n: 4, x: new Float32Array([1, 50, 99, 10]), y: new Float32Array([50, 1, 50, 10]) };
  const cellAt = (x, y) => ({ u: x / 100, v: y / 100, size: 100 });
  const before = [Array.from(soa.x), Array.from(soa.y)];
  const still = new Uint8Array([0, 0, 0, 1]);
  const undo = applyGroundNudge(soa, cellAt, 1, still);
  assert.ok(soa.x[0] > 1 && soa.y[1] > 1 && soa.x[2] < 99, 'edge marks eased inward');
  assert.equal(soa.x[3], 10, 'a mark pinned still is left where it is');
  assert.equal(soa.y[3], 10);
  undo();
  assert.deepEqual([Array.from(soa.x), Array.from(soa.y)], before, 'undo restores the placed positions exactly');
  assert.equal(applyGroundNudge(soa, cellAt, 0), null, 'amount 0 does not run');
}

const pal = resolvePalette('bone', null, []);

// 3. cell(): agrees with the colour lookup; a QUILT hero block is one tile
{
  for (const mode of ['FIELD', 'QUILT', 'GLYPH']) {
    const g = patternGround(defaultPattern(mode, 21), pal, 1000, 700);
    for (let i = 0; i < 400; i++) {
      const x = (i * 37.3) % 1000; const y = (i * 53.1) % 700;
      const c = g.cell(x, y, 0);
      assert.ok(c.u >= 0 && c.u < 1 && c.v >= 0 && c.v < 1 && c.size > 0, `${mode}: cell coords in range`);
      // a point eased inward by the full nudge lands on the same tile colour
      const nx = x + nudgeAxis(c.u, 1) * c.size; const ny = y + nudgeAxis(c.v, 1) * c.size;
      assert.equal(g.at(nx, ny, 0), g.at(x, y, 0), `${mode}: the nudge never leaves the tile`);
    }
  }
  let heroSeen = false;
  for (let s = 1; s < 40 && !heroSeen; s++) {
    const g = patternGround(defaultPattern('QUILT', s), pal, 1000, 700);
    const base = g.cell(1, 1, 0).size;
    for (let i = 0; i < 2000 && !heroSeen; i++) {
      const c = g.cell((i * 13.7) % 1000, (i * 7.9) % 700, 0);
      if (c.size !== base) { heroSeen = true; assert.equal(c.size, base * 2, 'a hero block is a 2x2 tile'); }
    }
  }
  assert.ok(heroSeen, 'fixture: some QUILT seed has a hero block');
}

// ── the live frame ───────────────────────────────────────────────────────────────────────────────────────────────
const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const P = (id, mode = 'FIELD', seed = 9, extra = {}) => L(id, { type: 'pattern', pattern: { ...defaultPattern(mode, seed), ...extra } });
const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 300, kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0, ...over });
const input = (over = {}) => ({
  canvasW: 1000, canvasH: 700, layers: [P('p'), L('lyr-a')], activeLayerId: 'lyr-a', layerSnapshots: {}, seed: 1234, seedOffsets: null,
  paletteId: 'bone', paletteOverrides: null, userPalettes: [], layoutParams: lp(), caGrid: null, enabledAssets: null,
  assetWeightOverrides: {}, customAssets: [], quality: 'balanced', lockedParams: {}, batchPaused: false, focusSwap: false,
  loopTimeMs: 16, dtSec: 0.016, perfClampOverride: null, perfTier1: false, assetThin: false, slowRender: false, scaleMul: 1,
  alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null, ...over,
});
const itemsOf = (out, id = 'lyr-a') => out.find((l) => l.id === id).items;
const hash = (items) => createHash('sha256').update(JSON.stringify(items.map((i) => [i.x, i.y, i.scale, i.rotation, i.alpha, i.assetId, i.tint, i.color, i.accent]))).digest('hex');
const frame = (over) => itemsOf(createLiveResolver().resolveLayers(input(over)));
const col = (it) => String(it.tint ?? it.color).toLowerCase();

// 4. off is byte-identical: knob 0, key absent, no pattern, pattern above
{
  const off = hash(frame());
  const noKey = { ...lp() }; delete noKey.groundNudge;
  assert.equal(hash(frame({ layoutParams: noKey })), off, 'a layout without the key is the same frame');
  assert.equal(hash(frame({ layoutParams: lp({ groundNudge: 0 }) })), off, 'knob at 0');
  const plain = hash(frame({ layers: [L('lyr-a')] }));
  assert.equal(hash(frame({ layers: [L('lyr-a')], layoutParams: lp({ groundNudge: 1 }) })), plain, 'no pattern below: nothing to feel');
  assert.equal(hash(frame({ layers: [L('lyr-a'), P('p')], layoutParams: lp({ groundNudge: 1 }) })), hash(frame({ layers: [L('lyr-a'), P('p')] })),
    'a pattern ABOVE the marks is not their ground');
  assert.equal(DEFAULT_LAYOUT_PARAMS.groundNudge, 0, 'the knob ships at 0');
  assert.deepEqual(PARAM_SPEC.groundNudge, { min: 0, max: 1 });
}

// 5. on: edge marks ease inward, middle marks stay, nobody leaves their tile, colours untouched
{
  const g = patternGround(input().layers[0].pattern, pal, 1000, 700);
  const off = frame();
  const on = frame({ layoutParams: lp({ groundNudge: 1 }) });
  assert.equal(on.length, off.length);
  let moved = 0;
  for (let k = 0; k < off.length; k++) {
    const c = g.cell(off[k].x, off[k].y, 0.016);
    const inBand = Math.min(c.u, 1 - c.u) < EDGE_BAND || Math.min(c.v, 1 - c.v) < EDGE_BAND;
    if (!inBand) { assert.equal(on[k].x, off[k].x); assert.equal(on[k].y, off[k].y); continue; }
    if (on[k].x !== off[k].x || on[k].y !== off[k].y) moved += 1;
    assert.equal(g.at(on[k].x, on[k].y, 0.016), g.at(off[k].x, off[k].y, 0.016), `mark ${k} stays on its tile`);
    const after = g.cell(on[k].x, on[k].y, 0.016);
    assert.ok(Math.min(after.u, 1 - after.u) >= Math.min(c.u, 1 - c.u) - 1e-4, `mark ${k} moved away from the edge`);
    assert.equal(col(on[k]), col(off[k]), `mark ${k}: the nudge never changes colour`);
    assert.equal(on[k].scale, off[k].scale);
  }
  assert.ok(moved > 20, `the nudge really moves edge marks (${moved})`);
  // with the lean on too, the colour is exactly the lean-only colour (the nudge never crosses a tile)
  const lean = frame({ layoutParams: lp({ groundLean: 1 }) });
  const both = frame({ layoutParams: lp({ groundLean: 1, groundNudge: 1 }) });
  for (let k = 0; k < lean.length; k++) assert.equal(col(both[k]), col(lean[k]));
}

// 6. per frame, never accumulating; a drifting ground carries the nudge with it
{
  const r = createLiveResolver();
  const args = { layoutParams: lp({ groundNudge: 1 }) };
  const first = hash(itemsOf(r.resolveLayers(input(args))));
  for (let i = 0; i < 5; i++) r.resolveLayers(input(args));
  assert.equal(hash(itemsOf(r.resolveLayers(input(args)))), first, 'the same frame again is the same frame (no compounding)');

  const drifting = { layers: [P('p', 'FIELD', 9, { drift: 1 }), L('lyr-a')], layoutParams: lp({ groundNudge: 1 }) };
  const d = createLiveResolver();
  const t0 = itemsOf(d.resolveLayers(input({ ...drifting, loopTimeMs: 16 }))).map((i) => [i.x, i.y]);
  const t1 = itemsOf(d.resolveLayers(input({ ...drifting, loopTimeMs: 40000 }))).map((i) => [i.x, i.y]);
  const back = itemsOf(d.resolveLayers(input({ ...drifting, loopTimeMs: 16 }))).map((i) => [i.x, i.y]);
  assert.ok(t0.some((p, k) => p[0] !== t1[k][0] || p[1] !== t1[k][1]), 'as the pattern drifts, different marks feel an edge');
  assert.deepEqual(back, t0, 'returning to the same time is the same picture');
}

// 7. a STILL equals the live frame with the nudge on
{
  const { resolveLayers: resolveStill } = await import('../../../studio/render.mjs');
  const { getRenderCaps } = await import('../data/quality.js');
  const layers = [P('p', 'QUILT', 21), L('lyr-a')];
  const params = lp({ groundNudge: 0.8, groundLean: 0.5, count: 120 });
  const live = itemsOf(createLiveResolver().resolveLayers(input({ layers, layoutParams: params, loopTimeMs: 0 })));
  const stillOf = (p) => resolveStill({ layers, activeLayerId: 'lyr-a', layerSnapshots: {}, seed: 1234, paletteId: 'bone', paletteOverrides: null, layoutParams: p, patternTime: 0 },
    { caps: getRenderCaps('balanced') }).find((l) => l.id === 'lyr-a').items;
  const still = stillOf(params);
  assert.equal(still.length, live.length);
  for (let k = 0; k < live.length; k++) {
    assert.equal(still[k].x, live[k].x, `mark ${k}: still x equals live`);
    assert.equal(still[k].y, live[k].y);
    assert.equal(col(still[k]), col(live[k]));
  }
  const flat = stillOf(lp({ groundLean: 0.5, count: 120 }));
  assert.ok(still.some((it, k) => it.x !== flat[k].x || it.y !== flat[k].y), 'the still is nudged too');
}

console.log('groundNudge.selfcheck: ok (#1183 tile-edge nudge)');
