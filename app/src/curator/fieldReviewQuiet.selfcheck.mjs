// node src/curator/fieldReviewQuiet.selfcheck.mjs
// #2006 SLICE 4 — the QUIET rung: the ladder's third resort borrows the
// plate's room. Instead of moving the poem again, the walk quiets the
// marks under it: the standing form gains `review.quietZone`, the render
// seam suppresses the marks whose ink enters the poem's zone to
// PLATE_ROOM_ALPHA, the measure counts a suppressed mark's cover at
// that same fraction, and the morph settles the ROOM (the poem does not
// move; the suppression deepens over REVIEW_MORPH_MS). This suite
// proves, in order:
//   1. the door — quietZone rides the review record as exactly `true`
//      or the form is refused whole; the poles never mix stands;
//   2. measure honesty — a suppressed mark contributes PLATE_ROOM_ALPHA
//      of its overlap (the fraction the seam draws — not exclusion),
//      draw order still rules, and without the flag the measure is
//      slice 1's bit-for-bit; the §3.2 gate constants do not move;
//   3. the ladder — rung 3 in its canonical slot, applicable only
//      against the markCover gate at its point in the walk, and never
//      offered after a re-deal (§3.6: a re-dealt form receives rungs
//      1–2 only) — proven on seed 227's drowned landing, the same form
//      the quiet rescues fresh and the exclusion cuts re-dealt;
//   4. the render seam — the plate's one suppression path, borrowed:
//      in-zone marks at PLATE_ROOM_ALPHA (unmirrored and mirrored),
//      the poem's own items never suppressed, positions never moved,
//      and at most one ×0.15 per mark however the zones overlap;
//   5. the morph — the room settles: raw 0 presents the stage as it
//      stood, mid-settle the in-zone marks sit strictly between the
//      un-quieted stage and the landed build, completion IS the raw
//      build, HELD freezes, and the settle state (room zones included)
//      rides the snapshot;
//   6. the voice — LOIS's acted line for a quiet resolution ("Quieted
//      the room."), the act fence, and proposals that may now name
//      the quiet among the rungs;
//   7. calibration + replay — censuses A/B re-run with rung 3 live
//      (full before/after in STAGING-REPORT-2006-S4), and seed 227's
//      banked adjustment re-derives bit-for-bit from its landing.
import assert from 'node:assert/strict';
import { useStore } from '../state/store.js';
import { resetDirector } from './director.js';
import { REVIEW_GATES, reviewVerdict, reviewLanding, measureLandedForm } from './fieldReview.mjs';
import { runReviewLadder, REVIEW_MORPH_MS } from './fieldReviewLadder.mjs';
import { rulesVoice, validateReviewProposal } from './fieldReviewVoice.mjs';
import { sanitizeFieldForm, reviewAdjustedForm, fieldDealReport } from '../poets/fieldForm.js';
import { stampWidthEm } from '../poets/placement.js';
import { buildPlacements, PLATE_ROOM_ALPHA, fieldRoomZonePx } from '../engine/buildPlacements.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { mkRng } from '../engine/prng.js';

const S = () => useStore.getState();

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// ---------------------------------------------------------------------------
// Harness — slice 1's census machinery, exact-pinned (the ladder suite's
// copies, plus a capture hook for seed 227's drowned commit).
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
let captured227 = null;
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
          records.push({ seed, rec, poemDeal: S().poemDeal, hasForm: !!S().layoutParams.fieldForm });
        last = rec;
        if (seed === 227 && rec?.stream === 'poem:0' && S().layoutParams.fieldForm) {
          captured227 = {
            state: { ...S() },
            params: S().layoutParams,
            form: S().layoutParams.fieldForm,
            rec,
            poemDeal: S().poemDeal,
          };
        }
      }
    }
    return records;
  });
const censusA = () =>
  collectTagged(
    Array.from({ length: 60 }, (_, i) => 201 + i),
    [
      () => S().curateUnlocked(),
      () => S().kineticLookPass(),
      () => S().kineticVoicePass(),
      () => S().kineticCuratorPass(),
      () => S().kineticVoicePass(),
    ],
  );
