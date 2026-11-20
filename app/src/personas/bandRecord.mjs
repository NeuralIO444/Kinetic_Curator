// personas/bandRecord.mjs — #2387 (P7): the take's `band` section, and the tap that feeds it.
//
// Every turn the band plays is a recorded take event — who played, who answered, the verdict, what became of the
// solo — so a take replays the SAME conversation exactly. The section is the decision log: playback re-publishes
// the rows on the bus as they happened (`band:turn`, cause 'replay') and nothing asks the band again (it is muted
// while a take plays). The gaitRecord / mindRecord tap pattern.
//
// Row: [frame, phrase, kind, by, extra]. `extra` by kind —
//   in / out            null
//   solo                { len, cap }
//   trade               { answers: [[by, verdict, move], ...], owner, len?, cap? }   (owner null = the solo ended)
//   cut                 { target }
//   yield               { why: 'keep' | 'lock', ended }
// The section is optional: a take made with the band off has none, and a take from before the band loads as it
// always did. checkBandRecord is fail-closed AND re-derives each row's consequences from the fold (a trade must
// hand the solo over exactly as its answers say), so a hand-edited conversation is refused, not played.
import { emit, Events } from '../composition/eventBus.js';
import {
  BAND_SEATS,
  BAND_SOLOISTS,
  BAND_ANSWERERS,
  BAND_HORNS,
  BAND_VERDICTS,
  BAND_MOVES,
  BAND_TURN_KINDS,
  createBandState,
  applyTurn,
  standingSolo,
} from './band.mjs';
import { PERSONA_DECISION_KINDS } from '../curator/decisionFeatures.mjs';

export const BAND_RECORD_VERSION = 1;
/** A take is at most 20 minutes (~150 phrases); at most two rows a phrase stays far below this. */
export const BAND_RECORD_MAX = 2000;
const MAX_LEN = 64;

let bandTap = null;
/** Install (or clear, with null) the live tap — the recording take's ear. */
export function setBandTap(fn) {
  bandTap = typeof fn === 'function' ? fn : null;
}
/** Report one turn to the standing take, if a take is listening. */
export function noteBandTurn(turn) {
  if (!bandTap || !turn) return;
  try {
    bandTap(turn);
  } catch {
    /* a take that cannot hear a turn does not break the band */
  }
}

let headsTap = null;
/** Install (or clear, with null) the steering tap — the recording take's ear for head stamps (A1). */
export function setBandHeadsTap(fn) {
  headsTap = typeof fn === 'function' ? fn : null;
}
/** Report the heads that steered this phrase ([{ id, kind, version }], from stepBand) to the take. */
export function noteBandHeads(entries) {
  if (!headsTap || !entries || !entries.length) return;
  try {
    headsTap(entries);
  } catch {
    /* a take that cannot hear a stamp does not break the band */
  }
}

/** The stamp's shape, alone: [{ id, kind, version }] — a band seat that can hold a head (never the
 * rhythm section: she has no personas entry in A1), a decision kind (A0's kinds, one vocabulary),
 * a head version ≥ 1, one entry per (id, kind). */
