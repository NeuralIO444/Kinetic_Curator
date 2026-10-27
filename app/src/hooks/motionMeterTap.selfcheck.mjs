// node src/hooks/motionMeterTap.selfcheck.mjs
// #1469 — the MOTION readout (expanded spec, with the #1485 strip merged in): the tap's contract,
// the publisher's chain from the resolver's own living-motion read (PULSE and PALETTE folded from
// the same kineme ctx), the loop's LIFE note, the moth beat's null-vs-value, the strip's
// read-only law, and the old strip's retirement.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  setMotionMeterTap,
  getMotionMeterTap,
  readMotionLevels,
  noteLifeBreath,
  getLifeBreath,
  LIFE_FULL,
} from './motionMeterTap.js';
import { observeMotion } from '../composition/motionLive.js';
import { createLiveResolver, getLastFrameMotion } from '../gl/liveResolve.mjs';
import { createCreatureBuilder, MOTH, MOTH_PARTS } from '../engine/creature.js';
import { ASSETS } from '../data/assets/index.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

ok('null before first publish: the tap and the resolver read both start empty', () => {
  assert.equal(readMotionLevels(), null);
  assert.equal(getMotionMeterTap(), null);
  assert.equal(getLastFrameMotion(), null);
});

ok('tap round-trip: what is set is what is read, and null clears it', () => {
  const v = {
    life: 0.2,
    drift: 0.5,
    breath: 0.3,
    pulse: 0.1,
    wind: 0.5,
    rhythmPhase: 1,
    rhythmType: 'sine',
    wobble: 0.4,
    palette: 0.24,
    mothBeat: 0.25,
  };
  setMotionMeterTap(v);
  assert.equal(readMotionLevels(), v);
  assert.equal(getMotionMeterTap(), v);
  setMotionMeterTap(null);
  assert.equal(readMotionLevels(), null);
});

ok('moth field is null-vs-value at the tap: absent is not zero', () => {
  setMotionMeterTap({
    life: 0,
    drift: 0,
    breath: 0,
    pulse: 0,
    wind: 0,
    rhythmPhase: 0,
    rhythmType: null,
    wobble: 0,
    palette: 0,
    mothBeat: null,
  });
  assert.equal(readMotionLevels().mothBeat, null);
  setMotionMeterTap({
    life: 0,
    drift: 0,
    breath: 0,
    pulse: 0,
    wind: 0,
    rhythmPhase: 0,
    rhythmType: null,
    wobble: 0,
    palette: 0,
    mothBeat: 0,
  });
  assert.equal(readMotionLevels().mothBeat, 0, 'a moth at the bottom of its beat is a value, not an absence');
  setMotionMeterTap(null);
});

ok('the creature builder records the wing beat it used, and only when a moth was appended', () => {
  const PAL = { bg: '#111111', ink: '#eeeeee', swatches: ['#aa0000', '#222222'] };
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
  const b = createCreatureBuilder();
  assert.equal(b.lastWingBeat(), null, 'nothing appended yet');
  b.append(input({ loopTimeMs: MOTH.flapMs / 4 }), entry(), ASSETS); // sin(2π·¼) = 1: wings fully open
  assert.equal(b.lastWingBeat(), 1);
  b.append(input({ loopTimeMs: 0 }), entry(), ASSETS); // sin(0) = 0: mid-beat
  assert.equal(b.lastWingBeat(), 0.5);
  b.append(input({ dishFormed: [false] }), entry(), ASSETS); // no pin formed: no moth this frame
  assert.equal(b.lastWingBeat(), null);
  assert.ok(MOTH_PARTS.body && MOTH_PARTS.wing, 'fixture sanity: the moth parts exist');
});