const censusB = () =>
  collectTagged(
    Array.from({ length: 20 }, (_, i) => 301 + i),
    [() => S().curateUnlocked()],
    {
      mirror: 'x',
    },
  );
const outcomes = (tagged) => {
  const o = { clean: 0, repaired: 0, cut: 0, byRung: {}, unactedJanky: 0 };
  for (const { rec } of tagged) {
    if (rec.verdict === 'clean') o.clean++;
    else if (rec.verdict === 'cut') o.cut++;
    else if (rec.adjustment?.outcome === 'repaired') {
      o.repaired++;
      o.byRung[rec.rung] = (o.byRung[rec.rung] || 0) + 1;
    } else if (rec.verdict !== 'exempt') o.unactedJanky++;
  }
  return o;
};

// The calibration run happens ONCE, up front: §3's ladder proofs and
// §6's voice pin consume seed 227's harvested commit, §7 pins the
// distributions of this same run.
const taggedA = censusA();
assert.ok(captured227, 'seed 227’s drowned commit was captured from the census run');
const harvest = (() => {
  const rawForm = { ...captured227.form };
  delete rawForm.review;
  const params = { ...captured227.params, fieldForm: rawForm };
  const landing = reviewLanding(captured227.state, params, { stream: captured227.rec.stream });
  return { rawForm, params, landing };
})();
assert.deepEqual(
  harvest.landing.measures,
  captured227.rec.measures,
  'the harvested raw form re-derives the banked landing measures bit-for-bit',
);

// ---------------------------------------------------------------------------
// 1. THE DOOR — quietZone is the review record's fourth key, exactly true.
// ---------------------------------------------------------------------------
const g1 = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(42), { aspect: 10 / 7 }).form;

ok('door: quietZone rides the review record as exactly boolean true', () => {
  const kept = sanitizeFieldForm({ ...g1, review: { scale: 0.8, dx: 0.1, dy: -0.05, quietZone: true } });
  assert.deepEqual(kept.review, { scale: 0.8, dx: 0.1, dy: -0.05, quietZone: true });
  // The record's slice-3 discipline stands: the transform keys are
  // mandatory, and quietZone does not rescue an incomplete record —
  // the ladder only ever writes the quiet onto a standing transform
  // (rungs 1–2 ran first), so a quiet-only record is not a shape the
  // loop can produce, and the door does not learn it.
  assert.equal(sanitizeFieldForm({ ...g1, review: { quietZone: true } }), null);
  assert.equal(sanitizeFieldForm({ ...g1, review: { scale: 0.8, quietZone: true } }), null);
  // The quiet itself moves nothing: an identity transform carrying it
  // leaves every glyph where the deal put it (reviewAdjustedForm does
  // not read the key — the room is the seam's business, not the pose's).
  const still = sanitizeFieldForm({ ...g1, review: { scale: 1, dx: 0, dy: 0, quietZone: true } });
  for (const [j, s] of reviewAdjustedForm(still).stamps.entries()) {
    assert.ok(Math.abs(s.x - still.stamps[j].x) < 1e-12 && Math.abs(s.y - still.stamps[j].y) < 1e-12, 'no glyph moves');
    assert.equal(s.em, still.stamps[j].em);
  }
  // A stray top-level key is not the rung: the rebuild drops it.
  const stray = sanitizeFieldForm({ ...g1, quietZone: true });
  assert.equal(stray.quietZone, undefined);
  assert.equal(stray.review, undefined);
});

ok('door: dishonest quietZone values refuse the form whole', () => {
  for (const bad of [false, 1, 'true', {}, [], null]) {
    assert.equal(
      sanitizeFieldForm({ ...g1, review: { scale: 0.8, quietZone: bad } }),
      null,
      `quietZone ${JSON.stringify(bad)} refuses`,
    );
  }
});

