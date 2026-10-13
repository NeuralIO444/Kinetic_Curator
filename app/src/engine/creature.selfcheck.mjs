// node src/engine/creature.selfcheck.mjs
// #1355 step 4 — the moth: a formed pin becomes body + two wings + scales, from the artist's attach points.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS } from '../data/assets/index.js';
import { createCreatureBuilder, MOTH, MOTH_PARTS, mothRecipe, pointToward } from './creature.js';
import { autoAttachPoints } from './autoAttach.js';
import { expandHierarchy } from './hierarchy.js';
import { pinPressures } from '../curator/dishPressure.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const asset = (id) => ASSETS.find((a) => a.id === id);
const SW = ['#aa0000', '#222222', '#333333', '#444444', '#555555', '#666666'];
const PAL = { bg: '#111111', ink: '#eeeeee', swatches: SW };
const MOTH_MARKS = 3 + 1 + 2 + 2 * MOTH.marksPerWing; // halos + body + wings + scales
const entry = () => [{ id: 'a', items: [{ x: 1, y: 1, assetId: 'x' }], palette: PAL }];
const input = (over = {}) => ({
  dishPins: [{ x: 500, y: 350 }], dishFormed: [true], seed: 77, seedOffsets: null, loopTimeMs: 0, assetAttach: {}, ...over,
});
/** Run n frames and return the last entries. */
function run(builder, inp, n) {
  let e;
  for (let i = 0; i < n; i++) { e = entry(); builder.append(inp, e, ASSETS); }
  return e;
}
const full = MOTH.growFrames + 1;

