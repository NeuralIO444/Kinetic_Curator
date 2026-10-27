// engine/featherFan.js — Phase 2 creature system, slice S3: FEATHER FANS. Pure; no clock, and no chance
// beyond the seeded kernel channels (the 'skeleton' channel, keyed by (seed, creatureId, partId) — the
// same stream the bones themselves grow from, see partStream below).
//
// What this replaces: the moth's plumage used to be SCALES (geo_diamond_01) scattered over each wing's
// surface by a Poisson-disc sampler (creature.js's mothScatter) — points dealt inside a rectangle, each
// scale the same size, none of them knowing the wing had a shape. The fan GROWS the plumage instead:
// parts rooted along the wing's bone chain (engine/skeleton.js), root-short -> tip-long, angled to the
// chain's local direction (its curvature), each part long enough to overlap the next part's root, with
// ornaments pinned exactly on the joints. Plumage reads as grown, not scattered (the S3 done-line).
//
// The parts are a POOL, and the pool is data: four kinds (feather / plate / leaf / chevron), each naming
// an existing build-time atlas asset plus its drawing constants. Davis's procedural parts come first
// (Matt's approval, 2026-10-16): no geometry is built at runtime — a part is an asset id and numbers,
// and a hand-drawn SVG can replace a pool entry one-for-one later without touching the layout.
//
// Coordinates: everything here lives in WING-LOCAL space — the wing asset's own box units, centred, the
// frame hierarchy.js composes surface placements in. wingLocalChain() converts a skeleton chain into
// that frame through the wing's own anchor, so the fan lies on the bones by construction. In wing-local
// space the layout is a pure function of (seed, creatureId, chain): the flap beat and the traits rotate
// and scale the whole wing rigidly, so they never reach this module.
import { rngForIndex } from './kernel/rng.js';
import { fnv1a } from './skeleton.js';

/**
 * The part pool (data). axisDeg: the up-convention direction the asset's point faces at rotation 0
 * (0 = tip up, as authored; the chevron's apex points +x, so 90). widthRatio: drawn width per drawn
 * length. Assets are existing built-ins, chosen by shape: the feather is the veined petal (a vane with
 * a rachis line), the plate the plain pod, the leaf the tear petal, the chevron the geometric chevron.
 */
export const FAN_PARTS = Object.freeze({
  feather: Object.freeze({ asset: 'org_petal_02', axisDeg: 0, widthRatio: 0.42 }),
  plate: Object.freeze({ asset: 'org_pod_01', axisDeg: 0, widthRatio: 0.85 }),
  leaf: Object.freeze({ asset: 'org_petal_01', axisDeg: 0, widthRatio: 0.5 }),
  chevron: Object.freeze({ asset: 'geo_chev_01', axisDeg: 90, widthRatio: 0.8 }),
});

/** Parts per wing, by kind. Rooted parts (plate + feather + leaf) distribute over the chain's 3 bones
 *  in proportion to bone length; on the fixture moth that lands fore 10/8/6 and hind 9/7/6 per bone —
 *  inside the brief's 6-20 per bone envelope (asserted off the real layouts in the selfcheck). */
export const FAN_COUNTS = Object.freeze({
  fore: Object.freeze({ plate: 1, feather: 22, leaf: 1, chevron: 2 }), // 26 per fore wing
  hind: Object.freeze({ plate: 1, feather: 20, leaf: 1, chevron: 2 }), // 24 per hind wing
});

/** The fan's tuning (wing-local units / degrees). Named so Matt's review can move them. */
export const FAN = Object.freeze({
  overlap: 2.3, // a part's length as a multiple of the root spacing: > 1 is what makes roots overlap tips
  lenRoot: 0.55, // length profile at the root, as a fraction of the mean part length ...
  lenTip: 1.5, // ... and at the tip (root-short -> tip-long)
  centreAlong: 0.38, // a part's centre sits this far along its own length from its root (roots sink onto the bone)
  splayDeg: 10, // the fan's opening: part direction rotates this much across the whole chain
  jitterLen: 0.15, // seeded per-part length variation, +-15%
  jitterDeg: 2, // seeded per-part angle variation, +-2 degrees
  ornLen: 1.15, // an ornament's length as a multiple of the root spacing
  ornSink: 0.08, // an ornament's centre sits this far along its length from the joint it is pinned to
});

const rad = (deg) => (deg * Math.PI) / 180;
const finite = (v, d) => (Number.isFinite(v) ? v : d);

/** A unit vector `deg` degrees clockwise from straight up, in canvas orientation (y down). */
function dirFromUp(deg) {
  const r = rad(deg);
  return { x: Math.sin(r), y: -Math.cos(r) };
}

