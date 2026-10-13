// node src/gl/dishGround.selfcheck.mjs
// #1183 slice 1 — the ground: which pattern a layer rests on, what colour it is, and that the live frame leans on
// it only when asked. With the knob at 0 (or no pattern below) the frame is byte-identical.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { nearestPatternBelow, patternGround } from '../pattern/ground.js';
import { patternPixels } from '../pattern/patternSource.js';
import { groundArgs, createResolverDish } from './dishGround.mjs';
import { createLiveResolver } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC } from '../data/layout-modes.js';
import { defaultPattern } from '../state/patternTrack.js';
import { resolvePalette } from '../data/palettes.js';

const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const P = (id, mode = 'QUILT', seed = 7, extra = {}) => L(id, { type: 'pattern', pattern: { ...defaultPattern(mode, seed), ...extra } });

// 1. WHICH ground: the nearest visible pattern BELOW the layer (bottom -> top), never one above
{
  const stack = [P('p-low'), L('a'), P('p-mid'), L('b'), L('c'), P('p-top')];
  assert.equal(nearestPatternBelow(stack, 'a').id, 'p-low');
  assert.equal(nearestPatternBelow(stack, 'b').id, 'p-mid', 'the nearest one, not the bottom-most');
  assert.equal(nearestPatternBelow(stack, 'c').id, 'p-mid', 'skipping content layers between');
  assert.equal(nearestPatternBelow([L('a'), P('p-above')], 'a'), null, 'a pattern above is not ground');
  assert.equal(nearestPatternBelow([P('p', 'QUILT', 7), L('a')].map((l) => (l.id === 'p' ? { ...l, visible: false } : l)), 'a'), null, 'a hidden pattern is not ground');
  assert.equal(nearestPatternBelow(stack, 'nope'), null);
  assert.equal(nearestPatternBelow(null, 'a'), null);
}