ok('door: the poles never mix — a quieted form is never a plate or a treated form', () => {
  const plate = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g2', plate: true }, mkRng(42), {
    aspect: 10 / 7,
  }).form;
  assert.equal(sanitizeFieldForm({ ...plate, review: { quietZone: true } }), null, 'plate + review refuses');
  assert.equal(
    sanitizeFieldForm({ ...g1, raygun: { mode: 'carson', seed: 7 }, review: { quietZone: true } }),
    null,
    'raygun + review refuses',
  );
  // Pre-slice-4 records are untouched by the new key: a slice-3 review
  // sanitizes to exactly itself, stamps and all.
  const before = { ...g1, review: { scale: 0.8, dx: 0.1, dy: -0.05 } };
  const kept = sanitizeFieldForm(before);
  assert.deepEqual(kept.review, before.review);
  assert.deepEqual(kept.stamps, before.stamps);
  assert.equal(kept.review.quietZone, undefined, 'no quietZone is invented for a pre-slice-4 record');
});

// ---------------------------------------------------------------------------
// 2. MEASURE HONESTY — the fraction the seam draws, recomputed by hand.
// ---------------------------------------------------------------------------
ok('measure: a suppressed mark contributes PLATE_ROOM_ALPHA of its overlap — not zero, not all', () => {
  const W = 1000;
  const H = 700;
  const form = sanitizeFieldForm(g1);
  const glyphItem = (s, j) => ({
    key: `field-${form.poetId}-${form.pieceId}-${j}`,
    x: (s.x / form.aspect) * W,
    y: s.y * H,
    scale: 1,
    scaleY: 1,
  });
  const glyphBox = (s) => {
    const hw = ((stampWidthEm(s.assetId, s.ch) * s.em) / 2 / form.aspect) * W;
    const hh = (s.em / 2) * H;
    const cx = (s.x / form.aspect) * W;
    const cy = s.y * H;
    return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
  };
  const s0 = form.stamps[0];
  const b0 = glyphBox(s0);
  const inkArea = form.stamps.reduce((a, s) => {
    const b = glyphBox(s);
    return a + (b.x1 - b.x0) * (b.y1 - b.y0);
  }, 0);
  // A mark centred on glyph 0, its box half the glyph's smaller
  // half-extent on each axis — fully contained, so its intersection is
  // its own area and no per-glyph cap can bind.
  const ms = Math.min(b0.x1 - b0.x0, b0.y1 - b0.y0) / 4 / 100;
  const markArea = 100 * ms * (100 * ms);
  const overMark = (key) => ({ key, x: (b0.x0 + b0.x1) / 2, y: (b0.y0 + b0.y1) / 2, scale: ms, scaleY: ms });
  const formItems = form.stamps.map((s, j) => glyphItem(s, j));
  // Draw order is law: the twin UNDER glyph 0 (earlier in the list)
  // covers nothing; the twin OVER it covers its area.
  const items = [{ ...overMark('under'), key: 'm-under' }, ...formItems, { ...overMark('over'), key: 'm-over' }];
  const plain = measureLandedForm(items, form, W, H);
  assert.ok(Math.abs(plain.m2 - markArea / inkArea) < 1e-12, `plain m2 is the over-mark's share (${plain.m2})`);
  // The identity transform carrying the quiet: same pose, same ink
  // boxes — the ONLY difference the flag makes is the cover accounting.
  const quietForm = sanitizeFieldForm({ ...g1, review: { scale: 1, dx: 0, dy: 0, quietZone: true } });
  const quiet = measureLandedForm(items, quietForm, W, H);
  assert.ok(quiet.m2 > 0, 'a suppressed mark still eats something — exclusion would claim nothing');
  assert.ok(
    Math.abs(quiet.m2 - PLATE_ROOM_ALPHA * plain.m2) < 1e-12,
    `quiet m2 is the fraction the seam draws: ${quiet.m2} vs ${PLATE_ROOM_ALPHA} × ${plain.m2}`,
  );
  assert.equal(quiet.m1, plain.m1, 'the quiet touches cover only');
  assert.equal(quiet.m3, plain.m3);
  assert.equal(quiet.m4, plain.m4);
  // And with no mark over the poem at all, the flag changes nothing.
  const still = measureLandedForm(formItems, quietForm, W, H);
  assert.equal(still.m2, 0);
  assert.deepEqual(measureLandedForm(formItems, form, W, H), still);
});

