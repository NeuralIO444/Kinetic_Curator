// engine/motionCore/kinemeSources.js — Motion Core P2a (#2113, epic #2109): the GPU kineme library as motion sources,
// with a CPU reference. NOTHING CALLS THIS YET (the renderer still evaluates kinemes in QUAD_VS); registering the
// sources only makes the library readable through the Motion Core contract, and proves the shader's math on the CPU.
//
// The formulas are TRANSCRIBED from QUAD_VS (gl/shaders.mjs), not redesigned. For one instance the shader does:
//
//   161  vec3 km = u_kineme[slot];                       km = (kind, period s, amp)
//   162  float per = max(km.y, 1e-3);
//   163  float ph = fract(u_kinemeTime / per + a_inst4.w);   a_inst4.w = the instance's seed-hashed phase01
//   164  float wav = sin(ph * 6.28318530718);
//   166  kind 1 spin :  kDeg = (km.z < 0.0 ? -ph : ph) * 360.0   (#1127: a negative amp turns the other way)
//   167  kind 2 osc  :  kDeg = km.z * wav
//   168  kind 3 pulse:  c *= 1.0 + km.z * wav                    (c = the quad's own scaled offset: sx = sy = 1 + amp*wav)
//   169  kind 4 blink:  kVis = ph < km.z ? 1.0 : 0.0             (km.z is the duty; v_opacity = a_inst1.y * kVis, :229)
//   170  kind 5 bob  :  kOff = vec2(0.0, km.z * wav)             (added to the instance's world position, :226)
//   171+ kind 6 scatter (#2116): kOff = a_brk * (km.z * e), e from u = fract(t / per - phase * 0.4) — see scatterPose
//
// Pose mapping: spin / osc -> dRot (degrees); pulse -> sx, sy; bob -> dy (scene units); blink -> dAlpha, where the shader's
// opacity MULTIPLIER of 0 is written as dAlpha = -1 (hidden, if the consumer clamps alpha at 0) and visible as 0.
//
// ANCHOR LAW, honestly: the shader starts a PHASED instance part way through its cycle by design (`ph` at t = 0 is the
// phase itself: "copies of one asset never move in lockstep", data/kinemes.js kinemePhase). So these sources are exactly
// zero at t = 0 only for a PHASE-0 node, and that is the rest the registry probes (`anchorNodes`, #2113, motionCore).
// For a node with phase01 != 0, evaluate(node, 0) is the shader's own, non-rest, pose. A blink whose duty is 0 would be
// hidden at phase 0 and so cannot register (the probe says so); no library kineme has a zero duty.
//
// TIME BASE: the shader reads `u_kinemeTime`, the KINEME clock (loop seconds at the performer's kinemeRate × the audio
// route; createKinemeClock in data/kinemes.js), which is Motion Core's `kineme` base, not plain `seconds`. The sources
// declare `kineme` so a later phase converts the right clock.
//
// Browser-safe, pure: no clock, no chance (the phase comes from the node).
import { KINEMES, KINEME_KINDS, SCATTER_WINDOW, SCATTER_RIPPLE } from '../../data/kinemes.js';
import { registerCostTier } from '../kernel/costRegistry.mjs';
import { registerMotionSource } from './index.js';

const TAU = 6.28318530718; // the shader's literal, kept so the CPU reference matches it to the digit
const fract = (x) => x - Math.floor(x);

/** The shader's cycle position: ph = fract(t / max(period, 1e-3) + phase01). */
function cycle(kineme, t, phase01) {
  return fract(t / Math.max(kineme.period, 1e-3) + phase01);
}

