// engine/motionCore/rigSources.js — Motion Core P2b (#2114, epic #2109): the rig adapter.
//
// The assembled creature's gaits (creatureRig.poseRig), the beast's linkage (beastRig.poseLinkage) and the beast's roam
// (beastRoam.roamAt) as motion sources. Every number here comes from calling poseRig / poseLinkage / roamAt, never from
// re-implementing them; a source's delta is `pose(t) − pose(0)`, so the anchor law holds by construction.
//
// #2119 step 3.1 (P7, figures-spec §6): poseFigure grew from a per-bone delta view into the figure poser — it returns
// POSED bones (the shape placePart consumes) and honours each bone's baked `motion` (per-bone sources through the
// registry, composed parent ∘ source; the part and region kinemes stay downstream in the contract, untouched). The
// registry sources above are exactly P2b's; nothing but selfchecks imported this file until step 3.3 re-piped the
// expansion through poseFigure — the scene-contract seam (gl/sceneContract.js) is the one production importer: it
// hands poseFigure to expandCreatureInstances as an opt, since the expansion's own module cannot import this one
// back (the adapter reads poseRig / LOIS_GAITS from it).
// #2119 step 3.2: a mobile (a rig marked `figure: 'mobile'`) poses through poseMobileFigure — no native pass, no
// gait: every bone composes locally from the authored rest, each on its own source.
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
import { registerMotionSource, getMotionSource } from './index.js';
import { LOIS_GAITS, gaitFor, poseRig } from '../creatureRig.js';
import { poseLinkage } from '../beastRig.js';
import { roamAt } from '../beastRoam.js';
import { kinemePhase } from '../../data/kinemes.js';

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

// ---- #2119 step 3.1: poseFigure honours bone.motion (figures-spec §2, §6)

const rad = (d) => (d * Math.PI) / 180;
const BONE_SOURCE_RE = /^(gait|linkage|kineme:[a-z0-9][a-z0-9+_-]*|phrase:[a-z0-9][a-z0-9+_-]*)$/;
const clampAmount = (v) => (Number.isFinite(v) ? Math.min(2, Math.max(0, v)) : 1);

/**
 * One baked bone's motion entry, read for posing. sanitizeRig is the door and has already validated the record;
 * anything unparseable here is read as absent, exactly as a dropped entry is. A source the registry does not hold
 * — a `phrase:<id>` before P6 (#2118) registers the phrase sources — is likewise absent at pose time: the entry
 * (its amount included) waits for P6 and the bone poses natively meanwhile. Returns null for absent, else
 * `{ source, amount, native, src? }`.
 */
function readBoneMotion(motion, nativeSource) {
  if (!motion || typeof motion !== 'object' || typeof motion.source !== 'string' || !BONE_SOURCE_RE.test(motion.source))
    return null;
  if (motion.source === nativeSource)
    return { source: motion.source, amount: clampAmount(motion.amount), native: true };
  if (motion.source === 'gait' || motion.source === 'linkage') return null; // the other skeleton's native: the door drops it
  const src = getMotionSource(motion.source);
  if (!src) return null;
  return { source: motion.source, amount: clampAmount(motion.amount), native: false, src };
}

/** The gait name a tree figure poses under: an explicit opts.gait, else Lois's face (opts.face) through gaitFor. */
function gaitNameOf(opts) {
  if (opts.gait !== undefined && opts.gait !== null) return opts.gait;
  if (opts.face !== undefined && opts.face !== null) {
    const rec = gaitFor(opts.face);
    return Object.keys(LOIS_GAITS).find((n) => LOIS_GAITS[n] === rec) || 'NOD';
  }
  return 'NOD';
}

/**
 * A tree figure posed: poseRig's own bones for the native pass, local composition for the rest (§6). The native
 * pass is a bone on its native source at amount 1 over native-pass ancestors — ancestry included, bit-identical,
 * because those bones ARE poseRig's output objects. Any other bone composes from its parent's posed bone: a child
 * hangs from its parent's posed tip (its joint rides the tip by construction, so a source offset never moves a
 * child's joint), its angle is its parent's posed angle + its rest local angle + its local delta; a root's joint
 * is its rest joint plus its offset. The local delta: for a kineme source, the source's own pose (evaluated at the
 * part's own phase — §11 ruling 2); for a native source off the pass (amount ≠ 1, or a foreign ancestor), the
 * adapter's local form of its world delta — its own dRot minus its parent's. `amount` multiplies the local delta.
 * Rest is the adapter's rest, poseRig at t = 0 — the only rest under which a native bone at amount 1 under a
 * native parent composes to exactly its native pose.
 */
