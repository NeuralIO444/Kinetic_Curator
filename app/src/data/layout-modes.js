// Layout mode definitions — single source of truth

import { BEHAVE_IDS } from '../engine/organisms/behave.js';
import { COMPOSITION_PRESETS } from './presets.js';
import { BALLISTICS_CURVES } from '../gl/audioBallistics.mjs';

export const LAYOUT_MODES = [
  { id: 'random',    name: 'random',     glyph: 'rand'   },
  { id: 'grid',      name: 'grid',       glyph: 'grid'   },
  { id: 'fibonacci', name: 'fibonacci',  glyph: 'phi'    },
  { id: 'radial',    name: 'radial',     glyph: 'rad'    },
  { id: 'swarm',     name: 'swarm boids', glyph: 'swarm'  },
  { id: 'noise',     name: 'noise warp', glyph: 'noise'  },
  { id: 'hype',      name: 'moth·hype', glyph: 'hype'   },
  { id: 'stratified', name: 'stratified', glyph: 'strat' },
  { id: 'flow',      name: 'flow',       glyph: 'flow'   },
  { id: 'layers',    name: 'layers',     glyph: 'z'      },
  { id: 'rails',     name: 'rails',      glyph: 'rail'   },
  { id: 'ca',        name: 'cellular',   glyph: 'ca'     },
  { id: 'orbit',     name: 'orbit',      glyph: 'orbit'  },
  { id: 'abacus',    name: 'abacus',     glyph: 'abacus' },
  // #280 — murmuration is a curated voice, not a new engine: it runs on the
  // swarm engine (see isLiveSwarmMode below) with its own palette + motion
  // character. Kept out of the stub list so it never falls back to a bare
  // sampler.
  { id: 'murmuration', name: 'murmuration', glyph: 'deep' },
];

export function isLiveSwarmMode(mode) {
  return mode === 'swarm' || mode === 'hype' || mode === 'murmuration';
}

export function isOrganismMode(mode) {
  return mode === 'hype';
}

export const SYMMETRY_MODES = ['none', 'bilateral', 'radial-4', 'radial-6', 'radial-8', 'stamp'];
export const BEHAVE_MODES = BEHAVE_IDS;

/** #167 — onContact response per overlapping pair. */
export const CONTACT_MODES = ['none', 'bounce', 'swap', 'stick', 'die', 'breed'];

export const PALETTE_SHIFTS = ['auto', 'band', 'zone', 'split'];

export const BLEND_MODES = [
  'normal', 'screen', 'multiply', 'overlay', 'difference', 'plus-lighter', 'soft-light',
];

export const DEFAULT_LAYOUT_PARAMS = {
  composition: 'praystation',
  mode: 'fibonacci',
  count: 240,
  scale: [0.4, 1.6],
  rotate: [-180, 180],
  alpha: [40, 100],
  zTiers: 4,
  jitter: 24,
  density: 78,
  bleed: false,
  mirror: false,
  overlap: true,
  blendMode: 'normal',
  hueRotate: 0,
  paletteShift: 'auto',

  accumulation: false,
  accumulationFade: 5.4, // #274: trail half-life in frames (was keep 0.88)
  accumulationOptics: 0, // #190: bloom + halation + stipple-diffusion amount (GLOW slider) (#308: no gaussian blur)
  accumulationTunnel: 0, // Phase A: feedback zoom/spin amount (TUNNEL slider)
  accumulationPrism: 0, // Phase A: chromatic drift amount (PRISM slider)
  accumulationFlow: 0, // #284 Phase B2: curl advection of the trail buffer (FLOW slider)

  noiseFreq: 0.005,
  noiseSpeed: 0.5,
  displacement: 0,
  particleCount: 150,
  swarmCohesion: 0.6, // #272: retuned to the honest slider max (was 1.5, past the 'one blob' threshold)
  gravityWells: 1.0,
  damping: 0.95,

  body: 3,
  flap: 0.35,
  tight: 0.55,
  wind: 1,
  symmetry: 'none',
  behave: 'cruise',
  material: 'plate',
  // #287 bio-drives. metabolism 0 = drives off (legacy behaviour);
  // breath 0 = no breathing swell; graze 0 = no grazers. graze is a hidden
  // voice-level param (no slider — the spec is the trust boundary, same as
  // the #167 contact params before their UI follow-up).
  metabolism: 0,
  breath: 0,
  graze: 0,

  // #167 — organism contacts. contactRadius 0 disables the contact pass
  // entirely (the swarm is then bit-identical to the pre-contact engine).
  contactRadius: 0,
  contactRestitution: 0.5,
  contactRepel: 0,
  contactMode: 'none',
  collideMask: 0xffffffff,

  audioModDepth: 0.65,
  audioScaleMod: 0.45,
  audioAlphaMod: 0.25,
  // #306: audio ballistics — envelope follower + response curve + glow fader.
  audioAttackMs: 25,
  audioDecayMs: 320,
  audioResponse: 'exponential',
  audioSwell: 1,
  lifeDrift: 0.35,
};

