// node src/engine/dishLifeControls.selfcheck.mjs
// #1923 Phase 4 — Governor & controls: the field culture's performer controls.
//
// What this phase adds, and what this suite pins:
//   press      the "seed from stage" trigger: a field stamp carrying `seed` is a boundary that
//              arrives early — the holder rebuilds from the PRESS frame's scene under the SAME
//              wake (the cycle clock is never rewritten: wakeMs stays fieldStamp's pure function
//              of loop time, the derivation Phase 3's TIDES-key proof rests on), and the new seed
//              catches up to the stamp's generation under the same shed bound as any catch-up.
//   held       a press under CULTURE HELD lands like a boundary under hold: the new seed is
//              published at generation 0, no stepping, the held arc skipped; release catches up
//              inside the same wake.
//   empty      a press on an empty stage unpublishes, as a boundary on an empty stage does.
//   absorbed   a press on the boundary frame itself is the boundary (epoch stays 0); a press
//              before any field culture, or riding another mode's stamp, is inert.
//   epoch      each press inside one wake bumps the seed epoch (0 = the wake's own seed). The
//              epoch rides the publication, the level-grid snapshot and the stage snapshot
//              (an optional rider, Phase 3 style), so (wake, epoch, gen) names a grid even
//              though a press rebuilds inside the wake — the coupled-TIDES key separates a
//              pre-press frame from a post-press one at the same generation.
//   replay     a recorded stream containing a press replays byte-identically on a fresh
//              resolver; a snapshot cut after the press restores and continues exactly.
//   gating     the producer's on-switch is untouched (family on AND dial above 0 — Matt's
//              ruling, kept as-is): at dial 0 a press still re-seeds the field underneath
//              while every resolved frame stays plain, because the dial gates consumers,
//              never the culture's lifecycle.
//   interval   the re-seed interval is a detent set (24 / 48 / 96 generations) riding the
//              stamp's cycleGens — a field that has ridden every stamp since Phase 1. The
//              default is 48: an untouched instrument stamps what it always stamped.
//   idle law   restated where the controls live: any touch ends the phase clock's wake (the
//              visual culture's law), and no touch can reach the field stamp — it is a pure
//              function of loop time, shed and cycle length; the field runs during interaction.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDishLifeStage } from './dishLifeStage.mjs';
import { fieldStamp, clampCycleGens, FIELD_CYCLE_GENS, FIELD_CYCLE_DETENTS } from './dishLifeField.mjs';
import { createDishLifePhase, IDLE_MS } from './dishLifePhase.mjs';
import { seedFromMarks, coverageField } from './dishLifeSeed.mjs';
import { createCulture, stepCulture, CULTURE_RULE } from './dishLife.mjs';
import { fieldLevelGrid } from './dishLifeCouple.mjs';
import { createLiveResolver, checkResolverSnapshot } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { defaultPattern } from '../state/patternTrack.js';
import { patternKey } from '../pattern/patternSource.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// ---------------------------------------------------------------- stage-level fixtures
// (the dishLifeReseed harness, extended with the press)
const W = 1000;
const H = 500;
const COLS = 96;
const ROWS = 54;
const mark = (x, y, extra = {}) => ({
  x,
  y,
  scale: 5,
  scaleY: 5,
  alpha: 80,
  assetId: 'a',
  color: '#111',
  accent: '#222',
  zTier: 1,
  glass: false,
  key: `m${x}-${y}`,
  ...extra,
});
const sceneA = () => [mark(250, 150), mark(500, 250), mark(750, 350), mark(300, 380, { assetId: 'b' }), mark(700, 120)];
const sceneB = () => [mark(150, 400), mark(850, 100), mark(500, 60, { assetId: 'c' })];
const sceneC = () => [mark(500, 250, { assetId: 'd' }), mark(200, 200), mark(800, 300), mark(350, 90)];
const layersOf = (items, extra = []) => [
  { id: 'L1', layoutParams: {}, items },
  { id: 'FX', isFx: true },
  { id: 'P', isPattern: true, items: [] },
  ...extra,
];
const fstamp = (gen, wakeMs, shed = 0, extra = {}) => ({
  mode: 'field',
  wakeMs,
  gen,
  cycleGens: FIELD_CYCLE_GENS,
  shed,
  ...extra,
});
const press = (gen, wakeMs, shed = 0) => fstamp(gen, wakeMs, shed, { seed: true });
/** Apply explicit stamp generations in order (after a press the culture lags the stamp, so the
 * reseed suite's generation-sequenced driver cannot be reused verbatim). */
