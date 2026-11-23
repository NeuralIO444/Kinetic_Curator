// gradientMap.mjs — #2443: the GRADIENT MAP FX kind's law + CPU reference.
//
// A gradient map re-colors a frame by its own luminance: shadows,
// midtones and highlights are re-assigned through a five-stop gradient
// (the Photoshop gradient-map move, live). The map judges luminance,
// not hue — a pixel's tone decides its new colour, its old hue is
// discarded.
//
// Spectral-law declaration (the spectral-mixing law, #2361): a gradient
// map is a PER-TONE RECOLOR. It neither mixes matter as pigment nor
// adds light as light — it re-assigns colour by tone, in place, and
// declares itself as such wherever the FX catalog declares kinds.
//
// Where the stops live (coordinator decision on #2443, following Matt's
// #2252 scanography ruling): the gradient's stops are a per-Look recipe
// constant — a Look may carry a `gradientMap` field naming any subset
// of the five stops as hex colours; stops it does not name fall back to
// the DEFAULT gradient below, so the item works under any Look. The
// stops are NOT performer params and never enter the document: the
// scene contract resolves them from the standing Look and attaches
// them to the FX chain step (withGradientStops), so a take records the
// exact stops it rendered with. The one performer control is the
// effect's strength dial (fx/fxFilters.js) — the guard, since on flat
// material a full-strength map goes extreme fast.
//
// What it reads (coordinator decision on #2443): the FX chain's input —
// the composited stage below the FX stratum, like every FX kind (#227).
// It is its own chain step at its slot position, composing with the
// LUT/grade items by ordinary chain order; it replaces nothing.
//
// Purity: the map is a pure function of the frame and its constants —
// no state, no RNG, no clock — so a still and the live frame agree and
// a take replays identically.

import { COMPOSITION_PRESETS } from '../data/presets.js';

/** The five stops, in tone order. `field` is the Look-recipe key, `param` the chain-step param name. */
export const GRADIENT_STOP_FIELDS = Object.freeze([
  Object.freeze({ field: 'blackPoint', param: 'black_point', at: 0 }),
  Object.freeze({ field: 'shadows', param: 'shadows', at: 0.25 }),
  Object.freeze({ field: 'midtones', param: 'midtones', at: 0.5 }),
  Object.freeze({ field: 'highlights', param: 'highlights', at: 0.75 }),
  Object.freeze({ field: 'whitePoint', param: 'white_point', at: 1 }),
]);

export const GRADIENT_STOP_PARAMS = Object.freeze(GRADIENT_STOP_FIELDS.map((s) => s.param));

/**
 * The default gradient — the reel recipe (#2443): endpoints stay mostly
 * desaturated (a near-neutral warm black and a warm near-white), the
 * saturated colour lives in the midtones (a full red), and the hue
 * shifts between midtones and highlights (red → amber) — that shift is
 * where the colour contrast comes from.
 */
export const DEFAULT_GRADIENT_STOPS = Object.freeze({
  blackPoint: '#16120e',
  shadows: '#571f14',
  midtones: '#c73e1d',
  highlights: '#e79a2e',
  whitePoint: '#f6ead3',
});

/** '#rgb' / '#rrggbb' → [r, g, b] floats 0..1, or null when unparseable. */
export function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

const DEFAULT_RGB = GRADIENT_STOP_FIELDS.map(({ field }) => hexToRgb(DEFAULT_GRADIENT_STOPS[field]));

/**
 * Resolve a Look's gradient to five stops [{ at, rgb: [r, g, b] }].
 * A Look (or null) may carry `gradientMap: { <field>: '#hex', ... }`;
 * unnamed or unparseable stops fall back to the default gradient,
 * per stop — a Look that names one stop re-authors exactly that stop.
 */
export function resolveGradientStops(look) {
  const authored = look && typeof look === 'object' ? look.gradientMap : null;
  return GRADIENT_STOP_FIELDS.map(({ field, at }, i) => {
    const rgb = authored && typeof authored === 'object' ? hexToRgb(authored[field]) : null;
    return { at, rgb: rgb || [...DEFAULT_RGB[i]] };
  });
}

