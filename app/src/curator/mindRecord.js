// mindRecord.js — #1462 Mind 1: a take carries every persona decision verbatim, so a replay never calls a backend.
//
// Each row: [frame, persona, bar, backend, seed, invented (0|1), request (0|1), reply, traits?]. `invented` keeps the books
// honest (an invented state is never passed off as a measured verdict); `request` says whether the decision asked the
// stage for something (mind:request on the next downbeat). THE LOG WINS like the other take sections: on playback
// these rows are re-published as they were, and no backend — not even the rules — is asked again.
import { validateReply, isInvented, PERSONAS } from './mindContract.js';
import { BACKENDS } from './mindThinker.js';
import { checkTraits } from './mindPresence.js';
import { validateRouteOp } from './mindConduct.js'; // #1483: what became of Davis's route proposals

// #1464 Mind 3: a row may carry a 9th column, the personality layer's traits (tier, eased level, cool-down, her own
// move, a rest, the third's presence), so a take explains every behaviour from what it recorded. A take with traits is
// version 2; version 1 takes (8 columns) still play.
export const MIND_RECORD_VERSION = 2;
const VERSIONS = [1, 2];
/** A take is at most 20 minutes of frames; three personas, one decision a bar, stays far below this. */
export const MIND_RECORD_MAX = 20000;
/** At most one route edit a phrase, so this is far above any real take. */
export const CONDUCT_RECORD_MAX = 2000;
const CONDUCT_STATUS = Object.freeze(['applied', 'dropped']);

/**
 * Recorder. `getFrame()` returns the take's current frame index; `getSystem()` the answering model's identity
 * ({ backend, model?, os? } or null — mindLive.getMindSystem). #1463: a take keeps the model/system version of every
 * backend that answered in it, under `systems`, so the books say what made each decision.
 */
export function createMindRecorder({ getFrame = () => 0, getSystem = () => null } = {}) {
  const rows = [];
  const conduct = [];
  const systems = {};
  return {
    /** #1483: what became of one of Davis's route proposals (trioLive's mind:route): applied with its delta, or dropped with why. */
    conduct(e) {
      if (!e || conduct.length >= CONDUCT_RECORD_MAX || !CONDUCT_STATUS.includes(e.status)) return;
      const op = validateRouteOp(e.op);
      if (!op) return;
      conduct.push([
        getFrame() | 0,
        e.status,
        typeof e.reason === 'string' ? e.reason.slice(0, 16) : null,
        Number.isInteger(e.bar) ? e.bar : 0,
        Number.isInteger(e.landBar) ? e.landBar : null,
        op,
        e.delta ? JSON.parse(JSON.stringify(e.delta)) : null,
      ]);
    },
    /** A decision as mindLive published it, and whether it asked the stage for something. */
    update(d, requested) {
      if (!d || rows.length >= MIND_RECORD_MAX) return;
      const row = [
        getFrame() | 0,
        d.persona,
        d.bar,
        d.backend,
        d.seed >>> 0,
        d.invented ? 1 : 0,
        requested ? 1 : 0,
        JSON.parse(JSON.stringify(d.reply)),
      ];
      if (d.traits) row.push(JSON.parse(JSON.stringify(d.traits)));
      rows.push(row);
      if (d.backend !== 'rules' && !systems[d.backend]) {
        let s;
        try {
          s = getSystem();
        } catch {
          s = null;
        }
        if (s && s.backend === d.backend)
          systems[d.backend] = {
            ...(s.model ? { model: String(s.model).slice(0, 64) } : {}),
            ...(s.os ? { os: String(s.os).slice(0, 32) } : {}),
          };
      }
    },
    finish() {
      return {
        version: rows.some((r) => r.length === 9) ? 2 : 1,
        decisions: rows.map((r) => r.slice()),
        ...(Object.keys(systems).length ? { systems: JSON.parse(JSON.stringify(systems)) } : {}),
        ...(conduct.length ? { conduct: JSON.parse(JSON.stringify(conduct)) } : {}), // absent when Davis did not conduct: the file is unchanged
      };
    },
  };
}

