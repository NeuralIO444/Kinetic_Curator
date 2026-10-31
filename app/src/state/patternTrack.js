// patternTrack.js — the PATTERN track's stored shape (#1097).
//
// A PATTERN track is a layer of `type: 'pattern'`: a third family beside 'fx' and
// 'math', in the content group of the stack (it composites like content, rides the
// FX fold and the MATH grade above it). It is NOT a KC track: it never owns BUILD's
// sliders, the seed or a snapshot. Its parameters live ON the layer, in `layer.pattern`.
//
//   { mode: 'QUILT'|'GLYPH'|'FIELD'|'TIDES'|'REWRITE', seed: uint32, density, mix, grout, hero, drift, drop }
//
// Fractions, not percents (the engine's units). SEED is a stored integer; SHUFFLE writes
// a new one. Pure: no store, no DOM. `sanitizePattern` is the one gate: the slice, the
// project loader and an imported file all go through it, and it never throws.

import {
  QUILT_DEFAULT_DENSITY,
  QUILT_DEFAULT_MIX,
  QUILT_DEFAULT_GROUT,
  QUILT_MAX_GROUT,
  QUILT_DEFAULT_HERO,
  GLYPH_DEFAULT_DENSITY,
  GLYPH_DEFAULT_MIX,
  FIELD_DEFAULT_DENSITY,
} from '../pattern/engine.js';
import { TIDES_DEFAULT_DENSITY, TIDES_DEFAULT_MIX } from '../pattern/tides.js';
import { REWRITE_DEFAULT_DENSITY, REWRITE_DEFAULT_MIX } from '../pattern/rewrite.js';

export const PATTERN_MODES = Object.freeze(['QUILT', 'GLYPH', 'FIELD', 'TIDES', 'REWRITE']);
/**
 * The modes KIN and CURATOR deal from (patternRoll). TIDES (#1797) is picked by hand only for now: it is parked
 * library work, and leaving it out of the deal keeps every existing seeded deal (and replay) dealing what it always did.
 * REWRITE (#1823) is hand-picked only for the same reason.
 */
export const PATTERN_DEAL_MODES = Object.freeze(['QUILT', 'GLYPH', 'FIELD']);
/** Modes with no separate elements to move: one continuous field (FIELD), a fixed display of one (TIDES), or a grid that grows as one picture (REWRITE). */
export const PATTERN_FIELD_LIKE = Object.freeze(['FIELD', 'TIDES', 'REWRITE']);
/**
 * #1137 — which KINEME motion the pattern's individual elements carry while DRIFT is above 0. OFF is every track that
 * predates the field (and today's picture, exactly); MIX gives each moving element its own, from a seeded pick. Only a
 * share of the elements move (`movers`): a composition with moving accents, never a wallpaper that all turns at once.
 */
export const PATTERN_KINS = Object.freeze(['OFF', 'MIX', 'SPIN', 'ROCK', 'PULSE', 'BLINK', 'BOB']);
export const PATTERN_MOVERS_DEFAULT = 0.3;
export const PATTERN_DENSITY_MIN = 4;
export const PATTERN_DENSITY_MAX = 12;

/** The density each mode opens on (docs/PATTERN_SPEC.md, Parameters). */
export const PATTERN_DEFAULT_DENSITY = Object.freeze({
  QUILT: QUILT_DEFAULT_DENSITY,
  GLYPH: GLYPH_DEFAULT_DENSITY,
  FIELD: FIELD_DEFAULT_DENSITY,
  TIDES: TIDES_DEFAULT_DENSITY,
  REWRITE: REWRITE_DEFAULT_DENSITY,
});

const MIX_DEFAULT = Object.freeze({
  QUILT: QUILT_DEFAULT_MIX,
  GLYPH: GLYPH_DEFAULT_MIX,
  FIELD: QUILT_DEFAULT_MIX,
  TIDES: TIDES_DEFAULT_MIX,
  REWRITE: REWRITE_DEFAULT_MIX,
});

const num = (v, lo, hi, fallback) => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** A fresh pattern block. The seed is a stored integer, given by the caller. */
export function defaultPattern(mode = 'QUILT', seed = 1) {
  const m = PATTERN_MODES.includes(mode) ? mode : mode === 'READOUT' ? 'TIDES' : 'QUILT';
  return {
    mode: m,
    seed: seed >>> 0,
    density: PATTERN_DEFAULT_DENSITY[m],
    mix: MIX_DEFAULT[m],
    grout: QUILT_DEFAULT_GROUT,
    hero: QUILT_DEFAULT_HERO,
    drift: 0,
    drop: false,
    kin: 'MIX', // a NEW track has moving accents once DRIFT is up; a stored one without the field stays OFF (sanitizePattern)
    movers: PATTERN_MOVERS_DEFAULT,
  };
}

/**
 * Clamp every field; unknown modes fall back to QUILT, junk falls back to the mode's
 * default. Returns a new object with exactly the eleven fields. Never throws.
 */
export function sanitizePattern(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  // #1797 legacy alias: patterns saved while the mode was named READOUT load as TIDES, never QUILT.
  const mode = r.mode === 'READOUT' ? 'TIDES' : PATTERN_MODES.includes(r.mode) ? r.mode : 'QUILT';
  const d = defaultPattern(mode, 1);
  const seed = Number(r.seed);
  return {
    mode,
    seed: Number.isFinite(seed) ? Math.floor(seed) >>> 0 : d.seed,
    density: Math.round(num(r.density, PATTERN_DENSITY_MIN, PATTERN_DENSITY_MAX, d.density)),
    mix: num(r.mix, 0, 1, d.mix),
    grout: num(r.grout, 0, QUILT_MAX_GROUT, d.grout),
    hero: num(r.hero, 0, 1, d.hero),
    drift: num(r.drift, 0, 1, d.drift),
    drop: r.drop === true,
    kin: PATTERN_KINS.includes(r.kin) ? r.kin : 'OFF', // absent or junk = no element motion: the picture it always was
    movers: num(r.movers, 0, 1, PATTERN_MOVERS_DEFAULT),
  };
}

/** The keys a caller may set one at a time. */
export const PATTERN_PARAM_KEYS = Object.freeze(['density', 'mix', 'grout', 'hero', 'drift', 'drop', 'kin', 'movers']);
