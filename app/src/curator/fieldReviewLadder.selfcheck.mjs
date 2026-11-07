// node src/curator/fieldReviewLadder.selfcheck.mjs
// #2006 SLICE 3 — the review loop gets its HAND: on a JANKY fresh
// landing the ladder ACTS, inside the deal commit — rungs in slice 2's
// gate-aware order, re-measuring after each rung, stopping on clean,
// one re-deal at most, CUT on exhaustion — and the whole repair is
// delivered as ONE planned morph on the sim clock. This suite proves,
// in order:
//   1. the walk: per-gate plans, stop-on-clean, re-measure HONESTY
//      (every step's measures re-derive from a fresh reviewLanding on
//      the params carrying that step's state — nothing is projected),
//      bounded attempts (the ladder terminates; exhaustion is exactly
//      one CUT), the one-re-deal bound, and the deal counter's honesty
//      (a landed re-deal counts even when the walk then cuts);
//   2. immunity: clean / exempt / held landings and the performer's
//      own re-deals are never touched; the ray-gun gesture supersedes
//      a repair, the whisper register composes with one;
//   3. the door law for the form's `review` record, and buildPlacements'
//      application exactness (removing the record restores the landing
//      byte-for-byte);
//   4. the morph: the keyed plan's pairing law, the record carrying no
//      intermediate states, and the resolver channel settling on SIM
//      time (HELD freezes it, it plays once, a cut leaves as leavers)
//      with its state riding the #1367 snapshot as an optional key;
//   5. replay: the same deals re-derive the same adjustment with zero
//      live loop runs, and the ladder is deterministic run-to-run;
//   6. the voice on acted records (past tense, the plan that ran, the
//      validator's acted fences);
//   7. THE CALIBRATION CENSUS: slice 1's fixtures re-run with the
//      ladder live — repairs by rung, cuts, mirrored vs not.
import assert from 'node:assert/strict';
import { useStore } from '../state/store.js';
import { resetDirector } from './director.js';
import { reviewLanding, REVIEW_GATES } from './fieldReview.mjs';
import { runReviewLadder, REVIEW_SHRINK_FACTOR, REVIEW_MORPH_MS } from './fieldReviewLadder.mjs';
import {
  proposedOrder,
  rulesVoice,
  voiceForRecord,
  validateReviewProposal,
  sanitizeReviewVoice,
  reviewAskContext,
} from './fieldReviewVoice.mjs';
import { sanitizeFieldForm, reviewAdjustedForm, fieldDealReport } from '../poets/fieldForm.js';
import { buildPlacements } from '../engine/buildPlacements.js';
import { planMorphByKey, blendItems } from '../engine/kernel/itemMorph.mjs';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { resolvePalette } from '../data/palettes.js';
import { getQualityCaps } from '../data/quality.js';
import { ASSETS } from '../data/assets/index.js';
import { mkRng } from '../engine/prng.js';

const S = () => useStore.getState();

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const oka = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// ---------------------------------------------------------------------------
// Pinned time + dice, on slice 1's machinery (the corpora below ARE
// slice 1's fixtures: same seeds, same actions, same stepped clock).
// ---------------------------------------------------------------------------
const CENSUS_EPOCH = 1_800_000_000_000;
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
      t += 5000;
    });
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
};

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

// ---------------------------------------------------------------------------
// 1. THE WALK
// ---------------------------------------------------------------------------
ok('plan: the ladder walks slice 2’s gate-aware order for every gate', () => {
  setup(4242);
  const state = S();
  const form = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
  const params = { ...state.layoutParams, fieldForm: form };
  const base = reviewLanding(state, params, { stream: 'poem:0' });
  assert.ok(base && base.measures, 'a judged synthetic landing to walk from');
  for (const gate of ['selfOverlap', 'markCover', 'coverage', 'coverageLow', 'crop']) {
    const rec = { ...base, verdict: 'janky', gate, measures: base.measures ?? { m1: 0, m2: 0, m3: 0.03, m4: 0 } };
    const acted = runReviewLadder(state, params, rec, { redeal: () => null });
    assert.ok(acted, `gate ${gate}: the ladder acted (or honestly exhausted)`);
    assert.deepEqual(
      acted.record.adjustment.plan,
      proposedOrder(gate),
      `gate ${gate}: the plan is the gate-aware order`,
    );
    // The walk terminates: steps are a prefix of the plan (plus the cut),
    // each rung at most once, in plan order.
    const rungs = acted.record.adjustment.steps.map((s) => s.rung);
    assert.equal(new Set(rungs).size, rungs.length, `gate ${gate}: no rung runs twice`);
    const order = proposedOrder(gate);
    let last = -1;
    for (const r of rungs) {
      const i = order.indexOf(r);
      assert.ok(i > last, `gate ${gate}: steps walk the plan in order`);
      last = i;
    }
  }
});

