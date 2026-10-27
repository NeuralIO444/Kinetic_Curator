// node src/engine/creature.selfcheck.mjs
// #1355 step 4 — the moth: a formed pin becomes body + two wings + feather fans (Phase 2 S3 grew the fans
// on the wings' bone chains, replacing the scattered scales), from the artist's attach points.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS } from '../data/assets/index.js';
import { createCreatureBuilder, MOTH, MOTH_PARTS, mothRecipe, pointToward } from './creature.js';
import { FAN_COUNTS } from './featherFan.js';
import { autoAttachPoints } from './autoAttach.js';
import { expandHierarchy } from './hierarchy.js';
import { pinPressures } from '../curator/dishPressure.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const asset = (id) => ASSETS.find((a) => a.id === id);
const SW = ['#aa0000', '#222222', '#333333', '#444444', '#555555', '#666666'];
const PAL = { bg: '#111111', ink: '#eeeeee', swatches: SW };
const FAN_PER_WING = FAN_COUNTS.fore.plate + FAN_COUNTS.fore.feather + FAN_COUNTS.fore.leaf + FAN_COUNTS.fore.chevron;
const FAN_PER_HIND = FAN_COUNTS.hind.plate + FAN_COUNTS.hind.feather + FAN_COUNTS.hind.leaf + FAN_COUNTS.hind.chevron;
const MOTH_ITEMS = 3 + 1 + 2 + 2 * FAN_PER_WING; // halos + body + wings + fan parts
const plumageOf = (items) => items.filter((i) => /\/fan/.test(i.key));
const entry = () => [{ id: 'a', items: [{ x: 1, y: 1, assetId: 'x' }], palette: PAL }];
const input = (over = {}) => ({
  dishPins: [{ x: 500, y: 350 }],
  dishFormed: [true],
  seed: 77,
  seedOffsets: null,
  loopTimeMs: 0,
  assetAttach: {},
  ...over,
});
/** Run n frames and return the last entries. */
function run(builder, inp, n) {
  let e;
  for (let i = 0; i < n; i++) {
    e = entry();
    builder.append(inp, e, ASSETS);
  }
  return e;
}
const full = MOTH.growFrames + 1;

// 1. the parts are real assets, and a full moth is body + 2 wings + their fans
{
  for (const id of Object.values(MOTH_PARTS)) assert.ok(asset(id), `${id} is a built-in asset`);
  const e = run(createCreatureBuilder(), input(), full);
  const c = e[0].items.filter((i) => i._creature);
  assert.equal(e[0].items.length, 1 + c.length, "the layer's own marks are kept, in front of the creature");
  assert.equal(c.length, MOTH_ITEMS);
  const real = c.filter((i) => !i.key.includes(':halo:'));
  assert.deepEqual(
    [
      real.filter((i) => i.assetId === MOTH_PARTS.body).length,
      real.filter((i) => i.assetId === MOTH_PARTS.wing).length,
      plumageOf(real).length,
    ],
    [1, 2, 2 * FAN_PER_WING],
  );
  const halos = c.filter((i) => i.key.includes(':halo:'));
  assert.equal(halos.length, 3, 'a halo under the body and each wing, not under every fan part');
  assert.ok(c.indexOf(halos.at(-1)) < c.indexOf(real[0]), 'halos are drawn under every part');
  assert.ok(
    halos.every((h) => h.color === '#111111' && h.scale > real.find((r) => r.assetId === h.assetId).scale),
    'a bg-coloured outline, a little larger',
  );
  assert.equal(real.find((i) => i.assetId === MOTH_PARTS.body).color, '#eeeeee', 'the body is the palette ink');
  assert.ok(
    real.filter((i) => i.assetId === MOTH_PARTS.wing).every((i) => i.color === '#aa0000'),
    'the wings take the most vivid swatch',
  );
  assert.equal(new Set(c.map((i) => i.key)).size, c.length, 'every mark has its own stable key');
  const body = c.find((i) => i.assetId === MOTH_PARTS.body);
  assert.deepEqual([body.x, body.y], [500, 350], 'the body sits on the pin');
  assert.ok(
    c.every(
      (i) =>
        i.alpha === 100 &&
        /^#/.test(i.color) &&
        /^#/.test(i.accent) &&
        Number.isFinite(i.scale + i.x + i.y + i.rotation),
    ),
  );
}

// 2. each wing's ROOT lands on a body attach point (the wet lab's points are what joins the parts)
{
  const bodyPts = autoAttachPoints(asset(MOTH_PARTS.body).svg);
  const wingPts = autoAttachPoints(asset(MOTH_PARTS.wing).svg);
  const { items } = expandHierarchy(
    { x: 0, y: 0, rot: 0, scaleX: MOTH.bodyScale, scaleY: MOTH.bodyScale, part: 'body' },
    mothRecipe({ bodyPoints: bodyPts, wingPoints: wingPts, beat: 0 }),
    { scatter: () => [] },
  );
  const wings = items.filter((i) => i.assetId === MOTH_PARTS.wing);
  assert.equal(wings.length, 2);
  const root = pointToward(wingPts, 'bottom');
  for (const [w, side] of [
    [wings[0], 'right'],
    [wings[1], 'left'],
  ]) {
    const th = (w.rotation * Math.PI) / 180;
    const rx = w.x + (root.x * Math.cos(th) - root.y * Math.sin(th)) * MOTH.wingScale;
    const ry = w.y + (root.x * Math.sin(th) + root.y * Math.cos(th)) * MOTH.wingScale;
    const p = pointToward(bodyPts, side);
    assert.ok(
      Math.abs(rx - p.x * MOTH.bodyScale) < 1e-6 && Math.abs(ry - p.y * MOTH.bodyScale) < 1e-6,
      `${side} wing root meets the body's ${side} point`,
    );
  }
  assert.ok(
    Math.abs(wings[0].x + wings[1].x) < 1e-6 && Math.abs(wings[0].y - wings[1].y) < 1e-6,
    'the wings are mirror images',
  );
  assert.equal(wings[0].rotation, -wings[1].rotation);
}

