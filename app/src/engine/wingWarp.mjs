// engine/wingWarp.mjs — Phase 2 creature system, slice S2: BENT WINGS by full mesh warp.
//
// Matt's ruling 1 (2026-10-16): skinning is a full mesh warp FIRST; ribbon strips are the fallback. This is
// the warp: each wing item's quad becomes a subdivided grid (WARP_STATIONS spanwise x WARP_ROWS chordwise)
// whose vertices carry weights to the wing chain's three bones (S1's skeleton, engine/skeleton.js), and every
// vertex is moved by linear-blend skinning — sum over bones of weight x (posed bone frame o ref bone frame^-1)
// x vertex. Not strips: a strip chain moves whole slices rigidly per slice; here every vertex blends the two
// bone frames around its joint, so the surface is continuous through the joints and bends AT them.
//
// The skinning space is SCENE space: S1 publishes the frame's skeletons in world (scene) coordinates through
// the same root transform that places the drawn items, so bones and items meet without a change of frame.
// A wing bends because the skeleton's POSE now carries per-joint flex (skeleton.js: pose.foreFlexDeg /
// hindFlexDeg, derived by the creature builder from the flap beat — the tip lags the root). The reference
// (bind) chain is the same skeleton built with flex 0 at the same root direction:
//
//   flex = 0  ->  posed == ref for every bone  ->  every transform is the identity  ->  the builder emits
//   NO mesh at all and the moth is the pre-S2 moth, byte for byte (the identity-parity pin in the selfcheck).
//
// Pure: no clock, no chance, no environment reads — a function of the items and the two skeletons only, so a
// recorded take replays the same bent wing (the resolver's inputs carry everything the flex derives from).
import { registerCostTier } from '../gl/costTiers.mjs';

// Tier 2 (quality scaler, shed after tier 1) like the petri deform (engine/dishDeform.mjs) whose shape this
// follows: a CPU feed in the resolver plus a gated draw in the renderer. timeMs is the author's estimate;
// the measured numbers at the 4-creature cap live in the S2 staging report (gl/debug/measureWingWarp.mjs,
// SwiftShader — indicative only, the Studio run is authoritative for the 2.0 ms budget).
registerCostTier('engine/wing-warp', {
  tier: 2,
  memoryBytes: 49152,
  timeMs: 0.05,
  notes:
    'Phase 2 S2 wing warp: resolver-side linear-blend skinning of each wing quad over its S1 bone chain ' +
    '(grid 9x3 per wing, both pairs, halo copies included; scale marks displaced by the same field), plus ' +
    'one ordered mesh draw per layer run in the renderer (MESH_VS + the shared QUAD_FS). No passes, no ' +
    'textures; the mesh VBO is transient per frame (~48 KB at the 4-creature cap). Neutral (flex 0) emits ' +
    'no mesh and costs nothing. Measured by gl/debug/measureWingWarp.mjs.',
});

/** Per-joint flex per degree of flap beat: the tip lags the root by this fraction of the beat, per joint. */
export const WARP_FLEX_RATIO = 0.5;

/** Grid shape: spanwise stations x chordwise rows per wing mesh. */
export const WARP_STATIONS = 9;
export const WARP_ROWS = 3;

/** Half-width of the weight blend around a joint, in normalised span — under half the shortest segment. */
const BLEND = 0.12;

/** The drawn quad's half-span in centred asset units: QUAD_VS spans au in [-49.75, 149.75], centred [-99.75, 99.75]. */
const QUAD_HALF = 99.75;
const QUAD_SPAN = 199.5;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

/**
 * The wing's span frame from its own attach points, in centred asset units: root = the base point (the
 * recipe's root, pointToward 'bottom'), tip = the attach point furthest from the root, axis = root->tip.
 * Degenerate points (none, or root == tip) fall back to the box's vertical: root at the bottom centre,
 * tip at the top centre — the same extremes autoAttach would have derived.
 */
export function wingAxis(wingPoints) {
  const pts = (Array.isArray(wingPoints) ? wingPoints : []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pts.length) return { root: { x: 0, y: 50 }, axis: { x: 0, y: -1 }, span: 100 };
  // the root is the recipe's own root: the point furthest toward the bottom of the box (creature.js's
  // pointToward 'bottom'), centred — recomputed here so this module imports nothing from creature.js
  let rootRaw = pts[0];
  for (const p of pts) if (p.y > rootRaw.y) rootRaw = p;
  const rootC = { x: rootRaw.x - 50, y: rootRaw.y - 50 };
  let tip = null; let best = -1;
  for (const p of pts) {
    const c = { x: p.x - 50, y: p.y - 50 };
    const d = Math.hypot(c.x - rootC.x, c.y - rootC.y);
    if (d > best) { best = d; tip = c; }
  }
  if (!tip || best < 1) return { root: { x: 0, y: 50 }, axis: { x: 0, y: -1 }, span: 100 };
  return { root: rootC, axis: { x: (tip.x - rootC.x) / best, y: (tip.y - rootC.y) / best }, span: best };
}