const driveStamps = (stage, from, to, wakeMs, shed = 0, ls) => {
  for (let g = from; g <= to; g++) stage.apply(fstamp(g, wakeMs, shed), ls, W, H);
};
const driveTo = (stage, gen, wakeMs, shed = 0, ls) => {
  if (stage.generation < 0) stage.apply(fstamp(0, wakeMs, shed), ls, W, H);
  for (let g = stage.generation + 1; g <= gen; g++) stage.apply(fstamp(g, wakeMs, shed), ls, W, H);
};
const bedrockOf = (terrain) => {
  if (!terrain.length) return null;
  const cov = coverageField(terrain, { canvasW: W, canvasH: H, cols: COLS, rows: ROWS });
  const b = new Uint8Array(COLS * ROWS);
  let any = false;
  for (let i = 0; i < b.length; i++) if (cov[i] > 0) ((b[i] = 1), (any = true));
  return any ? b : null;
};
const manualFrom = (marks, terrain = []) => {
  const bedrock = bedrockOf(terrain);
  const seed = seedFromMarks(marks, { canvasW: W, canvasH: H, cols: COLS, rows: ROWS, bedrock });
  return createCulture({ cols: COLS, rows: ROWS, rule: CULTURE_RULE, bedrock, seed: seed.cells });
};
const pubEq = (stage, manual, label) => {
  assert.deepEqual([...stage.publishedField.level], [...manual.field.level], `${label}: level`);
  assert.deepEqual([...stage.publishedField.activity], [...manual.field.activity], `${label}: activity`);
};
const stepTo = (manual, gen) => {
  while (manual.gen < gen) stepCulture(manual);
  return manual;
};

// ---------------------------------------------------------------- the press
ok('press: an early boundary — the field becomes the press frame’s derivation, same wake', () => {
  const st = createDishLifeStage();
  driveTo(st, 20, 0, 0, layersOf(sceneA()));
  assert.equal(st.publishedField.seedEpoch, 0, 'the wake’s own seed');
  // the performer changes the scene and presses at stamp generation 21
  st.apply(press(21, 0), layersOf(sceneB()), W, H);
  assert.equal(st.publishedField.wakeMs, 0, 'the wake did not move: the clock was not rewritten');
  assert.equal(st.publishedField.seedEpoch, 1, 'the press’s seed supersedes the wake’s');
  assert.equal(st.generation, 4, 'rebuilt at 0 and caught up under the shed bound (4 steps)');
  pubEq(st, stepTo(manualFrom(sceneB()), 4), 'press frame: the new seed, caught up');
  assert.notDeepEqual(
    [...st.publishedField.level],
    [...stepTo(manualFrom(sceneA()), 4).field.level],
    'not the old seed at the same generation',
  );
  // driven on, the press seed reaches the cycle’s phase and holds it frame for frame
  driveStamps(st, 22, 41, 0, 0, layersOf(sceneB()));
  assert.equal(st.generation, 41);
  pubEq(st, stepTo(manualFrom(sceneB()), 41), 'caught up to the cycle’s generation');
});

ok('held: a press under CULTURE HELD lands at generation 0; release catches up in the same wake', () => {
  const st = createDishLifeStage();
  driveTo(st, 12, 0, 0, layersOf(sceneA()));
  st.apply(press(13, 0, 2), layersOf(sceneB()), W, H);
  assert.equal(st.generation, 0, 'the seed landed: a new culture at generation 0');
  pubEq(st, manualFrom(sceneB()), 'held press: the field is the NEW seed, not the old continuation');
  st.apply(fstamp(20, 0, 2), layersOf(sceneB()), W, H);
  assert.equal(st.generation, 0, 'held: the clock’s target advances, the culture does not');
  st.apply(fstamp(20, 0, 1), layersOf(sceneB()), W, H);
  assert.equal(st.generation, 1, 'trickle bounds the catch-up to one step');
  st.apply(fstamp(20, 0, 0), layersOf(sceneB()), W, H);
  assert.equal(st.generation, 5, 'release: catch-up is shed-bounded per frame');
  driveStamps(st, 21, 30, 0, 0, layersOf(sceneB()));
  pubEq(st, stepTo(manualFrom(sceneB()), 30), 'released: the press seed at the clock’s target');
});