// 3. the artist's edit moves the join; the shape's own points are used until then
{
  const real = (e) => e.items.filter((i) => i._creature && !i.key.includes(':halo:'));
  const base = real(run(createCreatureBuilder(), input(), full)[0]).find((i) => i.assetId === MOTH_PARTS.wing);
  const edited = real(
    run(
      createCreatureBuilder(),
      input({
        assetAttach: {
          [MOTH_PARTS.body]: [
            { x: 90, y: 50 },
            { x: 10, y: 50 },
          ],
        },
      }),
      full,
    )[0],
  ).find((i) => i.assetId === MOTH_PARTS.wing);
  assert.ok(edited.x > base.x + 5, `a point moved outward moves the wing outward (${base.x} -> ${edited.x})`);
  // "none" is a valid hand edit: the wings fall back to the body's centre rather than crash
  const none = run(createCreatureBuilder(), input({ assetAttach: { [MOTH_PARTS.body]: [] } }), full)[0];
  assert.equal(none.items.filter((i) => i._creature).length, MOTH_ITEMS);
}

// 4. nothing formed: nothing changes (the same array back), and the grow-in starts over
{
  const b = createCreatureBuilder();
  const e = entry();
  const before = e[0].items;
  b.append(input({ dishFormed: [false] }), e, ASSETS);
  assert.equal(e[0].items, before, 'untouched');
  b.append({ seed: 1 }, e, ASSETS);
  b.append(input({ dishFormed: undefined }), e, ASSETS);
  b.append(input({ dishPins: [] }), e, ASSETS);
  assert.equal(e[0].items, before);
  const first = run(b, input(), 1)[0].items.find(
    (i) => i.assetId === MOTH_PARTS.body && !i.key.includes(':halo:'),
  ).scale;
  b.append(input({ dishFormed: [false] }), entry(), ASSETS);
  const again = run(b, input(), 1)[0].items.find(
    (i) => i.assetId === MOTH_PARTS.body && !i.key.includes(':halo:'),
  ).scale;
  assert.equal(first, again, 'unformed then formed grows in from the start again');
}

// 5. it grows in, and reaches full size
{
  const sizes = [1, 10, 30, full].map(
    (n) =>
      run(createCreatureBuilder(), input(), n)[0].items.find(
        (i) => i.assetId === MOTH_PARTS.body && !i.key.includes(':halo:'),
      ).scale,
  );
  for (let i = 1; i < sizes.length; i++)
    assert.ok(sizes[i] > sizes[i - 1], `size grows: ${sizes.map((s) => s.toFixed(3)).join(' < ')}`);
  assert.ok(Math.abs(sizes[3] - MOTH.bodyScale) < 1e-9, 'full size is the named body scale');
}

// 6. the wings beat on the loop clock, symmetric, and it is a pure function of the input
{
  const at = (ms) =>
    run(createCreatureBuilder(), input({ loopTimeMs: ms }), full)[0].items.filter(
      (i) => i.assetId === MOTH_PARTS.wing && !i.key.includes(':halo:'),
    );
  const w0 = at(0);
  const w1 = at(MOTH.flapMs / 4);
  assert.ok(Math.abs(w1[0].rotation - w0[0].rotation) > MOTH.flap * 0.9, 'a quarter beat opens the wings');
  assert.ok(Math.abs(w1[0].rotation + w1[1].rotation) < 1e-9, 'both wings beat together');
  assert.deepEqual(JSON.stringify(at(1234)), JSON.stringify(at(1234)), 'same input, same moth');
  const a = plumageOf(run(createCreatureBuilder(), input({ seed: 1 }), full)[0].items).map((i) => [i.x, i.y]);
  const b = plumageOf(run(createCreatureBuilder(), input({ seed: 2 }), full)[0].items).map((i) => [i.x, i.y]);
  assert.notDeepEqual(a, b, 'a different dish grows its fans differently');
}

// 7. the fan sits on the wings and mirrors across the body
{
  const c = run(createCreatureBuilder(), input(), full)[0].items.filter(
    (i) => i._creature && !i.key.includes(':halo:'),
  );
  const wings = c.filter((i) => i.assetId === MOTH_PARTS.wing);
  const marks = plumageOf(c);
  const right = marks
    .filter((m) => m.x > 500)
    .map((m) => [Math.round((m.x - 500) * 1e3), Math.round(m.y * 1e3)])
    .sort();
  const left = marks
    .filter((m) => m.x < 500)
    .map((m) => [Math.round((500 - m.x) * 1e3), Math.round(m.y * 1e3)])
    .sort();
  assert.equal(right.length, FAN_PER_WING);
  assert.equal(left.length, FAN_PER_WING);
  assert.deepEqual(left, right, 'the left fan is the right fan mirrored');
  const wingReach = Math.max(...wings.map((w) => Math.hypot(w.x - 500, w.y - 350))) + 60;
  assert.ok(
    marks.every((m) => Math.hypot(m.x - 500, m.y - 350) < wingReach + 100),
    'fan parts stay near the wings',
  );
}

