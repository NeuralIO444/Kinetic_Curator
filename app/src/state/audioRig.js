// audioRig.js — the performer's audio setup is not part of a picture. A kept hit saves the whole layout, including the
// audio feel (depth, scale, alpha, attack, decay, response, swell, life) and the spectrum marks. Coming back to a hit
// (recall, a queue jump, a morph) used to write that saved setup over the live one, so a hit kept before the feel was
// dialled in silenced the music. These keys now stay as they are LIVE when a saved layout is restored. Matt, 2026-10-14:
// "always live" — an old hit reacts to the audio you have on now. The hit still carries its feel in the file.
import { FEEL_KEYS } from '../data/feels.js';

/** The #1482 spectrum marks (STIMULI -> SPECTRUM): which frequency a mark listens to, and what it does about it. */
export const SPECTRUM_KEYS = Object.freeze(['spectrumMap', 'spectrumScale', 'spectrumDisplace', 'spectrumColour']);
/** Every layout key that is the audio setup, not the picture. */
export const AUDIO_RIG_KEYS = Object.freeze([...FEEL_KEYS, ...SPECTRUM_KEYS]);

/**
 * A saved layout with the audio setup taken from the live one. Pure: neither argument is mutated. A rig key the live
 * layout does not have is dropped from the result, so the default applies rather than the old hit's value.
 */
export function withLiveRig(saved, live) {
  if (!saved || typeof saved !== 'object') return saved;
  const out = { ...saved };
  const l = live && typeof live === 'object' ? live : {};
  for (const k of AUDIO_RIG_KEYS) {
    if (l[k] !== undefined) out[k] = l[k];
    else delete out[k];
  }
  return out;
}
