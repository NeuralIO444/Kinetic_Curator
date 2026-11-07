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
//      a re-deal never banks one, silence and judged swarm landings bank
//      none — and the review is FAIL-CLOSED: a throw inside it banks
//      null and the landing proceeds untouched;
//   4. THE CENSUS: a seeded corpus of real deals (ordinary rooms, plus a
//      mirror-room sub-corpus where M1's manufacturer lives), every
//      verdict re-derived from its banked record (the loisJudge
//      provenance pin), with the TUNABLE gates' observed margins printed
//      — the calibration evidence slices 2/3 set their gates from. The
//      corpus machinery is PINNED (stepped fake clock + seeded dice —
//      see withPinnedTime below), so the census counts are pinned
//      EXACTLY: drift is a finding, not weather.
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

ok(
  'reviewLanding: an exempt landing banks an exempt record with no measures; a judged swarm landing banks nothing',
  () => {
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
    // …but an EXEMPT form banks its record even in a swarm mode: exemption
    // is read off the form and never needed the build a swarm never makes.
    const swarmPlate = reviewLanding(state, { ...state.layoutParams, mode: 'hype', fieldForm: plate }, {});
    assert.equal(swarmPlate.verdict, 'exempt');
    assert.equal(swarmPlate.exempt, 'plate');
    assert.equal(reviewLanding(state, { ...state.layoutParams, fieldForm: undefined }, {}), null);
  },
);

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
  assert.deepEqual(rec.gates, REVIEW_GATES);
  if (rec.verdict === 'exempt') {
    assert.equal(rec.rung, null, 'an exempt record is never acted on (slice 3 law too)');
    assert.equal(rec.measures, null);
    assert.ok(rec.exempt);
    return;
  }
  const v = reviewVerdict(rec.measures, rec.gates);
  assert.equal(v.gate, rec.gate, 'the gate re-derives from the banked measures + gates');
  if (rec.adjustment) {
    // #2006 slice 3 — an ACTED record (the one caused re-pin of this
    // suite, proven in STAGING-REPORT-2006-S3): the banked measures are
    // the LANDING's, so they still judge it janky at the same gate —
    // the judgment stands; what changed is the rung: the ladder's last
    // step names it, a repaired record keeps the 'janky' verdict, and
    // a cut is exactly rung 5 with verdict 'cut'.
    assert.equal(v.verdict, 'janky', 'an acted record’s measures still judge the landing janky');
    assert.equal(rec.rung, rec.adjustment.steps.at(-1).rung, 'the rung is the ladder’s last step');
    if (rec.adjustment.outcome === 'cut') {
      assert.equal(rec.verdict, 'cut');
      assert.equal(rec.rung, 5);
    } else {
      assert.equal(rec.verdict, 'janky', 'a repaired landing keeps its judgment');
    }
    return;
  }
  assert.equal(rec.rung, null);
  assert.equal(v.verdict, rec.verdict, 'the verdict re-derives from the banked measures + gates');
};

