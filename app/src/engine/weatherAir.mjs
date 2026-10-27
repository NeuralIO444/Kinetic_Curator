// weatherAir.mjs — #1183 weather slice 1 (FX as weather): the marks' response to HAZE as air.
//
// "Weather is visibly in charge" (decided 2026-10-08): the FX layer's haze stops being only a
// post filter over the finished frame and becomes air in the one dish the marks live in. This
// module is the pure response: given the placed colour/accent arrays, a per-mark fade array
// (effective strength × the mist field's value under the mark) and the haze veil colour, mix
// each mark's colours toward the veil — the applyLean shape, fresh arrays out, base arrays
// untouched (the bind cache keeps the base colours, so a fade can never serve stale cache).
// The alpha half lives in weatherAlphaScale: buildPlacements multiplies each item's freshly
// assigned alpha by it, so a mark in thick mist also thins — colour alone reads as a tint;
// the alpha is what makes a mark feel IN the mist (Matt's Q4 ruling, 2026-10-19).
//
// The veil colour uses fxFilters buildHaze's own formula (veil = 0.35 + 0.6 × lift, the grey
// vec3(veil) the GL haze shader mixes toward), so the marks' fade and the post veil agree in
// value. The response never reads filter OUTPUT — FX rasterization is outside the determinism
// contract; this lives in the CPU resolver, where the ground family lives, so replays stay exact.
//
// Pure: no clock, no store, no DOM, no GL. The field itself is the WEATHER registry's first
// module ('haze-air', kernel/weather/registry.js); the connection is gl/dishWeather.mjs.
import { toHexColor } from './kernel/color/index.js';
import { hexToRgb255 } from './colorHex.mjs';
import { registerCostTier } from './kernel/costRegistry.mjs';

/** The haze veil's grey level: buildHaze (fx/fxFilters.js) and the GL haze shader both use
 *  veil = mix(0.35, 0.95, lift). Named here once so the marks' fade can never drift from it. */
export function hazeVeilLevel(lift) {
  const l = Number.isFinite(lift) ? Math.min(1, Math.max(0, lift)) : 0.5;
  return 0.35 + (0.95 - 0.35) * l;
}

/** The veil colour as '#rrggbb' (a pure grey, like the shaders' vec3(veil)). */
export function hazeVeilHex(lift) {
  const v = Math.round(hazeVeilLevel(lift) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${v}${v}${v}`;
}

/** How much of a fully faded mark's alpha the mist takes (plan §3.3): at fade 1 the mark
 *  keeps 40% of its alpha — sunk in the mist, never erased outright. */
export const WEATHER_ALPHA_FADE = 0.6;

/** The alpha multiplier for one mark at the given fade (0..1): 1 at fade 0 (byte-identical),
 *  1 − 0.6 at fade 1. Pure arithmetic over the freshly assigned stage-C alpha — never an
 *  accumulation across frames (the fieldMap trap: pooled items are re-derived every build). */
export function weatherAlphaScale(fade) {
  const f = Number.isFinite(fade) ? Math.min(1, Math.max(0, fade)) : 0;
  return 1 - WEATHER_ALPHA_FADE * f;
}

/**
 * Mix placed colours toward the veil by the per-mark fade array.
 *
 * fade[k] is the mark's total fade (effective strength × field value under it), 0..1.
 * When no fade is positive (or no veil is given) the input arrays are returned UNTOUCHED —
 * the same references — so strength 0 is provably today's output, not a re-encode.
 * Otherwise fresh arrays come back; the inputs are never mutated.
 *
 * The mix is applyLean's exact arithmetic (parse, `c + (veil − c) × t` per channel,
 * toHexColor) with the veil parsed ONCE for the whole call instead of once per mark —
 * applyLean re-parses its target on every call, which at 800 marks × 2 arrays measured
 * 0.516 ms of the weather delta; the pre-parsed mixer measures 0.385 ms and is
 * BIT-IDENTICAL to per-mark applyLean (proven over a corpus in weatherAir.selfcheck):
 * same parse of the same strings, same float ops, same formatter. Marks at fade ≤ 0
 * keep their exact input string, exactly as applyLean's own gate returns it.
 */
export function applyWeatherFade({ colors, accents, fade, veil }) {
  if (!veil || !fade) return { colors, accents };
  let any = false;
  for (let k = 0; k < colors.length; k++) {
    if (fade[k] > 0) {
      any = true;
      break;
    }
  }
  if (!any) return { colors, accents };
  const [vr, vg, vb] = hexToRgb255(veil);
  const mixAll = (arr) =>
    arr.map((c, k) => {
      const f = fade[k];
      if (!(f > 0)) return c;
      const t = Math.min(1, f);
      const [r, g, b] = hexToRgb255(c);
      return toHexColor(r + (vr - r) * t, g + (vg - g) * t, b + (vb - b) * t);
    });
  return { colors: mixAll(colors), accents: mixAll(accents) };
}

// The response's declared cost (the governor thesis: no module runs undeclared). Tier 1 —
// sheds with the FX finishes, first on the ladder; the FX look itself never sheds (#192).
// timeMs is the MEASURED resolver delta of the active path at 800 marks (buildPlacements
// probe, dish present in both arms, median of repeated runs, 2026-10-19): 2-octave fBm
// samples ≈0.10 + the pre-parsed veil mix ≈0.36 + fade/alpha application ≈0.14. As first
// designed (3 octaves, per-mark applyLean) it measured 0.835 ms; Matt's cost ruling
// (2026-10-19) ships the remedies at ≈0.6 ms — the same harness measures the shipped
// GROUND lean's own delta at 0.419 ms, so this is the family's honest per-response class.
registerCostTier('weather/haze-air', {
  tier: 1,
  memoryBytes: 0,
  timeMs: 0.6,
  notes:
    '#1183 weather slice 1 (haze as air): measured 0.60 ms @800 marks in the resolver (2-octave field samples + pre-parsed veil mix, bit-identical to applyLean; cost ruling 2026-10-19). Tier 1 — the marks\u2019 weather response sheds with the finishes; the haze look itself never sheds (#192).',
});
