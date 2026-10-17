/**
 * GL scene contract — Phase 0 (#186).
 *
 * The exact data the future WebGL backend consumes, built from the app's
 * existing resolved-layer data with no GL code and no store/schema changes.
 * The builder is a pure data transform: resolveLayers() output + project
 * doc + render caps in, versioned scene object out.
 *
 * Frozen decisions baked in:
 * - Effect stacks execute top-down in array order (#185): the first effect
 *   reads the layer's source, each later effect reads the previous effect's
 *   output. The contract records the stack verbatim (sanitized); Phase 2
 *   changes only the compiler target, never the order.
 * - An FX layer wraps all content accumulated below it (buildLayerStack
 *   fold); the precomputed `fxWraps` array captures that fold exactly.
 * - Filter rasterization stays outside the determinism contract (as in
 *   fxFilters.js) — parity for FX scenes uses the relaxed policy.
 *
 * Versioning: GL_CONTRACT_VERSION bumps on any breaking shape change.
 * Additive fields do not bump the version. Consumers must reject
 * `version` values they don't understand.
 */

import { sanitizeFxEffects, FX_EFFECT_KINDS } from '../fx/fxFilters.js';
import { sanitizeMathEffects, MATH_OP_KINDS, mathTrackWetCeiling } from '../fx/mathFilters.js';
import { sanitizeAccumOptics, sanitizeAccumTunnel, sanitizeAccumPrism, sanitizeAccumFlow, sanitizeAccumEchoes } from './accum.mjs';
import { normalizeSeedOffsets } from '../engine/kernel/rng.js';
import { contractLight } from '../data/light.js';
import { KINEME_KINDS, KINEME_TABLE_MAX, getKineme, kinemePhase, sanitizeAssetKineme, spinKineme, spinVariant, BEND_KINEME_ID } from '../data/kinemes.js';
import { regionsForAsset, regionAssignmentFor, selectAnimatedRegions, isStrokeRegion, bendSlicesFor, REGION_TAG_CAP } from '../data/regionKinemes.js';
import { resolvePalette } from '../data/palettes.js';
import { darkestSwatch } from './contactShadow.mjs'; // #1183 contact shadow colour
import { COALESCE_MAX_FIELDS } from '../engine/dishCoalesce.mjs'; // #1411 coalescence field cap
import { sanitizePattern } from '../state/patternTrack.js';
import { patternPalette } from '../pattern/patternSource.js';

export const GL_CONTRACT_VERSION = 1;

/** Canvas the contract is built for (matches studio/render.mjs). */
export const CONTRACT_CANVAS = Object.freeze({ w: 1000, h: 700 });

const KNOWN_BLENDS = new Set([
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference',
  'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'plus-lighter',
]);

const r3 = (v) => Math.round(Number(v) * 1000) / 1000;
const clamp01 = (v) => Math.min(1, Math.max(0, Number(v)));

/**
 * Sanitize a doc layer's `matte` field (#154 re-plan, landed in #189 as a
 * mask texture — never the SVG mask/feColorMatrix path).
 *
 * Shape: { sourceId, mode: 'alpha'|'luma', invert }. Returns null when the
 * field is absent or unusable; the backend then renders the layer normally
 * (fail closed). Additive: does not bump GL_CONTRACT_VERSION.
 */
export function sanitizeMatte(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.sourceId !== 'string' || !raw.sourceId) return null;
  return {
    sourceId: raw.sourceId,
    mode: raw.mode === 'luma' ? 'luma' : 'alpha',
    invert: !!raw.invert,
  };
}

function hexColor(c, fallback = '#000000') {
  const s = String(c || '');
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
}

const r5 = (v) => Math.round(Number(v) * 100000) / 100000;

/**
 * Phase 2 S2 — sanitize a resolver item's wing-warp mesh (engine/wingWarp.mjs) into the contract.
 *
 * Shape: { pos: [x, y, ...] (scene space), uv: [u, v, ...] (quad-corner space, the mapping QUAD_VS
 * applies), idx: [i, ...] }. The mesh rides ONLY on a bent wing item — the builder emits none at rest —
 * so an unbent contract (and its hash) is exactly the pre-S2 contract. Fail closed like sanitizeMatte:
 * any malformed or oversized mesh is dropped and the item draws as its plain quad. Positions round to
 * r3 like every contract number; UVs to 5 places (sub-texel on a 400px cell).
 */
export function sanitizeMesh(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { pos, uv, idx } = raw;
  if (!Array.isArray(pos) || !Array.isArray(uv) || !Array.isArray(idx)) return null;
  const verts = pos.length / 2;
  if (pos.length % 2 || uv.length !== pos.length || !Number.isInteger(verts) || verts < 4 || verts > 128) return null;
  if (!idx.length || idx.length % 3 || idx.length > 768) return null;
  const outPos = new Array(pos.length);
  const outUv = new Array(uv.length);
  for (let i = 0; i < pos.length; i++) {
    if (!Number.isFinite(pos[i]) || !Number.isFinite(uv[i])) return null;
    outPos[i] = r3(pos[i]);
    outUv[i] = r5(uv[i]);
  }
  const outIdx = new Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    if (!Number.isInteger(idx[i]) || idx[i] < 0 || idx[i] >= verts) return null;
    outIdx[i] = idx[i];
  }
  return { pos: outPos, uv: outUv, idx: outIdx };
}

/**
 * Map one placement item to a contract instance (an instanced quad).
 * Draw order = array order; the backend must not re-sort.
 */
