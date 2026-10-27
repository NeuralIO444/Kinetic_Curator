// node src/gl/performanceCreatures.selfcheck.mjs
// #1355 / #1356 — THE PHASE 3 AND 4 EXIT, replayably: record a live session in which auto spawn finds homes, the formation
// rule forms moths, the crowd grows a second pair of wings, Davis shifts each moth at its birth and the moth hovers; write
// the file, read it back, replay it through a fresh resolver, and every checkpoint matches the live run. Tampering with a
// moth's traits (or its limbs) is caught: the creatures are in the take, not recomputed.
// #1694 slice 1 — the session is wired as App + liveLoop wire it NOW: the resolver owns the spawn channel, observes its
// own frames and publishes the decisions (getLastSpawnDecisions); the loop stamps them on the next frame's input, the
// artist's count rides the input, and the homes are written back to the store's dishPins when they move. No frame tap,
// no providers: a fresh resolver is a fresh channel.
import assert from 'node:assert/strict';
import { createLiveResolver, getLastSpawnDecisions } from './liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap } from './resolveTap.mjs';
import {
  createPerformanceRecorder,
  verifyPerformance,
  packPerformance,
  unpackPerformance,
  createHashChain,
  CHECKPOINT_EVERY,
} from './performanceFile.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { BAND_NORMAL } from '../curator/stress.js';
import { FORM_HOLD_FRAMES } from '../curator/formation.js';
import { LIMB_GROW_FRAMES } from '../curator/limbs.js';

const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const FRAMES = 420;

/** A live session wired as App + liveLoop wire it: the resolver's spawn state decides, the loop stamps the
 *  publication on the next frame's input, and the recorder sits on both taps. */
function session({ count = 2, seed = 4242 } = {}) {
  const recorder = createPerformanceRecorder();
  const resolver = withResolveTap(createLiveResolver);
  setResolveTap((i) => recorder.onInput(i));
  setResolveOutputTap((o) => recorder.onOutput(o));
  const chain = createHashChain();
  const liveHashes = [];
  let pins = []; // the store's dishPins, written by the loop when the homes move
  const stable = {
    canvasW: 1000,
    canvasH: 700,
    layers: [L('lyr-a')],
    activeLayerId: 'lyr-a',
    layerSnapshots: {},
    seedOffsets: null,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    caGrid: null,
    enabledAssets: null,
    assetWeightOverrides: {},
    customAssets: [],
    lockedParams: {},
    batchPaused: false,
    focusSwap: false,
    perfClampOverride: null,
    scaleMul: 1,
    alphaBoost: 0,
    phraseWrapGen: 0,
    reducedMotion: false,
    quality: 'balanced',
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    effectiveScale: [0.5, 1.5],
    effectiveAlpha: [20, 100],
    assetAttach: {},
    attractor: null,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 300, particleCount: 150 },
  };
  let t = 0;
  let last = null;
  for (let f = 0; f < FRAMES; f++) {
    t += 16.7;
    const d = getLastSpawnDecisions(); // the previous frame's decisions, as the loop reads them
    const input = {
      ...stable,
      seed,
      loopTimeMs: t,
      dtSec: 1 / 60,
      band: BAND_NORMAL,
      smoothed: 0.5,
      creatureCount: count,
      dishPins: pins,
      dishFormed: d ? d.dishFormed : [],
      dishLimbs: d ? d.dishLimbs : [],
      dishTraits: d ? d.dishTraits : [],
      dishHosted: d ? d.dishHosted : [],
      dishPressure: d ? d.dishPressure : [],
    };
    const out = resolver.resolveLayers(input);
    chain.push(out);
    liveHashes.push(chain.value());
    // the loop's homes write-back: the store's dishPins follow when the resolver's homes move
    const nd = getLastSpawnDecisions();
    if (nd && nd.homesChanged) pins = nd.dishPins;
    last = out;
  }
  setResolveTap(null);
  setResolveOutputTap(null);
  resolver.dispose();
  const creature = last.flatMap((e) => (e.items || []).filter((i) => i._creature));
  return { perf: recorder.finish(), liveHashes, pins, creature };
}

