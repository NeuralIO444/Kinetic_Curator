export const createExportSlice = (set) => ({
  snapshots: [],
  exportResolution: 1,
  isRecording: false,

  addSnapshot: (snap) => set((state) => ({ snapshots: [...state.snapshots, snap] })),
  removeSnapshot: (index) => set((state) => ({
    snapshots: state.snapshots.filter((_, i) => i !== index),
  })),
  clearSnapshots: () => set({ snapshots: [] }),
  setExportResolution: (res) => set({ exportResolution: res }),
  setIsRecording: (recording) => set({ isRecording: recording }),
});