/** The resolved stops as chain-step params: { black_point: [r, g, b, 1], ... }. */
export function gradientStopParams(look) {
  const stops = resolveGradientStops(look);
  const out = {};
  GRADIENT_STOP_FIELDS.forEach(({ param }, i) => {
    out[param] = [...stops[i].rgb, 1];
  });
  return out;
}

/** The standing Look by composition id (COMPOSITION_PRESETS), or null. */
export function lookByCompositionId(compositionId) {
  if (typeof compositionId !== 'string') return null;
  return COMPOSITION_PRESETS.find((p) => p && p.id === compositionId) || null;
}

/** Chain-step stop params for the Look a composition id names (default gradient when it names none). */
export function gradientStopParamsForComposition(compositionId) {
  return gradientStopParams(lookByCompositionId(compositionId));
}

/**
 * Attach the standing Look's resolved stops to every gradientMap entry
 * in an effects array (the scene contract's seam — see sceneContract.js).
 * Pure: returns the input array untouched when no gradientMap entry is
 * present, so documents without the item build byte-identical contracts.
 */
export function withGradientStops(effects, compositionId) {
  if (!Array.isArray(effects) || !effects.some((fx) => fx && fx.kind === 'gradientMap')) return effects;
  const stops = gradientStopParamsForComposition(compositionId);
  return effects.map((fx) =>
    fx && fx.kind === 'gradientMap' ? { ...fx, params: { ...(fx.params || {}), ...stops } } : fx,
  );
}

/**
 * Resolved stops from a chain step's params (the SVG builder's input):
 * each stop param is an [r, g, b, a] array when the contract attached
 * it; absent or malformed stops fall back to the default gradient.
 */
export function gradientStopsFromParams(params) {
  const src = params && typeof params === 'object' ? params : {};
  return GRADIENT_STOP_FIELDS.map(({ param, at }, i) => {
    const v = src[param];
    const ok = Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((c) => Number.isFinite(Number(c)));
    return { at, rgb: ok ? v.slice(0, 3).map((c) => Math.min(1, Math.max(0, Number(c)))) : [...DEFAULT_RGB[i]] };
  });
}

/** Rec.709 luminance — the weights the FX shaders share (halo, haze). */
export function luminance709(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * Sample the gradient at tone t (0..1) → [r, g, b]. Hat weights over
 * the uniform stop grid — the same formula the GLSL carries
 * (fxShaders.mjs FX_GRADIENT_MAP_FS), so the CPU reference and the
 * shader agree by construction, not by approximation.
 */
export function sampleGradient(stops, t) {
  const x = Math.min(1, Math.max(0, Number.isFinite(Number(t)) ? Number(t) : 0));
  const out = [0, 0, 0];
  for (let i = 0; i < stops.length; i++) {
    const w = Math.min(1, Math.max(0, 1 - Math.abs(x - stops[i].at) * 4));
    if (w <= 0) continue;
    out[0] += stops[i].rgb[0] * w;
    out[1] += stops[i].rgb[1] * w;
    out[2] += stops[i].rgb[2] * w;
  }
  return out;
}

/**
 * CPU reference: apply the map to a premultiplied RGBA float buffer
 * (0..1), in place — the FX_GRADIENT_MAP_FS math transcribed line for
 * line (fx/gradientMap.selfcheck.mjs pins the two together). Strength
 * 0, or a fully transparent pixel, leaves the pixel untouched.
 */
export function applyGradientMap(pixels, { stops, strength } = {}) {
  const s = Math.min(1, Math.max(0, Number(strength) || 0));
  if (!(s > 0) || !stops) return pixels;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (!(a > 1e-6)) continue;
    const straight = [
      Math.min(1, Math.max(0, pixels[i] / a)),
      Math.min(1, Math.max(0, pixels[i + 1] / a)),
      Math.min(1, Math.max(0, pixels[i + 2] / a)),
    ];
    const mapped = sampleGradient(stops, luminance709(straight));
    pixels[i] = (straight[0] + (mapped[0] - straight[0]) * s) * a;
    pixels[i + 1] = (straight[1] + (mapped[1] - straight[1]) * s) * a;
    pixels[i + 2] = (straight[2] + (mapped[2] - straight[2]) * s) * a;
  }
  return pixels;
}