ok('measure: the §3.2 gate constants do not move for the quiet rung', () => {
  assert.deepEqual(REVIEW_GATES, {
    selfOverlap: 0.05,
    markCover: 0.5,
    coverageMax: 0.35,
    coverageMin: 0.0015,
    crop: 0,
  });
  assert.equal(reviewVerdict({ m1: 0, m2: 0.5, m3: 0.03, m4: 0 }).verdict, 'clean', 'the gate is the gate');
});

// ---------------------------------------------------------------------------
// 3. THE LADDER — rung 3 in its slot, markCover only, never post-re-deal.
// ---------------------------------------------------------------------------
ok('ladder: rung 3 stands in the canonical slot of the plan, and rescues the drowned landing fresh', () => {
  const { state } = captured227;
  const acted = runReviewLadder(state, harvest.params, harvest.landing, { redeal: () => null });
  assert.deepEqual(acted.record.adjustment.plan, [1, 2, 3, 4, 5], 'markCover leads shrink; the quiet stands third');
  assert.deepEqual(
    acted.record.adjustment.steps.map((s) => s.rung),
    [1, 2, 3],
    'shrink and shift re-measured short of the gate, then the quiet',
  );
  assert.equal(acted.record.adjustment.steps[2].review.quietZone, true);
  assert.equal(acted.record.adjustment.outcome, 'repaired');
  assert.equal(acted.record.rung, 3);
  assert.equal(acted.record.adjustment.final.quietZone, true);
  // The trial was measured, never projected: the step's measures are
  // reviewLanding's own on the trial form, bit-for-bit.
  const trial = reviewLanding(
    state,
    { ...harvest.params, fieldForm: { ...harvest.rawForm, review: acted.record.adjustment.steps[2].review } },
    { stream: 'poem:0' },
  );
  assert.deepEqual(acted.record.adjustment.steps[2].measures, trial.measures);
  assert.ok(trial.measures.m2 <= REVIEW_GATES.markCover, 'the quiet clears M2 — its spec exit condition');
});

ok('ladder: QUIET addresses markCover only — a walk whose failing gate never becomes markCover never offers it', () => {
  const { state } = captured227;
  // A coverageLow lead on the same landing form: rung 3 IS in the plan
  // (the plan is the whole ladder in canonical order) but applicability
  // is judged at the walk — with the re-deal failing, the gate never
  // becomes markCover, so the quiet is never tried.
  const fab = { ...harvest.landing, gate: 'coverageLow' };
  const acted = runReviewLadder(state, harvest.params, fab, { redeal: () => null });
  assert.deepEqual(acted.record.adjustment.plan, [4, 1, 2, 3, 5]);
  assert.deepEqual(
    acted.record.adjustment.steps.map((s) => s.rung),
    [4, 5],
    'no rung-3 step: the gate at its slot was coverageLow, not markCover',
  );
  assert.equal(acted.record.adjustment.outcome, 'cut');
});

ok('ladder: post-re-deal exclusion — a re-dealt form receives rungs 1–2 only, and the exclusion is what cuts', () => {
  const { state } = captured227;
  // The SAME drowned form the quiet rescues fresh (§3 above), received
  // as a re-deal under a coverageLow lead: shrink and shift fail it
  // again, and its walk ends at the cut — rung 3, which would have
  // cleared it (m2 0.31 against the 0.5 gate), is never offered.
  const fab = { ...harvest.landing, gate: 'coverageLow' };
  const acted = runReviewLadder(state, harvest.params, fab, {
    redeal: () => ({ form: harvest.rawForm, stream: 'poem:99' }),
  });
  assert.deepEqual(acted.record.adjustment.plan, [4, 1, 2, 3, 5]);
  assert.deepEqual(
    acted.record.adjustment.steps.map((s) => s.rung),
    [4, 1, 2, 5],
    're-deal, shrink, shift, cut — no quiet after a re-deal (§3.6)',
  );
  assert.ok(!acted.record.adjustment.steps.some((s) => s.review?.quietZone), 'no step carries the quiet');
  assert.equal(acted.record.adjustment.outcome, 'cut');
  assert.equal(acted.record.adjustment.redeal.stream, 'poem:99');
});

