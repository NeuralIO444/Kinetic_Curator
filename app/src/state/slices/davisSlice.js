import { startRun, tickRun, finishRun } from '../../data/evolveProgress.js';
import { loopClock } from '../../gl/loopClock.js';
import { createGrid, stepGrid } from '../../engine/ca-engine.js';
import { generateLayoutTargets, MORPHABLE_KEYS, PALETTE_IDS } from '../paramUtils.js';
import { genId } from '../id.js';
import { tickPhraseBeat } from '../phraseTick.js';
import { sanitizeBeatRoute } from '../beatArbiter.js';
import { pushToUndo } from '../history.js';
import { normalizeSeedOffsets } from '../../engine/kernel/rng.js';
import { EUCLID_MAX_STEPS } from '../euclid.js';
import { seqNextIndex, seqFireMode } from '../seqEngine.mjs';
import { SEQ_PAGE_SIZE } from '../seqEngine.mjs';

/** #589 — the three phrase clock sources. */
export const PHRASE_CLOCKS = ['audio', 'metro', 'euclid'];
import { normalizeLayoutParams } from '../../data/layout-modes.js';

// #568 — favorites are the set's curation (export-hits reads them), but they
// lived in memory only: a reload silently emptied the tray. Same pattern as the
// user palette library: their own kc: key, sanitized on the way back in (it is
// a trust boundary — recallFavorite writes layout straight into the store).
// Not in the project document on purpose: they are the performer's shelf, not
// the composition, and the hits export format is out of scope.
export const FAVORITES_KEY = 'kc:favorites:v1';
const FAVORITES_MAX = 200;
/** #719 — cap on a kept cast (ids, not the full enabled map). */
export const FAVORITE_CAST_MAX = 256;

/**
 * #719 — a keep's cast: the ENABLED asset ids, sorted and de-duplicated.
 * Absent (legacy keeps) stays absent — never invent a cast. Ids are opaque
 * strings here (catalog or `user:`); the project load path re-validates them.
 */
export function sanitizeCast(raw) {
  if (!Array.isArray(raw)) return undefined;
  const ids = [...new Set(raw.filter((x) => typeof x === 'string' && x && x.length <= 80))].sort();
  return ids.slice(0, FAVORITE_CAST_MAX);
}

/**
 * #719 — the ONE place a keep is captured, so every keep path (DAVIS ★, the
 * `f` hotkey) records the full recipe: seed, stream offsets (#305), layout,
 * palette and the cast. The hotkey used to drop the offsets.
 */
export function captureFavorite(state, paletteId) {
  const enabled = state.enabledAssets || {};
  return {
    seed: state.seed,
    seedOffsets: { ...(state.seedOffsets || {}) },
    timestamp: new Date().toISOString().slice(11, 19),
    config: {
      layout: { ...state.layoutParams },
      palette: { id: paletteId },
      assets: sanitizeCast(Object.keys(enabled).filter((k) => enabled[k])),
    },
  };
}

/** #719 — a kept cast back to the store's enabledAssets map (ids on, nothing else). */
function castToEnabled(ids) {
  return Object.fromEntries(ids.map((id) => [id, true]));
}

export function sanitizeFavorite(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seed = Number(raw.seed);
  if (!Number.isFinite(seed)) return null;
  const layout = raw.config?.layout;
  const paletteId = raw.config?.palette?.id;
  const cast = sanitizeCast(raw.config?.assets);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : genId(),
    seed,
    ...(raw.seedOffsets && typeof raw.seedOffsets === 'object'
      ? { seedOffsets: normalizeSeedOffsets(raw.seedOffsets) } : {}),
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp.slice(0, 32) : '',
    config: {
      ...(layout && typeof layout === 'object' && !Array.isArray(layout)
        ? { layout: normalizeLayoutParams(layout) } : {}),
      palette: { id: typeof paletteId === 'string' ? paletteId.slice(0, 80) : '' },
      ...(cast && cast.length ? { assets: cast } : {}),
    },
  };
}

function readFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(sanitizeFavorite).filter(Boolean).slice(0, FAVORITES_MAX)
      : [];
  } catch {
    return [];
  }
}

function persistFavorites(list) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[favorites] save failed', e);
  }
}

// seq-gap-toggles: per-gap cut/morph transitions, keyed by the destination
// favorite's id. Same trust boundary as favorites — sanitized on the way in.
export const SEQ_GAPS_KEY = 'kc:seq-gaps:v1';

