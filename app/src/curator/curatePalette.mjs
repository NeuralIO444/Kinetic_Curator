// curatePalette.mjs — which palette a CURATOR press should land on (#1365).
//
// Before: every press forced the global palette to the active persona's one
// catalog palette, so a refine press threw away the palette the artist was
// settling and landed on the same preset every time.
//
// Now, decided in #1365 ("refine never jumps the palette"):
//   - REFINE  keeps the current palette. Always. No switch, no undo entry.
//   - EXPLORE / no phase  the persona brings its palette ONLY while the artist has not picked or edited one
//                         (Matt, 2026-10-12, #1365 Q1). After that CURATOR leaves the artist's palette alone.
//   - "off" (no profile)  never touches the palette.
//   - FAMILIES (#1365 Q3): a persona has three palettes (data/palettes.js); explore deals ONE per seed, on the
//     colour stream, so re-rolling the seed or the colour offset can bring a different cousin.
// Refine's gentle colour variation is a separate #1365 slice.
//
// Pure: no store, no clock, no randomness. The caller reads the phase BEFORE
// it emits the roll, so the press is judged by the phase it was made in.
import { PHASE_REFINE } from './phase.js';
import { paletteFamily } from '../data/palettes.js';
import { hashU32 } from '../engine/kernel/rng.js';

/**
 * @param {{ phase: string|null, profile: { paletteId?: string }|null|undefined, paletteId: string|null|undefined,
 *   artistChose?: boolean }} p  artistChose: the store's `paletteChosen` (the artist picked or edited the palette)
 * @returns {string|null} the palette id to switch to, or null to leave the palette alone.
 */
export function curatePaletteTarget({
  phase,
  profile,
  paletteId,
  artistChose = false,
  seed = null,
  seedOffsets = null,
}) {
  if (!profile || typeof profile.paletteId !== 'string' || !profile.paletteId) return null;
  if (phase === PHASE_REFINE) return null;
  if (artistChose) return null; // #1365 Q1: the artist's palette is theirs, in explore too
  const target = familyPick(profile.paletteId, seed, seedOffsets);
  if (paletteId === target) return null; // already there: don't wipe swatch overrides or stack undo
  return target;
}

/** #1365 Q3 — the family member a seed deals (the persona's own palette when there is no seed). */
export function familyPick(paletteId, seed, seedOffsets = null) {
  const fam = paletteFamily(paletteId);
  if (fam.length <= 1 || !Number.isFinite(seed)) return fam[0] ?? paletteId;
  return fam[hashU32(seed >>> 0, 'paletteFamily', 0, seedOffsets) % fam.length];
}
