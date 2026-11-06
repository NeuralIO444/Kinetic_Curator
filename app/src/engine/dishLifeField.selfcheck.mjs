// node src/engine/dishLifeField.selfcheck.mjs
// #1994 — DISH LIFE field mode (Stage Coupling Phase 1): the persistent invisible culture.
//
//   clock       fieldStamp is a pure function of loop time; cycles of FIELD_CYCLE_GENS at the reduced
//               FIELD_GPS rate; the wake is the cycle start (the stage re-seeds when it changes)
//   publish     the stage's publishedField is ONE stable object; its level/activity ARE the live culture's
//               arrays (no copies, nothing retained); contents equal a hand-built culture from the same seed
//   determinism same scene + same stamps = the same field, frame by frame; generation g is the same field
//               however it was reached (seek-safe)
//   never draws field mode touches NO layer — the same item arrays, frame after frame, cycle after cycle;
//               no life: cells, no specks, and the layers are exactly the dealt scene (coupling 0 = today)
//   bedrock     held/locked marks are never seeded and never lived on; terrain and specks are not marks
//   shed        the governor's levels bound field stepping exactly like the other modes (trickle / hold)
//   life cycle  stamp gone = field unpublished; modes are exclusive per stamp; snapshot/restore carries it
import assert from 'node:assert/strict';
import { createDishLifeStage } from './dishLifeStage.mjs';
import { fieldStamp, FIELD_GPS, FIELD_CYCLE_GENS } from './dishLifeField.mjs';
import { QUIET_GPS } from './dishLifeQuiet.mjs';
import { seedFromMarks } from './dishLifeSeed.mjs';
import { createCulture, stepCulture, CULTURE_RULE, cultureHash } from './dishLife.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

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
const scene = () => [mark(250, 150), mark(500, 250), mark(750, 350), mark(300, 380, { assetId: 'b' }), mark(700, 120)];
const layers = () => [
  { id: 'L1', layoutParams: {}, items: scene() },
  { id: 'FX', isFx: true },
  { id: 'L2', layoutParams: {}, items: [mark(120, 420), mark(880, 80)] },
  { id: 'P', isPattern: true, items: [] },
];
const fstamp = (gen, wakeMs = 5000, shed = 0) => ({ mode: 'field', wakeMs, gen, cycleGens: FIELD_CYCLE_GENS, shed });
/** Drive a stage to `gen` one generation per apply (inside the shed bound), as a stamp stream would. */
const drive = (stage, gen, wakeMs = 5000, shed = 0, ls = layers()) => {
  for (let g = stage.generation < 0 ? 0 : stage.generation + 1; g <= gen; g++)
    stage.apply(fstamp(g, wakeMs, shed), ls, W, H);
  return ls;
};

// ---- the clock
ok('fieldStamp: pure cycle arithmetic at a reduced rate', () => {
  assert.deepEqual(fieldStamp(0), { mode: 'field', wakeMs: 0, gen: 0, cycleGens: FIELD_CYCLE_GENS, shed: 0 });
  assert.deepEqual(fieldStamp(3000), { mode: 'field', wakeMs: 0, gen: 12, cycleGens: FIELD_CYCLE_GENS, shed: 0 });
  const last = fieldStamp(11_999);
  assert.deepEqual([last.wakeMs, last.gen], [0, FIELD_CYCLE_GENS - 1], 'the last generation of a cycle');
  const next = fieldStamp(12_000);
  assert.deepEqual([next.wakeMs, next.gen], [12_000, 0], 'the cycle rolls: a re-seed wake');
  assert.deepEqual(fieldStamp(4321), fieldStamp(4321), 'pure: same loop time, same stamp');
  assert.equal(FIELD_GPS < QUIET_GPS, true, 'a reduced rate: slower than the culture tempo');
  assert.equal(FIELD_CYCLE_GENS / FIELD_GPS, 12, 'a 12 s cycle');
  assert.equal(fieldStamp(100, { shed: 2 }).shed, 2, 'the governor level rides the stamp');
});

ok('fieldStamp: junk time reads as the first cycle, never NaN', () => {
  for (const t of [NaN, -5, 'x', undefined, null]) {
    const s = fieldStamp(t);
    assert.deepEqual([s.wakeMs, s.gen, s.mode], [0, 0, 'field']);
  }
});

// ---- publication: the field IS the culture's published field, from the same seed
ok('publish: holder contents equal a hand-built culture from the same marks, generation by generation', () => {
  const stage = createDishLifeStage();
  const marks = [...scene(), mark(120, 420), mark(880, 80)];
  const seed = seedFromMarks(marks, { canvasW: W, canvasH: H, cols: COLS, rows: ROWS });
  const manual = createCulture({ cols: COLS, rows: ROWS, rule: CULTURE_RULE, seed: seed.cells });
  const holder = stage.publishedField;
  assert.equal(holder.active, false, 'nothing published before the first field stamp');
  for (let g = 0; g <= 20; g++) {
    stage.apply(fstamp(g), layers(), W, H);
    assert.equal(holder.active, true);
    assert.equal(holder.gen, g);
    assert.deepEqual([holder.cols, holder.rows], [COLS, ROWS]);
    assert.deepEqual([...holder.level], [...manual.field.level], `gen ${g}: level is the culture's field`);
    assert.deepEqual([...holder.activity], [...manual.field.activity], `gen ${g}: activity is the culture's field`);
    stepCulture(manual);
  }
  assert.ok(
    holder.level.some((v) => v > 0),
    'the field is alive over the scene',
  );
});

