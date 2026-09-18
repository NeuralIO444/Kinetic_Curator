import { createGrid, stepGrid } from '../../engine/ca-engine.js';
import { generateLayoutTargets, MORPHABLE_KEYS, PALETTE_IDS } from '../paramUtils.js';
import { genId } from '../id.js';
import { tickPhraseBeat } from '../phraseTick.js';
import { sanitizeBeatRoute } from '../beatArbiter.js';
import { pushToUndo } from '../history.js';
import { normalizeSeedOffsets } from '../../engine/kernel/rng.js';

export const createDavisSlice = (set) => ({
  evolveMode: false,
  evolveSource: 'time',
  evolveTarget: 'seed',
  evolveInterval: 2000,
  autoSnapshot: false,
  lastEvolveTs: 0,
  favorites: [],
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
  morphPendingSeed: null,
  morphPendingPalette: null,
  // #305 — a morph-to-favorite lands the favorite's stream offsets with its seed.
  morphPendingSeedOffsets: null,

  phraseEnabled: false,
  phraseLength: 8,
  phraseMode: 'reset-seed',
  phraseBeat: 0,
  phraseOriginSeed: null,
  phraseWrapGen: 0,
  phraseClock: 'audio',
  phraseBpm: 120,

  setEvolveMode: (valOrFn) => set((state) => ({
    evolveMode: typeof valOrFn === 'function' ? valOrFn(state.evolveMode) : valOrFn,
  })),
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
  setPhraseClock: (clock) => set({ phraseClock: clock === 'metro' ? 'metro' : 'audio' }),
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

  triggerEvolve: () => set((state) => {
    const ts = Date.now();
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
          morphStart: performance.now(),
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
  }),

  addFavorite: (fav) => set((state) => ({ favorites: [...state.favorites, { id: genId(), ...fav }] })),
  removeFavorite: (id) => set((state) => ({
    favorites: state.favorites.filter((f) => f.id !== id),
  })),
  reorderFavorite: (id, delta) => set((state) => {
    const idx = state.favorites.findIndex((f) => f.id === id);
    if (idx < 0) return {};
    const j = Math.max(0, Math.min(state.favorites.length - 1, idx + delta));
    if (j === idx) return {};
    const next = [...state.favorites];
    const [item] = next.splice(idx, 1);
    next.splice(j, 0, item);
    return { favorites: next };
  }),
  recallFavorite: (fav) => set({
    seed: fav.seed,
    // #305 — a kept recipe replays its stream offsets too.
    seedOffsets: normalizeSeedOffsets(fav.seedOffsets),
    ...(fav.config?.layout ? { layoutParams: { ...fav.config.layout } } : {}),
    ...(fav.config?.palette?.id ? { paletteId: fav.config.palette.id } : {}),
  }),
  morphToFavorite: (fav) => set((state) => {
    const target = fav.config?.layout;
    // #305 — old favorites carry no offsets → zeros, like a fresh project.
    const favOffsets = normalizeSeedOffsets(fav.seedOffsets);
    if (!target || typeof target !== 'object') {
      return {
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
        seed: fav.seed,
        seedOffsets: favOffsets,
        layoutParams: { ...state.layoutParams, ...target },
        ...(fav.config?.palette?.id ? { paletteId: fav.config.palette.id } : {}),
      };
    }
    return {
      // #107 §7: same one-entry-per-morph undo as triggerEvolve above.
      ...pushToUndo(state, true),
      layoutParams: { ...state.layoutParams, ...discrete },
      morphing: true,
      morphFrom: from,
      morphTo: to,
      morphStart: performance.now(),
      morphPendingSeed: fav.seed,
      morphPendingSeedOffsets: favOffsets,
      morphPendingPalette: fav.config?.palette.id || null,
    };
  }),
});
