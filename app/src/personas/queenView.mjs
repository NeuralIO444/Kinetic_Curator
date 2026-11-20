// personas/queenView.mjs — #2389 (Persona Kernel P9, spec §4 Q12): what she reads. READ-ONLY, inside KC-1 only.
//
// The seducer's privilege (Q11 follow-up, Q12): she reads everyone and is read by no one. queenView() is ONE
// aggregator over getters that already exist — every persona's private state, the ledgers, the Archive, the Wire,
// her own looks — and returns a plain, deep-copied snapshot. It writes nothing: it imports no setter, no dispatch, no
// emit, no subscribe, no storage writer (queenView.selfcheck.mjs fails the build on any such import, and runs the
// aggregate against a store snapshot whose every function throws). It never tells: no surface imports this module
// (queenDeniability.selfcheck.mjs), it logs nothing, and what it returns is never rendered, saved or sent. It shows
// only as how the room leans. Nothing outside KC-1: no file, no other app, no network, no microphone.
//
//   cover     COVER's (LOIS) last verdict and its parts, his grudges (per-genre cuts), his latest decision
//   overlap   OVERLAP's (DAVIS) conducting heat, his latest decision with its skip trace, the trio's conducting
//   horns     the band's view: every turn — the horns' calls and answers — and who holds the solo
//   governor  the Governor's budget (stress pressure and band) and cuts (the perf governor's sheds, the band's cuts)
//   ledgers   keeps, passes, takes, taste version, dwell, time of night
//   archive   the bundled Archive shelves (text only)
//   wire      the Wire (P10): the items in reach (plain text, read-only); the typed empty slot while there are none
//   looks     her own readings of the frame (and the timing lean standing now)
//   room      the story machine (rapport and grudge standing) and the room feed
//
// The caller hands in the live data it already holds (the store's state, the activity snapshot, the hour) — data, not
// functions: this module calls none of the caller's functions.
import { getLoisVerdict, getLoisVerdictParts } from '../curator/loisRank.js';
import { getLoisGrudges } from '../curator/loisGrudge.mjs';
import { getLastDecisions } from '../curator/mindLive.js';
import { getTrioView } from '../curator/trioLive.js';
import { conductHeat } from '../curator/director.js';
import { getStoryView } from '../curator/storyLive.js';
import { getRoomFeed } from '../curator/roomFeed.js';
import { getStressState } from '../curator/stressLive.js';
import { getTaste } from '../curator/tasteStore.js';
import { ledgerCounts } from '../curator/tasteLedger.js';
import { getGovernorEvents } from '../gl/governorEventLog.mjs';
import { isRecordingPerformance, performanceFrames } from '../gl/performanceCapture.mjs';
import { isPlaybackActive } from '../gl/playback.mjs';
import { getBandView } from './bandLive.js';
import { bundledArchiveFiles } from './personaArchiveLive.js';
import { getRhythmLooks, getRhythmTiming } from './rhythmRecord.mjs';
import { getWireView } from './wireRecord.mjs';

export const QUEEN_VIEW_SCHEMA = 'kc-queen-view/1';

/** The Wire's slot: typed, empty, read-only — what stands while nothing is in reach (the Wire off, or an empty shelf). P10 (#2390) fills it from wireRecord's getter. */
export const WIRE_SLOT = Object.freeze({ schema: 'kc-wire/0', built: false, items: Object.freeze([]) });

/** Every section the view carries, in order (the selfcheck pins it). */
export const QUEEN_VIEW_SECTIONS = Object.freeze([
  'cover',
  'overlap',
  'horns',
  'governor',
  'ledgers',
  'archive',
  'wire',
  'looks',
  'room',
]);

// a read that fails is an absent read (null), never a throw and never a guess
const read = (fn) => {
  try {
    const v = fn();
    return v === undefined ? null : v;
  } catch {
    return null;
  }
};
// plain data only: functions, cycles and anything unserializable are dropped, so nothing live leaks out
const plain = (v) => {
  try {
    return v === null || v === undefined ? null : JSON.parse(JSON.stringify(v));
  } catch {
    return null;
  }
};
const dataOf = (obj, keys) => {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of keys) {
    let v;
    try {
      v = obj[k];
    } catch {
      v = undefined;
    }
    if (typeof v !== 'function' && v !== undefined) out[k] = plain(v);
  }
  return out;
};
const lenOf = (v) => (Array.isArray(v) ? v.length : 0);

/** Time of night from an hour 0..23 (the caller's clock; this module reads none). */
export function timeOfNight(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (hour < 5) return 'deep';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'day';
  if (hour < 22) return 'evening';
  return 'night';
}

/**
 * The aggregate read.
 *   state     the store's state (useStore.getState()) — read as data: keeps, keep/pass counts, the seed
 *   activity  the activity snapshot (loisActivity.snapshot()) — dwell (idleMs) and the keep/roll windows
 *   hour      the local hour 0..23, for time of night
 * Returns a frozen plain object with every section in QUEEN_VIEW_SECTIONS.
 */
export function queenView({ state = null, activity = null, hour = null } = {}) {
  const decisions = read(getLastDecisions) || {};
  const band = read(getBandView);
  const counts = read(ledgerCounts);
  const taste = read(getTaste);
  const st = dataOf(state, ['keeps', 'seed']);
  const act = dataOf(activity, ['idleMs', 'keepsLast5m', 'keepTrend', 'rollCadence']);
  const view = {
    schema: QUEEN_VIEW_SCHEMA,
    cover: {
      verdict: plain(read(getLoisVerdict)),
      parts: plain(read(getLoisVerdictParts)),
      grudges: plain(read(getLoisGrudges)),
      decision: plain(decisions.lois ?? null),
    },
    overlap: {
      heat: plain(read(conductHeat)),
      decision: plain(decisions.davis ?? null),
      skips: plain(decisions.davis && Array.isArray(decisions.davis.skips) ? decisions.davis.skips : []),
      trio: plain(read(getTrioView)),
    },
    horns: {
      band: plain(band),
      calls: plain(band && Array.isArray(band.log) ? band.log.filter((t) => t && t.kind === 'trade') : []),
    },
    governor: {
      budget: plain(read(getStressState)),
      sheds: plain(read(getGovernorEvents)),
      cuts: plain(band && Array.isArray(band.log) ? band.log.filter((t) => t && t.kind === 'cut') : []),
    },
    ledgers: {
      keeps: lenOf(st.keeps),
      ledger: plain(counts),
      takes: { recording: read(isRecordingPerformance) === true, frames: plain(read(performanceFrames)), playing: read(isPlaybackActive) === true },
      tasteVersion: taste && Number.isInteger(taste.version) ? taste.version : null,
      dwellMs: Number.isFinite(act.idleMs) ? act.idleMs : null,
      keepsLast5m: Number.isFinite(act.keepsLast5m) ? act.keepsLast5m : null,
      keepTrend: act.keepTrend ?? null,
      rollCadence: act.rollCadence ?? null,
      timeOfNight: timeOfNight(hour),
    },
    archive: plain((read(bundledArchiveFiles) || []).map((f) => ({ persona: f.persona, file: f.file, text: f.text }))),
    wire: plain(read(getWireView) ?? WIRE_SLOT),
    looks: { readings: plain(read(getRhythmLooks) || []), timing: plain(read(getRhythmTiming)) },
    room: { story: plain(read(getStoryView)), feed: plain(read(getRoomFeed) || []) },
  };
  return deepFreeze(view);
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}
