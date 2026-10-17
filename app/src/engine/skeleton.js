// engine/skeleton.js — Phase 2 creature system, slice S1: the SKELETON every creature is built on. Pure; no
// clock, and no chance beyond the seeded kernel channels (the 'skeleton' channel, keyed by (seed, creatureId,
// partId) — see partStream below).
//
// The as-built moth (engine/creature.js, docs/design/creatures-spec.md) is three rigid stamps — body, wing, scales —
// assembled by hierarchy.js. This module is the empty frame under it: a chain of SPINE bones from the body's tail
// point to its head point, and BONE CHAINS out each side (the moth: a fore wing chain and a hind wing chain per
// side, shoulder -> elbow -> tip). Later slices hang skin on these bones (S2's mesh warp binds mesh vertices to a
// bone and a span along it — every bone therefore carries its rest base/tip, its direction, and its angle against
// its parent), pose them (S5), and grow other types from other plans (S6-S8). S1 only builds the frame, proves it
// deterministic, and draws it behind ?debug=skeleton.
//
// Construction notes:
//   - Bones are built in CREATURE-LOCAL space: the body asset's own box units (0..100), centred on (0,0), the same
//     centred units creature.js's anchors live in. transformSkeleton() places a built skeleton anywhere.
//   - The LEFT half and the spine are constructed; the RIGHT half is mirrorBone() of the left, never independently
//     built — so mirror symmetry is exact by construction, not by two computations agreeing.
//   - Depth audit (Matt's S1 kill question): expressed as nested hierarchy.js children, a 5-segment spine reaches
//     hierarchy depth 5 and a 3-bone chain off spine joint 3 reaches 6 — past HIER_MAX_DEPTH (4). So bones are NOT
//     hierarchy children: this module composes the same parent x local math itself and emits world (local-space)
//     bone geometry directly, FLATTENED. Skin parts in later slices hang off bones as flat items at hierarchy
//     depth <= 2, exactly like today's body/wing/marks (0/1/2). The cap is untouched; hierarchy.js is unchanged.
//   - The hash quantises to 1e-4 before hashing: cross-engine trig dust (sin/cos/atan2 are only
//     implementation-approximated in ECMAScript) cannot split a hash between devices, while any real change can.
import { rngForIndex } from './kernel/rng.js';