function toInstance(item, layerId, itemBlend, deformShed = false) {
  const s = Number(item.scale) || 0;
  const mirrored = !!item._mirrored;
  // #1202 — non-uniform scale: item.scaleY rides the Y range when X/Y are
  // unlinked, and falls back to the X scale when linked (or absent).
  const sy = Number(item.scaleY ?? s) || 0;
  return {
    asset: String(item.assetId),
    layer: layerId,
    x: r3(item.x),
    y: r3(item.y),
    scaleX: r3(mirrored ? -s : s),
    scaleY: r3(sy),
    rotation: r3(item.rotation), // degrees, clockwise (SVG convention)
    tint: hexColor(item.color),
    accent: hexColor(item.accent),
    opacity: clamp01((Number(item.alpha) || 0) / 100),
    // #623: the smear move drives synthetic per-frame velocity from
    // blendItems; QUAD_VS (velocitySmear) stretches the quad along it.
    // Absent (the common case) reads as zero — exactly the old path.
    vx: Number(item.vx) || 0,
    vy: Number(item.vy) || 0,
    blend: KNOWN_BLENDS.has(itemBlend) ? itemBlend : 'normal',
    zTier: Number(item.zTier) || 0,
    key: String(item.key ?? ''),
    seedOffset: Number(item.seedOffset) || 0,
    // #1410 — petri dish B1 impact deform: [axisX, axisY, amount], the
    // world-space squash QUAD_VS applies (area-preserving). The key rides
    // only on a body that is actually dented or wobbling, and never when
    // shed, so an undeformed contract (and its hash) is exactly what it
    // was before B1.
    // The amount is rounded to 3 places like every contract number, so a wobble under 0.0005 would round to 0
    // and fail the (0, 1] check below on EVERY frame it rode (the capture never got a clean frame): such a
    // body is simply at rest and carries no key.
    ...(!deformShed && r3(Math.min(1, item.deformAmt || 0)) > 0
      ? { deform: [r3(item.deformAxisX || 0), r3(item.deformAxisY || 0), r3(Math.min(1, item.deformAmt))] }
      : {}),
    // Phase 2 S2 — the wing-warp mesh rides the same conditional way: present only on a bent wing
    // item (the builder emits none at rest), so a neutral contract is byte-identical to pre-S2.
    // The renderer draws it through MESH_VS + the shared QUAD_FS at the item's list position.
    ...((m) => (m ? { mesh: m } : {}))(item.mesh ? sanitizeMesh(item.mesh) : null),
    // #1547 — the glass flag rides only when set (the deform precedent
    // above): packInstanceData reads it into a_glass, selecting the
    // #1129 soft-bevel / caustic / striation terms in the quad shader.
    // Before M1 the flag died at this seam — buildPlacements set it on
    // items and no contract instance carried it, so v_glass was 0 on
    // every contract render and the #1129 lighting was unreachable.
    // Absent (the common case) the packer reads enamel, exactly the
    // old path, and the contract hash is unchanged.
    ...(item.glass ? { glass: true } : {}),
    // #1548 — the plate flag rides the same way (Materials M2):
    // packInstanceData reads it into a_plate, selecting the radial
    // plate ramp on the ink channel in the quad shader. Absent (flat /
    // wash / stipple / glass strata) the contract is byte-identical.
    ...(item.plate ? { plate: true } : {}),
    // #1549 — the wash and stipple flags ride the same way (Materials
    // M3): packInstanceData folds them into the same a_plate tail slot
    // as body codes 2 and 3, selecting the vertical wash ramp / the
    // stipple dot screen on the ink channel in the quad shader.
    // Absent (the common case) the contract is byte-identical.
    ...(item.wash ? { wash: true } : {}),
    ...(item.stipple ? { stipple: true } : {}),
    // #1585 (Materials M4) — the body's tunables ride the same way:
    // buildPlacements stamps `matParams` only when the stratum's
    // knobs moved off the shipped defaults, so an unmoved Look's
    // contract (and its hash) is exactly the pre-M4 contract, and the
    // packer fills the param attribute from the leaves' defaults
    // whenever the key is absent. Rounded to 3 places like every
    // contract number.
    ...(Array.isArray(item.matParams) ? { mat: item.matParams.map((v) => r3(v)) } : {}),
    // Phase 2 S4 — the engraving rides the same way: creature.js stamps
    // `engrave` (16 numbers: the spine joints in the body item's quad
    // frame + [count, spacing, width, strength], engine/engraveBody.mjs)
    // only on an engraved body item; packInstanceData reads it into the
    // appended a_eng* attributes, selecting the contour-line finish in
    // the quad shader. Absent (every non-creature instance, and every
    // creature while the finish is off) the contract is byte-identical.
    ...(Array.isArray(item.engrave) ? { engrave: item.engrave.map((v) => r3(v)) } : {}),
  };
}

/**
 * Precompute the buildLayerStack fold: FX layers wrap the composite
 * accumulated below them. Returns { wraps, shedFxLayerIds }: ordered wrap
 * groups (each names the FX layer, its filter id, its opacity, and the ids
 * of ALL content layers below it, bottom-up — empty when the FX layer sits
 * at the very bottom), plus the ids of any FX layer that did NOT get a
 * wrap. Every FX layer with effects gets a wrap: the canvas background is
 * below the bottom layer, so there is always something to wrap; only an
 * over-budget FX layer lands in shedFxLayerIds (reported, never silent).
 *
 * #227: the renderer's wrap input is the whole composite below the FX
 * layer — the current main image (background + every lower layer's output,
 * including lower FX layers) with the pending segment folded over it —
 * so each FX layer genuinely adjusts everything below it.
 *
 * Mirrors studio/render.mjs exactly, including the shed rules: the tier's
 * maxFxLayers budget drops FX layers past the budget, and a layer whose
 * effects sanitize to nothing produces no filter (fxFilterStringForLayer
 * returns null) — both pass content through unwrapped (no wrap entry).
 *
 * #192: the shed is REPORTED, never silent. Every FX layer that loses its
 * wrap lands in shedFxLayerIds and the contract carries it as
 * `shed.fxLayerIds` — the silent-cull trap (an FX layer shown in the UI
 * while culled) must not survive in any form. With maxFxLayers retired as
 * a tier budget (all live tiers are Infinity), this is empty in normal
 * operation; it stays wired so a future cap can never go silent again.
 * Additive: does not bump GL_CONTRACT_VERSION.
 */