ok('empty: a press on an empty stage unpublishes, like a boundary on an empty stage', () => {
  const st = createDishLifeStage();
  driveTo(st, 10, 0, 0, layersOf(sceneA()));
  assert.equal(st.publishedField.active, true);
  st.apply(press(11, 0), layersOf([]), W, H);
  assert.equal(st.publishedField.active, false, 'nothing to seed: no stale field is retained');
  assert.equal(st.publishedField.level, null);
  // and with no content layer at all, the same press unpublishes through the early path
  const st2 = createDishLifeStage();
  driveTo(st2, 10, 0, 0, layersOf(sceneA()));
  st2.apply(
    press(11, 0),
    [
      { id: 'FX', isFx: true },
      { id: 'P', isPattern: true, items: [] },
    ],
    W,
    H,
  );
  assert.equal(st2.publishedField.active, false, 'no content layer: nothing stays published');
  // a later scene re-wakes on its own cycle, the press forgotten
  st.apply(fstamp(0, 12000), layersOf(sceneB()), W, H);
  assert.equal(st.publishedField.seedEpoch, 0);
  pubEq(st, manualFrom(sceneB()), 're-woken on the returning scene');
});

ok('absorbed: a press on the boundary frame is the boundary; a second press bumps the epoch again', () => {
  const st = createDishLifeStage();
  driveTo(st, FIELD_CYCLE_GENS - 1, 0, 0, layersOf(sceneA()));
  st.apply(press(0, 12000), layersOf(sceneB()), W, H);
  assert.equal(st.publishedField.seedEpoch, 0, 'the boundary’s own build IS the press frame’s scene');
  pubEq(st, manualFrom(sceneB()), 'boundary press: the boundary derivation');
  // two presses inside one wake: epochs 1, then 2 — each names its own seed
  driveTo(st, 10, 12000, 0, layersOf(sceneB()));
  st.apply(press(11, 12000), layersOf(sceneC()), W, H);
  assert.equal(st.publishedField.seedEpoch, 1);
  driveStamps(st, 12, 20, 12000, 0, layersOf(sceneC()));
  const before = [...st.publishedField.level];
  st.apply(press(21, 12000), layersOf(sceneA()), W, H);
  assert.equal(st.publishedField.seedEpoch, 2, 'the second press supersedes the first');
  assert.notDeepEqual([...st.publishedField.level], before, 'the field is the newest seed’s');
  pubEq(st, stepTo(manualFrom(sceneA()), st.generation), 'second press: the newest derivation');
});

ok('inert: a press before any field culture builds as a plain wake; another mode’s stamp ignores it', () => {
  const fresh = createDishLifeStage();
  fresh.apply(press(0, 0), layersOf(sceneA()), W, H);
  assert.equal(fresh.publishedField.active, true);
  assert.equal(fresh.publishedField.seedEpoch, 0, 'the first build is the wake’s seed, press or not');
  pubEq(fresh, manualFrom(sceneA()), 'first-frame press: the wake derivation');
  // a quiet culture standing on the same holder: a `seed` flag on a QUIET stamp changes nothing
  const q = (gen, wakeMs, extra = {}) => ({
    mode: 'quiet',
    wakeMs,
    gen,
    cycleGens: FIELD_CYCLE_GENS,
    shed: 0,
    strength: 0.5,
    ...extra,
  });
  const plain = createDishLifeStage();
  const flagged = createDishLifeStage();
  for (let g = 0; g <= 12; g++) {
    plain.apply(q(g, 0), layersOf(sceneA()), W, H);
    flagged.apply(q(g, 0, g === 6 ? { seed: true } : {}), layersOf(g === 6 ? sceneB() : sceneA()), W, H);
  }
  assert.deepEqual(flagged.snapshot(), plain.snapshot(), 'the quiet culture never re-seeds on a press flag');
  assert.equal(flagged.publishedField.active, false, 'and nothing field-like was published');
});

