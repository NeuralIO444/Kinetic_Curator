// midiSlice — MIDI mappings + connection status (#617).
//
// `midiMap` is project data (saved like every other field; see projectDocument).
// `midiStatus` is live session state: never saved. The engine (midi/engine.mjs,
// started by hooks/useMidi.js) writes the status; the learn UI writes the map.
// `midiLearn` is live session state too: which target is waiting for a wiggle.
import { sanitizeMidiMap, bindTarget, unbindTarget } from '../../midi/map.mjs';
import { createLearnState, armLearn, cancelLearn } from '../../midi/learn.mjs';

export const createMidiSlice = (set) => ({
  midiMap: {},
  // off | connecting | ready | no-devices | denied | unsupported
  midiStatus: { state: 'off', inputs: [], error: '' },
  midiEnabled: false,
  /** The last message seen (for the monitor line), or null. */
  midiLast: null,
  /** Learn mode (midi/learn.mjs): `armed` is the targetId waiting for a gesture, or null. Never saved. */
  midiLearn: createLearnState(),
  /** A refused gesture (a pad aimed at a knob target), said in words until the next arm/cancel/bind. */
  midiLearnRefused: null,

  setMidiMap: (map) => set({ midiMap: sanitizeMidiMap(map) }),
  bindMidi: (key, targetId) => set((state) => ({ midiMap: bindTarget(state.midiMap || {}, key, targetId) })),
  unbindMidi: (targetId) => set((state) => ({ midiMap: unbindTarget(state.midiMap || {}, targetId) })),
  setMidiEnabled: (on) => set({ midiEnabled: !!on }),
  setMidiStatus: (status) => set({ midiStatus: status }),
  setMidiLast: (msg) => set({ midiLast: msg }),

  armMidiLearn: (targetId) => set((state) => ({ midiLearn: armLearn(state.midiLearn, targetId), midiLearnRefused: null })),
  cancelMidiLearn: () => set((state) => (state.midiLearn?.armed || state.midiLearnRefused
    ? { midiLearn: cancelLearn(state.midiLearn), midiLearnRefused: null }
    : {})),
  /** The wiggle landed: bind it (moving any earlier binding of either side) and disarm. */
  completeMidiLearn: (key, targetId) => set((state) => ({
    midiMap: bindTarget(state.midiMap || {}, key, targetId),
    midiLearn: cancelLearn(state.midiLearn),
    midiLearnRefused: null,
  })),
  setMidiLearnRefused: (refused) => set({ midiLearnRefused: refused }),
});
