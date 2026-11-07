// node src/curator/fieldReview.selfcheck.mjs
// #2006 SLICE 1 — the review loop in shadow: a fresh poem landing is
// measured on its BUILT ITEM LIST (never the stored form), judged by the
// deterministic rules table alone, and the verdict record banks on the
// deal commit beside fieldGateRefusal. Nothing acts, nothing speaks.
// This suite proves, in order:
//   1. the measures against hand-computed fixtures (ink boxes from
//      placement's own rulers, derived here from first principles);
//   2. the verdict table and Matt's exemption table (held/kept/raygun/
//      whisper/plate are marked exempt, never judged);
//   3. the store wiring through the REAL deal paths — the CURATOR press
//      and the KINETIC passes bank records, HOLD carries the record by,
//      a re-deal never banks one, silence and swarm landings bank none;
//   4. THE CENSUS: a seeded corpus of real deals (ordinary rooms, plus a
//      mirror-room sub-corpus where M1's manufacturer lives), every
//      verdict re-derived from its banked record (the loisJudge
//      provenance pin), with the TUNABLE gates' observed margins printed
//      — the calibration evidence slices 2/3 set their gates from.
import assert from 'node:assert/strict';
import { useStore } from '../state/store.js';
import { resetDirector } from './director.js';
import { measureLandedForm, reviewVerdict, reviewExemption, reviewLanding, REVIEW_GATES } from './fieldReview.mjs';
import { fieldDealReport } from '../poets/fieldForm.js';
import { stampIdForChar, stampWidthEm } from '../poets/placement.js';
import { keepPoem } from '../poets/poemRow.mjs';
import { mkRng } from '../engine/prng.js';

const S = () => useStore.getState();

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------
// 1. Hand-computed measure fixtures. Canvas 1000x500, form aspect 2, so one
// form unit = 500px on both axes. A glyph of em 0.1 inks 50px tall; its ink
// width is placement's ruler (stampWidthEm) carried through the plate-zone
// formula by hand here — never through the module under test.
// ---------------------------------------------------------------------------
const A_ID = stampIdForChar('A');
const AW = stampWidthEm(A_ID, 'A'); // 'A' advance, em units
const EM = 0.1;
const HW = ((AW * EM) / 2 / 2) * 1000; // ink half-width, px
const HH = (EM / 2) * 500; // ink half-height, px = 25
const INK = 4 * HW * HH; // one glyph's ink area
const fxForm = (stamps) => ({ poetId: 'fx', pieceId: 'p1', layout: 'lines', aspect: 2, stamps });
const fxStamp = (x, y) => ({ assetId: A_ID, ch: 'A', x, y, rotation: 0, em: EM });
const fItem = (j, x, y) => ({ key: `field-fx-p1-${j}`, x, y, scale: 2.2, scaleY: 2.2, assetId: A_ID });
const mItem = (x, y, s) => ({ key: `mark-${x}-${y}-${s}`, x, y, scale: s, scaleY: s, assetId: 'org_blob_01' });

ok('measures: two glyphs apart, no marks — only coverage is non-zero, exactly as hand-computed', () => {
  const form = fxForm([fxStamp(0.5, 0.5), fxStamp(1.5, 0.5)]);
  const m = measureLandedForm([fItem(0, 250, 250), fItem(1, 750, 250)], form, 1000, 500);
  assert.ok(m);
  assert.equal(m.m1, 0);
  assert.equal(m.m2, 0);
  assert.equal(m.m4, 0);
  assert.ok(near(m.m3, (2 * INK) / 500000, 1e-12), `m3 ${m.m3} vs hand ${(2 * INK) / 500000}`);
  assert.equal(m.formItems, 2);
  assert.equal(m.markItems, 0);
});

ok('measures: two glyphs on one centre overprint completely — m1 = 1', () => {
  const form = fxForm([fxStamp(0.5, 0.5), fxStamp(0.5, 0.5)]);
  const m = measureLandedForm([fItem(0, 250, 250), fItem(1, 250, 250)], form, 1000, 500);
  assert.ok(near(m.m1, 1, 1e-12), `m1 ${m.m1}`);
});

