// canonBus.mjs — #2049 (Canon S6): Canon records on the core buses.
//
// The audit's finding: no look, style or voice record declared any relationship to the event bus — code
// subscribed on a record's behalf, case by case — and the trio's visibility was one-way: the stage could see the
// trio, the trio saw only a hand-built snapshot with no idea a Canon existed.
//
// This is the ONE generic binder that closes both. It reads each Canon record's declared `bus` binding
// (data/canon/styles.js) and wires exactly that, nothing more:
//
//   • for every channel a record lists under `listens`, the record attends to that decision: the binder checks
//     whether the record now stands on the stage and, while it stands, counts what it has heard on that channel
//   • when a record takes the stage, the binder publishes each channel the record lists under `announces`
//
// There is no per-record code here and no per-channel code: change a record's declaration and its connection
// changes with it (canonBus.selfcheck proves a record that does not list a channel is deaf to it). The bus
// carries DECISIONS, never frames — every channel a record may name is one of the bus's own decision events.
//
// What "stands" means is taste's style stamp (curator/tasteStyle.js styleContextFor — the same reading a keep is
// stamped with): the dealt Look's style and the dealt voice's styles.
//
// snapshot() is the Canon's state as the trio is handed it each bar (curator/mindContext.js `canon` block).
//
// THE REPLAY LAW (unchanged): the Canon only watches and announces. It never asks the stage for anything, it
// subscribes to none of its own announcements, and while a take plays back it is muted like the minds are —
// the take's record stays the sole source of truth.
import { on, emit, Events } from '../composition/eventBus.js';
import { CANON_STYLES } from '../data/canon/styles.js';
import { canonChapterForStyle } from '../data/canon/index.js';
import { styleContextFor } from './tasteStyle.js';

/** Every channel name the bus knows — a record may bind only to these. */
const BUS_CHANNELS = new Set(Object.values(Events));

/** The channels a record's declaration names that the bus does not know (empty for a well-formed record). */
export function unknownChannels(record) {
  const b = (record && record.bus) || {};
  return [...(b.listens || []), ...(b.announces || [])].filter((c) => !BUS_CHANNELS.has(c));
}

/** The style ids standing on the stage for a store state: the dealt Look's style, then the voice's styles. */
export function standingStyles(state) {
  const ctx = styleContextFor(state);
  if (!ctx) return [];
  return [...new Set([...(ctx.id ? [ctx.id] : []), ...ctx.voice])];
}

const rank = (order, id) => (order.indexOf(id) < 0 ? order.length : order.indexOf(id));

/**
 * Start the Canon binder. Returns { stop, snapshot, bindings }.
 *
 * @param getState    () => the store state (read-only; the binder never writes it)
 * @param isReplaying () => true while a take plays back (the binder is then muted)
 * @param records     the Canon records to bind — defaults to the style records. Injectable for tests.
 * @param standing    (state) => the ids of the records that stand — defaults to standingStyles
 */
export function startCanonBus({
  getState,
  isReplaying = () => false,
  records = CANON_STYLES,
  standing = standingStyles,
} = {}) {
  const live = new Map(); // record id -> { sinceBar, via, heard: { channel: count } }
  let bar = null;
  const state = () => {
    try {
      return getState ? getState() : null;
    } catch {
      return null;
    }
  };
  const muted = () => {
    try {
      return !!isReplaying();
    } catch {
      return false;
    }
  };

  // one bus listener per (record, declared channel) — the declaration IS the subscription list
  const bindings = [];
  const offs = [];
  for (const record of records) {
    const b = record.bus;
    if (!b) continue;
    for (const channel of b.listens || []) {
      if (!BUS_CHANNELS.has(channel)) continue; // an unknown channel binds nothing (pinned by selfcheck)
      bindings.push({ id: record.id, channel });
      offs.push(
        on(channel, (payload) => {
          if (muted()) return;
          if (channel === Events.CLOCK_BAR && payload && Number.isInteger(payload.bar)) bar = payload.bar;
          attend(record, channel);
        }),
      );
    }
  }

  function attend(record, channel) {
    const ids = standing(state()) || [];
    const stands = ids.includes(record.id);
    const entry = live.get(record.id);
    if (!stands) {
      if (entry) live.delete(record.id); // it left the stage: its hearing ends with it
      return;
    }
    if (!entry) {
      live.set(record.id, { sinceBar: bar, via: channel, heard: {} });
      // it has just taken the stage: publish what the RECORD says it announces
      for (const out of record.bus.announces || []) {
        if (!BUS_CHANNELS.has(out)) continue;
        const chapter = canonChapterForStyle(record.id);
        emit(
          out,
          { kind: 'style', id: record.id, chapter: chapter ? chapter.id : null, via: channel, bar },
          { cause: 'canon' },
        );
      }
      return; // the event that brought it on is not also "heard while standing"
    }
    entry.heard[channel] = (entry.heard[channel] || 0) + 1;
  }

  return {
    /** Unsubscribe everything and forget the standing table. */
    stop() {
      for (const off of offs.splice(0)) off();
      live.clear();
    },
    /** The (record, channel) pairs the declarations produced — the whole wiring, readable. */
    bindings: () => bindings.map((b) => ({ ...b })),
    /**
     * The Canon's state for the per-bar context: what stands, the Book chapter, and for each standing record
     * what it has heard since it took the stage. Null when nothing Canon stands.
     */
    snapshot() {
      const st = state();
      const ctx = styleContextFor(st);
      if (!ctx && !live.size) return null;
      const order = standing(st) || [];
      return {
        style: ctx ? ctx.id : null,
        voice: ctx ? [...ctx.voice] : [],
        chapter: ctx ? ctx.chapter : null,
        book: typeof st?.kineticChapterId === 'string' ? st.kineticChapterId : null,
        // the Look's style first, then the voice's — the order the stage reads, not the order records are declared
        standing: [...live.entries()]
          .sort(([a], [b]) => rank(order, a) - rank(order, b))
          .map(([id, e]) => ({
            id,
            via: e.via,
            bars: e.heard[Events.CLOCK_BAR] || 0,
            onsets: e.heard[Events.AUDIO_ONSET] || 0,
            taps: e.heard[Events.KINETIC_TAP] || 0,
          })),
      };
    },
  };
}
