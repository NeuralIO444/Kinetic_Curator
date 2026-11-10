// data/canon/settings.js — #2046 (Canon S4): a style's applicable SETTINGS.
//
// A Canon style record (styles.js) says what a style is called and where it comes from; a Book chapter was a
// set of pointers to other catalogues. Neither carried a value a system could apply. This module is that
// value: for each style, the palette behaviour, the motion and the feel of its OWN members — measured from the
// looks in its Look group and the voices in its family, never typed in by hand. The Book's chapters carry it
// (data/chapters.js `settings`), and taste reads it back (curator/taste.js: a standing chapter leans the pick).
//
//   basis   — how many looks and voices the numbers were measured from (so a reader can weigh the claim)
//   palette — ids: the style's palettes, first-seen order; shift / blend: the palette-shift and blend mode most
//             of its looks declare; ground: the mean luminance of its palette grounds, 0 (ink-dark) … 1 (paper)
//   motion  — behave: the flocking behaviour most of its members use; lifeDrift / noiseSpeed / wind / breath:
//             their mean, in the instrument's own units; layouts: its most-used layouts (Canon ids, canon/motion)
//   feel    — the 19 taste features (curator/tasteFeatures.js), averaged over its members: the style's centre
//             in the exact space the curator scores candidates in
//
// A style with no Look group and no voice family (techno, pixel, organic today) has no members to measure, and
// its settings are null — an honest blank, not a guess. Deterministic and pure: same catalogues, same settings.
//
// No import of data/chapters.js or canon/index.js here — chapters.js imports THIS, and the edge must stay one-way.
import { CANON_STYLE_IDS, canonStyleRecord } from './styles.js';
import { canonMotionForStyle } from './motion.js';
import { COMPOSITION_PRESETS } from '../presets.js';
import { VOICE_DECK } from '../voiceDeck.js';
import { resolvePalette } from '../palettes.js';
import { normalizeLayoutParams } from '../layout-modes.js';
import { extractFeatures, FEATURE_KEYS } from '../../curator/tasteFeatures.js';

const round4 = (x) => Math.round(x * 10000) / 10000;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** The most frequent value; ties go to the value seen first (catalogue order) — stable, data-only. */
function mode(values) {
  const counts = new Map();
  for (const v of values) if (typeof v === 'string' && v) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (!best || n > best[1]) best = [v, n];
  return best ? best[0] : null;
}

/** Relative luminance of a `#rrggbb` ground, 0..1 (sRGB, Rec. 709 weights). Null for anything else. */
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
}

/** The motion numbers a style's settings carry — existing layout params, in the instrument's own units. */
export const SETTINGS_MOTION_KEYS = Object.freeze(['lifeDrift', 'noiseSpeed', 'wind', 'breath']);

function measure(styleId, looks, deck) {
  const ownLooks = looks.filter((l) => l.group === styleId);
  const ownVoices = deck.filter((v) => v.kind === 'family' && v.def.family === styleId);
  if (!ownLooks.length && !ownVoices.length) return null;
  // every member, as it is dealt: its recipe normalized through the same door the stage uses
  const recipes = [...ownLooks.map((l) => l.params), ...ownVoices.map((v) => v.def.params)].map((p) =>
    normalizeLayoutParams(p),
  );
  const features = recipes.map((p) => extractFeatures(p));
  const paletteIds = [
    ...new Set([...ownLooks.map((l) => l.paletteId), ...ownVoices.map((v) => v.def.paletteId)].filter(Boolean)),
  ];
  const grounds = paletteIds.map((id) => luminance(resolvePalette(id, null, []).bg)).filter((x) => x !== null);
  return {
    basis: { looks: ownLooks.length, voices: ownVoices.length },
    palette: {
      ids: paletteIds,
      shift: mode(ownLooks.map((l) => l.paletteShift)),
      blend: mode(recipes.map((p) => p.blendMode)),
      ground: grounds.length ? round4(mean(grounds)) : null,
    },
    motion: {
      behave: mode(recipes.map((p) => p.behave)),
      ...Object.fromEntries(SETTINGS_MOTION_KEYS.map((k) => [k, round4(mean(recipes.map((p) => Number(p[k]) || 0)))])),
      layouts: canonMotionForStyle(styleId, { domain: 'layout' })
        .slice(0, 4)
        .map((r) => r.id),
    },
    feel: Object.fromEntries(FEATURE_KEYS.map((k) => [k, round4(mean(features.map((f) => f[k])))])),
  };
}

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

const CACHE = new Map(CANON_STYLE_IDS.map((id) => [id, deepFreeze(measure(id, COMPOSITION_PRESETS, VOICE_DECK))]));

/**
 * The applicable settings of a Canon style — `{ basis, palette, motion, feel }`, deep-frozen — or null when the
 * style has no members to measure (or the id is unknown). Pass catalogues to measure a hypothetical library
 * (tests); the app passes none and reads the cached measurement.
 */
export function canonStyleSettings(styleId, data) {
  if (!canonStyleRecord(styleId)) return null;
  if (data) return deepFreeze(measure(styleId, data.looks ?? COMPOSITION_PRESETS, data.deck ?? VOICE_DECK));
  return CACHE.get(styleId) ?? null;
}

/**
 * How closely a measured recipe (extractFeatures output) sits to a style's feel: 1 − the mean absolute
 * difference over the feel's features, so 1 is the style's own centre and 0 is as far as the space goes.
 * 0.5-neutral for a feature the recipe lacks (extractFeatures' own convention). Null when there is no feel.
 */
export function feelAffinity(features, feel) {
  if (!feel || !features) return null;
  const keys = Object.keys(feel);
  if (!keys.length) return null;
  let sum = 0;
  for (const k of keys) sum += Math.abs((typeof features[k] === 'number' ? features[k] : 0.5) - feel[k]);
  return 1 - sum / keys.length;
}
