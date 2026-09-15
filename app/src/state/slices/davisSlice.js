import { createGrid, stepGrid } from '../../engine/ca-engine.js';
import { generateLayoutTargets, MORPHABLE_KEYS, PALETTE_IDS } from '../paramUtils.js';
import { genId } from '../id.js';

export const createDavisSlice = (set) => ({
  evolveMode: false,
  evolveSource: 'time',
  evolveTarget: 'seed',
  evolveInterval: 2000,
  autoSnapshot: false,
  lastEvolveTs: 0,
  favorites: [],

  morphEvolve: true,
  morphDurationMs: 1200,
  morphing: false,
  morphFrom: null,
  morphTo: null,
  morphStart: 0,

  phraseEnabled: false,
  phraseLength: 8,
  phraseMode: 'reset-seed',
  phraseBeat: 0,
  phraseOriginSeed: null,

  setEvolveMode: (valOrFn) => set((state) => ({
    evolveMode: typeof valOrFn === 'function' ? valOrFn(state.evolveMode) : valOrFn,
  })),
  setEvolveSource: (source) => set({ evolveSource: source }),
  setEvolveTarget: (target) => set({ evolveTarget: target }),
  setEvolveInterval: (interval) => set({ evolveInterval: interval }),
  setAutoSnapshot: (auto) => set({ autoSnapshot: auto }),

  setMorphEvolve: (v) => set({ morphEvolve: !!v }),
  setMorphDurationMs: (ms) => set({
    morphDurationMs: Math.max(200, Math.min(8000, Number(ms) || 1200)),
  }),
  finishMorph: () => set({ morphing: false, morphFrom: null, morphTo: null }),

  setPhraseEnabled: (enabled) => set({ phraseEnabled: !!enabled, phraseBeat: 0 }),
  setPhraseLength: (len) => set({
    phraseLength: Math.max(2, Math.min(64, Number(len) || 8)),
    phraseBeat: 0,
  }),
  setPhraseMode: (mode) => set({ phraseMode: mode }),
  armPhrase: (seed) => set({ phraseOriginSeed: seed, phraseBeat: 0 }),
  resetPhrase: () => set((state) => ({
    phraseBeat: 0,
    seed: state.phraseOriginSeed != null ? state.phraseOriginSeed : state.seed,
  })),

  tickPhraseBeat: () => set((state) => {
    if (!state.phraseEnabled) return {};
    const nextBeat = state.phraseBeat + 1;
    if (nextBeat < state.phraseLength) {
      return { phraseBeat: nextBeat };
    }
    const origin = state.phraseOriginSeed != null ? state.phraseOriginSeed : state.seed;
    const updates = { phraseBeat: 0 };
    if (state.phraseMode === 'reset-seed') {
      updates.seed = origin;
    } else if (state.phraseMode === 'cycle-seed') {
      updates.seed = (origin + 1) >>> 0;
      updates.phraseOriginSeed = updates.seed;
    } else if (state.phraseMode === 'step-ca') {
      updates.caGrid = state.caGrid ? stepGrid(state.caGrid) : createGrid(40, 28);
      updates.seed = origin;
    }
    return updates;
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
          ...caUpdate,
          ...seedUpdate,
          ...paletteUpdate,
          morphing: true,
          morphFrom: from,
          morphTo: to,
          morphStart: performance.now(),
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
  recallFavorite: (fav) => set({
    seed: fav.seed,
    ...(fav.config?.layout ? { layoutParams: fav.config.layout } : {}),
    ...(fav.config?.palette?.id ? { paletteId: fav.config.palette.id } : {}),
  }),
});
