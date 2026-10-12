// curatePalette.mjs — which palette a CURATOR press should land on (#1365).
//
// Before: every press forced the global palette to the active persona's one
// catalog palette, so a refine press threw away the palette the artist was
// settling and landed on the same preset every time.
//
// Now, decided in #1365 ("refine never jumps the palette"):
//   - REFINE  keeps the current palette. Always. No switch, no undo entry.
//   - EXPLORE / no phase  yesterday's behaviour: the persona brings its palette.
//   - "off" (no profile)  never touches the palette.
// The open questions on #1365 (explore wiping a chosen palette, how far refine
// may vary colour, palette families) are Matt's and are NOT decided here.
//
// Pure: no store, no clock, no randomness. The caller reads the phase BEFORE
// it emits the roll, so the press is judged by the phase it was made in.
import { PHASE_REFINE } from './phase.js';

/**
 * @param {{ phase: string|null, profile: { paletteId?: string }|null|undefined, paletteId: string|null|undefined }} p
 * @returns {string|null} the palette id to switch to, or null to leave the palette alone.
 */
export function curatePaletteTarget({ phase, profile, paletteId }) {
  if (!profile || typeof profile.paletteId !== 'string' || !profile.paletteId) return null;
  if (phase === PHASE_REFINE) return null;
  if (paletteId === profile.paletteId) return null; // already there: don't wipe swatch overrides or stack undo
  return profile.paletteId;
}