/** Fail-closed check: the record, or null. Every reply must still pass the contract; frames must not go backwards. */
export function checkMindRecord(r) {
  if (!r || typeof r !== 'object' || !VERSIONS.includes(r.version) || !Array.isArray(r.decisions)) return null;
  if (r.decisions.length > MIND_RECORD_MAX) return null;
  if (r.systems !== undefined) {
    // #1463 — optional: the model/system each non-rules backend ran on
    if (!r.systems || typeof r.systems !== 'object' || Array.isArray(r.systems)) return null;
    for (const [k, v] of Object.entries(r.systems)) {
      if (!BACKENDS.includes(k) || !v || typeof v !== 'object') return null;
      for (const f of Object.values(v)) if (typeof f !== 'string' || f.length > 64) return null;
    }
  }
  if (r.conduct !== undefined) {
    // #1483 — optional: Davis's route proposals and what became of them
    if (!Array.isArray(r.conduct) || r.conduct.length > CONDUCT_RECORD_MAX) return null;
    let last = -1;
    for (const c of r.conduct) {
      if (!Array.isArray(c) || c.length !== 7) return null;
      const [frame, status, reason, bar, landBar, op, delta] = c;
      if (!Number.isInteger(frame) || frame < last || !CONDUCT_STATUS.includes(status) || !Number.isInteger(bar))
        return null;
      if (reason !== null && typeof reason !== 'string') return null;
      if (landBar !== null && !Number.isInteger(landBar)) return null;
      if (!validateRouteOp(op)) return null;
      if (delta !== null && (typeof delta !== 'object' || Array.isArray(delta))) return null;
      last = frame;
    }
  }
  let prev = -1;
  for (const d of r.decisions) {
    if (!Array.isArray(d) || !(d.length === 8 || (d.length === 9 && r.version === 2))) return null;
    const [frame, persona, bar, backend, seed, invented, request, reply, traits] = d;
    if (d.length === 9 && !checkTraits(traits)) return null;
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
  const [, persona, bar, backend, seed, invented, , reply, traits] = row;
  return {
    persona,
    bar,
    backend,
    seed,
    invented: invented === 1,
    reply: JSON.parse(JSON.stringify(reply)),
    ...(traits ? { traits: JSON.parse(JSON.stringify(traits)) } : {}),
  };
}

/**
 * The replay cursor for one take's record. step(frame) returns the rows recorded at frames the cursor has passed
 * since the last step (in order); seek(frame) moves the cursor without returning anything (a seek re-plays nothing).
 * A record that fails the check replays nothing.
 */
export function createMindReplay(record) {
  const rows = checkMindRecord(record) ? record.decisions : [];
  const cond = checkMindRecord(record) && Array.isArray(record.conduct) ? record.conduct : [];
  let next = 0; // the first row not yet returned
  let cnext = 0; // the first conducting row not yet returned
  const firstAt = (frame) => {
    let i = 0;
    while (i < rows.length && rows[i][0] < frame) i++;
    return i;
  };
  const cfirstAt = (frame) => {
    let i = 0;
    while (i < cond.length && cond[i][0] < frame) i++;
    return i;
  };
  return {
    step(frame) {
      const out = [];
      while (next < rows.length && rows[next][0] <= frame) out.push(rows[next++]);
      return out;
    },
    seek(frame) {
      next = firstAt(frame);
      cnext = cfirstAt(frame);
    },
    /** The conducting outcomes recorded at frames the cursor has passed, as mind:route payloads. */
    conductStep(frame) {
      const out = [];
      while (cnext < cond.length && cond[cnext][0] <= frame) {
        const [, status, reason, bar, landBar, op, delta] = cond[cnext++];
        out.push({ status, ...(reason ? { reason } : {}), op, bar, landBar, ...(delta ? { delta } : {}) });
      }
      return out;
    },
    get size() {
      return rows.length;
    },
  };
}