// 1. the session really is the Phase 3 and 4 picture: moths formed, grown, shifted
const { perf, liveHashes, pins, creature } = session();
{
  assert.ok(pins.length >= 1, `auto spawn found homes (${pins.length})`);
  assert.ok(creature.length > 0, 'moths are in the final frame');
  const wings = creature.filter((i) => i.assetId === 'org_leaf_02' && !i.key.includes(':halo:')).length;
  assert.ok(wings >= 2, `at least one moth with wings (${wings})`);
  assert.ok(FORM_HOLD_FRAMES + LIMB_GROW_FRAMES < FRAMES, 'the session is long enough to form and to grow');
  // the take stores only what changed ({ $s: 1 } is "same value, new identity"), so look at the real arrays
  const withTraits = perf.inputs.steps.filter(
    (s) => s.k && Array.isArray(s.k.dishTraits) && s.k.dishTraits.some(Boolean),
  );
  assert.ok(withTraits.length >= 1, 'a moth was born with traits that the take recorded');
  assert.ok(
    perf.inputs.steps.some((s) => s.k && Array.isArray(s.k.dishFormed) && s.k.dishFormed.some(Boolean)),
    'the formed pins are in the take',
  );
}

// 2. THE EXIT: export -> import -> replay -> every checkpoint matches the live run
{
  assert.ok(perf.frames >= 360);
  for (const c of perf.checkpoints)
    assert.equal(c.hash, liveHashes[c.frame], `checkpoint ${c.frame} is the live run's chain`);
  const bytes = await packPerformance(perf);
  const back = await unpackPerformance(bytes);
  assert.deepEqual(back, JSON.parse(JSON.stringify(perf)), 'the file round-trips');
  const v = verifyPerformance(back);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.firstMismatchFrame, null);
  console.log(
    `performanceCreatures: EXIT MET - ${perf.frames} frames with ${pins.length} auto-spawned homes and ${creature.length} creature marks replay to all ${v.checked} checkpoints (${bytes.length} bytes)`,
  );
}

// 3. the creatures are in the take, not recomputed: edit a moth's traits, or its limbs, and the replay says so
{
  const forged = JSON.parse(JSON.stringify(perf));
  // The tamper target is a MOTH's traits: the birth step records every pin's traits together with the
  // hosting verdict, and the hosted pin's belong to the dish creature — stamped once at its birth, and
  // `spread` is a wing trait its body never reads. The moth reads its traits every frame.
  let i = -1;
  let k = -1;
  for (let f = 1; f < forged.inputs.steps.length && i < 0; f++) {
    const s = forged.inputs.steps[f];
    if (!s.k || !Array.isArray(s.k.dishTraits) || !Array.isArray(s.k.dishHosted)) continue;
    const pin = s.k.dishTraits.findIndex((tr, p) => !!tr && !s.k.dishHosted[p]);
    if (pin >= 0) {
      i = f;
      k = pin;
    }
  }
  assert.ok(i > 0 && k >= 0, 'a step records a moth\u2019s traits beside the hosting verdict');
  forged.inputs.steps[i].k.dishTraits[k].spread += 6;
  const v = verifyPerformance(forged);
  assert.equal(v.ok, false, 'a changed trait is caught');
  assert.ok(
    v.firstMismatchFrame >= i && v.firstMismatchFrame <= Math.ceil(i / CHECKPOINT_EVERY) * CHECKPOINT_EVERY,
    'named at the first checkpoint at or after the edit',
  );

  const noWings = JSON.parse(JSON.stringify(perf));
  const j = noWings.inputs.steps.findIndex((s) => s.k && Array.isArray(s.k.dishFormed) && s.k.dishFormed.some(Boolean));
  assert.ok(j > 0);
  for (const s of noWings.inputs.steps.slice(j))
    if (s.k && Array.isArray(s.k.dishFormed)) s.k.dishFormed = s.k.dishFormed.map(() => false);
  assert.equal(verifyPerformance(noWings).ok, false, 'a moth removed from the take is caught');
}

// 4. deterministic end to end: the same session twice gives the same file
{
  const again = session();
  assert.deepEqual(
    again.perf.checkpoints,
    perf.checkpoints,
    'the same dish, the same count: the same take, checkpoint for checkpoint',
  );
  assert.deepEqual(again.pins, pins);
}

console.log('performanceCreatures.selfcheck: ok (#1355 / #1356 replay)');
