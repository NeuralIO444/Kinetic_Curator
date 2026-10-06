import { sanitizeAudioRoutes, editableRoutes } from '../../data/audioRoutes.js';
import { pushToUndo } from '../history.js';

export const createAudioSlice = (set) => ({
  audioEnabled: false,
  // #107 §5: set true when the browser denies mic access, so the UI can say
  // why audio silently isn't running instead of leaving it looking idle.
  audioDenied: false,
  // #1053: the chosen input went away (unplugged mid-run, or already gone when
  // AUDIO was switched on): { name } or null. Separate from audioDenied, which
  // is a refused permission. Session state, not part of the project document.
  audioLost: null,
  audioSource: { type: 'device', id: 'default' },
  // UX-7: the last loaded file, stashed when switching to a mic so the
  // source dropdown's File: option can bring it back. Session state, like
  // the file URL itself: not part of the project document.
  audioLastFile: null,
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

  // Switching AUDIO on is the one-tap reconnect, so it clears a lost notice.
  // Switching it off keeps one: that is how a loss shuts the graph down.
  setAudioEnabled: (enabled) => set(enabled ? { audioEnabled: true, audioLost: null } : { audioEnabled: false }),
  setAudioLost: (name) => set({ audioLost: name == null ? null : { name: String(name) } }),
  setAudioDenied: (denied) => set({ audioDenied: !!denied }),
  setAudioSource: (source) => set((state) => {
    const prev = state.audioSource;
    const stashed = state.audioLastFile;
    const revoke = (u) => { if (typeof u === 'string') { try { URL.revokeObjectURL(u); } catch { /* already revoked */ } } };
    // UX-7: the last loaded file stays re-selectable from the source
    // dropdown — stash the outgoing file instead of revoking its URL.
    // Blob URLs still can't accumulate: a newly picked file revokes the
    // stashed one, and only one file is ever stashed.
    let audioLastFile = stashed;
    if (source && source.type === 'file') {
      if (stashed && stashed.url !== source.url) revoke(stashed.url);
      if (prev && prev.type === 'file' && prev.url !== source.url) revoke(prev.url);
      audioLastFile = source;
    } else if (prev && prev.type === 'file') {
      audioLastFile = prev;
    }
    // A sidecar describes ONE file: a different source invalidates it.
    return { audioSource: source, audioLastFile, audioSidecar: null, audioSidecarNote: '', audioLost: null };
  }),
  /**
   * Replace the route table (sanitized; null = the default table). One undo step
   * per edit; `continuous` (a slider drag) coalesces ticks into one step.
   */
  setAudioRoutes: (routes, continuous = false) => set((state) => {
    const next = sanitizeAudioRoutes(routes);
    if (JSON.stringify(next) === JSON.stringify(state.audioRoutes ?? null)) return {};
    return { ...pushToUndo(state, !continuous), audioRoutes: next };
  }),
  /**
   * Edit the table with a pure function of the current one (#790 PR4): from the
   * default, `fn` receives a copy of it, so the first edit customises the table.
   */
  editAudioRoutes: (fn, continuous = false) => set((state) => {
    const next = sanitizeAudioRoutes(fn(editableRoutes(state.audioRoutes)));
    if (JSON.stringify(next) === JSON.stringify(state.audioRoutes ?? null)) return {};
    return { ...pushToUndo(state, !continuous), audioRoutes: next };
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
