// whisperTriggers — when the lines may speak (#1139).
//
// Transitions only: input loss (fired from the audio path), audio acquired,
// beat-lock (two confident attacks), high energy, first beat. Each line's
// budget lives in whisper.js — a fired line never refires, so these checks
// are cheap and idempotent.
//
// Rule 10: no identifiers here beyond the module's own.
import { say } from './whisper.js';
import { createBeatTracker } from './beatConfidence.mjs';
import { audioEnergyNow } from './keepContext.js';

let started = false;

/**
 * Wire transition triggers to the store. Call once (from App).
 * getState/subscribe are injected so this module stays framework-free.
 */
export function initWhisperTriggers(getState, subscribe) {
  if (started) return;
  started = true;

  const tracker = createBeatTracker();
  let wasEnabled = false;
  let foundArmed = false;
  let danced = false;
  let lastBeat = 0;

  const check = (s) => {
    const enabled = !!s.audioEnabled;

    // acquisition: enabled flips on → arm; first live energy → "there you are."
    if (enabled && !wasEnabled) foundArmed = true;
    if (!enabled) foundArmed = false;
    wasEnabled = enabled;

    if (!enabled) {
      lastBeat = 0;
      return;
    }

    const energy = audioEnergyNow(); // null when silent or meter unavailable
    if (foundArmed && energy != null && energy > 0.05) {
      foundArmed = false;
      say('FOUND');
    }
    if (energy != null && energy >= 0.75) say('RAW');

    const beat = typeof s.beatPulse === 'number' ? s.beatPulse : 0;
    tracker.push(beat);
    if (tracker.confident) say('HEAR');

    // first beat collision of the session → "dance."
    if (!danced && lastBeat <= 0.3 && beat > 0.3) {
      danced = true;
      say('DANCE');
    }
    lastBeat = beat;
  };

  check(getState());
  subscribe(check);
}
