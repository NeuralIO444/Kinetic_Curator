// node src/gl/gestureRecord.selfcheck.mjs
// #1802 (narrowed) — a take carries its ACCUM gestures, and playback re-fires them through the same bus the
// live buttons and MIDI use. Pins: the step-1 verdict (before this section existed a take held no trace of
// its gestures — the recorder unit cases pin the section that closes that gap); the recorder keeps the
// starting state and every gesture by frame (junk and no-change freezes are not events; playback's own
// re-emissions are never recorded); the shape check fails closed; frozenAt answers the state in force at
// any frame; a played take asserts its freeze state on load and on every seek landing, fires each gesture
// at its frame in order, holds them while the loop holds the picture, and replays them again after a seek
// back; a take without the section — or with a junk one — fires nothing; the section survives the file;
// and the wiring (take button records it, the loop reads its own state, playback consumes it).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGestureRecorder, checkGestureRecord, frozenAt, GESTURE_RECORD_VERSION } from './gestureRecord.mjs';
import { createLiveResolver } from './liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap } from './resolveTap.mjs';
import { createPerformanceRecorder, packPerformance, unpackPerformance } from './performanceFile.mjs';
import { startPlayback, stopPlayback, seekPlayback, getPlayback } from './playback.mjs';
import { on, emit, Events } from '../composition/eventBus.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, '');

await ok(
  'the recorder keeps the starting state and every gesture by frame; junk, repeats and playback are not events',
  () => {
    let frame = 0;
    const rec = createGestureRecorder({ initial: true, getFrame: () => frame });
    rec.push({ action: 'freeze', value: true }); // the state the take already starts in: no change, no event
    frame = 4;
    rec.push({ action: 'freeze', value: false });
    rec.push({ action: 'swell' }); // the same frame is fine
    rec.push({ action: 'bogus' });
    rec.push(null);
    rec.push('freeze');
    rec.push({ action: 'swell' }, { cause: 'playback' }); // a take never records its own playback
    frame = 9;
    rec.push({ action: 'clear' });
    frame = 2; // a frame clock never runs backwards in a take; if one did, the record still must not
    rec.push({ action: 'freeze', value: true });
    const r = rec.finish();
    assert.equal(r.version, GESTURE_RECORD_VERSION);
    assert.equal(r.initial, true);
    assert.deepEqual(r.events, [
      [4, 'freeze', false],
      [4, 'swell'],
      [9, 'clear'],
      [9, 'freeze', true],
    ]);
    assert.equal(checkGestureRecord(r), r, 'a recorded section checks');
  },
);

await ok('the shape check fails closed', () => {
  const good = {
    version: GESTURE_RECORD_VERSION,
    initial: false,
    events: [
      [3, 'freeze', true],
      [5, 'swell'],
    ],
  };
  assert.equal(checkGestureRecord(good), good);
  for (const bad of [
    null,
    [],
    { ...good, version: 99 },
    { ...good, initial: 0 },
    { ...good, events: 'x' },
    {
      ...good,
      events: [
        [5, 'swell'],
        [3, 'swell'],
      ],
    }, // frames go backwards
    { ...good, events: [[1.5, 'swell']] },
    { ...good, events: [[3, 'blink']] },
    { ...good, events: [[3, 'freeze']] }, // freeze without its value
    { ...good, events: [[3, 'freeze', 'yes']] },
    { ...good, events: [[3, 'swell', true]] }, // a momentary carries nothing
    { ...good, events: Array.from({ length: 2001 }, (_, i) => [i, 'swell']) }, // over the cap
  ])
    assert.equal(checkGestureRecord(bad), null, JSON.stringify(bad)?.slice(0, 60));
});

await ok('frozenAt: the starting state, then each freeze from its frame on; momentaries change nothing', () => {
  const r = {
    version: GESTURE_RECORD_VERSION,
    initial: true,
    events: [
      [4, 'freeze', false],
      [9, 'freeze', true],
      [12, 'clear'],
    ],
  };
  assert.equal(frozenAt(r, 0), true);
  assert.equal(frozenAt(r, 3), true);
  assert.equal(frozenAt(r, 4), false);
  assert.equal(frozenAt(r, 8), false);
  assert.equal(frozenAt(r, 9), true);
  assert.equal(frozenAt(r, 500), true);
});