// A resolver fixture in the determinism selfcheck's shape (proven headless).
const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const lp = (over = {}) => ({
  ...DEFAULT_LAYOUT_PARAMS,
  count: 48,
  particleCount: 48,
  mode: 'random',
  kinemeBreath: 0.3,
  kinemeDrift: 0.5,
  kinemePulse: 0,
  kinemePattern: 'DRIFT',
  kinemeBrushWobble: 0.4,
  kinemePaletteBreath: 0.12,
  wind: 1.5,
  ...over,
});
const frameInput = (over = {}) => ({
  layers: [L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 1234,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: lp(),
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
  ...over,
});

ok("the chain: a resolved frame publishes the resolver's own amounts through observeMotion", () => {
  const r = createLiveResolver();
  r.resolveLayers(frameInput());
  const f = getLastFrameMotion();
  assert.ok(f && f.kineme, "the resolver exposed the frame's kineme ctx");
  assert.equal(f.kineme.amounts.drift, 0.5);
  assert.equal(f.kineme.amounts.breath, 0.3);
  assert.equal(f.kineme.amounts.brushWobble, 0.4);
  assert.equal(f.wind, 1.5);
  assert.equal(f.mothBeat, null, 'no pins formed: no moths on stage');
  observeMotion();
  assert.deepEqual(readMotionLevels(), {
    life: 0,
    drift: 0.5,
    breath: 0.3,
    pulse: 0,
    wind: 0.5,
    rhythmPhase: 0,
    rhythmType: null,
    wobble: 0.4,
    palette: 0.24,
    mothBeat: null,
  });
  assert.equal(readMotionLevels().pulse, f.kineme.amounts.pulse, "PULSE is the ctx's own amount, folded in");
  assert.equal(
    readMotionLevels().palette,
    f.kineme.amounts.paletteBreath / 0.5,
    "PALETTE is the ctx's paletteBreath over its display span",
  );

  r.resolveLayers(frameInput({ layoutParams: lp({ kinemePattern: 'ORGANIC' }), loopTimeMs: 16.7 }));
  observeMotion();
  assert.equal(readMotionLevels().rhythmType, 'perlin', 'ORGANIC names its rhythm function');
  assert.equal(readMotionLevels().rhythmPhase, 1, 'a live rhythm layer reads at full authored depth');

  r.resolveLayers(
    frameInput({ layoutParams: lp({ kinemePattern: 'THUMP', kinemePulse: 0 }), beatDrive: 1, loopTimeMs: 25 }),
  );
  const thump = getLastFrameMotion();
  observeMotion();
  assert.ok(thump.kineme.amounts.pulse > 0, 'THUMP on a beat raises the ctx pulse from zero');
  assert.equal(
    readMotionLevels().pulse,
    thump.kineme.amounts.pulse,
    'the tap carries the beat-driven pulse the placements consumed',
  );

  r.resolveLayers(frameInput({ slowRender: true, loopTimeMs: 33.4 }));
  const frozen = getLastFrameMotion();
  assert.equal(frozen.kineme, null, 'a frozen frame has no living motion (the shed flattens the read)');
  observeMotion();
  assert.deepEqual(
    readMotionLevels(),
    {
      life: 0,
      drift: 0,
      breath: 0,
      pulse: 0,
      wind: 0,
      rhythmPhase: 0,
      rhythmType: null,
      wobble: 0,
      palette: 0,
      mothBeat: null,
    },
    'flat bars under the freeze — never a ghost of the last live frame',
  );
  r.dispose();
});

ok("LIFE rides the loop's note: the publisher folds the noted reading in verbatim, clamped, junk-proof", () => {
  assert.equal(getLifeBreath(), 0, 'no loop has noted yet');
  assert.ok(LIFE_FULL > 0, 'the span the loop divides by');
  noteLifeBreath(0.7);
  observeMotion(); // the last resolved frame is the frozen one: the note still folds in
  assert.equal(readMotionLevels().life, 0.7, 'the noted reading, carried through the tap');
  assert.equal(readMotionLevels().drift, 0, 'the fold invents nothing else: the frozen frame stays flat');
  noteLifeBreath(2);
  observeMotion();
  assert.equal(readMotionLevels().life, 1, 'clamped to the bar');
  noteLifeBreath(NaN);
  observeMotion();
  assert.equal(readMotionLevels().life, 0, 'junk notes read as stillness, never NaN');
  noteLifeBreath(0);
  const loop = src('../gl/liveLoop.mjs');
  assert.match(
    loop,
    /noteLifeBreath\(\(s\.slowRender \|\| !s\.running\) \? 0 : Math\.abs\(breathScaleSmoothed - 1\) \/ LIFE_FULL\)/,
    'the loop notes |breathScale − 1| over the span, zeroed while frozen',
  );
  assert.ok(
    !/publishMotion|from '\.\/motionTap|from '\.\/motionReadout/.test(loop),
    'the retired tap and readout are gone from the loop',
  );
});

ok('read-only law: the strip sends nothing out, writes no state, and names no bus machinery', () => {
  const strip = src('../panels/stimulus/MotionMeter.jsx').replace(/\/\/.*$/gm, '');
  assert.ok(!/\bemit\s*\(/.test(strip), 'no emit calls');
  assert.ok(!/useStore|setState|getState|dispatch\s*\(/.test(strip), 'no store reads or writes');
  assert.ok(!/Events\.|eventBus/.test(strip), 'no event names, no bus');
  assert.ok(!/on(Click|Pointer|Mouse|Hover)/.test(strip), 'no pointer handlers: a readout, not a control');
  assert.match(strip, /readMotionLevels/);
  for (const label of ['LIFE', 'DRIFT', 'BREATH', 'PULSE', 'WIND', 'RHYTHM', 'WOBBLE', 'PALETTE', 'MOTH'])
    assert.ok(strip.includes(`'${label}'`), label);
  assert.ok(!/title=/.test(strip), 'no explainer tooltips');
});

ok(
  'the publisher reads the resolver, never recomputes; the panel and the frame tap are wired; the old strip is retired',
  () => {
    const pub = src('../composition/motionLive.js').replace(/\/\/.*$/gm, '');
    assert.match(pub, /getLastFrameMotion/);
    assert.match(pub, /getLifeBreath/, "LIFE folds in from the loop's note");
    assert.match(pub, /amounts\.pulse/, 'PULSE folds in from the same ctx');
    assert.match(pub, /amounts\.paletteBreath/, 'PALETTE folds in from the same ctx');
    assert.ok(!/patternAmounts|livingMotion\s*\(/.test(pub), 'no motion is recomputed in the publisher');
    const panel = src('../panels/StimulusPanel.jsx');
    assert.match(panel, /<MeterHero \/>[\s\S]*?<MotionMeter \/>/, 'beside the meter, STIMULI only');
    assert.ok(!/MotionStrip/.test(panel), 'the #1485 strip no longer renders: one motion readout in the panel');
    assert.match(
      src('../App.jsx'),
      /observeAudio\(input && input\.loopTimeMs[\s\S]*?observeMotion\(\)/,
      'published once per resolved frame, from the frame tap',
    );
  },
);

console.log(`motionMeterTap.selfcheck: ${n} checks passed`);
