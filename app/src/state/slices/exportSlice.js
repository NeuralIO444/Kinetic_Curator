import { genId } from '../id.js';

// Each record now carries a jpeg thumbnail; cap history so it stays bounded
// rather than growing for the life of the session.
const MAX_SNAPSHOTS = 24;

export const createExportSlice = (set) => ({
  snapshots: [],
  exportResolution: 1,
  isRecording: false,

  addSnapshot: (snap) => set((state) => ({
    snapshots: [...state.snapshots, { id: genId(), ...snap }].slice(-MAX_SNAPSHOTS),
  })),
  removeSnapshot: (id) => set((state) => ({
    snapshots: state.snapshots.filter((s) => s.id !== id),
  })),
  clearSnapshots: () => set({ snapshots: [] }),
  setExportResolution: (res) => set({ exportResolution: res }),
  setIsRecording: (recording) => set({ isRecording: recording }),
});