function poseTreeFigure(rig, t, opts) {
  const name = gaitNameOf(opts);
  const gait = LOIS_GAITS[name];
  if (!gait) throw new TypeError(`[rigSources] unknown gait "${String(name)}"`);
  const phase = Number.isFinite(opts.phase) ? opts.phase : 0;
  const native = poseRig(rig, t, gait, phase);
  const motions = new Map(rig.bones.map((b) => [b.id, readBoneMotion(b.motion, 'gait')]));
  const pass = new Map();
  for (const b of rig.bones) {
    const m = motions.get(b.id);
    pass.set(b.id, (b.parent === null || pass.get(b.parent)) && (!m || (m.native && m.amount === 1)));
  }
  if (rig.bones.every((b) => pass.get(b.id))) return native;
  const rest = poseRig(rig, 0, gait, phase);
  const restById = new Map(rest.map((p) => [p.id, p]));
  const nativeById = new Map(native.map((p) => [p.id, p]));
  const gaitSrc = getMotionSource(gaitSourceId(name));
  const deltas = new Map();
  const gaitDelta = (id) => {
    let d = deltas.get(id);
    if (!d) deltas.set(id, (d = gaitSrc.evaluate({ key: id }, t, { rig, phase })));
    return d;
  };
  const seedOffset = opts.seedOffset ?? 0;
  const tileKey = opts.tileKey ?? '';
  const posed = new Map();
  const out = [];
  for (const b of rig.bones) {
    if (pass.get(b.id)) {
      const p = nativeById.get(b.id);
      posed.set(b.id, p);
      out.push(p);
      continue;
    }
    const m = motions.get(b.id);
    const parent = b.parent ? posed.get(b.parent) : null;
    const R = restById.get(b.id);
    let dRot;
    let off;
    if (m && !m.native) {
      const d = m.src.evaluate(
        { key: b.id, seedOffset, phase01: kinemePhase(seedOffset, `${tileKey}#${b.id}`) },
        t,
        {},
      );
      dRot = (d.dRot || 0) * m.amount;
      off = { dx: (d.dx || 0) * m.amount, dy: (d.dy || 0) * m.amount };
    } else {
      const db = gaitDelta(b.id);
      const dp = b.parent ? gaitDelta(b.parent) : null;
      const amt = m ? m.amount : 1;
      dRot = (db.dRot - (dp ? dp.dRot : 0)) * amt;
      off = { dx: db.dx * amt, dy: db.dy * amt };
    }
    let x;
    let y;
    let angle;
    if (parent) {
      x = parent.tx;
      y = parent.ty;
      angle = parent.angle + (R.angle - restById.get(b.parent).angle) + dRot;
    } else {
      x = R.x + off.dx;
      y = R.y + off.dy;
      angle = R.angle + dRot;
    }
    const p = {
      id: b.id,
      role: b.role,
      x,
      y,
      tx: x + Math.cos(rad(angle)) * b.len,
      ty: y + Math.sin(rad(angle)) * b.len,
      angle,
      len: b.len,
    };
    posed.set(b.id, p);
    out.push(p);
  }
  return out;
}

/**
 * A linkage figure posed: poseLinkage's own bars, with a foreign source's delta composed onto the bar itself
 * (§11 ruling 4 — the bar, the skeleton, bends; the linkage is never re-solved). The delta is evaluated once per
 * bar NAME, not per leg (§7), so every leg's bar of that name bends in step. A 'linkage' or absent bar rides
 * exactly as today (its amount has no pose effect on a native bar — §6); bars the map does not bend are
 * poseLinkage's own objects. opts.motion is the rig's baked motion map (keyed by bar name, the beam included).
 */