// 2. WHAT colour: each tile's MAIN colour, which is a colour the renderer really paints, is constant inside a tile,
//    and VARIES from tile to tile (the flat base colour does not, which is why the lean does not use it).
{
  const pal = resolvePalette('bone', null, []);
  for (const mode of ['QUILT', 'FIELD', 'GLYPH']) {
    const pattern = defaultPattern(mode, 11);
    const W = 400;
    const H = 280;
    const g = patternGround(pattern, pal, W, H);
    const px = patternPixels(pattern, pal, W, H, 0); // Uint32Array, RGBA little-endian
    const hexOf = (v) => `#${[v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    const seen = new Set();
    for (let i = 0; i < px.length; i += 7) seen.add(hexOf(px[i]));
    const density = pattern.density;
    const tileW = W / density;
    let checked = 0;
    for (let ty = 0; ty < Math.floor(H / tileW); ty++) {
      for (let tx = 0; tx < density; tx++) {
        const c = g.at((tx + 0.5) * tileW, (ty + 0.5) * tileW, 0).toLowerCase();
        assert.match(c, /^#[0-9a-f]{6}$/);
        assert.ok(seen.has(c), `${mode}: ground ${c} of tile ${tx},${ty} is a colour the renderer painted`);
        checked += 1;
      }
    }
    assert.ok(checked > 4, `${mode}: tiles checked`);
    const distinct = new Set();
    for (let ty = 0; ty < Math.floor(H / tileW); ty++) for (let tx = 0; tx < density; tx++) distinct.add(g.at((tx + 0.5) * tileW, (ty + 0.5) * tileW, 0));
    assert.ok(distinct.size >= 3, `${mode}: the main colour varies across tiles (${distinct.size} distinct), so the pattern reads through the marks`);
    // constant inside a tile: the ground is the tile's, not a per-pixel sample of the motif
    assert.equal(g.at(0.1 * tileW, 0.1 * tileW, 0), g.at(0.9 * tileW, 0.9 * tileW, 0));
  }
}

// 3. a drifting pattern moves the ground; a still one does not
{
  const pal = resolvePalette('bone', null, []);
  const still = patternGround({ ...defaultPattern('FIELD', 5), drift: 0 }, pal, 1000, 700);
  const moving = patternGround({ ...defaultPattern('FIELD', 5), drift: 1 }, pal, 1000, 700);
  let stillChanged = 0;
  let movingChanged = 0;
  for (let i = 0; i < 60; i++) {
    const x = 37 + i * 15;
    const y = 23 + i * 9;
    if (still.at(x, y, 0) !== still.at(x, y, 40)) stillChanged += 1;
    if (moving.at(x, y, 0) !== moving.at(x, y, 40)) movingChanged += 1;
  }
  assert.equal(stillChanged, 0, 'DRIFT 0: the ground under a point never changes');
  assert.ok(movingChanged > 10, `a drifting pattern slides the ground under a still point (${movingChanged}/60)`);
}

// 4. groundArgs: nothing unless the layer leans AND has ground; the palette is not even resolved otherwise
{
  const dish = createResolverDish();
  let resolved = 0;
  const base = { dish, W: 1000, H: 700, tSec: 0, seed: 3, getPalette: () => { resolved += 1; return resolvePalette('bone', null, []); } };
  const stack = [P('p'), L('a')];
  const none = groundArgs({ ...base, layers: stack, layerId: 'a', lean: 0 });
  assert.deepEqual(none, {});
  assert.ok(Object.isFrozen(none));
  assert.equal(groundArgs({ ...base, layers: stack, layerId: 'a', lean: undefined }), none, 'no knob is no lean');
  assert.equal(groundArgs({ ...base, layers: [L('a')], layerId: 'a', lean: 1 }), none, 'no pattern below is no ground');
  assert.equal(groundArgs({ ...base, layers: stack, layerId: 'a', lean: NaN }), none);
  assert.equal(resolved, 0, 'a layer that does not lean never pays for the palette');
  const on = groundArgs({ ...base, layers: stack, layerId: 'a', lean: 7 });
  assert.equal(on.dish, dish);
  assert.equal(on.lean, 1, 'clamped to 1');
  assert.match(dish.ground(100, 100), /^#[0-9a-f]{6}$/i);
  assert.equal(resolved, 1);
}

// ── the live frame ───────────────────────────────────────────────────────────────────────────────────────────────
const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 80, kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0, ...over });
const input = (over = {}) => ({
  canvasW: 1000, canvasH: 700, layers: [P('p', 'FIELD', 9), L('lyr-a')], activeLayerId: 'lyr-a', layerSnapshots: {}, seed: 1234, seedOffsets: null,
  paletteId: 'bone', paletteOverrides: null, userPalettes: [], layoutParams: lp(), caGrid: null, enabledAssets: null,
  assetWeightOverrides: {}, customAssets: [], quality: 'balanced', lockedParams: {}, batchPaused: false, focusSwap: false,
  loopTimeMs: 16, dtSec: 0.016, perfClampOverride: null, perfTier1: false, assetThin: false, slowRender: false, scaleMul: 1,
  alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null, ...over,
});
const itemsOf = (out, id = 'lyr-a') => out.find((l) => l.id === id).items;
const hash = (out) => createHash('sha256').update(JSON.stringify(out.map((l) => (l.items || []).map((i) => [i.x, i.y, i.scale, i.rotation, i.alpha, i.assetId, i.tint, i.color, i.accent])))).digest('hex');

// 5. knob at 0, or absent, or no pattern: byte-identical to a frame that never heard of the ground
{
  const plain = hash(createLiveResolver().resolveLayers(input({ layers: [L('lyr-a')] })));
  const withPatternLean0 = createLiveResolver().resolveLayers(input());
  assert.equal(hash([withPatternLean0.find((l) => l.id === 'lyr-a')]), hash([createLiveResolver().resolveLayers(input({ layers: [L('lyr-a')] })).find((l) => l.id === 'lyr-a')]),
    'a pattern below with the knob at 0 does not touch the marks');
  const noKey = { ...lp() };
  delete noKey.groundLean;
  assert.equal(hash(createLiveResolver().resolveLayers(input({ layers: [L('lyr-a')], layoutParams: noKey }))), plain, 'a layout without the key is the same frame');
  assert.equal(hash(createLiveResolver().resolveLayers(input({ layers: [L('lyr-a')], layoutParams: lp({ groundLean: 1 }) }))), plain, 'full lean with no pattern below changes nothing');
  assert.equal(hash(createLiveResolver().resolveLayers(input({ layers: [L('lyr-a'), P('p', 'FIELD', 9)], layoutParams: lp({ groundLean: 1 }) }))),
    hash(createLiveResolver().resolveLayers(input({ layers: [L('lyr-a'), P('p', 'FIELD', 9)] }))), 'a pattern ABOVE the marks is not their ground');
  assert.equal(DEFAULT_LAYOUT_PARAMS.groundLean, 0, 'the knob ships at 0');
  assert.deepEqual(PARAM_SPEC.groundLean, { min: 0, max: 1 });
}

// 6. full lean: every mark is exactly the colour of the ground beneath it; half lean is halfway; positions never move
{
  const pal = resolvePalette('bone', null, []);
  const g = patternGround(input().layers[0].pattern, pal, 1000, 700);
  const off = itemsOf(createLiveResolver().resolveLayers(input()));
  const full = itemsOf(createLiveResolver().resolveLayers(input({ layoutParams: lp({ groundLean: 1 }) })));
  const half = itemsOf(createLiveResolver().resolveLayers(input({ layoutParams: lp({ groundLean: 0.5 }) })));
  assert.equal(full.length, off.length);
  const colourOf = (it) => String(it.tint ?? it.color).toLowerCase();
  let moved = 0;
  for (let k = 0; k < off.length; k++) {
    assert.equal(full[k].x, off[k].x);
    assert.equal(full[k].y, off[k].y);
    assert.equal(colourOf(full[k]), g.at(off[k].x, off[k].y, 0.016).toLowerCase(), `mark ${k} takes the ground's colour`);
    if (colourOf(full[k]) !== colourOf(off[k])) moved += 1;
    const [a, b, c] = [off[k], half[k], full[k]].map((it) => parseInt(colourOf(it).slice(1, 3), 16));
    assert.ok(Math.abs(b - (a + c) / 2) <= 1, `mark ${k}: half lean is halfway in red`);
  }
  assert.ok(moved > off.length / 2, 'the lean really recolours the marks');
}

