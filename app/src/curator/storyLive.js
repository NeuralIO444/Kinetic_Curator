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
import { getLoreBank, pickOnThisDay, loreById } from './loreBank.js'; // #1560 S4: the lore bank (offline artifact)

export const STORY_STORAGE_KEY = 'kc:room:story:v1';
/** Save the book every this many folded records (and when the driver stops). */
export const STORY_SAVE_EVERY = 16;
/** How many fired beats the backstage log keeps. */
export const STORY_BEAT_LOG = 12;

let view = null;
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
 * @param getDate  () => { month, day } — the session's calendar date, an INPUT (S4): the lore cold open is
 *                 daily truth, and the pure modules read no clock. Absent = this machine's real date.
 * @param isReplaying () => boolean: a take is playing back (the story idles — its history is already counted)
 * @param storage  { getItem, setItem } (localStorage by default; absent or throwing = this session only)
 * @returns stop()
 */
export function startStoryLive({ getSeed = () => 0, getTiers = null, getDate = null, isReplaying = () => false, storage = undefined } = {}) {
  const store = storage === undefined ? defaultStorage() : storage;
  let saved;
  try { saved = store ? store.getItem(STORY_STORAGE_KEY) : null; } catch { saved = null; }
  const book = saved ? decodeStoryBook(saved) : createStoryBook();
  beginSession(book);
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
  // #1560 S4 — the day's cold open: the lore bank's on-this-day entry for the session's date, seeded into
  // the episode as a callback pattern. It competes for the session's ONE callback slot under the same bag
  // as the ledger callbacks (04's anti-repetition) — a day with no entry seeds nothing, and the room opens
  // in silence, which is a valid scene. The pick takes a roll from the same seeded stream as the beats,
  // so a given (seed, session, date) replays to the same cold open. No new transcript path: the beat, if
  // it fires, is a normal callback beat whose referent is the lore entry's id (law 1).
  const bank = getLoreBank();
  try {
    let date = null;
    if (typeof getDate === 'function') date = getDate();
    if (!date) { const now = new Date(); date = { month: now.getMonth() + 1, day: now.getDate() }; }
    const otd = bank ? pickOnThisDay(bank, date, roll) : null;
    if (otd) ep.patterns.push({ kind: 'onthisday', loreId: otd.id, fresh: true });
  } catch { /* a dateless session simply has no cold open — absence, never invention */ }
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
      patterns: ep.patterns.map((p) => ({ kind: p.kind, ...(p.topic ? { topic: p.topic } : {}), ...(p.paletteId ? { paletteId: p.paletteId } : {}), ...(p.loreId ? { loreId: p.loreId } : {}), fresh: !!p.fresh })),
      // a beat whose referent is a lore entry carries the entry's fact, resolved here — the beat itself
      // stays a referent (storyState knows no text); the backstage log is where the cold open is read
      beats: beatLog.map((b) => {
        const entry = b.referent && b.referent.loreId ? loreById(bank, b.referent.loreId) : null;
        return entry ? { ...b, loreFact: entry.fact } : b;
      }),
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
