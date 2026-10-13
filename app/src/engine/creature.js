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
import { poissonPointSet } from './kernel/sample/poisson.js';
import { attachPointsFor } from './autoAttach.js';

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
export function mothRecipe({ bodyPoints, wingPoints, beat = 0, hind = 0 }) {
  const root = pointToward(wingPoints, 'bottom'); // the wing's own attach point nearest its base, from its centre
  const k = MOTH.wingScale / MOTH.bodyScale; // a wing's unit measured in body units
  const anchorFor = (side, sign) => {
    const p = pointToward(bodyPoints, side);
    const theta = sign * (MOTH.spread + beat);
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
    const theta = sign * (MOTH.hindSpread - beat * MOTH.hindFlap);
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
  const pointsOf = (pool, assetAttach, id) => {
    const asset = pool.find((a) => a && a.id === id);
    return asset ? attachPointsFor(asset, assetAttach) : [];
  };
  return {
    append(input, entries, pool) {
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
      const vivid = swatches.reduce((best, c) => (chroma(c) > chroma(best) ? c : best), swatches[0] || ink);
      // the hind pair takes the next most vivid swatch, so the two pairs read apart
      const others = swatches.filter((c) => c !== vivid);
      const vivid2 = others.reduce((best, c) => (chroma(c) > chroma(best) ? c : best), others[0] || vivid);
      const colours = { [MOTH_PARTS.body]: [ink, vivid], [MOTH_PARTS.wing]: [vivid, ink], [MOTH_PARTS.mark]: [ink, vivid] };
      const hindColours = { [MOTH_PARTS.wing]: [vivid2, ink], [MOTH_PARTS.mark]: [ink, vivid2] };
      assetCache.clear();
      const bodyPoints = pointsOf(pool, input.assetAttach, MOTH_PARTS.body);
      const wingPoints = pointsOf(pool, input.assetAttach, MOTH_PARTS.wing);
      const t = Number.isFinite(input.loopTimeMs) ? input.loopTimeMs : 0;
      const beat = MOTH.flap * Math.sin((2 * Math.PI * t) / MOTH.flapMs);
      const extra = [];
      for (let i = 0; i < pins.length; i++) {
        const pin = pins[i];
        if (!formed[i] || !pin || !Number.isFinite(pin.x) || !Number.isFinite(pin.y)) { ages[i] = 0; pair2[i] = 0; continue; }
        ages[i] = (ages[i] || 0) + 1;
        // the second pair eases toward what the crowd decided (1 pair = none, 2 = full), a step per resolver frame
        const want = input.dishLimbs && input.dishLimbs[i] >= 2 ? 1 : 0;
        const have = pair2[i] || 0;
        pair2[i] = want > have ? Math.min(1, have + 1 / MOTH.pairFrames) : Math.max(0, have - 1 / MOTH.pairFrames);
        const g = Math.max(0.02, easeOut(Math.min(1, ages[i] / MOTH.growFrames)));
        const recipe = mothRecipe({ bodyPoints, wingPoints, beat: beat * g, hind: easeOut(pair2[i]) });
        const { items } = expandHierarchy(
          { x: pin.x, y: pin.y, rot: 0, scaleX: MOTH.bodyScale * g, scaleY: MOTH.bodyScale * g, part: 'body', key: `m${i}` },
          recipe,
          { seed: input.seed, scatter: mothScatter(input.seed >>> 0, input.seedOffsets || null, i) },
        );
        const mark = (it, color, accent, scale, tag) => ({
          x: it.x, y: it.y, scale: it.scaleX * scale, scaleY: it.scaleY * scale, rotation: it.rotation, alpha: 100,
          assetId: it.assetId, color, accent, key: `creature:${i}:${tag}${it._hier.path}`, zTier: 0, seedOffset: 0,
          glass: false, _creature: true,
        });
        // halos first (under everything of this creature), then the parts in order
        for (const it of items) if (it.assetId !== MOTH_PARTS.mark) extra.push(mark(it, bg, bg, MOTH.halo, 'halo:'));
        for (const it of items) {
          const [color, accent] = (it._hier.path.includes('hind') ? hindColours[it.assetId] : null) || colours[it.assetId];
          extra.push(mark(it, color, accent, 1, ''));
        }
      }
      ages.length = pins.length;
      pair2.length = pins.length;
      if (extra.length) top.items = [...top.items, ...extra];
    },
    dispose() { ages.length = 0; pair2.length = 0; assetCache.clear(); },
  };
}
