// kinemePhrases.js — #2118 (Motion Core P6): the pure resolver for kineme PHRASES (docs/design/kineme-phrases-spec.md).
//
// A phrase (data/kinemes.js KINEME_PHRASES) is a looping list of steps { kineme, bars }. Everything here is a pure function
// of (phrase, the musical view, the mark's seed phase) — nothing is stored on a mark:
//
//   which step      localBar = mod(bar - floor(phase01 * totalBars), totalBars), walked through the steps' bars. The offset is
//                   the mark's own seed phase, in WHOLE bars, so a field of marks changes step in a ripple (ruled: staggered).
//   the cycle       inside a phrase a kineme's period snaps to a whole number of beats (ruled): beatsPerCycle =
//                   max(1, round(period * bpm / 60)), and its cycle position is counted in beats on the musical clock,
//                   c = fract(pos / beatsPerCycle). The count is from musical zero, the same for every mark, so all marks on
//                   one kineme share ONE table slot whatever their bar offset (the spec's budget, section 7).
//   no pop          over the LAST BEAT of a step the outgoing kineme plays at 1 - w and the incoming at w, with
//                   w = 0.5 * (1 - cos(pi * q)), q the beat's phase. Neighbouring steps of the same kineme do not fade.
//   a tempo change  createPhraseClock() is the fold that keeps c continuous when a new BPM rounds to a different beat count
//                   (it re-anchors, the way createKinemeClock re-anchors a rate change). Its output rides the view as `cyc`.
//
// Browser-safe, pure: no clock of its own, no chance.
import { KINEMES, KINEME_KINDS } from './kinemes.js';

/** Beats in a bar — the musical clock's own constant (gl/musicalClock.mjs BEATS_PER_BAR; a selfcheck holds them equal). */
export const PHRASE_BEATS_PER_BAR = 4;

/** The position a contract with no musical view resolves at (stills, exports): bar 0, the musical clock's initial tempo. */
export const STILL_MUSICAL = Object.freeze({ pos: 0, bar: 0, beat: 0, phase: 0, bpm: 120 });

const fract = (x) => x - Math.floor(x);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * A trusted musical view from a doc's `musical` field: { pos, bar, beat, phase, bpm, cyc? }. Anything malformed is the
 * still position. `pos` (beats) is authoritative when present; bar / beat / phase are re-derived from it so the three can
 * never disagree. `cyc` (per-kineme cycle positions from createPhraseClock) is kept only where finite.
 */
export function musicalView(raw) {
  if (!raw || typeof raw !== 'object') return STILL_MUSICAL;
  const bpm = fin(raw.bpm) && raw.bpm > 0 ? raw.bpm : STILL_MUSICAL.bpm;
  let pos = fin(raw.pos) ? raw.pos : null;
  if (pos === null) {
    if (!fin(raw.bar)) return STILL_MUSICAL;
    pos = raw.bar * PHRASE_BEATS_PER_BAR + (fin(raw.beat) ? raw.beat : 0) + (fin(raw.phase) ? raw.phase : 0);
  }
  if (!(pos >= 0)) pos = 0;
  const whole = Math.floor(pos);
  const view = {
    pos,
    bar: Math.floor(whole / PHRASE_BEATS_PER_BAR),
    beat: whole % PHRASE_BEATS_PER_BAR,
    phase: pos - whole,
    bpm,
  };
  if (raw.cyc && typeof raw.cyc === 'object') {
    const cyc = {};
    for (const k of KINEMES) if (fin(raw.cyc[k.id])) cyc[k.id] = fract(raw.cyc[k.id]);
    if (Object.keys(cyc).length) view.cyc = cyc;
  }
  return view;
}

/** Snap to beats (ruled): the whole number of beats one cycle of a kineme takes at this tempo — nearest, minimum one. */
export function beatsPerCycle(period, bpm) {
  return Math.max(1, Math.round((period * bpm) / 60));
}

/** The bar offset a mark starts the phrase at: its own seed phase spread over the phrase's length, in whole bars. */
export function phraseOffsetBars(phrase, phase01) {
  return Math.min(phrase.totalBars - 1, Math.max(0, Math.floor((Number(phase01) || 0) * phrase.totalBars)));
}

/** The step a mark is on at a bar: { index, step, barsIntoStep }. Pure in (phrase, bar, phase01). */
export function phraseStepAt(phrase, bar, phase01 = 0) {
  const total = phrase.totalBars;
  let local = (((Math.floor(bar) - phraseOffsetBars(phrase, phase01)) % total) + total) % total;
  for (let i = 0; i < phrase.steps.length; i++) {
    const s = phrase.steps[i];
    if (local < s.bars) return { index: i, step: s, barsIntoStep: local };
    local -= s.bars;
  }
  return { index: 0, step: phrase.steps[0], barsIntoStep: 0 }; // unreachable for a valid record
}

/** The cross-fade weight at phase q of the fade beat: a raised cosine, 0 at q = 0, 1 at q = 1, zero slope at both ends. */
export function fadeWeight(q) {
  const x = Math.min(1, Math.max(0, q));
  return 0.5 * (1 - Math.cos(Math.PI * x));
}

/**
 * What a mark plays now: `{ index, out, in, w }` — `out` the active step's kineme record; `in` the next step's, and `w` its
 * weight, only during the last beat of a step whose neighbour is a DIFFERENT kineme (else `in` is null and `w` is 0).
 * `view` is a musicalView().
 */