function buildFxWraps(resolvedLayers, caps) {
  const wraps = [];
  const shedFxLayerIds = [];
  const maxFx = caps?.maxFxLayers ?? Infinity;
  // #227: an FX layer wraps EVERYTHING below it, so the fold tracks all
  // content below each FX layer — not just the segment since the previous
  // FX layer. An FX layer stacked directly above another FX layer still
  // gets a wrap (its input is the lower FX layer's output). Every FX layer
  // with effects gets a wrap: the canvas background is below the bottom
  // layer, so "everything below" always includes it (the renderer seeds
  // each wrap from the current main composite, background included).
  let below = [];
  let fxIndex = 0;
  for (const rl of resolvedLayers) {
    if (rl.isFx) {
      // #1010 — MATH tracks ride the same wrap machinery; their chain
      // sanitizes against the math catalog instead.
      const fx = rl.isMath ? sanitizeMathEffects(rl.layer?.effects) : sanitizeFxEffects(rl.layer?.effects);
      let opacity = clamp01(rl.layerOpacity ?? 1);
      // HUE ROTATE's default wet ceiling: the grade can never run hotter
      // than 50% while the dangerous op is in the chain. One rule, shared with
      // the wet slider (#1023), so the UI cannot show what this refuses.
      if (rl.isMath) opacity = Math.min(opacity, mathTrackWetCeiling(rl.layer));
      if (fxIndex < maxFx && fx.length > 0) {
        wraps.push({
          fxLayerId: rl.id,
          filterId: `fx-${String(rl.id).replace(/[^A-Za-z0-9_-]/g, '_')}`,
          opacity,
          contentLayerIds: below.map((l) => l.id),
        });
      } else if (fx.length > 0) {
        // Over budget: the wrap is shed, and the layer id is reported so
        // the shed can never be silent.
        shedFxLayerIds.push(rl.id);
      }
      fxIndex += 1;
    } else {
      below.push(rl);
    }
  }
  return { wraps, shedFxLayerIds };
}

/**
 * Build the scene contract.
 *
 * @param {object} args
 * @param {object} args.doc — project document (seed, quality, layers…)
 * @param {Array} args.resolvedLayers — resolveLayers(doc, {caps}) output
 * @param {object} [args.caps] — render caps (recorded for provenance)
 * @param {object|null} [args.accum] — { enabled, fade, optics, tunnel, prism, flow, echoes, background } or null
 * @returns versioned, JSON-serializable scene object
 */
const warnedMaterials = new Set();

/**
 * Disclose — don't silently drop — the materials that don't survive
 * studio.py still (#168, "live and studio agree or refuse").
 *
 * The historical vocabulary is COMPLETE in GL since #1549 (Materials
 * M3): 'glass' engages the #1129 machinery (#1547, M1), 'plate'
 * paints its radial ramp on the ink channel (#1548, M2), and 'wash'
 * (vertical accent→ink ramp) and 'stipple' (dot-field screen) paint
 * theirs on the same channel via the contract's wash/stipple flags
 * (#1549, M3) — in the live tab, and in composed (miner) stills via
 * the retired defs themselves. This warning is not about the live
 * tab or composed stills; it discloses the one surface where two of
 * the four still don't survive: `studio.py still` (and the accum
 * still), the headless GL export (renderExportViaGL →
 * createRenderer, u_liveTint = 0). That renderer has no channel
 * decomposition to ramp against, so the two COLOUR-RAMP bodies —
 * plate and wash — render flat there. The other two survive the
 * export: glass's body is placement-level (alpha + sort, and its
 * bevel terms sit outside the tint path), and stipple's screen is
 * applied to the atlas sample itself, which needs no channel
 * decomposition. Plate and wash are therefore disclosed here — warn
 * once per material per process, like studio/blendFallback.mjs —
 * until the export atlas bake carries their ramps at bake time.
 *
 * @param {Array} resolvedLayers — resolveLayers(doc, {caps}) output
 */
export function warnUnsupportedMaterials(resolvedLayers) {
  const used = new Set();
  for (const L of resolvedLayers || []) {
    const mat = L.layoutParams?.material;
    if (mat !== 'plate' && mat !== 'wash') continue;
    if (Array.isArray(L.items) && L.items.some((it) => it.role === 'wing')) {
      used.add(mat);
    }
  }
  for (const mat of used) {
    if (warnedMaterials.has(mat)) continue;
    warnedMaterials.add(mat);
    console.warn(
      `[export] material "${mat}" renders flat in studio stills (#168): ` +
      'its colour-ramp body renders in the live tab and in composed stills, but the GL export ' +
      '(studio.py still) has no channel decomposition to ramp against. See docs/QUALITY.md.',
    );
  }
}

/** #1127 — a layer's ROTATE spin in rev/s: finite, 0..1, anything else is still. */
const spinOf = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(1, n) : 0; };

/**
 * #1183 contact shadow — is it shed? Tier 2 (Matt, 2026-10-12): it goes only after the tier-1 extras are already
 * gone (perfTier1) AND the quality has stepped down to PERF, as one piece. Exports and stills never shed it.
 */
export function contactShadowShed(doc) {
  return !!(doc && doc.perfTier1) && String(doc.quality || '') === 'performance';
}

/**
 * #1482 P3 — spectrum marks go quiet on the same rung as the contact shadow: after the tier-1 extras are gone
 * (perfTier1) AND the quality has stepped down to PERF. Before body counts are touched.
 */
