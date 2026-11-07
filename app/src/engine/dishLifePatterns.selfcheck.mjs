// node src/engine/dishLifePatterns.selfcheck.mjs
// #1923 Phase 2 slice C — the coupling's third consumer family: the PATTERN MODES, reading the field
// culture through the shared seam (engine/dishLifeCouple.mjs). Pattern modes place no items — a layer
// resolves to one generated texture from its dealt parameters — so this consumer biases EXISTING
// parameters from field STATISTICS, on the resolved block only (the patternAudio precedent). Matt's
// Q5 ruling (2026-11-06, on #1923) names "pattern modes (TIDES et al.)" as consumers; the per-mode
// survey (STAGING-REPORT-1923-P2C.md) found honest axes for four of the seven modes:
//   QUILT / GLYPH / PICTURE  DRIFT is an amplitude (rotation breath / scale pulse): the field's mean
//                            ACTIVITY scales it, multiplicative and centred — dealt 0 stays 0.
//   TIDES                    each cell's field value shifts by the culture LEVEL under the cell
//                            (a snapshot of the published grid rides the block to the draw).
//   FIELD / REWRITE / BLOCKS no honest continuous axis (a pan RATE over absolute time / a baked
//                            growth plan with an integer step clock / a still partition): never
//                            biased, pinned here as reference-identical at any dial.
// Pinned here:
//   seam      the factor and shift laws are exact (centred, bounded, linear in the dial); the means
//             and the level snapshot are pure reads, and the snapshot is a COPY (the culture steps
//             in place after the resolve — a live reference would read the next generation)
//   tides     the bias enters before state/size derivation; a neutral field (level ½ everywhere)
//             and a coupling-0 descriptor both render byte-identical to the dealt readout
//   resolver  dial 0 (or publication alone) leaves every pattern block reference-identical and every
//             texture byte-identical; coupling up folds DRIFT exactly ×½ at the first published
//             frame (generation 0's activity is 0 by the core's own law), tracks the evolving
//             culture, and hands TIDES a descriptor whose render matches a shadow stage's snapshot
//             frame for frame; shed 2 restores the plain frame whole; the stored pattern is never
//             written (a frozen pattern resolves folded without throwing); a pattern-only scene
//             grows no culture; all three consumers act in one frame, each on its own axis only;
//             snapshot/restore and replay are bit-identical
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  clampCoupling,
  effectiveCoupling,
  culturePatternDriftFactor,
  cultureTidesShift,
  cultureLevelAt,
  fieldMean,
  fieldLevelGrid,
  PATTERN_DRIFT_SWELL,
  PATTERN_NEUTRAL_ACTIVITY,
  TIDES_LEVEL_SWELL,
  TIDES_NEUTRAL_LEVEL,
  SHED_HOLD,
} from './dishLifeCouple.mjs';
import { createDishLifeStage } from './dishLifeStage.mjs';
import { createLiveResolver, checkResolverSnapshot } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { defaultPattern } from '../state/patternTrack.js';
import { patternPixels, patternKey } from '../pattern/patternSource.js';
import { assignTides, tidesCells } from '../pattern/tides.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

// ---------------------------------------------------------------- seam: the two laws
ok('culturePatternDriftFactor: neutral at mid activity, ±SWELL at the extremes, linear in the dial', () => {
  assert.equal(culturePatternDriftFactor(PATTERN_NEUTRAL_ACTIVITY, 1), 1, 'a mid field is neutral at full dial');
  assert.equal(culturePatternDriftFactor(PATTERN_NEUTRAL_ACTIVITY, 0.3), 1, 'neutral at any dial');
  assert.equal(culturePatternDriftFactor(1, 1), 1 + PATTERN_DRIFT_SWELL, 'fully lively at full dial: the swell bound');
  assert.equal(culturePatternDriftFactor(0, 1), 1 - PATTERN_DRIFT_SWELL, 'fully dead at full dial: the slow bound');
  assert.equal(culturePatternDriftFactor(1, 0.5), 1 + PATTERN_DRIFT_SWELL / 2, 'the dial scales the effect linearly');
  assert.equal(culturePatternDriftFactor(0.75, 1), 1 + PATTERN_DRIFT_SWELL / 2);
  assert.equal(culturePatternDriftFactor(1, 0), 1, 'dial 0: no activity moves anything');
  assert.equal(culturePatternDriftFactor(0, 0), 1);
  assert.equal(culturePatternDriftFactor(9, 1), 1 + PATTERN_DRIFT_SWELL, 'activities clamp');
  assert.equal(culturePatternDriftFactor(1, 'x'), 1, 'a junk dial is off');
});

