// node src/engine/dishLifeBackgrounds.selfcheck.mjs
// #1923 Phase 2 slice D — the coupling's fourth consumer family: CONTENT backgrounds, reading the
// field culture through the shared seam (engine/dishLifeCouple.mjs). What a CONTENT background is
// in this tree (survey: STAGING-REPORT-1923-P2D.md): the stage background the CONTENT strata
// composite over — the active palette's `bg` hex, computed per frame by the live loop (bgCss),
// cleared into the frame by the renderer, begun from by ACCUM, derived from by the wet ground.
// It is a field-sized rendering with one continuous axis, its brightness — so this consumer is
// the global shape: the dish-mean LEVEL mixes the dealt background a bounded step toward white
// (alive) or black (dead), centred exact at a half-alive dish. The spatially-varying backdrop is
// the PATTERN ground (slice C's textures); the #1183 ground channel is a mark-side sampler, not
// a rendering, and takes no bias here either.
// The wiring mirrors the seam's discipline: the RESOLVER makes the read at its one coupling read
// (same publication, same shed fold, one frame behind) and publishes it on its last-frame
// channel (getLastCouplingBackground — the getLastDishWet pattern); the LOOP, which owns the
// background, folds the hex it dealt, on the palette path only (white / transparent are the
// performer's explicit backdrop overrides and are never tinted). No resolved output changes.
// Pinned here:
//   seam      the shift law is exact (centred, bounded, linear in the dial); the hex fold is a
//             bounded mix that returns the dealt string UNTOUCHED at shift 0, for every palette
//             background in the library — dial 0 is byte-identical by construction
//   resolver  dial 0 / publication alone publish no read and leave the whole resolve plain; the
//             read equals a shadow stage's dish-mean level one frame behind, frame for frame;
//             shed 2 publishes no read (and the resolve is plain), shed 1 still reads; the read
//             tracks the evolving culture; snapshot/restore and replay reproduce the read exactly
//   wiring    source-shape pins (the liveLoopScope discipline — the loop needs DOM/GL and cannot
//             run headless): the fold sits on the palette path in buildFrame and in clearAccum,
//             and the placement builder (the plate/quiet room's home) never sees the channel
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  cultureBackgroundShift,
  cultureBackgroundHex,
  fieldMean,
  BG_NEUTRAL_LEVEL,
  BACKGROUND_SWELL,
  SHED_HOLD,
} from './dishLifeCouple.mjs';
import { createDishLifeStage } from './dishLifeStage.mjs';
import { createLiveResolver, checkResolverSnapshot, getLastCouplingBackground } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC } from '../data/layout-modes.js';
import { defaultPattern } from '../state/patternTrack.js';
import { PALETTES } from '../data/palettes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

// ---------------------------------------------------------------- seam: the shift law
ok('cultureBackgroundShift: centred at the neutral level, ±SWELL at the extremes, linear in the dial', () => {
  assert.equal(cultureBackgroundShift(BG_NEUTRAL_LEVEL, 1), 0, 'a half-alive dish shifts nothing at full dial');
  assert.equal(cultureBackgroundShift(BG_NEUTRAL_LEVEL, 0.3), 0, 'centred at any dial');
  assert.equal(cultureBackgroundShift(1, 1), BACKGROUND_SWELL, 'fully alive at full dial: the lift bound');
  assert.equal(cultureBackgroundShift(0, 1), -BACKGROUND_SWELL, 'fully dead at full dial: the fall bound');
  assert.equal(cultureBackgroundShift(1, 0.5), BACKGROUND_SWELL / 2, 'the dial scales the shift linearly');
  assert.equal(cultureBackgroundShift(0.75, 1), BACKGROUND_SWELL / 2);
  assert.equal(cultureBackgroundShift(0.25, 1), -BACKGROUND_SWELL / 2);
  assert.equal(cultureBackgroundShift(1, 0), 0, 'dial 0: no level moves the background');
  assert.equal(cultureBackgroundShift(0, 0), 0);
  assert.equal(cultureBackgroundShift(9, 1), BACKGROUND_SWELL, 'levels clamp');
  assert.equal(cultureBackgroundShift(-3, 1), -BACKGROUND_SWELL, 'levels clamp low');
  assert.equal(cultureBackgroundShift(1, 'x'), 0, 'a junk dial is off');
  assert.equal(
    cultureBackgroundShift(NaN, 1),
    -BACKGROUND_SWELL,
    'a junk level clamps to 0 (the dead end), like every seam law',
  );
});