// ---------------------------------------------------------------------------
// 4. THE RENDER SEAM — the plate's suppression path, borrowed whole.
// ---------------------------------------------------------------------------
const seamAssets = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
  { id: 'c', weight: 'light' },
];
const seamPalette = { swatches: ['#111', '#222', '#333', '#444'] };
const seamParams = {
  mode: 'grid',
  composition: 'default',
  count: 40,
  scale: [0.4, 0.8],
  rotate: [0, 45],
  alpha: [60, 100],
  jitter: 10,
  density: 100,
  zTiers: 1,
  bleed: false,
  mirror: false,
  overlap: true,
  displacement: 0,
  noiseFreq: 0.005,
  noiseSpeed: 0.5,
};
const seamCaps = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };
const SW = 1000;
const SH = 700;
const seamBuild = (layoutParams) =>
  buildPlacements({
    layoutParams,
    seed: 0x1a4f,
    activeAssets: seamAssets,
    palette: seamPalette,
    caps: seamCaps,
    canvasW: SW,
    canvasH: SH,
  });
const byKey = (items) => new Map(items.map((it) => [it.key, it]));
const isFormItem = (it) => typeof it.key === 'string' && it.key.startsWith('field-');
const g2 = fieldDealReport({ poetId: 'greenleaf', pieceId: 'g2' }, mkRng(42), { aspect: 10 / 7 }).form;
const seamReview = { scale: 0.8, dx: 0.1, dy: -0.05 };
const seamControl = { ...g2, review: seamReview };
const seamQuiet = { ...g2, review: { ...seamReview, quietZone: true } };
let seamQuietPass1 = null;

ok('seam: marks whose ink enters the poem’s zone are suppressed to PLATE_ROOM_ALPHA; nothing else moves', () => {
  for (const mirror of [false, 'x']) {
    const ctrl = byKey(seamBuild({ ...seamParams, mirror, fieldForm: seamControl }).items);
    const params = { ...seamParams, mirror, fieldForm: seamQuiet };
    const paramsJson = JSON.stringify(params);
    const quiet = byKey(seamBuild(params).items);
    assert.equal(JSON.stringify(params), paramsJson, 'suppression is render-only — the build edits no input state');
    let suppressed = 0;
    let untouched = 0;
    for (const [k, q] of quiet) {
      const c = ctrl.get(k);
      assert.ok(c, `item ${k} has its control twin`);
      assert.equal(q.x, c.x, 'a mark’s position never moves for the room');
      assert.equal(q.y, c.y);
      if (isFormItem(q)) {
        assert.equal(q.alpha, c.alpha, 'the poem’s own items are never suppressed by its room');
      } else if (c.alpha > 0 && Math.abs(q.alpha / c.alpha - PLATE_ROOM_ALPHA) < 1e-9) {
        suppressed++;
      } else {
        assert.equal(q.alpha, c.alpha, 'a mark outside the zone keeps its alpha');
        untouched++;
      }
    }
    assert.ok(suppressed > 0, `mirror=${mirror}: the zone holds marks to quiet (${suppressed})`);
    assert.ok(untouched > 0, `mirror=${mirror}: marks outside the zone stand (${untouched})`);
    if (mirror === 'x') {
      // The mirrored run quiets strictly more marks than the plain run
      // (asserted against the first pass's count, kept below): the
      // reflected copy of the poem gets its room too (#2018's law).
      assert.ok(suppressed > (seamQuietPass1 ?? 0), 'the reflected poem’s room quiets its own marks');
    } else {
      seamQuietPass1 = suppressed;
    }
  }
});

