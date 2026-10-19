// node src/engine/dishCreature.selfcheck.mjs
// #1634 slice 2 — the dish creature's body: a hosted pin becomes a head disc, a spine of discs forms
// behind it, and D3's XPBD links (engine/dishLinks.mjs) hold the compound. Seeded, frame-counted,
// replayable. The moth coexistence contract is pinned here too: a hosted pin grows NO moth.
import assert from 'node:assert/strict';
import { ASSETS } from '../data/assets/index.js';
import { createDishCreatureBuilder, DISH_RADII, DISH_CHAIN_RESTS } from './dishCreature.js';
import { createCreatureBuilder, hoverPose } from './creature.js';

const PAL = { bg: '#0b0e12', ink: '#e8e4da', swatches: ['#7fe07a', '#2ec4b6', '#e0a458', '#b678e0'] };
const PINS = [{ x: 500, y: 350 }, { x: 220, y: 180 }];
const entry = () => [{ id: 'a', items: [], palette: PAL }];
const motionFor = (frame) => () => ({ driverSec: frame / 60, amounts: { breath: 0.5, drift: 1 }, canvasW: 1000, canvasH: 700 });
const input = (frame, over = {}) => ({
  dishPins: PINS, dishFormed: [true, true], dishHosted: [true, false],
  seed: 4242, seedOffsets: null, loopTimeMs: frame * 16.666, reducedMotion: false, assetAttach: {}, ...over,
});
const dishItems = (e) => e[0].items.filter((i) => i.key && i.key.startsWith('dish:'));
/** Run n frames through a fresh builder; return { builder, entries } of the last frame. */
function run(n, over = {}) {
  const b = createDishCreatureBuilder();
  let e = entry();
  for (let f = 0; f < n; f++) { e = entry(); b.append(input(f, over), e, ASSETS, motionFor(f)); }
  return { b, e };
}

// 1 — silence: nothing hosted, nothing formed, nothing drawn (the stage stays byte-identical).
{
  const { b, e } = run(60, { dishHosted: [false, false] });
  assert.equal(e[0].items.length, 0, 'no hosted pin: no items');
  assert.deepEqual(b.lastBodies(), [], 'no hosted pin: no bodies published');
  const unformed = run(60, { dishFormed: [false, false] });
  assert.equal(unformed.e[0].items.length, 0, 'hosted but unformed: no items');
}

// 2 — growth staging: the body sprouts disc by disc (head at once, then one every stagger).
{
  assert.equal(dishItems(run(5).e).length, 4, 'frame 5: the head alone (rim, body, core, eye)');
  assert.equal(dishItems(run(10).e).length, 7, 'frame 10: head + first spine disc');
  assert.equal(dishItems(run(40).e).length, 16, 'frame 40: all five discs drawn');
  const items = dishItems(run(40).e);
  assert.ok(items.every((i) => i._creature === true), 'every disc item is a creature mark (never feeds the crowd)');
  assert.ok(items.every((i) => i.assetId === 'org_blob_01'), 'the discs wear the blob asset');
}

// 3 — the compound holds: after 300 frames of hover, the chain is neither torn nor collapsed,
// and the head LEADS: it sits on its hover point (the same point a moth would occupy — measured
// tracking error 2.2px over frames 180-300; the bound leaves headroom for the spring's lag).
{
  const { b } = run(300);
  const bodies = b.lastBodies();
  assert.equal(bodies[0].length, DISH_RADII.length, 'five discs');
  assert.equal(bodies[1], null, 'the unhosted pin has no dish body');
  for (let k = 0; k < DISH_CHAIN_RESTS.length; k++) {
    const d = Math.hypot(bodies[0][k + 1].x - bodies[0][k].x, bodies[0][k + 1].y - bodies[0][k].y);
    assert.ok(d <= DISH_CHAIN_RESTS[k] * 1.3, `link ${k} holds: ${d.toFixed(1)} vs rest ${DISH_CHAIN_RESTS[k].toFixed(1)}`);
    assert.ok(d >= DISH_CHAIN_RESTS[k] * 0.45, `link ${k} not collapsed: ${d.toFixed(1)}`);
  }
  const hov = hoverPose({ driverSec: 299 / 60, amounts: { breath: 0.5, drift: 1 }, canvasW: 1000, canvasH: 700 }, 4242, 0);
  const track = Math.hypot(bodies[0][0].x - (PINS[0].x + hov.dx), bodies[0][0].y - (PINS[0].y + hov.dy));
  assert.ok(track <= 8, `the head tracks its hover point: ${track.toFixed(1)}px of lag`);
  const home = Math.hypot(bodies[0][0].x - PINS[0].x, bodies[0][0].y - PINS[0].y);
  assert.ok(home <= 130, `and never leaves the neighbourhood: ${home.toFixed(1)}px from its pin at full drift`);
}