/** Normalised joint positions along a chain, from its bones' lengths: [0, ..., 1], bones.length + 1 entries. */
export function chainJoints(bones) {
  const total = bones.reduce((a, b) => a + b.length, 0);
  const out = [0];
  let acc = 0;
  for (const b of bones) { acc += total > 0 ? b.length / total : 0; out.push(acc); }
  if (out.length) out[out.length - 1] = 1;
  return out;
}

/**
 * Skinning weights over a chain's segments at normalised span u: a telescoping pair of smoothsteps around
 * each joint (w_b = S(u - j_b) - S(u - j_{b+1})), normalised — a partition of unity by construction, smooth
 * through the joints, exactly 1 on a single segment away from the blends.
 */
export function spanWeights(u, joints) {
  const n = joints.length - 1;
  const w = new Array(n);
  let sum = 0;
  for (let b = 0; b < n; b++) {
    const hi = smooth((u - joints[b]) / BLEND + 0.5);
    const lo = smooth((u - joints[b + 1]) / BLEND + 0.5);
    w[b] = Math.max(0, hi - lo);
    sum += w[b];
  }
  if (sum > 0) for (let b = 0; b < n; b++) w[b] /= sum;
  else if (n) w[Math.min(n - 1, Math.max(0, Math.floor(u * n)))] = 1;
  return w;
}

/**
 * The rigid 2D affine that carries a bone's reference frame onto its posed frame (both scene space):
 * T(p) = posedBase + Rp * Rr^T * (p - refBase), from the bones' stored unit directions. Lengths do not
 * change under flex, so the transform is a pure rotation + translation — no scale, no shear.
 */
export function boneTransform(ref, posed) {
  // M is the rotation by (posed angle - ref angle): cos/sin of the difference from the stored unit vectors.
  const cosD = posed.ux * ref.ux + posed.uy * ref.uy;
  const sinD = posed.uy * ref.ux - posed.ux * ref.uy;
  const m00 = cosD; const m01 = -sinD;
  const m10 = sinD; const m11 = cosD;
  return {
    m00, m01, m10, m11,
    tx: posed.base.x - (m00 * ref.base.x + m01 * ref.base.y),
    ty: posed.base.y - (m10 * ref.base.x + m11 * ref.base.y),
  };
}

export function applyTransform(t, x, y) {
  return [t.m00 * x + t.m01 * y + t.tx, t.m10 * x + t.m11 * y + t.ty];
}

/** Per-bone transforms for one chain (ref bones -> posed bones, same order). */
export function chainTransforms(refBones, posedBones) {
  return posedBones.map((p, i) => boneTransform(refBones[i], p));
}

/** Skin one scene point: weights at span u, blended over the chain's bone transforms. */
export function skinPoint(x, y, u, joints, transforms) {
  const w = spanWeights(u, joints);
  let px = 0; let py = 0;
  for (let b = 0; b < transforms.length; b++) {
    if (!w[b]) continue;
    const [qx, qy] = applyTransform(transforms[b], x, y);
    px += w[b] * qx; py += w[b] * qy;
  }
  return [px, py];
}

/** A point's normalised span along a wing: its position in the wing item's local frame, projected on the axis. */
function spanAt(localX, localY, frame) {
  return clamp01(((localX - frame.root.x) * frame.axis.x + (localY - frame.root.y) * frame.axis.y) / frame.span);
}

/**
 * Build the warp mesh for ONE wing item.
 *
 * @param item      the final drawn item ({ x, y, rotation, scale, scaleY }) — the mesh covers this item's quad
 * @param bones     the chain's posed bones (scene space, root -> tip)
 * @param refBones  the same chain at flex 0, same root direction (scene space)
 * @param wingPoints the wing asset's attach points (box units) — the span frame comes from the asset itself
 * @returns { pos, uv, idx } — scene-space positions, quad-corner UVs (0..1 across the item's quad, the mapping
 *          QUAD_VS applies), and triangle indices; or null when the chain is missing or nothing actually
 *          moves (the caller then keeps the plain quad — the neutral path).
 */
