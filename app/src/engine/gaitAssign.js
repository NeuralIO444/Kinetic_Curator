// engine/gaitAssign.js — #2329 (GAIT M3; docs/design/gait-spec.md rulings 4, 6): who wears which gait.
//
// A GAIT_ASSIGN is the one decision this slice adds: `{ target, gaitId, by: 'queen'|'davis'|'user', locked }`.
//   target  the wearer — a construct tile's asset id (the only wearer on stage until M5)
//   gaitId  the gait it wears now (a Canon default in this slice; data/canon/gaits.js)
//   by      who decided: the QUEEN's per-phrase pick, DAVIS (mutations: later), or the user
//   locked  the user's lock: a locked gait is NEVER re-picked — not by the QUEEN, not by DAVIS — and nothing times it
//           out (the Trio's 32-bar ownership lapse is for dials, not for a lock). Only the user moves or frees it.
//
// The assignments are a plain map { target: { gaitId, by, locked } }. Every change returns a NEW map; a refused or
// no-op change returns the SAME map, so a store or a memo can compare by reference.
//
// The frame input carries only what the stage needs (`gaitInputStamp`): the moving assignments and the tempo. A take
// is the resolver's input log, so a replay reads the recorded stamp and never asks the QUEEN again (K0: a discrete
// decision is recorded at the moment it is made).
//
// Pure: no clock, no random, no store.
import { canonGaits, canonGaitById, canonicalGaitId, CANON_GAIT_KINDS } from '../data/canon/gaits.js';
import { GAIT_DEFAULT_BPM } from './gait.js';

export const GAIT_ASSIGN_BY = Object.freeze(['queen', 'davis', 'user']);
const TARGET_MAX = 64;
const GAIT_ID_RE = /^gait:[0-9a-f]{16}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** One GAIT_ASSIGN through the door: a normalized copy, or null when it is not one. */
export function sanitizeGaitAssign(raw) {
  if (!isObj(raw)) return null;
  if (typeof raw.target !== 'string' || !raw.target || raw.target.length > TARGET_MAX) return null;
  if (typeof raw.gaitId !== 'string' || !GAIT_ID_RE.test(raw.gaitId)) return null;
  if (!GAIT_ASSIGN_BY.includes(raw.by)) return null;
  // a pre-M4 Canon id (a take or a document written before #2405) is kept as the current id of the same gait
  const gaitId = canonicalGaitId(raw.gaitId);
  return { target: raw.target, gaitId, by: raw.by, locked: raw.by === 'user' && raw.locked === true };
}

/**
 * Apply one GAIT_ASSIGN. Returns { assignments, applied, reason }:
 *   reason 'invalid'  not a GAIT_ASSIGN
 *          'locked'   the target is locked and the event is not the user's: refused, the lock stands
 *          'same'     nothing would change
 *          null       applied
 * Only the user may set or clear `locked` (a QUEEN/DAVIS event always arrives unlocked).
 */
export function applyGaitAssign(assignments, raw) {
  const cur = isObj(assignments) ? assignments : {};
  const e = sanitizeGaitAssign(raw);
  if (!e) return { assignments: cur, applied: false, reason: 'invalid' };
  const was = cur[e.target];
  if (was && was.locked && e.by !== 'user') return { assignments: cur, applied: false, reason: 'locked' };
  if (was && was.gaitId === e.gaitId && was.by === e.by && !!was.locked === e.locked)
    return { assignments: cur, applied: false, reason: 'same' };
  return {
    assignments: { ...cur, [e.target]: { gaitId: e.gaitId, by: e.by, locked: e.locked } },
    applied: true,
    reason: null,
  };
}

/**
 * Which of a style's defaults the QUEEN wants for the room (the audio envelope, curator's `audio:energy` with
 * hysteresis): low or mid energy → idle, high → performing. Only true silence stays still (Matt, 2026-11-18 18:53 PT:
 * "low energy → idle; true silence stays still"): the silence detector says so, or there is no reading at all (no
 * audio), so a room that is not listening keeps today's render.
 */
export function queenGaitKind({ energy = null, silent = false } = {}) {
  if (silent) return 'still';
  if (energy === 'high') return 'performing';
  if (energy === 'mid' || energy === 'low') return 'idle';
  return 'still';
}

/**
 * The QUEEN's picks for one phrase: one GAIT_ASSIGN per target whose wanted default differs from what it wears.
 * Locked targets are skipped (never re-picked). Targets are visited in sorted order, so the picks are a pure
 * function of the arguments.
 * @param assignments  the current map
 * @param targets      the wearers on stage (asset ids)
 * @param styleOf      (target) => its Canon style id, or null (a target with no Canon defaults is left alone)
 * @param energy, silent  the room (see queenGaitKind)
 */
