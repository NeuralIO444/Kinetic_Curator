// Layout mode definitions — single source of truth

import { BEHAVE_IDS } from '../engine/organisms/behave.js';
import { MATERIALS } from '../engine/materials.js';
import { COMPOSITION_PRESETS } from './presets.js';

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
];

export function isLiveSwarmMode(mode) {
  return mode === 'swarm' || mode === 'hype';
}

export function isOrganismMode(mode) {
  return mode === 'hype';
}

export const SYMMETRY_MODES = ['none', 'bilateral', 'stamp'];
export const BEHAVE_MODES = BEHAVE_IDS;

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
  recolor: true,
  mirror: false,
  overlap: true,
  blendMode: 'normal',
  shading: 'flat',
  hueRotate: 0,
  paletteShift: 'auto',

  accumulation: false,
  accumulationFade: 0.88,

  noiseFreq: 0.005,
  noiseSpeed: 0.5,
  displacement: 0,
  particleCount: 150,
  swarmCohesion: 1.5,
  gravityWells: 1.0,
  damping: 0.95,

  body: 3,
  flap: 0.35,
  tight: 0.55,
  wind: 1,
  symmetry: 'none',
  behave: 'cruise',
  material: 'plate',

  audioModDepth: 0.65,
  audioScaleMod: 0.45,
  audioAlphaMod: 0.25,
  lifeDrift: 0.35,
};

export const MODE_IDS = LAYOUT_MODES.map((m) => m.id);
export const SHADING_MODES = ['flat', 'gloss'];
export const MATERIAL_IDS = MATERIALS.map((m) => m.id);
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
  count: { min: 10, max: 800 },
  jitter: { min: 0, max: 200 },
  density: { min: 10, max: 120 },
  zTiers: { min: 1, max: 12, int: true },
  hueRotate: { min: 0, max: 360 },
  noiseFreq: { min: 0.001, max: 0.03 },
  noiseSpeed: { min: 0.1, max: 3.0 },
  displacement: { min: 0, max: 250 },
  particleCount: { min: 10, max: 500 },
  swarmCohesion: { min: 0, max: 5.0 },
  gravityWells: { min: 0, max: 5.0 },
  damping: { min: 0.80, max: 0.99 },
  body: { min: 1, max: 7, int: true },
  flap: { min: 0, max: 1 },
  tight: { min: 0.05, max: 0.95 },
  wind: { min: 0, max: 3 },
  accumulationFade: { min: 0.5, max: 0.99 },
  audioModDepth: { min: 0, max: 1 },
  audioScaleMod: { min: 0, max: 1 },
  audioAlphaMod: { min: 0, max: 1 },
  lifeDrift: { min: 0, max: 1 },
};

/** Bounds for each end of the dual-slider ranges. */
export const RANGE_SPEC = {
  scale: { min: 0.1, max: 3.0 },
  rotate: { min: -180, max: 180 },
  alpha: { min: 0, max: 100 },
};

const RANGE_KEYS = Object.keys(RANGE_SPEC);
const BOOL_KEYS = ['bleed', 'recolor', 'mirror', 'overlap', 'accumulation'];

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
  next.shading = pickEnum(next.shading, SHADING_MODES, 'flat');
  next.material = pickEnum(next.material, MATERIAL_IDS, DEFAULT_LAYOUT_PARAMS.material);
  next.paletteShift = pickEnum(next.paletteShift, PALETTE_SHIFTS, 'auto');
  next.symmetry = pickEnum(next.symmetry, SYMMETRY_MODES, 'none');
  next.behave = pickEnum(next.behave, BEHAVE_MODES, 'cruise');

  return next;
}