ok('cultureTidesShift: centred at the neutral level, ±SWELL at the extremes, linear in the dial', () => {
  assert.equal(cultureTidesShift(TIDES_NEUTRAL_LEVEL, 1), 0, 'a half-alive cell shifts nothing at full dial');
  assert.equal(cultureTidesShift(TIDES_NEUTRAL_LEVEL, 0.3), 0, 'centred at any dial');
  assert.equal(cultureTidesShift(1, 1), TIDES_LEVEL_SWELL, 'fully alive: the lift bound');
  assert.equal(cultureTidesShift(0, 1), -TIDES_LEVEL_SWELL, 'fully dead: the drop bound');
  assert.equal(cultureTidesShift(1, 0.5), TIDES_LEVEL_SWELL / 2, 'linear in the dial');
  assert.equal(cultureTidesShift(0.75, 1), TIDES_LEVEL_SWELL / 2);
  assert.equal(cultureTidesShift(1, 0), 0, 'dial 0: no level shifts anything');
  assert.equal(cultureTidesShift(9, 1), TIDES_LEVEL_SWELL, 'levels clamp');
  assert.equal(cultureTidesShift(1, 'x'), 0, 'a junk dial is off');
});

// ---------------------------------------------------------------- seam: the statistics
const holder = (over = {}) => ({
  active: true,
  cols: 2,
  rows: 1,
  gen: 3,
  level: new Float32Array([1, 0]),
  activity: new Float32Array([0.5, 0.25]),
  ...over,
});

ok('fieldMean: the dish means, null unless a field is published, a pure read', () => {
  assert.equal(fieldMean(null), null);
  assert.equal(fieldMean(holder({ active: false })), null, 'an inactive holder publishes nothing');
  assert.equal(fieldMean(holder({ level: null })), null);
  assert.equal(fieldMean(holder({ cols: 0 })), null);
  const h = holder();
  const before = [...h.level].join(',') + '|' + [...h.activity].join(',');
  assert.deepEqual(fieldMean(h), { level: 0.5, activity: 0.375 });
  assert.equal([...h.level].join(',') + '|' + [...h.activity].join(','), before, 'the mean never writes the field');
});

ok('fieldLevelGrid: a snapshot COPY — the live arrays may step on without moving it', () => {
  assert.equal(fieldLevelGrid(null), null);
  assert.equal(fieldLevelGrid(holder({ active: false })), null);
  assert.equal(fieldLevelGrid(holder({ level: null })), null);
  const h = holder();
  const snap = fieldLevelGrid(h);
  assert.deepEqual([snap.cols, snap.rows, snap.gen], [2, 1, 3]);
  assert.deepEqual([...snap.level], [1, 0]);
  h.level[0] = 0.25; // the culture steps in place at the bottom of the resolve
  assert.equal(snap.level[0], 1, 'the snapshot holds the publication it was taken from');
  assert.equal(h.level[0], 0.25, 'and the holder was never written by the snapshot call');
});

