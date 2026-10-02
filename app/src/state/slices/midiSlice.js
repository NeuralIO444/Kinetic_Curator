// midiSlice — MIDI mappings + connection status (#617).
//
// `midiMap` is project data (saved like every other field; see projectDocument).
// `midiStatus` is live session state: never saved. The engine (midi/engine.mjs,
// started by hooks/useMidi.js) writes the status; the learn UI (PR 2) writes the map.
import { sanitizeMidiMap, bindTarget, unbindTarget } from '../../midi/map.mjs';

export const createMidiSlice = (set) => ({
  midiMap: {},
  // off | connecting | ready | no-devices | denied | unsupported
  midiStatus: { state: 'off', inputs: [], error: '' },
  midiEnabled: false,
  /** The last message seen (for the monitor line), or null. */
  midiLast: null,

  setMidiMap: (map) => set({ midiMap: sanitizeMidiMap(map) }),
  bindMidi: (key, targetId) => set((state) => ({ midiMap: bindTarget(state.midiMap || {}, key, targetId) })),
  unbindMidi: (targetId) => set((state) => ({ midiMap: unbindTarget(state.midiMap || {}, targetId) })),
  setMidiEnabled: (on) => set({ midiEnabled: !!on }),
  setMidiStatus: (status) => set({ midiStatus: status }),
  setMidiLast: (msg) => set({ midiLast: msg }),
});
