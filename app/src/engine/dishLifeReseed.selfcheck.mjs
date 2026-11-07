// node src/engine/dishLifeReseed.selfcheck.mjs
// #1923 Phase 3 — the closed loop: the culture periodically RE-SEEDS from the stage as it then stands.
//
// Matt's ruling (2026-11-06): the closed loop is IN, with periodic re-seed from the stage — NOT light
// reinforcement. The mechanism is the cycle clock Phase 1 built (FIELD_CYCLE_GENS generations per
// cycle; the field clock at FIELD_GPS, the quiet clock at QUIET_GPS): when the cycle rolls, the
// stamp's wake changes and the stage rebuilds its culture from the CURRENT scene through the same
// seedFromMarks derivation as the first wake. No blend, no write-back, no new recorded state — the
// wake was already in the stamp. This suite pins the loop as a system, at stage and resolver level:
//
//   law        at the boundary the field BECOMES the Phase 1 derivation of the boundary stage
//              (computed independently here), generation resets to the new cycle's 0, and one
//              generation before the boundary the field is still pure evolution of the old seed
//   no early   a scene changed mid-cycle does not leak into the field until the boundary
//   again      a second boundary re-seeds from the then-current stage; the two re-seeds differ
//   dial 0     the loop runs on stamps alone — with the coupling dial at 0 the resolver's frames
//              stay byte-identical to plain while the field wakes, steps and re-seeds underneath
//   exclusions terrain (held/locked) and pattern/FX layers are excluded at boundaries exactly as
//              at wake; bedrock cells are never alive in the re-seeded culture
//   shed       the boundary LANDS under the governor's hold (the new seed at generation 0);
//              stepping waits, trickle bounds it, release catches up inside the NEW cycle — the
//              held cycle's remaining arc is skipped, never resumed
//   replay     the same stamp stream replays bit-identically across two boundaries; snapshot /
//              restore taken mid-cycle and exactly at a boundary continues bit-identically —
//              INCLUDING with terrain standing (the terrain rider: a restore used to rebuild with
//              no bedrock and diverged from the first stepped generation; pinned fixed here)
//   consumers  with the dial up, slices A–D's read keeps acting across the boundary on the
//              re-seeded field, with no seam change
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDishLifeStage } from './dishLifeStage.mjs';
import { FIELD_CYCLE_GENS } from './dishLifeField.mjs';
import { seedFromMarks, coverageField } from './dishLifeSeed.mjs';
import { createCulture, stepCulture, CULTURE_RULE } from './dishLife.mjs';
import { createLiveResolver, checkResolverSnapshot } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// ---------------------------------------------------------------- stage-level fixtures
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
const fstamp = (gen, wakeMs, shed = 0) => ({ mode: 'field', wakeMs, gen, cycleGens: FIELD_CYCLE_GENS, shed });
/** Step a stage one generation per apply up to `gen` inside one wake, as a stamp stream would. */
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
/** The Phase 1 derivation, computed independently of the stage: seed + culture, stepped `gen` times. */
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

// ---------------------------------------------------------------- the loop law
ok('law: the boundary field IS the Phase 1 derivation of the boundary stage; gen resets', () => {
  const st = createDishLifeStage();
  driveTo(st, FIELD_CYCLE_GENS - 1, 0, 0, layersOf(sceneA()));
  assert.equal(st.generation, FIELD_CYCLE_GENS - 1);
  // one generation before the boundary: still pure evolution of the wake seed, nothing re-seeded early
  pubEq(st, stepTo(manualFrom(sceneA()), FIELD_CYCLE_GENS - 1), 'boundary-1');
  // the boundary: a new wake over a NEW scene
  const man = manualFrom(sceneB());
  for (let g = 0; g <= 12; g++) {
    st.apply(fstamp(g, 12000), layersOf(sceneB()), W, H);
    assert.equal(st.generation, g, `gen ${g}: the counter belongs to the new cycle`);
    assert.equal(st.publishedField.gen, g, 'the publication follows the new cycle');
    pubEq(st, man, `boundary gen ${g}`);
    stepCulture(man);
  }
});