/** #306 — audio envelope response-curve shapes. */
export const AUDIO_RESPONSE_IDS = BALLISTICS_CURVES;

export const MODE_IDS = LAYOUT_MODES.map((m) => m.id);
// #268: SHADING_MODES / MATERIAL_IDS removed — the GL renderer renders
// everything flat; the controls are gone, so the params are gone too.
export const COMPOSITION_IDS = COMPOSITION_PRESETS.map((p) => p.id);

/**
 * Numeric bounds for every scalar in DEFAULT_LAYOUT_PARAMS — the same limits
 * the sliders in panels/layout/ParamBlock.jsx and panels/stimulus enforce.
 *
 * This is the trust boundary for project JSON (#106). A project arrives from
 * a file picker, an autosave written by an older build, or `studio/render.mjs`
 * reading an arbitrary path, and until now none of these were checked:
 * `{"jitter": 1e999}` parses to Infinity and produced a whole canvas of
 * non-finite coordinates, and `{"particleCount": 1e7}` asked the swarm to
 * allocate ten million particles.
 *
 * Keep in sync with the sliders — they are the UI half of the same contract.
 * A value the UI cannot produce should not survive a project load either.
 */
export const PARAM_SPEC = {
  count: { min: 10, max: 800, int: true },
  jitter: { min: 0, max: 200 },
  density: { min: 10, max: 100 }, // #272: capped at 100
  zTiers: { min: 1, max: 12, int: true },
  hueRotate: { min: 0, max: 360 },
  noiseFreq: { min: 0.001, max: 0.03 },
  noiseSpeed: { min: 0.1, max: 3.0 },
  displacement: { min: 0, max: 250 },
  // int: true — a fractional value mid-MIX reaches ParticleSystem.init as a
  // non-integer array length (RangeError, surfaces as a RENDER FAULT). Every
  // other count-like param (zTiers, body, collideMask) already has this.
  particleCount: { min: 10, max: 500, int: true },
  swarmCohesion: { min: 0, max: 5.0 },
  gravityWells: { min: 0, max: 5.0 },
  damping: { min: 0.80, max: 0.99 },
  body: { min: 1, max: 7, int: true },
  flap: { min: 0, max: 1 },
  tight: { min: 0.05, max: 0.95 },
  wind: { min: 0, max: 3 },
  // #287 bio-drives — the two new sliders (METABOLISM, BREATH) plus the
  // hidden voice-level grazer fraction.
  metabolism: { min: 0, max: 2 },
  breath: { min: 0, max: 1 },
  graze: { min: 0, max: 1 },
  accumulationFade: { min: 1, max: 40 }, // #274: half-life frames
  accumulationOptics: { min: 0, max: 0.25 }, // #308 review: remapped — full slider travel is the usable range
  accumulationTunnel: { min: 0, max: 1 },
  accumulationPrism: { min: 0, max: 1 },
  accumulationFlow: { min: 0, max: 1 }, // #284: Phase B2 curl advection amount
  audioModDepth: { min: 0, max: 1 },
  audioScaleMod: { min: 0, max: 1 },
  audioAlphaMod: { min: 0, max: 1 },
  // #306: envelope follower time constants (ms), glow swell fader.
  audioAttackMs: { min: 0, max: 2000 },
  audioDecayMs: { min: 0, max: 5000 },
  audioSwell: { min: 0, max: 1 },
  lifeDrift: { min: 0, max: 1 },
  // #167 — contact disc radius in px (0 = contacts off), bounce 0–1,
  // personal-space force gain, and the 32-bit layer-interaction mask.
  // No sliders expose these yet — the spec is the trust boundary (#107),
  // the UI half is a follow-up.
  contactRadius: { min: 0, max: 120 },
  contactRestitution: { min: 0, max: 1 },
  contactRepel: { min: 0, max: 5 },
  collideMask: { min: 0, max: 0xffffffff, int: true },
};

