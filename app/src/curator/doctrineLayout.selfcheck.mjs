// node src/curator/doctrineLayout.selfcheck.mjs
// Persona Kernel P6 (#2386): the doctrines on LAYOUT — BLAST / HYBRID / SWISS GRIT type-layout and page-layout moves.
//
//   A  off by default: no axis, no change (same array back); a tap and a doctrine-less record play nothing; the door
//   B  each move: deterministic, capped, a small step, rigid, floors held (count, ch, face, em, on the dish), visible
//   C  the artist wins: a held or kept poem never takes a layout, switch off names none (through the real store)
//   D  creatures and beasts excluded (R7): the module knows only stamps
//   E  the relation table (R8): a band verdict sets the hand; the shipped (null) table plays no verdict
//   F  callsign law, no new surface copy, no clock/die, tuning unchanged (null stays null), cost tier registered
//   G  the horn strip reads the stage's layout (a measurement; reasons only)
import assert from 'node:assert';
import fs from 'node:fs';
import {
  doctrineLayout,
  layoutMove,
  layoutHandOf,
  seedHand,
  layoutSignals,
  layoutDoctrineOf,
  hasLayout,
  LAYOUT_MOVES,
  SLAM_DEG,
  BLEED_CAP,
  STAIR_CAP,
  DRIFT_STEP,
  DRIFT_GRID,
  COLUMN_CAP,
  INDENT_MAX_COLS,
  GRID_COLUMNS,
} from '../poets/doctrineLayout.js';
import { layoutAxes, layoutStance, LAYOUT_DOCTRINE_IDS } from './doctrineLayout.mjs';
import { rayGunForm } from '../poets/rayGunForm.js';
import { stampInkBox } from '../poets/placement.js';
import { fieldFormForDeal, sanitizeFieldForm } from '../poets/fieldForm.js';
import { mkRng } from '../engine/prng.js';
import { getCostTier } from '../gl/costTiers.mjs';
import { TUNING_DEFAULTS } from '../personas/tuning.mjs';
import { createBandState, stepBand, BAND_ANSWERERS, BAND_SOLOISTS } from '../personas/band.mjs';
import { bandRead, resolveHornState, HORN_WORDS } from './hornFaces.js';
import { useStore } from '../state/store.js';
import { resetDirector } from './director.js';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  [ok] ${name}`);
};
const src = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
console.log('doctrineLayout.selfcheck');

// The caps, pinned as literals (QA nit, P6): a raise of any constant must fail here, not slide through a derived bound.
ok(
  'B0 the caps are pinned: slam 9 deg; bleed 0.14/axis; stair 0.15; drift 0.1 on a 0.05 grid; 12 columns, indent 0..2, column 0.12',
  () => {
    assert.equal(SLAM_DEG, 9, 'BLAST slam degrees');
    assert.equal(BLEED_CAP, 0.14, 'BLAST bleed per axis');
    assert.equal(STAIR_CAP, 0.15, 'HYBRID stair total');
    assert.equal(DRIFT_STEP, 0.1, 'HYBRID drift step');
    assert.equal(DRIFT_GRID, 0.05, 'HYBRID drift grid');
    assert.equal(GRID_COLUMNS, 12, 'SWISS GRIT columns');
    assert.equal(INDENT_MAX_COLS, 2, 'SWISS GRIT indent 0..2 columns');
    assert.equal(COLUMN_CAP, 0.12, 'SWISS GRIT column pull');
  },
);

const FORMS = [
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't4' }, mkRng(1)),
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't1' }, mkRng(1)),
  fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(5)),
  fieldFormForDeal({ poetId: 'rosselli', pieceId: 'r1' }, mkRng(11)),
].filter((f) => f && f.stamps && f.stamps.length > 1 && new Set(f.stamps.map((s) => s.y)).size >= 2);
assert.ok(FORMS.length >= 3, 'multi-row fixtures deal');
const MODE_OF = { carson: 'carson', greiman: 'greiman', ashworth: 'grit' };
const rec = (id, seed, axes, mode = MODE_OF[id]) => ({ mode, seed, doctrine: id, ...axes });
const SEEDS = Array.from({ length: 40 }, (_, i) => (i * 2654435761 + 11) >>> 0);

// ── A · off by default ──────────────────────────────────────────────────
ok(
  'A1 no axis named: the layout returns the very array it was given, and rayGunForm is unchanged by the module',
  () => {
    const stamps = FORMS[0].stamps;
    for (const id of LAYOUT_DOCTRINE_IDS) {
      const r = rec(id, 99, {});
      assert.equal(hasLayout(r), false);
      assert.equal(
        doctrineLayout(stamps, { n: stamps.length, rows: [{ y: 0, words: [[0]] }], aspect: 1.4 }, r),
        stamps,
      );
      const plain = rayGunForm(FORMS[0], r);
      const withAxisOff = rayGunForm(FORMS[0], { ...r, typeset: undefined, page: undefined });
      assert.deepStrictEqual(plain, withAxisOff);
    }
  },
);
ok('A2 a performer’s tap (no doctrine) and a mismatched doctrine play nothing, even with an axis named', () => {
  for (const mode of ['carson', 'greiman', 'grit', 'shot']) {
    const base = rayGunForm(FORMS[0], { mode, seed: 5 });
    assert.deepStrictEqual(rayGunForm(FORMS[0], { mode, seed: 5, typeset: 1, page: 1 }), base, `${mode}: no doctrine`);
  }
  assert.equal(layoutDoctrineOf({ mode: 'greiman', seed: 5, doctrine: 'carson', typeset: 1 }), null);
  assert.equal(
    layoutDoctrineOf({ mode: 'shot', seed: 5, doctrine: 'carson', page: 1 }),
    'carson',
    'BLAST arms shot too',
  );
});
ok(
  'A3 the door: axes are 1 or absent, hand is 1|-1 and only beside an axis, layout needs its doctrine; no key added unnamed',
  () => {
    const f = (raygun) => sanitizeFieldForm({ ...FORMS[0], raygun });
    const base = { mode: 'grit', seed: 9, doctrine: 'ashworth' };
    assert.ok(f(base) && !('typeset' in f(base).raygun) && !('hand' in f(base).raygun));
    assert.deepStrictEqual(
      (({ typeset, page, hand }) => ({ typeset, page, hand }))(f({ ...base, typeset: 1, page: 1, hand: -1 }).raygun),
      { typeset: 1, page: 1, hand: -1 },
    );
    assert.equal(f({ ...base, typeset: 2 }), null);
    assert.equal(f({ ...base, page: true }), null);
    assert.equal(f({ ...base, typeset: 1, hand: 0 }), null);
    assert.equal(f({ ...base, hand: 1 }), null, 'a lone hand is dishonest');
    assert.equal(f({ mode: 'grit', seed: 9, typeset: 1 }), null, 'layout without its doctrine is refused');
  },
);

// ── B · the moves ───────────────────────────────────────────────────────
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function run(form, id, seed, axes) {
  const r = rec(id, seed, axes);
  const before = rayGunForm(form, { ...r, typeset: undefined, page: undefined, hand: undefined });
  const after = rayGunForm(form, r);
  return { before: before.stamps, after: after.stamps, aspect: form.aspect };
}
const inkLeft = (st) =>
  Math.min(...st.map((s) => s.x - ((stampInkBox(s.assetId)?.w ?? 100) * (2.27 / 80) * s.em * 1.1) / 2));
const inkRight = (st) =>
  Math.max(...st.map((s) => s.x + ((stampInkBox(s.assetId)?.w ?? 100) * (2.27 / 80) * s.em * 1.1) / 2));
const extent = (st) => ({
  w: Math.max(...st.map((s) => s.x)) - Math.min(...st.map((s) => s.x)),
  h: Math.max(...st.map((s) => s.y)) - Math.min(...st.map((s) => s.y)),
});

for (const id of LAYOUT_DOCTRINE_IDS) {
  for (const axis of ['typeset', 'page']) {
    ok(
      `B ${id}/${axis} (${LAYOUT_MOVES[id][axis]}): deterministic; floors; capped; moves something on most seeds`,
      () => {
        let moved = 0;
        for (const form of FORMS) {
          for (const seed of SEEDS) {
            for (const hand of [1, -1]) {
              const a = run(form, id, seed, { [axis]: 1, hand });
              const b = run(form, id, seed, { [axis]: 1, hand });
              assert.deepStrictEqual(a.after, b.after, 'same record, same stamps');
              assert.equal(a.after.length, a.before.length, 'count');
              let maxShift = 0;
              a.after.forEach((s, i) => {
                const p = a.before[i];
                assert.equal(s.ch, p.ch, 'ch is law');
                assert.equal(s.assetId, p.assetId, 'the face is untouched');
                assert.equal(s.em, p.em, 'em is untouched');
                assert.ok(s.x >= 0 && s.x <= a.aspect && s.y >= 0 && s.y <= 1, 'on the dish');
                if (s.alpha !== undefined || p.alpha !== undefined) assert.equal(s.alpha, p.alpha);
                if (s.spec !== undefined || p.spec !== undefined) assert.deepStrictEqual(s.spec, p.spec);
                maxShift = Math.max(maxShift, dist(s, p));
                // slam tilts the block by at most 9 degrees (literal)
                if (LAYOUT_MOVES[id][axis] === 'slam' && s.rotation !== undefined && p.rotation !== undefined)
                  assert.ok(Math.abs(s.rotation - p.rotation) <= 9 + 1e-6, 'slam tilt within 9 degrees');
              });
              if (maxShift > 1e-9) moved++;
              // the cap: the block never travels further than its move's cap (slam: bounded by the tilt's chord)
              const cap = {
                // LITERAL caps (QA nit, P6): never derived from the constants under test, so raising a cap fails here.
                slam: 2 * Math.hypot(a.aspect, 1) * Math.sin(((9 / 2) * Math.PI) / 180) + 0.15,
                bleed: Math.hypot(0.14, 0.14) + 1e-6,
                stair: 0.15 + 1e-6,
                drift: Math.hypot(0.1 + 0.05 / 2, 0.1 * 0.6 + 0.05 / 2) + 1e-6,
                indent: (2 * a.aspect) / 12 + 1e-6,
                column: Math.hypot(0.12, 1 / 12 / 2) + 1e-6,
              }[LAYOUT_MOVES[id][axis]];
              assert.ok(
                maxShift <= cap,
                `${LAYOUT_MOVES[id][axis]}: shift ${maxShift.toFixed(4)} within cap ${cap.toFixed(4)}`,
              );
            }
          }
        }
        assert.ok(moved > FORMS.length * SEEDS.length * 0.5, `the move is visible on most calls (${moved})`);
      },
    );
  }
}

ok('B rigid: slam, bleed, drift, column keep every pairwise distance; stair and indent keep every row whole', () => {
  for (const [id, axis] of [
    ['carson', 'typeset'],
    ['carson', 'page'],
    ['greiman', 'page'],
    ['ashworth', 'page'],
  ]) {
    for (const seed of SEEDS.slice(0, 12)) {
      const { before, after } = run(FORMS[0], id, seed, { [axis]: 1 });
      for (let i = 0; i < before.length; i += 3)
        for (let j = i + 1; j < before.length; j += 5)
          assert.ok(Math.abs(dist(before[i], before[j]) - dist(after[i], after[j])) < 1e-9, `${id}/${axis} rigid`);
    }
  }
  for (const [id, axis] of [
    ['greiman', 'typeset'],
    ['ashworth', 'typeset'],
  ]) {
    for (const seed of SEEDS.slice(0, 12)) {
      const { before, after } = run(FORMS[0], id, seed, { [axis]: 1 });
      // y never moves; a row's stamps share one dx
      const byY = new Map();
      before.forEach((s, i) => {
        assert.equal(after[i].y, s.y, 'rows keep their baselines');
        if (i >= FORMS[0].stamps.length) return; // ghosts follow the nearest row
        const k = FORMS[0].stamps[i].y.toFixed(9); // the plain row it belongs to
        const dx = after[i].x - s.x;
        if (byY.has(k)) assert.ok(Math.abs(byY.get(k) - dx) < 1e-9, `${id}: a row shares one shift`);
        byY.set(k, dx);
      });
    }
  }
});

ok(
  'B words stay recoverable: within a row, glyph reading order and spacing are exactly what the treatment drew',
  () => {
    for (const id of ['greiman', 'ashworth']) {
      for (const seed of SEEDS.slice(0, 15)) {
        const { before, after } = run(FORMS[0], id, seed, { typeset: 1 });
        const n = FORMS[0].stamps.length;
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++)
            if (Math.abs(before[i].y - before[j].y) < 1e-9)
              assert.ok(
                Math.abs(before[j].x - before[i].x - (after[j].x - after[i].x)) < 1e-9,
                `${id}: a row’s spacing is untouched`,
              );
      }
    }
  },
);

ok(
  'B each move shows its own language: BLAST tilts, HYBRID cascades/lands on the grid, SWISS GRIT sets on columns',
  () => {
    let tilted = 0;
    let bled = 0;
    let onGrid = 0;
    let cascaded = 0;
    let columned = 0;
    for (const seed of SEEDS) {
      const s = run(FORMS[0], 'carson', seed, { typeset: 1 });
      if (s.after.some((st, i) => Math.abs(st.rotation - s.before[i].rotation) > 0.5)) tilted++;
      const b = run(FORMS[0], 'carson', seed, { page: 1, hand: 1 });
      const mx = Math.max(...b.after.map((st) => st.x));
      if (mx > Math.max(...b.before.map((st) => st.x)) + 1e-9) bled++;
      const d = run(FORMS[0], 'greiman', seed, { page: 1 });
      const minX = inkLeft(d.after);
      if (Math.abs(minX / DRIFT_GRID - Math.round(minX / DRIFT_GRID)) < 1e-6) onGrid++;
      const c = run(FORMS[0], 'greiman', seed, { typeset: 1 });
      const xs = c.after.map((st, i) => st.x - c.before[i].x);
      if (new Set(xs.map((v) => v.toFixed(6))).size > 2) cascaded++;
      const w = run(FORMS[0], 'ashworth', seed, { page: 1, hand: 1 });
      const left = inkLeft(w.after);
      const col = w.aspect / 12;
      if ([1, 2, 3].some((k) => Math.abs(left - k * col) < 1e-6)) columned++;
    }
    for (const [name, n] of Object.entries({ tilted, bled, onGrid, cascaded, columned }))
      assert.ok(n >= SEEDS.length * 0.4, `${name} on ${n}/${SEEDS.length} calls`);
  },
);

ok(
  'B HYBRID and SWISS GRIT keep their ink on the dish (their words stay whole); BLAST may crop but never leaves it',
  () => {
    for (const form of FORMS)
      for (const seed of SEEDS)
        for (const hand of [1, -1])
          for (const [id, axis] of [
            ['greiman', 'page'],
            ['greiman', 'typeset'],
            ['ashworth', 'page'],
            ['ashworth', 'typeset'],
          ]) {
            const { before, after, aspect } = run(form, id, seed, { [axis]: 1, hand });
            const inside = (st) => inkLeft(st) >= -1e-9 && inkRight(st) <= aspect + 1e-9;
            if (inside(before)) assert.ok(inside(after), `${id}/${axis}: ink inside before, inside after`);
          }
  },
);

ok('B hand is the mirror: the opposite hand moves the block the opposite way', () => {
  const seed = SEEDS[3];
  for (const [id, axis] of [
    ['carson', 'page'],
    ['greiman', 'page'],
    ['ashworth', 'page'],
  ]) {
    const p = run(FORMS[0], id, seed, { [axis]: 1, hand: 1 });
    const m = run(FORMS[0], id, seed, { [axis]: 1, hand: -1 });
    assert.notDeepStrictEqual(p.after, m.after);
  }
  assert.equal(layoutHandOf({ seed: 5, hand: -1 }), -1);
  assert.equal(layoutHandOf({ seed: 5 }), seedHand(5));
  const hands = new Set(SEEDS.map(seedHand));
  assert.equal(hands.size, 2, 'seeds draw both hands');
  assert.equal(new Set(SEEDS.map(layoutMove)).size, 2, 'seeds draw both axes');
});

// ── C · the artist wins ─────────────────────────────────────────────────
ok('C1 layoutAxes: off unless switched on; a hold or a keep wins; a band lay-out plays none', () => {
  for (const id of LAYOUT_DOCTRINE_IDS) {
    assert.deepStrictEqual(layoutAxes(id, 12345), {});
    assert.deepStrictEqual(layoutAxes(id, 12345, { on: false }), {});
    assert.deepStrictEqual(layoutAxes(id, 12345, { on: 1 }), {}, 'only a true switch');
    const named = layoutAxes(id, 12345, { on: true });
    assert.deepStrictEqual(Object.keys(named), [layoutMove(12345)]);
    assert.deepStrictEqual(layoutAxes(id, 12345, { on: true, held: true }), {});
    assert.deepStrictEqual(layoutAxes(id, 12345, { on: true, kept: true }), {});
    assert.deepStrictEqual(layoutAxes(id, 12345, { on: true, stance: 'rest' }), {});
  }
  assert.deepStrictEqual(layoutAxes('davis', 5, { on: true }), {}, 'only the doctrines have a layout');
  assert.deepStrictEqual(layoutAxes('carson', -1, { on: true }), {});
});

const S = () => useStore.getState();
const BASE = S();
const reset = (extra = {}) => {
  resetDirector();
  useStore.setState({
    seed: 0x2386,
    layoutParams: { ...BASE.layoutParams, composition: 'raster', fieldForm: FORMS[0] },
    lockedParams: {},
    poemDeal: 0,
    raygunTap: 0,
    curatePress: 0,
    poemDoctrine: null,
    keeps: [],
    favorites: [],
    historyUndoStack: [],
    historyRedoStack: [],
    ...extra,
  });
};
const called = (id, extra = {}, n = 24) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    reset({ poemDoctrine: id, raygunTap: i, ...extra });
    S().callPoemDoctrine();
    const r = S().layoutParams.fieldForm?.raygun;
    if (r) out.push(r);
  }
  return out;
};
ok(
  'C2 through the store: switch off names no layout axis on any call or deal; on, calls name one; replay is exact',
  () => {
    assert.equal(globalThis.__KC_DOCTRINE_LAYOUT, undefined);
    for (const id of LAYOUT_DOCTRINE_IDS) {
      const off = called(id);
      assert.ok(off.length > 0);
      for (const r of off) assert.ok(!hasLayout(r) && !('hand' in r), `${id}: off names none`);
    }
    globalThis.__KC_DOCTRINE_LAYOUT = true;
    try {
      for (const id of LAYOUT_DOCTRINE_IDS) {
        const on = called(id);
        assert.ok(on.length > 0);
        for (const r of on) {
          assert.deepStrictEqual([r.typeset === 1, r.page === 1].filter(Boolean).length, 1, 'one axis per call');
          assert.equal(r[layoutMove(r.seed)], 1, 'the axis is the seed’s');
          assert.equal(r.doctrine, id);
          assert.ok(sanitizeFieldForm({ ...FORMS[0], raygun: r }), 'the door carries it');
        }
        assert.deepStrictEqual(called(id), on, 'the same calls replay identically');
      }
      // a deal
      for (let d = 0; d < 20; d++) {
        reset({ poemDoctrine: 'ashworth', poemDeal: d });
        S().redealPoem();
        const r = S().layoutParams.fieldForm?.raygun;
        if (r) assert.equal(r.typeset === 1 || r.page === 1, true);
      }
      // HOLD wins
      for (const id of LAYOUT_DOCTRINE_IDS)
        for (const r of called(id, { lockedParams: { fieldForm: true } })) assert.ok(!hasLayout(r), `${id}: HOLD`);
      // a keep wins: the standing poem is the one a keep carries
      for (const id of LAYOUT_DOCTRINE_IDS)
        for (const r of called(id, { keeps: [{ config: { layout: { fieldForm: FORMS[0] } } }] }))
          assert.ok(!hasLayout(r), `${id}: kept`);
    } finally {
      delete globalThis.__KC_DOCTRINE_LAYOUT;
      reset();
    }
  },
);

// ── D · creatures and beasts excluded ───────────────────────────────────
ok(
  'D the layout module knows only stamps: no creature, beast, body, gait or resolver import; plates never treated',
  () => {
    const code = stripComments(src('../poets/doctrineLayout.js'));
    const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    assert.deepStrictEqual(
      imports.sort(),
      ['../engine/kernel/costRegistry.mjs', '../engine/prng.js', './placement.js'].sort(),
    );
    assert.ok(!/creature|beast|organism|gait|skeleton|resolve/i.test(code), 'no such notion in the code');
    const arm = stripComments(src('./doctrineLayout.mjs'));
    assert.ok(!/creature|beast|organism/i.test(arm));
    // a plate form is never armed by a doctrine (the arm path refuses it), so no plate carries a layout axis
    assert.ok(/form\.plate/.test(src('../state/slices/layoutSlice.js')));
  },
);

// ── E · the relation table (R8) ─────────────────────────────────────────
const clone = (o) => JSON.parse(JSON.stringify(o));
// FIXTURE: a made-up, fully ruled table — test-only, never exported, unreachable from shipped code.
function fixture(bias) {
  const t = clone(TUNING_DEFAULTS);
  t.band = { tradeRate: 1, maxHornsPerCall: 3, bandleaderCut: 0.9 };
  for (const id of BAND_SOLOISTS) {
    t.personas[id].soloLengthPhrases = 4;
    t.personas[id].stepCap = 0.1;
    t.personas[id].heat = id === 'davis' ? 1 : 0;
  }
  for (const id of BAND_ANSWERERS) {
    t.personas[id].odds = { agree: 0.5, disagree: 0.5, layOut: 0 };
    t.personas[id].answersFirst = 'davis';
  }
  for (const k of Object.keys(t.relations)) t.relations[k] = 0;
  for (const id of ['carson', 'greiman', 'ashworth']) t.relations[`${id}->davis`] = bias;
  return t;
}
function viewAt(tuning) {
  let state = createBandState();
  const log = [];
  for (let phrase = 0; phrase < 4; phrase++) {
    const r = stepBand(state, { phrase }, { seed: 7, tuning });
    state = r.state;
    for (const t of r.turns) log.unshift(t);
  }
  return { on: true, state, log };
}
ok('E1 the relation table decides: bias +1 -> every horn agrees (build), -1 -> every horn disagrees (counter)', () => {
  const agree = viewAt(fixture(1));
  const disagree = viewAt(fixture(-1));
  const tradePhrase = (v) => v.log.find((t) => t.kind === 'trade').phrase;
  for (const id of ['carson', 'greiman', 'ashworth']) {
    // read at the phrase the trade was played in
    const a = bandRead(id, { ...agree, state: { ...agree.state, phrase: tradePhrase(agree) } });
    const d = bandRead(id, { ...disagree, state: { ...disagree.state, phrase: tradePhrase(disagree) } });
    assert.equal(layoutStance(a.answer), 'build', `${id} agrees`);
    assert.equal(layoutStance(d.answer), 'counter', `${id} disagrees`);
    // the stance sets the hand against the standing layout (here: a standing BLAST-style record with hand 1)
    const standing = { mode: 'carson', seed: 1, doctrine: 'carson', page: 1, hand: 1 };
    const build = layoutAxes(id, 777, { on: true, stance: 'build', standing });
    const counter = layoutAxes(id, 777, { on: true, stance: 'counter', standing });
    assert.equal(build.hand, 1, 'agree builds on the standing hand');
    assert.equal(counter.hand, -1, 'disagree answers against it');
    // and the two hands draw different layouts
    const r = (axes) => rayGunForm(FORMS[0], { mode: MODE_OF[id], seed: 777, doctrine: id, ...axes });
    assert.notDeepStrictEqual(r(build).stamps, r(counter).stamps, `${id}: build and counter lay out differently`);
  }
  // with nothing standing, a build keeps the seed's own hand and a counter flips it
  assert.equal(layoutAxes('greiman', 777, { on: true, stance: 'build' }).hand, seedHand(777));
  assert.equal(layoutAxes('greiman', 777, { on: true, stance: 'counter' }).hand, -seedHand(777));
});
ok(
  'E2 null tuning is unruled: the shipped table plays no verdict, so no stance and the call draws its own hand',
  () => {
    const v = viewAt(TUNING_DEFAULTS);
    assert.deepStrictEqual(v.log, []);
    for (const id of ['carson', 'greiman', 'ashworth']) assert.equal(bandRead(id, v)?.answer ?? null, null);
    assert.equal(layoutStance(null), null);
    assert.equal(layoutStance({}), null);
    assert.equal(layoutStance({ verdict: 'layOut', move: 'rest' }), 'rest');
    const axes = layoutAxes('carson', 4242, { on: true, stance: layoutStance(null) });
    assert.ok(!('hand' in axes), 'no stance, no named hand');
  },
);

// ── F · law ─────────────────────────────────────────────────────────────
ok('F1 callsign law: no real name and no CARSON/GREIMAN/ASHWORTH on any string; no new surface copy', () => {
  for (const f of ['../poets/doctrineLayout.js', './doctrineLayout.mjs', './doctrineLayoutLive.js']) {
    const text = src(f);
    assert.ok(!/\b(CARSON|GREIMAN|ASHWORTH)\b/.test(text), `${f}: no upper-case real name`);
    assert.ok(!/(David Carson|April Greiman|Chris Ashworth)/i.test(text), `${f}: no full name`);
    // every string literal in the code is an id, a key or a path — never a sentence a surface could print
    const code = stripComments(text).replace(/registerCostTier\([\s\S]*?\n\}\);/, ''); // the cost note is a developer string, never rendered
    for (const m of code.matchAll(/'([^'\n]*)'/g))
      assert.ok(!/\s[a-z]+\s/i.test(m[1]) || m[1].startsWith('../'), `${f}: prose string ${m[1]}`);
  }
  assert.deepStrictEqual(
    Object.keys(HORN_WORDS),
    ['REST', 'ARMED', 'SPECTRUM', 'BUILD', 'TEAR', 'GRIT'],
    'no new state word',
  );
  assert.ok(
    !/TYPESET|PAGE LAYOUT|SLAM|BLEED|STAIR|INDENT/.test(JSON.stringify(HORN_WORDS)),
    'no layout copy on a face',
  );
  const codec = stripComments(src('../panels/directors/RoomCodec.jsx'));
  assert.ok(!/>\s*(typeset|page)\s*</i.test(codec));
});
ok('F2 no clock, no die; rng only off the record’s seed', () => {
  for (const f of ['../poets/doctrineLayout.js', './doctrineLayout.mjs']) {
    const code = stripComments(src(f));
    assert.ok(!/Math\.random|Date\.now|new Date|performance\.now|setTimeout|setInterval/.test(code), f);
  }
  const live = stripComments(src('./doctrineLayoutLive.js'));
  assert.ok(!/Math\.random|Date\.now|performance\.now|setTimeout|setInterval/.test(live));
});
ok('F3 the unruled numbers stay null and the table is unchanged: no layout knob, no invented tuning', () => {
  for (const v of Object.values(TUNING_DEFAULTS.band)) assert.equal(v, null);
  for (const id of ['carson', 'greiman', 'ashworth']) {
    const p = TUNING_DEFAULTS.personas[id];
    for (const f of ['soloLengthPhrases', 'stepCap', 'heat', 'answersFirst']) assert.equal(p[f], null, `${id}.${f}`);
    for (const v of Object.values(p.odds)) assert.equal(v, null);
  }
  const doc = JSON.parse(src('../personas/tuning.json'));
  assert.equal(JSON.stringify(doc.relations).includes('null'), true);
  assert.ok(
    !/personas\/tuning|personaTuning/.test(stripComments(src('../poets/doctrineLayout.js'))),
    'the draw reads no tuning',
  );
});
ok('F4 governor cost tier registered: tier 0, structural, never shed', () => {
  const d = getCostTier('poets/doctrine-layout');
  assert.ok(d, 'declared');
  assert.equal(d.tier, 0);
  assert.equal(d.memoryBytes, 0);
});

// ── G · the horn strip ──────────────────────────────────────────────────
ok('G the strip reads the stage’s own layout record: reasons only, while the stage is that horn’s', () => {
  const r = { mode: 'grit', seed: 3, doctrine: 'ashworth', typeset: 1 };
  assert.deepStrictEqual({ ...layoutSignals(r) }, { typeset: true, page: false });
  assert.equal(layoutSignals({ mode: 'grit', seed: 3 }), null);
  const on = resolveHornState('ashworth', { stageMode: 'grit', stageSeed: 3, layout: layoutSignals(r) });
  assert.ok(on.reasons.includes('typeset') && !on.reasons.includes('page'));
  const off = resolveHornState('ashworth', { stageMode: 'grit', stageSeed: 3 });
  assert.ok(!off.reasons.includes('typeset'));
  const other = resolveHornState('carson', { stageMode: 'grit', layout: layoutSignals(r) });
  assert.ok(!other.reasons.includes('typeset'), 'another horn’s stage');
  assert.deepStrictEqual(
    { ...off, reasons: [] },
    { ...resolveHornState('ashworth', { stageMode: 'grit', stageSeed: 3 }), reasons: [] },
  );
  const codec = src('../panels/directors/RoomCodec.jsx');
  assert.match(codec, /layout: layoutSignals\(/);
  assert.match(codec, /raygun\?\.typeset === 1/);
  assert.match(codec, /raygun\?\.page === 1/);
});

console.log(`doctrineLayout.selfcheck: ${passed} checks passed`);