ok(
  'measures: mark cover is a DRAW-ORDER fact — a mark under the glyph covers nothing, over it covers its share',
  () => {
    const form = fxForm([fxStamp(0.5, 0.5), fxStamp(1.5, 0.5)]);
    const giant = mItem(500, 250, 20); // box covers the whole dish
    // A rect mark covering glyph 1's right half exactly: x-span [750, 750+HW]
    // (half the glyph's 2*HW ink width), y-span the glyph's full ink height.
    const half = { key: 'mark-half', x: 750 + HW / 2, y: 250, scale: HW / 100, scaleY: 0.5, assetId: 'org_blob_01' };
    const under = measureLandedForm([giant, fItem(0, 250, 250), fItem(1, 750, 250), half], form, 1000, 500);
    assert.ok(near(under.m2, 0.25, 1e-9), `m2 under-reading ${under.m2} vs hand 0.25`);
    const over = measureLandedForm([fItem(0, 250, 250), fItem(1, 750, 250), giant], form, 1000, 500);
    assert.ok(near(over.m2, 1, 1e-12), `m2 over-reading ${over.m2} vs hand 1`);
  },
);

ok('measures: a glyph centred on the dish edge is cropped — m4 counts it', () => {
  const form = fxForm([fxStamp(0, 0.5), fxStamp(1, 0.5)]);
  const m = measureLandedForm([fItem(0, 0, 250), fItem(1, 500, 250)], form, 1000, 500);
  assert.ok(near(m.m4, 0.5, 1e-12), `m4 ${m.m4}`);
});

ok('measures: no form items in the list, or no ink, measures nothing', () => {
  const form = fxForm([fxStamp(0.5, 0.5)]);
  assert.equal(measureLandedForm([mItem(100, 100, 1)], form, 1000, 500), null);
  assert.equal(measureLandedForm([], form, 1000, 500), null);
  assert.equal(measureLandedForm([fItem(0, 250, 250)], form, 0, 500), null);
});

// ---------------------------------------------------------------------------
// 2. The verdict table + the exemption table.
// ---------------------------------------------------------------------------
ok('verdict table: first failing gate in measure order names the verdict; boundaries are strict', () => {
  const base = { m1: 0, m2: 0, m3: 0.03, m4: 0 };
  assert.deepEqual(reviewVerdict({ ...base, m1: 0.06, m2: 0.9 }), { verdict: 'janky', gate: 'selfOverlap' });
  assert.deepEqual(reviewVerdict({ ...base, m2: 0.51 }), { verdict: 'janky', gate: 'markCover' });
  assert.deepEqual(reviewVerdict({ ...base, m3: 0.36 }), { verdict: 'janky', gate: 'coverage' });
  assert.deepEqual(reviewVerdict({ ...base, m3: 0.001 }), { verdict: 'janky', gate: 'coverageLow' });
  assert.deepEqual(reviewVerdict({ ...base, m4: 0.1 }), { verdict: 'janky', gate: 'crop' });
  assert.deepEqual(reviewVerdict({ m1: 0.05, m2: 0.5, m3: 0.35, m4: 0 }), { verdict: 'clean', gate: null });
  assert.deepEqual(reviewVerdict(base), { verdict: 'clean', gate: null });
});

ok('exemptions: plate / raygun / whisper / kept are marked, a plain form is judged', () => {
  const plain = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
  assert.ok(plain, 'a real plain deal to exempt-check against');
  const plate = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1', plate: true }, mkRng(42), {
    aspect: 10 / 7,
  }).form;
  assert.ok(plate?.plate, 'a real plate deal');
  assert.equal(reviewExemption(plate, []), 'plate');
  assert.equal(reviewExemption({ ...plain, raygun: { mode: 'carson', seed: 7 } }, []), 'raygun');
  assert.equal(reviewExemption({ ...plain, register: 'whisper' }, []), 'whisper');
  assert.equal(reviewExemption(plain, keepPoem([], plain)), 'kept');
  assert.equal(reviewExemption(plain, []), null);
  assert.equal(reviewExemption(null, []), null);
});

ok('reviewLanding: an exempt landing banks an exempt record with no measures; a swarm landing banks nothing', () => {
  const state = S();
  const plate = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1', plate: true }, mkRng(42), {
    aspect: 10 / 7,
  }).form;
  const rec = reviewLanding(state, { ...state.layoutParams, fieldForm: plate }, { stream: 'press:0' });
  assert.equal(rec.verdict, 'exempt');
  assert.equal(rec.exempt, 'plate');
  assert.equal(rec.measures, null);
  assert.equal(rec.backend, 'rules');
  assert.equal(rec.rung, null);
  const plain = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
  assert.equal(reviewLanding(state, { ...state.layoutParams, mode: 'hype', fieldForm: plain }, {}), null);
  assert.equal(reviewLanding(state, { ...state.layoutParams, fieldForm: undefined }, {}), null);
});

