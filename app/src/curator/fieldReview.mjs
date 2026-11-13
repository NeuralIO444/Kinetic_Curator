// #2006 SLICE 1 (the review loop, shadow) — the landed poem, measured.
//
// THE FINDING THIS MODULE EXISTS FOR: jank is a property of the LANDED
// FRAME, not the stored form. `sanitizeFieldForm` re-judges every stored
// form with the stillborn gate, so a stored form can never overlap by the
// gate's own lights — the overprint Matt saw on the live stage ("THE STREET
// FINDS ITS OWN" printed over itself) is manufactured at the render seam,
// where buildPlacements joins the form's items to the layer's item list
// BEFORE mirror, strata ranges and hero scale act. So the loop measures
// the BUILT ITEM LIST — the exact geometry buildPlacements hands the
// renderer — and never the form. The ink rulers are placement's own
// (stampWidthEm, the plate zone's formulas), so the review reads the seam
// in the seam's units.
//
// SLICE 1 IS A SHADOW: this module measures and judges, and layoutSlice
// banks the verdict record on the deal commit beside fieldGateRefusal.
// NOTHING ACTS (no adjustment, no re-deal, no CUT — the ladder is slice 3)
// and NOTHING SPEAKS (no ticker line, no UI — the voice is slice 2). The
// verdict comes from the deterministic rules table below alone
// (backend: 'rules'); the record's census across real deals is what
// calibrates the TUNABLE gates for the slices that follow.
//
// THE BUILD THAT IS MEASURED (the deal-time translation): the review
// rebuilds the landing's ACTIVE layer with buildPlacements, from the
// commit's own inputs — the landed params, the commit's seed and asset
// pool where the commit itself changes them (KINETIC rolls a fresh seed
// and pool in the same commit it deals), the store's caps/custom assets
// and the pool assembly mirrored line-for-line from liveResolve — but
// WITHOUT per-frame ephemera: no life drift, no breath overrides, no
// kineme/travel/surge/parallax, growthTick 0, no dish-ground nudge, no
// governor shed (assetThin / perfTier mirror-off / clamp overrides). A
// verdict that depended on time-varying inputs could not be re-derived
// from its banked record; the jank that matters (mirror doubling, layer
// ranges, hero scale, mark traffic) is all in the committed build.
// Live swarm modes (swarm/hype/murmuration) never reach buildPlacements
// in the renderer — the resolver routes them to swarmItems — so a landing
// there has no built item list in the renderer's own terms and a JUDGED
// landing banks no record (fieldReview stays null), rather than a verdict
// about a build that never happens. An EXEMPT landing still banks its
// exempt record there: exemption is read off the form and never needed
// a build.
//
// WHAT THE REVIEW CANNOT SEE, named plainly: it builds only the poem's
// OWN layer — the one item list of the layer the form landed in. The
// renderer composites layers bottom→top (sceneContract's
// compositeOrder), so marks in layers ABOVE the poem's paint over it in
// the frame the performer sees, invisibly to M2. M2 is WITHIN-LAYER
// cover; frame-wide burial by above-layer marks is a named
// understatement the census carries into slice-3 calibration — not a
// quantity slice 1 measures, and not one the banked measures pretend
// to. (Growing the measure to multi-layer builds is slice 3's call,
// deliberately not taken here.)
//
// GEOMETRY, stated plainly: every box is axis-aligned, ignoring rotation —
// the same simplification gateFieldForm makes at deal time. A form
// glyph's ink box is its true ink (half-width from stampWidthEm, the
// plate zone's formula; half-height from its em). A mark's box is its
// asset box as drawn: the quad shader spans ±50 × scale around the item
// centre (QUAD_VS: c = (au − 50) · scale over the 100-unit asset box), so
// a mark box can overstate that mark's true ink where the asset's cell
// carries transparent margin — uniformly, across every build, which is
// what a census-calibrated gate absorbs. Overlap shares use the
// capped-sum reading: each glyph's covered area is the sum of its
// pairwise intersections, capped at the glyph's own area, so every share
// lands in [0, 1] without a union pass.
import { buildPlacements, PLATE_ROOM_ALPHA, PLATE_ZONE_PAD_EM } from '../engine/buildPlacements.js';
import { createGrid } from '../engine/ca-engine.js';
import { sanitizeFieldForm } from '../poets/fieldForm.js';
import { stampWidthEm, POEM_ONLY_STAMP_IDS } from '../poets/placement.js';
import { SOLO_TEXT_STAMP_IDS } from '../data/assets/assets-stamp-radial.js'; // #2150: the bare <text> letter/number stamps
import { PIXEL_LETTER_ANATOMY_IDS } from '../data/assets/assets-pixel-glyphs.js'; // #2150 (Q4): the letter-anatomy emblems
import { isPoemKept } from '../poets/poemRow.mjs';
import { mergePool } from '../assets/overlay.js';
import { ASSETS } from '../data/assets/index.js';
import { CREATURE_ASSET_ID } from './creatureCitizen.js';
import { resolvePalette } from '../data/palettes.js';
import { getQualityCaps } from '../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS, isLiveSwarmMode } from '../data/layout-modes.js';
import { liveShapeLevels, shapeMixWeights } from '../data/voices.js';