// 7. the nearest pattern below wins, and a drifting ground changes a still mark's colour over time
{
  const two = [P('p-low', 'FIELD', 1), P('p-near', 'FIELD', 99), L('lyr-a')];
  const pal = resolvePalette('bone', null, []);
  const near = patternGround(two[1].pattern, pal, 1000, 700);
  const got = itemsOf(createLiveResolver().resolveLayers(input({ layers: two, layoutParams: lp({ groundLean: 1 }) })));
  for (const it of got) assert.equal(String(it.tint ?? it.color).toLowerCase(), near.at(it.x, it.y, 0.016).toLowerCase(), 'the nearer pattern is the ground');
  const drifting = [P('p', 'FIELD', 9, { drift: 1 }), L('lyr-a')];
  const r = createLiveResolver();
  const t0 = itemsOf(r.resolveLayers(input({ layers: drifting, layoutParams: lp({ groundLean: 1 }), loopTimeMs: 16 }))).map((i) => String(i.tint ?? i.color));
  const t1 = itemsOf(r.resolveLayers(input({ layers: drifting, layoutParams: lp({ groundLean: 1 }), loopTimeMs: 40000 }))).map((i) => String(i.tint ?? i.color));
  assert.ok(t0.some((c, k) => c !== t1[k]), 'the colour follows the ground as the pattern drifts');
}

// 9. a STILL equals the live frame for a pattern scene (#1183 acceptance): same marks, same leaned colours
{
  const { resolveLayers: resolveStill } = await import('../../../studio/render.mjs');
  const { getRenderCaps } = await import('../data/quality.js');
  const layers = [P('p', 'QUILT', 21), L('lyr-a')];
  const params = lp({ groundLean: 0.8, mode: 'grid', count: 60 });
  const live = itemsOf(createLiveResolver().resolveLayers(input({ layers, layoutParams: params, loopTimeMs: 0 })));
  const still = resolveStill({ layers, activeLayerId: 'lyr-a', layerSnapshots: {}, seed: 1234, paletteId: 'bone', paletteOverrides: null, layoutParams: params, patternTime: 0 },
    { caps: getRenderCaps('balanced') }).find((l) => l.id === 'lyr-a').items;
  assert.equal(still.length, live.length, 'the still places the same marks');
  const col = (it) => String(it.tint ?? it.color).toLowerCase();
  for (let k = 0; k < live.length; k++) {
    assert.equal(still[k].x, live[k].x);
    assert.equal(still[k].y, live[k].y);
    assert.equal(col(still[k]), col(live[k]), `mark ${k}: the still's colour equals the live frame's`);
  }
  // and the still's lean is real, not both sides unleaned
  const flat = resolveStill({ layers, activeLayerId: 'lyr-a', layerSnapshots: {}, seed: 1234, paletteId: 'bone', paletteOverrides: null, layoutParams: lp({ mode: 'grid', count: 60 }), patternTime: 0 },
    { caps: getRenderCaps('balanced') }).find((l) => l.id === 'lyr-a').items;
  assert.ok(still.some((it, k) => col(it) !== col(flat[k])), 'the still leans too');
}

// 8. the one-writer file took a call site only
{
  const src = readFileSync(new URL('./liveResolve.mjs', import.meta.url), 'utf8');
  assert.match(src, /import \{ createResolverDish, (?:\w+, )*groundArgs \} from '\.\/dishGround\.mjs';/);
  assert.equal((src.match(/groundArgs\(/g) || []).length, 1);
  assert.equal((src.match(/createResolverDish\(/g) || []).length, 1, 'one dish per resolver');
}

console.log('dishGround.selfcheck: ok (#1183 slice 1)');