ok('the ladder refuses what it may not touch: clean, exempt, already-adjusted, unmeasured', () => {
  setup(4242);
  const state = S();
  const form = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
  const params = { ...state.layoutParams, fieldForm: form };
  const base = reviewLanding(state, params, { stream: 'poem:0' });
  assert.equal(runReviewLadder(state, params, { ...base, verdict: 'clean', gate: null }), null);
  assert.equal(runReviewLadder(state, params, { ...base, verdict: 'exempt', measures: null }), null);
  assert.equal(runReviewLadder(state, params, { ...base, verdict: 'janky', measures: null }), null);
  assert.equal(runReviewLadder(state, params, null), null);
  const adjustedParams = { ...params, fieldForm: { ...form, review: { scale: 0.8, dx: 0, dy: 0 } } };
  assert.equal(
    runReviewLadder(state, adjustedParams, { ...base, verdict: 'janky', gate: 'markCover' }),
    null,
    'a form already carrying a transform is never walked twice',
  );
  // A trial the build cannot make (a live swarm mode builds no list)
  // fails the whole ladder closed: null, no half-adjustment.
  assert.equal(
    runReviewLadder(state, { ...params, mode: 'hype' }, { ...base, verdict: 'janky', gate: 'markCover' }),
    null,
  );
});

ok('stop-on-clean + re-measure honesty: a mirror markCover landing repairs at rung 1, measures re-derived', () => {
  setup(301, { mirror: 'x' });
  S().curateUnlocked();
  const rec = S().fieldReview;
  assert.ok(rec?.adjustment, 'the janky mirror landing was acted on');
  assert.equal(rec.adjustment.outcome, 'repaired');
  assert.equal(rec.rung, 1);
  assert.equal(rec.verdict, 'janky', 'the judgment of the landing stands');
  assert.equal(rec.adjustment.steps.length, 1, 'the walk stopped at the first clean rung');
  assert.equal(rec.adjustment.steps[0].verdict, 'clean');
  assert.deepEqual(S().layoutParams.fieldForm.review, { scale: REVIEW_SHRINK_FACTOR, dx: 0, dy: 0 });
  assert.deepEqual(rec.adjustment.final, { scale: REVIEW_SHRINK_FACTOR, dx: 0, dy: 0 });
  // HONESTY: the step's measures are a fresh reviewLanding on the
  // committed (adjusted) params — recomputed here, independently.
  const re = reviewLanding(S(), S().layoutParams, { stream: rec.stream });
  assert.equal(re.verdict, 'clean');
  assert.deepEqual(re.measures, rec.adjustment.steps[0].measures, 'the step’s measures are the adjusted build’s own');
  // And the LANDING's measures still judge the landing janky (the
  // record's provenance is the landing, not the repair).
  const plainParams = { ...S().layoutParams, fieldForm: (({ review, ...rest }) => rest)(S().layoutParams.fieldForm) };
  const landing = reviewLanding(S(), plainParams, { stream: rec.stream });
  assert.equal(landing.verdict, 'janky');
  assert.deepEqual(landing.measures, rec.measures);
});

ok('intermediate steps are honest states: rung 1’s janky step re-derives before rung 2 cleans (seed 302)', () => {
  setup(302, { mirror: 'x' });
  S().curateUnlocked();
  const rec = S().fieldReview;
  assert.equal(rec?.adjustment?.outcome, 'repaired');
  assert.equal(rec.rung, 2);
  assert.equal(rec.adjustment.steps.length, 2);
  const [s1, s2] = rec.adjustment.steps;
  assert.equal(s1.verdict, 'janky');
  assert.equal(s2.verdict, 'clean');
  const committed = S().layoutParams.fieldForm;
  const plain = (({ review, ...rest }) => rest)(committed);
  for (const step of [s1, s2]) {
    const re = reviewLanding(S(), { ...S().layoutParams, fieldForm: { ...plain, review: step.review } }, {});
    assert.deepEqual(re.measures, step.measures, `rung ${step.rung}’s measures re-derive from its own standing state`);
    assert.equal(re.verdict, step.verdict);
  }
  assert.deepEqual(committed.review, rec.adjustment.final);
});

// NOTE — the exhaustion pin (a drowned room's full trace, the cut, the
// deal counter's honesty) lives with the calibration census in §7: the
// pinned corpus machinery is single-run per process (a second pinned
// run sees module state stamped by the first run's fake clock — slice
// 1's suite never re-runs a corpus either), so seed 227's look-pass
// commit is asserted from the census run's own captured commit facts.

ok('one re-deal at most: the stub is called once even when the walk continues past it', () => {
  setup(4242);
  const state = S();
  const form = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
  const params = { ...state.layoutParams, fieldForm: form };
  const base = reviewLanding(state, params, { stream: 'poem:0' });
  let calls = 0;
  const redeal = () => {
    calls++;
    return { form, stream: 'poem:99' }; // the same form: if it judged janky, it judges janky again
  };
  const rec = {
    ...base,
    verdict: 'janky',
    gate: 'coverageLow',
    measures: base.measures ?? { m1: 0, m2: 0, m3: 0.001, m4: 0 },
  };
  const acted = runReviewLadder(state, params, rec, { redeal });
  assert.ok(acted);
  assert.ok(calls <= 1, `the re-deal path was drawn ${calls} times`);
  const fours = acted.record.adjustment.steps.filter((s) => s.rung === 4);
  assert.ok(fours.length <= 1, 'rung 4 appears at most once in the trace');
  const after4 = acted.record.adjustment.steps.slice(acted.record.adjustment.steps.indexOf(fours[0]) + 1);
  for (const s of after4)
    assert.ok(s.rung === 1 || s.rung === 2 || s.rung === 5, 'past a re-deal, only rungs 1–2 (and the cut) remain');
});

