// personas/rhythmRecord.mjs — #2389 (Persona Kernel P9): the rhythm section's own record, inside the take's `band`
// section as `band.rhythm`, and the holder the band's movers read.
//
// The rhythm section (spec §3b) never solos and never answers: her one seat is the band's TIMING (§4 Q9). Two things
// of hers are recorded so a take replays them exactly and never asks again:
//   timing  her lean on a band turn — [frame, phrase, enterEarlyMs, breathePct, tightMs]: how early a horn comes in,
//           how much longer a solo breathes, how tight a trade sits to the beat (each ≥ 0, within M4's caps)
//   looks   her eyes (§4 Q11) — [frame, phrase, motion]: one reading of the frame's motion, at most once a phrase.
//           Replay needs no model: the reading is here, and so is the timing it moved.
// Both are OUTPUT of the band's live adapter (personas/bandLive.js); nothing here plays a turn, changes a turn, or
// touches the stage. The section is optional and additive: a take without it (every take made with the band off, and
// every take from before P9) loads as it always did; `band.turns` is read by bandRecord.mjs exactly as before.
// checkRhythmRecord is fail-closed: one malformed row refuses the whole rhythm record (no timing is replayed).
//
// Deniability (#1188): nothing here is a surface; no row, key or value names her. The holder below is ephemeral
// (never store state, never serialized outside a take).

export const RHYTHM_RECORD_VERSION = 1;
/** One timing row per turn and one look per phrase at most: far below this in a 20-minute take. */
export const RHYTHM_RECORD_MAX = 2000;
/** M4's caps, as literals (the selfcheck pins them): no lean is earlier than this, in ms… */
export const RHYTHM_ARM_CAP_MS = 40;
/** …and no solo breathes longer than this share of its length. */
export const RHYTHM_HOLD_CAP = 0.08;
/** What a look may read (the frame's motion). */
export const RHYTHM_MOTIONS = Object.freeze(['still', 'flowing', 'busy']);
/** The holder keeps the last few looks (her own read; never surfaced). */
export const RHYTHM_LOOKS_KEPT = 8;

const isFrame = (v) => Number.isInteger(v) && v >= 0;
const inRange = (v, hi) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= hi;

// ── the holder: what the band's movers read (live, or replayed) ──────────────────────────────────────────
let timing = null; // { phrase, enterEarlyMs, breathePct, tightMs } | null
let looks = []; // [{ phrase, motion }], oldest first
let tap = null;

/** The timing lean standing now (the last one noted or replayed), or null. A copy. */
export function getRhythmTiming() {
  return timing ? { ...timing } : null;
}
/** Her last few looks, oldest first. Copies. */
export function getRhythmLooks() {
  return looks.map((l) => ({ ...l }));
}
/** Forget the holder (a take starts or ends; the band stops). */
export function resetRhythm() {
  timing = null;
  looks = [];
}

/** Install (or clear, with null) the live tap — the recording take's ear. */
export function setRhythmTap(fn) {
  tap = typeof fn === 'function' ? fn : null;
}
const toTap = (ev) => {
  if (!tap) return;
  try {
    tap(ev);
  } catch {
    /* a take that cannot hear her does not break the band */
  }
};

/** A timing lean as a clean copy, or null (shape and caps). */
export function cleanTiming(t) {
  if (!t || typeof t !== 'object' || !isFrame(t.phrase)) return null;
  if (!inRange(t.enterEarlyMs, RHYTHM_ARM_CAP_MS) || !inRange(t.tightMs, RHYTHM_ARM_CAP_MS)) return null;
  if (!inRange(t.breathePct, RHYTHM_HOLD_CAP)) return null;
  return { phrase: t.phrase, enterEarlyMs: t.enterEarlyMs, breathePct: t.breathePct, tightMs: t.tightMs };
}
/** A look as a clean copy, or null. */
export function cleanLook(l) {
  if (!l || typeof l !== 'object' || !isFrame(l.phrase) || !RHYTHM_MOTIONS.includes(l.motion)) return null;
  return { phrase: l.phrase, motion: l.motion };
}

/** The live adapter notes one timing lean: the holder takes it and the recording take hears it. */
export function noteRhythmTiming(t) {
  const c = cleanTiming(t);
  if (!c) return;
  timing = c;
  toTap({ type: 'timing', ...c });
}
/** The live adapter notes one look: the holder keeps it and the recording take hears it. */
export function noteRhythmLook(l) {
  const c = cleanLook(l);
  if (!c) return;
  looks = [...looks, c].slice(-RHYTHM_LOOKS_KEPT);
  toTap({ type: 'look', ...c });
}