ok('cultureLevelAt: nearest cell over the snapshot; junk and outside read the neutral level', () => {
  const snap = fieldLevelGrid(holder());
  assert.equal(cultureLevelAt(snap, 0.25, 0.5), 1, 'the left cell');
  assert.equal(cultureLevelAt(snap, 0.75, 0.5), 0, 'the right cell');
  assert.equal(cultureLevelAt(snap, 0.5, 0.5), 0, 'the boundary belongs to the right cell (floor)');
  for (const [x, y] of [
    [-0.1, 0.5],
    [1, 0.5],
    [0.5, -1],
    [0.5, 1],
    [NaN, NaN],
  ])
    assert.equal(cultureLevelAt(snap, x, y), TIDES_NEUTRAL_LEVEL, `(${x},${y}) biases nothing`);
  assert.equal(cultureLevelAt(null, 0.5, 0.5), TIDES_NEUTRAL_LEVEL);
});

// ---------------------------------------------------------------- tides: the cell law, unit level
const PAL = { swatches: ['#101418', '#3f6d4e', '#c8b06a', '#e8e2d2'], bg: '#0a0a0a', ink: '#f2ede2' };

ok('tidesCells bias: enters before state/size derivation; a zero bias is the dealt readout', () => {
  const grid = assignTides(1234, 10, 0.55, PAL, 12);
  const dealt = tidesCells(grid, 0, 0);
  assert.deepEqual(tidesCells(grid, 0, 0, null), dealt, 'no bias argument: identical');
  assert.deepEqual(
    tidesCells(grid, 0, 0, (c, r, v) => v),
    dealt,
    'an identity bias: identical',
  );
  const lifted = tidesCells(grid, 0, 0, (c, r, v) => v + TIDES_LEVEL_SWELL);
  const dropped = tidesCells(grid, 0, 0, (c, r, v) => v - TIDES_LEVEL_SWELL);
  const sum = (cells) => cells.reduce((a, cell) => a + cell.state, 0);
  assert.ok(sum(lifted) > sum(dealt), 'a uniform lift moves cells up-state');
  assert.ok(sum(dropped) < sum(dealt), 'a uniform drop moves cells down-state');
});

ok('patternPixels + descriptor: a neutral or off descriptor renders the dealt frame byte-identically', () => {
  const tides = { ...defaultPattern('TIDES', 777), drift: 0 };
  const dealt = patternPixels(tides, PAL, 200, 120, 0);
  const gridOf = (level) => ({ cols: 2, rows: 2, gen: 5, level: new Float32Array([level, level, level, level]) });
  assert.deepEqual(
    patternPixels(tides, PAL, 200, 120, 0, null, { coupling: 1, grid: gridOf(0.5) }),
    dealt,
    'level ½ everywhere: the centred law — nothing shifts',
  );
  assert.deepEqual(
    patternPixels(tides, PAL, 200, 120, 0, null, { coupling: 0, grid: gridOf(1) }),
    dealt,
    'coupling 0 in the descriptor: nothing shifts',
  );
  const alive = patternPixels(tides, PAL, 200, 120, 0, null, { coupling: 1, grid: gridOf(1) });
  const dead = patternPixels(tides, PAL, 200, 120, 0, null, { coupling: 1, grid: gridOf(0) });
  assert.notDeepEqual(alive, dealt, 'a living dish lifts the readout');
  assert.notDeepEqual(dead, dealt, 'a dead dish drops the readout');
  assert.notDeepEqual(alive, dead, 'the two extremes are different frames');
});

ok('patternKey: the culture component exists only for a coupled TIDES', () => {
  const tides = { ...defaultPattern('TIDES', 777), drift: 0 };
  const quilt = { ...defaultPattern('QUILT', 777), drift: 0.4 };
  const grid = { cols: 2, rows: 2, gen: 5, level: new Float32Array(4) };
  const base = patternKey(tides, PAL, 200, 120, 0);
  assert.equal(patternKey(tides, PAL, 200, 120, 0, null, null), base, 'no descriptor: the pre-slice key');
  assert.notEqual(patternKey(tides, PAL, 200, 120, 0, null, { coupling: 1, grid }), base, 'coupled: keyed');
  assert.notEqual(
    patternKey(tides, PAL, 200, 120, 0, null, { coupling: 1, grid }),
    patternKey(tides, PAL, 200, 120, 0, null, { coupling: 1, grid: { ...grid, gen: 6 } }),
    'a new generation is a new frame',
  );
  assert.notEqual(
    patternKey(tides, PAL, 200, 120, 0, null, { coupling: 1, grid }),
    patternKey(tides, PAL, 200, 120, 0, null, { coupling: 0.5, grid }),
    'a moved dial is a new frame',
  );
  assert.equal(
    patternKey(quilt, PAL, 200, 120, 1, null, { coupling: 1, grid }),
    patternKey(quilt, PAL, 200, 120, 1),
    'other modes never grow the component (their bias is the drift value, already keyed)',
  );
});