ok('a re-deal landing silence fails the rung and the ladder walks on (stub returns null)', () => {
  setup(4242);
  const state = S();
  const form = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
  const params = { ...state.layoutParams, fieldForm: form };
  const base = reviewLanding(state, params, { stream: 'poem:0' });
  const rec = {
    ...base,
    verdict: 'janky',
    gate: 'coverageLow',
    measures: base.measures ?? { m1: 0, m2: 0, m3: 0.001, m4: 0 },
  };
  const acted = runReviewLadder(state, params, rec, { redeal: () => null });
  assert.ok(acted);
  const four = acted.record.adjustment.steps.find((s) => s.rung === 4);
  assert.ok(four, 'the failed re-deal is in the trace');
  assert.equal(four.measures, null);
  assert.equal(four.verdict, 'janky');
  assert.equal(acted.record.adjustment.redeal, null, 'no re-deal landed, so none is recorded');
  assert.equal(acted.redealt, false, 'and the counter does not advance for a deal that never landed');
});

// ---------------------------------------------------------------------------
// 2. IMMUNITY
// ---------------------------------------------------------------------------
ok('HOLD carries an acted record and its repaired form by, byte-identical', () => {
  setup(301, { mirror: 'x' });
  S().curateUnlocked();
  assert.ok(S().fieldReview?.adjustment, 'an acted record stands');
  const recBefore = JSON.stringify(S().fieldReview);
  const formBefore = JSON.stringify(S().layoutParams.fieldForm);
  S().togglePoemHold();
  S().kineticVoicePass();
  S().curateUnlocked();
  assert.equal(JSON.stringify(S().fieldReview), recBefore, 'no landing, no new review — the acted record stands');
  assert.equal(JSON.stringify(S().layoutParams.fieldForm), formBefore, 'the repaired form stands untouched under HOLD');
});

ok('the performer’s own re-deal is never reviewed and never adjusted', () => {
  setup(301, { mirror: 'x' });
  S().curateUnlocked();
  assert.ok(S().layoutParams.fieldForm?.review, 'a repaired form stands');
  let moved = false;
  for (let i = 0; i < 6 && !moved; i++) {
    const before = JSON.stringify(S().layoutParams.fieldForm ?? null);
    S().redealPoem();
    moved = JSON.stringify(S().layoutParams.fieldForm ?? null) !== before;
  }
  assert.ok(moved, 'the re-deal moved the form in the sweep');
  assert.equal(S().fieldReview, null, 'the re-deal banked no record (slice 1’s law)');
  assert.equal(S().layoutParams.fieldForm?.review, undefined, 'the loop did not adjust the performer’s deal');
});

ok('the ray-gun gesture supersedes a repair; the whisper register composes with one', () => {
  setup(301, { mirror: 'x' });
  S().curateUnlocked();
  assert.ok(S().layoutParams.fieldForm?.review);
  S().togglePoemWhisper();
  assert.equal(S().layoutParams.fieldForm.register, 'whisper');
  assert.deepEqual(
    S().layoutParams.fieldForm.review,
    { scale: REVIEW_SHRINK_FACTOR, dx: 0, dy: 0 },
    'whisper is alpha-only: the repair stands',
  );
  S().togglePoemWhisper();
  S().cyclePoemRaygun();
  const form = S().layoutParams.fieldForm;
  assert.ok(form.raygun, 'the gun armed');
  assert.equal(form.review, undefined, 'arming the gun strips the repair record from the form');
  assert.ok(sanitizeFieldForm(form), 'the armed form still passes the door');
  assert.ok(S().fieldReview?.adjustment, 'the banked record keeps what the loop did');
});

// ---------------------------------------------------------------------------
// 3. THE DOOR + THE BUILD
// ---------------------------------------------------------------------------
ok('door law: the review record rides sanitizeFieldForm fail-closed, and only honestly', () => {
  const form = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
  const plain = sanitizeFieldForm(form);
  assert.ok(plain);
  assert.ok(!('review' in plain), 'no record in, no record out — pre-loop documents sanitize byte-identically');
  assert.deepEqual(plain, form, 'a dealt form sanitizes to itself');
  const repaired = sanitizeFieldForm({ ...form, review: { scale: 0.8, dx: 0.1, dy: -0.05 } });
  assert.deepEqual(repaired.review, { scale: 0.8, dx: 0.1, dy: -0.05 });
  assert.deepEqual(
    repaired.stamps,
    form.stamps,
    'the stored stamps never move — the transform is a record, not a rewrite',
  );
  assert.equal(sanitizeFieldForm({ ...form, review: { scale: 1.2, dx: 0, dy: 0 } }), null, 'scale > 1 is not a shrink');
  assert.equal(sanitizeFieldForm({ ...form, review: { scale: 0, dx: 0, dy: 0 } }), null);
  assert.equal(
    sanitizeFieldForm({ ...form, review: { scale: 0.8, dx: 99, dy: 0 } }),
    null,
    'a shift beyond the dish is dishonest',
  );
  assert.equal(sanitizeFieldForm({ ...form, review: { scale: 0.8, dx: 0, dy: -2 } }), null);
  assert.equal(sanitizeFieldForm({ ...form, review: 'shrink' }), null);
  assert.equal(
    sanitizeFieldForm({ ...form, review: { scale: 0.8, dx: 0, dy: 0 }, raygun: { mode: 'carson', seed: 7 } }),
    null,
    'review + raygun never compose',
  );
  const plate = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1', plate: true }, mkRng(42), {
    aspect: 10 / 7,
  }).form;
  assert.equal(
    sanitizeFieldForm({ ...plate, review: { scale: 0.8, dx: 0, dy: 0 } }),
    null,
    'a plate is exempt from the loop by ruling — plate + review is refused whole',
  );
});

