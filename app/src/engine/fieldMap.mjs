// fieldMap.mjs — field→channel MATH modulation (#1199).
//
// A general data→visual mapping stratum: sample a scalar field at each
// mark's position, run the sample through a response curve, and remap an
// EXISTING visual channel of the mark. It remaps marks; it emits none —
// MATH type, never a new render feature (kineme's rule: move knobs that
// already exist).
//
// Fields (FIELDMAP_FIELDS):
//   noise    fBm noise field, seeded — makeNoiseField from kernel/field.
//   density  local mark density: grid-binned neighbour counts over the
//            placed items, normalized 0..1. A pure function of the item
//            positions, so it is deterministic per seed exactly like them.
// Channels (FIELDMAP_CHANNELS):
//   weight     thin→thick stroke read. Engine truth, documented honestly:
//              KC-1 renders marks as atlas stamps and has NO per-instance
//              stroke-width attribute, so weight drives the mark's own
//              footprint over a thickness-tuned range. On stroked/line
//              assets this reads as thicker/thinner strokes on screen.
//              A true per-texel stroke width (atlas weight variants +
//              shader attribute) would be a separate render feature.
//   saturation muted→saturated: shifts the mark's palette hexes toward the
//              mapped saturation. Composes with the palette — it never
//              overrides it, and amount 0 is byte-identical (applyLean's
//              contract).
//   scale      small→large: multiplies the mark's footprint over a
//              size-contrast range.
// Curves (FIELDMAP_CURVES): linear | smooth | stepped (stepped reads as
// designed, not muddy — the issue's call).
//
// Cost: CPU only, evaluated inside buildPlacements per placement call —
// in the live loop that is per frame while active, so the hard gate
// (amount 0 / field off / channel off → items untouched, maths skipped)
// is load-bearing. Zero per-frame GPU cost: nothing new is uploaded,
// the shader is untouched.
//
// Deterministic per seed: the noise field is seeded, density derives from
// seeded positions, the curves are pure. Same (seed, items) → same output.

import { makeNoiseField } from './kernel/field/index.js';
import { hexToRgb255 as parseHex } from './colorHex.mjs'; // #1682: canonical lenient parse (was a local copy)

/** Field sources, in tile order. 'off' is the no-op. */
export const FIELDMAP_FIELDS = Object.freeze(['off', 'noise', 'density']);

/** Visual channels, in tile order. 'off' is the no-op. */
export const FIELDMAP_CHANNELS = Object.freeze(['off', 'weight', 'saturation', 'scale']);

/** Response curves: field in [0,1] → channel drive in [0,1]. */
export const FIELDMAP_CURVES = Object.freeze(['linear', 'smooth', 'stepped']);

/** Stepped response quantizes the drive into this many discrete steps. */
export const FIELDMAP_STEPS = 4;

/** Channel output ranges: [thin, thick] / [muted, saturated] handled in
 *  saturateHex; footprint channels map the curved drive to a multiplier. */
export const FIELDMAP_RANGES = Object.freeze({
  weight: [0.55, 1.45], // thickness-tuned: reads as stroke weight, not size
  scale: [0.4, 1.9], // size contrast: small→large
});

/** Saturation extremes for the saturation channel: muted→saturated. */
export const FIELDMAP_SAT_RANGE = Object.freeze([0.08, 1.0]);

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Response curve: field sample 0..1 → channel drive 0..1.
 * Unknown names read as 'smooth' (the default).
 */
