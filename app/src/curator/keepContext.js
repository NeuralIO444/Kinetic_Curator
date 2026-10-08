// keepContext.js — #1140: per-keep session context.
//
// A keep records WHAT was loved (seed, recipe, cast). This records what was
// in the air when it was loved: audio energy, palette warmth, dwell.
// Descriptors only — never raw audio or MIDI. A future training head reads
// these; the judgment and fertility heads never see them.
//
// Honesty rules (same as the keep itself): absent stays absent. A signal that
// is unavailable is omitted (or null where null is meaningful, e.g. audio
// off = known silence, not unknown). Nothing is invented.
import { readMeterBandLevels } from '../hooks/audioMeterTap.js';
import { loisActivity } from './loisActivity.js';
import { resolvePalette } from '../data/palettes.js';

const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const round2 = (x) => Math.round(clamp01(x) * 100) / 100;

/**
 * Mean Stimuli meter-band level, 0..1; null when audio is off.
 * Same derivation as the live engine's default audio drive (liveResolve.mjs):
 * null is honest idleness, not a zero.
 */
export function audioEnergyNow() {
  let bands;
  try {
    bands = readMeterBandLevels();
  } catch {
    return null;
  }
  if (!bands) return null;
  let sum = 0;
  let n = 0;
  for (const v of Object.values(bands)) {
    if (Number.isFinite(v)) {
      sum += v;
      n++;
    }
  }
  return n > 0 ? round2(sum / n) : null;
}

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/**
 * Warmth of one hue, 0..1 (1 = warm). Reds/oranges/yellows/magentas read
 * warm; greens/cyans/blues read cool; achromatic reads neutral.
 */
function warmthOfHue(h, s) {
  if (s < 0.15) return 0.5;
  if (h <= 50 || h >= 340) return 1;
  if (h >= 150 && h <= 250) return 0;
  if (h > 50 && h < 150) return 1 - (h - 50) / 100;
  return (h - 250) / 90;
}

/**
 * 0..1 palette warmth from the catalog swatches (1 = warm), weighted by the
 * baked swatch weights when present. Unknown ids fall back to the catalog
 * default, same as rendering — deterministic per resolved palette. Null only
 * when no palette resolves at all.
 */
export function paletteWarmth(paletteId) {
  let pal;
  try {
    pal = resolvePalette(paletteId);
  } catch {
    return null;
  }
  const sw = pal?.swatches;
  if (!Array.isArray(sw) || !sw.length) return null;
  const weights = Array.isArray(pal.weights) && pal.weights.length === sw.length ? pal.weights : null;
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < sw.length; i++) {
    const hsl = hexToHsl(sw[i]);
    if (!hsl) continue;
    const w = weights ? Math.max(0, Number(weights[i]) || 0) : 1;
    sum += warmthOfHue(hsl.h, hsl.s) * w;
    wsum += w;
  }
  return wsum > 0 ? round2(sum / wsum) : null;
}

/** ms the current seed/composition has been on screen; 0 when unknown. */
export function dwellMsNow() {
  try {
    const ms = loisActivity.snapshot().dwellMs;
    return Number.isFinite(ms) && ms >= 0 ? Math.floor(ms) : 0;
  } catch {
    return 0;
  }
}

/**
 * The keep's session context. Never throws; every field degrades honestly.
 * Shape: { audio: 0..1|null, paletteWarmth: 0..1|null, dwellMs: int>=0 }.
 */
export function captureKeepContext(paletteId) {
  const warmth = paletteWarmth(paletteId);
  return {
    audio: audioEnergyNow(),
    ...(warmth == null ? {} : { paletteWarmth: warmth }),
    dwellMs: dwellMsNow(),
  };
}

/**
 * Trust-boundary sanitizer for a stored context object. Legacy keeps have no
 * `context` key at all — that stays absent (never invented). Once present,
 * fields normalize to the schema; audio null (known silence) survives.
 */
export function sanitizeKeepContext(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const num01 = (v) => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? round2(n) : null;
  };
  const audio = num01(raw.audio);
  const warmth = num01(raw.paletteWarmth);
  const dwellMs = Number.isFinite(Number(raw.dwellMs)) && Number(raw.dwellMs) >= 0
    ? Math.floor(Number(raw.dwellMs))
    : 0;
  return {
    audio: audio == null || !Number.isFinite(audio) ? null : audio,
    ...(warmth == null || !Number.isFinite(warmth) ? {} : { paletteWarmth: warmth }),
    dwellMs,
  };
}