ok('no early re-seed: a mid-cycle scene change waits for the boundary', () => {
  const x = createDishLifeStage();
  const y = createDishLifeStage();
  driveTo(x, 20, 0, 0, layersOf(sceneA()));
  driveTo(y, 20, 0, 0, layersOf(sceneA()));
  for (let g = 21; g < FIELD_CYCLE_GENS; g++) {
    x.apply(fstamp(g, 0), layersOf(sceneA()), W, H);
    y.apply(fstamp(g, 0), layersOf(sceneB()), W, H); // y's stage changes mid-cycle
    assert.deepEqual([...y.publishedField.level], [...x.publishedField.level], `gen ${g}: no leak`);
    assert.deepEqual([...y.publishedField.activity], [...x.publishedField.activity], `gen ${g}: no leak`);
  }
});

ok('again: the second boundary re-seeds from the then-current stage, and the re-seeds differ', () => {
  const st = createDishLifeStage();
  driveTo(st, FIELD_CYCLE_GENS - 1, 0, 0, layersOf(sceneA()));
  st.apply(fstamp(0, 12000), layersOf(sceneB()), W, H); // the boundary
  driveTo(st, FIELD_CYCLE_GENS - 1, 12000, 0, layersOf(sceneB()));
  pubEq(st, stepTo(manualFrom(sceneB()), FIELD_CYCLE_GENS - 1), 'end of cycle 2');
  const manC = manualFrom(sceneC());
  const manB = manualFrom(sceneB());
  for (let g = 0; g <= 8; g++) {
    st.apply(fstamp(g, 24000), layersOf(sceneC()), W, H);
    pubEq(st, manC, `cycle 3 gen ${g}`);
    stepCulture(manC);
    stepCulture(manB);
  }
  assert.notDeepEqual(
    [...st.publishedField.level],
    [...manB.field.level],
    'the cycle-3 field is the cycle-3 scene’s derivation, not cycle 2’s',
  );
});

ok('a stamp jump over a whole cycle lands once, on the current stage, deterministically', () => {
  const st = createDishLifeStage();
  driveTo(st, 10, 0, 0, layersOf(sceneA()));
  // the next stamp is already in cycle 3 (wake 24000) at gen 5: cycle 2 never exists
  st.apply(fstamp(5, 24000), layersOf(sceneB()), W, H);
  assert.equal(st.generation, 4, 'catch-up is shed-bounded even across a skipped cycle');
  st.apply(fstamp(5, 24000), layersOf(sceneB()), W, H);
  assert.equal(st.generation, 5);
  pubEq(st, stepTo(manualFrom(sceneB()), 5), 'jumped boundary');
});

// ---------------------------------------------------------------- exclusions at boundaries
ok('exclusions at the boundary: terrain is bedrock, pattern/FX layers never seed', () => {
  const terrain = [mark(500, 60, { held: true })]; // stands exactly on a scene-B mark in cycle 2
  const withTerrain = [...sceneB(), ...terrain];
  const st = createDishLifeStage();
  driveTo(st, FIELD_CYCLE_GENS - 1, 0, 0, layersOf(sceneA()));
  const man = manualFrom(sceneB(), terrain);
  const bedrock = bedrockOf(terrain);
  for (let g = 0; g <= 12; g++) {
    // pattern and FX layers ride along carrying items of their own — they are not stage content
    const ls = layersOf(withTerrain, [{ id: 'P2', isPattern: true, items: [mark(100, 100), mark(900, 400)] }]);
    st.apply(fstamp(g, 12000), ls, W, H);
    pubEq(st, man, `terrain boundary gen ${g}`);
    for (let i = 0; i < bedrock.length; i++)
      if (bedrock[i]) assert.equal(st.publishedField.level[i], 0, `gen ${g}: bedrock cell ${i} is never alive`);
    stepCulture(man);
  }
});