// ---------------------------------------------------------------- epoch, snapshot, seek
ok('epoch rider: present only while a press stands; restore keeps it; malformed riders refused', () => {
  const st = createDishLifeStage();
  driveTo(st, 10, 0, 0, layersOf(sceneA()));
  assert.equal('seedEpoch' in st.snapshot(), false, 'no press yet: the snapshot shape is the old shape');
  st.apply(press(11, 0), layersOf(sceneB()), W, H);
  driveStamps(st, 12, 18, 0, 0, layersOf(sceneB()));
  const snap = JSON.parse(JSON.stringify(st.snapshot()));
  assert.equal(snap.seedEpoch, 1, 'the rider rides while a press stands in the wake');
  // (the snapshot validator's rider terms are pinned at resolver level below, where a whole
  // resolver snapshot exists to splice into — the reseed suite's pattern for the terrain rider)
  // restore: the restored stage keeps the epoch and continues bit-identically
  const re = createDishLifeStage();
  re.restore(snap);
  for (let g = 19; g <= 30; g++) {
    st.apply(fstamp(g, 0), layersOf(sceneB()), W, H);
    re.apply(fstamp(g, 0), layersOf(sceneB()), W, H);
    assert.equal(re.publishedField.seedEpoch, 1, `gen ${g}: the epoch survived the restore`);
    assert.deepEqual([...re.publishedField.level], [...st.publishedField.level], `gen ${g}: level`);
    assert.deepEqual([...re.publishedField.activity], [...st.publishedField.activity], `gen ${g}: activity`);
  }
  // a pre-Phase-4 snapshot (rider stripped) restores as epoch 0, exactly the historical shape
  const stripped = JSON.parse(JSON.stringify(snap));
  delete stripped.seedEpoch;
  const legacy = createDishLifeStage();
  legacy.restore(stripped);
  legacy.apply(fstamp(19, 0), layersOf(sceneB()), W, H);
  assert.equal(legacy.publishedField.seedEpoch, 0, 'stripped rider = the wake seed’s epoch');
});

ok('seek-back after a press rebuilds the PRESS seed at the earlier generation, epoch preserved', () => {
  const st = createDishLifeStage();
  driveTo(st, 4, 0, 0, layersOf(sceneA()));
  st.apply(press(5, 0), layersOf(sceneB()), W, H); // press early: culture lands at 4 of the new seed
  driveStamps(st, 6, 8, 0, 0, layersOf(sceneB()));
  assert.equal(st.generation, 8);
  st.apply(fstamp(3, 0), layersOf(sceneB()), W, H); // a replay seeking back inside the wake
  assert.equal(st.generation, 3, 'the seek rebuilds and steps to the stamped generation');
  assert.equal(st.publishedField.seedEpoch, 1, 'seeking does not change which seed this is');
  pubEq(st, stepTo(manualFrom(sceneB()), 3), 'seek-back: the press seed at generation 3');
});

// ---------------------------------------------------------------- the key seam
ok('key seam: the level grid carries the epoch; a coupled TIDES key separates pre- and post-press', () => {
  const tides = { ...defaultPattern('TIDES', 777), drift: 0 };
  const PAL = { swatches: ['#101418', '#3f6d4e', '#c8b06a', '#e8e2d2'], bg: '#0a0a0a', ink: '#f2ede2' };
  const st = createDishLifeStage();
  driveTo(st, 3, 0, 0, layersOf(sceneA()));
  const before = fieldLevelGrid(st.publishedField);
  assert.equal(before.seedEpoch, 0);
  const keyBefore = patternKey(tides, PAL, 200, 120, 0, null, { coupling: 1, grid: before });
  // the press lands on a stamp carrying the SAME generation (at 4 generations a second the
  // stamp's gen repeats across many frames): the new seed steps to that same generation 3,
  // so wake, gen and dial all coincide — the epoch is the only component that can separate them
  st.apply(press(3, 0), layersOf(sceneB()), W, H);
  assert.equal(st.generation, 3, 'the post-press culture stands at the same generation 3');
  const after = fieldLevelGrid(st.publishedField);
  assert.equal(after.seedEpoch, 1);
  assert.equal(after.wakeMs, before.wakeMs, 'same wake — the epoch is the only new component');
  assert.equal(after.gen, before.gen, 'same generation');
  assert.notDeepEqual([...after.level], [...before.level], 'different grids');
  const keyAfter = patternKey(tides, PAL, 200, 120, 0, null, { coupling: 1, grid: after });
  assert.notEqual(keyAfter, keyBefore, 'the key separates them: no stale TIDES frame after a press');
  // a hand-built holder without an epoch snapshots as epoch 0
  const bare = fieldLevelGrid({ active: true, cols: 2, rows: 2, gen: 3, wakeMs: 0, level: new Float32Array(4) });
  assert.equal(bare.seedEpoch, 0);
});