// ---------------------------------------------------------------------------
// The rules table's gates. Every threshold is TUNABLE: these are the
// spec's stated values where §3.2/§3.5 gives one, stated initial values
// where it gives none, and slice 1's census (fieldReview.selfcheck)
// reports the observed margins against each so slices 2/3 set the shipped
// gates from evidence, not from these guesses.
// ---------------------------------------------------------------------------
/** TUNABLE — M1 ceiling: at most 5% of the poem's ink may overprint itself. */
export const REVIEW_MAX_SELF_OVERLAP = 0.05;
/** TUNABLE — M2 ceiling, anchored on the spec §3.5 example line ("Half the poem is under the marks"). */
export const REVIEW_MAX_MARK_COVER = 0.5;
/** TUNABLE — M3 ceiling: the poem's ink may cover at most 35% of the dish. */
export const REVIEW_MAX_COVERAGE = 0.35;
/** TUNABLE — M3 floor: below 0.15% of the dish the poem has effectively vanished. */
export const REVIEW_MIN_COVERAGE = 0.0015;
/** TUNABLE — M4 ceiling: no form glyph's ink may cross the dish edge. */
export const REVIEW_MAX_CROP = 0;
/** A glyph counts as cropped only when its ink crosses the edge by more than this (float dust is not a crop). */
export const REVIEW_CROP_TOLERANCE_PX = 1;