// ---------------------------------------------------------------- shed at the boundary
ok('shed: the boundary lands under CULTURE HELD; the held arc is skipped, never resumed', () => {
  const st = createDishLifeStage();
  driveTo(st, 12, 0, 0, layersOf(sceneA()));
  // the boundary arrives while the governor holds the culture
  st.apply(fstamp(0, 12000, 2), layersOf(sceneB()), W, H);
  assert.equal(st.generation, 0, 'the re-seed landed: a new culture at generation 0');
  pubEq(st, manualFrom(sceneB()), 'held boundary: the field is the NEW seed, not the old continuation');
  st.apply(fstamp(3, 12000, 2), layersOf(sceneB()), W, H);
  assert.equal(st.generation, 0, 'held: the clock’s target advances, the culture does not');
  // trickle: one generation per frame
  st.apply(fstamp(3, 12000, 1), layersOf(sceneB()), W, H);
  assert.equal(st.generation, 1, 'trickle bounds the catch-up to one step');
  // release: catch up inside the NEW cycle, bounded per frame
  st.apply(fstamp(3, 12000, 0), layersOf(sceneB()), W, H);
  assert.equal(st.generation, 3);
  pubEq(st, stepTo(manualFrom(sceneB()), 3), 'released: the new cycle at the clock’s target');
});

// ---------------------------------------------------------------- lifecycle edges
ok('an empty stage at the boundary unpublishes; a returning scene re-wakes on it', () => {
  const st = createDishLifeStage();
  driveTo(st, 10, 0, 0, layersOf(sceneA()));
  assert.equal(st.publishedField.active, true);
  st.apply(fstamp(0, 12000), layersOf([]), W, H);
  assert.equal(st.publishedField.active, false, 'nothing to seed: no stale field is retained');
  assert.equal(st.publishedField.level, null);
  st.apply(fstamp(0, 24000), layersOf(sceneB()), W, H);
  assert.equal(st.publishedField.active, true);
  pubEq(st, manualFrom(sceneB()), 're-woken on the returning scene');
});

ok('the quiet culture shares the holder: its boundary re-seeds by the same law', () => {
  const qstamp = (gen, wakeMs) => ({ mode: 'quiet', wakeMs, gen, cycleGens: FIELD_CYCLE_GENS, shed: 0, strength: 0.5 });
  const st = createDishLifeStage();
  const ls = layersOf(sceneA());
  for (let g = 0; g < FIELD_CYCLE_GENS; g++) st.apply(qstamp(g, 0), ls, W, H);
  assert.equal(st.generation, FIELD_CYCLE_GENS - 1);
  const lsB = layersOf(sceneB());
  for (let g = 0; g <= 6; g++) st.apply(qstamp(g, 6000), lsB, W, H);
  const man = stepTo(manualFrom(sceneB()), 6);
  const out = { level: 0, activity: 0 };
  const f = st.field();
  assert.ok(f, 'the quiet field reads after the boundary');
  assert.equal(f.gen, 6);
  // the sampler reads the re-seeded culture: sample the manual culture's living cells through it
  let checked = 0;
  for (let i = 0; i < man.field.level.length; i++) {
    if (man.field.level[i] <= 0) continue;
    const cx = (i % COLS) + 0.5;
    const cy = Math.floor(i / COLS) + 0.5;
    assert.equal(f.sample((cx / COLS) * W, (cy / ROWS) * H, out), true);
    assert.ok(out.level > 0, `cell ${i}: the sampler sees the re-seeded culture alive`);
    checked++;
  }
  assert.ok(checked > 0, 'the re-seeded quiet culture has living cells to read');
});

// ---------------------------------------------------------------- replay + restore
ok('replay: the same stamp stream across two boundaries is bit-identical, twice', () => {
  const run = () => {
    const st = createDishLifeStage();
    const frames = [];
    const cycles = [
      [0, sceneA()],
      [12000, sceneB()],
      [24000, sceneC()],
    ];
    for (const [wake, scene] of cycles)
      for (let g = 0; g < FIELD_CYCLE_GENS; g++) {
        st.apply(fstamp(g, wake), layersOf(scene), W, H);
        frames.push([st.generation, [...st.publishedField.level], [...st.publishedField.activity]]);
      }
    return frames;
  };
  assert.deepEqual(run(), run(), 'two fresh stages, one stream, one field — frame by frame');
});

