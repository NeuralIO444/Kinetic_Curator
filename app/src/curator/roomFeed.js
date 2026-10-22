// roomFeed.js — #1560 S1: THE ROOM codec's retained window onto the kc-voice/1 bus.
//
// The transcript is a WINDOW onto the bus, never a chat (room-codec law 1): this module listens to the bus and
// keeps the last ROOM_FEED_MAX records, in the order they arrived, each classified by the content law of
// docs/research/room-codec/03-transcript-and-panel.md §Content law:
//   - persona utterances: a persona's MIND_DECISION whose validated reply carries a line — only what a persona
//     actually emitted. No line in the reply, no line in the transcript (silence is default, DS rule 4).
//   - room events: neutral system facts the bus already carries (a crown landing, the room's verdict changing,
//     a persona route landing or dropping, a voice earned). Nothing is invented here: an event kind the bus
//     does not carry today (a new seed, a governor shed) produces no line until the bus carries it.
// The Queen has no lines (law 2): her decisions never become records, and nothing here renders sway (DS rule 10).
import { on, off, Events } from '../composition/eventBus.js';
import { describeOp } from './mindConduct.js';
import { HEAD_MIN_FIDELITY } from './tasteHead.js';

export const ROOM_FEED_MAX = 60;

/** A MIND_DECISION payload → a persona line record, or null when the decision carries no utterance. */
export function personaLineFrom(d) {
  if (!d || (d.persona !== 'davis' && d.persona !== 'lois')) return null; // the Queen: no lines, ever (law 2)
  const raw = d.reply && typeof d.reply.line === 'string' ? d.reply.line : '';
  const text = raw.trim();
  if (!text) return null;
  return { kind: 'persona', persona: d.persona, bar: Number.isInteger(d.bar) ? d.bar : null, text };
}

/** The room's verdict as the transcript's tail line (the frozen mockup's "— the room, working —"). */
export function verdictLineOf(verdict) {
  if (typeof verdict !== 'string' || !verdict) return null;
  return `— the room, ${verdict === 'THE ROOM' ? 'working' : verdict.toLowerCase()} —`;
}

/** A bus event → a room-event line record, or null when the event is not transcript matter. */
export function roomLineFrom(event, p) {
  if (event === Events.DICE_CAST) {
    const n = p && Array.isArray(p.assetIds) ? p.assetIds.length : 0;
    return { kind: 'room', text: n > 0 ? `crown landed · ${n}` : 'crown landed' };
  }
  if (event === Events.DIRECTOR_ROOM) {
    const text = p && verdictLineOf(p.verdict);
    return text ? { kind: 'room', verdict: p.verdict, text } : null;
  }
  if (event === Events.MIND_ROUTE) {
    if (!p) return null;
    const desc = describeOp(p.op);
    if (p.status === 'applied') return desc ? { kind: 'room', text: `route landed · ${desc}` } : null;
    if (p.status === 'dropped') return { kind: 'room', text: `route dropped · ${p.reason || desc || 'no reason given'}` };
    return null;
  }
  if (event === Events.BLOOM) {
    const rolls = p && Number.isFinite(p.rolls) ? p.rolls : null;
    return { kind: 'room', text: rolls !== null ? `bloom · a voice earned after ${rolls} rolls` : 'bloom · a voice earned' };
  }
  return null;
}

/**
 * The retained window itself: push classified records, oldest first, capped at `max`. A verdict record that
 * repeats the standing verdict is not news (the room did not change), so it is not kept twice in a row.
 */
export function createRoomFeed(max = ROOM_FEED_MAX) {
  const records = [];
  const subs = new Set();
  let lastVerdict = null;
  let seq = 0;
  const notify = () => { for (const fn of [...subs]) { try { fn(); } catch { /* a bad subscriber never breaks the feed */ } } };
  return {
    push(line) {
      if (!line || typeof line.text !== 'string' || !line.text) return false;
      if (line.verdict) {
        if (line.verdict === lastVerdict) return false;
        lastVerdict = line.verdict;
      }
      line.seq = ++seq;
      records.push(line);
      if (records.length > max) records.splice(0, records.length - max);
      notify();
      return true;
    },
    records: () => records.slice(),
    depth: () => records.length,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    clear() { records.length = 0; lastVerdict = null; seq = 0; notify(); },
  };
}

/**
 * The header's TASTE meter: block bars reading the taste context (03 §Readouts). The taste head's fidelity,
 * 0..1, over `slots` blocks — and below the house's own fidelity bar the taste reads as absent (0 blocks),
 * the same honest read the top bar's diamonds make (topbarTaste).
 */
export function tasteBlocks(taste, slots = 10) {
  const f = taste && taste.head && Number.isFinite(taste.head.fidelity) ? taste.head.fidelity : 0;
  if (!(f >= HEAD_MIN_FIDELITY)) return 0;
  return Math.max(1, Math.min(slots, Math.round(f * slots)));
}

// ── the live feed: one retained window per app run, fed by the bus ─────────────────────────────────────────────
const feed = createRoomFeed();
let started = false;

/** Subscribe the feed to the bus. Idempotent; returns the stop function. */
export function startRoomFeed() {
  if (started) return stopRoomFeed;
  started = true;
  on(Events.MIND_DECISION, onDecision);
  on(Events.DIRECTOR_ROOM, onRoom);
  on(Events.DICE_CAST, onCast);
  on(Events.MIND_ROUTE, onRoute);
  on(Events.BLOOM, onBloom);
  return stopRoomFeed;
}
function stopRoomFeed() {
  if (!started) return;
  started = false;
  off(Events.MIND_DECISION, onDecision);
  off(Events.DIRECTOR_ROOM, onRoom);
  off(Events.DICE_CAST, onCast);
  off(Events.MIND_ROUTE, onRoute);
  off(Events.BLOOM, onBloom);
}
const onDecision = (d) => { feed.push(personaLineFrom(d)); };
const onRoom = (p) => { feed.push(roomLineFrom(Events.DIRECTOR_ROOM, p)); };
const onCast = (p) => { feed.push(roomLineFrom(Events.DICE_CAST, p)); };
const onRoute = (p) => { feed.push(roomLineFrom(Events.MIND_ROUTE, p)); };
const onBloom = (p) => { feed.push(roomLineFrom(Events.BLOOM, p)); };

/** The retained records, oldest first (at most ROOM_FEED_MAX). */
export function getRoomFeed() { return feed.records(); }
/** How deep the bus window currently runs — the header's BUS readout. */
export function getRoomDepth() { return feed.depth(); }
export function subscribeRoomFeed(fn) { return feed.subscribe(fn); }
export function resetRoomFeed() { feed.clear(); }