export function spectrumMarksShed(doc) {
  return !!(doc && doc.perfTier1) && String(doc.quality || '') === 'performance';
}

/**
 * #1431 KINEME C — cell kinemes (strip playback inside the mark) park on
 * cell 0 on the same tier-2 rung as the spectrum marks: after the tier-1
 * extras are gone (perfTier1) AND quality has stepped down to performance.
 * Shed pins the canonical frame — cell 0, the frame the pre-#1431
 * single-cell bake carried. Exports and stills never shed: their docs do
 * not carry the live governor state, so the predicate is false there.
 */
export function cellKinemesShed(doc) {
  return !!(doc && doc.perfTier1) && String(doc.quality || '') === 'performance';
}

/**
 * #1433 (R2) — the region-kineme freeze: region motion sheds on the
 * tier-2 rung, with the cell kinemes and spectrum marks (after the
 * tier-1 extras are gone AND quality has stepped down to performance).
 * The freeze tightens the region budget to 0: regions still draw, at
 * rest — only their motion sheds. Exports and stills never freeze:
 * their docs do not carry the live governor state.
 */
export function regionKinemesFrozen(doc) {
  return !!(doc && doc.perfTier1) && String(doc.quality || '') === 'performance';
}

/**
 * #1433 (R2) — the collapse, one rung deeper than the freeze: the
 * regions themselves go and the pack draws the single original quad
 * (the pre-R2 code path — exact, not a re-render). Needs the freeze
 * rung PLUS any deeper governor cut: asset thinning, the count clamp,
 * or the motion freeze (slowRender).
 */
export function regionCollapseShed(doc) {
  return regionKinemesFrozen(doc) && !!(doc && (doc.assetThin || doc.perfClamp || doc.slowRender));
}

/**
 * #1433 (R2) — how many of a mark's tagged regions may animate
 * individually this frame. The caller's device-class budget
 * (doc.regionBudget — 12 desktop / 8 iPad-class; data/quality.js
 * REGION_BUDGETS) is the ceiling; reduced motion (regions hold rest)
 * and the freeze rung tighten it to 0. Absent a caller budget the
 * ceiling is the tag cap, so exports and stills animate every
 * assigned region.
 */
export function regionAnimBudget(doc) {
  if (doc && doc.reducedMotion) return 0;
  if (regionKinemesFrozen(doc)) return 0;
  const b = Number(doc?.regionBudget);
  if (!Number.isFinite(b)) return REGION_TAG_CAP;
  return Math.max(0, Math.min(REGION_TAG_CAP, Math.floor(b)));
}

/**
 * #1410 petri dish B1 — is impact deform shed? Same tier-2 rung as the
 * contact shadow, by the same rule (spec §7 ladder: FX finishes first,
 * then deform, then radius fidelity and body counts): it goes only after
 * the tier-1 extras are already gone (perfTier1) AND quality has stepped
 * down to performance. Exports and stills never shed it — their docs do
 * not carry the live governor state, so the predicate is false there.
 */
export function dishDeformShed(doc) {
  return !!(doc && doc.perfTier1) && String(doc.quality || '') === 'performance';
}

/**
 * #1411 petri dish B2 — is coalescence shed? Tier 1 (spec §5: it "sheds
 * with the FX finishes", first on the ladder): it goes the moment the
 * governor's tier-1 shed is active, at any quality — one rung BEFORE
 * the shadow and deform. Exports and stills never shed it: their docs
 * do not carry the live governor state.
 */
export function dishCoalesceShed(doc) {
  return !!(doc && doc.perfTier1);
}

/**
 * #1412 petri dish B3 — is pigment exchange shed? Tier 2, deform's
 * rung and rule (spec §7 ladder: FX finishes first, then deform +
 * exchange, then radius fidelity and body counts): it goes only after
 * the tier-1 extras are already gone (perfTier1) AND quality has
 * stepped down to performance. The shed stops the trade in the engine
 * (the resolver forwards it spread-only into update()); colour
 * already earned is history and stays — a shed never repaints a body.
 * Exports and stills never shed it: their docs do not carry the live
 * governor state, so the predicate is false there and their bakes
 * trade exactly as the live dish did.
 */
export function dishPigmentShed(doc) {
  return !!(doc && doc.perfTier1) && String(doc.quality || '') === 'performance';
}

/**
 * #1411 — a content layer's coalescence fields for the contract, or
 * null (the key is then omitted, so every contract without a merge, and
 * its hash, is exactly what it was). Sanitized fail-closed like the
 * shadow: finite geometry, radius above 0, factor in (0, 1] AFTER the
 * contract's 3-place rounding (a factor that rounds to 0 is rest, not
 * a merge), tint a #rrggbb hex; anything else drops the field.
 */
export function contractCoalesce(rl, shed) {
  if (shed || !Array.isArray(rl?.coalesce) || rl.coalesce.length === 0) return null;
  const out = [];
  for (const f of rl.coalesce) {
    if (!f || typeof f !== 'object') continue;
    const x = Number(f.x); const y = Number(f.y);
    const r = Number(f.r); const fac = r3(Number(f.f));
    const tint = typeof f.tint === 'string' ? f.tint.toLowerCase() : '';
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!Number.isFinite(r) || !(r > 0)) continue;
    if (!(fac > 0) || fac > 1) continue;
    if (!/^#[0-9a-f]{6}$/.test(tint)) continue;
    out.push({ x: r3(x), y: r3(y), r: r3(r), f: fac, tint });
    if (out.length >= COALESCE_MAX_FIELDS) break;
  }
  return out.length ? out : null;
}

/**
 * #1183 — a content layer's contact shadow for the contract, or null (the key is then omitted, so every contract
 * without a shadow, and its hash, is exactly what it was). Needs the knob above 0 and a PATTERN below (decision 4).
 */