ok('restore at the boundary and mid-cycle continues bit-identically — terrain standing', () => {
  const terrain = [mark(500, 250, { held: true })];
  const items = [...sceneA(), ...terrain];
  const cont = (snapAt) => {
    const live = createDishLifeStage();
    driveTo(live, 20, 0, 0, layersOf(items));
    let snap;
    if (snapAt === 'mid') {
      snap = JSON.parse(JSON.stringify(live.snapshot()));
    } else {
      // walk to the boundary and snapshot on its first frame, terrain still standing, scene changed
      driveTo(live, FIELD_CYCLE_GENS - 1, 0, 0, layersOf(items));
      live.apply(fstamp(0, 12000), layersOf([...sceneB(), ...terrain]), W, H);
      snap = JSON.parse(JSON.stringify(live.snapshot()));
    }
    assert.ok(Array.isArray(snap.terrain) && snap.terrain.length === 1, 'the terrain rider rides the snapshot');
    const re = createDishLifeStage();
    re.restore(snap);
    const wake = snapAt === 'mid' ? 0 : 12000;
    const sceneNow = snapAt === 'mid' ? items : [...sceneB(), ...terrain];
    for (let g = snap.gen + 1; g <= snap.gen + 12; g++) {
      live.apply(fstamp(g, wake), layersOf(sceneNow), W, H);
      re.apply(fstamp(g, wake), layersOf(sceneNow), W, H);
      assert.deepEqual(
        [...re.publishedField.level],
        [...live.publishedField.level],
        `${snapAt} restore, gen ${g}: level`,
      );
      assert.deepEqual(
        [...re.publishedField.activity],
        [...live.publishedField.activity],
        `${snapAt} restore, gen ${g}: activity`,
      );
    }
  };
  cont('mid');
  cont('boundary');
});

ok('the terrain rider is optional: terrain-free snapshots carry no key and restore as always', () => {
  const st = createDishLifeStage();
  driveTo(st, 10, 0, 0, layersOf(sceneA()));
  const snap = st.snapshot();
  assert.equal('terrain' in snap, false, 'no terrain on the stage: the snapshot shape is the old shape');
  // a pre-rider snapshot (key stripped, terrain standing) restores as the historical no-bedrock build
  const terrain = [mark(500, 250, { held: true })];
  const withT = createDishLifeStage();
  driveTo(withT, 10, 0, 0, layersOf([...sceneA(), ...terrain]));
  const stripped = JSON.parse(JSON.stringify(withT.snapshot()));
  delete stripped.terrain;
  const legacy = createDishLifeStage();
  legacy.restore(stripped);
  const noBedrock = (() => {
    const seed = seedFromMarks(sceneA(), { canvasW: W, canvasH: H, cols: COLS, rows: ROWS });
    return stepTo(createCulture({ cols: COLS, rows: ROWS, rule: CULTURE_RULE, seed: seed.cells }), 10);
  })();
  assert.deepEqual(
    [...legacy.publishedField.level],
    [...noBedrock.field.level],
    'stripped rider = the pre-Phase-3 restore semantics, deliberately',
  );
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
const rstamp = (gen, wakeMs = 0, shed = 0) => ({ mode: 'field', wakeMs, gen, cycleGens: FIELD_CYCLE_GENS, shed });
/** Frames 0..29 across one boundary at frame 15 (wake 0 → 12000), as the field clock would stamp them. */
const streamInput = (f, over = {}) =>
  baseInput({
    loopTimeMs: f * DT,
    dtSec: DT / 1000,
    dishField: f < 15 ? rstamp(f, 0) : rstamp(f - 15, 12000),
    ...over,
  });

ok('resolver, dial 0: the loop wakes, steps and re-seeds while every frame stays plain', () => {
  const plain = createLiveResolver();
  const looped = createLiveResolver();
  for (let f = 0; f < 30; f++) {
    const p = plain.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000 }));
    const q = looped.resolveLayers(streamInput(f, { dishFieldCoupling: 0 }));
    assert.equal(hash(q), hash(p), `frame ${f}: dial 0 moves nothing`);
  }
  const snap = looped.snapshotState();
  assert.ok(snap.dishField, 'the field ran at dial 0');
  assert.equal(snap.dishField.wakeMs, 12000, 'and it re-seeded at the boundary, dial or no dial');
  assert.equal(snap.dishField.gen, 14);
  plain.dispose();
  looped.dispose();
});

