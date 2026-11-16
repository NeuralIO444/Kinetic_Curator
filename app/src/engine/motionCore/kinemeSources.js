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
//        kind 7 orbit   (#2116): kOff = box * |km.z| * Rot(2 pi phase) * (cos th - 1, +/- sin th), th = 2 pi fract(t / per) — see orbitPose
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
import { KINEMES, KINEME_STACKS, KINEME_KINDS, SCATTER_WINDOW, SCATTER_RIPPLE, getKinemePhrase, KINEME_PHRASES } from '../../data/kinemes.js';
import { musicalView, resolvePhrase, phraseCycleAt, phrasePairFades, PHRASE_BEATS_PER_BAR } from '../../data/kinemePhrases.js';
import { registerCostTier } from '../kernel/costRegistry.mjs';
import { registerMotionSource, composePose, POSE_IDENTITY } from './index.js';

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

/**
 * kind 7 (#2116, the shader's orbit branch): a circle of radius box x |amp| that passes through home, leaning at the node's
 * phase; a negative amp circles the other way. `brk[0]` is the mark's box side in scene units (the shader's a_brk.x for a
 * region; for a whole mark the shader reads 100 x the quad's larger scale, so pass that). cos(th) - 1 is written
 * -2 sin^2(th / 2), as the shader writes it, so t = 0 is exactly (0, 0) for EVERY phase. -> dx, dy.
 */
export function orbitPose(kineme, t, phase01, brk = [0, 0]) {
  const th = TAU * fract(t / Math.max(kineme.period, 1e-3));
  const h = Math.sin(0.5 * th);
  const ox = -2 * h * h;
  const oy = (kineme.amp < 0 ? -1 : 1) * Math.sin(th);
  const la = TAU * phase01;
  const lc = Math.cos(la);
  const ls = Math.sin(la);
  const r = brk[0] * Math.abs(kineme.amp);
  return { dx: r * (ox * lc - oy * ls) + 0, dy: r * (ox * ls + oy * lc) + 0 }; // + 0: a rest of -0 reads as 0
}

const BY_KIND = Object.freeze({
  [KINEME_KINDS.spin]: spinPose,
  [KINEME_KINDS.osc]: oscPose,
  [KINEME_KINDS.pulse]: pulsePose,
  [KINEME_KINDS.blink]: blinkPose,
  [KINEME_KINDS.bob]: bobPose,
  [KINEME_KINDS.scatter]: scatterPose,
  [KINEME_KINDS.orbit]: orbitPose,
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
    // a scatter or orbit node carries its packed break-up vector as `node.brk` (the shader's a_brk); others ignore it
    evaluate: (node, t) => kinemePose(k, t, node && Number.isFinite(node.phase01) ? node.phase01 : 0, node && node.brk),
  });
}

// #2117 — stacking: a compound kineme is its two members through composePose (rotations and offsets add, scales and
// visibility multiply: the same combine QUAD_VS runs for a stack, same phase). The shader multiplies `c` twice ((c·sa)·sb)
// where composePose forms sa·sb first, so the two can differ by one ulp on a pulse member — the selfcheck holds that bound.
registerCostTier('motionCore/kineme-stack', {
  tier: 0,
  notes: '#2117 CPU reference of a two-kineme stack. No per-frame caller yet; two evaluates and a compose.',
});
const SINGLE = new Map(KINEMES.map((k) => [k.id, k]));
/** The pose of a stack of two library kinemes (records, not ids): the two members composed, one shared phase. */
export function stackPose(a, b, tSec, phase01 = 0) {
  return composePose(kinemePose(a, tSec, phase01), kinemePose(b, tSec, phase01));
}
for (const st of KINEME_STACKS) {
  const [a, b] = st.stack.map((id) => SINGLE.get(id));
  registerMotionSource({
    id: kinemeSourceId(st.id),
    family: 'kineme',
    timeBase: 'kineme',
    costTier: 'motionCore/kineme-stack',
    anchorNodes: ANCHOR_NODES,
    evaluate: (node, t) => stackPose(a, b, t, node && Number.isFinite(node.phase01) ? node.phase01 : 0),
  });
}

// #2118 — phrases: motion sequenced on the bar (docs/design/kineme-phrases-spec.md). The pose of a phrase mark is its active
// step's kineme at the cycle position the musical clock gives it (period snapped to whole beats), and over the last beat of
// a step the outgoing and incoming kinemes cross-faded per accumulator — the law the contract's table entries and QUAD_VS's
// fade weight reproduce. Resolution is data/kinemePhrases.js; this is its CPU reference.
registerCostTier('motionCore/kineme-phrase', {
  tier: 0,
  notes:
    '#2118 kineme phrases. Contract-time arithmetic per phrase mark: one walk of at most 8 steps, one hash, two table lookups. ' +
    'GPU: the existing kineme evaluation (two members during a fade beat). Sheds with the kineme / region ladder; no rung of its own.',
});

/** A pose scaled toward rest by weight w in [0, 1] — the fade of one member (offsets, rotation and alpha scale; scales ease to 1). */
export function fadePose(p, w) {
  const q = { ...POSE_IDENTITY, ...p };
  return {
    dx: w * q.dx + 0,
    dy: w * q.dy + 0,
    dRot: w * q.dRot + 0,
    sx: 1 + w * (q.sx - 1),
    sy: 1 + w * (q.sy - 1),
    dAlpha: w * q.dAlpha + 0,
  };
}

/**
 * The pose of a phrase (a resolved record, getKinemePhrase) at a musical view ({ pos | bar, beat, phase, bpm, cyc? }) for a
 * mark's seed phase. `brk` is the packed break-up vector a scatter / orbit step reads.
 */
export function phrasePose(phrase, view, phase01 = 0, brk) {
  const v = musicalView(view);
  const r = resolvePhrase(phrase, v, phase01);
  // inside a phrase a kineme's cycle position is the musical clock's: evaluate it at t = c on a period of one
  const at = (k) => kinemePose({ ...k, period: 1 }, phraseCycleAt(k, v), phase01, brk);
  if (!r.in || !phrasePairFades(r.out, r.in)) return composePose(at(r.out), POSE_IDENTITY);
  return composePose(fadePose(at(r.out), 1 - r.w), fadePose(at(r.in), r.w));
}

/** The source id a phrase registers under. */
export const phraseSourceId = (id) => `kineme-phrase:${id}`;

for (const p of KINEME_PHRASES) {
  const phrase = getKinemePhrase(p.id);
  registerMotionSource({
    id: phraseSourceId(p.id),
    family: 'kineme',
    timeBase: 'bars',
    costTier: 'motionCore/kineme-phrase',
    anchorNodes: ANCHOR_NODES, // a phased mark starts at its offset bar by design: its rest is the phase-0 node at bar 0
    // t is in bars; ctx may carry the tempo (`bpm`, default 120) and the phrase clock's folded cycle positions (`cyc`)
    evaluate: (node, tBars, ctx) =>
      phrasePose(
        phrase,
        { pos: tBars * PHRASE_BEATS_PER_BAR, bpm: ctx && ctx.bpm, cyc: ctx && ctx.cyc },
        node && Number.isFinite(node.phase01) ? node.phase01 : 0,
        node && node.brk,
      ),
  });
}