// a real take, recorded the way performanceCapture wires a section (the maker gets () => recorder.frames),
// with the gestures fired on the REAL bus mid-take — the step-1 probe's scene, now with the section attached
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const input = (f) => ({
  canvasW: 320,
  canvasH: 240,
  layers: [L('a')],
  activeLayerId: 'a',
  layerSnapshots: {},
  seed: 1802,
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
  dishPins: [],
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', count: 30, particleCount: 40 },
  loopTimeMs: (f + 1) * (1000 / 60),
  dtSec: 1 / 60,
});
const perfRec = createPerformanceRecorder();
const gestureRec = createGestureRecorder({ initial: false, getFrame: () => perfRec.frames });
const offRec = on(Events.ACCUM_GESTURE, (p, meta) => gestureRec.push(p, meta));
const liveRig = withResolveTap(createLiveResolver);
setResolveTap((i) => perfRec.onInput(i));
setResolveOutputTap((o) => perfRec.onOutput(o));
for (let f = 0; f < 70; f++) {
  liveRig.resolveLayers(input(f));
  if (f === 9) emit(Events.ACCUM_GESTURE, { action: 'freeze', value: true });
  if (f === 19) emit(Events.ACCUM_GESTURE, { action: 'swell' });
  if (f === 29) emit(Events.ACCUM_GESTURE, { action: 'freeze', value: false });
  if (f === 39) emit(Events.ACCUM_GESTURE, { action: 'clear' });
}
setResolveTap(null);
setResolveOutputTap(null);
liveRig.dispose();
offRec();
const bare = perfRec.finish();
const gestures = gestureRec.finish();
const take = { ...bare, gestures };

await ok('recording: gestures fired mid-take land in the section at their frames (and nowhere else)', () => {
  assert.deepEqual(gestures, {
    version: GESTURE_RECORD_VERSION,
    initial: false,
    events: [
      [10, 'freeze', true],
      [20, 'swell'],
      [30, 'freeze', false],
      [40, 'clear'],
    ],
  });
  assert.ok(!('gestures' in bare), 'the recorder core is untouched: the section rides beside it');
});

// playback: a CanvasPanel-style subscriber applies whatever the bus carries to a spy loop
const applied = []; // [tag, call]
let tag = 'load';
const spyLoop = {
  clearAccum: () => applied.push([tag, 'clear']),
  setAccumFrozen: (v) => applied.push([tag, `freeze:${!!v}`]),
  swellAccum: () => applied.push([tag, 'swell']),
};
const offSpy = on(Events.ACCUM_GESTURE, (p) => {
  if (!p || typeof p !== 'object') return;
  if (p.action === 'clear') spyLoop.clearAccum();
  else if (p.action === 'freeze') spyLoop.setAccumFrozen(p.value);
  else if (p.action === 'swell') spyLoop.swellAccum();
});
const playRig = withResolveTap(createLiveResolver);
/** Play one frame of the take (the live input is ignored while it plays), tagging bus traffic with its frame. */
function step(held = false) {
  tag = getPlayback().frame;
  const live = input(9000 + tag);
  if (held) live.slowRender = true;
  playRig.resolveLayers(live);
}
/** Play up to and including `frame`. */
function playTo(frame) {
  while (getPlayback() && getPlayback().frame <= frame) step();
}

await ok("playback: the load asserts the take's state, then each gesture fires at its frame, in order", () => {
  applied.length = 0;
  tag = 'load';
  assert.equal(startPlayback(take), true);
  playTo(45);
  stopPlayback();
  assert.deepEqual(applied, [
    ['load', 'freeze:false'], // the take loads: its starting state is the authority
    [0, 'freeze:false'], // the load rewind asserts it again for frame 0
    [10, 'freeze:true'],
    [20, 'swell'],
    [30, 'freeze:false'],
    [40, 'clear'],
  ]);
});