ok('publish: one stable object, live arrays, nothing retained across a re-seed', () => {
  const stage = createDishLifeStage();
  const holder = stage.publishedField;
  drive(stage, 6);
  const lvl = holder.level;
  const act = holder.activity;
  drive(stage, 12);
  assert.equal(stage.publishedField, holder, 'the same object across frames');
  assert.equal(holder.level, lvl, 'within a culture the arrays are the culture’s own (no per-frame copy)');
  assert.equal(holder.activity, act);
  // a new cycle (new wake) re-seeds: the holder re-points at the new culture and forgets the old arrays
  stage.apply(fstamp(0, 17_000), layers(), W, H);
  assert.equal(stage.publishedField, holder, 'the same object across a re-seed');
  assert.notEqual(holder.level, lvl, 'the old frame is not retained');
  assert.equal(holder.gen, 0);
  // and when the stamp goes, nothing stale remains readable
  stage.apply(undefined, layers(), W, H);
  assert.deepEqual(
    [holder.active, holder.level, holder.activity, holder.gen],
    [false, null, null, -1],
    'stamp gone: the field is unpublished, not frozen',
  );
});

// ---- determinism
ok('determinism: same scene + same stamps = the same field, including across a seek back', () => {
  const a = createDishLifeStage();
  const b = createDishLifeStage();
  const seq = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  for (const g of seq) {
    a.apply(fstamp(g), layers(), W, H);
    b.apply(fstamp(g), layers(), W, H);
    assert.deepEqual([...a.publishedField.level], [...b.publishedField.level], `gen ${g}: level`);
    assert.deepEqual([...a.publishedField.activity], [...b.publishedField.activity], `gen ${g}: activity`);
  }
  // generation 5 reached directly vs via 12 and a seek back: the same field (the seed is frozen)
  const direct = createDishLifeStage();
  drive(direct, 5);
  const want = [...direct.publishedField.level];
  for (let k = 0; k < 3 && a.generation !== 5; k++) a.apply(fstamp(5), layers(), W, H);
  assert.equal(a.generation, 5, 'a stamp behind the culture rebuilds and lands on the stamped generation');
  assert.deepEqual([...a.publishedField.level], want, 'generation 5 is the same field however reached');
  // the golden fingerprint of the underlying culture is stable under the same construction
  const seed = seedFromMarks([...scene(), mark(120, 420), mark(880, 80)], {
    canvasW: W,
    canvasH: H,
    cols: COLS,
    rows: ROWS,
  });
  const c1 = createCulture({ cols: COLS, rows: ROWS, rule: CULTURE_RULE, seed: seed.cells });
  const c2 = createCulture({
    cols: COLS,
    rows: ROWS,
    rule: CULTURE_RULE,
    seed: seedFromMarks([...scene(), mark(120, 420), mark(880, 80)], { canvasW: W, canvasH: H, cols: COLS, rows: ROWS })
      .cells,
  });
  for (let g = 0; g < 12; g++) {
    stepCulture(c1);
    stepCulture(c2);
  }
  assert.equal(cultureHash(c1), cultureHash(c2), 'same marks = same culture hash (the replay golden)');
});

// ---- never draws: the stage output is exactly the dealt scene
ok('never draws: no layer is touched, frame after frame, cycle after cycle', () => {
  const stage = createDishLifeStage();
  const ls = layers();
  const refs = ls.map((l) => l.items);
  const pristine = JSON.stringify(layers());
  for (let g = 0; g < FIELD_CYCLE_GENS; g++) {
    assert.equal(stage.apply(fstamp(g), ls, W, H), true, 'a field frame is applied');
    ls.forEach((l, i) => assert.equal(l.items, refs[i], `gen ${g}: the very same item arrays`));
    assert.equal(JSON.stringify(ls), pristine, `gen ${g}: the layers are the dealt scene, byte for byte`);
  }
  // a re-seed cycle and a speck-permitting caller change nothing either
  for (let g = 0; g <= 10; g++) {
    stage.apply(fstamp(g, 17_000), ls, W, H, { specks: true });
    ls.forEach((l, i) => assert.equal(l.items, refs[i], 're-seed: still untouched'));
  }
  const all = ls.flatMap((l) => (Array.isArray(l.items) ? l.items : []));
  assert.ok(!all.some((it) => String(it.key).startsWith('life:')), 'no cell is ever stamped');
  assert.ok(!all.some((it) => String(it.key).startsWith('speck:')), 'no speck is ever drawn');
  assert.equal(stage.field(), null, 'field mode publishes no quiet sampler — the kineme read is untouched');
  assert.ok(
    stage.publishedField.level.some((v) => v > 0),
    '…while the invisible culture lives',
  );
});