// ---------------------------------------------------------------- resolver level
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
  // The living-motion amounts ZEROED, as in the slice A suite: this suite pins the PATTERN fold;
  // the composition case below turns the breath back on deliberately.
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
const RW = 200;
const RH = 120;
/** The texture a resolved pattern block draws: the renderer's own call, minus the GPU. */
const renderBlock = (block) =>
  patternPixels(block.pattern, block.palette, RW, RH, block.t, null, block.patternCulture ?? null);
const blockOf = (out, id) => out.find((l) => l.id === id);

const DEALT_DRIFT = 0.4;
const mkPatterns = () => ({
  quilt: { ...defaultPattern('QUILT', 424242), drift: DEALT_DRIFT },
  glyph: { ...defaultPattern('GLYPH', 424242), drift: DEALT_DRIFT },
  picture: { ...defaultPattern('PICTURE', 424242), drift: DEALT_DRIFT },
  tidesStill: { ...defaultPattern('TIDES', 424242), drift: 0 },
  tidesLive: { ...defaultPattern('TIDES', 424242), drift: 0.5 },
  field: { ...defaultPattern('FIELD', 424242), drift: 0.5 },
  rewrite: { ...defaultPattern('REWRITE', 424242), drift: 0.5 },
  blocks: { ...defaultPattern('BLOCKS', 424242), drift: 0.5 },
});
const sceneInput = (patterns, over = {}) =>
  baseInput({
    layers: [L('lyr-a'), ...Object.entries(patterns).map(([key, p]) => patLayer(`lyr-${key}`, p))],
    ...over,
  });
const runScene = (frames, { coupling, shed = 0, patterns = mkPatterns(), over = {} } = {}) => {
  const r = createLiveResolver();
  const outs = [];
  for (let f = 0; f < frames; f++)
    outs.push(
      r.resolveLayers(
        sceneInput(patterns, {
          loopTimeMs: f * DT,
          dtSec: DT / 1000,
          ...(coupling === undefined ? {} : { dishField: fstamp(f, shed), dishFieldCoupling: coupling }),
          ...over,
        }),
      ),
    );
  r.dispose();
  return outs;
};

ok('off shapes are byte-identical: dial 0 and publication alone leave every block and texture plain', () => {
  const patterns = mkPatterns();
  const plain = runScene(12, { patterns });
  const dial0 = runScene(12, { coupling: 0, patterns });
  const fieldOnly = (() => {
    const r = createLiveResolver();
    const outs = [];
    for (let f = 0; f < 12; f++)
      outs.push(r.resolveLayers(sceneInput(patterns, { loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f) })));
    r.dispose();
    return outs;
  })();
  for (let f = 0; f < 12; f++) {
    for (const [name, outs] of [
      ['dial 0', dial0],
      ['publication alone', fieldOnly],
    ]) {
      assert.equal(hash(outs[f]), hash(plain[f]), `${name}, frame ${f}: the whole resolve is the plain resolve`);
      for (const key of Object.keys(patterns)) {
        const b = blockOf(outs[f], `lyr-${key}`);
        assert.equal(b.pattern, patterns[key], `${name}, frame ${f}: ${key} carries the dealt object itself`);
        assert.equal('patternCulture' in b, false, `${name}, frame ${f}: ${key} carries no descriptor`);
        assert.deepEqual(
          renderBlock(b),
          renderBlock(blockOf(plain[f], `lyr-${key}`)),
          `${name}, frame ${f}: ${key} texture`,
        );
      }
    }
  }
});

