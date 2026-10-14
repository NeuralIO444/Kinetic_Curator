// mindRecord.js — #1462 Mind 1: a take carries every persona decision verbatim, so a replay never calls a backend.
//
// Each row: [frame, persona, bar, backend, seed, invented (0|1), request (0|1), reply]. `invented` keeps the books
// honest (an invented state is never passed off as a measured verdict); `request` says whether the decision asked the
// stage for something (mind:request on the next downbeat). THE LOG WINS like the other take sections: on playback
// these rows are re-published as they were, and no backend — not even the rules — is asked again.
import { validateReply, isInvented, PERSONAS } from './mindContract.js';
import { BACKENDS } from './mindThinker.js';

export const MIND_RECORD_VERSION = 1;
/** A take is at most 20 minutes of frames; three personas, one decision a bar, stays far below this. */
export const MIND_RECORD_MAX = 20000;

/** Recorder. `getFrame()` returns the take's current frame index. */
export function createMindRecorder({ getFrame = () => 0 } = {}) {
  const rows = [];
  return {
    /** A decision as mindLive published it, and whether it asked the stage for something. */
    update(d, requested) {
      if (!d || rows.length >= MIND_RECORD_MAX) return;
      rows.push([getFrame() | 0, d.persona, d.bar, d.backend, d.seed >>> 0, d.invented ? 1 : 0, requested ? 1 : 0,
        JSON.parse(JSON.stringify(d.reply))]);
    },
    finish() { return { version: MIND_RECORD_VERSION, decisions: rows.map((r) => r.slice()) }; },
  };
}

/** Fail-closed check: the record, or null. Every reply must still pass the contract; frames must not go backwards. */
export function checkMindRecord(r) {
  if (!r || typeof r !== 'object' || r.version !== MIND_RECORD_VERSION || !Array.isArray(r.decisions)) return null;
  if (r.decisions.length > MIND_RECORD_MAX) return null;
  let prev = -1;
  for (const d of r.decisions) {
    if (!Array.isArray(d) || d.length !== 8) return null;
    const [frame, persona, bar, backend, seed, invented, request, reply] = d;
    if (!Number.isInteger(frame) || frame < prev || !PERSONAS.includes(persona) || !Number.isInteger(bar)) return null;
    if (!BACKENDS.includes(backend) || !Number.isInteger(seed) || (invented !== 0 && invented !== 1)) return null;
    if (request !== 0 && request !== 1) return null;
    const clean = validateReply(persona, reply);
    if (!clean || isInvented(persona, clean) !== (invented === 1)) return null;
    prev = frame;
  }
  return r;
}

/** A row back to the decision mindLive published. */
export function decisionOf(row) {
  const [, persona, bar, backend, seed, invented, , reply] = row;
  return { persona, bar, backend, seed, invented: invented === 1, reply: JSON.parse(JSON.stringify(reply)) };
}

/**
 * The replay cursor for one take's record. step(frame) returns the rows recorded at frames the cursor has passed
 * since the last step (in order); seek(frame) moves the cursor without returning anything (a seek re-plays nothing).
 * A record that fails the check replays nothing.
 */
export function createMindReplay(record) {
  const rows = checkMindRecord(record) ? record.decisions : [];
  let next = 0; // the first row not yet returned
  const firstAt = (frame) => { let i = 0; while (i < rows.length && rows[i][0] < frame) i++; return i; };
  return {
    step(frame) {
      const out = [];
      while (next < rows.length && rows[next][0] <= frame) out.push(rows[next++]);
      return out;
    },
    seek(frame) { next = firstAt(frame); },
    get size() { return rows.length; },
  };
}
