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
    return { audioSource: source };
  }),
  setAudioGain: (gain) => set({ audioGain: gain }),
  setAudioMonitor: (monitor) => set({ audioMonitor: monitor }),
  setAudioBands: (bands) => set({ audioBands: bands }),
  setAudioStimulus: (stim) => set({ audioStimulus: stim }),
  setBeatPulse: (valOrFn) => set((state) => ({
    beatPulse: typeof valOrFn === 'function' ? valOrFn(state.beatPulse) : valOrFn,
  })),
});