// 1. the parts are real assets, and a full moth is body + 2 wings + scales
{
  for (const id of Object.values(MOTH_PARTS)) assert.ok(asset(id), `${id} is a built-in asset`);
  const e = run(createCreatureBuilder(), input(), full);
  const c = e[0].items.filter((i) => i._creature);
  assert.equal(e[0].items.length, 1 + c.length, 'the layer\'s own marks are kept, in front of the creature');
  assert.equal(c.length, MOTH_MARKS);
  const real = c.filter((i) => !i.key.includes(':halo:'));
  assert.deepEqual(
    [real.filter((i) => i.assetId === MOTH_PARTS.body).length, real.filter((i) => i.assetId === MOTH_PARTS.wing).length, real.filter((i) => i.assetId === MOTH_PARTS.mark).length],
    [1, 2, 2 * MOTH.marksPerWing],
  );
  const halos = c.filter((i) => i.key.includes(':halo:'));
  assert.equal(halos.length, 3, 'a halo under the body and each wing, not under every scale');
  assert.ok(c.indexOf(halos.at(-1)) < c.indexOf(real[0]), 'halos are drawn under every part');
  assert.ok(halos.every((h) => h.color === '#111111' && h.scale > real.find((r) => r.assetId === h.assetId).scale), 'a bg-coloured outline, a little larger');
  assert.equal(real.find((i) => i.assetId === MOTH_PARTS.body).color, '#eeeeee', 'the body is the palette ink');
  assert.ok(real.filter((i) => i.assetId === MOTH_PARTS.wing).every((i) => i.color === '#aa0000'), 'the wings take the most vivid swatch');
  assert.equal(new Set(c.map((i) => i.key)).size, c.length, 'every mark has its own stable key');
  const body = c.find((i) => i.assetId === MOTH_PARTS.body);
  assert.deepEqual([body.x, body.y], [500, 350], 'the body sits on the pin');
  assert.ok(c.every((i) => i.alpha === 100 && /^#/.test(i.color) && /^#/.test(i.accent) && Number.isFinite(i.scale + i.x + i.y + i.rotation)));
}

// 2. each wing's ROOT lands on a body attach point (the wet lab's points are what joins the parts)
{
  const bodyPts = autoAttachPoints(asset(MOTH_PARTS.body).svg);
  const wingPts = autoAttachPoints(asset(MOTH_PARTS.wing).svg);
  const { items } = expandHierarchy({ x: 0, y: 0, rot: 0, scaleX: MOTH.bodyScale, scaleY: MOTH.bodyScale, part: 'body' },
    mothRecipe({ bodyPoints: bodyPts, wingPoints: wingPts, beat: 0 }), { scatter: () => [] });
  const wings = items.filter((i) => i.assetId === MOTH_PARTS.wing);
  assert.equal(wings.length, 2);
  const root = pointToward(wingPts, 'bottom');
  for (const [w, side] of [[wings[0], 'right'], [wings[1], 'left']]) {
    const th = (w.rotation * Math.PI) / 180;
    const rx = w.x + (root.x * Math.cos(th) - root.y * Math.sin(th)) * MOTH.wingScale;
    const ry = w.y + (root.x * Math.sin(th) + root.y * Math.cos(th)) * MOTH.wingScale;
    const p = pointToward(bodyPts, side);
    assert.ok(Math.abs(rx - p.x * MOTH.bodyScale) < 1e-6 && Math.abs(ry - p.y * MOTH.bodyScale) < 1e-6, `${side} wing root meets the body's ${side} point`);
  }
  assert.ok(Math.abs(wings[0].x + wings[1].x) < 1e-6 && Math.abs(wings[0].y - wings[1].y) < 1e-6, 'the wings are mirror images');
  assert.equal(wings[0].rotation, -wings[1].rotation);
}

// 3. the artist's edit moves the join; the shape's own points are used until then
{
  const real = (e) => e.items.filter((i) => i._creature && !i.key.includes(':halo:'));
  const base = real(run(createCreatureBuilder(), input(), full)[0]).find((i) => i.assetId === MOTH_PARTS.wing);
  const edited = real(run(createCreatureBuilder(), input({ assetAttach: { [MOTH_PARTS.body]: [{ x: 90, y: 50 }, { x: 10, y: 50 }] } }), full)[0])
    .find((i) => i.assetId === MOTH_PARTS.wing);
  assert.ok(edited.x > base.x + 5, `a point moved outward moves the wing outward (${base.x} -> ${edited.x})`);
  // "none" is a valid hand edit: the wings fall back to the body's centre rather than crash
  const none = run(createCreatureBuilder(), input({ assetAttach: { [MOTH_PARTS.body]: [] } }), full)[0];
  assert.equal(none.items.filter((i) => i._creature).length, MOTH_MARKS);
}

// 4. nothing formed: nothing changes (the same array back), and the grow-in starts over
{
  const b = createCreatureBuilder();
  const e = entry(); const before = e[0].items;
  b.append(input({ dishFormed: [false] }), e, ASSETS);
  assert.equal(e[0].items, before, 'untouched');
  b.append({ seed: 1 }, e, ASSETS); b.append(input({ dishFormed: undefined }), e, ASSETS); b.append(input({ dishPins: [] }), e, ASSETS);
  assert.equal(e[0].items, before);
  const first = run(b, input(), 1)[0].items.find((i) => i.assetId === MOTH_PARTS.body && !i.key.includes(':halo:')).scale;
  b.append(input({ dishFormed: [false] }), entry(), ASSETS);
  const again = run(b, input(), 1)[0].items.find((i) => i.assetId === MOTH_PARTS.body && !i.key.includes(':halo:')).scale;
  assert.equal(first, again, 'unformed then formed grows in from the start again');
}

// 5. it grows in, and reaches full size
{
  const sizes = [1, 10, 30, full].map((n) => run(createCreatureBuilder(), input(), n)[0].items.find((i) => i.assetId === MOTH_PARTS.body && !i.key.includes(':halo:')).scale);
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] > sizes[i - 1], `size grows: ${sizes.map((s) => s.toFixed(3)).join(' < ')}`);
  assert.ok(Math.abs(sizes[3] - MOTH.bodyScale) < 1e-9, 'full size is the named body scale');
}

// 6. the wings beat on the loop clock, symmetric, and it is a pure function of the input
{
  const at = (ms) => run(createCreatureBuilder(), input({ loopTimeMs: ms }), full)[0].items.filter((i) => i.assetId === MOTH_PARTS.wing && !i.key.includes(':halo:'));
  const w0 = at(0); const w1 = at(MOTH.flapMs / 4);
  assert.ok(Math.abs(w1[0].rotation - w0[0].rotation) > MOTH.flap * 0.9, 'a quarter beat opens the wings');
  assert.ok(Math.abs(w1[0].rotation + w1[1].rotation) < 1e-9, 'both wings beat together');
  assert.deepEqual(JSON.stringify(at(1234)), JSON.stringify(at(1234)), 'same input, same moth');
  const a = run(createCreatureBuilder(), input({ seed: 1 }), full)[0].items.filter((i) => i.assetId === MOTH_PARTS.mark).map((i) => [i.x, i.y]);
  const b = run(createCreatureBuilder(), input({ seed: 2 }), full)[0].items.filter((i) => i.assetId === MOTH_PARTS.mark).map((i) => [i.x, i.y]);
  assert.notDeepEqual(a, b, 'a different dish scatters its scales differently');
}

