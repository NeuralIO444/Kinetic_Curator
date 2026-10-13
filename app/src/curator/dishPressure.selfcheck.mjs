// node src/curator/dishPressure.selfcheck.mjs
// #1355 step 2 — dish pressure: a count of the marks around the canvas pins, fed to the stress tracker.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dishPressure, observeDish, getDishPressure, DISH_RADIUS, DISH_SATURATE } from './dishPressure.js';
import { initStress, getStressState } from './stressLive.js';
import { BAND_TIGHTEN, BAND_NORMAL } from './stress.js';
import { withResolveTap, setResolveFrameTap } from '../gl/resolveTap.mjs';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const W = 1000, H = 700;
const R = DISH_RADIUS * H; // the shorter side
const ring = (cx, cy, n, r) => Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos(i), y: cy + r * Math.sin(i) }));

// 1. no pins, no pressure; a pin in an empty place reads 0
{
  const crowd = [{ items: ring(500, 350, 40, 10) }];
  assert.equal(dishPressure([], crowd, W, H), 0);
  assert.equal(dishPressure(null, crowd, W, H), 0);
  assert.equal(dishPressure([{ x: 100, y: 100 }], crowd, W, H), 0, 'nothing near the pin');
  assert.equal(dishPressure([{ x: 500, y: 350 }], null, W, H), 0);
  assert.equal(dishPressure([{ x: 500, y: 350 }], crowd, 0, 0), 0, 'a degenerate canvas is no reading');
}

// 2. it is a COUNT inside the radius, as a share of the saturation count, capped at 1
{
  const pin = [{ x: 500, y: 350 }];
  assert.equal(dishPressure(pin, [{ items: ring(500, 350, DISH_SATURATE / 2, R * 0.5) }], W, H), 0.5);
  assert.equal(dishPressure(pin, [{ items: ring(500, 350, DISH_SATURATE * 3, R * 0.5) }], W, H), 1, 'saturates');
  assert.equal(dishPressure(pin, [{ items: ring(500, 350, 50, R * 1.01) }], W, H), 0, 'just outside the radius does not count');
  // marks on every layer count; pattern and FX entries have no items and are skipped; a broken mark is no neighbour
  const mixed = [{ items: ring(500, 350, 6, 5) }, { isPattern: true }, { isFx: true }, { items: [...ring(500, 350, 6, 5), { x: NaN, y: 350 }] }];
  assert.equal(dishPressure(pin, mixed, W, H), 12 / DISH_SATURATE);
}

// 3. several pins: the MOST crowded one is the reading (a crowd is not diluted by an empty pin, nor counted twice)
{
  const crowd = [{ items: ring(200, 200, 12, 5) }];
  const one = dishPressure([{ x: 200, y: 200 }], crowd, W, H);
  assert.equal(dishPressure([{ x: 200, y: 200 }, { x: 800, y: 600 }], crowd, W, H), one);
  assert.equal(dishPressure([{ x: 200, y: 200 }, { x: 201, y: 200 }], crowd, W, H), one, 'two pins on one crowd do not double it');
  assert.equal(dishPressure([{ x: NaN, y: 1 }, null, { x: 200, y: 200 }], crowd, W, H), one, 'a broken pin is skipped');
}

// 4. the frame tap hands input and output together, and a throwing listener is dropped, never fatal
{
  let seen = null;
  setResolveFrameTap((i, o) => { seen = [i, o]; });
  const t = withResolveTap(() => ({ resolveLayers: (i) => ['out', i.n] }));
  const input = { n: 7 };
  assert.deepEqual(t.resolveLayers(input), ['out', 7]);
  assert.equal(seen[0], input); assert.deepEqual(seen[1], ['out', 7]);
  const warn = console.warn; console.warn = () => {};
  setResolveFrameTap(() => { throw new Error('boom'); });
  assert.deepEqual(t.resolveLayers({ n: 1 }), ['out', 1], 'the frame survives');
  let again = false; const prev = setResolveFrameTap(() => { again = true; });
  console.warn = warn;
  assert.equal(prev, null, 'the thrower was removed');
  setResolveFrameTap(null);
  assert.equal(again, false);
}