// 8. the creature's own marks are not the crowd that formed it (it must be able to unform)
{
  const c = run(createCreatureBuilder(), input(), full);
  assert.equal(pinPressures([{ x: 500, y: 350 }], c, 1000, 700)[0], 0);
  const withCrowd = [{ items: [...c[0].items, ...Array.from({ length: 12 }, () => ({ x: 505, y: 355 }))] }];
  assert.equal(pinPressures([{ x: 500, y: 350 }], withCrowd, 1000, 700)[0], 12 / 24, 'only real neighbours count');
}

// 9. through the real resolver: a formed pin adds the moth on the top content layer; without it, byte-identical
{
  const base = {
    canvasW: 1000,
    canvasH: 700,
    layers: [{ id: 'a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'a',
    layerSnapshots: {},
    seed: 1234,
    seedOffsets: null,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 60, particleCount: 60 },
    caGrid: null,
    enabledAssets: null,
    assetWeightOverrides: {},
    customAssets: [],
    quality: 'balanced',
    lockedParams: {},
    batchPaused: false,
    focusSwap: false,
    loopTimeMs: 0,
    dtSec: 1 / 60,
    perfClampOverride: null,
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    scaleMul: 1,
    alphaBoost: 0,
    effectiveScale: [0.5, 1.5],
    effectiveAlpha: [20, 100],
    phraseWrapGen: 0,
    attractor: null,
  };
  const key = (out) =>
    JSON.stringify(out.map((e) => (e.items || []).map((i) => [i.x, i.y, i.scale, i.assetId, i.key])));
  const plain = createLiveResolver();
  const pinned = createLiveResolver();
  const withPins = { ...base, dishPins: [{ x: 500, y: 350 }], dishFormed: [false], assetAttach: {} };
  assert.equal(
    key(pinned.resolveLayers(withPins)),
    key(plain.resolveLayers(base)),
    'pins that have not formed change nothing',
  );
  const out = pinned.resolveLayers({ ...withPins, dishFormed: [true] });
  const layer = out.find((e) => Array.isArray(e.items));
  assert.equal(layer.items.filter((i) => i._creature).length, MOTH_ITEMS);
  assert.equal(layer.items.at(-1)._creature, true, 'the creature is drawn last, on top');
  plain.dispose();
  pinned.dispose();
  // and a take can replay it: the same inputs give the same creature on a fresh resolver
  const a = createLiveResolver();
  const b = createLiveResolver();
  const seq = [0, 1, 2, 3].map((n) => ({
    ...base,
    dishPins: [{ x: 500, y: 350 }],
    dishFormed: [true],
    loopTimeMs: n * 16.7,
  }));
  assert.equal(key(seq.map((s) => a.resolveLayers(s)).at(-1)), key(seq.map((s) => b.resolveLayers(s)).at(-1)));
  a.dispose();
  b.dispose();
}

// 10. wiring: the loop carries the decision and the attach points; the app supplies the decision
{
  const loop = readFileSync(new URL('../gl/liveLoop.mjs', import.meta.url), 'utf8');
  assert.ok(
    /dishFormed: spawnDecisions \? spawnDecisions\.dishFormed/.test(loop) && /assetAttach: s\.assetAttach/.test(loop),
  );
  // #1694 slice 1 — the decision's source moved: the resolver publishes it (no provider registered by App any more)
  const resolve = readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8');
  assert.ok(
    /lastSpawnDecisions = spawnState\.observe\(input, out\)/.test(resolve),
    'the resolver publishes the spawn decisions',
  );
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.ok(!/setFormedProvider/.test(app), 'the provider channel is retired');
  const src = readFileSync(new URL('./creature.js', import.meta.url), 'utf8');
  assert.ok(
    !/Date\.now|performance\.now|setTimeout|setInterval|Math\.random|from '\.\.\/curator/.test(src),
    'no clock, no chance, no curator import',
  );
}

// 11. the decision is main's formation rule: a pin it has formed reads as formed for the next frame's input
{
  const { fertilityField, FORM_HOLD_FRAMES } = await import('../curator/formation.js');
  const { observeFormation, getFormedPins, resetFormation } = await import('../curator/formationLive.js');
  resetFormation();
  assert.deepEqual(getFormedPins(), [], 'nothing pinned: nothing formed');
  const f = fertilityField(5, null, 1000, 700);
  let spot = null;
  for (let x = 25; x < 1000 && !spot; x += 25)
    for (let y = 25; y < 700 && !spot; y += 25) if (f.at(x, y) > 0.7) spot = { x, y };
  assert.ok(spot, 'the seed has a fertile place');
  const crowd = [{ items: Array.from({ length: 16 }, (_, i) => ({ x: spot.x + (i % 4), y: spot.y + (i % 3) })) }];
  const inp = { dishPins: [spot], canvasW: 1000, canvasH: 700, seed: 5, seedOffsets: null };
  for (let i = 0; i < FORM_HOLD_FRAMES - 1; i++) observeFormation(inp, crowd, () => 'normal');
  assert.deepEqual(getFormedPins(), [false], 'held for fewer frames than the rule asks: still a spore');
  observeFormation(inp, crowd, () => 'normal');
  assert.deepEqual(getFormedPins(), [true], 'held long enough: formed');
  resetFormation();
}

// 12. the second pair (step 5): the crowd decides; two pairs is the most; it grows in and out; step 4's look is unchanged at one
{
  const { MOTH: M } = await import('./creature.js');
  const real = (e) => e[0].items.filter((i) => i._creature && !i.key.includes(':halo:'));
  const wings = (e) => real(e).filter((i) => i.assetId === MOTH_PARTS.wing);
  const marks = (e) => plumageOf(real(e));
  const frames = full + M.pairFrames + 2;
  // one pair (or no instruction): exactly what step 4 drew
  assert.equal(wings(run(createCreatureBuilder(), input(), frames)).length, 2);
  assert.equal(wings(run(createCreatureBuilder(), input({ dishLimbs: [1] }), frames)).length, 2);
  // two pairs: four wings, the TE four, and a fan on the hind pair too
  const two = run(createCreatureBuilder(), input({ dishLimbs: [2] }), frames);
  assert.equal(wings(two).length, 4, 'four wings: two pairs');
  assert.equal(marks(two).length, 2 * FAN_PER_WING + 2 * FAN_PER_HIND);
  assert.equal(
    two[0].items.filter((i) => i._creature).length,
    MOTH_ITEMS + 4 + 2 * FAN_PER_HIND,
    'two more halos, two more wings, their fans',
  );
  const dishLimbsHuge = run(createCreatureBuilder(), input({ dishLimbs: [9] }), frames);
  assert.equal(wings(dishLimbsHuge).length, 4, 'never more than four wings, whatever it is told');
  // the hind pair hangs from the body below and outside the fore pair, smaller, and mirrors
  const [fr, fl, hr, hl] = wings(two);
  assert.ok(hr.y > fr.y, 'the hind wings sit lower');
  assert.ok(Math.abs(hr.scale) < Math.abs(fr.scale), 'and smaller');
  assert.ok(
    Math.abs(hr.x - 500 + (hl.x - 500)) < 1e-6 && Math.abs(hr.rotation + hl.rotation) < 1e-6,
    'a mirrored pair',
  );
  assert.notEqual(hr.color, fr.color, 'the two pairs read apart');
  // it grows in over pairFrames (never pops) and goes out the same way
  const b = createCreatureBuilder();
  run(b, input({ dishLimbs: [1] }), full);
  const sizes = [];
  for (let i = 0; i < M.pairFrames + 2; i++) {
    const e = entry();
    b.append(input({ dishLimbs: [2] }), e, ASSETS);
    sizes.push(wings(e).filter((_, k) => k >= 2).length ? Math.abs(wings(e)[2].scale) : 0);
  }
  assert.equal(
    sizes[0] > 0 && sizes[0] < sizes.at(-1),
    true,
    `it starts small and ends full: ${sizes[0].toFixed(3)} -> ${sizes.at(-1).toFixed(3)}`,
  );
  for (let i = 2; i < sizes.length; i++)
    assert.ok(sizes[i] >= sizes[i - 1] - 1e-3, `monotone growth: ${sizes.map((x) => x.toFixed(3)).join(' ')}`);
  let gone = false;
  for (let i = 0; i < M.pairFrames + 2; i++) {
    const e = entry();
    b.append(input({ dishLimbs: [1] }), e, ASSETS);
    gone = wings(e).length === 2;
  }
  assert.ok(gone, 'and it shrinks out again when the crowd thins');
  // unformed resets the second pair
  b.append(input({ dishFormed: [false] }), entry(), ASSETS);
  assert.equal(wings(run(b, input({ dishLimbs: [1] }), 1)).length, 2);
  // through the real resolver: replayable (same inputs, same four wings)
  const lp = { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 60, particleCount: 60 };
  const base = {
    canvasW: 1000,
    canvasH: 700,
    layers: [{ id: 'a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'a',
    layerSnapshots: {},
    seed: 1234,
    seedOffsets: null,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    layoutParams: lp,
    caGrid: null,
    enabledAssets: null,
    assetWeightOverrides: {},
    customAssets: [],
    quality: 'balanced',
    lockedParams: {},
    batchPaused: false,
    focusSwap: false,
    loopTimeMs: 0,
    dtSec: 1 / 60,
    perfClampOverride: null,
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    scaleMul: 1,
    alphaBoost: 0,
    effectiveScale: [0.5, 1.5],
    effectiveAlpha: [20, 100],
    phraseWrapGen: 0,
    attractor: null,
    dishPins: [{ x: 500, y: 350 }],
    dishFormed: [true],
    assetAttach: {},
  };
  const seq = (limbs) =>
    Array.from({ length: frames }, (_, n) => ({ ...base, dishLimbs: limbs, loopTimeMs: n * 16.7 }));
  const play = (s) => {
    const r = createLiveResolver();
    let o;
    for (const x of s) o = r.resolveLayers(x);
    r.dispose();
    return JSON.stringify(o.map((e) => (e.items || []).map((i) => [i.x, i.y, i.scale, i.assetId, i.key])));
  };
  assert.equal(play(seq([2])), play(seq([2])), 'a take replays its limbs');
  assert.notEqual(play(seq([2])), play(seq([1])), 'and the second pair really is in the picture');
}

// 13. HOVER: the moth drifts near its pin on the assets' own living-motion floor, and stops when they stop
{
  const { HOVER, hoverPose } = await import('./creature.js');
  const ctx = (driverSec, amounts = { breath: 0.3, drift: 0.5 }) => ({
    driverSec,
    amounts,
    canvasW: 1000,
    canvasH: 700,
  });
  const rest = { dx: 0, dy: 0, rot: 0, scale: 1 };
  // at rest: on the pin (anchored), and nothing moves when nothing is asked
  assert.deepEqual(hoverPose(ctx(0), 7, 0), rest, 'driver time 0 is the placed picture');
  assert.deepEqual(hoverPose(null, 7, 0), rest, 'a held or frozen instrument: no motion context, no hover');
  assert.deepEqual(hoverPose(ctx(5, { breath: 0, drift: 0 }), 7, 0), rest, 'both dials at zero: still');
  assert.deepEqual(hoverPose(ctx(NaN), 7, 0), rest);
  // it moves, within the reach the DRIFT dial sets, and never further
  let maxD = 0;
  let maxR = 0;
  let minS = 1;
  let maxS = 1;
  let moved = 0;
  for (let t = 0; t < 120; t += 0.37) {
    const p = hoverPose(ctx(t), 7, 0);
    maxD = Math.max(maxD, Math.hypot(p.dx, p.dy));
    maxR = Math.max(maxR, Math.abs(p.rot));
    minS = Math.min(minS, p.scale);
    maxS = Math.max(maxS, p.scale);
    if (Math.abs(p.dx) + Math.abs(p.dy) > 1) moved++;
  }
  const reach = 0.5 * HOVER.reach * 700;
  assert.ok(moved > 100 && maxD > reach * 0.5, `it wanders (${maxD.toFixed(1)} px of a ${reach.toFixed(0)} px reach)`);
  assert.ok(
    maxD <= reach * 2 * Math.SQRT2 + 1e-9,
    "never beyond the DRIFT dial's reach (a wave measured from rest spans at most twice the amplitude)",
  );
  assert.ok(maxR <= 0.5 * HOVER.tilt * 2 + 1e-9 && maxR > 1, `a gentle tilt (${maxR.toFixed(1)} deg)`);
  assert.ok(
    minS < 1 && maxS > 1 && maxS - minS <= 0.3 * HOVER.breathDepth * 2 + 1e-9,
    'a slow breath, at the BREATH dial',
  );
  // the dials scale it, and the creatures are not in lockstep
  const far = hoverPose(ctx(9, { breath: 0, drift: 1 }), 7, 0);
  const near = hoverPose(ctx(9, { breath: 0, drift: 0.25 }), 7, 0);
  assert.ok(
    Math.abs(far.dx) > Math.abs(near.dx) * 3.5 && Math.abs(far.dx) < Math.abs(near.dx) * 4.5,
    'DRIFT scales the reach',
  );
  assert.notDeepEqual(hoverPose(ctx(9), 7, 0), hoverPose(ctx(9), 7, 1), 'each pin hovers on its own phase');
  assert.deepEqual(hoverPose(ctx(9), 7, 0), hoverPose(ctx(9), 7, 0), 'a pure function of its inputs');

  // in the builder: the body leaves the pin by the pose, the joints do not come apart, and no motion fn = step 5 exactly
  const centre = (e) => {
    const c = e[0].items.filter((i) => i._creature && !i.key.includes(':halo:'));
    return {
      body: c.find((i) => i.assetId === MOTH_PARTS.body),
      wings: c.filter((i) => i.assetId === MOTH_PARTS.wing),
    };
  };
  const still = centre(run(createCreatureBuilder(), input(), full));
  const mv = (driverSec) => (e) => ({ driverSec, amounts: { breath: 0, drift: 0.5 }, canvasW: 1000, canvasH: 700 });
  const build = (motionFn) => {
    const b = createCreatureBuilder();
    let e;
    for (let i = 0; i < full; i++) {
      e = entry();
      b.append(input(), e, ASSETS, motionFn);
    }
    return e;
  };
  const off = centre(build(null));
  assert.equal(off.body.x, still.body.x);
  assert.equal(off.body.y, still.body.y);
  const t0 = centre(build(mv(0)));
  assert.equal(t0.body.x, 500);
  assert.equal(t0.body.y, 350);
  const later = centre(build(mv(9)));
  const pose = hoverPose({ driverSec: 9, amounts: { breath: 0, drift: 0.5 }, canvasW: 1000, canvasH: 700 }, 77, 0);
  assert.ok(
    Math.abs(later.body.x - (500 + pose.dx)) < 1e-6 && Math.abs(later.body.y - (350 + pose.dy)) < 1e-6,
    'the body sits at pin + pose',
  );
  assert.ok(Math.abs(pose.dx) + Math.abs(pose.dy) > 1, 'and that is a real move');
  const gap = (c) => Math.hypot(c.wings[0].x - c.body.x, c.wings[0].y - c.body.y);
  assert.ok(Math.abs(gap(later) - gap(still)) < 1e-6, 'the wing is still joined to the body: it moved as one creature');
  // reduced motion and a throwing/odd context never break a frame
  const rm = createCreatureBuilder();
  const e = entry();
  rm.append({ ...input(), reducedMotion: true }, e, ASSETS, mv(9));
  assert.equal(centre(e).body.x, 500, 'reduced motion: it sits still');
  assert.doesNotThrow(() => createCreatureBuilder().append(input(), entry(), ASSETS, () => null));
}

// 14. TRAITS (Phase 4 step 1): a moth's small recorded set. Defaults are today's moth; ranges are hard limits
{
  const { TRAIT_DEFAULTS, TRAIT_RANGES, normalizeTraits } = await import('./creature.js');
  assert.deepEqual(normalizeTraits(undefined), TRAIT_DEFAULTS);
  assert.deepEqual(normalizeTraits('x'), TRAIT_DEFAULTS);
  assert.deepEqual(
    normalizeTraits({ spread: NaN, wing: 'big', body: null, swatch: Infinity }),
    TRAIT_DEFAULTS,
    'junk reads as the default',
  );
  assert.deepEqual(
    normalizeTraits({ spread: 999, wing: 99, body: 0, swatch: 99 }),
    { spread: 18, wing: 1.25, body: 0.85, swatch: 3 },
    'clamped to the ranges',
  );
  assert.deepEqual(normalizeTraits({ spread: -999, wing: -1, body: 99, swatch: -4 }), {
    spread: -18,
    wing: 0.8,
    body: 1.2,
    swatch: 0,
  });
  assert.equal(normalizeTraits({ swatch: 1.6 }).swatch, 2, 'the swatch is a whole rank');
  assert.ok(Object.isFrozen(TRAIT_DEFAULTS) && Object.isFrozen(TRAIT_RANGES));

  const PALETTE = {
    bg: '#111111',
    ink: '#eeeeee',
    swatches: ['#555555', '#cc2200', '#2266cc', '#33aa33', '#aaaa22', '#888888'],
  };
  const build = (traits, n = full + MOTH.pairFrames + 2, extra = {}) => {
    const b = createCreatureBuilder();
    let e;
    for (let i = 0; i < n; i++) {
      e = [{ id: 'a', items: [], palette: PALETTE }];
      b.append(input({ dishLimbs: [2], dishTraits: traits === undefined ? undefined : [traits], ...extra }), e, ASSETS);
    }
    return e[0].items;
  };
  const real = (items) => items.filter((i) => i._creature && !i.key.includes(':halo:'));
  const body = (items) => real(items).find((i) => i.assetId === MOTH_PARTS.body);
  const fore = (items) =>
    real(items)
      .filter((i) => i.assetId === MOTH_PARTS.wing)
      .slice(0, 2);
  const hind = (items) =>
    real(items)
      .filter((i) => i.assetId === MOTH_PARTS.wing)
      .slice(2, 4);

  // none given = explicit defaults = step 5's moth, byte for byte
  assert.equal(JSON.stringify(build(undefined)), JSON.stringify(build({ ...TRAIT_DEFAULTS })));
  assert.equal(JSON.stringify(build(undefined)), JSON.stringify(build({})));

  // spread: the attachment angle moves by exactly the trait; the hind pair follows at half
  const base = build(undefined);
  const wide = build({ spread: 12 });
  assert.ok(Math.abs(fore(wide)[0].rotation - fore(base)[0].rotation - 12) < 1e-6, 'fore wings open 12 degrees more');
  assert.ok(Math.abs(hind(wide)[0].rotation - hind(base)[0].rotation - 6) < 1e-6, 'the hind pair follows at half');
  assert.equal(body(wide).scale, body(base).scale, 'the body is untouched');

  // wing size: the wings scale, the body does not; body size: the body scales, the wings do not
  const big = build({ wing: 1.25 });
  const fat = build({ body: 1.2 });
  assert.ok(Math.abs(fore(big)[0].scale / fore(base)[0].scale - 1.25) < 1e-9);
  assert.equal(body(big).scale, body(base).scale);
  assert.ok(Math.abs(body(fat).scale / body(base).scale - 1.2) < 1e-9);
  assert.ok(Math.abs(fore(fat)[0].scale - fore(base)[0].scale) < 1e-9, 'a bigger body does not make bigger wings');

  // the joints hold at any trait: each fore wing's root still lands on the body's attach point
  for (const t of [
    { spread: 18, wing: 1.25, body: 0.85 },
    { spread: -18, wing: 0.8, body: 1.2 },
  ]) {
    const items = build(t, full, { loopTimeMs: 0 });
    const bodyPts = autoAttachPoints(asset(MOTH_PARTS.body).svg);
    const wingPts = autoAttachPoints(asset(MOTH_PARTS.wing).svg);
    const root = pointToward(wingPts, 'bottom');
    const w = fore(items)[0];
    const bd = body(items);
    const th = (w.rotation * Math.PI) / 180;
    const rx = w.x + (root.x * Math.cos(th) - root.y * Math.sin(th)) * w.scale;
    const ry = w.y + (root.x * Math.sin(th) + root.y * Math.cos(th)) * w.scale;
    const p = pointToward(bodyPts, 'right');
    // the body may be hovering/beating: compare against the body's own pose
    const bth = (bd.rotation * Math.PI) / 180;
    const ex = bd.x + (p.x * Math.cos(bth) - p.y * Math.sin(bth)) * bd.scale;
    const ey = bd.y + (p.x * Math.sin(bth) + p.y * Math.cos(bth)) * bd.scale;
    assert.ok(
      Math.hypot(rx - ex, ry - ey) < 1e-6,
      `at ${JSON.stringify(t)} the wing root still meets the body's side point`,
    );
  }

  // swatch: the wings take the rank asked for (0 = the most vivid, as today), the hind pair the next
  const ink = '#eeeeee';
  assert.equal(fore(base)[0].color, '#cc2200', 'default: the most vivid swatch');
  assert.equal(fore(build({ swatch: 1 }))[0].color, '#2266cc', 'rank 1: the next');
  assert.equal(
    hind(build({ swatch: 1 }))[0].color,
    '#aaaa22',
    'the hind pair one rank further (ranked by colourfulness: #cc2200, #2266cc, #aaaa22, #33aa33)',
  );
  assert.equal(fore(build({ swatch: 3 }))[0].color, '#33aa33', 'the fourth most vivid');
  assert.notEqual(fore(build({ swatch: 2 }))[0].color, ink);
  // a palette with few swatches never crashes and never runs off the end
  assert.doesNotThrow(() => build({ swatch: 3 }, full, {}));
  const tiny = createCreatureBuilder();
  const te = [{ id: 'a', items: [], palette: { bg: '#000', ink: '#fff', swatches: ['#f00'] } }];
  assert.doesNotThrow(() => tiny.append(input({ dishTraits: [{ swatch: 3 }] }), te, ASSETS));

  // extreme input is held to the ranges inside the builder, and pins are independent
  const huge = build({ spread: 9999, wing: 9999, body: 9999 });
  assert.ok(Math.abs(fore(huge)[0].rotation - fore(base)[0].rotation - 18) < 1e-6);
  assert.ok(Math.abs(fore(huge)[0].scale / fore(base)[0].scale - 1.25) < 1e-9);
  const two = (() => {
    const b = createCreatureBuilder();
    let e;
    for (let i = 0; i < full; i++) {
      e = [{ id: 'a', items: [], palette: PALETTE }];
      b.append(
        {
          ...input(),
          dishPins: [
            { x: 300, y: 350 },
            { x: 700, y: 350 },
          ],
          dishFormed: [true, true],
          dishLimbs: [1, 1],
          dishTraits: [{ spread: 15 }, null],
        },
        e,
        ASSETS,
      );
    }
    return real(e[0].items).filter((i) => i.assetId === MOTH_PARTS.wing);
  })();
  const left = two.filter((w) => w.x < 500);
  const right = two.filter((w) => w.x > 500);
  assert.ok(
    Math.abs(Math.abs(left[0].rotation) - Math.abs(right[0].rotation) - 15) < 1e-6,
    'one moth carries its traits, the next does not',
  );
}

// 15. GROUND (Matt 2026-10-13, option A): the moth obeys the dials the marks do, through the same functions
{
  const { groundTreatment } = await import('./creature.js');
  const { nudgeAxis } = await import('./groundNudge.js');
  const { applyLean } = await import('./kernel/color/index.js');
  const { snapPair } = await import('./groundSnap.js');
  const ROLES = ['#112233', '#445566', '#778899'];
  const dish = (over = {}) => ({
    ground: () => '#336699',
    groundRoles: () => ROLES,
    groundCell: () => ({ u: 0.05, v: 0.5, size: 100 }),
    ...over,
  });
  const g = (knobs, d = dish()) => ({ dish: d, lean: 0, nudge: 0, snap: 0, shadow: 0, ...knobs });

  // no ground, or every dial at 0: nothing happens (the moth is exactly as before)
  for (const gr of [null, undefined, {}, g({})]) {
    const t = groundTreatment(gr, 10, 10, 0, 7);
    assert.deepEqual([t.dx, t.dy, t.halo], [0, 0, null]);
    assert.deepEqual(t.recolor('#aa0000', '#00aa00'), ['#aa0000', '#00aa00']);
  }
  // EDGE: the same nudge the marks get, in tile units, pointing inward
  const n = groundTreatment(g({ nudge: 1 }), 10, 10, 0, 7);
  assert.ok(
    Math.abs(n.dx - nudgeAxis(0.05, 1) * 100) < 1e-12 && n.dx > 0 && n.dy === 0,
    'eased inward off the left edge',
  );
  // LEAN: the colour mixes toward the tile, exactly as a mark's does; the accent is left (as a mark's accent is)
  const l = groundTreatment(g({ lean: 0.5 }), 10, 10, 0, 7);
  assert.deepEqual(l.recolor('#aa0000', '#00aa00'), [applyLean('#aa0000', '#336699', 0.5), '#00aa00']);
  assert.equal(l.halo, '#336699', "the halo takes the tile's own colour");
  // SNAP at full share: the whole moth takes the tile's colours exactly (both colours, like a mark)
  const sn = groundTreatment(g({ snap: 1 }), 10, 10, 0, 7);
  const want = snapPair('#aa0000', '#00aa00', ROLES);
  assert.deepEqual(sn.recolor('#aa0000', '#00aa00'), [want.color, want.accent]);
  assert.ok(ROLES.includes(sn.recolor('#aa0000', '#00aa00')[0]));
  // a share below 1 snaps a fixed set: the same moths every call, and raising it only ever adds
  const set = (share) =>
    Array.from(
      { length: 40 },
      (_, i) => groundTreatment(g({ snap: share }), 0, 0, i, 3).recolor('#aa0000', '#00aa00')[0] !== '#aa0000',
    );
  assert.deepEqual(set(0.5), set(0.5));
  const half = set(0.5);
  const most = set(0.9);
  assert.ok(half.some(Boolean) && half.some((v) => !v), 'about half snap');
  assert.ok(
    half.every((v, i) => !v || most[i]),
    'raising the share only adds moths',
  );
  // a ground that throws or returns junk never breaks a frame
  assert.doesNotThrow(() =>
    groundTreatment(
      g({ lean: 1, snap: 1, nudge: 1 }, { ground: () => 5, groundRoles: () => null, groundCell: () => null }),
      1,
      1,
      0,
      7,
    ),
  );

  // through the builder: the moth moves by the nudge, takes the tile's colour, and no ground = exactly step 5
  const build = (groundFn) => {
    const b = createCreatureBuilder();
    let e;
    for (let i = 0; i < full; i++) {
      e = entry();
      b.append(input(), e, ASSETS, null, groundFn);
    }
    return e[0].items;
  };
  const plain = build(null);
  assert.equal(JSON.stringify(build(() => null)), JSON.stringify(plain), 'a layer with no ground is exactly as before');
  assert.equal(JSON.stringify(build(() => g({}))), JSON.stringify(plain), 'every dial at 0 is exactly as before');
  const snapped = build(() => g({ snap: 1 }));
  const bodyOf = (items) =>
    items.find((i) => i._creature && i.assetId === MOTH_PARTS.body && !i.key.includes(':halo:'));
  assert.ok(ROLES.includes(bodyOf(snapped).color), 'the body takes a tile colour');
  assert.equal(snapped.find((i) => i._creature && i.key.includes(':halo:')).color, '#336699', 'the halo is the tile');
  const nudged = build(() => g({ nudge: 1 }));
  assert.ok(bodyOf(nudged).x > bodyOf(plain).x && bodyOf(nudged).y === bodyOf(plain).y, 'nudged inward off the edge');

  // through the real resolver, over a real pattern ground: the moth takes the dial; shadow rides the layer for free
  const { defaultPattern } = await import('../state/patternTrack.js');
  const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
  const run2 = (knobs, withGround = true) => {
    const lp = { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 40, particleCount: 40, ...knobs };
    const layers = withGround ? [L('p', { type: 'pattern', pattern: defaultPattern('QUILT', 7) }), L('a')] : [L('a')];
    const r = createLiveResolver();
    let out;
    for (let n = 0; n < full; n++) {
      out = r.resolveLayers({
        canvasW: 1000,
        canvasH: 700,
        layers,
        activeLayerId: 'a',
        layerSnapshots: {},
        seed: 1234,
        seedOffsets: null,
        paletteId: 'bone',
        paletteOverrides: null,
        userPalettes: [],
        layoutParams: lp,
        caGrid: null,
        enabledAssets: null,
        assetWeightOverrides: {},
        customAssets: [],
        quality: 'balanced',
        lockedParams: {},
        batchPaused: false,
        focusSwap: false,
        loopTimeMs: n * 16.7,
        dtSec: 1 / 60,
        perfClampOverride: null,
        perfTier1: false,
        assetThin: false,
        slowRender: false,
        scaleMul: 1,
        alphaBoost: 0,
        effectiveScale: [0.5, 1.5],
        effectiveAlpha: [20, 100],
        phraseWrapGen: 0,
        attractor: null,
        dishPins: [{ x: 500, y: 350 }],
        dishFormed: [true],
        assetAttach: {},
      });
    }
    r.dispose();
    const items = out
      .filter((e) => Array.isArray(e.items) && !e.isPattern && !e.isFx)
      .at(-1)
      .items.filter((i) => i._creature);
    return items;
  };
  const off = run2({ groundSnap: 0, groundLean: 0 });
  const offNoPattern = run2({ groundSnap: 1 }, false);
  assert.equal(
    JSON.stringify(offNoPattern),
    JSON.stringify(run2({ groundSnap: 0 }, false)),
    'SNAP with no pattern below does nothing, like a mark',
  );
  const onSnap = run2({ groundSnap: 1 });
  const colourOf = (items) => items.find((i) => i.assetId === MOTH_PARTS.body && !i.key.includes(':halo:')).color;
  assert.notEqual(colourOf(onSnap), colourOf(off), 'with a pattern below and SNAP up, the moth takes a tile colour');
  assert.notEqual(
    onSnap.find((i) => i.key.includes(':halo:')).color,
    off.find((i) => i.key.includes(':halo:')).color,
    'and the halo is the tile',
  );
  assert.equal(JSON.stringify(run2({ groundSnap: 1 })), JSON.stringify(onSnap), 'deterministic');
}

console.log('creature.selfcheck: ok (#1355 step 4, the moth)');