ok('seam: at most one ×0.15 per mark, however the poem’s zones overlap (mirror xy, centre-straddling form)', () => {
  const stamps = g2.stamps.slice(0, 6).map((s, i) => ({ ...s, x: (0.42 + 0.04 * i) * g2.aspect, y: 0.35 + 0.06 * i }));
  const centred = sanitizeFieldForm({ ...g2, stamps, review: { ...seamReview, quietZone: true } });
  const centredControl = sanitizeFieldForm({ ...g2, stamps, review: seamReview });
  const zone = fieldRoomZonePx(reviewAdjustedForm(centred).stamps, centred.aspect, SW, SH);
  assert.ok(zone[0] < SW / 2 && zone[2] > SW / 2, 'the zone straddles the centre — its reflections overlap it');
  const ctrl = byKey(seamBuild({ ...seamParams, mirror: 'xy', fieldForm: centredControl }).items);
  const quiet = byKey(seamBuild({ ...seamParams, mirror: 'xy', fieldForm: centred }).items);
  let once = 0;
  for (const [k, q] of quiet) {
    const c = ctrl.get(k);
    if (!c || isFormItem(q) || c.alpha === 0) continue;
    const ratio = q.alpha / c.alpha;
    assert.ok(
      ratio === 1 || Math.abs(ratio - PLATE_ROOM_ALPHA) < 1e-9,
      `mark ${k} takes at most one room (ratio ${ratio})`,
    );
    if (ratio !== 1) once++;
  }
  assert.ok(once > 0, 'the overlapping rooms still quiet their marks');
});

// ---------------------------------------------------------------------------
// 5. THE MORPH — the room settles; the poem's glide is slice 3's.
// ---------------------------------------------------------------------------
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
const layerItems = (out) => out.find((e) => e.id === 'lyr-a')?.items || [];

ok('morph: the room deepens over the settle — raw 0 is the stage as it stood, completion is the raw build', () => {
  const review = { scale: 0.8, dx: 0.1, dy: -0.05, quietZone: true };
  const quietForm = { ...g1, review };
  const stamp = { key: '4242|poem:0', seed: 99, dur: REVIEW_MORPH_MS, review };
  const settler = createLiveResolver();
  const twinPlain = createLiveResolver();
  const twinRaw = createLiveResolver();
  const stepAll = (t, stamped) => ({
    s: byKey(
      layerItems(
        settler.resolveLayers(
          resolverInput(stamped ? quietForm : g1, { loopTimeMs: t, ...(stamped ? { reviewMorph: stamp } : {}) }),
        ),
      ),
    ),
    p: byKey(layerItems(twinPlain.resolveLayers(resolverInput(g1, { loopTimeMs: t })))),
    q: byKey(layerItems(twinRaw.resolveLayers(resolverInput(quietForm, { loopTimeMs: t })))),
  });
  const mean = (m, keys) => keys.reduce((a, k) => a + m.get(k).alpha, 0) / keys.length;

  const t0 = stepAll(0, false);
  const inZone = [...t0.q.keys()].filter(
    (k) => !isFormItem(t0.q.get(k)) && t0.q.get(k).alpha < t0.p.get(k).alpha * 0.5,
  );
  assert.ok(inZone.length > 0, 'the fixture room holds marks the raw build quiets');

  // Raw 0: the presented list is the stage as it stood — the marks at
  // their natural alpha (the room has not settled at all), the glyphs
  // at the janky pose.
  const f0 = stepAll(100, true);
  for (const [k, it] of f0.s) {
    const b = t0.s.get(k);
    if (isFormItem(it)) {
      assert.ok(Math.abs(it.x - b.x) < 1e-6 && Math.abs(it.y - b.y) < 1e-6, `glyph ${k} starts at the janky pose`);
    } else {
      assert.equal(it.alpha, b.alpha, `mark ${k} is not yet quieted at raw 0`);
      assert.equal(it.x, b.x);
      assert.equal(it.y, b.y);
    }
  }
  assert.ok(
    [...f0.s.values()].filter(isFormItem).some((it) => Math.abs(it.x - t0.q.get(it.key).x) > 1),
    'the janky pose is a real pose — the glyphs have somewhere to settle from',
  );
  // HELD: the same sim time again — the room freezes with everything else.
  const held = stepAll(100, true);
  for (const [k, it] of held.s) {
    const a = f0.s.get(k);
    assert.equal(it.alpha, a.alpha, `mark/glyph ${k} frozen under HELD`);
    assert.equal(it.x, a.x);
  }
  // Mid-settle: the in-zone marks sit strictly between the un-quieted
  // stage and the landed build (the mean is the honest statistic —
  // morph pairings shuffle individual marks, the room only deepens).
  const mid = stepAll(100 + REVIEW_MORPH_MS / 2, true);
  const [ms, mp, mq] = [mean(mid.s, inZone), mean(mid.p, inZone), mean(mid.q, inZone)];
  assert.ok(ms < mp, `the room is deepening (${ms} < the un-quieted ${mp})`);
  assert.ok(ms > mq, `the room has not landed yet (${ms} > the raw build's ${mq})`);
  for (const k of inZone)
    assert.ok(mid.s.get(k).alpha < mid.p.get(k).alpha, `in-zone mark ${k} is quieter than the un-quieted stage`);
  // The settle state — room zones included — rides the snapshot, and a
  // restored settle continues identically.
  const snap = JSON.parse(JSON.stringify(settler.snapshotState()));
  const st = snap.reviewMorph?.state?.['lyr-a'];
  assert.ok(
    st && Array.isArray(st.roomZones) && st.roomZones.length >= 1,
    'the room zones ride the #1367 snapshot as plain data',
  );
  assert.ok(st.roomZones.every((z) => Array.isArray(z) && z.length === 4 && z.every(Number.isFinite)));
  const restored = createLiveResolver();
  assert.equal(restored.restoreState(snap), true);
  const pose = (items) => items.map((it) => [it.key, it.x, it.y, it.scale, it.scaleY, it.alpha]);
  const a700 = settler.resolveLayers(resolverInput(quietForm, { loopTimeMs: 700, reviewMorph: stamp }));
  const b700 = restored.resolveLayers(resolverInput(quietForm, { loopTimeMs: 700, reviewMorph: stamp }));
  assert.deepEqual(pose(layerItems(b700)), pose(layerItems(a700)), 'the restored resolver settles the same room');
  // Completion: the presented list IS the raw build of that frame.
  const done = stepAll(100 + REVIEW_MORPH_MS + 50, true);
  for (const [k, it] of done.s) {
    const w = done.q.get(k);
    assert.ok(w && it.x === w.x && it.y === w.y && it.alpha === w.alpha, `item ${k} landed on the raw build`);
  }
  settler.dispose();
  twinPlain.dispose();
  twinRaw.dispose();
  restored.dispose();
});

