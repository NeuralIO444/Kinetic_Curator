// engine/motionCore/rigSources.js — Motion Core P2b (#2114, epic #2109): the rig adapter.
//
// The assembled creature's gaits (creatureRig.poseRig), the beast's linkage (beastRig.poseLinkage) and the beast's roam
// (beastRoam.roamAt) as motion sources. NO BEHAVIOUR CHANGE: nothing but the selfcheck imports this file, and the three
// kinematic files are untouched. Every number here comes from calling poseRig / poseLinkage / roamAt, never from
// re-implementing them; a source's delta is `pose(t) − pose(0)`, so the anchor law holds by construction.
//
// What a source needs rides in `ctx` (the registry's probe passes `{}` and gets rest back):
//   gait:<FACE>     ctx.rig, optional ctx.phase (0..1 stride offset). One source per LOIS_GAITS entry.
//   linkage:jansen  ctx.linkage ({measures, phase}), optional ctx.drive (crank-rate multiplier), optional ctx.crank ({a,b}
//                   turns, the roam's bank phases).
//   roam:beast      ctx.roam, a roam spec ({seedKey, stride, params}).
// A node's `key` is a bone id ('0.1', 'h', '3:crank', the beam id); the roam source moves the body, whatever its key.
//
// Pose fields: dx / dy are the bone's JOINT (x, y), dRot its angle, in the rig's own units and degrees. A bone also has a
// tip and a length that the Pose shape has no slot for, so the extra deltas ride along as EXTENSION fields (dtx, dty,
// dlen); composePose drops them, poseFigure() keeps them. The roam's heading / bank phases / moving flag are extensions
// the same way (dHeading in radians, dPhaseA, dPhaseB, moving).
//
// Exactness: a delta is exactly `pose − rest` (Object.is). `rest + delta` is that pose to within one ulp, not always
// bit-for-bit: in IEEE doubles `a + (b − a)` is not always `b` (measured 4/1710 on the poseRig fixtures).
import { registerCostTier } from '../kernel/costRegistry.mjs';
import { registerMotionSource } from './index.js';
import { LOIS_GAITS, poseRig } from '../creatureRig.js';
import { poseLinkage } from '../beastRig.js';
import { roamAt } from '../beastRoam.js';

export const RIG_COST_TIER = 'motionCore/rig-adapter';
registerCostTier(RIG_COST_TIER, { tier: 0, notes: 'Motion Core P2b: the rig adapter evaluates the existing rig kinematics, nothing new' });

// ---- the rest pose, cached per figure: a rig / linkage is immutable once built, so a WeakMap on it is safe
const restCache = new WeakMap(); // figure -> Map(variantKey -> Map(boneId -> bone) | roam rest)
const memo = (figure, variant, make) => {
  let by = restCache.get(figure);
  if (!by) restCache.set(figure, (by = new Map()));
  let v = by.get(variant);
  if (!v) by.set(variant, (v = make()));
  return v;
};
const byId = (bones) => new Map((bones || []).map((b) => [b.id, b]));

// one-entry memo of the last posed figure, so evaluating every bone of one figure at one time poses it once
let lastKey = null;
let lastPose = null;
const posedOnce = (figure, variant, t, make) => {
  const hit = lastKey && lastKey.figure === figure && lastKey.variant === variant && Object.is(lastKey.t, t);
  if (hit) return lastPose;
  lastKey = { figure, variant, t };
  lastPose = byId(make());
  return lastPose;
};

function boneDelta(now, rest) {
  if (!now || !rest) return {};
  return {
    dx: now.x - rest.x,
    dy: now.y - rest.y,
    dRot: now.angle - rest.angle,
    dtx: now.tx - rest.tx,
    dty: now.ty - rest.ty,
    dlen: now.len - rest.len,
  };
}

// ---- gaits
export const gaitSourceId = (name) => `gait:${name}`;

function gaitEvaluate(name) {
  const gait = LOIS_GAITS[name];
  return (node, t, ctx) => {
    const rig = ctx && ctx.rig;
    if (!rig || !Array.isArray(rig.bones)) return {};
    const phase = Number.isFinite(ctx.phase) ? ctx.phase : 0;
    const variant = `gait|${name}|${phase}`;
    const rest = memo(rig, variant, () => byId(poseRig(rig, 0, gait, phase)));
    const now = posedOnce(rig, `${variant}`, t, () => poseRig(rig, t, gait, phase));
    return boneDelta(now.get(node.key), rest.get(node.key));
  };
}

