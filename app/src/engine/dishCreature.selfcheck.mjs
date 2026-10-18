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

console.log('dishCreature.selfcheck: ok');