export function curveResponse(v, curve) {
  const x = clamp01(v);
  if (curve === 'linear') return x;
  if (curve === 'stepped') {
    const q = Math.min(FIELDMAP_STEPS - 1, Math.floor(x * FIELDMAP_STEPS));
    return q / (FIELDMAP_STEPS - 1);
  }
  // smooth: smootherstep — eases both ends, no dead band at the edges.
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Validate a partial field-map config onto the defaults. Garbage in →
 * the no-op out ('off'/'off'/0), never a throw.
 */
export function sanitizeFieldMap(partial = {}) {
  const p = partial && typeof partial === 'object' ? partial : {};
  return {
    field: FIELDMAP_FIELDS.includes(p.field) ? p.field : 'off',
    channel: FIELDMAP_CHANNELS.includes(p.channel) ? p.channel : 'off',
    amount: clamp01(p.amount),
    curve: FIELDMAP_CURVES.includes(p.curve) ? p.curve : 'smooth',
  };
}

/** Hard gate: false → applyFieldMap is a strict no-op (items untouched). */
export function fieldMapActive(cfg) {
  if (!cfg) return false;
  return cfg.amount > 0 && cfg.field !== 'off' && cfg.channel !== 'off';
}

// ── saturation helpers ─────────────────────────────────────────────────
// Hex ⇄ HSL. parseHex is canonical (engine/colorHex.mjs, #1682) — a
// zero-import leaf, so no pattern/ or gl/ dependency is introduced.

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h, s, l) {
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const to2 = (v) => Math.min(255, Math.max(0, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/**
 * Shift a palette hex's saturation toward `targetSat` by `amount` (0..1).
 * amount <= 0 returns the input string UNTOUCHED — byte-identical, not
 * re-encoded — so the saturation channel at 0 is provably today's render
 * (the applyLean contract from #1183).
 */
export function saturateHex(hex, targetSat, amount) {
  if (!(amount > 0)) return hex;
  const a = Math.min(1, amount);
  const [r, g, b] = parseHex(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  // Achromatic swatches (greys) have no hue to saturate: inventing one
  // would hue-shift the palette, so they stay exactly as authored.
  if (s < 1e-6) return hex;
  const s2 = lerp(s, clamp01(targetSat), a);
  return hslToHex(h, s2, l);
}

// ── density field ──────────────────────────────────────────────────────
// Grid-binned neighbour counts over the item set. 16×16 bins; each item
// counts marks in its 3×3 neighbourhood (itself included), normalized by
// the busiest neighbourhood. O(n), no allocation per item.

const DENSITY_BINS = 16;

function densityFieldFor(items, W, H) {
  const n = items.length;
  const bins = new Float64Array(DENSITY_BINS * DENSITY_BINS);
  const bw = Math.max(1, W / DENSITY_BINS);
  const bh = Math.max(1, H / DENSITY_BINS);
  const cellOf = (x, y) => [
    Math.min(DENSITY_BINS - 1, Math.max(0, Math.floor(x / bw))),
    Math.min(DENSITY_BINS - 1, Math.max(0, Math.floor(y / bh))),
  ];
  for (let i = 0; i < n; i++) {
    const [cx, cy] = cellOf(items[i].x, items[i].y);
    bins[cy * DENSITY_BINS + cx] += 1;
  }
  let peak = 0;
  const counts = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [cx, cy] = cellOf(items[i].x, items[i].y);
    let c = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= DENSITY_BINS) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= DENSITY_BINS) continue;
        c += bins[yy * DENSITY_BINS + xx];
      }
    }
    counts[i] = c;
    if (c > peak) peak = c;
  }
  const norm = peak > 0 ? 1 / peak : 0;
  return {
    kind: 'density',
    sampleAt: (i) => counts[i] * norm,
  };
}

// ── the applier ────────────────────────────────────────────────────────

/**
 * Apply the field→channel mapping to a built item list, in place.
 *
 * @param {object[]} items  buildPlacements items ({ x, y, scale, scaleY,
 *   color, accent, ... }). Mutated in place, returned for chaining.
 * @param {object} cfg      sanitizeFieldMap output.
 * @param {object} ctx      { seed, canvasW, canvasH }.
 * @returns the same items array.
 *
 * Hard gate: inactive configs return the array untouched (no allocation,
 * no field construction, no math). Deterministic: same (seed, items) →
 * same output, bit for bit.
 */
export function applyFieldMap(items, cfg, ctx = {}) {
  if (!fieldMapActive(cfg) || !items || items.length === 0) return items;
  const W = Number(ctx.canvasW) || 1;
  const H = Number(ctx.canvasH) || 1;
  const seed = (Number(ctx.seed) || 0) >>> 0;

  // Field sampler: noise samples normalized canvas coords; density reads
  // the per-item neighbourhood value.
  let density = null;
  let noise = null;
  let sample;
  if (cfg.field === 'noise') {
    noise = makeNoiseField(seed);
    sample = (it) => noise.sample(
      Math.min(1, Math.max(0, it.x / W)),
      Math.min(1, Math.max(0, it.y / H)),
    );
  } else { // 'density'
    density = densityFieldFor(items, W, H);
    sample = (_, i) => density.sampleAt(i);
  }

  const amount = cfg.amount;
  const curve = cfg.curve;

  if (cfg.channel === 'saturation') {
    const [satLo, satHi] = FIELDMAP_SAT_RANGE;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const drive = curveResponse(sample(it, i), curve);
      const target = lerp(satLo, satHi, drive);
      it.color = saturateHex(it.color, target, amount);
      it.accent = saturateHex(it.accent, target, amount);
    }
    return items;
  }

  // Footprint channels: weight (thickness-tuned) and scale (size-contrast).
  const [rLo, rHi] = FIELDMAP_RANGES[cfg.channel] || FIELDMAP_RANGES.scale;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const drive = curveResponse(sample(it, i), curve);
    const m = 1 + (lerp(rLo, rHi, drive) - 1) * amount;
    it.scale = (Number(it.scale) || 1) * m;
    it.scaleY = (Number(it.scaleY) || 1) * m;
  }
  return items;
}