// 7. scales sit on the wings and mirror across the body
{
  const c = run(createCreatureBuilder(), input(), full)[0].items.filter((i) => i._creature && !i.key.includes(':halo:'));
  const wings = c.filter((i) => i.assetId === MOTH_PARTS.wing);
  const marks = c.filter((i) => i.assetId === MOTH_PARTS.mark);
  const right = marks.filter((m) => m.x > 500).map((m) => [Math.round((m.x - 500) * 1e3), Math.round(m.y * 1e3)]).sort();
  const left = marks.filter((m) => m.x < 500).map((m) => [Math.round((500 - m.x) * 1e3), Math.round(m.y * 1e3)]).sort();
  assert.equal(right.length, MOTH.marksPerWing); assert.equal(left.length, MOTH.marksPerWing);
  assert.deepEqual(left, right, 'the left scales are the right scales mirrored');
  const wingReach = Math.max(...wings.map((w) => Math.hypot(w.x - 500, w.y - 350))) + 60;
  assert.ok(marks.every((m) => Math.hypot(m.x - 500, m.y - 350) < wingReach + 100), 'scales stay near the wings');
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
    canvasW: 1000, canvasH: 700, layers: [{ id: 'a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'a', layerSnapshots: {}, seed: 1234, seedOffsets: null, paletteId: 'bone', paletteOverrides: null,
    userPalettes: [], layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 60, particleCount: 60 }, caGrid: null,
    enabledAssets: null, assetWeightOverrides: {}, customAssets: [], quality: 'balanced', lockedParams: {}, batchPaused: false,
    focusSwap: false, loopTimeMs: 0, dtSec: 1 / 60, perfClampOverride: null, perfTier1: false, assetThin: false,
    slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null,
  };
  const key = (out) => JSON.stringify(out.map((e) => (e.items || []).map((i) => [i.x, i.y, i.scale, i.assetId, i.key])));
  const plain = createLiveResolver();
  const pinned = createLiveResolver();
  const withPins = { ...base, dishPins: [{ x: 500, y: 350 }], dishFormed: [false], assetAttach: {} };
  assert.equal(key(pinned.resolveLayers(withPins)), key(plain.resolveLayers(base)), 'pins that have not formed change nothing');
  const out = pinned.resolveLayers({ ...withPins, dishFormed: [true] });
  const layer = out.find((e) => Array.isArray(e.items));
  assert.equal(layer.items.filter((i) => i._creature).length, MOTH_MARKS);
  assert.equal(layer.items.at(-1)._creature, true, 'the creature is drawn last, on top');
  plain.dispose(); pinned.dispose();
  // and a take can replay it: the same inputs give the same creature on a fresh resolver
  const a = createLiveResolver(); const b = createLiveResolver();
  const seq = [0, 1, 2, 3].map((n) => ({ ...base, dishPins: [{ x: 500, y: 350 }], dishFormed: [true], loopTimeMs: n * 16.7 }));
  assert.equal(key(seq.map((s) => a.resolveLayers(s)).at(-1)), key(seq.map((s) => b.resolveLayers(s)).at(-1)));
  a.dispose(); b.dispose();
}

