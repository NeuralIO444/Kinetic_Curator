// engine/creature.js — #1355 / #1206 Phase 3 step 4: the first creature, the MOTH. Pure but for its own grow-in ages.
//
// A formed pin (curator/formation.js decided it) becomes a creature built from three parts by hierarchy.js:
//   body   the root, at the pin
//   wing   the LIMB: two, each attached at one of the body's ATTACH points (the wet lab's points, so the artist's
//          edits move where the wings join)
//   mark   the HANDS: scales, scattered on each wing with the Poisson sampler, in wing-local space
// The result is more marks in the same item shape the renderer already draws. The renderer never learns a hierarchy
// exists. Everything is a function of the resolver's input and its own frame count: no clock, no chance, so a
// recorded take replays the same moth.
//
// The pilot parts are existing built-in assets (decision 4: three parts first). Which assets, and the numbers below,
// are the first look, not the last: they are named constants so Matt's review can move them.
import { expandHierarchy } from './hierarchy.js';
import { buildSkeleton, transformSkeleton, MOTH_SKELETON_PLAN } from './skeleton.js';
import { poissonPointSet } from './kernel/sample/poisson.js';
import { attachPointsFor } from './autoAttach.js';
import { kinemePhase } from '../data/kinemes.js';
import { applyLean } from './kernel/color/index.js';
import { snapPair, snaps } from './groundSnap.js';
import { nudgeAxis } from './groundNudge.js';

export const MOTH_PARTS = Object.freeze({ body: 'org_pod_02', wing: 'org_leaf_02', mark: 'geo_diamond_01' });
export const MOTH = Object.freeze({
  bodyScale: 1.7, // canvas px per asset unit (an asset box is 100 units)
  wingScale: 1.7,
  markScale: 0.26,
  marksPerWing: 10,
  spread: 58, // degrees each wing is turned out from straight up
  flap: 9, // degrees of wing beat
  flapMs: 1700, // one beat, on the loop clock
  growFrames: 45, // resolver frames from spore to full size
  /** Where scales may sit, in wing units from the wing's centre: inside the leaf's outline. */
  markBounds: Object.freeze({ x0: -8, y0: -26, x1: 8, y1: 26 }),
  markRadius: 9, // wing units between scales
  // The second pair (step 5): hind wings, smaller, set lower on the body and turned further down, beating against the
  // fore pair. They grow in and shrink out over pairFrames as the crowd (curator/limbs.js) gives and takes them.
  hindScale: 0.78, // of a fore wing
  hindSpread: 122, // degrees from straight up: pointing down and out
  hindAlong: 0.45, // where on the body: this far from the side point toward the bottom point
  hindFlap: 0.7, // of the fore pair's beat, in counterphase
  marksPerHind: 6,
  pairFrames: 45, // resolver frames for a pair to grow in or out
  halo: 1.14, // the bg-coloured outline under body and wings, as a multiple of their size: it lifts the moth off a busy dish
});

const CENTRE = 50;
const TAU = Math.PI * 2;

/**
 * A moth's TRAITS: the small recorded set a persona may shift (Phase 4, #1356; Matt 2026-10-13, option B: shape and
 * colour). The defaults ARE today's moth: a creature with no traits looks exactly as before. Every value is clamped to
 * its range, so a hostile or drifting source can never make a moth that is not a moth (the base type never leaves).
 *   spread  degrees added to the fore wings' spread (the attachment angle); the hind pair follows at half
 *   wing    multiplier on the wings' size
 *   body    multiplier on the body's size
 *   swatch  which of the palette's swatches the wings take, most vivid first (0) to the fourth (3): "material bias"
 */
export const TRAIT_DEFAULTS = Object.freeze({ spread: 0, wing: 1, body: 1, swatch: 0 });
export const TRAIT_RANGES = Object.freeze({
  spread: Object.freeze({ min: -18, max: 18 }),
  wing: Object.freeze({ min: 0.8, max: 1.25 }),
  body: Object.freeze({ min: 0.85, max: 1.2 }),
  swatch: Object.freeze({ min: 0, max: 3 }),
});