/** The seeded stream for one fan part of one creature — skeleton.js's partStream, same keying. */
function partStream(seed, creatureId, partId, seedOffsets) {
  return rngForIndex(seed, 'skeleton', fnv1a(`${creatureId}:${partId}`), seedOffsets);
}

/**
 * One wing chain of a built skeleton, expressed in that wing's local frame.
 *
 * The skeleton lives in its own local units (body landmarks scaled by the body trait, chain lengths by
 * the wing trait); dividing by the body trait lands in body-box units, and the wing's anchor (the same
 * anchor mothRecipe computed: centre + rotation + uniform scale k) inverts into wing-local units. The
 * chain's root lands exactly on the wing's own root attach offset — the fan starts where the wing
 * starts, by construction, not by tuning.
 *
 * @param skel      a buildSkeleton() result
 * @param chainId   'fore' | 'hind' (the plan's chain ids)
 * @param side      'R' | 'L'
 * @param anchor    the wing's anchor from the recipe ({ dx, dy, dRot, dScaleX })
 * @param bodyTrait the moth's body trait (the skeleton's body scale), default 1
 * @returns [{ base, tip, len, dirDeg }] in wing-local units; dirDeg is the up-convention direction.
 */
export function wingLocalChain(skel, chainId, side, anchor, bodyTrait = 1) {
  const bones = ((skel && skel.bones) || []).filter((b) => b.chain === chainId && b.side === side);
  const tb = Number.isFinite(bodyTrait) && bodyTrait !== 0 ? bodyTrait : 1;
  const k = anchor && Number.isFinite(anchor.dScaleX) && anchor.dScaleX !== 0 ? anchor.dScaleX : 1;
  const th = rad(finite(anchor && anchor.dRot, 0));
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const cx = finite(anchor && anchor.dx, 0);
  const cy = finite(anchor && anchor.dy, 0);
  const toLocal = (p) => {
    const bx = p.x / tb - cx;
    const by = p.y / tb - cy;
    return { x: (bx * cos + by * sin) / k, y: (-bx * sin + by * cos) / k };
  };
  return bones.map((b) => {
    const base = toLocal(b.base);
    const tip = toLocal(b.tip);
    const dx = tip.x - base.x;
    const dy = tip.y - base.y;
    return { base, tip, len: Math.hypot(dx, dy), dirDeg: (Math.atan2(dx, -dy) * 180) / Math.PI };
  });
}

/** Split `total` across segments in proportion to their lengths (largest remainder; deterministic). */
function distribute(total, lens) {
  const sum = lens.reduce((a, b) => a + b, 0) || 1;
  const raw = lens.map((l) => (total * l) / sum);
  const out = raw.map((r) => Math.floor(r));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let n = 0; left > 0 && order.length; n = (n + 1) % order.length) {
    out[order[n][1]] += 1;
    left -= 1;
  }
  return out;
}

/**
 * Lay out one wing's fan on its chain. Pure: the same (seed, creatureId, chain) always grows the same
 * fan, which is what makes the layout hashable and a recorded take replayable.
 *
 * @param chain      wingLocalChain()'s segments for ONE wing
 * @param counts     FAN_COUNTS.fore / .hind — the recipe declares the same numbers, so the hierarchy's
 *                   item count and the layout agree by construction
 * @param handedness +1 for a right wing, -1 for a left: the fan's opening (the splay and the angle
 *                   jitter) mirrors with the wing, so a left layout computed on the left bones equals
 *                   the right layout mirrored — the moth's symmetry, kept in the angles as well as the
 *                   positions. (The builder mirrors the right layout's placements; featherFan's
 *                   selfcheck proves the two routes agree.)
 * @returns { plate, feather, leaf, chevron } — placements per kind, root -> tip in order, each
 *          { dx, dy, dRot, dScaleX, dScaleY } in wing-local units (the hierarchy scatter shape)
 */
