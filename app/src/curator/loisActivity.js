// loisActivity.js — the LOIS honest feed (#948/#956).
//
// The single place user-behavior signals are recorded for the curator
// persona. Every LOIS state must be driven by a REAL signal — never a timer
// pretending to have an opinion. This module only records and exposes; the
// surfaces (HUD pill #948, TUI #956) come later.
//
// Wall-clock lives HERE, never in the store (#806: slice files are must-loop
// performers — same pattern as the kinetic button's useRef). It subscribes
// to the existing event bus plus one passive store subscription; it writes
// nothing, renders nothing, changes nothing visible.
import { Events, on, emit } from '../composition/eventBus.js';

// Feed tunables — surfaces read these, nothing else sets them.
export const LOIS_AWAY_MS = 5 * 60 * 1000; // AWAY: "he's out of the room" is literally true
// BURN: a hot streak, chain-smoking: this many keeps inside the rolls-vs-keeps window below (#1126; it used to mean
// fifteen minutes of nothing, which contradicted the word).
export const LOIS_BURN_KEEPS = 3;
// Davis reads the same feed through his own windows (#1126); the thresholds live with his states, in davisState.js.
import { DAVIS_UGLY_PASSES, DAVIS_UGLY_WINDOW_MS, DAVIS_FLOW_WINDOW_MS } from './davisState.js';
// A keep reaches the feed from two doors (the bus event, and the store's own list growing, which F / the star / K
// use directly). Two notes this close together are the one keep.
const KEEP_DEDUPE_MS = 250;
export const LOIS_VIBE_DWELL_MS = 8000; // VIBE starting point: lingered this long, no action (tune by feel)
export const LOIS_ROLL_KEEP_WINDOW_MS = 5 * 60 * 1000; // rolls-vs-keeps window
export const LOIS_UNDO_BURST_WINDOW_MS = 10 * 1000; // undo-burst window
const LOG_CAP = 100; // per-log memory bound

const cap = (arr) => {
  if (arr.length > LOG_CAP) arr.splice(0, arr.length - LOG_CAP);
};
const countSince = (list, windowMs, nowTs) => {
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (nowTs - list[i] > windowMs) break;
    n++;
  }
  return n;
};

/**
 * Parse a favorite timestamp honestly. Full epoch ISO (current format)
 * resolves to ms; legacy "HH:MM:SS" (time-of-day only, pre-#948) resolves to
 * null — no date means no conviction timing, and we never invent one.
 */
