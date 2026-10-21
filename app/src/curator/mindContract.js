// mindContract.js — #1462 Mind 1: what a persona may be asked and what a reply may contain. Pure, fail-closed.
//
// A backend (Apple Intelligence through the Swift helper when it is up, the rules otherwise) answers a persona's
// question with JSON; nothing it says is trusted. Every reply passes through validateReply, which returns a clean copy
// or null. A null reply is DROPPED and logged by the thinker; it never reaches the stage.
//
// Spec update (Matt, 2026-10-13): replies are SHAPE-validated, not membership-validated. Beyond the canonical states a
// reply may propose an INVENTED state { id, intensity 0..1, decay } — the affect layer may grow its own micro-
// expressions. The books stay honest: every decision records `invented: true|false` (isInvented below), so a take
// never passes an invented state off as a measured verdict.
import { validateRouteOp } from './mindConduct.js'; // #1483: Davis's route edits

export const PERSONAS = Object.freeze(['davis', 'lois', 'queen']);
export const MOODS = Object.freeze(['calm', 'drive', 'lift', 'sparse', 'shift', 'weird']);
/** The canonical states each face already has (the honest feed's codes). Anything else well-formed is invented. */
export const CANONICAL_STATES = Object.freeze({
  lois: Object.freeze(['NOD', 'VIBE', 'BURN', 'AWAY', 'CUT']),
  davis: Object.freeze(['FLOW', 'SEEDLING', 'UGLY', 'STUCK', 'BLOOM', 'TIGHT']),
});
/** A state's decay, in bars (musical time, never a wall clock). 0 = hold until the next decision. */
export const MAX_DECAY_BARS = 64;
/** The longest line a persona may return. */
export const MAX_LINE = 140;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 64) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
// out of range is malformed, not clamped: an untrusted reply that says 7 has told us something is wrong
const unit = (v) => (Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
const STATE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

/**
 * A face state: a canonical code as a bare string, or { id, intensity, decay }. Returns
 *   undefined  when the reply has no `state` key (nothing said about the face)
 *   null       when `state` is present but malformed (the whole reply is dropped)
 *   { id, intensity, decay } otherwise. Canonical ids are upper-cased to their code; invented ids keep their spelling.
 */
function faceState(persona, raw) {
  if (raw === undefined) return undefined;
  const canon = CANONICAL_STATES[persona];
  if (typeof raw === 'string') {
    const code = raw.toUpperCase();
    return canon.includes(code) ? { id: code, intensity: 1, decay: 0 } : null; // a bare string must be canonical
  }
  if (!isObj(raw) || typeof raw.id !== 'string' || !STATE_ID.test(raw.id)) return null;
  const intensity = unit(raw.intensity);
  const decay = raw.decay === undefined ? 0 : raw.decay;
  if (intensity === null || !Number.isInteger(decay) || decay < 0 || decay > MAX_DECAY_BARS) return null;
  const code = raw.id.toUpperCase();
  return { id: canon.includes(code) ? code : raw.id, intensity, decay };
}

/** The optional `state` and `line` a face reply may carry; null when either is malformed. */
function faceExtras(persona, r) {
  const out = {};
  const state = faceState(persona, r.state);
  if (state === null) return null;
  if (state !== undefined) out.state = state;
  if (r.line !== undefined) {
    const line = str(typeof r.line === 'string' ? r.line.trim() : r.line, MAX_LINE);
    if (!line) return null;
    out.line = line;
  }
  return out;
}

/** Davis: propose adding one asset to the cast, or nothing; optionally a route edit, a face state and a line. */
function davis(r) {
  let propose;
  if (r.propose === null) propose = null;
  else {
    if (!isObj(r.propose)) return null;
    const assetId = str(r.propose.assetId);
    if (!assetId) return null;
    propose = { assetId };
  }
  // #1483 — while audio is live he may also propose one edit to the route table (add / remove / retarget / depth)
  const route = validateRouteOp(r.route);
  if (route === false) return null;
  const extra = faceExtras('davis', r);
  return extra && { propose, ...(route ? { route } : {}), ...extra };
}

/** LOIS: one critique with a target and a small signed nudge, or none; optionally a face state and a line. */
function lois(r) {
  let critique;
  if (r.critique === null) critique = null;
  else {
    if (!isObj(r.critique)) return null;
    const target = str(r.critique.target, 40);
    const delta = Number(r.critique.delta);
    if (!target || !Number.isFinite(delta) || Math.abs(delta) > 0.25) return null;
    critique = { target, delta };
  }
  const extra = faceExtras('lois', r);
  return extra && { critique, ...extra };
}

/** The third: the mood heard in the room, optional gentle leans (0..1) and an optional surge (0..1, #1576 Q3).
 * Nothing surface-facing. */
function queen(r) {
  const mood = MOODS.includes(r.mood) ? r.mood : null;
  if (!mood) return null;
  const lean = {};
  if (r.lean !== undefined) {
    if (!isObj(r.lean)) return null;
    for (const k of ['wetness', 'evolve']) {
      if (r.lean[k] !== undefined) { const v = unit(r.lean[k]); if (v === null) return null; lean[k] = v; }
    }
  }
  let surge;
  if (r.surge !== undefined && r.surge !== null) { surge = unit(r.surge); if (surge === null) return null; }
  return { mood, lean, ...(surge > 0 ? { surge } : {}) };
}

const BY_PERSONA = { davis, lois, queen };

/** The reply as a clean object, or null. Unknown keys are dropped, never passed on. */
export function validateReply(persona, reply) {
  const f = BY_PERSONA[persona];
  if (!f || !isObj(reply)) return null;
  try { return f(reply); } catch { return null; }
}

/** True when a VALIDATED reply carries a state that is not one of the persona's canonical codes. */
export function isInvented(persona, reply) {
  const canon = CANONICAL_STATES[persona];
  return !!(canon && reply && reply.state && !canon.includes(reply.state.id));
}

/**
 * Does a validated reply ask the stage for anything, given the room as it stands? A canonical state the face already
 * shows, no proposal, no critique and no line is a reading, not a request. The third never asks the stage directly.
 */
export function wantsStage(persona, reply, room = {}) {
  if (!reply || persona === 'queen') return false;
  if (reply.line) return true;
  if (persona === 'davis' && reply.propose) return true;
  if (persona === 'davis' && reply.route) return true; // #1483: a route edit asks the stage (the conductor gates it)
  if (persona === 'lois' && reply.critique) return true;
  if (!reply.state) return false;
  const showing = room && room[persona];
  return !(reply.state.id === showing && reply.state.intensity === 1 && reply.state.decay === 0);
}

/** A reply that means "nothing to say": what the rules backend gives when it has no opinion. */
export function neutralReply(persona) {
  if (persona === 'davis') return { propose: null };
  if (persona === 'lois') return { critique: null };
  return { mood: 'calm', lean: {} };
}