// 4 — replay: two fresh builders fed the same 300 frames produce the identical animal, byte for byte.
const GOLDEN_300 = '75c6829a';
{
  const a = run(300); const b2 = run(300);
  assert.equal(JSON.stringify(a.e[0].items), JSON.stringify(b2.e[0].items), 'same frames in, same items out');
  assert.equal(JSON.stringify(a.b.lastBodies()), JSON.stringify(b2.b.lastBodies()), 'same frames in, same body out');
  let h = 0x811c9dc5;
  const s = JSON.stringify(a.e[0].items) + JSON.stringify(a.b.lastBodies());
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const hash = h.toString(16).padStart(8, '0');
  assert.equal(hash, GOLDEN_300, `golden scene hash (got ${hash})`);
}

// 5 — coexistence: the moth builder skips the hosted pin and keeps the other; with no dishHosted
// anywhere (every take from before this slice), both pins grow moths exactly as before.
{
  const moths = createCreatureBuilder();
  const e1 = entry();
  moths.append(input(0), e1, ASSETS);
  assert.ok(!e1[0].items.some((i) => i.key && i.key.startsWith('creature:0:')), 'hosted pin: no moth');
  assert.ok(e1[0].items.some((i) => i.key && i.key.startsWith('creature:1:')), 'the other pin: moth as usual');
  const moths2 = createCreatureBuilder();
  const e2 = entry();
  moths2.append(input(0, { dishHosted: undefined }), e2, ASSETS);
  assert.ok(e2[0].items.some((i) => i.key && i.key.startsWith('creature:0:')), 'no dishHosted: pin 0 moths as before');
}

// 6 — death and rebirth: unhosting clears the body; re-hosting sprouts the identical first frames.
{
  const b = createDishCreatureBuilder();
  let e = entry();
  for (let f = 0; f < 40; f++) { e = entry(); b.append(input(f), e, ASSETS, motionFor(f)); }
  assert.equal(dishItems(e).length, 16, 'grown before the fall');
  for (let f = 40; f < 43; f++) { e = entry(); b.append(input(f, { dishHosted: [false, false] }), e, ASSETS, motionFor(f)); }
  assert.equal(dishItems(e).length, 0, 'unhosted: the body is gone');
  assert.deepEqual(b.lastBodies(), [], 'unhosted: no bodies published');
  let first = 0;
  for (let f = 0; f < 5; f++) { e = entry(); b.append(input(f), e, ASSETS, motionFor(f)); first = dishItems(e).length; }
  assert.equal(first, 4, 'rebirth replays the birth: head alone at frame 5');
}

// ---------------------------------------------------------------------------
// Slice 3 — the limb: L anchors (the artist's marks) choose where; the pin's dish pressure decides
// whether and how much. One L at the blob's right-middle, unless a block says otherwise.
const L1 = { org_blob_01: [{ x: 85, y: 50, role: 'L' }] };
const limbItems = (e, j) => e[0].items.filter((i) => i.key && i.key.startsWith(`dish:0:limb${j}:`));
const itemAt = (e, key) => e[0].items.find((i) => i.key === key);

// 7 — no L marked: even a full-pressure dish grows no limb (auto attach points carry no roles).
{
  const { e } = run(300, { dishPressure: [1, 0] });
  assert.equal(limbItems(e, 0).length, 0, 'no L: no limb at full pressure');
  assert.equal(dishItems(e).length, 16, 'no L: the body is exactly the slice-2 body');
}

// 8 — the control: L marked, pressure zero → no limb at all, the body unaffected.
{
  const { e } = run(300, { assetAttach: L1, dishPressure: [0, 0] });
  assert.equal(limbItems(e, 0).length, 0, 'pressure 0: no limb grows');
  assert.equal(dishItems(e).length, 16, 'pressure 0: body intact');
}

