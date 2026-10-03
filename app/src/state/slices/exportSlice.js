import { genId } from '../id.js';
import { INSTRUMENT_CANVAS, sanitizeCanvasSpec, CANVAS_PRESETS, readUserPresets, writeUserPresets } from '../../data/canvasPresets.js';

const MAX_SNAPSHOTS = 24;

export const createExportSlice = (set) => ({
  snapshots: [],
  exportResolution: 1,
  isRecording: false,
  isRendering: false,
  canvasW: INSTRUMENT_CANVAS.w,
  canvasH: INSTRUMENT_CANVAS.h,
  canvasFps: INSTRUMENT_CANVAS.fps,
  canvasPresetId: INSTRUMENT_CANVAS.id,
  canvasAspectLock: true,
  stageMode: 'preview',
  stageBlackout: false,
  syphonOn: false,
  syphonName: 'Kinetic Curator',
  userCanvasPresets: [],
  projectTitle: '', // #651 — optional title, used in export filenames

  setProjectTitle: (t) => set({ projectTitle: String(t ?? '').slice(0, 80) }),

  addSnapshot: (snap) => set((state) => ({
    snapshots: [...state.snapshots, { id: genId(), ...snap }].slice(-MAX_SNAPSHOTS),
  })),
  removeSnapshot: (id) => set((state) => ({
    snapshots: state.snapshots.filter((s) => s.id !== id),
  })),
  clearSnapshots: () => set({ snapshots: [] }),
  setExportResolution: (res) => set({ exportResolution: res }),
  setIsRecording: (recording) => set({ isRecording: recording }),
  setIsRendering: (rendering) => set({ isRendering: !!rendering }),
  setCanvasSize: (w, h, presetId = 'custom') => set(() => {
    const next = sanitizeCanvasSpec({ canvasW: w, canvasH: h, canvasPresetId: presetId });
    return { canvasW: next.canvasW, canvasH: next.canvasH, canvasPresetId: presetId };
  }),
  applyCanvasPreset: (id) => set((s) => {
    const p = CANVAS_PRESETS.find((x) => x.id === id) || s.userCanvasPresets.find((x) => x.id === id);
    if (!p) return {};
    return { canvasW: p.w, canvasH: p.h, canvasFps: p.fps, canvasPresetId: p.id };
  }),
  loadUserCanvasPresets: () => set({ userCanvasPresets: readUserPresets() }),
  saveCanvasPreset: (label) => set((s) => {
    const id = `mine-${Date.now()}`;
    const next = writeUserPresets([...s.userCanvasPresets, { id, label, w: s.canvasW, h: s.canvasH, fps: s.canvasFps }]);
    return { userCanvasPresets: next, canvasPresetId: id };
  }),
  deleteCanvasPreset: (id) => set((s) => ({
    userCanvasPresets: writeUserPresets(s.userCanvasPresets.filter((p) => p.id !== id)),
  })),
  renameCanvasPreset: (id, label) => set((s) => ({
    userCanvasPresets: writeUserPresets(s.userCanvasPresets.map((p) => p.id === id ? { ...p, label } : p)),
  })),
  setCanvasFps: (fps) => set({ canvasFps: sanitizeCanvasSpec({ canvasFps: fps }).canvasFps }),
  setCanvasAspectLock: (on) => set({ canvasAspectLock: !!on }),
  swapCanvasOrientation: () => set((s) => ({
    canvasW: s.canvasH, canvasH: s.canvasW, canvasPresetId: 'custom',
  })),
  setStageMode: (mode) => set({ stageMode: sanitizeCanvasSpec({ stageMode: mode }).stageMode }),
  setStageBlackout: (on) => set({ stageBlackout: !!on }),
  setSyphonOn: (on) => set({ syphonOn: !!on }),
  setSyphonName: (name) => set({ syphonName: String(name || 'Kinetic Curator').slice(0, 64) }),
});