export function resolvePhrase(phrase, view, phase01 = 0) {
  const at = phraseStepAt(phrase, view.bar, phase01);
  const out = at.step.kineme;
  const next = phrase.steps[(at.index + 1) % phrase.steps.length].kineme;
  if (next.id !== out.id && at.barsIntoStep === at.step.bars - 1 && view.beat === PHRASE_BEATS_PER_BAR - 1) {
    const w = fadeWeight(view.phase);
    if (w > 0) return { index: at.index, out, in: next, w };
  }
  return { index: at.index, out, in: null, w: 0 };
}

/** A kineme's cycle position [0, 1) inside a phrase: the phrase clock's folded value when the view carries one, else the bare count. */
export function phraseCycleAt(kineme, view) {
  const folded = view.cyc && view.cyc[kineme.id];
  return fin(folded) ? folded : fract(view.pos / beatsPerCycle(kineme.period, view.bpm));
}

// ── the kineme table entry ────────────────────────────────────────────
// QUAD_VS evaluates every kind from u_kinemeTime / period. A phrase kineme's cycle position comes from the musical clock
// instead, so its entry carries a SYNTHETIC period chosen each contract so that kinemeTime / period = 1 + c: the shader's own
// lines then land on c with no shader change (and to within one float32 ulp of 2, ~2.4e-7 of a cycle, at any motion time).
// At motion time 0 (a still; a frozen kineme clock) any period gives cycle 0, which is the anchor law's rest.
const NEVER = 1e30;
const MIN_T = 0.004; // below this the synthetic period would dip under the shader's own 1e-3 floor: hold cycle 0
/** The period that puts the shader's `u_kinemeTime / per` on cycle position c at motion time t. */
export function phrasePeriod(c, t) {
  return t >= MIN_T ? t / (1 + c) : NEVER;
}

const BREAK_KINDS = new Set(['scatter', 'orbit']);
/** Two break-up kinds cannot share one fade: they read the one packed vector (a_brk) differently. Such a boundary cuts. */
export function phrasePairFades(out, into) {
  return !(BREAK_KINDS.has(out.kind) && BREAK_KINDS.has(into.kind));
}

/** The table entry of one phrase kineme at this contract: `{ kind, period, amp }` (amp scaled by `scale` for a fading pulse). */
function memberEntry(kineme, view, t, weight) {
  // Pulse is the one kind whose fade is applied through its amp (the shader folds a pulse straight into the quad);
  // every other kind's contribution is weighted in the shader by the slot's fade weight.
  const amp = kineme.kind === 'pulse' ? kineme.amp * weight : kineme.amp;
  return { kind: KINEME_KINDS[kineme.kind], period: phrasePeriod(phraseCycleAt(kineme, view), t), amp };
}
/** A steady phrase kineme's entry (one slot per kineme, shared by every phrase mark on it). */
export function phraseEntry(kineme, view, t) {
  return memberEntry(kineme, view, t, 1);
}
/** A fading pair's entry: the outgoing kineme, the incoming as `b`, and the slot's fade weight `f` = w. */
export function phrasePairEntry(out, into, w, view, t) {
  return { ...memberEntry(out, view, t, 1 - w), b: memberEntry(into, view, t, w), f: w };
}

// ── the tempo fold ────────────────────────────────────────────────────
/**
 * The phrase clock: per library kineme, its cycle position on the musical clock, continuous across a tempo change.
 * `at(view)` takes the musical clock's view ({ pos, bpm, ... }) and returns the doc's `musical` field: the view plus
 * `cyc: { kinemeId: c }`. While a kineme's beatsPerCycle is unchanged, c follows the beat position (which a tempo change
 * bends but never moves). When a new BPM rounds to a DIFFERENT beat count, the fold re-anchors at the current c, so the
 * cycle never jumps. A position that runs backwards (the loop restarted) restarts every anchor at zero. The anchors are the
 * whole state: plain numbers, JSON-safe, carried by a take the way the kineme clock's are (#1367).
 */
export function createPhraseClock() {
  let lastPos = 0;
  let anchors = {}; // kinemeId -> [anchorBeat, anchorCycle, beatsPerCycle]
  return {
    at(rawView) {
      const v = musicalView(rawView);
      if (v.pos < lastPos) anchors = {};
      lastPos = v.pos;
      const cyc = {};
      for (const k of KINEMES) {
        const bpc = beatsPerCycle(k.period, v.bpm);
        let a = anchors[k.id];
        if (!a) a = anchors[k.id] = [0, 0, bpc];
        const c = fract((v.pos - a[0]) / a[2] + a[1]);
        if (a[2] !== bpc) anchors[k.id] = [v.pos, c, bpc];
        cyc[k.id] = c;
      }
      return { pos: v.pos, bar: v.bar, beat: v.beat, phase: v.phase, bpm: v.bpm, cyc };
    },
    snapshotState() {
      return { lastPos, anchors: Object.fromEntries(Object.entries(anchors).map(([id, a]) => [id, [...a]])) };
    },
    restoreState(s) {
      if (!s || !fin(s.lastPos) || !s.anchors || typeof s.anchors !== 'object') return false;
      const next = {};
      for (const [id, a] of Object.entries(s.anchors)) {
        if (!Array.isArray(a) || a.length !== 3 || !a.every(fin) || !(a[2] >= 1)) return false;
        next[id] = [...a];
      }
      lastPos = s.lastPos;
      anchors = next;
      return true;
    },
  };
}