/** Bounds for each end of the dual-slider ranges. */
export const RANGE_SPEC = {
  scale: { min: 0.1, max: 3.0 },
  rotate: { min: -180, max: 180 },
  alpha: { min: 0, max: 100 },
};

const RANGE_KEYS = Object.keys(RANGE_SPEC);
const BOOL_KEYS = ['bleed', 'mirror', 'overlap', 'accumulation']; // #268: recolor removed

/** Names that would shadow Object.prototype if copied onto a plain object. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function clampNum(value, spec, fallback) {
  // Only genuine numbers and numeric strings coerce. Number() maps null, ''
  // and [] to 0, which would silently pin an absent field to the slider's
  // minimum instead of its default — `{"damping": null}` would render at
  // 0.80 rather than 0.95, and look like a deliberate authoring choice.
  const isNumeric = typeof value === 'number'
    || (typeof value === 'string' && value.trim() !== '');
  if (!isNumeric) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const c = Math.min(spec.max, Math.max(spec.min, n));
  return spec.int ? Math.round(c) : c;
}

function pickEnum(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

const ENUM_SPEC = {
  mode: MODE_IDS,
  composition: COMPOSITION_IDS,
  blendMode: BLEND_MODES,
  paletteShift: PALETTE_SHIFTS,
  symmetry: SYMMETRY_MODES,
  behave: BEHAVE_MODES,
  contactMode: CONTACT_MODES,
  audioResponse: AUDIO_RESPONSE_IDS, // #306
};

/** True when `value` is a number we can meaningfully clamp. */
function isNumericish(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string' && value.trim() !== '') return Number.isFinite(Number(value));
  return false;
}

/**
 * Which supplied keys are *structurally* wrong, as opposed to merely out of
 * range (#107 §1).
 *
 * The distinction matters. A slider that runs past its maximum should clamp —
 * that is what a slider does, and rejecting it would feel broken. But NaN,
 * null, a boolean where a number belongs, or a mode that does not exist is
 * not a value at the edge of a range; it is a caller that has gone wrong, and
 * silently substituting a default would hide the bug while changing the
 * operator's composition underneath them.
 *
 * So: clamp what can be clamped, reject what cannot, and let the caller keep
 * the previous state for the rejected keys.
 *
 * @returns {{ params: object, rejected: string[] }}
 */
export function validateLayoutParams(partial) {
  const src = partial && typeof partial === 'object' && !Array.isArray(partial) ? partial : {};
  const rejected = [];

  for (const key of Object.keys(src)) {
    if (UNSAFE_KEYS.has(key)) { rejected.push(key); continue; }
    const value = src[key];
    if (PARAM_SPEC[key]) {
      if (!isNumericish(value)) rejected.push(key);
    } else if (RANGE_SPEC[key]) {
      const usable = Array.isArray(value) && value.length >= 2
        && isNumericish(value[0]) && isNumericish(value[1]);
      if (!usable) rejected.push(key);
    } else if (ENUM_SPEC[key]) {
      if (!pickEnumOk(value, ENUM_SPEC[key])) rejected.push(key);
    }
    // Booleans coerce rather than reject; unknown keys are passed through
    // untouched, same as normalizeLayoutParams.
  }

  return { params: normalizeLayoutParams(src), rejected };
}