function checkHeadsStamp(heads) {
  if (!Array.isArray(heads) || heads.length > (Object.keys(BAND_SEATS).length - 1) * PERSONA_DECISION_KINDS.length) return false;
  const seen = new Set();
  for (const h of heads) {
    if (!h || typeof h !== 'object' || Array.isArray(h)) return false;
    if (!Object.hasOwn(BAND_SEATS, h.id) || h.id === 'queen') return false;
    if (!PERSONA_DECISION_KINDS.includes(h.kind)) return false;
    if (!Number.isInteger(h.version) || h.version < 1) return false;
    const key = `${h.id}|${h.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

const isU32 = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
const isCap = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isLen = (v) => Number.isInteger(v) && v >= 1 && v <= MAX_LEN;

/** A turn as a row (frame first). */
export function rowOf(frame, t) {
  let extra = null;
  if (t.kind === 'solo') extra = { len: t.len, cap: t.cap };
  else if (t.kind === 'cut') extra = { target: t.target };
  else if (t.kind === 'yield') extra = { why: t.why, ended: t.ended };
  else if (t.kind === 'trade') {
    extra = { answers: t.answers.map((a) => [a.by, a.verdict, a.move]), owner: t.owner };
    if (t.owner !== null && t.owner !== t.by) {
      extra.len = t.len;
      extra.cap = t.cap;
    }
  }
  return [frame | 0, t.phrase, t.kind, t.by, extra];
}

/** A row as a turn (the shape stepBand returns, and applyTurn folds). Assumes a row that passed the check. */
export function turnOf(row) {
  const [, phrase, kind, by, x] = row;
  if (kind === 'solo') return { kind, phrase, by, len: x.len, cap: x.cap };
  if (kind === 'cut') return { kind, phrase, by, target: x.target };
  if (kind === 'yield') return { kind, phrase, by, why: x.why, ended: x.ended };
  if (kind === 'trade') {
    const t = { kind, phrase, by, answers: x.answers.map(([b, verdict, move]) => ({ by: b, verdict, move })), owner: x.owner };
    if (x.len !== undefined) {
      t.len = x.len;
      t.cap = x.cap;
    }
    return t;
  }
  return { kind, phrase, by };
}

/**
 * The take-side recorder. `seed` is the seed the band drew from (the take's), written once so the section alone says
 * what conversation it holds. finish() is undefined when no turn was played — the section is then absent.
 *
 * A1 (#2394, ruling Q4): the section also carries the take's head stamp — `heads`, the persona heads
 * that ACTUALLY steered a decision in this take ({ id, kind, version }, fed by noteHeads as the band
 * plays). A head that was loaded but never fired is not credited. The stamp is a record, never an
 * input: playback re-publishes the recorded turns and never re-decides, so nothing reads it back into
 * a decision. Absent when no head steered — a pre-A1 take, and a take no head touched, are exactly
 * the sections they always were.
 */
export function createBandRecorder({ getFrame = () => 0, seed = 0 } = {}) {
  const rows = [];
  const steered = new Map(); // `${id}|${kind}` -> { id, kind, version }
  return {
    update(turn) {
      if (!turn || rows.length >= BAND_RECORD_MAX) return;
      const row = rowOf(getFrame(), turn);
      if (!checkRow(row, createBandState(), true)) return; // a malformed turn is not written
      rows.push(JSON.parse(JSON.stringify(row)));
    },
    /** Record heads that steered (stepBand's per-phrase report). Malformed entries are not written. */
    noteHeads(entries) {
      if (!Array.isArray(entries)) return;
      for (const h of entries) {
        if (!h || typeof h !== 'object') continue;
        const entry = { id: h.id, kind: h.kind, version: h.version };
        if (!checkHeadsStamp([entry])) continue;
        steered.set(`${entry.id}|${entry.kind}`, entry);
      }
    },
    finish() {
      if (!rows.length) return undefined;
      const out = { version: BAND_RECORD_VERSION, seed: seed >>> 0, turns: rows.map((r) => JSON.parse(JSON.stringify(r))) };
      if (steered.size) {
        out.heads = [...steered.values()].sort((a, b) =>
          a.id === b.id ? (a.kind < b.kind ? -1 : 1) : a.id < b.id ? -1 : 1,
        );
      }
      return out;
    },
  };
}

// shape of one row alone (no fold); `shapeOnly` skips the consequence checks that need the standing solo
function checkRow(row, state, shapeOnly = false) {
  if (!Array.isArray(row) || row.length !== 5) return false;
  const [frame, phrase, kind, by, x] = row;
  if (!Number.isInteger(frame) || frame < 0 || !Number.isInteger(phrase) || phrase < 0) return false;
  if (!BAND_TURN_KINDS.includes(kind)) return false;
  const solo = standingSolo(state, phrase);
  switch (kind) {
    case 'in':
      return by === 'governor' && x === null && (shapeOnly || !state.started);
    case 'out':
      return by === 'governor' && x === null && (shapeOnly || state.started);
    case 'solo':
      return (
        BAND_SOLOISTS.includes(by) &&
        x && isLen(x.len) && isCap(x.cap) && Object.keys(x).length === 2 &&
        (shapeOnly || (state.started && !solo))
      );
    case 'cut':
      return by === 'governor' && x && Object.keys(x).length === 1 && BAND_SOLOISTS.includes(x.target) &&
        (shapeOnly || (solo && solo.by === x.target));
    case 'yield':
      return (
        by === 'artist' && x && Object.keys(x).length === 2 && (x.why === 'keep' || x.why === 'lock') &&
        BAND_SOLOISTS.includes(x.ended) && (shapeOnly || (solo && solo.by === x.ended))
      );
    case 'trade': {
      if (!BAND_SOLOISTS.includes(by) || !x || !Array.isArray(x.answers) || !x.answers.length) return false;
      if (!shapeOnly && !(solo && solo.by === by && solo.start < phrase)) return false;
      const seen = new Set();
      let horns = 0;
      for (const a of x.answers) {
        if (!Array.isArray(a) || a.length !== 3) return false;
        const [who, verdict, move] = a;
        if (!BAND_ANSWERERS.includes(who) || who === by || seen.has(who)) return false;
        seen.add(who);
        if (BAND_HORNS.includes(who)) horns += 1;
        if (!BAND_VERDICTS.includes(verdict) || !BAND_MOVES[verdict].includes(move)) return false;
        if (move === 'cut' && !BAND_SEATS[who].cuts) return false; // only LOIS cuts
        if (move === 'counter' && who === 'lois') return false;
      }
      if (horns > BAND_HORNS.length) return false;
      // the consequence, re-derived: a cut ends the solo; else the first counter-mover takes it; else it stays
      const cut = x.answers.some((a) => a[2] === 'cut');
      const counter = x.answers.find((a) => a[2] === 'counter' && BAND_SEATS[a[0]].solos);
      const owner = cut ? null : counter ? counter[0] : by;
      if (x.owner !== owner) return false;
      const handover = owner !== null && owner !== by;
      const keys = Object.keys(x).length;
      if (handover) return keys === 4 && isLen(x.len) && isCap(x.cap);
      return keys === 2;
    }
    default:
      return false;
  }
}

/**
 * A take's band section, checked: { version, seed, turns } (rows copied) or null (absent / malformed — fail closed:
 * one bad row refuses the whole section, so a half-true conversation is never played). The A1 head
 * stamp rides along when present ({ ..., heads }, copied): shape-checked like everything else in
 * the section, but never re-derived — steering is a fact the take records, not a consequence the
 * fold can recompute, and replay never reads it (it re-publishes turns; it never re-decides).
 */
export function checkBandRecord(section) {
  if (!section || typeof section !== 'object' || section.version !== BAND_RECORD_VERSION) return null;
  if (!isU32(section.seed) || !Array.isArray(section.turns) || section.turns.length > BAND_RECORD_MAX) return null;
  if (section.heads != null && !checkHeadsStamp(section.heads)) return null;
  let state = createBandState();
  let lastFrame = 0;
  let lastPhrase = 0;
  const turns = [];
  for (const row of section.turns) {
    if (!checkRow(row, state)) return null;
    if (row[0] < lastFrame || row[1] < lastPhrase) return null;
    lastFrame = row[0];
    lastPhrase = row[1];
    state = applyTurn(state, turnOf(row));
    turns.push(JSON.parse(JSON.stringify(row)));
  }
  const out = { version: BAND_RECORD_VERSION, seed: section.seed >>> 0, turns };
  if (section.heads != null) out.heads = section.heads.map((h) => ({ id: h.id, kind: h.kind, version: h.version }));
  return out;
}

/** The conversation a take holds, as turns in order (the exact turns the band played), or [] for no/bad section. */
export function bandConversation(section) {
  const rec = checkBandRecord(section);
  return rec ? rec.turns.map(turnOf) : [];
}

/** Who owns the move at `phrase` in a recorded take (a seat id or null) — what a seek lands on. */
export function bandOwnerAt(section, phrase) {
  const rec = checkBandRecord(section);
  if (!rec) return null;
  let state = createBandState();
  for (const row of rec.turns) {
    if (row[1] > phrase) break;
    state = applyTurn(state, turnOf(row));
  }
  const s = standingSolo(state, phrase);
  return s ? s.by : null;
}

let replay = null; // { section, rec, next }

/**
 * Playback: re-publish the take's turns due at `frame` on the bus (cause 'replay'). A seek moves the cursor to the
 * landing frame and publishes nothing (a conversation is not re-said; `bandOwnerAt` says who stands). Returns the
 * number of turns published. Never plays a turn of its own.
 */
export function replayBandFrame(frame, section, { seeked = false } = {}) {
  if (!section) {
    replay = null;
    return 0;
  }
  if (!replay || replay.section !== section) replay = { section, rec: checkBandRecord(section), next: 0 };
  const rows = replay.rec ? replay.rec.turns : [];
  if (seeked) {
    replay.next = 0;
    while (replay.next < rows.length && rows[replay.next][0] < frame) replay.next += 1;
  }
  let n = 0;
  while (replay.next < rows.length && rows[replay.next][0] <= frame) {
    emit(Events.BAND_TURN, turnOf(rows[replay.next]), { cause: 'replay' });
    replay.next += 1;
    n++;
  }
  return n;
}

/** Leave playback: forget the cursor. */
export function endBandReplay() {
  replay = null;
}