export function contractShadow(rl, groundBelow, shed) {
  if (shed || !groundBelow) return null;
  const a = Number(rl?.layoutParams?.groundShadow);
  if (!Number.isFinite(a) || !(a > 0)) return null;
  return { amount: Math.round(Math.min(1, a) * 1000) / 1000, color: darkestSwatch(rl.palette) };
}

export function buildSceneContract({ doc, resolvedLayers, caps = null, accum = null }) {
  if (!doc || typeof doc !== 'object') throw new TypeError('buildSceneContract: doc required');
  if (!Array.isArray(resolvedLayers)) throw new TypeError('buildSceneContract: resolvedLayers required');

  const layers = [];
  const instances = [];
  const spinning = new Map(); // #1127: instance -> ROTATE spin (rev/s) of its layer
  const assetIds = new Set();
  // Doc layers are looked up by id for fields resolveLayers() doesn't
  // forward (matte); the app model itself is untouched (#189).
  const docLayerById = new Map(
    (doc.layers || []).filter((l) => l && l.id != null).map((l) => [String(l.id), l])
  );

  const shadowShed = contactShadowShed(doc); // #1183
  const deformShed = dishDeformShed(doc); // #1410
  const coalesceShed = dishCoalesceShed(doc); // #1411
  let groundBelow = false; // #1183: a visible PATTERN layer has been laid down below the current one
  for (const rl of resolvedLayers) {
    if (rl.isFx && !rl.isMath) {
      layers.push({
        id: String(rl.id),
        name: String(rl.layer?.name ?? rl.id),
        type: 'fx',
        visible: true, // resolved layers are pre-filtered for visibility
        opacity: clamp01(rl.layerOpacity ?? rl.layer?.layerOpacity ?? 1),
        blend: 'normal', // FX wrap groups carry no blend mode (buildLayerStack)
        fx: sanitizeFxEffects(rl.layer?.effects), // top-down, #185 order preserved
        matte: sanitizeMatte(rl.layer?.matte),
      });
      continue;
    }
    if (rl.isMath) {
      // #1010 — MATH tracks: same adjustment-layer contract as FX, chain
      // sanitized against the math catalog. soloGrade seeds mid-grey.
      layers.push({
        id: String(rl.id),
        name: String(rl.layer?.name ?? rl.id),
        type: 'math',
        visible: true, // resolved layers are pre-filtered for visibility
        opacity: clamp01(rl.layerOpacity ?? rl.layer?.layerOpacity ?? 1),
        blend: 'normal',
        fx: sanitizeMathEffects(rl.layer?.effects), // top-down, #185 order preserved
        soloGrade: !!rl.soloGrade,
        matte: sanitizeMatte(rl.layer?.matte),
      });
      continue;
    }
    if (rl.isPattern) {
      // #1098 — a PATTERN track: no instances, one generated texture. It composites like a content
      // track (blend, opacity, matte, the FX fold above it). `t` rides the block ONLY while it
      // drifts, so a static pattern's contract and hash do not change from frame to frame.
      const pattern = sanitizePattern(rl.pattern);
      groundBelow = true; // #1183: resolved layers are pre-filtered for visibility, bottom -> top
      layers.push({
        id: String(rl.id),
        name: String(rl.layer?.name ?? rl.id),
        type: 'pattern',
        visible: true,
        opacity: clamp01(rl.layerOpacity ?? 1),
        blend: KNOWN_BLENDS.has(rl.layerBlendMode) ? rl.layerBlendMode : 'normal',
        matte: sanitizeMatte(docLayerById.get(String(rl.id))?.matte),
        pattern: pattern.drift > 0 ? { ...pattern, t: Number.isFinite(Number(rl.t)) ? Math.round(Number(rl.t) * 1000) / 1000 : 0 } : pattern,
        palette: patternPalette(rl.palette),
      });
      continue;
    }
    const layerId = String(rl.id);
    const itemBlend = rl.layoutParams?.blendMode || 'normal';
    layers.push({
      id: layerId,
      name: String(rl.layer?.name ?? layerId),
      type: 'content',
      visible: true,
      opacity: clamp01(rl.layerOpacity ?? 1),
      blend: KNOWN_BLENDS.has(rl.layerBlendMode) ? rl.layerBlendMode : 'normal',
      matte: sanitizeMatte(docLayerById.get(layerId)?.matte),
      layout: {
        blendMode: KNOWN_BLENDS.has(itemBlend) ? itemBlend : 'normal',
        hueRotate: Number(rl.layoutParams?.hueRotate) || 0,
      },
      // #1183 — the contact shadow; key absent unless it casts (knob > 0, ground below, not shed)
      ...((sh) => (sh ? { shadow: sh } : {}))(contractShadow(rl, groundBelow, shadowShed)),
      // #1411 — the coalescence fields; key absent unless a pair is mid-merge (and not tier-1 shed)
      ...((co) => (co ? { coalesce: co } : {}))(contractCoalesce(rl, coalesceShed)),
    });
    const layerSpin = spinOf(rl.layoutParams?.rotateSpin);
    for (const item of rl.items || []) {
      assetIds.add(String(item.assetId));
      const inst = toInstance(item, layerId, itemBlend, deformShed);
      if (layerSpin) spinning.set(inst, layerSpin);
      instances.push(inst);
    }
  }

  // #781 KINEME (Build A): instances whose asset has a kineme carry its table
  // index (1-based; 0/absent = still) and a per-instance phase. The table and
  // the motion time ride on the contract ONLY when something moves, so every
  // motionless contract (and its hash) is exactly what it was before.
  const kinemeFields = (() => {
    const map = sanitizeAssetKineme(doc.assetKineme) || {};
    const table = [];
    const slot = new Map();
    for (const inst of instances) {
      // #1127 — an asset with its own kineme keeps it; every other mark takes the layer's ROTATE spin, if it has one.
      // Each mark spins at its own speed and direction (kinemes.js spinVariant). Phase stays 0, so at motion time 0
      // every mark sits exactly on its static angle.
      const rev = spinning.get(inst);
      const own = getKineme(map[inst.asset]);
      const k = own || (rev ? spinKineme(rev, spinVariant(inst.seedOffset, inst.key)) : null);
      if (!k) continue;
      if (!slot.has(k.id)) {
        if (table.length >= KINEME_TABLE_MAX) continue; // ponytail: 16-slot cap; a bigger library needs a texture table
        slot.set(k.id, table.length + 1);
        table.push({ kind: KINEME_KINDS[k.kind], period: k.period, amp: k.amp });
      }
      inst.kineme = slot.get(k.id);
      inst.kinemePhase = own ? kinemePhase(inst.seedOffset, inst.key) : 0;
    }
    // #1433 (R2) — per-region kinemes join the SAME table (one animation
    // system: region instances ride instance floats 18/19 like any
    // instance). Slots append after the instance kinemes, so a scene
    // without region assignments builds exactly the pre-R2 table. The
    // governor's selection resolves HERE, where the budget lives: the
    // regionAnim map names region id -> slot, with slot 0 = assigned but
    // NOT selected (over budget, or the budget tightened to 0) — that
    // region renders merged, at rest. The data itself is R3 (#1434):
    // family defaults ride the record's own field, the artist's override
    // rides doc.regionKinemes, and custom (user:) assets resolve their
    // records from the doc's customAssets — regionAssignmentFor merges
    // all three.
    const regionAssets = {};
    const bendAssets = {};
    {
      const seenAssets = new Set();
      const budget = regionAnimBudget(doc);
      const overlayById = Array.isArray(doc.customAssets) && doc.customAssets.length
        ? new Map(doc.customAssets.map((a) => [a && a.id, a]))
        : null;
      for (const inst of instances) {
        if (seenAssets.has(inst.asset)) continue;
        seenAssets.add(inst.asset);
        const record = overlayById ? overlayById.get(inst.asset) : undefined;
        const records = regionsForAsset(inst.asset, record);
        if (!records) continue;
        const assignment = regionAssignmentFor(inst.asset, doc.regionKinemes, record);
        if (!assignment) continue;
        const animated = selectAnimatedRegions(records, assignment, budget);
        const recordById = new Map(records.map((r) => [r.id, r]));
        const entry = {};
        for (const [regionId, kid] of Object.entries(assignment)) {
          if (!animated.has(regionId)) { entry[regionId] = 0; continue; }
          const k = getKineme(kid); // sanitizeRegionKinemes proved it exists
          if (!k) { entry[regionId] = 0; continue; }
          if (!slot.has(k.id)) {
            if (table.length >= KINEME_TABLE_MAX) { entry[regionId] = 0; continue; } // 16-slot cap, shared with instance kinemes
            slot.set(k.id, table.length + 1);
            table.push({ kind: KINEME_KINDS[k.kind], period: k.period, amp: k.amp });
          }
          entry[regionId] = slot.get(k.id);
          // #1435 (R4) — a SELECTED region riding the bend kineme whose
          // geometry is a stroke subdivides at pack time: the contract
          // carries the slice count (a pure function of the record), the
          // pack cuts the region's cell into that many slices and steps
          // the phase along the length. Unselected regions (slot 0) and
          // non-stroke regions never appear here — they render merged or
          // whole, exactly as R2/R3 left them.
          if (kid === BEND_KINEME_ID && isStrokeRegion(recordById.get(regionId))) {
            (bendAssets[inst.asset] ||= {})[regionId] = bendSlicesFor(recordById.get(regionId));
          }
        }
        if (Object.keys(entry).length) regionAssets[inst.asset] = entry;
      }
    }
    const regionAnim = Object.keys(regionAssets).length
      ? {
          regionAnim: {
            budget: regionAnimBudget(doc),
            ...(regionCollapseShed(doc) ? { shed: true } : {}),
            assets: regionAssets,
            ...(Object.keys(bendAssets).length ? { bend: bendAssets } : {}),
          },
        }
      : {};
    if (!table.length) {
      // #1431 — cell kinemes read the same clock: motion time rides the
      // contract even when no instance kineme is assigned, or a strip-only
      // scene would sit on cell 0 forever. A doc without kinemeTime still
      // gets no key, so motionless contracts (and their hashes) are
      // exactly what they were.
      const t = Number(doc.kinemeTime);
      return { ...(Number.isFinite(t) ? { kinemeTime: t } : {}), ...regionAnim };
    }
    const t = Number(doc.kinemeTime);
    return { kinemes: table, kinemeTime: Number.isFinite(t) ? t : 0, ...regionAnim };
  })();

  const scene = {
    version: GL_CONTRACT_VERSION,
    canvas: { w: CONTRACT_CANVAS.w, h: CONTRACT_CANVAS.h },
    seed: Number(doc.seed) >>> 0,
    // Sub-seed stream offsets (#305): part of the render recipe, so a kept
    // render replays bit-identically. Absent in older callers → zeros.
    seedOffsets: normalizeSeedOffsets(doc.seedOffsets),
    quality: String(doc.quality || 'balanced'),
    atlas: {
      // Phase 1 fills uv rects when assets are baked to the texture atlas.
      // Phase 0 records the referenced asset ids (100x100 source box each).
      assets: [...assetIds].sort().map((id) => ({ id, w: 100, h: 100, uv: null })),
    },
    layers,
    compositeOrder: layers.map((l) => l.id), // bottom -> top; backend draws in this order
    ...(() => {
      const { wraps, shedFxLayerIds } = buildFxWraps(resolvedLayers, caps);
      return {
        fxWraps: wraps,
        // #192: reported shed — never silent. Empty in normal operation.
        shed: { fxLayerIds: shedFxLayerIds },
      };
    })(),
    instances, // draw order = array order within each layer's slice
    // #594 — the ONE scene sun. Key omitted when off, so an unlit contract (and
    // its hash) is exactly what it was before lighting existed. Colour comes
    // from a palette slot: callers that already resolved the palette (live,
    // incl. user palettes) pass doc.palette; export paths resolve from the id.
    ...(() => {
      if (!doc.light) return {};
      const pal = doc.palette || resolvePalette(doc.paletteId || 'praystation', doc.paletteOverrides || null);
      const light = contractLight(doc.light, pal);
      return light ? { light } : {};
    })(),
    // #594 PR3 — squash-and-stretch amount (scene-level, like the sun). Key
    // omitted at 0 so every existing contract and its hash are unchanged.
    ...(() => {
      const q = Number(doc.squash ?? doc.layoutParams?.squash);
      return Number.isFinite(q) && q > 0 ? { squash: Math.min(1, q) } : {};
    })(),
    ...kinemeFields,
    // #1431 — cell-kineme shed state. Key present only while shed, so an
    // unshed contract (and its hash) is exactly what it was.
    ...(cellKinemesShed(doc) ? { cellShed: true } : {}),
    textRuns: [], // #550: CUT — no producer (glyph-atlas baker removed; text is baked into stamp assets). Kept as [] for shape/hash stability; the renderer never reads it.
    accum: accum && accum.enabled
      ? {
          enabled: true,
          fade: Math.min(0.99, Math.max(0, Number(accum.fade ?? 0.88))),
          optics: sanitizeAccumOptics(accum.optics ?? 0), // #190: bloom/halation/blur-over-time amount
          tunnel: sanitizeAccumTunnel(accum.tunnel ?? 0), // Phase A: feedback zoom/spin amount
          prism: sanitizeAccumPrism(accum.prism ?? 0), // Phase A: chromatic drift amount
          flow: sanitizeAccumFlow(accum.flow ?? 0), // Phase B2: flow-advected feedback amount
          echoes: sanitizeAccumEchoes(accum.echoes ?? 0), // Phase B3: echo tap count
          background: hexColor(accum.background, '#000000'),
        }
      : null,
    provenance: {
      contractVersion: GL_CONTRACT_VERSION,
      caps: caps ? { ...caps } : null,
    },
  };
  assertSceneContract(scene);
  return scene;
}