// 9 — full pressure: the limb sprouts over counted frames and extends as one compound.
{
  const early = run(30, { assetAttach: L1, dishPressure: [1, 0] });
  assert.equal(limbItems(early.e, 0).length, 3, 'frame 30: the root disc alone, fully eased (growth 0.2)');
  const { e } = run(200, { assetAttach: L1, dishPressure: [1, 0] });
  assert.equal(limbItems(e, 0).length, 15, 'full pressure: all five limb discs drawn');
  const head = itemAt(e, 'dish:0:0:body');
  const root = itemAt(e, 'dish:0:limb0:0:body');
  const tip = itemAt(e, 'dish:0:limb0:4:body');
  const rootD = Math.hypot(root.x - head.x, root.y - head.y);
  assert.ok(rootD <= 45, `the root stays glued to the head: ${rootD.toFixed(1)}px`);
  const tipD = Math.hypot(tip.x - head.x, tip.y - head.y);
  assert.ok(tipD >= 35 && tipD <= 90, `the tip extends as a chain, neither balled nor torn: ${tipD.toFixed(1)}px`);
}

// 10 — partial pressure grows a measurably shorter limb: 0.4 caps growth at two discs.
{
  const { e } = run(300, { assetAttach: L1, dishPressure: [0.4, 0] });
  assert.equal(limbItems(e, 0).length, 6, 'pressure 0.4: exactly two limb discs');
  const head = itemAt(e, 'dish:0:0:body');
  const tip = itemAt(e, 'dish:0:limb0:1:body');
  const tipD = Math.hypot(tip.x - head.x, tip.y - head.y);
  assert.ok(tipD <= 45, `the short limb's tip stays close: ${tipD.toFixed(1)}px`);
}

// 11 — every marked limb grows: two L points, two limbs.
{
  const L2 = { org_blob_01: [{ x: 85, y: 50, role: 'L' }, { x: 50, y: 90, role: 'L' }] };
  const { e } = run(200, { assetAttach: L2, dishPressure: [1, 0] });
  assert.equal(limbItems(e, 0).length, 15, 'first L: a full limb');
  assert.equal(limbItems(e, 1).length, 15, 'second L: a full limb');
}

// 12 — replay with a limb: identical frames in, identical animal out; the scene is golden-pinned.
const GOLDEN_LIMB = 'a9918074';
{
  const a = run(300, { assetAttach: L1, dishPressure: [1, 0] });
  const b2 = run(300, { assetAttach: L1, dishPressure: [1, 0] });
  assert.equal(JSON.stringify(a.e[0].items), JSON.stringify(b2.e[0].items), 'limb scene replays byte-identically');
  let h = 0x811c9dc5;
  const s = JSON.stringify(a.e[0].items);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const hash = h.toString(16).padStart(8, '0');
  assert.equal(hash, GOLDEN_LIMB, `golden limb hash (got ${hash})`);
}

// ---------------------------------------------------------------------------
// Slice 4 — the band's material reaction + Davis's birth traits for the dish family.
import { DISH_RADII as RADII4 } from './dishCreature.js';

// 13 — Davis's traits, stamped at birth: body scales the declared radii; swatch shifts the colour
// ranks. A trait that changes mid-life changes nothing — the stamp is the animal.
{
  const { b, e } = run(300, { dishTraits: [{ spread: 0, wing: 1, body: 1.2, swatch: 1 }, null] });
  assert.ok(Math.abs(b.lastBodies()[0][0].r - RADII4[0] * 1.2) < 1e-9, 'trait body 1.2: the head radius is stamped 1.2x');
  assert.equal(itemAt(e, 'dish:0:0:body').color, '#e0a458', 'trait swatch 1: the head wears rank 1, not rank 0');
  const b2 = createDishCreatureBuilder();
  let e2 = entry();
  for (let f = 0; f < 150; f++) { e2 = entry(); b2.append(input(f, { dishTraits: [{ spread: 0, wing: 1, body: 1.2, swatch: 0 }, null] }), e2, ASSETS, motionFor(f)); }
  for (let f = 150; f < 300; f++) { e2 = entry(); b2.append(input(f, { dishTraits: [{ spread: 0, wing: 1, body: 0.8, swatch: 0 }, null] }), e2, ASSETS, motionFor(f)); }
  assert.ok(Math.abs(b2.lastBodies()[0][0].r - RADII4[0] * 1.2) < 1e-9, 'a mid-life trait change does not re-stamp the animal');
}

