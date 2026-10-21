// learn.mjs — #617 MIDI learn: the learn-as-mode (Ableton pattern). Pure.
//
// Arm a target, wiggle a knob or press a pad, and that message's key is bound
// to the target. No DOM, no store, no live MIDI access: the hook (useMidi.js)
// feeds messages in, the store (midiSlice.js) applies the result, the section
// (MidiSection.jsx) draws it. Transport-agnostic by construction — a message
// is a message whether Web MIDI or BLE-MIDI delivered it.
//
// What a message must be to count as the wiggle:
//   - a note-ON or a CC. A note-OFF is never a gesture; it is also never
//     claimed, so a pad held down before learn was armed still releases a
//     FREEZE hold when it comes up.
//   - bindable to the armed target (map.mjs canBind): a pad cannot drive a
//     knob target, so that attempt is refused loudly and learn stays armed.
//
// Hardware-verified: NOT YET. The end-to-end claim → bind → fire needs a real
// controller; see the #617 thread for the arrival-day checklist.

import { bindKey } from './message.mjs';
import { canBind } from './map.mjs';
import { getMidiTarget } from './targets.mjs';

const NONE = Object.freeze({ claimed: false, key: null, targetId: null, refused: null });

/** Fresh learn state. `armed` is the targetId waiting for a wiggle, or null. */
export function createLearnState() {
  return { armed: null };
}

/**
 * Arm learn for a target (the "click a control" half happens in the UI).
 * Unknown targets are refused — garbage never arms.
 * @returns {{armed: string|null}} new state (the same state if refused)
 */
export function armLearn(state, targetId) {
  if (!getMidiTarget(targetId)) return state;
  return { armed: targetId };
}

/** Disarm learn. @returns {{armed: null}} */
export function cancelLearn(_state) {
  return { armed: null };
}

/**
 * A MIDI message arrived. If learn is armed and the message is a gesture,
 * claim it: the engine must NOT also fire a mapping for it.
 * @returns {{claimed: boolean, key: string|null, targetId: string|null, refused: 'wrong-kind'|null}}
 *   claimed + key        → bind key to targetId, then disarm
 *   claimed + refused    → the gesture cannot drive this target; stay armed and say so
 *   not claimed          → hand the message to the engine as usual
 */
export function learnMessage(state, msg) {
  if (!state || !state.armed || !msg) return NONE;
  if (msg.type === 'noteoff') return NONE;
  const key = bindKey(msg);
  if (!key) return NONE;
  const target = getMidiTarget(state.armed);
  if (!target) return NONE;
  if (!canBind(key, target)) return { claimed: true, key: null, targetId: state.armed, refused: 'wrong-kind' };
  return { claimed: true, key, targetId: state.armed, refused: null };
}

/** @returns {boolean} is learn currently armed? */
export function isLearnArmed(state) {
  return !!(state && state.armed);
}

/** The one honest line the UI shows while armed (or after a refusal). */
export function learnPrompt(target, refused = null) {
  if (!target) return '';
  if (refused === 'wrong-kind') return `${target.label} needs a knob or fader — a pad can't drive it. Move a knob, or cancel.`;
  return target.kind === 'cc'
    ? `${target.label}: move a knob or fader…`
    : `${target.label}: press a pad or key…`;
}

/**
 * The engine's `onMessage` handler, store-agnostic so the same code the hook runs
 * is the code the selfcheck runs. `st` is the store state (midiLearn + the three
 * actions). Returns true when learn claimed the message — the engine then skips
 * mapping dispatch for it.
 */
export function routeLearnMessage(st, msg) {
  st.setMidiLast(msg);
  const r = learnMessage(st.midiLearn, msg);
  if (!r.claimed) return false;
  if (r.key) st.completeMidiLearn(r.key, r.targetId); else st.setMidiLearnRefused(r.refused);
  return true;
}