/** The gate set a verdict was judged under, frozen into every banked record (provenance). */
export const REVIEW_GATES = Object.freeze({
  selfOverlap: REVIEW_MAX_SELF_OVERLAP,
  markCover: REVIEW_MAX_MARK_COVER,
  coverageMax: REVIEW_MAX_COVERAGE,
  coverageMin: REVIEW_MIN_COVERAGE,
  crop: REVIEW_MAX_CROP,
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The poem-only stamp set the resolver excludes from the placeable pool (placement's union).
 * #2150 — the review pool also excludes the non-FIELD glyphs (the solo text
 * stamps and the pixel letter-anatomy emblems, Q4), so a revision candidate
 * can never seat a solo glyph the deal surfaces would refuse. The caps/digits
 * arrive via the union itself (placement grew by LETTER_STAMP_IDS). */
const POEM_ONLY_IDS = new Set([...POEM_ONLY_STAMP_IDS, ...SOLO_TEXT_STAMP_IDS, ...PIXEL_LETTER_ANATOMY_IDS]);

/** One axis-aligned box from a centre and half-extents (canvas px). */
const boxOf = (cx, cy, hw, hh) => ({ x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh });

const boxArea = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);

function intersectionArea(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  if (w <= 0) return 0;
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return h <= 0 ? 0 : w * h;
}

/**
 * The stamp index a built form item belongs to. Form item keys are
 * `field-${poetId}-${pieceId}-${j}` with mirror copies suffixed
 * -mx / -my / -mxmy (buildPlacements' FIELD block). Returns -1 for any
 * item that is not this form's — including another layer citizen that
 * merely shares the prefix shape.
 */
function formStampIndex(item, form) {
  const key = item?.key;
  if (typeof key !== 'string') return -1;
  const prefix = `field-${form.poetId}-${form.pieceId}-`;
  if (!key.startsWith(prefix)) return -1;
  let rest = key.slice(prefix.length);
  if (rest.endsWith('-mxmy')) rest = rest.slice(0, -5);
  else if (rest.endsWith('-mx') || rest.endsWith('-my')) rest = rest.slice(0, -3);
  const j = Number(rest);
  return Number.isInteger(j) && j >= 0 && j < form.stamps.length ? j : -1;
}

/**
 * The measures, as pure functions of one built item list. `form` is the
 * landed (already sanitized) form whose items the list carries; canvasW/H
 * are the dish the list was built for. Returns null when the list carries
 * none of the form's items or the form has no ink to judge — there is
 * nothing landed to measure.
 *
 *   m1 self-overlap — share of the poem's ink area overprinted by other
 *      poem ink, AFTER every stage transform (mirror copies included:
 *      the spec names them, and a mirrored form doubling back on itself
 *      is precisely a landed-frame fact the form alone cannot see).
 *   m2 mark cover — share of the poem's ink area covered by mark boxes
 *      that draw OVER it. "Covered" is a draw-order fact: the built list
 *      is the draw order (the renderer packs it in order), so only a mark
 *      LATER in the list than the glyph can eat it. The naive reading —
 *      every mark in the list, over or under — saturates: across this
 *      slice's seeded census its median was 0.93 and its max 1.0, because
 *      a busy stage's mark boxes tile the dish while the poem (appended
 *      last in overlap rooms, scale-sorted among the marks elsewhere)
 *      still draws sovereign. No gate separates honest deals from jank
 *      under that reading; under the draw-order reading the same census
 *      spreads (median 0, p90 ≈ 0.25, tail to 1.0), which is what makes
 *      REVIEW_MAX_MARK_COVER calibratable at all.
 *      SLICE 4 (the quiet rung): cover is a VISUAL fact, and the render
 *      seam's zone suppression is a visual act — a mark the plate's room
 *      (or the poem's own borrowed room, `review.quietZone`) renders at
 *      PLATE_ROOM_ALPHA eats only that fraction of the ink it overlaps.
 *      So when the measured form carries quietZone, a mark whose
 *      footprint enters one of the form's zones (its ink bbox + the
 *      plate's pad, per mirror cluster — the build tail's own test, on
 *      the same boxes) contributes PLATE_ROOM_ALPHA × its intersection
 *      instead of the whole intersection. Excluding suppressed marks
 *      entirely would claim a 15%-alpha mark eats nothing at all; the
 *      fraction is what the seam actually draws. Without quietZone the
 *      measure is slice 1's, bit-for-bit: a plate's own room never
 *      reaches this function (plates are exempt, never measured).
 *   m3 coverage — the poem's total ink area as a share of the dish.
 *   m4 crop — share of the form's items whose ink box crosses the dish
 *      boundary (beyond REVIEW_CROP_TOLERANCE_PX).
 */
export function measureLandedForm(items, form, canvasW, canvasH) {
  if (!Array.isArray(items) || !form || !(canvasW > 0) || !(canvasH > 0)) return null;
  const formBoxes = [];
  const markBoxes = [];
  items.forEach((item, index) => {
    const j = formStampIndex(item, form);
    if (j >= 0) {
      const s = form.stamps[j];
      // The plate zone's own ink rulers (#2005): true ink width from the
      // stamp's advance, ink height = the glyph's em, centred on the item.
      // #2006 slice 3: a form carrying the review transform draws its
      // stamps scaled by review.scale (buildPlacements applies
      // reviewAdjustedForm); the item's centre already carries the
      // transform's shift, so only the ink extents take the same factor
      // here — otherwise the ladder's re-measure would judge a phantom
      // full-size poem standing where the shrunk one stands.
      const em = s.em * (form.review ? form.review.scale : 1);
      const hw = ((stampWidthEm(s.assetId, s.ch) * em) / 2 / form.aspect) * canvasW;
      const hh = (em / 2) * canvasH;
      // Slice 4: the mirror cluster this item belongs to ('' / 'mx' /
      // 'my' / 'mxmy', from its key suffix) — the quiet zones are read
      // per cluster below, the build tail's reflected zones in measure
      // form.
      const key = typeof item.key === 'string' ? item.key : '';
      const cluster = key.endsWith('-mxmy') ? 'mxmy' : key.endsWith('-mx') ? 'mx' : key.endsWith('-my') ? 'my' : '';
      formBoxes.push({ box: boxOf(item.x, item.y, hw, hh), index, em, cluster });
    } else if (Number.isFinite(item?.x) && Number.isFinite(item?.y)) {
      // A mark's asset box as drawn: ±50 asset units × its scale (QUAD_VS).
      const hw = 50 * Math.abs(item.scale ?? 1);
      const hh = 50 * Math.abs(item.scaleY ?? item.scale ?? 1);
      if (hw > 0 && hh > 0) markBoxes.push({ box: boxOf(item.x, item.y, hw, hh), index });
    }
  });
  if (formBoxes.length === 0) return null;
  const areas = formBoxes.map((f) => boxArea(f.box));
  const inkArea = areas.reduce((a, b) => a + b, 0);
  if (!(inkArea > 0)) return null;

  let overprinted = 0;
  for (let i = 0; i < formBoxes.length; i++) {
    let sum = 0;
    for (let j = 0; j < formBoxes.length; j++) {
      if (j !== i) sum += intersectionArea(formBoxes[i].box, formBoxes[j].box);
    }
    overprinted += Math.min(areas[i], sum);
  }
  // Slice 4 — the quiet zones, when the form carries the rung: one zone
  // per mirror cluster (the cluster's ink bbox breathed out by the
  // plate's pad at the form's largest drawn em — buildPlacements' own
  // formula), against which a mark's suppression is tested with the
  // build tail's footprint test on the measure's own mark boxes.
  let quietZones = null;
  if (form.review?.quietZone === true) {
    const emMax = Math.max(...formBoxes.map((f) => f.em));
    const padX = ((PLATE_ZONE_PAD_EM * emMax) / form.aspect) * canvasW;
    const padY = PLATE_ZONE_PAD_EM * emMax * canvasH;
    const byCluster = new Map();
    for (const f of formBoxes) {
      const z = byCluster.get(f.cluster);
      if (!z) {
        byCluster.set(f.cluster, { ...f.box });
      } else {
        z.x0 = Math.min(z.x0, f.box.x0);
        z.y0 = Math.min(z.y0, f.box.y0);
        z.x1 = Math.max(z.x1, f.box.x1);
        z.y1 = Math.max(z.y1, f.box.y1);
      }
    }
    quietZones = [...byCluster.values()].map((z) => ({
      x0: z.x0 - padX,
      y0: z.y0 - padY,
      x1: z.x1 + padX,
      y1: z.y1 + padY,
    }));
  }
  const suppressed = (box) =>
    quietZones !== null && quietZones.some((z) => box.x1 >= z.x0 && box.x0 <= z.x1 && box.y1 >= z.y0 && box.y0 <= z.y1);
  let covered = 0;
  for (let i = 0; i < formBoxes.length; i++) {
    let sum = 0;
    // Only marks drawn OVER the glyph (later in the built list) cover it.
    for (const mb of markBoxes) {
      if (mb.index > formBoxes[i].index) {
        const hit = intersectionArea(formBoxes[i].box, mb.box);
        sum += suppressed(mb.box) ? hit * PLATE_ROOM_ALPHA : hit;
      }
    }
    covered += Math.min(areas[i], sum);
  }
  let cropped = 0;
  const tol = REVIEW_CROP_TOLERANCE_PX;
  for (const f of formBoxes) {
    const b = f.box;
    if (b.x0 < -tol || b.y0 < -tol || b.x1 > canvasW + tol || b.y1 > canvasH + tol) cropped++;
  }
  return {
    m1: clamp01(overprinted / inkArea),
    m2: clamp01(covered / inkArea),
    m3: clamp01(inkArea / (canvasW * canvasH)),
    m4: cropped / formBoxes.length,
    inkArea,
    formItems: formBoxes.length,
    markItems: markBoxes.length,
  };
}

/**
 * The verdict table — the stillborn gate's post-deal sibling. First
 * failing gate in measure order names the verdict's gate; a form that
 * fails nothing is clean. Slice 1 never emits a repair or a CUT: the
 * record's `rung` stays null until the ladder (slice 3) exists.
 */
export function reviewVerdict(measures, gates = REVIEW_GATES) {
  if (measures.m1 > gates.selfOverlap) return { verdict: 'janky', gate: 'selfOverlap' };
  if (measures.m2 > gates.markCover) return { verdict: 'janky', gate: 'markCover' };
  if (measures.m3 > gates.coverageMax) return { verdict: 'janky', gate: 'coverage' };
  if (measures.m3 < gates.coverageMin) return { verdict: 'janky', gate: 'coverageLow' };
  if (measures.m4 > gates.crop) return { verdict: 'janky', gate: 'crop' };
  return { verdict: 'clean', gate: null };
}

/**
 * Matt's exemptions (2026-11-06): held, kept, raygun-treated, whispered
 * and plated forms are never judged — the record marks them exempt
 * rather than clean. (Held landings never reach the review at all: HOLD
 * passes deals by and carries the standing record. The check lives here
 * anyway so the table is complete in one place.) A fresh deal never sets
 * register or raygun — those are performer toggles on a standing form —
 * but the table checks them defensively, in the spec's order.
 */
export function reviewExemption(form, keeps) {
  if (!form) return null;
  if (form.plate) return 'plate';
  if (form.raygun) return 'raygun';
  if (form.register === 'whisper') return 'whisper';
  if (isPoemKept(keeps, form)) return 'kept';
  return null;
}

/**
 * Rebuild the landing's active layer exactly as the resolver builds it
 * (liveResolve's input assembly, minus per-frame ephemera — see the
 * header). Returns the built item list, or null when the landing has no
 * built list in the renderer's terms (a live swarm mode).
 */
function buildLandingItems(state, landingParams, seed, enabledAssets) {
  const layoutParams = { ...DEFAULT_LAYOUT_PARAMS, ...landingParams };
  if (isLiveSwarmMode(layoutParams.mode)) return null;
  const palette = resolvePalette(state.paletteId, state.paletteOverrides, state.userPalettes);
  const caps = getQualityCaps(state.quality || 'balanced');
  const pool = mergePool(ASSETS, state.customAssets || []);
  // liveResolve's own assembly, line for line: the citizen and the
  // poem-only stamps are excluded by id, the pool gates on enabledAssets,
  // then weight overrides, then the shape mixer's per-asset mixWeight.
  const mixW = shapeMixWeights(liveShapeLevels(state.shapeLevels, enabledAssets));
  const weightOverrides = state.assetWeightOverrides || {};
  const activeAssets = pool
    .filter((a) => a.id !== CREATURE_ASSET_ID && !POEM_ONLY_IDS.has(a.id) && (!enabledAssets || enabledAssets[a.id]))
    .map((a) => (weightOverrides[a.id] ? { ...a, weight: weightOverrides[a.id] } : a))
    .map((a) => (mixW && mixW[a.id] ? { ...a, mixWeight: mixW[a.id] } : a));
  const caGrid = state.caGrid ?? (layoutParams.mode === 'ca' ? createGrid(40, 28, seed) : null);
  const { items } = buildPlacements({
    layoutParams,
    seed,
    canvasW: state.canvasW,
    canvasH: state.canvasH,
    activeAssets,
    palette,
    caps,
    growthTick: 0,
    seedOffsets: state.seedOffsets,
    caGrid,
  });
  return items;
}

/**
 * #2006 slice 3 — the landing's mark boxes in FORM units (x in
 * [0, form.aspect], y in [0, 1]; one form unit is canvasH px on both
 * axes), read off the same built list measureLandedForm judges, with
 * the same box math. The ladder's SHIFT rung plans against these: the
 * mark density under a candidate placement of the form's ink. Draw
 * order is not filtered — density is a fact about the room, not about
 * cover. Returns { form, marks } or null on reviewLanding's own null
 * terms (no form, or no built list — a live swarm mode).
 */
export function landingMarkBoxes(state, landingParams, { seed = null, enabledAssets = null } = {}) {
  const form = sanitizeFieldForm(landingParams?.fieldForm);
  if (!form) return null;
  const items = buildLandingItems(state, landingParams, seed ?? state.seed, enabledAssets ?? state.enabledAssets);
  if (!items) return null;
  const H = state.canvasH;
  if (!(H > 0)) return null;
  const marks = [];
  for (const item of items) {
    if (formStampIndex(item, form) >= 0) continue;
    if (!Number.isFinite(item?.x) || !Number.isFinite(item?.y)) continue;
    const hw = (50 * Math.abs(item.scale ?? 1)) / H;
    const hh = (50 * Math.abs(item.scaleY ?? item.scale ?? 1)) / H;
    if (hw > 0 && hh > 0) marks.push(boxOf(item.x / H, item.y / H, hw, hh));
  }
  return { form, marks };
}

/**
 * Judge one fresh landing and return its banked record, or null when
 * there is nothing to bank (no form landed, or the landing has no built
 * item list — a live swarm mode). `state` is the store state the deal was
 * dealt FROM (the resolver's inputs live there); `landingParams` is the
 * commit's landed params carrying the dealt form. `seed` /
 * `enabledAssets` name the COMMIT's values where the commit itself
 * changes them in the same breath as the deal (the KINETIC roll);
 * omitted, the standing state's are the landing's. `stream` names the
 * exact seeded stream the deal drew from ('poem:<deal index>' for
 * landPoem commits, 'press:<press>' for the CURATOR press, which does
 * not advance the poem counter).
 *
 * Record shape (fieldGateRefusal's discipline — a plain session record,
 * written on the deal commit, never serialized):
 *   { verdict: 'clean'|'janky'|'exempt', gate, exempt, measures, gates,
 *     backend: 'rules', rung: null, seed, stream }
 * `measures` is null on an exempt record (never judged); `gates` is the
 * frozen gate set the verdict was judged under, so any verdict can be
 * re-derived from its record alone (the loisJudge provenance pin).
 */
export function reviewLanding(state, landingParams, { seed = null, enabledAssets = null, stream = null } = {}) {
  const form = sanitizeFieldForm(landingParams?.fieldForm);
  if (!form) return null;
  const buildSeed = seed ?? state.seed;
  const exempt = reviewExemption(form, landingParams.poemKeeps ?? state.layoutParams?.poemKeeps);
  if (exempt) {
    return {
      verdict: 'exempt',
      gate: null,
      exempt,
      measures: null,
      gates: REVIEW_GATES,
      backend: 'rules',
      rung: null,
      seed: buildSeed,
      stream,
    };
  }
  const items = buildLandingItems(state, landingParams, buildSeed, enabledAssets ?? state.enabledAssets);
  if (!items) return null;
  const measured = measureLandedForm(items, form, state.canvasW, state.canvasH);
  if (!measured) return null;
  const { m1, m2, m3, m4 } = measured;
  const { verdict, gate } = reviewVerdict({ m1, m2, m3, m4 });
  return {
    verdict,
    gate,
    exempt: null,
    measures: { m1, m2, m3, m4 },
    gates: REVIEW_GATES,
    backend: 'rules',
    rung: null,
    seed: buildSeed,
    stream,
  };
}