const CENTRE = 50; // the asset box's centre; attach points arrive in box units, bones live centred
const rad = (deg) => (deg * Math.PI) / 180;
const finite = (v, d) => (Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const normDeg = (d) => (((d + 180) % 360) + 360) % 360 - 180;
const noNegZero = (v) => (v === 0 ? 0 : v);

/** FNV-1a 32-bit of a string — the house hash (hierarchy.js's pathHash, creature.js's hash32). */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * The seeded stream for one part of one creature: every draw the skeleton makes for (creatureId, partId) comes
 * from here, so the same (seed, creature, part) always grows the same bone, and re-rolling the SPATIAL stream
 * (the 'skeleton' channel rides it, like 'hierarchy' and 'poisson') re-grows the frame.
 */
function partStream(seed, creatureId, partId, seedOffsets) {
  return rngForIndex(seed, 'skeleton', fnv1a(`${creatureId}:${partId}`), seedOffsets);
}

/**
 * Which attach point is the HEAD and which are LIMB candidates — the artist's H and L markers.
 *
 * The saved attach data (engine/assetAttach.js) carries points only ({x, y} in the asset box, at most 4); it has
 * NO role field today. This is the skeleton's expectation, ready for the day the wet lab writes roles: a point
 * may carry `role: 'H' | 'L'`. Until then the default stands (DESIGN CALL, flagged in the S1 staging report):
 * the FIRST point is H, the rest are L candidates. (Points from the shape itself arrive top, right, bottom,
 * left — engine/autoAttach.js — so the default head is the shape's top, which is where a head belongs.)
 */
export function resolveMarkers(points) {
  const pts = Array.isArray(points) ? points : [];
  let head = pts.findIndex((p) => p && p.role === 'H');
  if (head < 0) head = pts.length ? 0 : -1;
  const limbs = [];
  pts.forEach((p, i) => { if (i !== head) limbs.push(i); });
  return { head, limbs };
}

const centred = (p) => ({ x: finite(p && p.x, CENTRE) - CENTRE, y: finite(p && p.y, CENTRE) - CENTRE });

/** The point of `points` (already centred) furthest toward a side — creature.js's pointToward, on centred points. */
function extreme(points, side) {
  if (!points.length) return { x: 0, y: 0 };
  const score = { right: (p) => p.x, left: (p) => -p.x, bottom: (p) => p.y, top: (p) => -p.y }[side];
  let best = points[0];
  for (const p of points) if (score(p) > score(best)) best = p;
  return best;
}

/** A unit vector `deg` degrees clockwise from straight up, in canvas orientation (y down). */
function dirFromUp(deg) {
  const r = rad(deg);
  return { x: Math.sin(r), y: -Math.cos(r) };
}

function makeBone({ id, parent, chain, role, side, marker, base, tip, parentAngleDeg }) {
  const dx = tip.x - base.x;
  const dy = tip.y - base.y;
  const length = Math.hypot(dx, dy);
  const ux = length > 0 ? dx / length : 0;
  const uy = length > 0 ? dy / length : -1;
  const angleDeg = normDeg((Math.atan2(uy, ux) * 180) / Math.PI);
  return {
    id, parent, chain, role, side, marker,
    base: { x: base.x, y: base.y }, tip: { x: tip.x, y: tip.y },
    ux, uy, angleDeg, length,
    localAngleDeg: parentAngleDeg == null ? 0 : normDeg(angleDeg - parentAngleDeg),
  };
}

/**
 * Mirror one bone across the creature's vertical axis. Pure negation arithmetic (x -> -x, ux -> -ux), so a
 * mirrored bone is bit-exact against its source — never a second computation that merely agrees.
 */
export function mirrorBone(b) {
  const mir = (v) => noNegZero(-v);
  return {
    ...b,
    id: b.id.replace('/L/', '/R/'),
    parent: b.parent ? b.parent.replace('/L/', '/R/') : null,
    side: 'R',
    base: { x: mir(b.base.x), y: b.base.y },
    tip: { x: mir(b.tip.x), y: b.tip.y },
    ux: mir(b.ux), uy: b.uy,
    angleDeg: normDeg(180 - b.angleDeg),
    localAngleDeg: mir(b.localAngleDeg),
  };
}

/**
 * The moth's skeleton plan — a PLAN is data: a spine and a list of chain specs. Other types (S6-S8) are other
 * plans over this same builder. dirDeg values are the standalone defaults; the live builder passes the frame's
 * real angles (spread + traits + beat) as pose overrides. They mirror MOTH.spread / MOTH.hindSpread /
 * MOTH.hindAlong in creature.js, which owns the moth's look; totalLen is in body-box units (the fore wing asset
 * spans the box; the hind pair is MOTH.hindScale of it).
 */
export const MOTH_SKELETON_PLAN = Object.freeze({
  id: 'moth',
  spineSegments: 4,
  hindAlong: 0.45, // where the hind chain roots: this far from the side point toward the bottom point
  chains: Object.freeze([
    Object.freeze({ id: 'fore', root: 'side', dirDeg: 58, sweepDeg: 7, totalLen: 100, lenFrac: Object.freeze([0.40, 0.33, 0.27]) }),
    Object.freeze({ id: 'hind', root: 'hind', dirDeg: 122, sweepDeg: 5, totalLen: 78, lenFrac: Object.freeze([0.40, 0.33, 0.27]) }),
  ]),
});

/**
 * Build one creature's skeleton. Pure: the same inputs always grow the same bones.
 *
 * @param seed        the document seed (rides the resolver input, like everything else about a creature)
 * @param creatureId  stable per creature (the builder passes the pin's index, `m${i}`) — half the RNG key
 * @param plan        a plan as above; chains root at attach points, so a plan is a body plan, not a species
 * @param attach      the body asset's attach points, in box units (attachPointsFor's output); may be null
 * @param attachRoles honoured via resolveMarkers when the points themselves carry `role` fields
 * @param pose        { bodyScale, wingScale, foreDirDeg, hindDirDeg, hindAmount, foreFlexDeg, hindFlexDeg } —
 *                    plain numbers the caller derives from traits/beat; hindAmount 0 leaves the hind chains out
 *                    entirely. The flex numbers (Phase 2 S2) are PER-JOINT degrees added on top of each chain's
 *                    sweep: bone i turns flex·i further than the flex-less chain, so the root bone keeps the
 *                    root direction exactly and the tip lags most — a wing bending at its joints under the
 *                    flap. Absent (or 0) the chain is bit-for-bit the S1 chain.
 * @param seedOffsets the document's seed offsets (the skeleton rides the SPATIAL stream)
 * @returns { plan, creatureId, bones, headBone, hash } — bones in construction order: spine, left chains, right
 *          chains (mirrored). headBone is the H bone's id. hash is skeletonHash() of the bones.
 */
export function buildSkeleton({ seed = 0, creatureId = 'c0', plan = MOTH_SKELETON_PLAN, attach = null, pose = {}, seedOffsets = null } = {}) {
  const bodyScale = finite(pose.bodyScale, 1);
  const wingScale = finite(pose.wingScale, 1);
  const hindAmount = clamp(finite(pose.hindAmount, 1), 0, 1);
  const stream = (partId) => partStream(seed, creatureId, partId, seedOffsets);

  // The shape's landmarks, in centred units. No usable points (or a single point: no span) -> the box extremes.
  const rawPts = (Array.isArray(attach) ? attach : []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const markers = resolveMarkers(rawPts);
  const pts = rawPts.map(centred);
  let top = pts.length ? extreme(pts, 'top') : { x: 0, y: -CENTRE };
  let bottom = pts.length ? extreme(pts, 'bottom') : { x: 0, y: CENTRE };
  if (Math.hypot(top.x - bottom.x, top.y - bottom.y) < 1) { top = { x: 0, y: -CENTRE }; bottom = { x: 0, y: CENTRE }; }
  const sidePoint = (side) => {
    if (!pts.length) return side === 'left' ? { x: -CENTRE, y: 0 } : { x: CENTRE, y: 0 };
    const p = extreme(pts, side);
    return Math.hypot(p.x - top.x, p.y - top.y) < 1 && Math.hypot(p.x - bottom.x, p.y - bottom.y) < 1 ? (side === 'left' ? { x: -CENTRE, y: 0 } : { x: CENTRE, y: 0 }) : p;
  };
  // The artist's head point wins over the geometric top when a role (or the default first point) names one.
  const headPoint = markers.head >= 0 && rawPts.length ? centred(rawPts[markers.head]) : top;

  const bones = [];

  // --- the spine: tail (bottom point) to head (head point), joints spaced by seeded weights along the span.
  // Weights move the joints along the span, never off it, and the head joint lands exactly on the head point.
  const segCount = Math.max(1, Math.floor(finite(plan.spineSegments, 4)));
  const spineStream = stream('spine');
  const weights = [];
  for (let i = 0; i < segCount; i++) weights.push(0.85 + 0.3 * spineStream());
  const totalW = weights.reduce((a, b) => a + b, 0) * bodyScale;
  const joints = [{ x: bottom.x * bodyScale, y: bottom.y * bodyScale }];
  let acc = 0;
  for (let i = 0; i < segCount; i++) {
    acc += (weights[i] * bodyScale) / totalW;
    const t = i === segCount - 1 ? 1 : acc;
    joints.push({ x: (bottom.x + (headPoint.x - bottom.x) * t) * bodyScale, y: (bottom.y + (headPoint.y - bottom.y) * t) * bodyScale });
  }
  for (let i = 0; i < segCount; i++) {
    const isHead = i === segCount - 1;
    bones.push(makeBone({
      id: `spine/${i}`, parent: i === 0 ? null : `spine/${i - 1}`, chain: null,
      role: isHead ? 'head' : 'spine', side: 'C', marker: isHead ? 'H' : null,
      base: joints[i], tip: joints[i + 1],
      parentAngleDeg: i === 0 ? null : bones[i - 1].angleDeg,
    }));
  }
  const spineAngleAt = (jointIdx) => bones[clamp(jointIdx, 0, segCount - 1)].angleDeg;
  const nearestJoint = (p) => {
    let best = 0; let bd = Infinity;
    joints.forEach((j, i) => { const d = Math.hypot(j.x - p.x, j.y - p.y); if (d < bd) { bd = d; best = i; } });
    return best;
  };

  // --- the chains: build the LEFT of each spec, then mirror. A chain's root is an attach landmark, so the
  // artist's points (and one day their H/L roles) are where limbs grow from — every L point a plan roots at
  // grows its chain; nothing here caps the count at one limb.
  const leftBones = [];
  for (const spec of plan.chains || []) {
    const isHind = spec.root === 'hind';
    if (isHind && hindAmount <= 0.02) continue; // the recipe's own threshold: no pair, no bones
    const dirDeg = isHind ? finite(pose.hindDirDeg, spec.dirDeg) : finite(pose.foreDirDeg, spec.dirDeg);
    const flexDeg = isHind ? finite(pose.hindFlexDeg, 0) : finite(pose.foreFlexDeg, 0);
    const rootSide = sidePoint('left');
    const root = isHind
      ? { x: (rootSide.x + (bottom.x - rootSide.x) * finite(plan.hindAlong, 0.45)) * bodyScale, y: (rootSide.y + (bottom.y - rootSide.y) * finite(plan.hindAlong, 0.45)) * bodyScale }
      : { x: rootSide.x * bodyScale, y: rootSide.y * bodyScale };
    const fracs = Array.isArray(spec.lenFrac) && spec.lenFrac.length ? spec.lenFrac : [1];
    const chainStream = stream(spec.id);
    const total = spec.totalLen * wingScale * (isHind ? hindAmount : 1);
    const parentJoint = nearestJoint(root);
    let base = root;
    let parentId = `spine/${clamp(parentJoint, 0, segCount - 1)}`;
    let parentAngle = spineAngleAt(parentJoint);
    for (let i = 0; i < fracs.length; i++) {
      const len = total * fracs[i] * (0.92 + 0.16 * chainStream());
      const sweep = (spec.sweepDeg || 0) * i + (chainStream() - 0.5) * 3 + flexDeg * i; // S2: per-joint flex (see pose)
      const dir = dirFromUp(-(dirDeg + sweep)); // left: angles run negative from straight up
      const tip = { x: base.x + dir.x * len, y: base.y + dir.y * len };
      const bone = makeBone({
        id: `${spec.id}/L/${i}`, parent: parentId, chain: spec.id, role: 'limb', side: 'L',
        marker: i === 0 ? 'L' : null, base, tip, parentAngleDeg: parentAngle,
      });
      leftBones.push(bone);
      base = tip; parentId = bone.id; parentAngle = bone.angleDeg;
    }
  }
  bones.push(...leftBones, ...leftBones.map(mirrorBone));

  const skel = { plan: plan.id || 'custom', creatureId, bones, headBone: `spine/${segCount - 1}` };
  skel.hash = skeletonHash(skel);
  return skel;
}

/**
 * A stable hash of a skeleton's bones: FNV-1a over the canonical bone list, numbers quantised to 1e-4 (see the
 * header: trig dust cannot split it; any real change does). This is S1's "same bone hash on both devices" bar.
 */
export function skeletonHash(skel) {
  const q = (v) => Math.round(v * 10000) / 10000;
  let s = '';
  for (const b of (skel && skel.bones) || []) {
    s += `${b.id}|${q(b.base.x)},${q(b.base.y)}|${q(b.tip.x)},${q(b.tip.y)}|${q(b.length)};`;
  }
  return fnv1a(s).toString(16).padStart(8, '0');
}

/**
 * Place a built skeleton: rotate/scale/translate every bone (the transform a creature's root item gets).
 * Returns a new skeleton; the source is untouched. Angles shift by rotDeg, lengths scale — the hash follows.
 */
export function transformSkeleton(skel, { x = 0, y = 0, rotDeg = 0, scale = 1 } = {}) {
  const c = Math.cos(rad(rotDeg));
  const s = Math.sin(rad(rotDeg));
  const map = (p) => ({ x: x + (p.x * c - p.y * s) * scale, y: y + (p.x * s + p.y * c) * scale });
  const bones = (skel.bones || []).map((b) => {
    const base = map(b.base);
    const tip = map(b.tip);
    const dx = tip.x - base.x;
    const dy = tip.y - base.y;
    const length = Math.hypot(dx, dy);
    return {
      ...b, base, tip,
      ux: length > 0 ? dx / length : b.ux, uy: length > 0 ? dy / length : b.uy,
      angleDeg: normDeg(b.angleDeg + rotDeg), length,
    };
  });
  const out = { ...skel, bones };
  out.hash = skeletonHash(out);
  return out;
}
