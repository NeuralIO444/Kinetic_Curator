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
import { Events, on } from '../composition/eventBus.js';

// Feed tunables — surfaces read these, nothing else sets them.
export const LOIS_AWAY_MS = 5 * 60 * 1000; // AWAY: "he's out of the room" is literally true
export const LOIS_BURN_MS = 15 * 60 * 1000; // BURN: chain-smoker
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
    keeps: [], // ts of favorite adds
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
    s.seedRevisit = seen && s.seed !== seed;
    if (s.seed !== seed) {
      s.seed = seed;
      s.seedSetAt = at;
    }
  }

  function snapshot() {
    const at = t();
    const idleMs = at - s.lastActivityTs;
    const last = s.favorites[s.favorites.length - 1] || null;
    return {
      now: at,
      idleMs,
      away: idleMs >= LOIS_AWAY_MS,
      burning: idleMs >= LOIS_BURN_MS,
      tabHidden: s.tabHidden,
      dwellMs: s.dwell ? at - s.dwell.startedAt : 0,
      dwellSeed: s.dwell ? s.dwell.seed : null,
      seedRevisit: !!s.seedRevisit,
      lastDwellMs: s.dwells.length ? s.dwells[s.dwells.length - 1].ms : 0,
      lastFavorite: last,
      favoriteCount: s.favorites.length,
      recallCount: s.recalls.length,
      exportCount: s.exports.length,
      rollsLast5m: countSince(s.rolls, LOIS_ROLL_KEEP_WINDOW_MS, at),
      keepsLast5m: countSince(s.keeps, LOIS_ROLL_KEEP_WINDOW_MS, at),
      undosLast10s: countSince(s.undos, LOIS_UNDO_BURST_WINDOW_MS, at),
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
          s.favorites.push({
            ts: at,
            msSinceSeed: at - s.seedSetAt,
            seed: p.favorite.seed ?? null,
            paletteId: p.favorite.config?.palette?.id ?? null,
          });
          cap(s.favorites);
          s.keeps.push(at);
          cap(s.keeps);
          beat();
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
    const noteRoll = () => {
      s.rolls.push(t());
      cap(s.rolls);
      beat();
    };
    unsubs.push(on(Events.LAYOUT_CURATE, noteRoll));
    unsubs.push(on(Events.KINETIC_TAP, noteRoll));

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
      });
      const init = read(store.getState());
      noteSeed(init.seed, init.comp);
      let prev = init;
      unsubs.push(
        store.subscribe((st) => {
          const cur = read(st);
          if (cur.seed !== prev.seed || cur.comp !== prev.comp) noteSeed(cur.seed, cur.comp);
          if (cur.undoDepth === prev.undoDepth - 1 && cur.redoDepth >= prev.redoDepth) {
            s.undos.push(t());
            cap(s.undos);
            beat();
          }
          prev = cur;
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

  const api = { start, stop, beat, noteSeed, snapshot };
  return api;
}

// App singleton — inert until start() is called (App.jsx wires it).
export const loisActivity = createLoisActivity();