// 5. the real resolver: a pin on a placed mark reads pressure, the same pin with no pins in the input reads 0
{
  const input = (over) => ({
    canvasW: W, canvasH: H, layers: [{ id: 'a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'a', layerSnapshots: {}, seed: 1234, seedOffsets: null, paletteId: 'bone', paletteOverrides: null,
    userPalettes: [], layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 200, particleCount: 200 }, caGrid: null,
    enabledAssets: null, assetWeightOverrides: {}, customAssets: [], quality: 'balanced', lockedParams: {}, batchPaused: false,
    focusSwap: false, loopTimeMs: 0, dtSec: 1 / 60, perfClampOverride: null, perfTier1: false, assetThin: false,
    slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0,
    attractor: null, ...over,
  });
  setResolveFrameTap(observeDish);
  const t = withResolveTap(createLiveResolver);
  const out = t.resolveLayers(input({ dishPins: [] }));
  const items = out.find((e) => Array.isArray(e.items)).items;
  assert.ok(items.length > 50, `the scene has marks (${items.length})`);
  assert.equal(getDishPressure(), 0, 'no pins: no pressure');
  const base = JSON.stringify(out.map((e) => (e.items || []).map((it) => [it.x, it.y])));
  const pinned = t.resolveLayers(input({ dishPins: [{ x: items[0].x, y: items[0].y }] }));
  assert.ok(getDishPressure() >= 1 / DISH_SATURATE, `a pin on a mark counts at least that mark (${getDishPressure()})`);
  // reading the pins must not move the picture: this PR measures, it does not act
  const fresh = createLiveResolver();
  fresh.resolveLayers(input({ dishPins: [] }));
  const unpinned = fresh.resolveLayers(input({ dishPins: [] }));
  assert.equal(JSON.stringify(pinned.map((e) => (e.items || []).map((it) => [it.x, it.y]))),
    JSON.stringify(unpinned.map((e) => (e.items || []).map((it) => [it.x, it.y]))), 'pins change no placement');
  assert.ok(base.length > 0);
  t.resolveLayers(input({ dishPins: [] }));
  assert.equal(getDishPressure(), 0, 'unpinned again: back to 0 on the next frame');
  setResolveFrameTap(null);
  t.dispose(); fresh.dispose();
}

// 6. with dish pressure the TIGHTEN band is reachable; without it the old ceiling stands
{
  const run = (dish) => {
    let cb = null; const counts = { activityCount: 0, passRun: 999 };
    const stop = initStress({ getCounts: () => counts, isRunning: () => true, getDish: dish, raf: (f) => { cb = f; return 1; }, caf: () => {} });
    for (let f = 0; f < 300; f++) { counts.activityCount += 5; cb(); }
    const s = getStressState(); stop(); return s;
  };
  assert.equal(run(() => 1).band, BAND_TIGHTEN, 'busy hands, a long pass run and a crowded pin: TIGHTEN');
  assert.equal(run(() => 1).dish, 1);
  assert.equal(run(() => 0).band, BAND_NORMAL, 'no dish pressure: 0.62, NORMAL');
  assert.equal(run(undefined).band, BAND_NORMAL, 'no reader given: 0, not a guess');
  assert.equal(run(() => { throw new Error('x'); }).dish, 0, 'an unreadable dish is no pressure');
  assert.equal(run(() => NaN).dish, 0); assert.equal(run(() => 7).dish, 1, 'clamped');
}

// 7. honest: no clock and no chance in the module, and the app wires the real reader
{
  const src = readFileSync(new URL('./dishPressure.js', import.meta.url), 'utf8');
  assert.ok(!/Date\.now|performance\.now|setTimeout|setInterval|Math\.random/.test(src));
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  // #1355 step 3: the one frame tap feeds dish pressure, then the formation rule (the clock, #1458, also rides it)
  assert.ok(/setResolveFrameTap\(\(input, output\) => \{[\s\S]*?observeDish\(input, output\);[\s\S]*?observeFormation\(input, output\);/.test(app) && /getDish: getDishPressure/.test(app), 'App feeds dish pressure to the stress tracker');
}

console.log('dishPressure.selfcheck: ok (#1355 step 2, dish pressure)');