// ---------------------------------------------------------------- seam: the hex fold
ok('cultureBackgroundHex: a bounded mix toward white / black; shift 0 returns the dealt string untouched', () => {
  // hand-computed mixes (linear per channel, rgb255ToHex rounds)
  assert.equal(
    cultureBackgroundHex('#000000', BACKGROUND_SWELL),
    '#404040',
    'black lifted a quarter toward white: 63.75 → 64',
  );
  assert.equal(
    cultureBackgroundHex('#ffffff', -BACKGROUND_SWELL),
    '#bfbfbf',
    'white dropped a quarter toward black: 191.25 → 191',
  );
  assert.equal(cultureBackgroundHex('#0a0a0a', BACKGROUND_SWELL), '#474747', 'a dark palette bg lifts visibly');
  assert.equal(cultureBackgroundHex('#f2f3f8', -BACKGROUND_SWELL), '#b6b6ba', 'a light palette bg falls visibly');
  assert.equal(
    cultureBackgroundHex('#3f6d4e', BACKGROUND_SWELL),
    '#6f927a',
    'channels mix independently toward the same target',
  );
  // the centred / off frame is byte-identical BY CONSTRUCTION for every background the library deals
  for (const p of PALETTES) {
    assert.equal(cultureBackgroundHex(p.bg, 0), p.bg, `palette ${p.id}: shift 0 is the dealt string itself`);
    assert.equal(
      cultureBackgroundHex(p.bg, cultureBackgroundShift(BG_NEUTRAL_LEVEL, 1)),
      p.bg,
      `palette ${p.id}: the centred law folds to the dealt string`,
    );
  }
  // bounds: no channel ever moves further than the swell, and the mix never overshoots its target
  for (const p of PALETTES) {
    for (const s of [BACKGROUND_SWELL, -BACKGROUND_SWELL]) {
      const out = cultureBackgroundHex(p.bg, s);
      const a = [1, 3, 5].map((i) => parseInt(p.bg.slice(i, i + 2), 16));
      const b = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16));
      for (let ch = 0; ch < 3; ch++)
        assert.ok(Math.abs(b[ch] - a[ch]) <= 255 * BACKGROUND_SWELL + 1, `palette ${p.id} ch${ch}: inside the swell`);
    }
  }
  // junk passes through untouched — a bad background must never blank the stage
  assert.equal(cultureBackgroundHex('not-a-colour', 0.2), 'not-a-colour');
  assert.equal(cultureBackgroundHex('#0a0a0a', NaN), '#0a0a0a', 'a junk shift folds nothing');
  assert.equal(cultureBackgroundHex(null, 0.2), null);
  assert.equal(cultureBackgroundHex('#0a0a0a', 7), '#ffffff', 'an out-of-law shift clamps at the target');
});

// ---------------------------------------------------------------- resolver harness (slice C's shape)
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const patLayer = (id, pattern) => ({ ...L(id), type: 'pattern', pattern });
const baseInput = (over = {}) => ({
  layers: [L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 4242,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: {
    ...DEFAULT_LAYOUT_PARAMS,
    count: 60,
    particleCount: 60,
    mode: 'random',
    kinemeBreath: 0,
    kinemeDrift: 0,
    kinemePaletteBreath: 0,
  },
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
  mixSeconds: 0,
  canvasW: 1280,
  canvasH: 720,
  ...over,
});
const DT = 16.7;
const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    if (ArrayBuffer.isView(v)) return `${v.constructor.name}[${[...v].join(',')}]`;
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${k}:${canon(v[k])}`)
      .join(',')}}`;
  }
  return String(v);
};
const hash = (v) => createHash('sha256').update(canon(v)).digest('hex').slice(0, 16);
const fstamp = (gen, shed = 0, wakeMs = 0) => ({ mode: 'field', wakeMs, gen, cycleGens: 48, shed });