ok('the drift fold: frame 0 untouched, frame 1 exactly ×½ (generation 0 has no activity), then it tracks', () => {
  const patterns = mkPatterns();
  const outs = runScene(12, { coupling: 1, patterns });
  for (const key of ['quilt', 'glyph', 'picture']) {
    const b0 = blockOf(outs[0], `lyr-${key}`);
    assert.equal(b0.pattern, patterns[key], `frame 0: nothing published yet — ${key} untouched`);
    const b1 = blockOf(outs[1], `lyr-${key}`);
    assert.notEqual(b1.pattern, patterns[key], `frame 1: ${key} is a folded copy`);
    assert.equal(
      b1.pattern.drift,
      DEALT_DRIFT * (1 - PATTERN_DRIFT_SWELL),
      `frame 1: ${key} drift is dealt × ½ exactly`,
    );
    assert.deepEqual({ ...b1.pattern, drift: DEALT_DRIFT }, patterns[key], `${key}: only drift moved`);
    const b10 = blockOf(outs[10], `lyr-${key}`);
    assert.ok(
      b10.pattern.drift > DEALT_DRIFT * (1 - PATTERN_DRIFT_SWELL) &&
        b10.pattern.drift <= DEALT_DRIFT * (1 + PATTERN_DRIFT_SWELL),
      `frame 10: ${key} drift ${b10.pattern.drift} has moved off the floor as activity rose, inside the bounds`,
    );
    assert.notDeepEqual(
      renderBlock(b1),
      renderBlock(blockOf(runScene(2, { patterns })[1], `lyr-${key}`)),
      `${key}: the folded texture differs from the dealt one`,
    );
  }
});

ok('TIDES: the descriptor arrives with the first publication and renders exactly the shadow stage’s snapshot', () => {
  const patterns = mkPatterns();
  const r = createLiveResolver();
  const shadow = createDishLifeStage();
  for (let f = 0; f < 12; f++) {
    const out = r.resolveLayers(
      sceneInput(patterns, { loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f), dishFieldCoupling: 1 }),
    );
    const still = blockOf(out, 'lyr-tidesStill');
    if (f === 0) {
      assert.equal('patternCulture' in still, false, 'frame 0: nothing published, no descriptor');
    } else {
      // the publication this frame read is the shadow stage's after frame f−1 — same marks, same stamps
      const expected = { coupling: 1, grid: fieldLevelGrid(shadow.publishedField) };
      assert.ok(still.patternCulture, `frame ${f}: the descriptor rides the block`);
      assert.equal(still.patternCulture.grid.gen, f - 1, `frame ${f}: the snapshot is one frame behind`);
      assert.deepEqual(
        [...still.patternCulture.grid.level],
        [...expected.grid.level],
        `frame ${f}: the snapshot is the publication`,
      );
      assert.deepEqual(
        renderBlock(still),
        patternPixels(still.pattern, still.palette, RW, RH, still.t, null, expected),
        `frame ${f}: the render is the snapshot's render`,
      );
      const live = blockOf(out, 'lyr-tidesLive');
      assert.deepEqual(
        renderBlock(live),
        patternPixels(live.pattern, live.palette, RW, RH, live.t, null, expected),
        `frame ${f}: the drifting TIDES reads the same snapshot`,
      );
    }
    shadow.apply(fstamp(f), out, 1280, 720);
  }
  r.dispose();
});

ok('TIDES tracking: a coupled still re-renders as the culture evolves; the plain still never does', () => {
  const patterns = mkPatterns();
  const coupled = runScene(12, { coupling: 1, patterns });
  const plain = runScene(12, { patterns });
  const c1 = renderBlock(blockOf(coupled[1], 'lyr-tidesStill'));
  const c8 = renderBlock(blockOf(coupled[8], 'lyr-tidesStill'));
  assert.notDeepEqual(c8, c1, 'the bias tracks the evolving culture');
  assert.deepEqual(
    renderBlock(blockOf(plain[8], 'lyr-tidesStill')),
    renderBlock(blockOf(plain[1], 'lyr-tidesStill')),
    'uncoupled, a DRIFT-0 TIDES is one still frame',
  );
  assert.notDeepEqual(
    c1,
    renderBlock(blockOf(plain[1], 'lyr-tidesStill')),
    'and the coupled frame is not the dealt frame',
  );
});