// 14 — the band as material, Tighten: the body starves — drawn smaller at the pose's own bodyScale,
// the gloss goes matte, the colour dries toward the ink. Declared rests do not move (lastBodies
// radii are the stamped ones in both runs).
{
  const neutral = run(300);
  const withered = run(300, { band: 'tighten', smoothed: 0.9 });
  const ratio = itemAt(withered.e, 'dish:0:0:body').scale / itemAt(neutral.e, 'dish:0:0:body').scale;
  assert.ok(Math.abs(ratio - 0.93) < 0.02, `withered: drawn head at bodyScale 0.93 (got ${ratio.toFixed(3)})`);
  assert.equal(itemAt(withered.e, 'dish:0:0:core').alpha, 68, 'withered: the gloss core goes matte (alpha 68 of 100)');
  assert.notEqual(itemAt(withered.e, 'dish:0:0:body').color, itemAt(neutral.e, 'dish:0:0:body').color, 'withered: the slime dries toward the ink');
  assert.equal(withered.b.lastBodies()[0][0].r, neutral.b.lastBodies()[0][0].r, 'withered: the declared radius does not move');
}

// 15 — Relax: the flourish plumps the body at bodyScale 1.10 and the gloss stays wet.
{
  const neutral = run(300);
  const flourish = run(300, { band: 'relax', smoothed: 0.05 });
  const ratio = itemAt(flourish.e, 'dish:0:0:body').scale / itemAt(neutral.e, 'dish:0:0:body').scale;
  assert.ok(Math.abs(ratio - 1.1) < 0.02, `flourish: drawn head at bodyScale 1.10 (got ${ratio.toFixed(3)})`);
  assert.equal(itemAt(flourish.e, 'dish:0:0:core').alpha, 100, 'flourish: the gloss stays wet');
}

// 16 — the proof-pack scene: 480 frames (8 s at 60 fps) crossing Relax → Normal → Tighten, with a
// limb and full pressure. The material ratio is read against a bandless twin at the same frames, so
// the hover's own breathing cancels: what remains is the band, visible without narration.
const GOLDEN_BAND = '57dc1ef4';
{
  const script = (f) => (f < 160 ? { band: 'relax', smoothed: 0.1 } : f < 320 ? { band: 'normal', smoothed: 0.5 } : { band: 'tighten', smoothed: 0.9 });
  const runScript = (banded) => {
    const b = createDishCreatureBuilder();
    let e = entry(); const marks = {};
    for (let f = 0; f < 480; f++) {
      e = entry();
      b.append(input(f, { assetAttach: L1, dishPressure: [1, 0], ...(banded ? script(f) : {}) }), e, ASSETS, motionFor(f));
      if (f === 159 || f === 319 || f === 479) marks[f] = itemAt(e, 'dish:0:0:body').scale;
    }
    return { b, e, marks };
  };
  const a = runScript(true); const twin = runScript(false); const again = runScript(true);
  const r = (f) => a.marks[f] / twin.marks[f];
  assert.ok(Math.abs(r(159) - 1.086) < 0.03, `relax leg: material at 1.086 (got ${r(159).toFixed(3)})`);
  assert.ok(Math.abs(r(319) - 1) < 0.03, `normal leg: material neutral (got ${r(319).toFixed(3)})`);
  assert.ok(Math.abs(r(479) - 0.93) < 0.03, `tighten leg: material starved at 0.93 (got ${r(479).toFixed(3)})`);
  assert.equal(JSON.stringify(a.e[0].items), JSON.stringify(again.e[0].items), 'the 8s scene replays byte-identically');
  let h = 0x811c9dc5;
  const s = JSON.stringify(a.e[0].items) + JSON.stringify(a.b.lastBodies());
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const hash = h.toString(16).padStart(8, '0');
  assert.equal(hash, GOLDEN_BAND, `golden band-scene hash (got ${hash})`);
}

console.log('dishCreature.selfcheck: ok');
