// storyLive.js — #1560 S3: THE ROOM's story machine, live. The live half of storyState.js, in mindPresenceLive's
// shape: this driver owns what the pure module may not touch — the bus, localStorage (the book persists on this
// machine, beside the engagement scores), the session boundary, and the seeded rolls.
//
// It folds kc-voice/1 records as they happen (never a replay's: a take re-publishes its decisions with
// cause 'replay', and those events were already counted when they were live — folding them again would count
// the marriage's history twice), selects one beat per bar against the story state, and publishes a backstage
// view for the dev panel. The room itself shows none of it: no meters, no labels — the beats are the surface,
// and the arc in storyState has no readout here at all, by design (02 / research §1.8.7).
import { on, off, Events } from '../composition/eventBus.js';
import { hashU32 } from '../engine/kernel/rng.js';
import { readLedgerText, parseLedger } from './tasteLedger.js';
import {
  createStoryBook, decodeStoryBook, encodeStoryBook, beginSession, createEpisode,
  applyStoryEvent, selectStoryBeat, storyEventFromRecord, siftLedgers, STORY_BEAT_BUDGET,
} from './storyState.js';

export const STORY_STORAGE_KEY = 'kc:room:story:v1';
/** Save the book every this many folded records (and when the driver stops). */
export const STORY_SAVE_EVERY = 16;
/** How many fired beats the backstage log keeps. */
export const STORY_BEAT_LOG = 12;

let view = null;
/** The session boundary fires once per page load, keyed on the storage object's identity (whisper's per-page
 * module budgets, applied to the book's session counter): React StrictMode's second setup re-reads the saved
 * book, and beginning a session on every start would count one dev boot as two — the backstage readout showed
 * "session 2" on a virgin browser, and the suspicion arc's per-session rationing (§1.8.6) drifted with it. A
 * genuine second run always arrives as a page reload, whose localStorage is a fresh object. */
let begunFor;
const listeners = new Set();
const notify = () => { for (const fn of listeners) { try { fn(); } catch { /* a listener must not break the loop */ } } };