function readSeqGaps() {
  try {
    const raw = localStorage.getItem(SEQ_GAPS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && k.length <= 80 && (v === 'cut' || v === 'morph')) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function persistSeqGaps(gaps) {
  try {
    localStorage.setItem(SEQ_GAPS_KEY, JSON.stringify(gaps));
  } catch (e) {
    console.warn('[seq-gaps] save failed', e);
  }
}

/**
 * #616 — stamp EVOLVE progress onto an evolve step's update: the generation
 * (only while EVOLVE runs) and the candidate seen (every tick, run or manual).
 */
function withEvolveStats(state, update) {
  if (!update || !Object.keys(update).length) return update;
  return {
    ...update,
    // #808: the run stamp rides the same loop clock as lastEvolveTs — a
    // Date.now() fallback here would mix clocks and break secPerGen.
    evolveRun: state.evolveMode ? tickRun(state.evolveRun, update.lastEvolveTs ?? loopClock.ms) : state.evolveRun,
    evolveSeen: (state.evolveSeen || 0) + 1,
  };
}

export const createDavisSlice = (set, get) => ({
  evolveMode: false,
  // #616 EVOLVE progress: live run, last finished run, candidates seen this session.
  evolveRun: null,
  evolveLast: null,
  evolveSeen: 0,
  evolveSource: 'time',
  evolveTarget: 'seed',
  evolveInterval: 2000,
  autoSnapshot: false,
  lastEvolveTs: 0,
  favorites: readFavorites(),
  // --- favorites sequencer (transport slices) ---
  // The playhead: index into the full arranged favorites array (NOT a
  // sliding window — seq-strip-cap). Manual transport and the clocks all
  // advance it; the strip highlights it. Tweaks ride on top — nothing locks.
  seqPlaying: false,
  seqIndex: 0,
  seqLoop: true,
  seqClock: 'metro', // metro | phrase | audio | euclid (picker in seq-clock-sources)
  seqGaps: readSeqGaps(), // { [favoriteId]: 'cut' | 'morph' } — transition INTO that favorite
  seqPage: 0, // seq-strip-cap: 16-cell pages; the playhead auto-follows when playing
  // Beat router: which consumers answer a mic attack when evolve SOURCE is
  // BEAT and the phrase CLOCK is AUDIO. 'both' (recommended) ticks the
  // phrase first, then fires evolve on the post-phrase state.
  beatRoute: 'both',

  morphEvolve: true,
  morphDurationMs: 1200,
  morphing: false,
  morphFrom: null,
  morphTo: null,
  morphStart: 0,
  morphTweakedKeys: {}, // seq-morph-semantics: params touched mid-morph ride on top
  morphPendingSeed: null,
  morphPendingPalette: null,
  // #305 — a morph-to-favorite lands the favorite's stream offsets with its seed.
  morphPendingSeedOffsets: null,

  phraseEnabled: false,
  phraseLength: 8,
  phraseMode: 'cycle-seed',
  phraseBeat: 0,
  phraseOriginSeed: null,
  phraseWrapGen: 0,
  phraseClock: 'audio',
  phraseBpm: 120,
  // #589 — Euclidean clock: k hits spread as evenly as possible over n steps.
  // The phrase advances on hit steps only, so the misses are part of the bar.
  euclidBeats: 5,
  euclidSteps: 8,
  euclidRotate: 0,

  setEvolveMode: (valOrFn) => set((state) => {
    const next = !!(typeof valOrFn === 'function' ? valOrFn(state.evolveMode) : valOrFn);
    if (next === !!state.evolveMode) return { evolveMode: next };
    // #808: run timing is loop time, not wall — the HUD cadence (secPerGen)
    // reads the real cadence, and the ticks land on the same clock.
    const now = loopClock.ms;
    // #616: start a fresh run on EVOLVE, keep a summary when it stops.
    return next
      ? { evolveMode: true, evolveRun: startRun(now) }
      : { evolveMode: false, evolveRun: null, evolveLast: finishRun(state.evolveRun, now) };
  }),
  setEvolveSource: (source) => set({ evolveSource: source }),
  setEvolveTarget: (target) => set({ evolveTarget: target }),
  setEvolveInterval: (interval) => set({ evolveInterval: interval }),
  setAutoSnapshot: (auto) => set({ autoSnapshot: auto }),
  setBeatRoute: (route) => set({ beatRoute: sanitizeBeatRoute(route) }),

  setMorphEvolve: (v) => set({ morphEvolve: !!v }),
  setMorphDurationMs: (ms) => set({
    morphDurationMs: Math.max(200, Math.min(8000, Number(ms) || 1200)),
  }),
  finishMorph: () => set((state) => ({
    morphing: false,
    morphFrom: null,
    morphTo: null,
    morphTweakedKeys: {},
    ...(state.morphPendingSeed != null ? { seed: state.morphPendingSeed } : {}),
    ...(state.morphPendingSeedOffsets ? { seedOffsets: state.morphPendingSeedOffsets } : {}),
    ...(state.morphPendingPalette ? { paletteId: state.morphPendingPalette } : {}),
    morphPendingSeed: null,
    morphPendingSeedOffsets: null,
    morphPendingPalette: null,
  })),

  setPhraseEnabled: (enabled) => set({ phraseEnabled: !!enabled, phraseBeat: 0 }),
  setPhraseLength: (len) => set({
    phraseLength: Math.max(2, Math.min(64, Number(len) || 8)),
    phraseBeat: 0,
  }),
  setPhraseMode: (mode) => set({ phraseMode: mode }),
  setPhraseClock: (clock) => set({
    phraseClock: PHRASE_CLOCKS.includes(clock) ? clock : 'audio',
  }),
  // Clamped against each other as well as to their ranges: beats > steps has
  // no Euclidean meaning (euclid.js degrades it to a plain metro).
  setEuclid: ({ beats, steps, rotate }) => set((state) => {
    const next = {};
    if (steps !== undefined) next.euclidSteps = Math.max(2, Math.min(EUCLID_MAX_STEPS, Math.round(Number(steps) || 8)));
    const n = next.euclidSteps ?? state.euclidSteps;
    if (beats !== undefined) next.euclidBeats = Math.max(0, Math.min(n, Math.round(Number(beats) || 0)));
    if (rotate !== undefined) next.euclidRotate = Math.max(0, Math.min(n - 1, Math.round(Number(rotate) || 0)));
    // A steps change can strand beats/rotate above the new ceiling.
    if (next.euclidSteps !== undefined) {
      next.euclidBeats = Math.min(next.euclidBeats ?? state.euclidBeats, n);
      next.euclidRotate = Math.min(next.euclidRotate ?? state.euclidRotate, n - 1);
    }
    return next;
  }),
  setPhraseBpm: (bpm) => set({ phraseBpm: Math.max(40, Math.min(240, Number(bpm) || 120)) }),
  armPhrase: (seed) => set({ phraseOriginSeed: seed, phraseBeat: 0 }),
  resetPhrase: () => set((state) => ({
    phraseBeat: 0,
    phraseWrapGen: (state.phraseWrapGen || 0) + 1,
    seed: state.phraseOriginSeed != null ? state.phraseOriginSeed : state.seed,
  })),

  tickPhraseBeat: () => set((state) => {
    const next = tickPhraseBeat(state, { stepGrid, createGrid });
    if (next.phraseDidWrap) {
      const rest = { ...next };
      delete rest.phraseDidWrap;
      return rest;
    }
    return next;
  }),

  triggerEvolve: (opts = {}) => set((state) => withEvolveStats(state, (() => {
    // #808: the stamp is loop time. Callers thread it through (App.jsx);
    // the event-bus path has no loop handle, so it reads the mirrored stamp.
    const ts = Number.isFinite(opts.loopTimeMs) ? opts.loopTimeMs : loopClock.ms;
    const caUpdate = state.layoutParams.mode === 'ca'
      ? { caGrid: state.caGrid ? stepGrid(state.caGrid) : createGrid(40, 28) }
      : {};

    if (state.evolveTarget === 'seed') {
      return { ...caUpdate, seed: (state.seed + 1) % 1000000, lastEvolveTs: ts };
    }

    if (state.evolveTarget === 'palette') {
      const currentIdx = PALETTE_IDS.indexOf(state.paletteId);
      const nextIdx = (currentIdx + 1) % PALETTE_IDS.length;
      return { ...caUpdate, paletteId: PALETTE_IDS[nextIdx], lastEvolveTs: ts };
    }

    if (state.evolveTarget === 'layout' || state.evolveTarget === 'all') {
      const targets = generateLayoutTargets(state);
      const seedUpdate = state.evolveTarget === 'all'
        ? { seed: (state.seed + 1) % 1000000 }
        : {};
      const paletteUpdate = state.evolveTarget === 'all'
        ? { paletteId: PALETTE_IDS[Math.floor(Math.random() * PALETTE_IDS.length)] }
        : {};

      if (state.morphEvolve) {
        const from = {};
        const to = {};
        for (const key of MORPHABLE_KEYS) {
          if (key in targets && !state.lockedParams[key]) {
            from[key] = state.layoutParams[key];
            to[key] = targets[key];
          }
        }
        return {
          // #107 §7: one undo entry for the whole morph, capturing the look
          // right before it starts — not one per lerp frame (useMorphEvolve
          // calls setLayoutParams, which never pushes undo, on every tick).
          ...pushToUndo(state, true),
          ...caUpdate,
          ...seedUpdate,
          ...paletteUpdate,
          morphing: true,
          morphFrom: from,
          morphTo: to,
          // #806: morph easing is a must-loop performer — stamp in loop ms
          // (useMorphEvolve reads loopClock.ms), never wall clock.
          morphStart: loopClock.ms,
          morphPendingSeed: null,
          morphPendingSeedOffsets: null,
          morphPendingPalette: null,
          lastEvolveTs: ts,
        };
      }

      return {
        ...caUpdate,
        ...seedUpdate,
        ...paletteUpdate,
        layoutParams: { ...state.layoutParams, ...targets },
        lastEvolveTs: ts,
      };
    }
    return {};
  })())),

  addFavorite: (fav) => set((state) => {
    const entry = sanitizeFavorite({ ...fav, id: genId() });
    if (!entry) return {};
    const favorites = [...state.favorites, entry].slice(-FAVORITES_MAX);
    persistFavorites(favorites);
    return { favorites };
  }),
  removeFavorite: (id) => set((state) => {
    const favorites = state.favorites.filter((f) => f.id !== id);
    persistFavorites(favorites);
    return { favorites };
  }),
  reorderFavorite: (id, delta) => set((state) => {
    const idx = state.favorites.findIndex((f) => f.id === id);
    if (idx < 0) return {};
    const j = Math.max(0, Math.min(state.favorites.length - 1, idx + delta));
    if (j === idx) return {};
    const next = [...state.favorites];
    const [item] = next.splice(idx, 1);
    next.splice(j, 0, item);
    persistFavorites(next);
    return { favorites: next };
  }),
  // seq-dnd: direct index move for drag-and-drop (cleaner than delta-chains).
  moveFavorite: (id, toIndex) => set((state) => {
    const idx = state.favorites.findIndex((f) => f.id === id);
    if (idx < 0) return {};
    const j = Math.max(0, Math.min(state.favorites.length - 1, Math.trunc(Number(toIndex)) || 0));
    if (j === idx) return {};
    const next = [...state.favorites];
    const [item] = next.splice(idx, 1);
    next.splice(j, 0, item);
    persistFavorites(next);
    return { favorites: next };
  }),
  // --- favorites sequencer transport (seq-transport-manual and on) ---
  seqPlay: () => set((state) => {
    if (state.seqPlaying || state.favorites.length === 0) return {};
    return { seqPlaying: true };
  }),
  seqStop: () => set({ seqPlaying: false }),
  seqTogglePlay: () => set((state) => {
    if (state.seqPlaying) return { seqPlaying: false };
    if (state.favorites.length === 0) return {};
    return { seqPlaying: true };
  }),
  seqSetLoop: (loop) => set({ seqLoop: !!loop }),
  seqSetClock: (clock) => set((state) => {
    const valid = ['metro', 'phrase', 'audio', 'euclid'];
    if (!valid.includes(clock)) return {};
    if (state.seqClock === clock) return {};
    return { seqClock: clock };
  }),
  seqSetIndex: (i) => set((state) => {
    const idx = Math.max(0, Math.trunc(Number(i)) || 0);
    const clamped = Math.min(idx, Math.max(0, state.favorites.length - 1));
    // The page follows the playhead — it stays stable across pages.
    return { seqIndex: clamped, seqPage: Math.floor(clamped / SEQ_PAGE_SIZE) };
  }),
  /**
   * Set the visible strip page (0-based), clamped to the page count.
   * Manual paging; while playing, seqStep auto-follows the playhead.
   */
  seqSetPage: (p) => set((state) => {
    const pageCount = Math.max(1, Math.ceil(state.favorites.length / SEQ_PAGE_SIZE));
    const page = Math.max(0, Math.min(pageCount - 1, Math.trunc(Number(p)) || 0));
    return { seqPage: page };
  }),
  /**
   * Set the transition INTO a favorite ('cut' | 'morph'). Keyed by favorite
   * id so it survives reorders; unknown ids and bogus modes are ignored.
   */
  seqSetGap: (favId, mode) => set((state) => {
    if (typeof favId !== 'string' || !favId) return {};
    if (mode !== 'cut' && mode !== 'morph') return {};
    if (!state.favorites.some((f) => f.id === favId)) return {};
    const seqGaps = { ...state.seqGaps, [favId]: mode };
    persistSeqGaps(seqGaps);
    return { seqGaps };
  }),
  /**
   * Advance the playhead one step. Returns { favorite, mode, index, wrapped }
   * for the caller to fire through the event bus (recall vs morph per the
   * gap toggle), or { stopped: true } when the end holds without loop.
   * Pure index math lives in seqEngine; this only commits the new index.
   */
  seqStep: () => {
    const state = get();
    const list = state.favorites;
    const res = seqNextIndex(state.seqIndex, list.length, state.seqLoop);
    if (res.stopped && list.length > 0 && state.seqIndex >= list.length - 1) {
      set({ seqPlaying: false });
      return { stopped: true };
    }
    if (res.stopped) return { stopped: true };
    const favorite = list[res.index];
    // The page follows the playhead while stepping — stable across pages.
    set({ seqIndex: res.index, seqPage: Math.floor(res.index / SEQ_PAGE_SIZE) });
    return { favorite, mode: seqFireMode(state.seqGaps, favorite?.id), index: res.index, wrapped: res.wrapped };
  },
  recallFavorite: (fav) => set({
    seed: fav.seed,
    // #305 — a kept recipe replays its stream offsets too.
    seedOffsets: normalizeSeedOffsets(fav.seedOffsets),
    ...(fav.config?.layout ? { layoutParams: { ...fav.config.layout } } : {}),
    ...(fav.config?.palette?.id ? { paletteId: fav.config.palette.id } : {}),
    // #719 — the kept cast comes back too; legacy keeps (no cast) leave the pool alone.
    ...(fav.config?.assets?.length ? { enabledAssets: castToEnabled(fav.config.assets) } : {}),
  }),
  morphToFavorite: (fav) => set((state) => {
    const target = fav.config?.layout;
    // #305 — old favorites carry no offsets → zeros, like a fresh project.
    const favOffsets = normalizeSeedOffsets(fav.seedOffsets);
    // #719 — the cast swaps at the press, like a shape chip (item-morph flies
    // the nodes into their new costumes); layout keeps its own morph below.
    const cast = fav.config?.assets?.length ? { enabledAssets: castToEnabled(fav.config.assets) } : {};
    if (!target || typeof target !== 'object') {
      return {
        ...cast,
        seed: fav.seed,
        seedOffsets: favOffsets,
        ...(fav.config?.palette?.id ? { paletteId: fav.config.palette.id } : {}),
      };
    }
    const from = {};
    const to = {};
    for (const key of MORPHABLE_KEYS) {
      if (key in target && state.layoutParams[key] !== undefined) {
        from[key] = state.layoutParams[key];
        to[key] = target[key];
      }
    }
    const discrete = {};
    for (const [k, v] of Object.entries(target)) {
      if (!(k in from) && k !== 'composition') discrete[k] = v;
    }
    if (Object.keys(to).length === 0) {
      return {
        ...cast,
        seed: fav.seed,
        seedOffsets: favOffsets,
        layoutParams: { ...state.layoutParams, ...target },
        ...(fav.config?.palette?.id ? { paletteId: fav.config.palette.id } : {}),
      };
    }
    return {
      // #107 §7: same one-entry-per-morph undo as triggerEvolve above.
      ...pushToUndo(state, true),
      ...cast,
      layoutParams: { ...state.layoutParams, ...discrete },
      morphing: true,
      morphFrom: from,
      morphTo: to,
      // seq-morph-semantics: a new morph restarts from the live layout
      // (overlapping morphs: latest wins) with a clean tweak slate.
      morphTweakedKeys: {},
      // #806: morph easing is a must-loop performer — stamp in loop ms
      // (useMorphEvolve reads loopClock.ms), never wall clock.
      morphStart: loopClock.ms,
      morphPendingSeed: fav.seed,
      morphPendingSeedOffsets: favOffsets,
      morphPendingPalette: fav.config?.palette.id || null,
    };
  }),
});