// 10. wiring: the loop carries the decision and the attach points; the app supplies the decision
{
  const loop = readFileSync(new URL('../gl/liveLoop.mjs', import.meta.url), 'utf8');
  assert.ok(/dishFormed: getFormedPins\(\)/.test(loop) && /assetAttach: s\.assetAttach/.test(loop));
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.ok(/setFormedProvider\(getFormedPins\)/.test(app));
  const src = readFileSync(new URL('./creature.js', import.meta.url), 'utf8');
  assert.ok(!/Date\.now|performance\.now|setTimeout|setInterval|Math\.random|from '\.\.\/curator/.test(src), 'no clock, no chance, no curator import');
}

// 11. the decision is main's formation rule: a pin it has formed reads as formed for the next frame's input
{
  const { fertilityField, FORM_HOLD_FRAMES } = await import('../curator/formation.js');
  const { observeFormation, getFormedPins, resetFormation } = await import('../curator/formationLive.js');
  resetFormation();
  assert.deepEqual(getFormedPins(), [], 'nothing pinned: nothing formed');
  const f = fertilityField(5, null, 1000, 700);
  let spot = null;
  for (let x = 25; x < 1000 && !spot; x += 25) for (let y = 25; y < 700 && !spot; y += 25) if (f.at(x, y) > 0.7) spot = { x, y };
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
  const marks = (e) => real(e).filter((i) => i.assetId === MOTH_PARTS.mark);
  const frames = full + M.pairFrames + 2;
  // one pair (or no instruction): exactly what step 4 drew
  assert.equal(wings(run(createCreatureBuilder(), input(), frames)).length, 2);
  assert.equal(wings(run(createCreatureBuilder(), input({ dishLimbs: [1] }), frames)).length, 2);
  // two pairs: four wings, the TE four, and a few scales on the hind pair
  const two = run(createCreatureBuilder(), input({ dishLimbs: [2] }), frames);
  assert.equal(wings(two).length, 4, 'four wings: two pairs');
  assert.equal(marks(two).length, 2 * M.marksPerWing + 2 * M.marksPerHind);
  assert.equal(two[0].items.filter((i) => i._creature).length, MOTH_MARKS + 4 + 2 * M.marksPerHind, 'two more halos, two more wings, their scales');
  const dishLimbsHuge = run(createCreatureBuilder(), input({ dishLimbs: [9] }), frames);
  assert.equal(wings(dishLimbsHuge).length, 4, 'never more than four wings, whatever it is told');
  // the hind pair hangs from the body below and outside the fore pair, smaller, and mirrors
  const [fr, fl, hr, hl] = wings(two);
  assert.ok(hr.y > fr.y, 'the hind wings sit lower');
  assert.ok(Math.abs(hr.scale) < Math.abs(fr.scale), 'and smaller');
  assert.ok(Math.abs((hr.x - 500) + (hl.x - 500)) < 1e-6 && Math.abs(hr.rotation + hl.rotation) < 1e-6, 'a mirrored pair');
  assert.notEqual(hr.color, fr.color, 'the two pairs read apart');
  // it grows in over pairFrames (never pops) and goes out the same way
  const b = createCreatureBuilder();
  run(b, input({ dishLimbs: [1] }), full);
  const sizes = [];
  for (let i = 0; i < M.pairFrames + 2; i++) {
    const e = entry(); b.append(input({ dishLimbs: [2] }), e, ASSETS);
    sizes.push(wings(e).filter((_, k) => k >= 2).length ? Math.abs(wings(e)[2].scale) : 0);
  }
  assert.equal(sizes[0] > 0 && sizes[0] < sizes.at(-1), true, `it starts small and ends full: ${sizes[0].toFixed(3)} -> ${sizes.at(-1).toFixed(3)}`);
  for (let i = 2; i < sizes.length; i++) assert.ok(sizes[i] >= sizes[i - 1] - 1e-3, `monotone growth: ${sizes.map((x) => x.toFixed(3)).join(' ')}`);
  let gone = false;
  for (let i = 0; i < M.pairFrames + 2; i++) { const e = entry(); b.append(input({ dishLimbs: [1] }), e, ASSETS); gone = wings(e).length === 2; }
  assert.ok(gone, 'and it shrinks out again when the crowd thins');
  // unformed resets the second pair
  b.append(input({ dishFormed: [false] }), entry(), ASSETS);
  assert.equal(wings(run(b, input({ dishLimbs: [1] }), 1)).length, 2);
  // through the real resolver: replayable (same inputs, same four wings)
  const lp = { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 60, particleCount: 60 };
  const base = {
    canvasW: 1000, canvasH: 700, layers: [{ id: 'a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'a', layerSnapshots: {}, seed: 1234, seedOffsets: null, paletteId: 'bone', paletteOverrides: null, userPalettes: [],
    layoutParams: lp, caGrid: null, enabledAssets: null, assetWeightOverrides: {}, customAssets: [], quality: 'balanced', lockedParams: {},
    batchPaused: false, focusSwap: false, loopTimeMs: 0, dtSec: 1 / 60, perfClampOverride: null, perfTier1: false, assetThin: false,
    slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null,
    dishPins: [{ x: 500, y: 350 }], dishFormed: [true], assetAttach: {},
  };
  const seq = (limbs) => Array.from({ length: frames }, (_, n) => ({ ...base, dishLimbs: limbs, loopTimeMs: n * 16.7 }));
  const play = (s) => { const r = createLiveResolver(); let o; for (const x of s) o = r.resolveLayers(x); r.dispose(); return JSON.stringify(o.map((e) => (e.items || []).map((i) => [i.x, i.y, i.scale, i.assetId, i.key]))); };
  assert.equal(play(seq([2])), play(seq([2])), 'a take replays its limbs');
  assert.notEqual(play(seq([2])), play(seq([1])), 'and the second pair really is in the picture');
}

console.log('creature.selfcheck: ok (#1355 step 4, the moth)');