/** The dev readout, or null before the driver runs. Story state only — the arc has no readout, anywhere. */
export function getStoryView() { return view; }
export function subscribeStory(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const defaultStorage = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

/** The session-start sift of the artist's ledgers; a storage failure sifts to nothing, never to invention. */
const siftFromStorage = (store) => {
  try {
    const keeps = parseLedger(readLedgerText('keeps', store), () => {}).rows;
    const passes = parseLedger(readLedgerText('passes', store), () => {}).rows;
    return siftLedgers(keeps, passes);
  } catch { return []; }
};

/**
 * @param getSeed  () => the document seed (the rolls' seed, as the minds use)
 * @param getTiers () => { davis, lois } engagement tiers 1..4 (the milestone gate; absent = milestone beats never arm a voice)
 * @param isReplaying () => boolean: a take is playing back (the story idles — its history is already counted)
 * @param storage  { getItem, setItem } (localStorage by default; absent or throwing = this session only)
 * @returns stop()
 */
export function startStoryLive({ getSeed = () => 0, getTiers = null, isReplaying = () => false, storage = undefined } = {}) {
  const store = storage === undefined ? defaultStorage() : storage;
  let saved;
  try { saved = store ? store.getItem(STORY_STORAGE_KEY) : null; } catch { saved = null; }
  const book = saved ? decodeStoryBook(saved) : createStoryBook();
  if (begunFor !== store) { begunFor = store; beginSession(book); }
  // the session-start sift of the artist's own ledgers: debts, streaks, the last ending (research §1.6.6)
  const patterns = siftFromStorage(store);
  const ep = createEpisode(book, patterns);
  const beatLog = [];
  let rollN = 0;
  let folded = 0;
  let lastBar = 0;

  const roll = () => {
    rollN++;
    let seed;
    try { seed = Number(getSeed()) >>> 0; } catch { seed = 0; }
    return hashU32(seed ^ Math.imul(book.sessions + 1, 0x9e3779b9), 'room-story', rollN) / 4294967296;
  };
  const save = () => { try { if (store) store.setItem(STORY_STORAGE_KEY, encodeStoryBook(book)); } catch { /* private mode: this session only */ } };
  const publish = () => {
    view = {
      session: book.sessions,
      phase: ep.phase,
      intensity: Math.round(ep.intensity * 100) / 100,
      budget: STORY_BEAT_BUDGET,
      storyBeats: ep.storyBeats,
      esteem: { mood: Math.round(book.esteem.mood * 10) / 10, standing: Math.round(book.esteem.standing * 10) / 10 },
      trust: { mood: Math.round(book.trust.mood * 10) / 10, standing: Math.round(book.trust.standing * 10) / 10 },
      believed: {
        davis: { esteem: Math.round(book.believed.davis.esteem * 10) / 10, trust: Math.round(book.believed.davis.trust * 10) / 10 },
        lois: { esteem: Math.round(book.believed.lois.esteem * 10) / 10, trust: Math.round(book.believed.lois.trust * 10) / 10 },
      },
      grudges: book.grudges.map((g) => ({ topic: g.topic, count: g.count, promoted: g.promoted })),
      patterns: ep.patterns.map((p) => ({ kind: p.kind, ...(p.topic ? { topic: p.topic } : {}), ...(p.paletteId ? { paletteId: p.paletteId } : {}), fresh: !!p.fresh })),
      beats: beatLog.slice(),
    };
    notify();
  };
  publish();

  const fold = (ev) => {
    if (!ev) return;
    applyStoryEvent(book, ep, ev);
    if (ev.kind === 'bar') {
      let tiers;
      try { tiers = (typeof getTiers === 'function' ? getTiers() : null) || {}; } catch { tiers = {}; }
      const beat = selectStoryBeat(book, ep, { tiers, roll });
      if (beat) { beatLog.unshift(beat); if (beatLog.length > STORY_BEAT_LOG) beatLog.length = STORY_BEAT_LOG; }
    }
    if (++folded % STORY_SAVE_EVERY === 0) save();
    publish();
  };
  const live = (fn) => (p, meta) => {
    if (meta && meta.cause === 'replay') return; // counted when it was live; a replay must not count it again
    try { if (isReplaying()) return; } catch { /* idle only when sure */ }
    fn(p, meta);
  };
  const onDecision = live((p) => fold(storyEventFromRecord(Events.MIND_DECISION, p, lastBar)));
  const onRoom = live((p) => fold(storyEventFromRecord(Events.DIRECTOR_ROOM, p, lastBar)));
  const onCast = live((p) => fold(storyEventFromRecord(Events.DICE_CAST, p, lastBar)));
  const onBloom = live((p) => fold(storyEventFromRecord(Events.BLOOM, p, lastBar)));
  const onKeep = live((p) => fold(storyEventFromRecord(Events.KEEP_ADD, p, lastBar)));
  const onBar = live((p) => { if (p && Number.isInteger(p.bar)) lastBar = p.bar; fold(storyEventFromRecord(Events.CLOCK_BAR, p, lastBar)); });

  on(Events.MIND_DECISION, onDecision);
  on(Events.DIRECTOR_ROOM, onRoom);
  on(Events.DICE_CAST, onCast);
  on(Events.BLOOM, onBloom);
  on(Events.KEEP_ADD, onKeep);
  on(Events.CLOCK_BAR, onBar);
  save();
  return () => {
    off(Events.MIND_DECISION, onDecision);
    off(Events.DIRECTOR_ROOM, onRoom);
    off(Events.DICE_CAST, onCast);
    off(Events.BLOOM, onBloom);
    off(Events.KEEP_ADD, onKeep);
    off(Events.CLOCK_BAR, onBar);
    save();
  };
}