// ---------------------------------------------------------------------------
// Pinned time + dice for the corpus machinery (and any check that needs
// the store's live sources stilled). The deal paths read two live
// sources: the WALL CLOCK — the Director's intensity/relax windows and
// loisActivity's snapshot windows both run off Date.now — and the LIVE
// DICE — the KINETIC passes roll on dieRng, i.e. Math.random. Left live,
// one seeded corpus deals different rooms on every run and census counts
// drift with the weather (observed across identical invocations of this
// suite: 124–152 census-A landings, janky counts 9–16). Inside
// withPinnedTime, Date.now is a stepped fake clock (a fixed epoch, +5 s
// per step — virtual duration is all the windows read) and Math.random
// is a seeded LCG, so a corpus is a pure function of its seeds. The pin
// is always restored, even on a throw.
// ---------------------------------------------------------------------------
const CENSUS_EPOCH = 1_800_000_000_000; // fixed; only the steps matter
const CENSUS_STEP_MS = 5000;
const withPinnedTime = (fn) => {
  const realNow = Date.now;
  const realRandom = Math.random;
  let t = CENSUS_EPOCH;
  let s = 0x2545f491;
  Date.now = () => t;
  Math.random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  try {
    return fn(() => {
      t += CENSUS_STEP_MS;
    });
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
};

/** A custom asset whose svg getter throws on read. The review's pool
 * merge (buildLandingItems → mergePool → sanitizeOverlay) reads it;
 * nothing else in a deal path does — the press in a silence room, which
 * never calls the review, shrugs it off entirely (probe-verified). */
const poisonAsset = () => ({
  id: 'user:poison',
  get svg() {
    throw new Error('review-path poison');
  },
});

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

ok('a judged landing in a live swarm mode banks no record — the renderer builds it no item list', () => {
  setup(4242, { mode: 'hype' });
  S().kineticVoicePass();
  assert.equal(S().fieldReview, null);
});

ok('the review is fail-closed: a review-path throw banks null and the landing still succeeds', () => {
  // Both call sites ride the same wrap (bankReview in layoutSlice): the
  // CURATOR press's inline review and landPoem's. The poison is aimed at
  // the review alone — its pool merge is the only deal-path reader of a
  // custom asset's svg.
  // Site 1: the press.
  setup(4242);
  useStore.setState({ customAssets: [poisonAsset()] });
  S().curateUnlocked();
  assert.ok(S().layoutParams.fieldForm, 'the press landing still happened');
  assert.equal(S().fieldReview, null, 'the failed review banked null, not a verdict');
  useStore.setState({ customAssets: [] });
  // Site 2: a KINETIC pass through landPoem, from a clean standing deal.
  setup(4242);
  S().curateUnlocked();
  assert.ok(S().fieldReview, 'the clean deal banked its record first');
  useStore.setState({ customAssets: [poisonAsset()] });
  S().kineticVoicePass();
  assert.equal(S().poemDeal, 1, 'the pass dealt (poemDeal advanced)');
  assert.ok(S().kineticVoiceId, 'the pass committed (a voice landed)');
  assert.equal(S().fieldReview, null, 'the failed review banked null, not a verdict');
  useStore.setState({ customAssets: [] });
});

// ---------------------------------------------------------------------------
// 4. THE CENSUS — seeded corpora of real deals through the store's real
// paths, collected under withPinnedTime: the fake clock steps before
// every setup and every action, so each corpus is a pure function of
// its seeds and its counts are pinned EXACTLY below. Records are
// collected on reference change (a pass that deals nothing leaves the
// standing record's reference untouched, so one landing is never
// counted twice). The margins printed here are the slice's product:
// slices 2/3 calibrate the TUNABLE gates from them.
// ---------------------------------------------------------------------------
const collectCorpus = (seeds, actions, extraParams = {}) =>
  withPinnedTime((step) => {
    const records = [];
    for (const seed of seeds) {
      step();
      setup(seed, extraParams);
      let last = null;
      for (const act of actions) {
        step();
        act();
        const rec = S().fieldReview;
        if (rec && rec !== last) records.push(rec);
        last = rec;
      }
    }
    return records;
  });

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
  // Exact pins (the corpus is pinned — see withPinnedTime): any drift
  // here is a changed deal path or a changed measure, never weather.
  assert.equal(c.total, 144, 'census A size, pinned exactly');
  assert.equal(c.judged, 144, 'every ordinary landing judged, none exempt');
  // #2006 slice 3 re-pin (proven in STAGING-REPORT-2006-S3): the ladder
  // now ACTS on the 11 janky landings — 3 repaired (their records keep
  // the 'janky' judgment) and 8 cut (verdict 'cut') — so the banked
  // verdict distribution is the OUTCOME distribution. The landing
  // truth underneath it is unchanged and still pinned: 133 clean
  // landings, 11 janky, every one markCover (each acted record's
  // measures re-derive that jank in rederive above).
  assert.deepEqual(c.dist, { clean: 133, janky: 3, cut: 8 }, 'census A outcomes, pinned exactly (slice 3)');
  assert.equal(
    records.filter((r) => r.verdict === 'janky' || r.verdict === 'cut').length,
    11,
    'census A janky landings, pinned exactly',
  );
  assert.deepEqual(c.gates, { markCover: 11 }, 'every census A jank is mark cover');
  assert.equal(c.maxM1, 0, 'M1 never fires in ordinary rooms');
  assert.ok(near(c.maxM2, 1, 1e-12), `M2's tail reaches full cover at its worst landing (${c.maxM2})`);
  assert.ok(near(c.minM3, 0.02916633249378799, 1e-12), `M3 floor margin (${c.minM3})`);
  assert.ok(near(c.maxM3, 0.05483045874206258, 1e-12), `M3 ceiling margin (${c.maxM3})`);
  assert.equal(c.maxM4, 0, 'no crops in ordinary rooms');
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
  // Exact pins, same discipline as census A.
  assert.equal(c.total, 20, 'census B size, pinned exactly');
  assert.equal(c.judged, 20, 'every mirror landing judged, none exempt');
  assert.deepEqual(c.dist, { clean: 9, janky: 11 }, 'census B verdicts, pinned exactly');
  assert.deepEqual(c.gates, { markCover: 6, selfOverlap: 5 }, 'census B gates, pinned exactly');
  assert.ok(near(c.maxM1, 0.3434605193277934, 1e-12), `the mirror manufactures landed self-overlap (${c.maxM1})`);
  assert.ok(near(Math.min(...m2s), 0.4152138545092997, 1e-12), 'the mirror mark-cover floor, pinned exactly');
  assert.ok(near(c.maxM2, 0.5000000000000004, 1e-12), 'the floor sits AT the gate, pinned exactly');
});

console.log(`fieldReview.selfcheck: ${n} checks passed`);
