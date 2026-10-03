import { genId } from '../id.js';
import { INSTRUMENT_CANVAS, sanitizeCanvasSpec, CANVAS_PRESETS, readUserPresets, writeUserPresets, readCanvasSession, writeCanvasSession } from '../../data/canvasPresets.js';

const MAX_SNAPSHOTS = 24;

// #606 — a saved session restores the last-used canvas at boot; otherwise the instrument default.
const bootCanvas = readCanvasSession();

export const createExportSlice = (set, get) => ({
  snapshots: [],
  exportResolution: 1,
  isRecording: false,
  isRendering: false,
  canvasW: bootCanvas?.canvasW ?? INSTRUMENT_CANVAS.w,
  canvasH: bootCanvas?.canvasH ?? INSTRUMENT_CANVAS.h,
  canvasFps: bootCanvas?.canvasFps ?? INSTRUMENT_CANVAS.fps,
  canvasPresetId: bootCanvas?.canvasPresetId ?? INSTRUMENT_CANVAS.id,
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
  setCanvasSize: (w, h, presetId = 'custom') => {
    const next = sanitizeCanvasSpec({ canvasW: w, canvasH: h, canvasPresetId: presetId });
    set({ canvasW: next.canvasW, canvasH: next.canvasH, canvasPresetId: presetId });
    writeCanvasSession({ canvasW: next.canvasW, canvasH: next.canvasH, canvasFps: get().canvasFps, canvasPresetId: presetId });
  },
  applyCanvasPreset: (id) => {
    const p = CANVAS_PRESETS.find((x) => x.id === id) || get().userCanvasPresets.find((x) => x.id === id);
    if (!p) return;
    set({ canvasW: p.w, canvasH: p.h, canvasFps: p.fps, canvasPresetId: p.id });
    writeCanvasSession({ canvasW: p.w, canvasH: p.h, canvasFps: p.fps, canvasPresetId: p.id });
  },
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
  setCanvasFps: (fps) => {
    const next = sanitizeCanvasSpec({ canvasFps: fps }).canvasFps;
    set({ canvasFps: next });
    const s = get();
    writeCanvasSession({ canvasW: s.canvasW, canvasH: s.canvasH, canvasFps: next, canvasPresetId: s.canvasPresetId });
  },
  setCanvasAspectLock: (on) => set({ canvasAspectLock: !!on }),
  swapCanvasOrientation: () => {
    const s = get();
    set({ canvasW: s.canvasH, canvasH: s.canvasW, canvasPresetId: 'custom' });
    writeCanvasSession({ canvasW: s.canvasH, canvasH: s.canvasW, canvasFps: s.canvasFps, canvasPresetId: 'custom' });
  },
  setStageMode: (mode) => set({ stageMode: sanitizeCanvasSpec({ stageMode: mode }).stageMode }),
  setStageBlackout: (on) => set({ stageBlackout: !!on }),
  setSyphonOn: (on) => set({ syphonOn: !!on }),
  setSyphonName: (name) => set({ syphonName: String(name || 'Kinetic Curator').slice(0, 64) }),
});