export function parseFavoriteTimestamp(ts) {
  if (typeof ts !== 'string' || !ts) return null;
  if (/^\d{2}:\d{2}:\d{2}$/.test(ts)) return null; // legacy: date unknown
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

export function createLoisActivity({ now = () => Date.now() } = {}) {
  const t = () => now();
  const s = {
    lastActivityTs: t(),
    tabHidden: false,
    seedSetAt: t(),
    seed: null,
    dwell: null, // open window: { seed, comp, startedAt }
    dwells: [], // closed windows: { seed, comp, ms }
    favorites: [], // { ts, msSinceSeed, seed, paletteId }
    recalls: [], // { ts, seed }
    exports: [], // { ts, seed, paletteId }
    rolls: [], // ts of curate + KINETIC taps
    keeps: [], // ts of keeps (any door: F, the star, K)
    passes: [], // ts of rolls that replaced a frame nobody kept (a roll while frameKept was false): Davis's UGLY
    evolves: [], // ts of EVOLVE fires: the generator rolling with nobody at the controls
    seedChanges: [], // ts the seed value changed
    rollsSinceSeed: 0,
    bloomAt: null, // ts of a keep that followed a run of passes: the ugly paid off
    bloomDepth: 0, // how many rolls (passes) that run held: the number an earned voice carries (#1153)
    passRun: 0, // the artist's own passes (CURATOR, KIN) since the last keep; EVOLVE fires are Davis's and do not count
    muted: 0, // >0 while the machine (the dead-frame guard) is re-dealing: not the artist, not noted
    frameKept: false, // the frame on screen was kept: true from a keep until the next roll or seed change (#1126: NOD)
    keepNote: { at: -Infinity, door: null },
    favNote: { at: -Infinity, door: null },
    undos: [], // ts
    seedRevisit: false,
  };
  const unsubs = [];
  let removeDomListeners = null;

  const beat = () => {
    s.lastActivityTs = t();
  };

  // Instrument 5 — dwell windows. Called on seed/composition change via the
  // passive store subscription in start(); closing the old window first.
  function noteSeed(seed, comp) {
    const at = t();
    if (s.dwell && (s.dwell.seed !== seed || s.dwell.comp !== comp)) {
      s.dwells.push({ seed: s.dwell.seed, comp: s.dwell.comp, ms: at - s.dwell.startedAt });
      cap(s.dwells);
    }
    const seen = s.dwells.some((d) => d.seed === seed);
    s.dwell = { seed, comp, startedAt: at };
    s.frameKept = false; // a new seed or composition is not the frame that was kept
    s.seedRevisit = seen && s.seed !== seed;
    const first = s.seed === null;
    if (s.seed !== seed) {
      s.seed = seed;
      s.seedSetAt = at;
      s.rollsSinceSeed = 0;
      if (first === false) { s.seedChanges.push(at); cap(s.seedChanges); } // loading a seed is not dropping one
    }
  }

  // One keep, however it arrived. The bus carries the DAVIS star; F, the star and K also dispatch straight to the
  // store, so the store's own lists growing is the signal that never misses (#1001 found the same gap for the pill).
  function noteKeep(door, at) {
    if (s.keepNote.door !== door && at - s.keepNote.at < KEEP_DEDUPE_MS) return;
    s.keepNote = { at, door };
    // a keep after a run of passes is the payoff (Davis BLOOM); count the passes BEFORE this keep lands
    const bloomed = countSince(s.passes, DAVIS_UGLY_WINDOW_MS, at) >= DAVIS_UGLY_PASSES;
    const rolls = s.passRun;
    if (bloomed) { s.bloomAt = at; s.bloomDepth = rolls; }
    s.passRun = 0;
    s.keeps.push(at);
    cap(s.keeps);
    s.frameKept = true;
    beat();
    // announced AFTER the ledgers are updated and while the kept frame is still the live one (#1153 mints from it)
    if (bloomed) emit(Events.BLOOM, { rolls, at });
  }
  function noteFavorite(fav, at, door) {
    if (s.favNote.door !== door && at - s.favNote.at < KEEP_DEDUPE_MS) return;
    s.favNote = { at, door };
    s.favorites.push({ ts: at, msSinceSeed: at - s.seedSetAt, seed: fav.seed ?? null, paletteId: fav.config?.palette?.id ?? null });
    cap(s.favorites);
  }

  function snapshot() {
    const at = t();
    const idleMs = at - s.lastActivityTs;
    const last = s.favorites[s.favorites.length - 1] || null;
    return {
      now: at,
      idleMs,
      away: idleMs >= LOIS_AWAY_MS,
      burning: countSince(s.keeps, LOIS_ROLL_KEEP_WINDOW_MS, at) >= LOIS_BURN_KEEPS,
      frameKept: s.frameKept,
      tabHidden: s.tabHidden,
      dwellMs: s.dwell ? at - s.dwell.startedAt : 0,
      dwellSeed: s.dwell ? s.dwell.seed : null,
      seedRevisit: !!s.seedRevisit,
      lastDwellMs: s.dwells.length ? s.dwells[s.dwells.length - 1].ms : 0,
      lastFavorite: last,
      favoriteCount: s.favorites.length,
      recallCount: s.recalls.length,
      exportCount: s.exports.length,
      lastRollAgoMs: s.rolls.length ? at - s.rolls[s.rolls.length - 1] : null, // #1122: the V pill breathes only after a real roll
      rollsLast5m: countSince(s.rolls, LOIS_ROLL_KEEP_WINDOW_MS, at),
      keepsLast5m: countSince(s.keeps, LOIS_ROLL_KEEP_WINDOW_MS, at),
      undosLast10s: countSince(s.undos, LOIS_UNDO_BURST_WINDOW_MS, at),
      // Davis's inputs (#1126)
      rollsLastMinute: countSince(s.rolls, DAVIS_FLOW_WINDOW_MS, at),
      passesLast2m: countSince(s.passes, DAVIS_UGLY_WINDOW_MS, at),
      seedAgeMs: s.seed == null ? 0 : at - s.seedSetAt,
      seedDropped: s.seedChanges.length > 0, // a seed was dropped this session (the first one was only loaded)
      rollsSinceSeed: s.rollsSinceSeed,
      keptThisSeed: s.keeps.some((k) => k >= s.seedSetAt),
      bloomAgeMs: s.bloomAt == null ? null : at - s.bloomAt,
      bloomAt: s.bloomAt,
      bloomDepth: s.bloomDepth,
      evolveCount: s.evolves.length,
    };
  }

  function start({ store } = {}) {
    // Instrument 1 — activity heartbeat. DOM-only; guarded for node/selfcheck.
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const onBeat = () => beat();
      const onVis = () => {
        s.tabHidden = document.hidden;
        if (!document.hidden) beat(); // coming back counts as activity
      };
      window.addEventListener('pointerdown', onBeat, { passive: true });
      window.addEventListener('keydown', onBeat, { passive: true });
      document.addEventListener('visibilitychange', onVis);
      removeDomListeners = () => {
        window.removeEventListener('pointerdown', onBeat);
        window.removeEventListener('keydown', onBeat);
        document.removeEventListener('visibilitychange', onVis);
      };
    }

    // Instruments 2+3 — favorite:add (with ms-since-seed for GOLD timing) and
    // favorite:recall (the revisit signal). Both already ride DAVIS_FAVORITE.
    unsubs.push(
      on(Events.DAVIS_FAVORITE, (p) => {
        if (!p || typeof p !== 'object') return;
        const at = t();
        if (p.action === 'add' && p.favorite) {
          noteFavorite(p.favorite, at, 'bus');
          noteKeep('bus', at);
        } else if (p.action === 'recall' && p.favorite) {
          s.recalls.push({ ts: at, seed: p.favorite.seed ?? null });
          cap(s.recalls);
          beat();
        }
      }),
    );

    // Instrument 4 — export hook: they took it with them (stronger than a favorite).
    unsubs.push(
      on(Events.EXPORT_SNAPSHOT, (p) => {
        s.exports.push({ ts: t(), seed: p?.seed ?? null, paletteId: p?.config?.palette?.id ?? null });
        cap(s.exports);
        beat();
      }),
    );

    // Instrument 6 — rolls-per-keep: curate taps and KINETIC taps vs keeps.
    const noteRoll = (kind) => {
      const at = t();
      s.rolls.push(at);
      cap(s.rolls);
      if (!s.frameKept) {
        s.passes.push(at); cap(s.passes); // it replaced a frame nobody kept
        // the number an earned voice carries is the ARTIST's rolls: an EVOLVE left running overnight must not farm depth
        if (kind !== 'evolve') s.passRun += 1;
      }
      s.rollsSinceSeed += 1;
      s.frameKept = false; // rolling moves off the kept frame
      if (kind !== 'evolve') beat(); // an EVOLVE fire is the generator at work, not the artist: it must not wake LOIS
    };
    unsubs.push(on(Events.LAYOUT_CURATE, () => noteRoll('curate')));
    unsubs.push(on(Events.KINETIC_TAP, () => noteRoll('kin')));

    // Passive store subscription: dwell windows (5) + undo bursts (7).
    // Undo pops exactly one entry AND pushes it onto the redo stack; an
    // import clears both stacks (#639) — so only (undo -1, redo not down)
    // counts as an undo. Never a dispatch site.
    if (store && typeof store.subscribe === 'function' && typeof store.getState === 'function') {
      const read = (st) => ({
        seed: st.seed ?? null,
        comp: st.layoutParams?.composition ?? null,
        undoDepth: Array.isArray(st.historyUndoStack) ? st.historyUndoStack.length : 0,
        redoDepth: Array.isArray(st.historyRedoStack) ? st.historyRedoStack.length : 0,
        evolveTs: st.lastEvolveTs ?? null,
        favIds: new Set((Array.isArray(st.favorites) ? st.favorites : []).map((f) => f && f.id)),
        keepIds: new Set((Array.isArray(st.keeps) ? st.keeps : []).map((k) => k && k.id)),
      });
      // exactly one new entry is a keep; an import or a restore lands many at once and is not one
      const fresh = (list, before) => (Array.isArray(list) ? list.filter((e) => e && !before.has(e.id)) : []);
      const init = read(store.getState());
      noteSeed(init.seed, init.comp);
      let prev = init;
      unsubs.push(
        store.subscribe((st) => {
          const cur = read(st);
          // `prev` moves on BEFORE anything is noted: a note can announce an event (BLOOM) whose handler writes the
          // store, which re-enters this listener, and that re-entry must see this update as already seen.
          const was = prev;
          prev = cur;
          if (s.muted) return; // the machine, not the artist (the dead-frame guard re-dealing)
          const newFav = fresh(st.favorites, was.favIds); const newKeep = fresh(st.keeps, was.keepIds);
          if (newFav.length === 1 && cur.favIds.size > was.favIds.size - 1) noteFavorite(newFav[0], t(), 'store');
          if (cur.evolveTs != null && cur.evolveTs !== was.evolveTs) { s.evolves.push(t()); cap(s.evolves); noteRoll('evolve'); }
          if (cur.seed !== was.seed || cur.comp !== was.comp) noteSeed(cur.seed, cur.comp);
          if (cur.undoDepth === was.undoDepth - 1 && cur.redoDepth >= was.redoDepth) {
            s.undos.push(t());
            cap(s.undos);
            beat();
          }
          // last: a keep can announce BLOOM, and its handler may write the store
          if (newKeep.length === 1) noteKeep('store', t());
        }),
      );
    }

    return api;
  }

  function stop() {
    for (const u of unsubs.splice(0)) {
      try {
        u();
      } catch {
        /* listener already gone */
      }
    }
    if (removeDomListeners) {
      removeDomListeners();
      removeDomListeners = null;
    }
  }

  /** Run `fn` as the MACHINE: the store changes it makes (a re-deal, its undo) are not the artist and are not noted. */
  function machine(fn) {
    s.muted += 1;
    try { return fn(); } finally { s.muted -= 1; }
  }

  const api = { start, stop, beat, noteSeed, snapshot, machine };
  return api;
}

// App singleton — inert until start() is called (App.jsx wires it).
export const loisActivity = createLoisActivity();