ok('FIELD / REWRITE / BLOCKS: no honest axis — never biased at any dial, any frame', () => {
  const patterns = mkPatterns();
  const coupled = runScene(12, { coupling: 1, patterns });
  const plain = runScene(12, { patterns });
  for (let f = 0; f < 12; f++) {
    for (const key of ['field', 'rewrite', 'blocks']) {
      const b = blockOf(coupled[f], `lyr-${key}`);
      assert.equal(b.pattern, patterns[key], `frame ${f}: ${key} carries the dealt object itself`);
      assert.equal('patternCulture' in b, false, `frame ${f}: ${key} carries no descriptor`);
      assert.deepEqual(
        renderBlock(b),
        renderBlock(blockOf(plain[f], `lyr-${key}`)),
        `frame ${f}: ${key} texture is the dealt texture`,
      );
    }
  }
});

ok('governor shed: CULTURE HELD (shed 2) restores the plain pattern frame whole; trickle (shed 1) still acts', () => {
  const patterns = mkPatterns();
  const plain = runScene(12, { patterns });
  const held = runScene(12, { coupling: 1, shed: SHED_HOLD, patterns });
  for (let f = 0; f < 12; f++) {
    assert.equal(hash(held[f]), hash(plain[f]), `shed 2, frame ${f}: the whole resolve is plain`);
    assert.deepEqual(
      renderBlock(blockOf(held[f], 'lyr-tidesStill')),
      renderBlock(blockOf(plain[f], 'lyr-tidesStill')),
      `shed 2, frame ${f}: the TIDES texture is the dealt texture`,
    );
  }
  const trickle = runScene(3, { coupling: 1, shed: 1, patterns });
  assert.equal(
    blockOf(trickle[1], 'lyr-quilt').pattern.drift,
    DEALT_DRIFT * (1 - PATTERN_DRIFT_SWELL),
    'shed 1: the field trickles and the fold still acts',
  );
});

ok('the stored pattern is never written: a frozen pattern resolves folded, and survives untouched', () => {
  const patterns = mkPatterns();
  for (const p of Object.values(patterns)) Object.freeze(p);
  const before = JSON.stringify(patterns);
  const outs = runScene(6, { coupling: 1, patterns }); // would throw if the fold wrote the dealt object
  assert.notEqual(blockOf(outs[1], 'lyr-quilt').pattern, patterns.quilt, 'the fold is a copy');
  assert.equal(JSON.stringify(patterns), before, 'every dealt pattern is byte-identical after coupled resolves');
});

ok('a pattern-only scene grows no culture: patterns are never seeded, so the dial has nothing to read', () => {
  const patterns = mkPatterns();
  const r = createLiveResolver();
  for (let f = 0; f < 8; f++) {
    const out = r.resolveLayers(
      baseInput({
        layers: Object.entries(patterns).map(([key, p]) => patLayer(`lyr-${key}`, p)),
        loopTimeMs: f * DT,
        dtSec: DT / 1000,
        dishField: fstamp(f),
        dishFieldCoupling: 1,
      }),
    );
    for (const key of Object.keys(patterns)) {
      const b = blockOf(out, `lyr-${key}`);
      assert.equal(b.pattern, patterns[key], `frame ${f}: ${key} untouched — no field was ever published`);
      assert.equal('patternCulture' in b, false);
    }
  }
  r.dispose();
});