// ---------------------------------------------------------------- the interval detents
ok('interval: the detents clamp, the default is the Phase 1 length, the stamp derivation follows', () => {
  assert.deepEqual([...FIELD_CYCLE_DETENTS], [24, 48, 96]);
  assert.equal(FIELD_CYCLE_GENS, 48, 'the default never moved');
  for (const [v, want] of [
    [24, 24],
    [48, 48],
    [96, 96],
    [30, 48],
    [0, 48],
    ['x', 48],
    [undefined, 48],
  ]) {
    assert.equal(clampCycleGens(v), want, `clampCycleGens(${JSON.stringify(v)})`);
  }
  // the stamp is self-describing at every detent: wake and gen are pure functions of loop time
  // GIVEN the recorded cycleGens, so a take stamped at a detent replays on that detent
  const s24 = fieldStamp(30000, { cycleGens: 24 });
  assert.deepEqual([s24.cycleGens, s24.wakeMs, s24.gen], [24, 30000, 0], '24 gens at 4 gps: a 6 s cycle');
  const s96 = fieldStamp(30000, { cycleGens: 96 });
  assert.deepEqual([s96.cycleGens, s96.wakeMs, s96.gen], [96, 24000, 24], '96 gens at 4 gps: a 24 s cycle');
  const s48 = fieldStamp(30000);
  assert.deepEqual([s48.cycleGens, s48.wakeMs, s48.gen], [48, 24000, 24], 'the default stamp is the Phase 1 stamp');
  // a stage driven at a detent re-seeds on the detent's own boundary
  const st = createDishLifeStage();
  const dstamp = (gen, wakeMs) => ({ mode: 'field', wakeMs, gen, cycleGens: 24, shed: 0 });
  for (let g = 0; g < 24; g++) st.apply(dstamp(g, 0), layersOf(sceneA()), W, H);
  st.apply(dstamp(0, 6000), layersOf(sceneB()), W, H);
  pubEq(st, manualFrom(sceneB()), 'the 24-gen cycle re-seeds at its own boundary');
});

// ---------------------------------------------------------------- the idle law
ok('idle law: any touch ends the phase clock’s wake; no touch can reach the field stamp', () => {
  const ph = createDishLifePhase({ enabled: true });
  ph.tick(0, { hasMarks: true });
  const w = ph.tick(IDLE_MS, { hasMarks: true });
  assert.equal(w.status, 'growing', 'idle for the ruled span: the visual culture wakes');
  assert.equal(ph.touch(IDLE_MS + 100, 'pointer').ended, true, 'a touch ends it at once');
  // the field stamp has no touch input at all: its output over loop time is the same before and
  // after any touch, which is the Phase 1 exemption stated as a derivation, not a hope
  const beforeStamp = fieldStamp(30000, { shed: 1 });
  ph.touch(20000, 'key');
  ph.touch(25000, 'midi');
  assert.deepEqual(fieldStamp(30000, { shed: 1 }), beforeStamp, 'touches do not move the field clock');
});

// ---------------------------------------------------------------- resolver level
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
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
const hash = (layers) => createHash('sha256').update(canon(layers)).digest('hex').slice(0, 16);
const rstamp = (gen, wakeMs = 0, shed = 0, extra = {}) => ({
  mode: 'field',
  wakeMs,
  gen,
  cycleGens: FIELD_CYCLE_GENS,
  shed,
  ...extra,
});
/** Frames 0..44 across wakes 0 / 12000 / 24000, with a press at frame 20 (cycle 2, stamp gen 5). */
const streamInput = (f, over = {}) =>
  baseInput({
    loopTimeMs: f * DT,
    dtSec: DT / 1000,
    dishField:
      f < 15 ? rstamp(f, 0) : f < 30 ? rstamp(f - 15, 12000, 0, f === 20 ? { seed: true } : {}) : rstamp(f - 30, 24000),
    ...over,
  });

