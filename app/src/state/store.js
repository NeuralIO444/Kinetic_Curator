// Zustand store — composed from focused slices
import { create } from 'zustand';
import { createAudioSlice } from './slices/audioSlice.js';
import { createLayoutSlice } from './slices/layoutSlice.js';
import { createGlobalSlice } from './slices/globalSlice.js';
import { createDavisSlice } from './slices/davisSlice.js';
import { createExportSlice } from './slices/exportSlice.js';
import { createLayersSlice } from './slices/layersSlice.js';
import { createPaletteLibrarySlice } from './slices/paletteLibrarySlice.js';
import { createVoiceSlice } from './slices/voiceSlice.js';
import { createMidiSlice } from './slices/midiSlice.js';

export const useStore = create((set, get) => ({
  ...createAudioSlice(set, get),
  ...createLayoutSlice(set, get),
  ...createGlobalSlice(set, get),
  ...createDavisSlice(set, get),
  ...createExportSlice(set, get),
  ...createLayersSlice(set, get),
  ...createPaletteLibrarySlice(set, get),
  ...createVoiceSlice(set, get),
  ...createMidiSlice(set, get),
}));

// Test hook (#964): e2e sets `window.__KC_EXPOSE_STORE = true` in an init
// script so Playwright can read roll-scope and roll state through
// `window.__kcStore.getState()`. Same shape as `window.__KC_GOVERNOR_OFF` —
// inert in production, never read by the app itself.
if (typeof window !== 'undefined' && window.__KC_EXPOSE_STORE === true) {
  window.__kcStore = useStore;
}
