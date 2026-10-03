// learnDeferred.mjs — #617 (Davis Phase 6 MIDI learn) DEFERRED STUB.
//
// What this is: the learn-as-mode (Ableton pattern) state skeleton — arm
// learn, click a control, wiggle a knob/pad. Pure functions only: no DOM, no
// store wiring, no live MIDI access. The control → target registry already
// exists (targets.mjs); this stub is the learn MODE that will sit on top of
// it. Every function is INERT.
//
// TO UN-DEFER, this must be verified by hand with a REAL MIDI CONTROLLER —
// it cannot be verified in CI, and it was NOT verified here:
//   1. A real controller (knob + pad) connected via Web MIDI (Chrome/Edge).
//   2. Learn mode maps a knob AND a pad end-to-end (arm → click control →
//      wiggle → bound, and the mapping fires the target).
//   3. Mappings survive reload (persisted in the project doc like every
//      other field — the sanitizer in map.mjs already handles that half).
//   4. Unplugging mid-set degrades honestly: no zombie mappings, holds
//      release (engine.mjs releaseHolds covers the engine half).
// Permission-denied and unplugged-device states already fail out loud via
// status.mjs; the learn UI just needs to surface them.
//
// Hardware needed: a real MIDI controller (any knob + pad) + Chrome/Edge.

import { bindKey } from './message.mjs';
import { getMidiTarget } from './targets.mjs';

/**
 * Fresh learn state. `armed` is the targetId waiting for a wiggle, or null.
 * @returns {{armed: string|null}}
 */
export function createLearnState() {
  return { armed: null };
}

/**
 * Arm learn mode for a target (the "click a control" half happens in the UI).
 * Unknown targets are refused — garbage never arms.
 * @returns {{armed: string|null}} new state (or the same state if refused)
 */
export function armLearn(state, targetId) {
  // DEFERRED (#617): the real build wires this to the learn UI — arm, click
  // a control, wiggle. The pure arm/disarm logic is real and tested; the UI
  // half waits on a controller for verification.
  if (!getMidiTarget(targetId)) return state;
  return { armed: targetId };
}

/** Disarm learn mode. @returns {{armed: null}} */
export function cancelLearn(_state) {
  return { armed: null };
}

/**
 * A MIDI message arrived while learn is armed: claim it and produce the
 * bind key for the armed target. The message is consumed — it must NOT also
 * fire an existing mapping (engine.mjs already honors the onMessage claim).
 * @returns {{claimed: boolean, key: string|null, targetId: string|null}}
 */
export function learnMessage(state, msg) {
  // DEFERRED (#617): end-to-end claim → bind → fire needs a real controller
  // to verify. The pure claim (one key per message, channel-specific) is
  // real and matches bindKey's contract in message.mjs.
  if (!state || !state.armed || !msg) return { claimed: false, key: null, targetId: null };
  const key = bindKey(msg);
  if (!key) return { claimed: false, key: null, targetId: null };
  return { claimed: true, key, targetId: state.armed };
}

/** @returns {boolean} is learn mode currently armed? */
export function isLearnArmed(state) {
  return !!(state && state.armed);
}