// ---------------------------------------------------------------------------
// 3. The store wiring, through the real deal paths (fieldDeal's fixture).
// ---------------------------------------------------------------------------
const setup = (seed, extraParams = {}) => {
  resetDirector();
  useStore.setState({
    seed,
    seedOffsets: { spatial: 0, color: 0, asset: 0, noise: 0 },
    curatePress: 0,
    poemDeal: 0,
    lockedParams: {},
    layoutParams: { ...useStore.getInitialState().layoutParams, composition: 'raster', ...extraParams },
    kineticRound: null,
    kineticNotch: null,
    armedMode: null,
    armedMotion: null,
    fieldReview: null,
    fieldGateRefusal: null,
  });
};

const rederive = (rec) => {
  assert.equal(rec.backend, 'rules');
  assert.equal(rec.rung, null);
  assert.deepEqual(rec.gates, REVIEW_GATES);
  if (rec.verdict === 'exempt') {
    assert.equal(rec.measures, null);
    assert.ok(rec.exempt);
    return;
  }
  const v = reviewVerdict(rec.measures, rec.gates);
  assert.equal(v.verdict, rec.verdict, 'the verdict re-derives from the banked measures + gates');
  assert.equal(v.gate, rec.gate);
};

ok('a landed CURATOR press banks the shadow record on the same commit', () => {
  setup(4242);
  S().curateUnlocked();
  const rec = S().fieldReview;
  assert.ok(S().layoutParams.fieldForm, 'the press dealt a form');
  assert.ok(rec, 'the record banked');
  assert.equal(rec.stream, 'press:0');
  assert.equal(rec.seed, 4242);
  rederive(rec);
});

ok('the deal replays bit-for-bit — landed params AND the banked record', () => {
  setup(4242);
  S().curateUnlocked();
  const params1 = JSON.stringify(S().layoutParams);
  const rec1 = JSON.stringify(S().fieldReview);
  setup(4242);
  S().curateUnlocked();
  assert.equal(JSON.stringify(S().layoutParams), params1);
  assert.equal(JSON.stringify(S().fieldReview), rec1);
});

ok('a KINETIC voice pass banks its record off the poem stream', () => {
  setup(4242);
  S().curateUnlocked();
  S().kineticVoicePass();
  const rec = S().fieldReview;
  assert.ok(rec, 'the voice pass landing banked a record');
  assert.match(rec.stream, /^poem:\d+$/);
  rederive(rec);
});

ok('HOLD carries the record by with the standing form — no landing, no new review', () => {
  setup(4242);
  S().curateUnlocked();
  const recBefore = JSON.stringify(S().fieldReview);
  const formBefore = JSON.stringify(S().layoutParams.fieldForm);
  S().togglePoemHold();
  S().kineticVoicePass();
  assert.equal(JSON.stringify(S().layoutParams.fieldForm), formBefore);
  assert.equal(JSON.stringify(S().fieldReview), recBefore);
});

ok('a re-deal is never reviewed: when the form moves, the record clears instead of banking', () => {
  let moved = 0;
  for (let seed = 401; seed <= 412; seed++) {
    setup(seed);
    S().curateUnlocked();
    if (!S().layoutParams.fieldForm || !S().fieldReview) continue;
    const before = JSON.stringify(S().layoutParams.fieldForm);
    S().redealPoem();
    if (JSON.stringify(S().layoutParams.fieldForm ?? null) !== before) {
      moved++;
      assert.equal(S().fieldReview, null, `seed ${seed}: the re-deal cleared the record, banked nothing`);
    }
  }
  assert.ok(moved >= 1, 'at least one re-deal in the sweep actually moved the form');
});

ok('plain silence banks nothing (the genre gate room deals no form, no review)', () => {
  setup(4242, { composition: 'praystation' });
  S().curateUnlocked();
  assert.equal(S().layoutParams.fieldForm, undefined);
  assert.equal(S().fieldReview, null);
});

ok('a landing in a live swarm mode banks no record — the renderer builds it no item list', () => {
  setup(4242, { mode: 'hype' });
  S().kineticVoicePass();
  assert.equal(S().fieldReview, null);
});