// ---- bedrock + seed exclusion
ok('bedrock: terrain is never seeded and never lived on; terrain and specks are not marks', () => {
  const held = mark(500, 250, { held: true, key: 'poem', scale: 6 });
  const withJunk = () => [
    { id: 'L1', items: [...scene(), held, { ...mark(5, 5), key: 'speck:1' }] },
    { id: 'L2', items: [mark(120, 420)] },
  ];
  const stage = createDishLifeStage();
  stage.apply(fstamp(0), withJunk(), W, H);
  const snap = stage.snapshot();
  assert.equal(snap.marks.length, 6, 'only the six real marks seed (held + speck excluded)');
  assert.ok(!snap.marks.some((m) => m.key === 'poem' || String(m.key).startsWith('speck:')));
  const cw = W / COLS;
  const ch = H / ROWS;
  for (let g = 0; g <= 30; g++) {
    stage.apply(fstamp(g), withJunk(), W, H);
    const { level } = stage.publishedField;
    for (let i = 0; i < level.length; i++) {
      const cx = (i % COLS) + 0.5;
      const cy = Math.floor(i / COLS) + 0.5;
      const d = Math.hypot(cx * cw - 500, cy * ch - 250);
      if (d < 6 * 0.05 * 500 * 0.7) assert.equal(level[i], 0, `gen ${g}: nothing lives on bedrock`);
    }
  }
});

// ---- shed
ok('shed: the governor bounds field stepping like every culture (trickle, then hold)', () => {
  const stage = createDishLifeStage();
  stage.apply(fstamp(0, 5000, 0), layers(), W, H);
  stage.apply(fstamp(30, 5000, 2), layers(), W, H);
  assert.equal(stage.generation, 0, 'shed 2 holds the field culture');
  const frozen = [...stage.publishedField.level];
  stage.apply(fstamp(30, 5000, 2), layers(), W, H);
  assert.deepEqual([...stage.publishedField.level], frozen, 'held: the field does not move');
  stage.apply(fstamp(30, 5000, 1), layers(), W, H);
  assert.equal(stage.generation, 1, 'shed 1 trickles one generation per frame');
  stage.apply(fstamp(30, 5000, 0), layers(), W, H);
  assert.equal(stage.generation, 1 + 4, 'shed 0 catches up in bounded steps (SHED_STEPS)');
});

// ---- life cycle: exclusivity + snapshot
ok('life cycle: modes are exclusive per stamp; the visual path is exactly as it was', () => {
  const stage = createDishLifeStage();
  drive(stage, 6);
  assert.equal(stage.publishedField.active, true);
  // a visual stamp takes the stage over: the field unpublishes and the scene dissolves as it always has
  const ls = layers();
  stage.apply({ wakeMs: 5000, gen: 6, shed: 0 }, ls, W, H);
  assert.equal(stage.publishedField.active, false, 'a non-field stamp unpublishes the field');
  assert.ok(
    ls[2].items.some((it) => String(it.key).startsWith('life:')),
    'the visual culture draws as before',
  );
  // and a field stamp on a new wake re-seeds the field, drawing nothing
  const ls2 = layers();
  const refs = ls2.map((l) => l.items);
  stage.apply(fstamp(0, 42_000), ls2, W, H);
  assert.equal(stage.publishedField.active, true);
  ls2.forEach((l, i) => assert.equal(l.items, refs[i], 'field again: untouched'));
});

ok('snapshot: a take that begins mid-field restores the publication and continues identically', () => {
  const a = createDishLifeStage();
  drive(a, 10);
  const snap = JSON.parse(JSON.stringify(a.snapshot()));
  assert.deepEqual(snap.field, { cycleGens: FIELD_CYCLE_GENS }, 'field mode rides the snapshot');
  const b = createDishLifeStage();
  b.restore(snap);
  assert.equal(b.publishedField.active, true, 'restored: the field is published before any new stamp');
  assert.equal(b.publishedField.gen, 10);
  assert.deepEqual([...b.publishedField.level], [...a.publishedField.level]);
  for (let g = 11; g <= 18; g++) {
    a.apply(fstamp(g), layers(), W, H);
    b.apply(fstamp(g), layers(), W, H);
    assert.deepEqual([...b.publishedField.level], [...a.publishedField.level], `gen ${g}: identical continuation`);
  }
  const z = createDishLifeStage();
  z.restore(null);
  z.restore({ marks: [] });
  assert.equal(z.publishedField.active, false, 'junk snapshots publish nothing');
});

console.log(`[selfcheck] dishLifeField (#1994): ${n} cases passed`);