export function buildWingWarp({ item, bones, refBones, wingPoints }) {
  if (!bones || !refBones || bones.length !== refBones.length || bones.length < 2) return null;
  const frame = wingAxis(wingPoints);
  const joints = chainJoints(refBones);
  const transforms = chainTransforms(refBones, bones);
  const rot = (item.rotation * Math.PI) / 180;
  const co = Math.cos(rot); const si = Math.sin(rot);
  const sx = item.scale; const sy = Number.isFinite(item.scaleY) ? item.scaleY : item.scale;
  // The grid in the wing's rotated local frame (root + axis*t + perp*q), spanning the quad's full extent so
  // the whole asset surface — padding included — follows the skin. Vertices are clamped back into the quad
  // rect (the rotated frame's corners overshoot it); UVs derive from the clamped position by the quad's own
  // affine mapping, so a clamped vertex still samples exactly where it sits.
  const perp = { x: -frame.axis.y, y: frame.axis.x };
  const corners = [[-QUAD_HALF, -QUAD_HALF], [QUAD_HALF, -QUAD_HALF], [-QUAD_HALF, QUAD_HALF], [QUAD_HALF, QUAD_HALF]];
  let tMin = Infinity; let tMax = -Infinity; let qMin = Infinity; let qMax = -Infinity;
  for (const [cx, cy] of corners) {
    const t = (cx - frame.root.x) * frame.axis.x + (cy - frame.root.y) * frame.axis.y;
    const q = (cx - frame.root.x) * perp.x + (cy - frame.root.y) * perp.y;
    if (t < tMin) tMin = t; if (t > tMax) tMax = t;
    if (q < qMin) qMin = q; if (q > qMax) qMax = q;
  }
  const pos = [];
  const uv = [];
  let maxMove = 0;
  for (let r = 0; r < WARP_ROWS; r++) {
    const q = qMin + ((qMax - qMin) * r) / (WARP_ROWS - 1);
    for (let sIdx = 0; sIdx < WARP_STATIONS; sIdx++) {
      const t = tMin + ((tMax - tMin) * sIdx) / (WARP_STATIONS - 1);
      let lx = frame.root.x + frame.axis.x * t + perp.x * q;
      let ly = frame.root.y + frame.axis.y * t + perp.y * q;
      lx = Math.min(QUAD_HALF, Math.max(-QUAD_HALF, lx));
      ly = Math.min(QUAD_HALF, Math.max(-QUAD_HALF, ly));
      const u = spanAt(lx, ly, frame);
      // the item's own transform, exactly as QUAD_VS applies it: scale, rotate (SVG, y-down), translate
      const px = item.x + (lx * sx) * co - (ly * sy) * si;
      const py = item.y + (lx * sx) * si + (ly * sy) * co;
      const [wx, wy] = skinPoint(px, py, u, joints, transforms);
      maxMove = Math.max(maxMove, Math.hypot(wx - px, wy - py));
      pos.push(wx, wy);
      uv.push((lx + QUAD_HALF) / QUAD_SPAN, (ly + QUAD_HALF) / QUAD_SPAN);
    }
  }
  if (!(maxMove > 1e-9)) return null; // nothing bent (or float dust): the plain quad is the honest draw
  const idx = [];
  for (let r = 0; r < WARP_ROWS - 1; r++) {
    for (let sIdx = 0; sIdx < WARP_STATIONS - 1; sIdx++) {
      const a = r * WARP_STATIONS + sIdx;
      const b = a + 1;
      const c = a + WARP_STATIONS;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return { pos, uv, idx };
}

/**
 * Displace one point (a scale mark's centre) by the same warp field its wing's skin follows, so the marks
 * stay glued to the bent surface. Returns { x, y, dRot } — the new centre and the local frame's rotation
 * delta (the weight-blended bone angle change), or null when the wing has no warp.
 *
 * @param wingItem the wing's drawn item (its transform defines the local frame the point is measured in)
 */
export function warpPoint({ x, y, wingItem, bones, refBones, wingPoints }) {
  if (!bones || !refBones || bones.length !== refBones.length || bones.length < 2) return null;
  const frame = wingAxis(wingPoints);
  const joints = chainJoints(refBones);
  const transforms = chainTransforms(refBones, bones);
  const rot = (wingItem.rotation * Math.PI) / 180;
  const co = Math.cos(rot); const si = Math.sin(rot);
  const s = Number.isFinite(wingItem.scale) ? wingItem.scale : wingItem.scaleX;
  // invert the item's similarity: local = R^-1 * (P - pos) / scale
  const dx = x - wingItem.x; const dy = y - wingItem.y;
  const lx = (dx * co + dy * si) / s;
  const ly = (-dx * si + dy * co) / s;
  const u = spanAt(lx, ly, frame);
  const [wx, wy] = skinPoint(x, y, u, joints, transforms);
  const w = spanWeights(u, joints);
  let dRot = 0;
  for (let b = 0; b < bones.length; b++) dRot += w[b] * (bones[b].angleDeg - refBones[b].angleDeg);
  return { x: wx, y: wy, dRot };
}