// ---------------------------------------------------------------------------
// 6. THE VOICE — LOIS names the quiet, past tense, on acted records only.
// ---------------------------------------------------------------------------
ok('voice: an acted quiet resolution speaks its act — and only its act', () => {
  const rec = captured227.rec; // verdict 'janky', rung 3, the landing's own figures
  const rv = rulesVoice(rec);
  assert.equal(rv.persona, 'lois');
  assert.equal(
    rv.line,
    'The marks are eating the poem. 94% of its ink is covered — 50% is the limit. Quieted the room.',
    'the §3.5 idiom: the gate, the figure against its limit, the act in past tense',
  );
  assert.deepEqual(rv.rungOrder, [1, 2, 3, 4, 5], 'the spoken order is the plan that ran, rung 3 in its slot');
  // The validator on the acted record: the rules line stands; a
  // proposal mood or another rung's act drops whole.
  assert.deepEqual(validateReviewProposal({ line: rv.line }, rec), { line: rv.line, rungOrder: null });
  assert.equal(
    validateReviewProposal({ line: rv.line.replace('Quieted the room.', 'Would quiet the room.') }, rec),
    null,
    'no ‘would’ on a completed act',
  );
  assert.equal(
    validateReviewProposal({ line: rv.line.replace('Quieted the room.', 'Shrunk it.') }, rec),
    null,
    'another rung’s act is not this record’s',
  );
});

ok('voice: an unacted proposal may name the quiet among the rungs; a clean proposal may not name it at all', () => {
  const landing = harvest.landing; // janky markCover, rung null — nothing acted yet
  const line = 'Buried at 94% — over the 50% line. Would quiet the room.';
  assert.deepEqual(validateReviewProposal({ line, rungOrder: [3, 1] }, landing), {
    line,
    rungOrder: [3, 1],
  });
  // The clean fence gains the verb too: DAVIS's lines propose no
  // repair, so a clean proposal naming the quiet drops whole, exactly
  // as one naming the shrink or the shift does (slice 2's fence — the
  // rungs' imperative names; past-tense prose beyond the fences is the
  // validator's documented residue, for every rung alike).
  const clean = {
    verdict: 'clean',
    gate: null,
    exempt: null,
    measures: { m1: 0, m2: 0.2, m3: 0.03, m4: 0 },
    gates: REVIEW_GATES,
    backend: 'rules',
    rung: null,
    seed: 11,
    stream: 'poem:0',
  };
  assert.equal(validateReviewProposal({ line: 'All clear tonight. Would quiet the room.' }, clean), null);
});