// ---- linkage
export const LINKAGE_SOURCE_ID = 'linkage:jansen';

function linkageEvaluate(node, t, ctx) {
  const linkage = ctx && ctx.linkage;
  if (!linkage) return {};
  const drive = Number.isFinite(ctx.drive) ? ctx.drive : 1;
  const crank = ctx.crank || null;
  // the rest pose is θ at t = 0 with no crank turns, whichever clock drives the rest
  const rest = memo(linkage, `linkage|${drive}`, () => byId(poseLinkage(linkage, 0, drive, null) || []));
  const crankKey = crank ? `${crank.a}|${crank.b}` : '-';
  const now = posedOnce(linkage, `linkage|${drive}|${crankKey}`, t, () => poseLinkage(linkage, t, drive, crank) || []);
  return boneDelta(now.get(node.key), rest.get(node.key));
}

// ---- roam
export const ROAM_SOURCE_ID = 'roam:beast';

function roamEvaluate(node, t, ctx) {
  const spec = ctx && ctx.roam;
  if (!spec) return {};
  const rest = memo(spec, 'roam|rest', () => roamAt(spec, 0));
  const now = roamAt(spec, t);
  return {
    dx: now.x - rest.x,
    dy: now.y - rest.y,
    dRot: (now.heading - rest.heading) * (180 / Math.PI),
    dHeading: now.heading - rest.heading,
    dPhaseA: now.phaseA - rest.phaseA,
    dPhaseB: now.phaseB - rest.phaseB,
    moving: now.moving,
  };
}

// The registry's toPose ignores unknown keys and needs finite pose numbers; `moving` is a boolean extension, so keep it
// off the registry-facing result and give it back through poseFigure() instead.
const registryFacing = (fn) => (node, t, ctx) => {
  const out = { ...fn(node, t, ctx) };
  delete out.moving;
  return out;
};

const SPECS = [
  ...Object.keys(LOIS_GAITS).map((name) => ({
    id: gaitSourceId(name),
    family: 'gait',
    timeBase: 'kineme', // sceneContract.js passes kinemeTime to poseRig (motion map, row "Assembled creature")
    evaluate: gaitEvaluate(name),
  })),
  { id: LINKAGE_SOURCE_ID, family: 'linkage', timeBase: 'kineme', evaluate: linkageEvaluate }, // expandBeast passes the same t
  { id: ROAM_SOURCE_ID, family: 'transport', timeBase: 'kineme', evaluate: registryFacing(roamEvaluate) },
];

for (const s of SPECS) registerMotionSource({ ...s, costTier: RIG_COST_TIER });

/** The ids this adapter registers, in order. */
export const RIG_SOURCE_IDS = Object.freeze(SPECS.map((s) => s.id));

const evaluators = new Map([
  ...Object.keys(LOIS_GAITS).map((name) => [gaitSourceId(name), gaitEvaluate(name)]),
  [LINKAGE_SOURCE_ID, linkageEvaluate],
  [ROAM_SOURCE_ID, roamEvaluate],
]);

/**
 * The whole figure's deltas at time t, through the sources: `{ [boneId]: delta }` for a rig (opts.gait: a LOIS_GAITS name,
 * default 'NOD'; opts.phase) or a linkage (opts.linkage; opts.drive; opts.crank). For a roam pass opts.roam; the result is
 * `{ body: delta }` with the extension fields (including `moving`). Rest → every delta is zero.
 */
export function poseFigure(figure, t, opts = {}) {
  if (opts.roam) return { body: roamEvaluate({ key: 'body' }, t, { roam: opts.roam }) };
  const out = {};
  if (figure && Array.isArray(figure.bones)) {
    const ev = evaluators.get(gaitSourceId(opts.gait || 'NOD'));
    if (!ev) throw new TypeError(`[rigSources] unknown gait "${String(opts.gait)}"`);
    const ctx = { rig: figure, phase: opts.phase };
    for (const b of figure.bones) out[b.id] = ev({ key: b.id }, t, ctx);
  } else if (figure && figure.measures) {
    const posed = poseLinkage(figure, 0, opts.drive ?? 1, null) || [];
    const ctx = { linkage: figure, drive: opts.drive, crank: opts.crank };
    for (const b of posed) out[b.id] = linkageEvaluate({ key: b.id }, t, ctx);
  }
  return out;
}