/** Run a stream on a fresh resolver, recording each frame's hash and the background read it published. */
const runStream = (frames, { coupling, shed = 0, input = baseInput } = {}) => {
  const r = createLiveResolver();
  const hashes = [];
  const reads = [];
  for (let f = 0; f < frames; f++) {
    const out = r.resolveLayers(
      input({
        loopTimeMs: f * DT,
        dtSec: DT / 1000,
        ...(coupling === undefined ? {} : { dishField: fstamp(f, shed), dishFieldCoupling: coupling }),
      }),
    );
    hashes.push(hash(out));
    const read = getLastCouplingBackground();
    reads.push(read ? { ...read } : null);
  }
  r.dispose();
  return { hashes, reads };
};

// ---------------------------------------------------------------- resolver: the off shapes
ok('off shapes publish no read: no stamps, dial 0, and publication alone (stamps, no dial key)', () => {
  const plain = runStream(12, {});
  for (let f = 0; f < 12; f++) assert.equal(plain.reads[f], null, `plain frame ${f}: no read`);
  const dial0 = runStream(12, { coupling: 0 });
  for (let f = 0; f < 12; f++) {
    assert.equal(dial0.reads[f], null, `dial 0 frame ${f}: no read — the loop's fold has nothing to apply`);
    assert.equal(dial0.hashes[f], plain.hashes[f], `dial 0 frame ${f}: the whole resolve is the plain resolve`);
  }
  const r = createLiveResolver();
  for (let f = 0; f < 12; f++) {
    const out = r.resolveLayers(
      baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f) }), // stamps, NO coupling key
    );
    assert.equal(getLastCouplingBackground(), null, `publication alone frame ${f}: no read`);
    assert.equal(hash(out), plain.hashes[f], `publication alone frame ${f}: the whole resolve is plain`);
  }
  r.dispose();
});

// ---------------------------------------------------------------- resolver: the read itself
ok('the read is the shadow stage’s dish-mean level, one frame behind, frame for frame', () => {
  const r = createLiveResolver();
  const shadow = createDishLifeStage();
  for (let f = 0; f < 14; f++) {
    // the publication this frame reads is the shadow stage's after frame f−1 — same marks, same stamps
    const expected = f === 0 ? null : fieldMean(shadow.publishedField);
    const out = r.resolveLayers(
      baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f), dishFieldCoupling: 0.8 }),
    );
    const read = getLastCouplingBackground();
    if (f === 0) {
      assert.equal(read, null, 'frame 0: nothing published yet — no read');
    } else {
      assert.ok(read, `frame ${f}: the read is published`);
      assert.equal(read.coupling, 0.8, `frame ${f}: the read carries the frame's shed-folded dial`);
      assert.ok(
        near(read.meanLevel, expected.level),
        `frame ${f}: meanLevel ${read.meanLevel} = the publication's ${expected.level}`,
      );
    }
    shadow.apply(fstamp(f), out, 1280, 720);
  }
  r.dispose();
});

ok('the read tracks the evolving culture, and the folded background moves with it — inside the swell', () => {
  const { reads } = runStream(30, { coupling: 1 });
  const live = reads.filter(Boolean);
  assert.ok(live.length >= 25, 'the read is published across the stream');
  const levels = new Set(live.map((x) => x.meanLevel.toFixed(6)));
  assert.ok(levels.size >= 3, `the culture evolves: ${levels.size} distinct mean levels across 30 frames`);
  for (const x of live) assert.ok(x.meanLevel >= 0 && x.meanLevel <= 1, 'a mean level is a mean of [0,1] cells');
  // the loop's fold, replicated exactly: dealt hex + the frame's read
  const dealt = PALETTES[0].bg;
  const folded = live.map((x) => cultureBackgroundHex(dealt, cultureBackgroundShift(x.meanLevel, x.coupling)));
  assert.ok(new Set(folded).size >= 2, 'the background itself moves as the culture evolves');
  const a = [1, 3, 5].map((i) => parseInt(dealt.slice(i, i + 2), 16));
  for (const hex of folded) {
    const b = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let ch = 0; ch < 3; ch++)
      assert.ok(Math.abs(b[ch] - a[ch]) <= 255 * BACKGROUND_SWELL + 1, 'every folded frame is inside the swell');
  }
});