ok('buildPlacements applies the transform exactly — and removing the record restores the landing byte-for-byte', () => {
  const form = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
  const review = { scale: 0.8, dx: 0.1, dy: -0.05 };
  const build = (f) =>
    buildPlacements({
      layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 24, particleCount: 24, fieldForm: f },
      seed: 4242,
      canvasW: 1000,
      canvasH: 700,
      activeAssets: ASSETS.slice(0, 40),
      palette: resolvePalette('bone', null, []),
      caps: getQualityCaps('balanced'),
      growthTick: 0,
      seedOffsets: { spatial: 0, color: 0, asset: 0, noise: 0 },
      caGrid: null,
    }).items;
  const plainItems = build(form);
  const adjItems = build({ ...form, review });
  const formItems = (items) => items.filter((it) => typeof it.key === 'string' && it.key.startsWith('field-'));
  assert.equal(formItems(adjItems).length, form.stamps.length);
  // Expected geometry: reviewAdjustedForm's stamps through the FIELD
  // block's own mapping (x = s.x/aspect * W, y = s.y * H, scale = em*20).
  const expected = reviewAdjustedForm({ ...form, review });
  formItems(adjItems).forEach((it, j) => {
    const s = expected.stamps[j];
    assert.ok(Math.abs(it.x - (s.x / form.aspect) * 1000) < 1e-9, `stamp ${j} x`);
    assert.ok(Math.abs(it.y - s.y * 700) < 1e-9, `stamp ${j} y`);
    assert.ok(Math.abs(it.scale - s.em * 20) < 1e-9, `stamp ${j} scale`);
  });
  // The marks are untouched by the poem's repair.
  const marks = (items) => items.filter((it) => !(typeof it.key === 'string' && it.key.startsWith('field-')));
  assert.deepEqual(marks(adjItems), marks(plainItems), 'non-form items are byte-identical across the repair');
  // Removal restores exactly: the same build with the record gone.
  assert.deepEqual(build(form), plainItems);
});

// ---------------------------------------------------------------------------
// 4. THE MORPH — one plan, keyed pairing, the sim-clock channel
// ---------------------------------------------------------------------------
ok('the keyed plan: a glyph pairs only with itself; a re-deal’s glyphs never cross-pair', () => {
  const glyph = (key, x, y) => ({ key, x, y, scale: 2, scaleY: 2, alpha: 80, assetId: 'latin_A' });
  const mark = (x, y) => ({ x, y, scale: 3, scaleY: 3, alpha: 60, assetId: 'org_blob_01' });
  const from = [glyph('field-g-g1-0', 100, 100), glyph('field-g-g1-1', 200, 100), mark(50, 50)];
  const to = [glyph('field-g-g1-0', 110, 105), glyph('field-g-g1-1', 200, 100), mark(55, 50)];
  const keyOf = (it) => (typeof it.key === 'string' && it.key.startsWith('field-') ? it.key : null);
  const plan = planMorphByKey(from, to, 7, keyOf);
  assert.equal(plan.pairs.length, 3, 'both glyphs pair by key; the mark pairs in the plain pass');
  assert.equal(plan.onlyFrom.length, 0);
  assert.equal(plan.onlyTo.length, 0);
  // A re-deal: same stage, new piece — the old glyph at the SAME position
  // as a new glyph must not pair with it (identity is the key, not the
  // chair): old glyphs are leavers, new glyphs joiners.
  const to2 = [glyph('field-t-t9-0', 100, 100), glyph('field-t-t9-1', 200, 100), mark(55, 50)];
  const plan2 = planMorphByKey(from, to2, 7, keyOf);
  assert.equal(plan2.pairs.length, 1, 'only the mark pairs');
  assert.equal(plan2.onlyFrom.length, 2, 'the replaced poem’s glyphs leave');
  assert.equal(plan2.onlyTo.length, 2, 'the new poem’s glyphs join');
  // A cut: no targets at all — everything keyed is a leaver.
  const plan3 = planMorphByKey(from, [mark(55, 50)], 7, keyOf);
  assert.equal(plan3.onlyFrom.length, 2);
  assert.equal(plan3.onlyTo.length, 0);
  // And the blended middle: a keyed pair’s costume swaps at its window’s
  // minimum, never a third thing — at t=0.5 the pair’s item carries one
  // side’s key (both sides share the key here: it carries the position
  // between the poses).
  const mid = blendItems(from, to, 0.5, plan);
  const midGlyph = mid.find((it) => it.key === 'field-g-g1-0');
  assert.ok(midGlyph.x > 100 && midGlyph.x < 110, 'the glyph is mid-settle between its two poses');
});