// ── the take side ────────────────────────────────────────────────────────────────────────────────────────

/** The recorder. finish() is undefined when nothing was noted — the rhythm record is then absent. */
export function createRhythmRecorder({ getFrame = () => 0 } = {}) {
  const rows = { timing: [], looks: [] };
  return {
    update(ev) {
      if (!ev || typeof ev !== 'object') return;
      const frame = getFrame() | 0;
      if (ev.type === 'timing') {
        const c = cleanTiming(ev);
        if (c && rows.timing.length < RHYTHM_RECORD_MAX)
          rows.timing.push([frame, c.phrase, c.enterEarlyMs, c.breathePct, c.tightMs]);
      } else if (ev.type === 'look') {
        const c = cleanLook(ev);
        if (c && rows.looks.length < RHYTHM_RECORD_MAX) rows.looks.push([frame, c.phrase, c.motion]);
      }
    },
    finish() {
      if (!rows.timing.length && !rows.looks.length) return undefined;
      return { version: RHYTHM_RECORD_VERSION, timing: rows.timing.map((r) => [...r]), looks: rows.looks.map((r) => [...r]) };
    },
  };
}

function rowsInOrder(rows, check) {
  if (!Array.isArray(rows) || rows.length > RHYTHM_RECORD_MAX) return null;
  let lastFrame = 0;
  let lastPhrase = 0;
  const out = [];
  for (const row of rows) {
    if (!check(row)) return null;
    if (row[0] < lastFrame || row[1] < lastPhrase) return null;
    lastFrame = row[0];
    lastPhrase = row[1];
    out.push([...row]);
  }
  return out;
}

const timingRowOk = (r) =>
  Array.isArray(r) &&
  r.length === 5 &&
  isFrame(r[0]) &&
  cleanTiming({ phrase: r[1], enterEarlyMs: r[2], breathePct: r[3], tightMs: r[4] }) !== null;
const lookRowOk = (r) => Array.isArray(r) && r.length === 3 && isFrame(r[0]) && cleanLook({ phrase: r[1], motion: r[2] }) !== null;

/**
 * A take's rhythm record, checked: { version, timing, looks } (rows copied), or null — absent, or malformed (fail
 * closed: one bad row, an unknown key or a wrong version refuses the whole record; no half-true timing is replayed).
 */
export function checkRhythmRecord(section) {
  if (!section || typeof section !== 'object' || Array.isArray(section)) return null;
  if (section.version !== RHYTHM_RECORD_VERSION) return null;
  if (Object.keys(section).some((k) => !['version', 'timing', 'looks'].includes(k))) return null;
  const t = rowsInOrder(section.timing, timingRowOk);
  const l = rowsInOrder(section.looks, lookRowOk);
  if (!t || !l) return null;
  return { version: RHYTHM_RECORD_VERSION, timing: t, looks: l };
}

let replay = null; // { section, rec, nextT, nextL }

/**
 * Playback: put the take's recorded timing and looks due at `frame` into the holder, as they happened. A seek moves
 * the cursors to the landing frame and rebuilds the holder from the rows before it. Never asks a model, never leans
 * anew. Returns how many rows were applied.
 */
export function replayRhythmFrame(frame, section, { seeked = false } = {}) {
  if (!section) {
    replay = null;
    return 0;
  }
  if (!replay || replay.section !== section) {
    replay = { section, rec: checkRhythmRecord(section), nextT: 0, nextL: 0 };
    resetRhythm();
  }
  const rec = replay.rec;
  if (!rec) return 0;
  if (seeked) {
    resetRhythm();
    replay.nextT = 0;
    replay.nextL = 0;
  }
  let n = 0;
  while (replay.nextT < rec.timing.length && rec.timing[replay.nextT][0] <= frame) {
    const [, phrase, enterEarlyMs, breathePct, tightMs] = rec.timing[replay.nextT++];
    timing = { phrase, enterEarlyMs, breathePct, tightMs };
    n++;
  }
  while (replay.nextL < rec.looks.length && rec.looks[replay.nextL][0] <= frame) {
    const [, phrase, motion] = rec.looks[replay.nextL++];
    looks = [...looks, { phrase, motion }].slice(-RHYTHM_LOOKS_KEPT);
    n++;
  }
  return n;
}

/** Leave playback: forget the cursor and the replayed holder. */
export function endRhythmReplay() {
  replay = null;
  resetRhythm();
}