export function fanPlacements({
  chain,
  seed = 0,
  creatureId = 'c0',
  chainKey = 'fore',
  counts,
  seedOffsets = null,
  handedness = 1,
} = {}) {
  const out = { plate: [], feather: [], leaf: [], chevron: [] };
  const segs = (chain || []).filter((s) => s && s.base && s.tip);
  if (!segs.length || !counts) return out;
  const totalLen = segs.reduce((a, s) => a + s.len, 0);
  if (!(totalLen > 0)) return out;
  const rooted = counts.plate + counts.feather + counts.leaf;
  const spacing = totalLen / Math.max(1, rooted);
  const perSeg = distribute(
    rooted,
    segs.map((s) => s.len),
  );

  let g = 0; // the rooted parts' global index, root -> tip
  segs.forEach((seg, s) => {
    for (let j = 0; j < perSeg[s]; j += 1) {
      const stream = partStream(seed, creatureId, `fan/${chainKey}/${g}`, seedOffsets);
      const rLen = stream();
      const rAng = stream();
      const rPos = stream();
      const frac = rooted === 1 ? 1 : g / (rooted - 1); // root -> tip parameter over the whole chain
      const u = Math.min(1, Math.max(0, (j + 0.5) / perSeg[s] + ((rPos - 0.5) * 0.6) / perSeg[s]));
      const rootPt = {
        x: seg.base.x + (seg.tip.x - seg.base.x) * u,
        y: seg.base.y + (seg.tip.y - seg.base.y) * u,
      };
      const len =
        spacing *
        FAN.overlap *
        (FAN.lenRoot + (FAN.lenTip - FAN.lenRoot) * frac) *
        (1 + (rLen - 0.5) * 2 * FAN.jitterLen);
      const dir = seg.dirDeg + handedness * ((frac - 0.5) * FAN.splayDeg + (rAng - 0.5) * 2 * FAN.jitterDeg);
      const kind = g === 0 ? 'plate' : g === rooted - 1 ? 'leaf' : 'feather';
      const part = FAN_PARTS[kind];
      const d = dirFromUp(dir);
      out[kind].push({
        dx: rootPt.x + d.x * len * FAN.centreAlong,
        dy: rootPt.y + d.y * len * FAN.centreAlong,
        dRot: dir - part.axisDeg,
        dScaleX: (len * part.widthRatio) / 100,
        dScaleY: len / 100,
      });
      g += 1;
    }
  });

  // Ornaments pinned to the joints: one per interior joint first (the moth's chains have exactly
  // FAN_COUNTS.chevron of those), then the tip, then segment midpoints, until the count is met.
  const spots = [];
  for (let s = 0; s + 1 < segs.length; s += 1) spots.push({ pt: segs[s].tip, dir: segs[s + 1].dirDeg });
  if (segs.length) spots.push({ pt: segs[segs.length - 1].tip, dir: segs[segs.length - 1].dirDeg });
  for (let s = 0; spots.length < counts.chevron && s < segs.length; s += 1) {
    spots.push({
      pt: { x: (segs[s].base.x + segs[s].tip.x) / 2, y: (segs[s].base.y + segs[s].tip.y) / 2 },
      dir: segs[s].dirDeg,
    });
  }
  const orn = FAN_PARTS.chevron;
  for (let n = 0; n < Math.min(counts.chevron, spots.length); n += 1) {
    const stream = partStream(seed, creatureId, `fan/${chainKey}/orn/${n}`, seedOffsets);
    const dir = spots[n].dir + handedness * (stream() - 0.5) * 2 * FAN.jitterDeg;
    const len = spacing * FAN.ornLen;
    const d = dirFromUp(dir);
    out.chevron.push({
      dx: spots[n].pt.x + d.x * len * FAN.ornSink,
      dy: spots[n].pt.y + d.y * len * FAN.ornSink,
      dRot: dir - orn.axisDeg,
      dScaleX: (len * orn.widthRatio) / 100,
      dScaleY: len / 100,
    });
  }
  return out;
}

/**
 * Mirror a placement list across the wing-local vertical axis (the left wing's fan from the right's).
 * Position and rotation negate — exact for an asset symmetric about its own vertical axis (the plate
 * and the leaf are; the feather keeps its authored curl on both wings, as the wing stamp itself does).
 * A part whose point faces +x at rest (the chevron, axisDeg 90) needs a further half-turn: its mirror
 * rotation is -dRot - 2*axisDeg, which for the chevron's point-symmetric shape draws identically to
 * the naive mirror but keeps the stored rotation equal to the left chain's own layout.
 */
export function mirrorPlacements(list, axisDeg = 0) {
  const mir = (v) => (v === 0 ? 0 : -v);
  const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
  return (list || []).map((p) => ({
    dx: mir(p.dx),
    dy: p.dy,
    dRot: axisDeg ? wrap(-p.dRot - 2 * axisDeg) : mir(p.dRot),
    dScaleX: p.dScaleX,
    dScaleY: p.dScaleY,
  }));
}

/**
 * A stable hash of a fan layout: FNV-1a over the placements, numbers quantised to 1e-4 (the skeleton
 * hash's rule — cross-engine trig dust cannot split it; any real change does).
 */
export function fanHash(byKind) {
  const q = (v) => Math.round(v * 10000) / 10000;
  let s = '';
  for (const kind of ['plate', 'feather', 'leaf', 'chevron']) {
    s += `${kind}:`;
    for (const p of (byKind && byKind[kind]) || [])
      s += `${q(p.dx)},${q(p.dy)},${q(p.dRot)},${q(p.dScaleX)},${q(p.dScaleY)};`;
  }
  return fnv1a(s).toString(16).padStart(8, '0');
}