/**
 * Validate a scene contract. Throws on the first violation.
 * Unknown effect kinds are rejected here (the builder sanitizes, so a
 * hand-built scene with an unknown kind is a bug, not data).
 */
export function assertSceneContract(scene) {
  const fail = (msg) => { throw new Error(`sceneContract: ${msg}`); };
  if (!scene || typeof scene !== 'object') fail('scene must be an object');
  if (scene.version !== GL_CONTRACT_VERSION) fail(`unsupported version ${scene.version}`);
  if (!scene.canvas || !Number.isFinite(scene.canvas.w) || !Number.isFinite(scene.canvas.h)) {
    fail('canvas.w/h must be finite numbers');
  }
  if (!Array.isArray(scene.layers)) fail('layers must be an array');
  if (!Array.isArray(scene.instances)) fail('instances must be an array');
  if (!Array.isArray(scene.textRuns)) fail('textRuns must be an array');
  if (!Array.isArray(scene.fxWraps)) fail('fxWraps must be an array');
  // #192: the reported shed is part of the validated shape — an FX layer
  // that loses its wrap must always be named here, never silent.
  if (!scene.shed || !Array.isArray(scene.shed.fxLayerIds)) {
    fail('shed.fxLayerIds must be an array');
  }
  const layerIds = new Set();
  for (const l of scene.layers) {
    if (!l.id || layerIds.has(l.id)) fail(`duplicate or missing layer id: ${l.id}`);
    layerIds.add(l.id);
    if (l.type !== 'content' && l.type !== 'fx' && l.type !== 'math' && l.type !== 'pattern') fail(`layer ${l.id}: bad type ${l.type}`);
    if (l.type === 'pattern') {
      if (!l.pattern || typeof l.pattern !== 'object') fail(`pattern layer ${l.id}: pattern block required`);
      if (!l.palette || !Array.isArray(l.palette.swatches)) fail(`pattern layer ${l.id}: palette required`);
    }
    if (l.shadow !== undefined) { // #1183 contact shadow
      const sh = l.shadow;
      if (l.type !== 'content') fail(`layer ${l.id}: only content layers cast a shadow`);
      if (!sh || typeof sh !== 'object' || !Number.isFinite(sh.amount) || sh.amount <= 0 || sh.amount > 1) {
        fail(`layer ${l.id}: shadow.amount must be in (0, 1]`);
      }
      if (typeof sh.color !== 'string' || !/^#[0-9a-f]{6}$/.test(sh.color)) fail(`layer ${l.id}: shadow.color must be #rrggbb`);
    }
    if (l.coalesce !== undefined) { // #1411 coalescence fields
      if (l.type !== 'content') fail(`layer ${l.id}: only content layers coalesce`);
      if (!Array.isArray(l.coalesce) || l.coalesce.length === 0 || l.coalesce.length > COALESCE_MAX_FIELDS) {
        fail(`layer ${l.id}: coalesce must be an array of 1..${COALESCE_MAX_FIELDS} fields`);
      }
      for (const f of l.coalesce) {
        if (!f || typeof f !== 'object' || !Number.isFinite(f.x) || !Number.isFinite(f.y)) {
          fail(`layer ${l.id}: coalesce field x/y must be finite`);
        }
        if (!Number.isFinite(f.r) || !(f.r > 0)) fail(`layer ${l.id}: coalesce field r must be > 0`);
        if (!Number.isFinite(f.f) || !(f.f > 0) || f.f > 1) fail(`layer ${l.id}: coalesce field f must be in (0, 1]`);
        if (typeof f.tint !== 'string' || !/^#[0-9a-f]{6}$/.test(f.tint)) fail(`layer ${l.id}: coalesce field tint must be #rrggbb`);
      }
    }
    if (l.matte !== null && l.matte !== undefined) {
      const m = l.matte;
      if (typeof m !== 'object' || typeof m.sourceId !== 'string' || !m.sourceId) {
        fail(`layer ${l.id}: matte.sourceId must be a non-empty string`);
      }
      if (m.mode !== 'alpha' && m.mode !== 'luma') fail(`layer ${l.id}: matte.mode must be alpha|luma`);
      if (typeof m.invert !== 'boolean') fail(`layer ${l.id}: matte.invert must be boolean`);
    }
    if (l.type === 'fx') {
      if (!Array.isArray(l.fx)) fail(`fx layer ${l.id}: fx must be an array`);
      for (const fx of l.fx) {
        if (!FX_EFFECT_KINDS.includes(fx.kind)) fail(`fx layer ${l.id}: unknown effect kind ${fx.kind}`);
        if (!fx.params || typeof fx.params !== 'object') fail(`fx layer ${l.id}: params must be an object`);
      }
    }
    if (l.type === 'math') {
      if (!Array.isArray(l.fx)) fail(`math layer ${l.id}: fx must be an array`);
      for (const fx of l.fx) {
        if (!MATH_OP_KINDS.includes(fx.kind)) fail(`math layer ${l.id}: unknown math op ${fx.kind}`);
        if (!fx.params || typeof fx.params !== 'object') fail(`math layer ${l.id}: params must be an object`);
      }
    }
  }
  for (const w of scene.fxWraps) {
    if (!layerIds.has(w.fxLayerId)) fail(`fxWrap references unknown fx layer ${w.fxLayerId}`);
    for (const id of w.contentLayerIds) {
      if (!layerIds.has(id)) fail(`fxWrap references unknown content layer ${id}`);
    }
  }
  for (const it of scene.instances) {
    if (!layerIds.has(it.layer)) fail(`instance references unknown layer ${it.layer}`);
    for (const k of ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity']) {
      if (!Number.isFinite(it[k])) fail(`instance ${it.key}: ${k} must be finite`);
    }
    if (it.opacity < 0 || it.opacity > 1) fail(`instance ${it.key}: opacity out of range`);
    if (it.deform !== undefined) { // #1410 impact deform
      const d = it.deform;
      if (!Array.isArray(d) || d.length !== 3 || !d.every(Number.isFinite)) {
        fail(`instance ${it.key}: deform must be [axisX, axisY, amount] of finite numbers`);
      }
      if (Math.abs(Math.hypot(d[0], d[1]) - 1) > 0.01) fail(`instance ${it.key}: deform axis must be a unit vector`);
      if (!(d[2] > 0 && d[2] <= 1)) fail(`instance ${it.key}: deform amount must be in (0, 1]`);
    }
    if (it.engrave !== undefined) { // Phase 2 S4 engraving (engine/engraveBody.mjs)
      const e = it.engrave;
      if (!Array.isArray(e) || e.length !== 16 || !e.every(Number.isFinite)) {
        fail(`instance ${it.key}: engrave must be 16 finite numbers [joints x6, count, spacing, width, strength]`);
      }
      if (!(e[12] >= 2 && e[12] <= 6)) fail(`instance ${it.key}: engrave joint count must be in [2, 6]`);
      if (!(e[13] > 0)) fail(`instance ${it.key}: engrave spacing must be > 0`);
    }
  }
  if (scene.regionAnim !== undefined) { // #1433 region playback state
    const ra = scene.regionAnim;
    if (!ra || typeof ra !== 'object' || Array.isArray(ra)) fail('regionAnim must be an object');
    if (!Number.isInteger(ra.budget) || ra.budget < 0 || ra.budget > REGION_TAG_CAP) {
      fail(`regionAnim.budget must be an integer in [0, ${REGION_TAG_CAP}]`);
    }
    if (ra.shed !== undefined && ra.shed !== true) fail('regionAnim.shed must be true when present');
    if (!ra.assets || typeof ra.assets !== 'object' || Array.isArray(ra.assets)) fail('regionAnim.assets must be an object');
    for (const [assetId, entry] of Object.entries(ra.assets)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`regionAnim.assets.${assetId} must be an object`);
      for (const [regionId, s] of Object.entries(entry)) {
        if (!Number.isInteger(s) || s < 0 || s > (scene.kinemes?.length || 0)) {
          fail(`regionAnim slot for ${assetId}/${regionId} out of range`);
        }
      }
    }
    if (ra.bend !== undefined) { // #1435 R4: per-region bend slice counts
      if (!ra.bend || typeof ra.bend !== 'object' || Array.isArray(ra.bend)) fail('regionAnim.bend must be an object');
      for (const [assetId, entry] of Object.entries(ra.bend)) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`regionAnim.bend.${assetId} must be an object`);
        for (const [regionId, n] of Object.entries(entry)) {
          if (!Number.isInteger(n) || n < 3 || n > 8) {
            fail(`regionAnim bend slices for ${assetId}/${regionId} out of range`);
          }
          if (!(regionId in (ra.assets[assetId] || {}))) {
            fail(`regionAnim bend for ${assetId}/${regionId} names no regionAnim region`);
          }
        }
      }
    }
  }
  return true;
}

/** Deterministic JSON for hashing / snapshot comparison. */
export function serializeSceneContract(scene) {
  assertSceneContract(scene);
  return JSON.stringify(scene);
}
