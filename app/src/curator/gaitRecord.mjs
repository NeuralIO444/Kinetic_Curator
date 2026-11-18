// gaitRecord.mjs — #2329 (GAIT M3; gait-spec ruling 6): the take's GAIT_ASSIGN track, and the tap that feeds it.
//
// Every assignment that lands — the QUEEN's per-phrase pick, a user's pick or lock — is a recorded take event,
// `[frame, target, gaitId, by, locked]`. The stage itself replays from the resolver's input (`input.gaits`, stamped by
// the loop), so a take's picture is exact without this track; the track is the DECISION log: on playback it is
// re-published on the bus as it happened (`gait:assign`, cause 'replay'), and nothing asks the QUEEN again (she is
// muted while a take plays). The birthRecord / davisShift tap pattern: the store action cannot reach the recorder,
// so it reports through this module-level tap, which the take's section factory installs while the take runs.
import { emit, Events } from '../composition/eventBus.js';
import { sanitizeGaitAssign, applyGaitAssign } from '../engine/gaitAssign.js';

export const GAIT_RECORD_VERSION = 1;
/** One pick per target per phrase is far below this for any real take. */
export const GAIT_RECORD_MAX = 20000;

let gaitTap = null;

/** Install (or clear, with null) the live tap — the recording take's ear. */
export function setGaitTap(fn) {
  gaitTap = typeof fn === 'function' ? fn : null;
}

/** Report one APPLIED assignment to the standing take, if a take is listening. */
export function noteGaitAssign(event) {
  if (!gaitTap || !event) return;
  try {
    gaitTap(event);
  } catch {
    /* a take that cannot hear a pick does not break the pick */
  }
}

const rowOf = (frame, e) => [frame | 0, e.target, e.gaitId, e.by, e.locked ? 1 : 0];
const eventOf = (row) => ({ target: row[1], gaitId: row[2], by: row[3], locked: row[4] === 1 });

/** The take-side recorder. */
export function createGaitRecorder({ getFrame = () => 0 } = {}) {
  const events = [];
  return {
    update(raw) {
      const e = sanitizeGaitAssign(raw);
      if (!e || events.length >= GAIT_RECORD_MAX) return;
      events.push(rowOf(getFrame(), e));
    },
    finish() {
      return { version: GAIT_RECORD_VERSION, events: events.map((r) => r.slice()) };
    },
  };
}

/** A take's gait section, checked: the rows in frame order that pass the door, or null (absent / malformed). */
export function checkGaitRecord(section) {
  if (!section || section.version !== GAIT_RECORD_VERSION || !Array.isArray(section.events)) return null;
  const events = [];
  let last = -1;
  for (const r of section.events) {
    if (!Array.isArray(r) || !Number.isInteger(r[0]) || r[0] < last) return null;
    if (!sanitizeGaitAssign(eventOf(r))) return null;
    last = r[0];
    events.push(r);
  }
  return { version: GAIT_RECORD_VERSION, events };
}

/** The assignments standing at `frame` (every row up to and including it, folded): what a seek lands on. */
export function gaitAssignmentsAt(section, frame) {
  const rec = checkGaitRecord(section);
  let map = {};
  if (!rec) return map;
  for (const r of rec.events) {
    if (r[0] > frame) break;
    map = applyGaitAssign(map, eventOf(r)).assignments;
  }
  return map;
}

let replay = null; // { section, rec, next }

/**
 * Playback: re-publish the take's assignments due at `frame` on the bus (cause 'replay'). A seek re-publishes the
 * standing map at the landing frame first. Returns the number of events published. Never picks.
 */
export function replayGaitFrame(frame, section, { seeked = false } = {}) {
  if (!section) {
    replay = null;
    return 0;
  }
  if (!replay || replay.section !== section) replay = { section, rec: checkGaitRecord(section), next: 0 };
  const evs = replay.rec ? replay.rec.events : [];
  let n = 0;
  if (seeked) {
    replay.next = 0;
    while (replay.next < evs.length && evs[replay.next][0] < frame) replay.next += 1;
    const standing = gaitAssignmentsAt(section, frame - 1);
    for (const target of Object.keys(standing).sort()) {
      const a = standing[target];
      emit(Events.GAIT_ASSIGN, { target, ...a }, { cause: 'replay' });
      n++;
    }
  }
  while (replay.next < evs.length && evs[replay.next][0] <= frame) {
    emit(Events.GAIT_ASSIGN, eventOf(evs[replay.next]), { cause: 'replay' });
    replay.next += 1;
    n++;
  }
  return n;
}

/** Leave playback: forget the cursor. */
export function endGaitReplay() {
  replay = null;
}