/** Clamp anything to a valid trait set. Missing or non-finite fields read as the default; swatch is a whole number. */
export function normalizeTraits(raw) {
  const out = { ...TRAIT_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(TRAIT_DEFAULTS)) {
    const v = raw[key];
    if (!Number.isFinite(v)) continue;
    const r = TRAIT_RANGES[key];
    out[key] = Math.min(r.max, Math.max(r.min, key === 'swatch' ? Math.round(v) : v));
  }
  return out;
}

/**
 * HOVER (Matt, 2026-10-13, option A): the moth drifts near its pin the way every asset does. It reads the SAME dials
 * and the SAME anchored clock as the assets' living-motion floor (engine/kineme.js): DRIFT sets how far it wanders,
 * BREATH how much it swells, and KINEME RATE / pause / the governor's freeze stop it exactly when they stop the
 * assets. The pin stays its home: the offset is measured from rest (anchored), so the first frame sits on the pin.
 */
export const HOVER = Object.freeze({
  reach: 0.06, // wander, as a fraction of the smaller canvas side, at DRIFT = 1 (so about 21 px at the default 0.5)
  tilt: 12, // degrees of sway of the whole body, at DRIFT = 1
  hzX: 0.09, // a slow loop: about 11 s across,
  hzY: 0.12, // 8 s up and down,
  hzTilt: 0.15, // 7 s of sway; the three never line up
  breathDepth: 0.09, // the floor's own breath: +-9% size at BREATH = 1
  breathHz: 0.11,
});

