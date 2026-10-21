// midiSlice — MIDI mappings + connection status (#617).
//
// `midiBanks` is project data (saved like every other field; see
// projectDocument): named sets of bindings (#1720), one active at a time.
// `midiMap` is the ACTIVE bank's map, mirrored on every edit so the engine,
// the monitor and the exporters keep reading the one field they already
// read. Every action below maintains that invariant in a single set().
// `midiStatus` is live session state: never saved. The engine (midi/engine.mjs,
// started by hooks/useMidi.js) writes the status; the learn UI writes the map.
// `midiLearn` is live session state too: which target is waiting for a wiggle.
import { sanitizeMidiMap, bindTarget, unbindTarget } from '../../midi/map.mjs';
import {
  DEFAULT_BANK_NAME, sanitizeMidiBanks, sanitizeMidiActiveBank, activeBankMap,
  addBank, removeBank, renameBank, withBankMap,
} from '../../midi/banks.mjs';
import { createLearnState, armLearn, cancelLearn } from '../../midi/learn.mjs';

/** The three fields, kept in step: banks, the active index, the active map. */
const syncBanks = (banks, active) => {
  const list = sanitizeMidiBanks(banks);
  const idx = sanitizeMidiActiveBank(active, list);
  return { midiBanks: list, midiActiveBank: idx, midiMap: activeBankMap(list, idx) };
};

/** Edit the active bank's map, keeping the mirror in step. */
const editActiveMap = (state, map) => syncBanks(
  withBankMap(state.midiBanks, state.midiActiveBank, sanitizeMidiMap(map)),
  state.midiActiveBank,
);

export const createMidiSlice = (set) => ({
  midiBanks: [{ name: DEFAULT_BANK_NAME, map: {} }],
  midiActiveBank: 0,
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

  setMidiMap: (map) => set((state) => editActiveMap(state, map)),
  bindMidi: (key, targetId) => set((state) => editActiveMap(state, bindTarget(state.midiMap || {}, key, targetId))),
  unbindMidi: (targetId) => set((state) => editActiveMap(state, unbindTarget(state.midiMap || {}, targetId))),

  /** Flip to a bank by index (the panel's bank chooser). Out-of-range is refused. */
  switchMidiBank: (index) => set((state) => (
    Number.isInteger(index) && index >= 0 && index < state.midiBanks.length
      ? syncBanks(state.midiBanks, index)
      : {}
  )),
  /** The BANK NEXT target: advance to the next bank, wrapping at the end. */
  cycleMidiBank: () => set((state) => syncBanks(
    state.midiBanks,
    (state.midiActiveBank + 1) % state.midiBanks.length,
  )),
  /** Append an empty bank and land on it, ready to learn into. Capped in banks.mjs. */
  addMidiBank: () => set((state) => {
    const next = addBank(state.midiBanks);
    return next === state.midiBanks ? {} : syncBanks(next, next.length - 1);
  }),
  /** Drop the active bank (never the last one); land on the previous bank. */
  removeMidiBank: () => set((state) => {
    const next = removeBank(state.midiBanks, state.midiActiveBank);
    return next === state.midiBanks
      ? {}
      : syncBanks(next, Math.min(state.midiActiveBank, next.length - 1));
  }),
  renameMidiBank: (name) => set((state) => {
    const next = renameBank(state.midiBanks, state.midiActiveBank, name);
    return next === state.midiBanks ? {} : syncBanks(next, state.midiActiveBank);
  }),

  setMidiEnabled: (on) => set({ midiEnabled: !!on }),
  setMidiStatus: (status) => set({ midiStatus: status }),
  setMidiLast: (msg) => set({ midiLast: msg }),

  armMidiLearn: (targetId) => set((state) => ({ midiLearn: armLearn(state.midiLearn, targetId), midiLearnRefused: null })),
  cancelMidiLearn: () => set((state) => (state.midiLearn?.armed || state.midiLearnRefused
    ? { midiLearn: cancelLearn(state.midiLearn), midiLearnRefused: null }
    : {})),
  /** The wiggle landed: bind it into the ACTIVE bank (moving any earlier binding of either side) and disarm. */
  completeMidiLearn: (key, targetId) => set((state) => ({
    ...editActiveMap(state, bindTarget(state.midiMap || {}, key, targetId)),
    midiLearn: cancelLearn(state.midiLearn),
    midiLearnRefused: null,
  })),
  setMidiLearnRefused: (refused) => set({ midiLearnRefused: refused }),
});