/** kind 1 (shader line 166): a full turn per period; a negative amp reverses it. -> dRot. */
export function spinPose(kineme, t, phase01) {
  const ph = cycle(kineme, t, phase01);
  return { dRot: (kineme.amp < 0 ? -ph : ph) * 360 };
}
/** kind 2 (:167): an oscillation of ± amp degrees. -> dRot. */
export function oscPose(kineme, t, phase01) {
  return { dRot: kineme.amp * Math.sin(cycle(kineme, t, phase01) * TAU) };
}
/** kind 3 (:168): ± amp scale fraction, both axes. -> sx, sy. */
export function pulsePose(kineme, t, phase01) {
  const s = 1 + kineme.amp * Math.sin(cycle(kineme, t, phase01) * TAU);
  return { sx: s, sy: s };
}
/** kind 4 (:169): visible for the first `amp` (duty) fraction of the period. -> dAlpha (0 visible, -1 hidden). */
export function blinkPose(kineme, t, phase01) {
  return { dAlpha: cycle(kineme, t, phase01) < kineme.amp ? 0 : -1 };
}
/** kind 5 (:170): ± amp scene units along the screen's y. -> dy. */
export function bobPose(kineme, t, phase01) {
  return { dy: kineme.amp * Math.sin(cycle(kineme, t, phase01) * TAU) };
}

/**
 * kind 6 (#2116, the shader's scatter branch): out and back along `brk`, the packed break-up vector (scene units, direction x
 * mark box side; [0, 0] for a node with none). u = fract(t / per - phase * RIPPLE); out-and-back for the first WINDOW of the
 * cycle, hold at home for the rest. Zero at t = 0 for EVERY phase (WINDOW + RIPPLE <= 1) — not just phase 0. -> dx, dy.
 */
export function scatterPose(kineme, t, phase01, brk = [0, 0]) {
  const u = fract(t / Math.max(kineme.period, 1e-3) - phase01 * SCATTER_RIPPLE);
  const e = u < SCATTER_WINDOW ? 0.5 * (1 - Math.cos((TAU * u) / SCATTER_WINDOW)) : 0;
  const k = kineme.amp * e;
  return { dx: brk[0] * k, dy: brk[1] * k };
}

const BY_KIND = Object.freeze({
  [KINEME_KINDS.spin]: spinPose,
  [KINEME_KINDS.osc]: oscPose,
  [KINEME_KINDS.pulse]: pulsePose,
  [KINEME_KINDS.blink]: blinkPose,
  [KINEME_KINDS.bob]: bobPose,
  [KINEME_KINDS.scatter]: scatterPose,
});

/** The pose delta of a kineme record ({ kind, period, amp }) at motion time t (seconds) for an instance phase in [0, 1). */
export function kinemePose(kineme, tSec, phase01 = 0, brk) {
  const fn = kineme && BY_KIND[KINEME_KINDS[kineme.kind]];
  if (!fn) throw new TypeError(`[kinemeSources] unknown kineme kind "${String(kineme && kineme.kind)}"`);
  return fn(kineme, tSec, phase01, brk);
}

/** The source id a library kineme registers under. */
export const kinemeSourceId = (id) => `kineme:${id}`;

// Declared per the house rule for new per-frame CPU work: this adds none (no caller yet) and is pure arithmetic, so tier 0.
registerCostTier('motionCore/kineme-adapter', {
  tier: 0,
  notes: 'P2a CPU reference of the QUAD_VS kinds. No per-frame caller yet; a few multiplies and one sin per evaluate.',
});

// Phase-0 anchor nodes: the shader's rest is the phase-0 instance (see the header).
const ANCHOR_NODES = Object.freeze([Object.freeze({ key: 'kineme-anchor', seedOffset: 0, phase01: 0 })]);

for (const k of KINEMES) {
  registerMotionSource({
    id: kinemeSourceId(k.id),
    family: 'kineme',
    timeBase: 'kineme',
    costTier: 'motionCore/kineme-adapter',
    anchorNodes: ANCHOR_NODES,
    // a scatter node carries its packed break-up vector as `node.brk` (the shader's a_brk); others ignore it
    evaluate: (node, t) => kinemePose(k, t, node && Number.isFinite(node.phase01) ? node.phase01 : 0, node && node.brk),
  });
}
