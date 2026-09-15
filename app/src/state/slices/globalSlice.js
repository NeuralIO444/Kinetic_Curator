import { ASSETS } from '../../data/assets/index.js';
import { getQualityCaps } from '../../data/quality.js';

const initialEnabledAssets = {};
ASSETS.forEach((a) => { initialEnabledAssets[a.id] = true; });

export const createGlobalSlice = (set) => ({
  running: true,
  fps: 60,
  nodeCount: 0,
  quality: 'balanced',
  autoQuality: true,
  isFullscreen: false,
  slowRender: false,
  webcamEnabled: false,
  motionEnergy: 0,

  enabledAssets: initialEnabledAssets,
  search: '',
  catFilter: 'all',
  poolView: 'grid',

  setRunning: (running) => set({ running }),
  setFps: (fps) => set({ fps }),
  setNodeCount: (count) => set({ nodeCount: count }),
  setQuality: (quality) => set((state) => {
    const caps = getQualityCaps(quality);
    const next = { quality };
    if (!caps.allowMirror && state.layoutParams.mirror) {
      next.layoutParams = { ...state.layoutParams, mirror: false };
    }
    return next;
  }),
  setAutoQuality: (auto) => set({ autoQuality: !!auto }),
  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
  setSlowRender: (slow) => set({ slowRender: slow }),
  setWebcamEnabled: (enabled) => set({ webcamEnabled: enabled }),
  setMotionEnergy: (energy) => set({ motionEnergy: energy }),

  toggleAsset: (id) => set((state) => ({
    enabledAssets: { ...state.enabledAssets, [id]: !state.enabledAssets[id] },
  })),
  soloAsset: (id) => set(() => {
    const next = {};
    ASSETS.forEach((a) => { next[a.id] = a.id === id; });
    return { enabledAssets: next };
  }),
  toggleAllAssets: (enabled) => set((state) => {
    const next = { ...state.enabledAssets };
    ASSETS.forEach((a) => {
      if (state.catFilter === 'all' || a.category === state.catFilter) next[a.id] = enabled;
    });
    return { enabledAssets: next };
  }),
  setSearch: (search) => set({ search }),
  setCatFilter: (filter) => set({ catFilter: filter }),
  setPoolView: (view) => set({ poolView: view }),
});
