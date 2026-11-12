// engine/motionCore/index.js — Motion Core P1 (#2112, epic #2109): the contract and the registry.
//
// Every motion source (a GPU kineme, a gait, a linkage, a CPU driver, a transport) gets ONE shape, so they can be
// composed. This phase adds the contract only: NOTHING EXISTING CALLS IT. Pure and browser-safe: no React, no store, no
// GL, no clock of its own. It imports only the kernel cost registry (the repo's own pattern for a frozen, validated
// registry) and never anything from gl/, state/, curator/ or panels/.
//
// The laws it enforces:
//   - ANCHOR LAW: at motion time 0 every delta is exactly zero, so a still is byte-identical to no motion. A source
//     whose evaluate(node, 0, ctx) is not POSE_IDENTITY cannot be registered (probed with two nodes by default; a source
//     may declare its own `anchorNodes`, see registerMotionSource — the GPU kinemes use phase-0 nodes only, because their
//     seed-hashed phase is a desync OFFSET on the node, not a pose: #2113).
//   - DETERMINISM: no Date.now / performance.now / Math.random. A node's phase comes from the house seed hash
//     (data/kinemes.js `kinemePhase(seedOffset, key)`), never from chance.
//
// The motion map (docs/design/motion-map.md, question 1) found SIX time bases that move marks, not three, and that two
// of them (`kinemeTime`, `driverSec`) can diverge. TIME_BASES names all of them plus the musical clock, and timeFor()
// never substitutes one for another: a view that lacks the clock a source asks for throws instead of falling back.
import { getCostTier } from '../kernel/costRegistry.mjs';

/**
 * A pose delta, measured FROM REST. dx / dy are in the node's own units, dRot is degrees clockwise, sx / sy are
 * multipliers (1 = rest), dAlpha is an additive opacity change.
 * @typedef {{ dx: number, dy: number, dRot: number, sx: number, sy: number, dAlpha: number }} Pose
 */
/** The rest pose: no motion. Frozen. */
export const POSE_IDENTITY = Object.freeze({ dx: 0, dy: 0, dRot: 0, sx: 1, sy: 1, dAlpha: 0 });

/**
 * A node a source moves: a plain record. `phase01` comes from the house seed hash (`kinemePhase`), never random.
 * @typedef {{ key: string, seedOffset: number, phase01: number, bounds?: object, parent?: object }} MotionNode
 */

/** The families a source may declare. */
export const MOTION_FAMILIES = Object.freeze(['kineme', 'gait', 'linkage', 'driver', 'transport']);

/**
 * The time bases (motion map, question 1), and where each reads in a clock view:
 *   seconds  loop time in seconds (the root; stops on pause/hold)         view.seconds
 *   kineme   `kinemeTime`: loop seconds at kinemeRate × the audio route    view.kinemeSeconds
 *   driver   `driverSec`: loop seconds at kinemeRate only (CPU drivers)    view.driverSeconds
 *   frames   a resolver-frame counter (moth growth, dish creature, pose)   view.frame
 *   travel   the travel integrator's accumulated state                      view.travel
 *   boil     the boil step (loop second snapped to a low fps)               view.boilStep
 *   bars     the musical clock, in bars                                     view.bar / beat / phase
 */
export const TIME_BASES = Object.freeze(['seconds', 'kineme', 'driver', 'frames', 'travel', 'boil', 'bars']);

/**
 * What the clock tells a source. Musical fields follow the repo's musical clock (gl/musicalClock.mjs): `bar` and `beat`
 * are 0-BASED, `phase` is 0..1 within the beat. `seconds` / `frame` / `bars` may be omitted when `bpm` (and `fps`) allow
 * deriving them from the musical position.
 * @typedef {{ seconds?: number, frame?: number, bar?: number, beat?: number, phase?: number, bpm?: number,
 *   fps?: number, beatsPerBar?: number, kinemeSeconds?: number, driverSeconds?: number, travel?: number,
 *   boilStep?: number }} ClockView
 */

/**
 * A motion source: a pure function of (node, t, ctx).
 * @typedef {{ id: string, family: string, timeBase: string, costTier: string,
 *   evaluate: (node: MotionNode, t: number, ctx?: object) => Partial<Pose> }} MotionSource
 */