function poseLinkageFigure(linkage, t, opts) {
  const base = poseLinkage(linkage, t, opts.drive, opts.crank);
  if (!base) return base; // a stillbirth poses as poseLinkage leaves it: null
  const map = opts.motion && typeof opts.motion === 'object' ? opts.motion : null;
  if (!map) return base;
  const seedOffset = opts.seedOffset ?? 0;
  const tileKey = opts.tileKey ?? '';
  const deltas = new Map();
  for (const name of Object.keys(map)) {
    const m = readBoneMotion(map[name], 'linkage');
    if (!m || m.native) continue;
    const d = m.src.evaluate({ key: name, seedOffset, phase01: kinemePhase(seedOffset, `${tileKey}#${name}`) }, t, {});
    deltas.set(name, { dx: (d.dx || 0) * m.amount, dy: (d.dy || 0) * m.amount, dRot: (d.dRot || 0) * m.amount });
  }
  if (!deltas.size) return base;
  return base.map((p) => {
    const d = deltas.get(p.name);
    if (!d) return p;
    const x = p.x + d.dx;
    const y = p.y + d.dy;
    const angle = p.angle + d.dRot;
    return { ...p, x, y, angle, tx: x + Math.cos(rad(angle)) * p.len, ty: y + Math.sin(rad(angle)) * p.len };
  });
}

/**
 * A mobile posed (step 3.2; figures-spec §4): a figure with no gait and no linkage, so there is no native pass —
 * every bone composes locally from the AUTHORED rest (the record is the truth for rest angles; poseRig's t = 0
 * would bend the hang by a gait's crouch and knee, and a mobile has no gait). A root's joint is its authored hang
 * point plus its source's offset; a child's joint is its parent's posed tip exactly, and its angle is its parent's
 * posed angle + its authored local angle + its source's local delta — the same local composition as an off-pass
 * tree bone, with the authored hang in place of the adapter's rest. The source evaluates at the part's own phase
 * (§11 ruling 2), and `amount` multiplies the local delta. A source the registry does not hold — a `phrase:<id>`
 * before P6 (#2118) registers the phrase sources — contributes nothing: the bone hangs at its authored rest while
 * its subtree composes from it (the mobile's only native), the entry waiting for P6 exactly as a tree bone's does.
 */
function poseMobileFigure(rig, t, opts) {
  const seedOffset = opts.seedOffset ?? 0;
  const tileKey = opts.tileKey ?? '';
  const posed = new Map();
  const out = [];
  for (const b of rig.bones) {
    // no native source exists to match, so readBoneMotion's native arm never fires: 'gait' / 'linkage' entries
    // (the door drops them; an unsanitized rig is read the same way) and unregistered sources read as absent
    const m = readBoneMotion(b.motion, null);
    let dRot = 0;
    let dx = 0;
    let dy = 0;
    if (m && !m.native) {
      const d = m.src.evaluate(
        { key: b.id, seedOffset, phase01: kinemePhase(seedOffset, `${tileKey}#${b.id}`) },
        t,
        {},
      );
      dRot = (d.dRot || 0) * m.amount;
      dx = (d.dx || 0) * m.amount;
      dy = (d.dy || 0) * m.amount;
    }
    const parent = b.parent ? posed.get(b.parent) : null;
    let x;
    let y;
    let angle;
    if (parent) {
      x = parent.tx;
      y = parent.ty;
      angle = parent.angle + b.angle + dRot;
    } else {
      x = b.x + dx;
      y = b.y + dy;
      angle = b.angle + dRot;
    }
    const p = {
      id: b.id,
      role: b.role,
      x,
      y,
      tx: x + Math.cos(rad(angle)) * b.len,
      ty: y + Math.sin(rad(angle)) * b.len,
      angle,
      len: b.len,
    };
    posed.set(b.id, p);
    out.push(p);
  }
  return out;
}

/**
 * The whole figure posed at time t: posed bones in poseRig's / poseLinkage's own shape (joint, tip, angle, len —
 * the shape placePart consumes), honouring each bone's baked `motion` (step 3.1; figures-spec §6). A figure with
 * no motion anywhere returns the native evaluator's bones untouched — Object.is per bone. opts: `{ gait | face,
 * phase, drive, crank, motion, seedOffset, tileKey }` — seedOffset + tileKey are the placed copy's, so a kineme
 * bone evaluates at its own part's phase. A mobile (`figure: 'mobile'`) poses from its authored rest instead
 * (step 3.2). For a roam pass opts.roam; the result is `{ body: delta }` with the extension fields (including
 * `moving`), as it has always been.
 */
export function poseFigure(figure, t, opts = {}) {
  if (opts.roam) return { body: roamEvaluate({ key: 'body' }, t, { roam: opts.roam }) };
  if (figure && figure.figure === 'mobile' && Array.isArray(figure.bones)) return poseMobileFigure(figure, t, opts);
  if (figure && Array.isArray(figure.bones)) return poseTreeFigure(figure, t, opts);
  if (figure && figure.measures) return poseLinkageFigure(figure, t, opts);
  return [];
}
