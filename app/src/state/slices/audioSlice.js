import { sanitizeAudioRoutes } from '../../data/audioRoutes.js';
import { pushToUndo } from '../history.js';

export const createAudioSlice = (set) => ({
  audioEnabled: false,
  // #107 §5: set true when the browser denies mic access, so the UI can say
  // why audio silently isn't running instead of leaving it looking idle.
  audioDenied: false,
  audioSource: { type: 'device', id: 'default' },
  audioGain: 1.0,
  audioMonitor: false,
  audioBands: { bass: 0, mid: 0, treble: 0, rms: 0 },
  beatPulse: 0,
  audioStimulus: 0,
  // #618 — a kc-audio-envelope/1 sidecar for the FILE source: { name, env } when
  // one is loaded and valid, else null. `audioSidecarNote` says why a pick was
  // refused (shown honestly in SOURCE). Session state, like the file URL itself:
  // not part of the project document.
  // #790 — the scene's audio route table: null = today's default routes.
  // Scene-level (saved in the project, undoable), never carried by voices.
  audioRoutes: null,
  audioSidecar: null,
  audioSidecarNote: '',

  setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),
  setAudioDenied: (denied) => set({ audioDenied: !!denied }),
  setAudioSource: (source) => set((state) => {
    // Blob URLs from file picks accumulate if never revoked. The previous
    // source's element is torn down right after this update, so revoking
    // here is safe — nothing will need the old URL again.
    const prev = state.audioSource;
    if (prev && prev.type === 'file' && typeof prev.url === 'string' && prev.url !== source?.url) {
      try { URL.revokeObjectURL(prev.url); } catch { /* already revoked */ }
    }
    // A sidecar describes ONE file: a different source invalidates it.
    return { audioSource: source, audioSidecar: null, audioSidecarNote: '' };
  }),
  /** Replace the route table (sanitized; null = the default table). One undo step per edit. */
  setAudioRoutes: (routes) => set((state) => {
    const next = sanitizeAudioRoutes(routes);
    if (JSON.stringify(next) === JSON.stringify(state.audioRoutes ?? null)) return {};
    return { ...pushToUndo(state, true), audioRoutes: next };
  }),
  setAudioSidecar: (sidecar, note = '') => set({ audioSidecar: sidecar || null, audioSidecarNote: sidecar ? '' : String(note || '') }),
  setAudioGain: (gain) => set({ audioGain: gain }),
  setAudioMonitor: (monitor) => set({ audioMonitor: monitor }),
  setAudioBands: (bands) => set({ audioBands: bands }),
  setAudioStimulus: (stim) => set({ audioStimulus: stim }),
  setBeatPulse: (valOrFn) => set((state) => ({
    beatPulse: typeof valOrFn === 'function' ? valOrFn(state.beatPulse) : valOrFn,
  })),
});