const num01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * The dish's ground treatment for one moth (Matt, 2026-10-13, option A): the moth obeys the SAME dials the marks do
 * (GROUND lean, EDGE nudge, SNAP; SHADOW is the layer's and reaches it for free), through the same functions, so it
 * sits in the picture the way the marks do. `ground` is `{ dish, lean, nudge, snap, shadow }` where `dish` carries
 * { ground, groundRoles, groundCell } for this layer, or null when the layer rests on no ground (then, like a mark, the
 * moth gets nothing and is exactly as before).
 *
 * Returns { dx, dy, recolor(color, accent), halo } for a moth centred at (x, y): the EDGE nudge as an offset, the
 * recolouring (SNAP takes a tile colour exactly, else LEAN mixes toward the tile's colour), and the halo colour, which
 * becomes the tile's own colour so the outline stops reading as a sticker.
 */
export function groundTreatment(ground, x, y, slot, seed, seedOffsets = null) {
  const out = { dx: 0, dy: 0, recolor: (c, a) => [c, a], halo: null };
  if (!ground || !ground.dish) return out;
  const d = ground.dish;
  const lean = num01(ground.lean); const snap = num01(ground.snap); const nudge = num01(ground.nudge);
  if (nudge > 0 && typeof d.groundCell === 'function') {
    const c = d.groundCell(x, y);
    if (c && c.size > 0) { out.dx = nudgeAxis(c.u, nudge) * c.size; out.dy = nudgeAxis(c.v, nudge) * c.size; }
  }
  const tile = (lean > 0 || snap > 0 || num01(ground.shadow) > 0) && typeof d.ground === 'function' ? d.ground(x, y) : null;
  const roles = snap > 0 && typeof d.groundRoles === 'function' ? d.groundRoles(x, y) : null;
  // the whole moth snaps or does not, by its own slot in the same fixed per-seed set the marks use (an index past them)
  const snapped = !!(roles && roles.length) && snaps(seed >>> 0, 0x40000 + slot, snap, seedOffsets);
  if (snapped) out.recolor = (c, a) => { const s = snapPair(c, a, roles); return [s.color, s.accent]; };
  else if (lean > 0 && typeof tile === 'string') out.recolor = (c, a) => [applyLean(c, tile, lean), a];
  if (typeof tile === 'string') out.halo = tile;
  return out;
}

/**
 * One creature's hover pose from the living-motion context the resolver already builds for its layer
 * ({ driverSec, amounts: { breath, drift }, canvasW, canvasH }, or null when nothing moves).
 * Pure. Returns { dx, dy, rot, scale }: a position offset (scene units), a tilt (degrees) and a size multiplier.
 */
export function hoverPose(motion, seed, pinIndex) {
  const rest = { dx: 0, dy: 0, rot: 0, scale: 1 };
  if (!motion || !Number.isFinite(motion.driverSec)) return rest;
  const t = motion.driverSec;
  const a = motion.amounts || {};
  const drift = num01(a.drift);
  const breath = num01(a.breath);
  const m = Math.min(Number(motion.canvasW) || 0, Number(motion.canvasH) || 0);
  const u = (tag) => kinemePhase(seed, `moth:${tag}${pinIndex}`);
  // anchored: each wave is measured from where it stood at driver time 0, so the creature is on its pin at rest
  const wave = (hz, tag) => { const p = u(tag); return Math.sin(TAU * (hz * t + p)) - Math.sin(TAU * p); };
  if (drift > 0 && m > 0) {
    rest.dx = drift * HOVER.reach * m * wave(HOVER.hzX, 'x');
    rest.dy = drift * HOVER.reach * m * wave(HOVER.hzY, 'y');
    rest.rot = drift * HOVER.tilt * wave(HOVER.hzTilt, 'r');
  }
  if (breath > 0) rest.scale = 1 + breath * HOVER.breathDepth * wave(HOVER.breathHz, 'b');
  return rest;
}
const rad = (deg) => (deg * Math.PI) / 180;

/** The point of `points` furthest toward a side, as an offset from the asset's centre. No points: the centre. */
export function pointToward(points, side) {
  if (!Array.isArray(points) || points.length === 0) return { x: 0, y: 0 };
  const score = { right: (p) => p.x, left: (p) => -p.x, bottom: (p) => p.y, top: (p) => -p.y }[side];
  let best = points[0];
  for (const p of points) if (score(p) > score(best)) best = p;
  return { x: best.x - CENTRE, y: best.y - CENTRE };
}

/**
 * The parts recipe for one moth, from the body's and wing's attach points. `beat` is the wing angle in degrees
 * (positive opens the wings). Each wing's ROOT point lands on a body attach point: the wing's centre is found by
 * walking back from that point along the wing's own direction.
 */
export function mothRecipe({ bodyPoints, wingPoints, beat = 0, hind = 0, traits = TRAIT_DEFAULTS }) {
  const t = normalizeTraits(traits);
  const root = pointToward(wingPoints, 'bottom'); // the wing's own attach point nearest its base, from its centre
  // a wing's unit measured in body units: the wing trait sizes the wing, the body trait sizes the body, neither the other
  const k = (MOTH.wingScale * t.wing) / (MOTH.bodyScale * t.body);
  const anchorFor = (side, sign) => {
    const p = pointToward(bodyPoints, side);
    const theta = sign * (MOTH.spread + t.spread + beat);
    const c = Math.cos(rad(theta));
    const s = Math.sin(rad(theta));
    // wing centre = root point on the body - R(theta) * (wing root offset), in body units
    return { dx: p.x - (root.x * c - root.y * s) * k, dy: p.y - (root.x * s + root.y * c) * k, dRot: theta, dScaleX: k, dScaleY: k };
  };
  // The hind pair: only in the recipe while it has any size, so one pair is exactly what step 4 drew.
  const withHind = hind > 0.02;
  const hindAnchor = (side, sign) => {
    const a = pointToward(bodyPoints, side);
    const b = pointToward(bodyPoints, 'bottom');
    const p = { x: a.x + (b.x - a.x) * MOTH.hindAlong, y: a.y + (b.y - a.y) * MOTH.hindAlong };
    const theta = sign * (MOTH.hindSpread + t.spread * 0.5 - beat * MOTH.hindFlap);
    const c = Math.cos(rad(theta));
    const s = Math.sin(rad(theta));
    const k2 = k * MOTH.hindScale * hind;
    return { dx: p.x - (root.x * c - root.y * s) * k2, dy: p.y - (root.x * s + root.y * c) * k2, dRot: theta, dScaleX: k2, dScaleY: k2 };
  };
  const parts = {
    body: {
      asset: MOTH_PARTS.body,
      anchors: { wingR: anchorFor('right', 1), wingL: anchorFor('left', -1) },
      children: [{ part: 'wing', anchor: 'wingR' }, { part: 'wing', anchor: 'wingL' }],
    },
    wing: {
      asset: MOTH_PARTS.wing,
      localBounds: MOTH.markBounds,
      children: [{ part: 'mark', anchor: 'surface', count: MOTH.marksPerWing, key: 'marks' }],
    },
    mark: { asset: MOTH_PARTS.mark },
  };
  if (withHind) {
    parts.body.anchors.hindR = hindAnchor('right', 1);
    parts.body.anchors.hindL = hindAnchor('left', -1);
    parts.body.children.push({ part: 'hind', anchor: 'hindR' }, { part: 'hind', anchor: 'hindL' });
    parts.hind = {
      asset: MOTH_PARTS.wing,
      localBounds: MOTH.markBounds,
      children: [{ part: 'mark', anchor: 'surface', count: MOTH.marksPerHind, key: 'hmarks' }],
    };
  }
  return { parts };
}

/** FNV-1a: a stable 32-bit number from a string. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * The scatter hierarchy.js asks for, backed by the Poisson-disc sampler: one set per creature, the left wing its
 * mirror image (a moth is symmetric), each scale a little turned and sized.
 */
function mothScatter(seed, seedOffsets, pinIndex) {
  const k = MOTH.markScale / MOTH.wingScale;
  return (key, count, b) => {
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    const hindSet = String(key).includes('hmarks');
    const set = poissonPointSet((seed ^ hash32(`moth${pinIndex}${hindSet ? 'h' : ''}`)) >>> 0, count, w, h, seedOffsets, MOTH.markRadius);
    const left = String(key).includes('wingL') || String(key).includes('hindL');
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
      const p = set[i % set.length];
      const dx = b.x0 + p.x;
      out[i] = { dx: left ? -dx : dx, dy: b.y0 + p.y, dRot: left ? -45 : 45, dScaleX: k, dScaleY: k };
    }
    return out;
  };
}

const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);