// ---------------------------------------------------------------------------
// 7. CALIBRATION + REPLAY — the censuses with rung 3 live; the re-derivation.
// ---------------------------------------------------------------------------
ok('census A (slice 4): the quiet rescues every drowned room; no landing’s outcome worsens', () => {
  const o = outcomes(taggedA);
  console.log(
    `  census A ladder outcomes: ${taggedA.length} landings — ${o.clean} clean (unacted), ${o.repaired} repaired ` +
      `(by rung ${JSON.stringify(o.byRung)}), ${o.cut} cut, ${o.unactedJanky} janky unacted`,
  );
  assert.equal(taggedA.length, 144);
  assert.equal(o.clean, 133, 'slice 3’s 133 cleans are untouched');
  assert.equal(o.unactedJanky, 0);
  assert.equal(o.repaired, 11);
  assert.deepEqual(o.byRung, { 2: 2, 3: 9 });
  assert.equal(o.cut, 0, 'slice 3 cut 8; the quiet leaves none');
  // The eight formerly-cut landings, named: seeds 227 and 252, four
  // streams each — every one now repaired at rung 3, poem standing.
  const drowned = taggedA.filter((e) => (e.seed === 227 || e.seed === 252) && e.rec.adjustment);
  assert.equal(drowned.length, 8);
  for (const e of drowned) {
    assert.equal(e.rec.rung, 3, `seed ${e.seed} ${e.rec.stream} resolves at the quiet`);
    assert.equal(e.rec.adjustment.outcome, 'repaired');
    assert.equal(e.rec.adjustment.final.quietZone, true);
    assert.equal(e.hasForm, true, 'the poem stands');
  }
  // Seed 239's three repairs: two at rung 2 as slice 3 had them, and
  // poem:3 — slice 3's rung-4 repair — one rung earlier, at the quiet.
  const s239 = taggedA.filter((e) => e.seed === 239 && e.rec.adjustment);
  assert.deepEqual(
    s239.map((e) => [e.rec.stream, e.rec.rung]),
    [
      ['poem:1', 2],
      ['poem:2', 2],
      ['poem:3', 3],
    ],
  );
});

ok('census B (slice 4): the mirrored distribution is slice 3’s, unchanged — the walks stop before rung 3', () => {
  const taggedB = censusB();
  const o = outcomes(taggedB);
  console.log(
    `  census B ladder outcomes (mirrored): ${taggedB.length} landings — ${o.clean} clean, ${o.repaired} repaired ` +
      `(by rung ${JSON.stringify(o.byRung)}), ${o.cut} cut`,
  );
  assert.equal(o.clean, 9);
  assert.equal(o.repaired, 11);
  assert.deepEqual(o.byRung, { 1: 5, 2: 6 });
  assert.equal(o.cut, 0);
  for (const { rec } of taggedB) {
    if (rec.adjustment) {
      assert.ok(
        !rec.adjustment.steps.some((s) => s.rung === 3),
        'no mirrored walk reaches the quiet — shrink and shift settle them first',
      );
    }
  }
});

ok('replay: seed 227’s banked adjustment re-derives bit-for-bit from its landing (§3.8)', () => {
  const acted = runReviewLadder(captured227.state, harvest.params, harvest.landing, { redeal: () => null });
  assert.deepEqual(
    acted.record,
    captured227.rec,
    'the ladder is a pure function of the commit — same landing, same walk, same record',
  );
  const again = runReviewLadder(captured227.state, harvest.params, harvest.landing, { redeal: () => null });
  assert.deepEqual(again, acted, 'and again — no clock, no dice in the acting path');
});

console.log(`fieldReviewQuiet.selfcheck: ${n} checks passed`);