ok('the record carries ONE morph plan — a seed and a duration, no intermediate states', () => {
  setup(301, { mirror: 'x' });
  S().curateUnlocked();
  const adj = S().fieldReview.adjustment;
  assert.deepEqual(Object.keys(adj).sort(), ['final', 'morph', 'outcome', 'plan', 'redeal', 'steps']);
  assert.deepEqual(Object.keys(adj.morph).sort(), ['dur', 'seed']);
  assert.equal(adj.morph.dur, REVIEW_MORPH_MS);
  assert.ok(Number.isInteger(adj.morph.seed));
});

// The resolver channel, driven on the determinism suite's input shape.
const resolverInput = (form, over = {}) => ({
  layers: [{ id: 'lyr-a', name: 'lyr-a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  soloStash: null,
  seed: 1234,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: {
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'random',
    count: 48,
    particleCount: 48,
    ...(form ? { fieldForm: form } : {}),
  },
  caGrid: null,
  enabledAssets: null,
  shapeLevels: null,
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
  canvasW: 1000,
  canvasH: 700,
  ...over,
});
const formItemsOf = (out) =>
  (out.find((e) => e.id === 'lyr-a')?.items || []).filter(
    (it) => typeof it.key === 'string' && it.key.startsWith('field-'),
  );
const byKey = (items) => new Map(items.map((it) => [it.key, it]));

ok('the channel: the settle plays on sim time from the janky pose, freezes under HELD, and plays once', () => {
  const form = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
  const review = { scale: 0.8, dx: 0.1, dy: -0.05 };
  const repairedForm = { ...form, review };
  const stamp = { key: '4242|poem:0', seed: 99, dur: REVIEW_MORPH_MS, review };
  const r = createLiveResolver();
  // The pose before the landing: the plain form on stage.
  const before = byKey(formItemsOf(r.resolveLayers(resolverInput(form, { loopTimeMs: 0 }))));
  assert.ok(before.size > 0, 'the form stands before the settle');
  // The landing frame: the stamp arrives with the repaired form. At
  // raw = 0 the presented glyphs are the JANKY pose — the plain pose,
  // recovered by inverting the transform — not the repaired build.
  const f0 = byKey(formItemsOf(r.resolveLayers(resolverInput(repairedForm, { loopTimeMs: 100, reviewMorph: stamp }))));
  for (const [k, it] of f0) {
    const b = before.get(k);
    assert.ok(b, `glyph ${k} carried into the settle`);
    assert.ok(Math.abs(it.x - b.x) < 1e-6 && Math.abs(it.y - b.y) < 1e-6, `glyph ${k} starts at the janky pose`);
  }
  // HELD: the same sim time again — nothing advances.
  const held = byKey(
    formItemsOf(r.resolveLayers(resolverInput(repairedForm, { loopTimeMs: 100, reviewMorph: stamp }))),
  );
  for (const [k, it] of held) {
    const a = f0.get(k);
    assert.equal(it.x, a.x, `glyph ${k} frozen under HELD`);
    assert.equal(it.y, a.y);
  }
  // The raw repaired build, from a clean resolver with no stamp.
  const raw = byKey(formItemsOf(createLiveResolver().resolveLayers(resolverInput(repairedForm, { loopTimeMs: 0 }))));
  // Mid-settle: every glyph between its two poses.
  const mid = byKey(
    formItemsOf(
      r.resolveLayers(resolverInput(repairedForm, { loopTimeMs: 100 + REVIEW_MORPH_MS / 2, reviewMorph: stamp })),
    ),
  );
  let moved = 0;
  for (const [k, it] of mid) {
    const a = f0.get(k);
    const b = raw.get(k);
    const lo = Math.min(a.x, b.x) - 1e-9;
    const hi = Math.max(a.x, b.x) + 1e-9;
    assert.ok(it.x >= lo && it.x <= hi, `glyph ${k} settles along its path`);
    if (Math.abs(it.x - a.x) > 1e-6 && Math.abs(it.x - b.x) > 1e-6) moved++;
  }
  assert.ok(moved > 0, 'the settle visibly moves');
  // Completion: the presented list IS the raw build, and a later stamped
  // frame does not re-play the settle.
  const done = byKey(
    formItemsOf(
      r.resolveLayers(resolverInput(repairedForm, { loopTimeMs: 100 + REVIEW_MORPH_MS + 50, reviewMorph: stamp })),
    ),
  );
  for (const [k, it] of done) assert.equal(it.x, raw.get(k).x, `glyph ${k} landed on the raw build`);
  const later = byKey(
    formItemsOf(r.resolveLayers(resolverInput(repairedForm, { loopTimeMs: 9000, reviewMorph: stamp }))),
  );
  for (const [k, it] of later) assert.equal(it.x, raw.get(k).x, `glyph ${k}: the settle played exactly once`);
  r.dispose();
});

ok('the channel: a CUT settles as leavers with no joiners, on the same clock', () => {
  const form = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
  const stamp = { key: '4242|poem:1', seed: 5, dur: REVIEW_MORPH_MS, review: null };
  const r = createLiveResolver();
  const before = byKey(formItemsOf(r.resolveLayers(resolverInput(form, { loopTimeMs: 0 }))));
  assert.ok(before.size > 0);
  const f0 = formItemsOf(r.resolveLayers(resolverInput(null, { loopTimeMs: 100, reviewMorph: stamp })));
  assert.equal(f0.length, before.size, 'at raw = 0 the cut poem still stands — its exit is the morph');
  const mid = byKey(
    formItemsOf(r.resolveLayers(resolverInput(null, { loopTimeMs: 100 + REVIEW_MORPH_MS / 2, reviewMorph: stamp }))),
  );
  assert.equal(mid.size, before.size, 'the leavers are still on stage mid-settle');
  for (const [k, it] of mid) {
    const b = before.get(k);
    assert.ok(it.alpha < b.alpha || it.scale < b.scale, `glyph ${k} is leaving (fade or shrink, never a snap)`);
  }
  const done = formItemsOf(
    r.resolveLayers(resolverInput(null, { loopTimeMs: 100 + REVIEW_MORPH_MS + 50, reviewMorph: stamp })),
  );
  assert.equal(done.length, 0, 'the poem is gone when the settle completes');
  r.dispose();
});

ok('the channel state rides the #1367 snapshot as an OPTIONAL key, and a restored settle continues identically', () => {
  const form = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
  const review = { scale: 0.8, dx: 0.1, dy: -0.05 };
  const repairedForm = { ...form, review };
  const stamp = { key: '4242|poem:0', seed: 99, dur: REVIEW_MORPH_MS, review };
  const fresh = createLiveResolver();
  assert.equal(
    fresh.snapshotState().reviewMorph,
    undefined,
    'no settle, no key — pre-slice-3 snapshots stay byte-shaped',
  );
  fresh.dispose();
  const r = createLiveResolver();
  r.resolveLayers(resolverInput(form, { loopTimeMs: 0 }));
  r.resolveLayers(resolverInput(repairedForm, { loopTimeMs: 100, reviewMorph: stamp }));
  r.resolveLayers(resolverInput(repairedForm, { loopTimeMs: 350, reviewMorph: stamp }));
  const snap = JSON.parse(JSON.stringify(r.snapshotState()));
  assert.equal(typeof snap.reviewMorph, 'object', 'an in-flight settle rides the snapshot');
  const restored = createLiveResolver();
  assert.equal(restored.restoreState(snap), true);
  const a = r.resolveLayers(resolverInput(repairedForm, { loopTimeMs: 600, reviewMorph: stamp }));
  const b = restored.resolveLayers(resolverInput(repairedForm, { loopTimeMs: 600, reviewMorph: stamp }));
  // The comparison is the settle’s presented geometry (key, pose, scale,
  // alpha): a JSON-round-tripped snapshot also turns undefined item
  // fields null in the restored from-pose — the chip channel’s own
  // fidelity under the same round-trip, not a channel difference.
  const pose = (items) => items.map((it) => [it.key, it.x, it.y, it.scale, it.scaleY, it.alpha]);
  assert.deepEqual(pose(formItemsOf(b)), pose(formItemsOf(a)), 'the restored resolver continues the same settle');
  const tampered = JSON.parse(JSON.stringify(snap));
  tampered.reviewMorph.played = [42];
  assert.equal(
    createLiveResolver().restoreState(tampered),
    false,
    'a malformed channel state refuses the restore whole',
  );
  r.dispose();
  restored.dispose();
});

// ---------------------------------------------------------------------------
// 5. REPLAY — the adjustment re-derives; the loop never re-runs live
// ---------------------------------------------------------------------------
ok('replay: the same deal re-derives the same record, adjustment included, and the ladder is deterministic', () => {
  setup(301, { mirror: 'x' });
  S().curateUnlocked();
  const rec1 = JSON.stringify(S().fieldReview);
  const params1 = JSON.stringify(S().layoutParams);
  setup(301, { mirror: 'x' });
  S().curateUnlocked();
  assert.equal(JSON.stringify(S().fieldReview), rec1, 'the acted record replays bit-for-bit');
  assert.equal(JSON.stringify(S().layoutParams), params1);
  // The ladder itself: same inputs, same walk, twice — no clock, no
  // dice, no backend anywhere in the acting path.
  const state = S();
  const form = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;
  const params = { ...state.layoutParams, fieldForm: form };
  const base = reviewLanding(state, params, { stream: 'poem:0' });
  const rec = { ...base, verdict: 'janky', gate: 'markCover' };
  const a = runReviewLadder(state, params, rec, { redeal: () => null });
  const b = runReviewLadder(state, params, rec, { redeal: () => null });
  assert.deepEqual(a, b, 'the walk is a pure function of (state, params, record)');
});

// ---------------------------------------------------------------------------
// 6. THE VOICE ON ACTED RECORDS
// ---------------------------------------------------------------------------
ok('voice: a repaired record speaks the act in the past tense, with the plan that ran', () => {
  setup(301, { mirror: 'x' });
  S().curateUnlocked();
  const rec = S().fieldReview;
  const rv = rulesVoice(rec);
  assert.equal(rv.persona, 'lois');
  assert.ok(rv.line.endsWith('Shrunk it.'), `the act is reported, not proposed: ${rv.line}`);
  assert.deepEqual(rv.rungOrder, [1, 2, 4, 5], 'the spoken order is the plan that ran');
  assert.deepEqual(voiceForRecord(rec, 7).rungOrder, [1, 2, 4, 5]);
  // The validator on acted records: the rules line (rephrased by no one)
  // passes; a proposal mood, a rung order, or another rung’s act drops.
  assert.deepEqual(validateReviewProposal({ line: rv.line }, rec), { line: rv.line, rungOrder: null });
  assert.equal(
    validateReviewProposal({ line: rv.line.replace('Shrunk it.', 'Would shrink it.') }, rec),
    null,
    'no ‘would’ on a completed act',
  );
  assert.equal(
    validateReviewProposal({ line: rv.line, rungOrder: [1, 2, 4, 5] }, rec),
    null,
    'the order that ran is not re-proposable',
  );
  assert.equal(
    validateReviewProposal({ line: rv.line.replace('Shrunk it.', 'Shifted it back.') }, rec),
    null,
    'another rung’s act contradicts the record',
  );
  const ctx = reviewAskContext(rec);
  assert.deepEqual(ctx.rungSet, [], 'an acted record offers no rungs to order — the ask is phrasing only');
});

ok('voice: a cut record speaks the cut, and its voice sanitizes with the plan as its order', () => {
  setup(301, { mirror: 'x' });
  S().curateUnlocked();
  const repaired = S().fieldReview;
  const cut = {
    ...repaired,
    verdict: 'cut',
    rung: 5,
    adjustment: { ...repaired.adjustment, outcome: 'cut', final: null },
  };
  const rv = rulesVoice(cut);
  assert.equal(rv.persona, 'lois');
  assert.ok(rv.line.endsWith('Cut it.'), rv.line);
  assert.deepEqual(rv.rungOrder, [1, 2, 4, 5]);
  const voice = { persona: 'lois', line: rv.line, bar: 7, backend: 'rules', seed: cut.seed, rungOrder: [1, 2, 4, 5] };
  assert.deepEqual(sanitizeReviewVoice(voice, cut), voice, 'a cut voice carries the plan that ran');
  assert.deepEqual(
    validateReviewProposal({ line: rv.line }, cut),
    { line: rv.line, rungOrder: null },
    'a cut is fenced as the janky landing it was',
  );
  assert.equal(
    validateReviewProposal({ line: rv.line.replace('Cut it.', 'Shrunk it.') }, cut),
    null,
    'a cut record may not be rephrased as a repair',
  );
});

// ---------------------------------------------------------------------------
// 7. THE CALIBRATION CENSUS — slice 1’s fixtures, the ladder live.
// The brief’s question: does the ladder CUT mirrored poems at a rate
// that reads as the loop hating mirrors? The corpora answer it below,
// pinned exactly (the machinery is slice 1’s: stepped fake clock +
// seeded dice, so a corpus is a pure function of its seeds).
// ---------------------------------------------------------------------------
const collectTagged = (seeds, actions, extraParams = {}) =>
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
        if (rec && rec !== last)
          records.push({
            seed,
            rec,
            // The commit facts at the moment the record banked — the
            // exhaustion pin reads seed 227's cut commit from these.
            poemDeal: S().poemDeal,
            hasForm: !!S().layoutParams.fieldForm,
            gateRefusal: S().fieldGateRefusal,
          });
        last = rec;
      }
    }
    return records;
  });