// ---------------------------------------------------------------------------
// 4. THE CENSUS — seeded corpora of real deals through the store's real
// paths. Records are collected on reference change (a pass that deals
// nothing leaves the standing record's reference untouched, so one
// landing is never counted twice). The margins printed here are the
// slice's product: slices 2/3 calibrate the TUNABLE gates from them.
// ---------------------------------------------------------------------------
const collectCorpus = (seeds, actions, extraParams = {}) => {
  const records = [];
  for (const seed of seeds) {
    setup(seed, extraParams);
    let last = null;
    for (const act of actions) {
      act();
      const rec = S().fieldReview;
      if (rec && rec !== last) records.push(rec);
      last = rec;
    }
  }
  return records;
};

const margins = (records) => {
  const judged = records.filter((r) => r.measures);
  const col = (k) => judged.map((r) => r.measures[k]);
  const max = (a) => (a.length ? Math.max(...a) : null);
  const min = (a) => (a.length ? Math.min(...a) : null);
  const dist = {};
  const gates = {};
  for (const r of records) {
    dist[r.verdict] = (dist[r.verdict] || 0) + 1;
    if (r.gate) gates[r.gate] = (gates[r.gate] || 0) + 1;
    if (r.exempt) gates[`exempt:${r.exempt}`] = (gates[`exempt:${r.exempt}`] || 0) + 1;
  }
  return {
    total: records.length,
    judged: judged.length,
    dist,
    gates,
    maxM1: max(col('m1')),
    maxM2: max(col('m2')),
    minM3: min(col('m3')),
    maxM3: max(col('m3')),
    maxM4: max(col('m4')),
  };
};

const fmt = (v) => (v == null ? '—' : v.toFixed(4));

ok('CENSUS A — ordinary rooms: seeded press/look/voice/curator deals, every verdict re-derived', () => {
  const seeds = Array.from({ length: 60 }, (_, i) => 201 + i);
  const records = collectCorpus(seeds, [
    () => S().curateUnlocked(),
    () => S().kineticLookPass(),
    () => S().kineticVoicePass(),
    () => S().kineticCuratorPass(),
    () => S().kineticVoicePass(),
  ]);
  for (const rec of records) rederive(rec);
  const c = margins(records);
  console.log(
    `  census A (ordinary rooms, seeds 201-260 x press/look/voice/curator/voice): ${c.total} landings, ${c.judged} judged — ` +
      `verdicts ${JSON.stringify(c.dist)}, gates ${JSON.stringify(c.gates)}`,
  );
  console.log(
    `  census A margins vs TUNABLE gates: m1 max ${fmt(c.maxM1)} (gate ${REVIEW_GATES.selfOverlap}) · ` +
      `m2 max ${fmt(c.maxM2)} (gate ${REVIEW_GATES.markCover}) · ` +
      `m3 range ${fmt(c.minM3)}..${fmt(c.maxM3)} (gates ${REVIEW_GATES.coverageMin}..${REVIEW_GATES.coverageMax}) · ` +
      `m4 max ${fmt(c.maxM4)} (gate ${REVIEW_GATES.crop})`,
  );
  assert.ok(c.total >= 100, `corpus size ${c.total} >= 100 real landings`);
  assert.ok((c.dist.clean || 0) >= 1, 'honest deals read clean in ordinary rooms');
  assert.ok(c.maxM3 < REVIEW_GATES.coverageMax, 'no ordinary landing eats the dish (wide-margin pin)');
});

ok('CENSUS B — mirror rooms: the mirror manufactures self-overlap, and its mark-cover floor shows', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => 301 + i);
  const records = collectCorpus(seeds, [() => S().curateUnlocked()], { mirror: 'x' });
  for (const rec of records) rederive(rec);
  const c = margins(records);
  const m2s = records.filter((r) => r.measures).map((r) => r.measures.m2);
  console.log(
    `  census B (mirror x, seeds 301-320, press): ${c.total} landings, ${c.judged} judged — ` +
      `verdicts ${JSON.stringify(c.dist)}, gates ${JSON.stringify(c.gates)}`,
  );
  console.log(
    `  census B margins: m1 max ${fmt(c.maxM1)} (gate ${REVIEW_GATES.selfOverlap}) · ` +
      `m2 range ${fmt(m2s.length ? Math.min(...m2s) : null)}..${fmt(c.maxM2)} (gate ${REVIEW_GATES.markCover} — ` +
      `the mirror's structural floor sits AT the gate: a mirrored mark twin draws over its sibling half)`,
  );
  assert.ok(c.total >= 15, `mirror corpus size ${c.total} >= 15`);
  assert.ok(c.maxM1 > 0, 'the mirror manufactures landed self-overlap (M1 fires on real deals)');
});

console.log(`fieldReview.selfcheck: ${n} checks passed`);