const POSE_KEYS = Object.keys(POSE_IDENTITY);
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** A complete, frozen Pose from a possibly sparse delta (a missing field is rest). Throws on a non-finite field. */
function toPose(p, what = 'pose') {
  if (p === null || typeof p !== 'object') throw new TypeError(`[motionCore] ${what} must be an object`);
  const out = {};
  for (const k of POSE_KEYS) {
    const v = p[k] === undefined ? POSE_IDENTITY[k] : p[k];
    if (!isFiniteNumber(v)) throw new TypeError(`[motionCore] ${what}.${k} must be a finite number (got ${String(v)})`);
    out[k] = v;
  }
  return Object.freeze(out);
}

/**
 * Compose two deltas in order: parent `a` then child `b`, or two stacked sources on one node. Offsets and rotation add,
 * scales multiply, alpha adds. This stacks deltas measured from rest; it is NOT a transform-matrix composition (a
 * rotated parent does not rotate its child's offset). That is a later phase's question. POSE_IDENTITY is neutral.
 * @returns {Pose}
 */
export function composePose(a, b) {
  const p = toPose(a, 'composePose a');
  const q = toPose(b, 'composePose b');
  return Object.freeze({
    dx: p.dx + q.dx,
    dy: p.dy + q.dy,
    dRot: p.dRot + q.dRot,
    sx: p.sx * q.sx,
    sy: p.sy * q.sy,
    dAlpha: p.dAlpha + q.dAlpha,
  });
}

/** Position on the musical clock in beats, or null when the view carries no musical position. */
function musicalBeats(view) {
  if (!isFiniteNumber(view.bar)) return null;
  const per = isFiniteNumber(view.beatsPerBar) && view.beatsPerBar > 0 ? view.beatsPerBar : 4;
  const beat = isFiniteNumber(view.beat) ? view.beat : 0;
  const phase = isFiniteNumber(view.phase) ? view.phase : 0;
  return { beats: view.bar * per + beat + phase, per };
}

function secondsOf(view) {
  if (isFiniteNumber(view.seconds)) return view.seconds;
  const m = musicalBeats(view);
  if (m && isFiniteNumber(view.bpm) && view.bpm > 0) return (m.beats * 60) / view.bpm;
  return null;
}

/**
 * The value of a source's time base, read from a clock view. EXACT: it maps the view's own numbers, and never falls
 * back from one base to another (the map found `kinemeTime` and `driverSec` can diverge, so substituting one would hide
 * it). Throws a TypeError when the view lacks what the source's base needs.
 * @param {{ timeBase: string }} source
 * @param {ClockView} clockView
 * @returns {number}
 */
export function timeFor(source, clockView) {
  const base = source && source.timeBase;
  if (!TIME_BASES.includes(base)) throw new TypeError(`[motionCore] unknown time base "${String(base)}"`);
  const view = clockView && typeof clockView === 'object' ? clockView : {};
  const need = (value, field) => {
    if (!isFiniteNumber(value)) throw new TypeError(`[motionCore] time base "${base}" needs clockView.${field}`);
    return value;
  };
  switch (base) {
    case 'seconds':
      return need(secondsOf(view), 'seconds (or bar/beat/phase with bpm)');
    case 'kineme':
      return need(view.kinemeSeconds, 'kinemeSeconds');
    case 'driver':
      return need(view.driverSeconds, 'driverSeconds');
    case 'frames': {
      if (isFiniteNumber(view.frame)) return view.frame;
      const s = secondsOf(view);
      return need(s !== null && isFiniteNumber(view.fps) && view.fps > 0 ? Math.floor(s * view.fps) : null, 'frame (or seconds with fps)');
    }
    case 'travel':
      return need(view.travel, 'travel');
    case 'boil':
      return need(view.boilStep, 'boilStep');
    case 'bars': {
      const m = musicalBeats(view);
      if (m) return m.beats / m.per;
      const s = secondsOf(view);
      const per = isFiniteNumber(view.beatsPerBar) && view.beatsPerBar > 0 ? view.beatsPerBar : 4;
      return need(s !== null && isFiniteNumber(view.bpm) && view.bpm > 0 ? (s * view.bpm) / (60 * per) : null, 'bar (or seconds with bpm)');
    }
    default:
      throw new TypeError(`[motionCore] unknown time base "${String(base)}"`);
  }
}