const outcomes = (tagged) => {
  const o = { clean: 0, exempt: 0, repaired: 0, cut: 0, byRung: {}, unactedJanky: 0 };
  for (const { rec } of tagged) {
    if (rec.verdict === 'clean') o.clean++;
    else if (rec.verdict === 'exempt') o.exempt++;
    else if (rec.verdict === 'cut') o.cut++;
    else if (rec.adjustment?.outcome === 'repaired') {
      o.repaired++;
      o.byRung[rec.rung] = (o.byRung[rec.rung] || 0) + 1;
    } else o.unactedJanky++;
  }
  return o;
};

const assertLadderLaw = (tagged, label) => {
  // Stream names are unique within a session (one seed's setup): a
  // stream index names the deal that drew it, and the ladder's re-deal
  // spends the next one — never the same name twice in one session.
  const streamsBySeed = new Map();
  const streamsFor = (seed) => {
    if (!streamsBySeed.has(seed)) streamsBySeed.set(seed, new Set());
    return streamsBySeed.get(seed);
  };
  for (const { seed, rec } of tagged) {
    const streams = streamsFor(seed);
    assert.ok(!streams.has(rec.stream), `${label}: stream ${rec.stream} names two landings in seed ${seed}’s session`);
    streams.add(rec.stream);
    if (!rec.adjustment) {
      assert.equal(rec.rung, null, `${label}: an unacted record is slice 1’s, untouched`);
      continue;
    }
    const { plan, steps } = rec.adjustment;
    assert.deepEqual(plan, proposedOrder(rec.gate), `${label}: the plan is the landing gate’s order`);
    const rungs = steps.map((s) => s.rung);
    assert.equal(new Set(rungs).size, rungs.length, `${label}: no rung runs twice`);
    let last = -1;
    for (const r of rungs) {
      const i = plan.indexOf(r);
      assert.ok(i > last, `${label}: steps walk the plan in order`);
      last = i;
    }
    assert.ok(steps.filter((s) => s.rung === 4).length <= 1, `${label}: one re-deal at most`);
    assert.equal(rec.rung, steps.at(-1).rung, `${label}: the record’s rung is the ladder’s last step`);
    if (rec.adjustment.redeal) {
      assert.notEqual(
        rec.adjustment.redeal.stream,
        rec.stream,
        `${label}: a re-deal never re-names its landing’s stream`,
      );
      assert.ok(
        !streams.has(rec.adjustment.redeal.stream),
        `${label}: a re-deal’s stream is spent exactly once per session`,
      );
      streams.add(rec.adjustment.redeal.stream);
    }
    if (rec.adjustment.outcome === 'cut')
      assert.equal(steps.at(-1).rung, 5, `${label}: a cut is the ladder’s last step`);
  }
};