ok('resolver: the boundary re-seed derives from the stage as it stands at the boundary', () => {
  // the stream's scene changes exactly at the boundary (a new deal rides a new seed)
  const r = createLiveResolver();
  for (let f = 0; f < 20; f++) r.resolveLayers(streamInput(f, { dishFieldCoupling: 0, seed: f < 15 ? 4242 : 777 }));
  const marksAfter = r.snapshotState().dishField.marks;
  r.dispose();
  const fresh = createLiveResolver();
  for (let f = 0; f < 5; f++)
    fresh.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: rstamp(f, 0), seed: 777 }));
  const marksFresh = fresh.snapshotState().dishField.marks;
  fresh.dispose();
  const before = createLiveResolver();
  for (let f = 0; f < 5; f++)
    before.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: rstamp(f, 0), seed: 4242 }));
  const marksBefore = before.snapshotState().dishField.marks;
  before.dispose();
  assert.deepEqual(marksAfter, marksFresh, 'the cycle-2 seed is the boundary stage’s own marks');
  assert.notDeepEqual(marksAfter, marksBefore, 'and not the previous cycle’s');
});

ok('resolver: replay across two boundaries, restore mid-cycle and at a boundary, consumers live', () => {
  // frames 0..44 across wakes 0 / 12000 / 24000, coupling up so the consumers ride the loop too
  const input = (f) =>
    baseInput({
      loopTimeMs: f * DT,
      dtSec: DT / 1000,
      dishField: f < 15 ? rstamp(f, 0) : f < 30 ? rstamp(f - 15, 12000) : rstamp(f - 30, 24000),
      dishFieldCoupling: 0.8,
    });
  const run = (r, from, to, acc) => {
    for (let f = from; f < to; f++) acc.push(hash(r.resolveLayers(input(f))));
    return acc;
  };
  const whole = run(createLiveResolver(), 0, 45, []);
  assert.deepEqual(run(createLiveResolver(), 0, 45, []), whole, 'a fresh resolver replays the stream exactly');
  for (const cut of [22, 30]) {
    // 22 = mid-cycle 2; 30 = the first frame of cycle 3 (a boundary snapshot)
    const a = createLiveResolver();
    run(a, 0, cut, []);
    const snap = JSON.parse(JSON.stringify(a.snapshotState()));
    assert.equal(checkResolverSnapshot(snap), true, `cut ${cut}: the snapshot is well-formed`);
    const b = createLiveResolver();
    b.restoreState(snap);
    assert.deepEqual(run(b, cut, 45, []), whole.slice(cut), `cut ${cut}: restored and continued bit-identically`);
    a.dispose();
    b.dispose();
  }
  // the consumers acted in BOTH cycles: coupled frames differ from plain on each side of the boundary
  const plain = createLiveResolver();
  for (const f of [10, 25, 40]) {
    const p = plain.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000 }));
    assert.notEqual(whole[f], hash(p), `frame ${f}: the coupling is live on the re-seeded field`);
  }
  plain.dispose();
});

ok('resolver: the snapshot validator takes the terrain rider and refuses a malformed one', () => {
  const r = createLiveResolver();
  for (let f = 0; f < 5; f++) r.resolveLayers(streamInput(f, { dishFieldCoupling: 0.5 }));
  const snap = JSON.parse(JSON.stringify(r.snapshotState()));
  r.dispose();
  assert.equal(checkResolverSnapshot(snap), true, 'a genuine snapshot validates');
  const withTerrain = { ...snap, dishField: { ...snap.dishField, terrain: [{ x: 1, y: 2, held: true }] } };
  assert.equal(checkResolverSnapshot(withTerrain), true, 'the rider is a legal snapshot member');
  const malformed = { ...snap, dishField: { ...snap.dishField, terrain: 'x' } };
  assert.equal(checkResolverSnapshot(malformed), false, 'a non-array rider is refused');
});

console.log(`dishLifeReseed.selfcheck: OK (${n} cases — #1923 Phase 3: the closed loop, periodic re-seed)`);