ok(
  'governor shed: CULTURE HELD (shed 2) publishes no read and the resolve is plain; trickle (shed 1) still reads',
  () => {
    const plain = runStream(12, {});
    const held = runStream(12, { coupling: 1, shed: SHED_HOLD });
    for (let f = 0; f < 12; f++) {
      assert.equal(held.reads[f], null, `shed 2 frame ${f}: no read — the fold reads as coupling 0, whole`);
      assert.equal(held.hashes[f], plain.hashes[f], `shed 2 frame ${f}: the whole resolve is plain`);
    }
    const trickle = runStream(4, { coupling: 1, shed: 1 });
    assert.equal(trickle.reads[0], null, 'shed 1 frame 0: nothing published yet');
    assert.ok(trickle.reads[1], 'shed 1 frame 1: the field trickles and the read still acts');
  },
);

// ---------------------------------------------------------------- composition: all four consumers
ok('composition: marks + patterns + background in one scene — all four consumers act, each on its own axis', () => {
  const quilt = { ...defaultPattern('QUILT', 424242), drift: 0.4 };
  const tides = { ...defaultPattern('TIDES', 424242), drift: 0 };
  const withPatterns = (over = {}) =>
    baseInput({ layers: [L('lyr-a'), patLayer('lyr-quilt', quilt), patLayer('lyr-tides', tides)], ...over });
  const full = runStream(6, { coupling: 1, input: withPatterns });
  const marksOnly = runStream(6, { coupling: 1 });
  const plain = runStream(6, { input: withPatterns });
  // slice D acts: the read is published from frame 1
  assert.equal(full.reads[0], null);
  assert.ok(full.reads[3], 'the background read rides the same frames as the other consumers');
  // the read depends on the field alone: the same content layer without patterns publishes the same read
  for (let f = 0; f < 6; f++) {
    if (f === 0) continue;
    assert.ok(
      near(full.reads[f].meanLevel, marksOnly.reads[f].meanLevel),
      `frame ${f}: patterns neither feed nor move the background read`,
    );
    assert.equal(full.reads[f].coupling, marksOnly.reads[f].coupling);
  }
  // slices A and C act in the very same frames (their own suites pin their laws; here: presence)
  assert.notEqual(
    full.hashes[3],
    plain.hashes[3],
    'the coupled resolve differs from the plain one (A folds marks, C folds patterns)',
  );
  const r = createLiveResolver();
  let quiltBlock = null;
  for (let f = 0; f < 2; f++) {
    const out = r.resolveLayers(
      withPatterns({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f), dishFieldCoupling: 1 }),
    );
    quiltBlock = out.find((l) => l.id === 'lyr-quilt');
  }
  r.dispose();
  assert.notEqual(quiltBlock.pattern, quilt, 'slice C folds the QUILT block in the same stream');
  assert.equal(
    quiltBlock.pattern.drift,
    0.4 * (1 - 0.5),
    'frame 1: the drift fold is its ×½ law (generation 0 has no activity)',
  );
});

// ---------------------------------------------------------------- replay + snapshot/restore
ok('replay: the same coupled stream on two fresh resolvers publishes the same reads, bit for bit', () => {
  const a = runStream(16, { coupling: 0.65 });
  const b = runStream(16, { coupling: 0.65 });
  assert.deepEqual(b.reads, a.reads, 'the read sequence is a pure function of the recorded stream');
  assert.deepEqual(b.hashes, a.hashes, 'and so is the resolve');
});

ok('snapshot/restore: a take that begins mid-coupling continues with the same reads, bit-identically', () => {
  const uninterrupted = runStream(20, { coupling: 0.8 });
  const a = createLiveResolver();
  for (let f = 0; f < 10; f++)
    a.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f), dishFieldCoupling: 0.8 }));
  const snap = JSON.parse(JSON.stringify(a.snapshotState()));
  assert.equal(
    checkResolverSnapshot(snap),
    true,
    'the mid-coupling snapshot is well-formed (its shape is unchanged by this slice)',
  );
  a.dispose();
  const b = createLiveResolver();
  b.restoreState(snap);
  for (let f = 10; f < 20; f++) {
    const out = b.resolveLayers(
      baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f), dishFieldCoupling: 0.8 }),
    );
    assert.equal(hash(out), uninterrupted.hashes[f], `frame ${f} after restore: the whole resolve matches`);
    assert.deepEqual(getLastCouplingBackground(), uninterrupted.reads[f], `frame ${f}: the background read matches`);
  }
  b.dispose();
});