ok('composition: marks + patterns in one scene — all three consumers act, each on its own axis only', () => {
  const patterns = mkPatterns();
  const breathOn = {
    kinemeBreath: DEFAULT_LAYOUT_PARAMS.kinemeBreath,
    kinemeDrift: DEFAULT_LAYOUT_PARAMS.kinemeDrift,
    kinemePaletteBreath: DEFAULT_LAYOUT_PARAMS.kinemePaletteBreath,
  };
  const plain = runScene(6, { patterns });
  const coupled = runScene(6, { coupling: 1, patterns }); // breath zeroed by the harness: slice A alone moves marks
  const coupledBreath = runScene(6, {
    coupling: 1,
    patterns,
    over: { layoutParams: { ...baseInput().layoutParams, ...breathOn } },
  });
  const itemsOf = (out) => out.find((l) => Array.isArray(l.items) && l.items.length)?.items ?? [];
  const f = 3;
  assert.notEqual(hash(itemsOf(coupled[f])), hash(itemsOf(plain[f])), 'consumer A moves the marks');
  assert.notEqual(
    hash(itemsOf(coupledBreath[f])),
    hash(itemsOf(plain[f])),
    'with breath live (A+B) the marks move too',
  );
  for (const key of ['quilt', 'glyph', 'picture', 'tidesStill', 'tidesLive', 'field', 'rewrite', 'blocks'])
    assert.equal(
      hash(blockOf(coupledBreath[f], `lyr-${key}`)),
      hash(blockOf(coupled[f], `lyr-${key}`)),
      `the breath consumer never touches the ${key} block`,
    );
  const marksOnly = (() => {
    const r = createLiveResolver();
    const outs = [];
    for (let i = 0; i < 6; i++)
      outs.push(
        r.resolveLayers(
          baseInput({ loopTimeMs: i * DT, dtSec: DT / 1000, dishField: fstamp(i), dishFieldCoupling: 1 }),
        ),
      );
    r.dispose();
    return outs;
  })();
  assert.equal(hash(itemsOf(coupled[f])), hash(itemsOf(marksOnly[f])), 'the pattern consumer never touches the marks');
  assert.equal(
    blockOf(coupled[1], 'lyr-quilt').pattern.drift,
    DEALT_DRIFT * (1 - PATTERN_DRIFT_SWELL),
    'in the same scene the drift fold acts (frame 1, the ×½ law)',
  );
  assert.ok(blockOf(coupled[f], 'lyr-tidesStill').patternCulture, 'and the TIDES descriptor rides the same frames');
});

ok('snapshot/restore: a take that begins mid-coupling continues bit-identically, patterns included', () => {
  const patterns = mkPatterns();
  const uninterrupted = runScene(20, { coupling: 0.8, patterns });
  const a = createLiveResolver();
  for (let f = 0; f < 10; f++)
    a.resolveLayers(
      sceneInput(patterns, { loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f), dishFieldCoupling: 0.8 }),
    );
  const snap = JSON.parse(JSON.stringify(a.snapshotState()));
  assert.equal(checkResolverSnapshot(snap), true, 'the mid-coupling snapshot is well-formed');
  const b = createLiveResolver();
  b.restoreState(snap);
  for (let f = 10; f < 20; f++) {
    const out = b.resolveLayers(
      sceneInput(patterns, { loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f), dishFieldCoupling: 0.8 }),
    );
    assert.equal(hash(out), hash(uninterrupted[f]), `frame ${f} after restore: the whole resolve matches`);
    assert.deepEqual(
      renderBlock(blockOf(out, 'lyr-tidesStill')),
      renderBlock(blockOf(uninterrupted[f], 'lyr-tidesStill')),
      `frame ${f}: the TIDES texture matches`,
    );
  }
  a.dispose();
  b.dispose();
});

ok('replay: the same coupled input stream resolves bit-identically on a fresh resolver', () => {
  const patterns = mkPatterns();
  const a = runScene(15, { coupling: 0.65, patterns });
  const b = runScene(15, { coupling: 0.65, patterns });
  for (let f = 0; f < 15; f++) assert.equal(hash(a[f]), hash(b[f]), `frame ${f}`);
});

console.log(`[selfcheck] dishLifePatterns (#1923 Phase 2 slice C): ${n} cases passed`);