export function queenPicks({ assignments = {}, targets = [], styleOf = () => null, energy = null, silent = false }) {
  const kind = queenGaitKind({ energy, silent });
  const out = [];
  const seen = new Set();
  for (const target of [...(Array.isArray(targets) ? targets : [])].sort()) {
    if (typeof target !== 'string' || seen.has(target)) continue;
    seen.add(target);
    const was = isObj(assignments) ? assignments[target] : null;
    if (was && was.locked) continue;
    let style;
    try {
      style = styleOf(target);
    } catch {
      style = null;
    }
    const set = canonGaits(style);
    if (!set) continue;
    const want = set[kind].id;
    // an unassigned target already wears `still` (today's render): no event for it
    if (was ? was.gaitId === want : kind === 'still') continue;
    out.push({ target, gaitId: want, by: 'queen', locked: false });
  }
  return out;
}

/** The gait a target wears for a lock with nothing assigned yet: its style's `still` (null for no Canon style). */
export function restGaitIdFor(style) {
  const set = canonGaits(style);
  return set ? set.still.id : null;
}

// ── the user's locks, saved with the project (#2329 follow-up, Matt 2026-11-18 18:53 PT) ─────────────────────────────
// Only a user lock is saved (a QUEEN pick is the room's, re-earned each phrase: session-only). In the document a lock
// is `gaitLocks: { target: gaitId }`, a SCENE field (projectDocument.js), so it travels with recipes.

/** The most locks a document keeps (a stage has far fewer constructs; this only bounds a hostile file). */
export const GAIT_LOCKS_MAX = 256;

/** A document's `gaitLocks` through the door: { target: gaitId } sorted by target, pre-M4 ids made current. Never null. */
export function sanitizeGaitLocks(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  let n = 0;
  for (const target of Object.keys(raw).sort()) {
    if (n >= GAIT_LOCKS_MAX) break;
    const e = sanitizeGaitAssign({ target, gaitId: raw[target], by: 'user', locked: true });
    if (!e) continue;
    out[target] = e.gaitId;
    n++;
  }
  return out;
}

/** The locks standing in an assignment map, as the document saves them ({ target: gaitId }; {} when none). */
export function gaitLocksOf(assignments) {
  const raw = {};
  if (isObj(assignments))
    for (const target of Object.keys(assignments)) {
      const e = assignments[target];
      if (e && e.locked === true && e.by === 'user') raw[target] = e.gaitId;
    }
  return sanitizeGaitLocks(raw);
}

/** An assignment map holding exactly these locks (what a load stands up: a QUEEN pick is never loaded). */
export function assignmentsFromLocks(locks) {
  const out = {};
  const clean = sanitizeGaitLocks(locks);
  for (const target of Object.keys(clean)) out[target] = { gaitId: clean[target], by: 'user', locked: true };
  return out;
}

/** True when a gait moves anything (any driver amount above 0). `still` is not moving. */
export function gaitMoves(gait) {
  if (!gait || !isObj(gait.roles)) return false;
  for (const r of Object.values(gait.roles)) for (const d of (r && r.drivers) || []) if (d && d.amount > 0) return true;
  return false;
}

/**
 * What the frame input carries: { bpm, a: [[target, gaitId], …] } for the targets wearing a MOVING Canon gait,
 * sorted by target — or null when none moves (the input then carries no key at all: today's shape, byte for byte).
 * A gait id the Canon does not know (a user or DAVIS gait: later slices) does not ride the stamp yet.
 */
export function gaitInputStamp(assignments, bpm = null) {
  if (!isObj(assignments)) return null;
  const a = [];
  for (const target of Object.keys(assignments).sort()) {
    const e = assignments[target];
    const g = e ? canonGaitById(e.gaitId) : null;
    if (g && gaitMoves(g)) a.push([target, g.id]);
  }
  if (!a.length) return null;
  return { bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : GAIT_DEFAULT_BPM, a };
}

/** The stamp read back on the resolver side: a Map target → gait record (moving Canon gaits only), or null. */
export function gaitsOfStamp(stamp) {
  if (!isObj(stamp) || !Array.isArray(stamp.a)) return null;
  const m = new Map();
  for (const row of stamp.a) {
    if (!Array.isArray(row) || typeof row[0] !== 'string') continue;
    const g = canonGaitById(row[1]);
    if (g && gaitMoves(g)) m.set(row[0], g);
  }
  return m.size ? m : null;
}

export { CANON_GAIT_KINDS };
