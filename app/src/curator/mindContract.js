// mindContract.js — #1462 Mind 1: what a persona may be asked and what a reply may contain. Pure, fail-closed.
//
// The model path (a local sidecar, later) answers a persona's question with JSON; nothing it says is trusted. Every
// reply passes through validateReply, which returns a clean copy or null. A null reply is DROPPED and logged by the
// thinker; it never reaches the stage. The rules backend (the fallback forever) answers through the same validator.
export const PERSONAS = Object.freeze(['davis', 'lois', 'queen']);
export const MOODS = Object.freeze(['calm', 'drive', 'lift', 'sparse', 'shift', 'weird']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 64) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
// out of range is malformed, not clamped: an untrusted reply that says 7 has told us something is wrong
const unit = (v) => (Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);

/** Davis: propose adding one asset to the cast, or nothing. */
function davis(r) {
  if (r.propose === null) return { propose: null };
  if (!isObj(r.propose)) return null;
  const assetId = str(r.propose.assetId);
  if (!assetId) return null;
  return { propose: { assetId } };
}

/** LOIS: one critique with a target and a small signed nudge, or none. */
function lois(r) {
  if (r.critique === null) return { critique: null };
  if (!isObj(r.critique)) return null;
  const target = str(r.critique.target, 40);
  const delta = Number(r.critique.delta);
  if (!target || !Number.isFinite(delta) || Math.abs(delta) > 0.25) return null;
  return { critique: { target, delta } };
}

/** The Queen: the mood she hears in the room, and optional gentle leans (0..1). */
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
  return { mood, lean };
}

const BY_PERSONA = { davis, lois, queen };

/** The reply as a clean object, or null. Unknown keys are dropped, never passed on. */
export function validateReply(persona, reply) {
  const f = BY_PERSONA[persona];
  if (!f || !isObj(reply)) return null;
  try { return f(reply); } catch { return null; }
}

/** A reply that means "nothing to say": what the rules backend gives when it has no opinion. */
export function neutralReply(persona) {
  if (persona === 'davis') return { propose: null };
  if (persona === 'lois') return { critique: null };
  return { mood: 'calm', lean: {} };
}
