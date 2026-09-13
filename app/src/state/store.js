// Zustand store — composed from focused slices
import { create } from 'zustand';
import { createAudioSlice } from './slices/audioSlice.js';
import { createLayoutSlice } from './slices/layoutSlice.js';
import { createGlobalSlice } from './slices/globalSlice.js';
import { createDavisSlice } from './slices/davisSlice.js';
import { createExportSlice } from './slices/exportSlice.js';

export const useStore = create((set, get) => ({
  ...createAudioSlice(set, get),
  ...createLayoutSlice(set, get),
  ...createGlobalSlice(set, get),
  ...createDavisSlice(set, get),
  ...createExportSlice(set, get),
}));