ok('CALIBRATION — census A (ordinary rooms): repairs by rung, cuts, and the ladder’s law over every landing', () => {
  const tagged = collectTagged(
    Array.from({ length: 60 }, (_, i) => 201 + i),
    [
      () => S().curateUnlocked(),
      () => S().kineticLookPass(),
      () => S().kineticVoicePass(),
      () => S().kineticCuratorPass(),
      () => S().kineticVoicePass(),
    ],
  );
  assertLadderLaw(tagged, 'census A');
  const o = outcomes(tagged);
  console.log(
    `  census A ladder outcomes: ${tagged.length} landings — ${o.clean} clean (unacted), ${o.repaired} repaired ` +
      `(by rung ${JSON.stringify(o.byRung)}), ${o.cut} cut, ${o.unactedJanky} janky unacted`,
  );
  assert.equal(tagged.length, 144);
  assert.equal(o.clean, 133, 'clean landings are never acted on');
  assert.equal(o.unactedJanky, 0, 'every janky landing is acted on');
  assert.equal(o.repaired, 3);
  assert.deepEqual(o.byRung, { 2: 2, 4: 1 });
  assert.equal(o.cut, 8, 'the drowned rooms: m2 ≥ 0.94 at landing, every rung re-measured short of the gate');
  // The exhaustion pin, on seed 227's look-pass commit as captured by
  // the census run itself (see the note in §1: one pinned run only).
  const cut227 = tagged.find((e) => e.seed === 227 && e.rec.stream === 'poem:0');
  assert.ok(cut227, 'seed 227’s drowned landing is in the corpus');
  const rec = cut227.rec;
  assert.equal(rec.verdict, 'cut');
  assert.equal(rec.rung, 5);
  assert.equal(rec.adjustment.outcome, 'cut');
  assert.deepEqual(
    rec.adjustment.steps.map((s) => s.rung),
    [1, 2, 4, 5],
    'every rung ran once, in plan order, then the cut',
  );
  assert.equal(rec.adjustment.steps.at(-1).verdict, 'janky', 'the cut banks the state it cut');
  assert.deepEqual(rec.adjustment.steps.at(-1).measures, rec.adjustment.steps.at(-2).measures);
  assert.equal(cut227.hasForm, false, 'the poem leaves the stage: silence, as a gate refusal lands');
  assert.equal(cut227.gateRefusal, null, 'a cut is not a gate refusal — the refusal record stands untouched');
  assert.equal(
    cut227.poemDeal,
    2,
    'the landing AND the ladder’s landed re-deal both count (§3.8: the counter is the log)',
  );
  assert.equal(rec.adjustment.redeal.stream, 'poem:1');
});

ok('CALIBRATION — census B (mirror rooms): the ladder does NOT hate mirrors', () => {
  const tagged = collectTagged(
    Array.from({ length: 20 }, (_, i) => 301 + i),
    [() => S().curateUnlocked()],
    {
      mirror: 'x',
    },
  );
  assertLadderLaw(tagged, 'census B');
  const o = outcomes(tagged);
  console.log(
    `  census B ladder outcomes (mirrored): ${tagged.length} landings — ${o.clean} clean (unacted), ${o.repaired} repaired ` +
      `(by rung ${JSON.stringify(o.byRung)}), ${o.cut} cut, ${o.unactedJanky} janky unacted`,
  );
  assert.equal(tagged.length, 20);
  assert.equal(o.clean, 9);
  assert.equal(
    o.repaired,
    11,
    'every mirrored janky landing repairs — shrink pulls the twins apart, shift separates them',
  );
  assert.deepEqual(o.byRung, { 1: 5, 2: 6 });
  assert.equal(o.cut, 0, 'ZERO mirrored poems cut — the mirror’s jank is the ladder’s home turf');
});

console.log(`fieldReviewLadder.selfcheck: ${n} checks passed`);