await ok('playback: held frames hold the gestures with the picture', () => {
  applied.length = 0;
  tag = 'load';
  assert.equal(startPlayback(take), true);
  playTo(9);
  applied.length = 0;
  step(true);
  step(true);
  step(true); // the loop's own pause: the cursor and the gesture stream both hold
  assert.deepEqual(applied, [], 'nothing fires while held');
  assert.equal(getPlayback().frame, 10, 'the cursor held too');
  step(); // frame 10 plays: its gesture fires now, not during the hold
  assert.deepEqual(applied, [[10, 'freeze:true']]);
  stopPlayback();
});

await ok('playback: a seek asserts the state in force at the landing frame — no burst, and the stretch replays', () => {
  applied.length = 0;
  tag = 'load';
  assert.equal(startPlayback(take), true);
  playTo(45); // everything has fired; the loop stands unfrozen and cleared
  applied.length = 0;
  seekPlayback(15);
  step(); // lands on 15: frozen was in force there (on at 10, off at 30)
  playTo(21);
  assert.deepEqual(applied, [
    [15, 'freeze:true'], // the assertion — the skipped frames' momentaries do not burst
    [20, 'swell'], // and the stretch replays as it is re-reached
  ]);
  applied.length = 0;
  seekPlayback(35);
  step(); // lands on 35: unfrozen there (off at 30); the swell at 20 stays in the past
  playTo(41);
  assert.deepEqual(applied, [
    [35, 'freeze:false'],
    [40, 'clear'],
  ]);
  stopPlayback();
});

await ok('a take without the section, or with a junk one, plays and fires nothing', () => {
  for (const t of [bare, { ...bare, gestures: { version: 99 } }]) {
    applied.length = 0;
    tag = 'load';
    assert.equal(startPlayback(t), true, 'the take itself still plays');
    playTo(15);
    stopPlayback();
    assert.deepEqual(applied, []);
  }
});

await ok('the section survives the file, and the unpacked take replays its gestures', async () => {
  const back = await unpackPerformance(await packPerformance(take));
  assert.deepEqual(back.gestures, gestures);
  applied.length = 0;
  tag = 'load';
  assert.equal(startPlayback(back), true);
  playTo(11);
  stopPlayback();
  assert.deepEqual(applied, [
    ['load', 'freeze:false'],
    [0, 'freeze:false'],
    [10, 'freeze:true'],
  ]);
});
offSpy();
playRig.dispose();

await ok('wired: the take button records `gestures` off the bus, the loop owns the state, playback re-fires', () => {
  const pb = flat(readFileSync(new URL('../components/PerformanceButton.jsx', import.meta.url), 'utf8'));
  assert.ok(pb.includes(flat('const rec = createGestureRecorder({')));
  assert.ok(pb.includes(flat('on(Events.ACCUM_GESTURE, (p, meta) => rec.push(p, meta))')));
  assert.ok(pb.includes(flat('const gesturesSectionForTake = (getFrame) => gesturesSection(getFrame, glLoopRef);')));
  assert.ok(pb.includes(flat('gestures: gesturesSectionForTake')));
  assert.ok(pb.includes('getAccumFrozen'), 'the starting state is read from the loop itself');
  const loop = flat(readFileSync(new URL('./liveLoop.mjs', import.meta.url), 'utf8'));
  assert.ok(loop.includes(flat('getAccumFrozen: () => accumFrozen')));
  const play = flat(readFileSync(new URL('./playback.mjs', import.meta.url), 'utf8'));
  assert.ok(play.includes(flat('const gestures = checkGestureRecord(p.gestures);')));
  assert.ok(play.includes(flat('if (!held && a.gestures) fireGestures(a, playedIndex, rewind);')));
  const canvas = flat(readFileSync(new URL('../panels/CanvasPanel.jsx', import.meta.url), 'utf8'));
  assert.ok(
    canvas.includes(flat("else if (p.action === 'freeze') loop.setAccumFrozen(p.value);")),
    'the applier playback re-fires into is the live one, unchanged',
  );
});

console.log(`gestureRecord.selfcheck: ${n} checks passed (#1802 — a take replays its gestures)`);