// ---------------------------------------------------------------- locks: the honest survey, pinned
ok('locks: the background has no lock channel of its own — and the fold’s shape leaves nothing to lock against', () => {
  // lockedParams reaches only layoutParams (the resolver's KC path); the stage background is not a
  // layout param — no PARAM_SPEC / default key names it, so no per-layer lock can name it either.
  for (const key of Object.keys(PARAM_SPEC))
    assert.ok(!/background/i.test(key), `PARAM_SPEC.${key} is not a background`);
  assert.ok(
    !('background' in DEFAULT_LAYOUT_PARAMS) && !('bg' in DEFAULT_LAYOUT_PARAMS),
    'no background layout param exists',
  );
  // the seam law takes exactly (statistic, dial) and (hex, shift): no lock, zone or layer input exists
  assert.equal(cultureBackgroundShift.length, 2, 'the shift law’s whole input is the statistic and the dial');
  assert.equal(cultureBackgroundHex.length, 2, 'the hex fold’s whole input is the dealt hex and the shift');
  // the lock-equivalents that DO exist are pinned elsewhere in this suite: the read exists only
  // under the shed-folded cultureScale (shed case), and the loop folds only the palette path
  // (wiring pins below) — white / transparent, the performer’s backdrop overrides, are never tinted.
});

// ---------------------------------------------------------------- wiring: source-shape pins
ok('wiring (source shape): the loop folds on the palette path only, in buildFrame and in clearAccum', () => {
  const src = readFileSync(new URL('../gl/liveLoop.mjs', import.meta.url), 'utf8');
  const bgAt = src.indexOf("bgMode === 'white'");
  assert.ok(bgAt > 0, 'the bgCss computation is found');
  const foldRegion = src.slice(bgAt, bgAt + 2400);
  assert.ok(foldRegion.includes("bgMode === 'palette'"), 'the fold is gated on the palette path');
  assert.ok(foldRegion.includes('getLastCouplingBackground()'), 'the fold reads the resolver’s published read');
  assert.ok(foldRegion.includes('cultureBackgroundHex('), 'the fold applies the seam law');
  assert.ok(foldRegion.includes('cultureBackgroundShift('), 'the fold applies the seam shift');
  const clearAt = src.indexOf('clearAccum()');
  assert.ok(clearAt > 0, 'clearAccum is found');
  const clearRegion = src.slice(clearAt, clearAt + 1600);
  assert.ok(clearRegion.includes("bgMode === 'palette'"), 'clearAccum folds on the palette path only');
  assert.ok(clearRegion.includes('cultureBackgroundHex('), 'clearAccum re-begins from the shown background');
  const resolveSrc = readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8');
  assert.ok(
    resolveSrc.includes('lastCouplingBackground = couplingBackgroundRead'),
    'the resolver publishes the read with the frame facts',
  );
});

ok('the room (source shape): the placement builder never sees the background channel', () => {
  // The plate/quiet room lives in buildPlacements (mark ink × PLATE_ROOM_ALPHA inside the zone).
  // The background fold must not reach it — different module, no shared input, by construction.
  const src = readFileSync(new URL('./buildPlacements.js', import.meta.url), 'utf8');
  assert.ok(src.includes('PLATE_ROOM_ALPHA'), 'the room’s home is this file (the pin is looking at the right place)');
  assert.ok(!src.includes('cultureBackground'), 'no background law enters the placement builder');
  assert.ok(!src.includes('getLastCouplingBackground'), 'no background read enters the placement builder');
  assert.ok(!src.includes('bgCss'), 'the placement builder never sees the stage background value');
});

console.log(`dishLifeBackgrounds: ${n} cases ok`);