function pickEnumOk(value, allowed) {
  return typeof value === 'string' && allowed.includes(value);
}

export function normalizeLayoutParams(partial) {
  const src = partial && typeof partial === 'object' && !Array.isArray(partial) ? partial : {};
  const next = { ...DEFAULT_LAYOUT_PARAMS };
  // Copy own enumerable keys, skipping prototype-shadowing names that
  // JSON.parse hands back as ordinary own properties.
  for (const k of Object.keys(src)) {
    if (!UNSAFE_KEYS.has(k)) next[k] = src[k];
  }

  for (const key of RANGE_KEYS) {
    const v = next[key];
    const spec = RANGE_SPEC[key];
    // QA (2026-09-16): length was checked but entries were not, so
    // {scale:['a','b']} from a hand-edited or corrupted project JSON
    // passed through unchanged and fed NaN/strings into transform math
    // downstream instead of falling back to a safe default.
    const usable = Array.isArray(v) && v.length >= 2
      && Number.isFinite(Number(v[0])) && Number.isFinite(Number(v[1]));
    next[key] = usable
      // Ends are clamped but deliberately NOT reordered: a reversed range
      // (hi < lo) runs the lerp backwards, which is a legitimate thing to
      // author, so "fixing" the order would change existing compositions.
      ? [clampNum(v[0], spec, DEFAULT_LAYOUT_PARAMS[key][0]),
        clampNum(v[1], spec, DEFAULT_LAYOUT_PARAMS[key][1])]
      : DEFAULT_LAYOUT_PARAMS[key].slice();
  }

  // #274: legacy fade migration — accumulationFade was stored as a keep
  // multiplier (0..1) before the half-life change. Any value in (0, 1) in a
  // saved project is a legacy keep (the new slider minimum is 1, so the
  // ranges don't overlap); convert to half-life frames so old projects keep
  // their look: halfLife = -1 / log2(keep). Exactly 1 is left alone — it's
  // the new half-life minimum, and a legacy keep of exactly 1 ("never
  // fade") is a degenerate edge not worth a version bump. Runs before the
  // PARAM_SPEC clamp.
  {
    const v = next.accumulationFade;
    const n = typeof v === 'number' ? v
      : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    if (Number.isFinite(n) && n > 0 && n < 1) {
      const hl = -1 / Math.log2(n);
      next.accumulationFade = Math.min(40, Math.max(1, hl));
    }
  }

  for (const [key, spec] of Object.entries(PARAM_SPEC)) {
    next[key] = clampNum(next[key], spec, DEFAULT_LAYOUT_PARAMS[key]);
  }

  for (const key of BOOL_KEYS) next[key] = !!next[key];

  // Enums. `mode` is the one with teeth: getSampler indexed SAMPLERS
  // directly, so {"mode": "__proto__"} resolved to Object.prototype — truthy,
  // not callable — and threw "sample is not a function" mid-render, taking
  // down a studio batch or the live canvas.
  next.mode = pickEnum(next.mode, MODE_IDS, DEFAULT_LAYOUT_PARAMS.mode);
  next.composition = pickEnum(next.composition, COMPOSITION_IDS, DEFAULT_LAYOUT_PARAMS.composition);
  next.blendMode = pickEnum(next.blendMode, BLEND_MODES, 'normal');
  next.paletteShift = pickEnum(next.paletteShift, PALETTE_SHIFTS, 'auto');
  next.symmetry = pickEnum(next.symmetry, SYMMETRY_MODES, 'none');
  next.behave = pickEnum(next.behave, BEHAVE_MODES, 'cruise');
  next.contactMode = pickEnum(next.contactMode, CONTACT_MODES, 'none');
  next.audioResponse = pickEnum(next.audioResponse, AUDIO_RESPONSE_IDS, DEFAULT_LAYOUT_PARAMS.audioResponse); // #306

  return next;
}