ok('resolver: a stream with a press replays byte-identically; a post-press snapshot continues it', () => {
  const input = (f) => streamInput(f, { dishFieldCoupling: 0.8 });
  const run = (r, from, to, acc) => {
    for (let f = from; f < to; f++) acc.push(hash(r.resolveLayers(input(f))));
    return acc;
  };
  const whole = run(createLiveResolver(), 0, 45, []);
  assert.deepEqual(run(createLiveResolver(), 0, 45, []), whole, 'a fresh resolver replays the press exactly');
  const a = createLiveResolver();
  run(a, 0, 25, []);
  const snap = JSON.parse(JSON.stringify(a.snapshotState()));
  assert.equal(checkResolverSnapshot(snap), true, 'the post-press snapshot is well-formed');
  assert.equal(snap.dishField.seedEpoch, 1, 'the press stands in the snapshot’s wake');
  const b = createLiveResolver();
  b.restoreState(snap);
  assert.deepEqual(run(b, 25, 45, []), whole.slice(25), 'restored after the press, continued bit-identically');
  a.dispose();
  b.dispose();
  // the consumers acted on the post-press field too
  const plain = createLiveResolver();
  const p40 = plain.resolveLayers(baseInput({ loopTimeMs: 40 * DT, dtSec: DT / 1000 }));
  assert.notEqual(whole[40], hash(p40), 'frame 40: the coupling is live on the pressed seed');
  plain.dispose();
});

ok('resolver: the snapshot validator takes the seed-epoch rider and refuses a malformed one', () => {
  const r = createLiveResolver();
  for (let f = 0; f < 25; f++) r.resolveLayers(streamInput(f, { dishFieldCoupling: 0.5 }));
  const snap = JSON.parse(JSON.stringify(r.snapshotState()));
  r.dispose();
  assert.equal(snap.dishField.seedEpoch, 1, 'the stream’s press stands in the snapshot');
  assert.equal(checkResolverSnapshot(snap), true, 'a genuine snapshot validates');
  for (const bad of ['x', -1, 1.5]) {
    const malformed = { ...snap, dishField: { ...snap.dishField, seedEpoch: bad } };
    assert.equal(checkResolverSnapshot(malformed), false, `seedEpoch ${JSON.stringify(bad)} is refused`);
  }
  const zeroed = { ...snap, dishField: { ...snap.dishField, seedEpoch: 0 } };
  assert.equal(checkResolverSnapshot(zeroed), true, 'an explicit epoch 0 is a legal member');
});

ok('resolver, dial 0: a press re-seeds the field underneath while every frame stays plain', () => {
  const plain = createLiveResolver();
  const looped = createLiveResolver();
  for (let f = 0; f < 30; f++) {
    // both resolvers get the IDENTICAL input sequence — including the re-deal from a new seed
    // exactly at the press frame (frame 20) — except the plain one carries no field keys at all,
    // so any difference is the field's alone
    const seed = f < 20 ? 4242 : 777;
    const p = plain.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, seed }));
    const q = looped.resolveLayers(streamInput(f, { dishFieldCoupling: 0, seed }));
    assert.equal(hash(q), hash(p), `frame ${f}: dial 0 moves nothing, press or not`);
  }
  const snap = looped.snapshotState();
  assert.equal(snap.dishField.seedEpoch, 1, 'the press landed in the field’s lifecycle at dial 0');
  const marksAfter = snap.dishField.marks;
  plain.dispose();
  looped.dispose();
  const fresh = createLiveResolver();
  for (let f = 0; f < 5; f++)
    fresh.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: rstamp(f, 0), seed: 777 }));
  assert.deepEqual(marksAfter, fresh.snapshotState().dishField.marks, 'the pressed seed is the press frame’s stage');
  fresh.dispose();
});

console.log(`dishLifeControls.selfcheck: OK (${n} cases — #1923 Phase 4: governor & controls)`);