// The probe nodes the anchor law is checked against at registration: one at phase 0, one off it, so a source that
// bakes the node's phase into its t = 0 value is caught.
const PROBE_NODES = Object.freeze([
  Object.freeze({ key: 'probe#a', seedOffset: 0, phase01: 0 }),
  Object.freeze({ key: 'probe#b', seedOffset: 7, phase01: 0.37 }),
]);

const registry = new Map();

/**
 * Register a motion source. Throws on a duplicate id, a malformed record, an unknown family / time base, an
 * unregistered cost tier, or a source whose evaluate(node, 0, ctx) is not POSE_IDENTITY (the anchor law).
 *
 * `anchorNodes` (optional, #2113): the nodes the anchor law is probed against, in place of the default pair. A source
 * whose motion is a seed-phased cycle (the GPU kinemes: `ph = fract(t / period + phase)`) starts a phased node PART WAY
 * through its cycle by design, so its rest is the PHASE-0 node: it declares phase-0 nodes only. Every other source keeps
 * the default pair (phase 0 and phase 0.37). Must be a non-empty array of nodes, each with a string `key` and a finite
 * `phase01` in [0, 1); the probe is never skipped.
 * @param {MotionSource & { anchorNodes?: MotionNode[] }} source
 * @returns {Readonly<MotionSource>} the frozen record
 */
export function registerMotionSource(source) {
  if (source === null || typeof source !== 'object') throw new TypeError('[motionCore] a motion source must be an object');
  const { id, family, timeBase, costTier, evaluate, anchorNodes } = source;
  if (typeof id !== 'string' || !id) throw new TypeError('[motionCore] a motion source needs a non-empty string id');
  if (registry.has(id)) throw new Error(`[motionCore] "${id}" is already registered (duplicate motion source id)`);
  if (!MOTION_FAMILIES.includes(family)) {
    throw new TypeError(`[motionCore] "${id}": unknown family "${String(family)}" (${MOTION_FAMILIES.join(' | ')})`);
  }
  if (!TIME_BASES.includes(timeBase)) {
    throw new TypeError(`[motionCore] "${id}": unknown time base "${String(timeBase)}" (${TIME_BASES.join(' | ')})`);
  }
  if (typeof costTier !== 'string' || !getCostTier(costTier)) {
    throw new TypeError(`[motionCore] "${id}": costTier "${String(costTier)}" is not a registered cost tier id`);
  }
  if (typeof evaluate !== 'function') throw new TypeError(`[motionCore] "${id}": evaluate must be a function`);
  let probes = PROBE_NODES;
  if (anchorNodes !== undefined) {
    const ok =
      Array.isArray(anchorNodes) &&
      anchorNodes.length > 0 &&
      anchorNodes.every(
        (n) => n && typeof n === 'object' && typeof n.key === 'string' && isFiniteNumber(n.phase01) && n.phase01 >= 0 && n.phase01 < 1,
      );
    if (!ok) throw new TypeError(`[motionCore] "${id}": anchorNodes must be a non-empty array of nodes with a key and a phase01 in [0, 1)`);
    probes = anchorNodes.map((n) => Object.freeze({ ...n }));
  }
  for (const node of probes) {
    const at0 = toPose(evaluate(node, 0, {}), `"${id}" evaluate(probe, 0)`);
    for (const k of POSE_KEYS) {
      if (at0[k] !== POSE_IDENTITY[k]) {
        throw new Error(
          `[motionCore] "${id}" breaks the anchor law: evaluate(node, 0) gave ${k} = ${at0[k]}, rest is ${POSE_IDENTITY[k]}`,
        );
      }
    }
  }
  const record = Object.freeze({
    id,
    family,
    timeBase,
    costTier,
    evaluate,
    ...(anchorNodes !== undefined ? { anchorNodes: Object.freeze(probes) } : {}),
  });
  registry.set(id, record);
  return record;
}

/** One registered source, or undefined. */
export function getMotionSource(id) {
  return registry.get(id);
}

/** Every registered source, in registration order (for the census). */
export function listMotionSources() {
  return [...registry.values()];
}