/** How colourful a #rrggbb is: max channel minus min channel. Anything else reads 0. */
function chroma(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return 0;
  const v = parseInt(m[1], 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  return Math.max(...c) - Math.min(...c);
}

/**
 * The builder the resolver owns. `append(input, entries, pool)` adds the moths to the TOP content layer's items.
 * With no pin formed it does nothing at all (byte-identical, and the grow-in ages reset).
 */
export function createCreatureBuilder() {
  const ages = []; // frames each pin's creature has been formed
  const pair2 = []; // how far each pin's second pair has grown in: 0 (none) to 1 (full)
  const assetCache = new Map(); // assetId -> its attach points (keyed also by the svg and the artist's edit)
  let wingBeat = null; // #1469 — the last appended frame's wing beat as 0..1 openness; null when no moth was appended
  let frameSkeletons = []; // Phase 2 S1 — the last appended frame's skeletons (world space), per pin; null where unformed
  const pointsOf = (pool, assetAttach, id) => {
    const asset = pool.find((a) => a && a.id === id);
    return asset ? attachPointsFor(asset, assetAttach) : [];
  };
  return {
    append(input, entries, pool, motionFor = null, groundFor = null) {
      wingBeat = null; // #1469 — re-earned below only if this call actually appends a moth
      frameSkeletons = []; // S1 — likewise: only a frame that appends moths publishes skeletons
      const pins = input && input.dishPins;
      const formed = input && input.dishFormed;
      if (!Array.isArray(pins) || !Array.isArray(formed) || !formed.some(Boolean)) {
        if (ages.length) ages.length = 0;
        if (pair2.length) pair2.length = 0;
        return;
      }
      let top = null;
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e && !e.isFx && !e.isPattern && Array.isArray(e.items)) { top = e; break; }
      }
      if (!top) return;
      const swatches = (top.palette && top.palette.swatches) || [];
      const sw = (i) => swatches.length ? swatches[((i % swatches.length) + swatches.length) % swatches.length] : '#ffffff';
      // Read against the dish: body and wings in the palette's ink, a bg-coloured halo under them, scales in a swatch.
      const pal = top.palette || {};
      const ink = typeof pal.ink === 'string' ? pal.ink : sw(0);
      const bg = typeof pal.bg === 'string' ? pal.bg : '#000000';
      // Wings take the most vivid swatch (the dish is full of leaves: the moth must not read as more of them).
      // The palette ranked most vivid first (stable). The wings take rank `swatch` (0 = the most vivid: today's moth);
      // the hind pair takes the next rank, so the two pairs read apart.
      const ranked = swatches.map((c, n) => ({ c, n })).sort((a, b) => chroma(b.c) - chroma(a.c) || a.n - b.n).map((e) => e.c);
      const pick = (r) => ranked[Math.min(ranked.length - 1, Math.max(0, r))] || ink;
      assetCache.clear();
      const bodyPoints = pointsOf(pool, input.assetAttach, MOTH_PARTS.body);
      const wingPoints = pointsOf(pool, input.assetAttach, MOTH_PARTS.wing);
      const t = Number.isFinite(input.loopTimeMs) ? input.loopTimeMs : 0;
      const beat = MOTH.flap * Math.sin((2 * Math.PI * t) / MOTH.flapMs);
      // the layer's living-motion context (null when nothing moves, when the instrument is held, or under reduced motion)
      const motion = input.reducedMotion || typeof motionFor !== 'function' ? null : motionFor(top);
      // the dials and ground this layer rests on (null when it rests on none: the moth is exactly as before)
      const ground = typeof groundFor === 'function' ? groundFor(top) : null;
      const extra = [];
      for (let i = 0; i < pins.length; i++) {
        const pin = pins[i];
        if (!formed[i] || !pin || !Number.isFinite(pin.x) || !Number.isFinite(pin.y)) { ages[i] = 0; pair2[i] = 0; frameSkeletons[i] = null; continue; }
        ages[i] = (ages[i] || 0) + 1;
        // the second pair eases toward what the crowd decided (1 pair = none, 2 = full), a step per resolver frame
        const want = input.dishLimbs && input.dishLimbs[i] >= 2 ? 1 : 0;
        const have = pair2[i] || 0;
        pair2[i] = want > have ? Math.min(1, have + 1 / MOTH.pairFrames) : Math.max(0, have - 1 / MOTH.pairFrames);
        const g = Math.max(0.02, easeOut(Math.min(1, ages[i] / MOTH.growFrames)));
        const hover = hoverPose(motion, top.morphSeed ?? input.seed, i);
        // this moth's traits (a persona's small shifts, recorded in the input); none given = today's moth
        const traits = normalizeTraits(input.dishTraits && input.dishTraits[i]);
        const vivid = pick(traits.swatch);
        const vivid2 = pick(traits.swatch + 1);
        const colours = { [MOTH_PARTS.body]: [ink, vivid], [MOTH_PARTS.wing]: [vivid, ink], [MOTH_PARTS.mark]: [ink, vivid] };
        const hindColours = { [MOTH_PARTS.wing]: [vivid2, ink], [MOTH_PARTS.mark]: [ink, vivid2] };
        const hindAmt = easeOut(pair2[i]);
        const recipe = mothRecipe({ bodyPoints, wingPoints, beat: beat * g, hind: hindAmt, traits });
        // the ground beneath the PIN (its home), so a hovering moth does not change colour with every wobble
        const gt = groundTreatment(ground, pin.x, pin.y, i, input.seed, input.seedOffsets || null);
        // Phase 2 S1 — this moth's SKELETON, built from the same attach points and the same angles the recipe
        // just used (so the frame provably describes the moth being drawn), placed by the root transform the
        // hierarchy root gets below. Published via lastSkeletons() for the ?debug=skeleton overlay; the drawn
        // items do not read it yet — skinning is S2. Nothing about the items changes.
        frameSkeletons[i] = transformSkeleton(buildSkeleton({
          seed: input.seed, creatureId: `m${i}`, plan: MOTH_SKELETON_PLAN, attach: bodyPoints,
          pose: {
            bodyScale: traits.body, wingScale: traits.wing,
            foreDirDeg: MOTH.spread + traits.spread + beat * g,
            hindDirDeg: MOTH.hindSpread + traits.spread * 0.5 - beat * MOTH.hindFlap * g,
            hindAmount: hindAmt,
          },
          seedOffsets: input.seedOffsets || null,
        }), { x: pin.x + hover.dx + gt.dx, y: pin.y + hover.dy + gt.dy, rotDeg: hover.rot, scale: MOTH.bodyScale * traits.body * g * hover.scale });
        const { items } = expandHierarchy(
          { x: pin.x + hover.dx + gt.dx, y: pin.y + hover.dy + gt.dy, rot: hover.rot, scaleX: MOTH.bodyScale * traits.body * g * hover.scale, scaleY: MOTH.bodyScale * traits.body * g * hover.scale, part: 'body', key: `m${i}` },
          recipe,
          { seed: input.seed, scatter: mothScatter(input.seed >>> 0, input.seedOffsets || null, i) },
        );
        const mark = (it, color, accent, scale, tag) => ({
          x: it.x, y: it.y, scale: it.scaleX * scale, scaleY: it.scaleY * scale, rotation: it.rotation, alpha: 100,
          assetId: it.assetId, color, accent, key: `creature:${i}:${tag}${it._hier.path}`, zTier: 0, seedOffset: 0,
          glass: false, _creature: true,
        });
        // halos first (under everything of this creature), then the parts in order
        const haloColour = gt.halo || bg;
        for (const it of items) if (it.assetId !== MOTH_PARTS.mark) extra.push(mark(it, haloColour, haloColour, MOTH.halo, 'halo:'));
        for (const it of items) {
          const [c0, a0] = (it._hier.path.includes('hind') ? hindColours[it.assetId] : null) || colours[it.assetId];
          const [color, accent] = gt.recolor(c0, a0);
          extra.push(mark(it, color, accent, 1, ''));
        }
      }
      ages.length = pins.length;
      pair2.length = pins.length;
      frameSkeletons.length = pins.length;
      // #1469 — publish the wing beat this frame actually used (the global beat above, before the
      // per-moth grow-in scaling), as 0..1 openness, for the MOTION strip's MOTH bar. No moth
      // appended → stays null: the bar is absent, not zeroed.
      if (extra.length) wingBeat = (beat / MOTH.flap + 1) / 2;
      if (extra.length) top.items = [...top.items, ...extra];
    },
    /** #1469 — the last appended frame's wing beat (0..1 openness), or null when no moths are on stage. */
    lastWingBeat() { return wingBeat; },
    /** Phase 2 S1 — the last appended frame's skeletons in world (scene) space, per pin; null where no moth. */
    lastSkeletons() { return frameSkeletons; },
    dispose() { ages.length = 0; pair2.length = 0; assetCache.clear(); wingBeat = null; frameSkeletons = []; },
  };
}
