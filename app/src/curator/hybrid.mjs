// curator/hybrid.mjs — HYBRID, the digital pole: her moves, her colour, her two pattern modes (Persona Kernel P5, #2385).
//
// HYBRID is GREIMAN's doctrine (callsign only on a surface; never the real name). A doctrine is a NAMED CALLER PROFILE
// inside the Director's treatment call — never a seat, never a room-matrix axis (D2, R3). Scope is typography and
// layout of the type and stage (R7): nothing here touches a creature or a beast.
//
// What she plays (spec §4, Q13):
//   1 BITMAP  type set in baked coarse-pixel glyph variants      (the bake pack, scripts/gen-bitmap.mjs)
//   2 PLANES  type in translucent depth layers                    (stamp alpha, poets/rayGunForm.js)
//   3 SPECTRUM a gradient colour across a word, inside the palette (a stamp's `spec`, engine/buildPlacements.js)
//   4 FLOAT   today's `greiman` mode — diagonal step, snap, echo — kept as is (the performer's tap names no move)
// A doctrine call names ONE of the four, drawn off the record's own seed (no extra draw from the store, so every other
// doctrine's stream is exactly what it was).
//
// What she owns: PATTERN GLYPH and PATTERN TIDES (a standing HYBRID makes the patterns a roll deals GLYPH or TIDES —
// TIDES is hand-picked only otherwise, #1797), and COLOUR — the fifth principle owner beside rhythm, contrast, negative
// space and hierarchy. The palette gravity that used to be the Queen's M3 lives here (Q14): same numbers, same caps.
// User palette locks always win over her.
//
// Pure: no store, no bus, no clock, no die. The caller hands in what it measured; this names.
import { personaTuning, TUNING_DEFAULTS } from '../personas/tuning.mjs';

/** Her id in the persona registry. */
export const HYBRID_ID = 'greiman';

// ─── the four moves ─────────────────────────────────────────────────────────
/** In draw order: the float first (today's mode, no axis), then the three she adds. */
export const HYBRID_MOVES = Object.freeze(['float', 'bitmap', 'planes', 'spectrum']);
const MOVES_SALT = 0x4859424d; // 'HYBM'

/** The move a doctrine call at `seed` plays: one of HYBRID_MOVES. A pure function of the record's own seed. */
export function hybridMove(seed) {
  const s = Number.isInteger(seed) && seed >= 0 ? seed >>> 0 : 0;
  // a hash finalizer, not the engine's xorshift: a xorshift stream's FIRST output barely moves across nearby seeds
  let h = (s ^ MOVES_SALT) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  const u = h / 0x100000000;
  return HYBRID_MOVES[Math.min(HYBRID_MOVES.length - 1, Math.floor(u * HYBRID_MOVES.length))];
}

/**
 * The record axes a HYBRID call at `seed` names — `{ bitmap: 1 }`, `{ planes: 1 }`, `{ spectrum: 1 }`, or `{}` for the
 * float. Named in the record, never ambient: an older record and every performer's tap names none.
 */
export function hybridAxes(seed) {
  const m = hybridMove(seed);
  return m === 'float' ? {} : { [m]: 1 };
}

/**
 * Which move a standing treatment record is playing, read off the record (the stage's own measure): the three signals
 * the horn strip shows for HYBRID. Null when the record is not HYBRID's (not mode 'greiman').
 *   bake      the type is set in the baked bitmap pack
 *   layers    the type sits in translucent planes
 *   spectrum  a gradient runs across the words
 */
export function hybridSignals(raygun) {
  if (!raygun || typeof raygun !== 'object' || raygun.mode !== 'greiman') return null;
  return Object.freeze({
    bake: raygun.bitmap === 1,
    layers: raygun.planes === 1,
    spectrum: raygun.spectrum === 1,
  });
}

// ─── the two pattern modes she owns ─────────────────────────────────────────
/** PATTERN modes HYBRID owns (pattern/glyph.js, pattern/tides.js). */
export const HYBRID_PATTERN_MODES = Object.freeze(['GLYPH', 'TIDES']);

/** The pattern mode a standing HYBRID deals for a unit draw (0 ≤ draw < 1). Unknown draw clamps. */
export function hybridPatternMode(draw) {
  const d = Number.isFinite(draw) ? Math.min(Math.max(draw, 0), 0.9999999999) : 0;
  return HYBRID_PATTERN_MODES[Math.floor(d * HYBRID_PATTERN_MODES.length)];
}

// ─── colour: palette gravity (the Queen's M3, moved — Q14) ──────────────────
// The numbers are the table's: personas.greiman.knobs.gravity.drift (+0.10 mix). The exported constant is the SHIPPED
// value; the mechanics read the table in force so a DEV-mode edit moves the live value.
export const GRAVITY_DRIFT = TUNING_DEFAULTS.personas.greiman.knobs.gravity.drift;
const gk = () => personaTuning().personas.greiman.knobs.gravity;
const minKeeps = () => personaTuning().personas.queen.knobs.minKeeps;

/**
 * Most-kept palette id (mode; first max wins ties — deterministic). Null when no keep names a palette.
 * (Moved verbatim from the Queen's M3.)
 */
export function keptPaletteId(keeps) {
  const counts = new Map();
  for (const k of keeps || []) {
    const id = k && k.config && k.config.palette && k.config.palette.id;
    if (typeof id === 'string' && id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [id, c] of counts) {
    if (c > bestN) {
      best = id;
      bestN = c;
    }
  }
  return best;
}

/**
 * Palette drift target at beat confidence: mix toward the kept palette at up to GRAVITY_DRIFT. Null when not confident
 * or no kept palette — no drift. The consumer caps the hold at its own beat interval and relaxes it over a phrase; the
 * weight here is the only number this module owns. (Moved verbatim from the Queen's M3.)
 */
export function paletteDriftTarget(keeps, beatConfident) {
  if (!beatConfident) return null;
  const id = keptPaletteId(keeps);
  return id ? { paletteId: id, weight: gk().drift } : null;
}

/** True when the artist has locked any swatch: a lock is the artist's word on the palette, and it wins. */
export const anyPaletteLock = (paletteLocks) =>
  !!paletteLocks && typeof paletteLocks === 'object' && Object.values(paletteLocks).some(Boolean);

/**
 * Beat confidence, as it has always been judged: the last two recorded attack peaks both clear the bar (the table's
 * queen.knobs.beatConfidence, 0.62 — a timing threshold, read here, never imported from her module: HYBRID's colour
 * move is not the Queen's hidden pull, and the deniability law keeps those modules' importers to a short list).
 */
export function beatConfident(peaks) {
  if (!Array.isArray(peaks) || peaks.length < 2) return false;
  const [a, b] = peaks.slice(-2);
  const bar = personaTuning().personas.queen.knobs.beatConfidence;
  return a >= bar && b >= bar;
}

/**
 * Her palette gravity for one evaluation, or null for "no pull". The gates the pull always ran behind — below the
 * minimum keeps nothing; no confident beat (two attack peaks at the beat-confidence bar), nothing — plus the law the
 * move to HYBRID states outright: a user palette lock always wins.
 * @param keeps   the counted keeps
 * @param signals { attackPeaks }
 * @param locks   the artist's palette locks (store.paletteLocks)
 */
export function paletteGravity(keeps, signals, locks = null) {
  const list = Array.isArray(keeps) ? keeps : [];
  if (list.length < minKeeps()) return null;
  if (anyPaletteLock(locks)) return null;
  const s = signals || {};
  return paletteDriftTarget(list, beatConfident(s.attackPeaks));
}
