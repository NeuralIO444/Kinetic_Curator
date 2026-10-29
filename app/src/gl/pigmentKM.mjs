/**
 * Pigment colour by Kubelka-Munk (#1811) — pure functions, no GL, no
 * imports. The wet field's colour math: how a pigment absorbs and
 * scatters, and what a mixture of pigments reflects.
 *
 * The arbitrary-colour problem (the issue's spec): KC-1's colours arrive
 * from any palette a look deals; nobody hand-authors KM constants. So
 * the constants are DERIVED, by one pure function, from the sRGB colour:
 *
 *   1. Spectrum reconstruction. The colour's reflectance spectrum is
 *      rebuilt over KM_BANDS bands as a positive combination of three
 *      pinned basis spectra (KM_BASIS) — the shape of the practical
 *      spectral-upsample systems (spectral.js and kin): the blue basis
 *      carries a green shoulder and dies before red, the yellow a
 *      colour makes is the red+green bases TOGETHER, and it is the
 *      shoulders — not the channel values — that let blue + yellow mix
 *      to a living green instead of RGB averaging's grey.
 *   2. Single-pigment inversion. Per band, K/S = (1 − R)² / (2R), the
 *      Kubelka-Munk reflectance of an opaque layer solved for its
 *      absorption/scattering ratio. Scattering is normalized (S = 1);
 *      the mixture math below carries absolute K and S separately so
 *      the normalization never leaks into a result.
 *   3. Mixture. A mixture's K and S are the concentration-weighted sums
 *      of its pigments' (the two-flux model's one linearity), and its
 *      reflectance is the finite-layer KM solution over the paper
 *      backing (Rg = 1): zero concentration reflects the paper exactly,
 *      infinite concentration tends to R∞ = 1 + K/S − √((K/S)² + 2K/S).
 *   4. Back to RGB through the basis spectra's pseudoinverse (the
 *      normal equations, solved once at module load from the pinned
 *      basis — the same arithmetic on every run, so the projection is
 *      as deterministic as the basis).
 *
 * Per-pigment character (Curtis et al. 1997 vocabulary) rides on the
 * same derivation — three scalars from documented heuristics with
 * pinned constants, never hand-tuned per palette:
 *   ρ density            — darker colours carry more absorbing material
 *                          per volume and settle faster: ρ grows as
 *                          luminance falls.
 *   ω staining / lift    — high mean absorption (deep K/S) is what
 *     resistance           makes a pigment stain: it binds and resists
 *                          being lifted back into suspension.
 *   γ granulation        — earthy colours (low saturation, mid
 *                          luminance) granulate; vivid and very dark
 *                          or very pale colours lie smooth.
 *
 * Results are cached per quantized colour (the issue: "computed once
 * per colour and cached") and frozen — the same colour yields the same
 * object on every path, so field code can derive a cell's character
 * from the colour it holds without storing approximations.
 */

export const KM_BANDS = 8;

/** Band centre wavelengths (nm), evenly spaced 400–700. */
export const KM_WAVELENGTHS = Object.freeze(
  Array.from({ length: KM_BANDS }, (_, i) => 400 + (i * 300) / (KM_BANDS - 1)),
);

/**
 * The pinned basis spectra: reflectance of the sRGB primaries as
 * physical pigments, per band. Hand-set constants with physical shapes
 * (see header): blue has its green shoulder (0.30 at 529 nm) and is
 * dead by orange; green leaks a little into blue (0.10 at 443) and dies
 * in red; red is black below green and full from 614 up.
 */
export const KM_BASIS = Object.freeze({
  r: Object.freeze([0.01, 0.01, 0.02, 0.05, 0.28, 0.85, 1.0, 1.0]),
  g: Object.freeze([0.02, 0.1, 0.35, 1.0, 0.72, 0.18, 0.03, 0.01]),
  b: Object.freeze([0.95, 1.0, 0.72, 0.3, 0.08, 0.02, 0.01, 0.01]),
});

/** No real pigment is perfectly black in any band; the floor keeps
 * K/S finite (max ≈ 24) and mirrors the basis spectra's own floors. */
export const KM_SPECTRUM_FLOOR = 0.02;

/** Dimensionless S·thickness per unit total concentration: how fast a
 * deposited load reaches its opaque reflectance. Pinned by the mixture
 * evidence in docs/review/1811/ (a unit load sits near, not at, R∞). */
export const KM_THICKNESS = 2.0;

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** [r, g, b] (any range, non-finite → 0) → clamped sRGB triple. */
export function sanitizeRgb(rgb) {
  if (!rgb || rgb.length < 3) return [0, 0, 0];
  return [clamp01(Number(rgb[0])), clamp01(Number(rgb[1])), clamp01(Number(rgb[2]))];
}

/**
 * The effective basis: the authored shapes normalized per band so the
 * three sum to exactly 1 at every band. White is then representable —
 * its spectrum is the flat paper spectrum, not a clamped overflow —
 * and the projection below is the normalized basis's own pseudoinverse,
 * so primaries and white both round-trip exactly.
 */
const KM_BASIS_N = (() => {
  const out = { r: [], g: [], b: [] };
  for (let i = 0; i < KM_BANDS; i++) {
    const s = KM_BASIS.r[i] + KM_BASIS.g[i] + KM_BASIS.b[i];
    out.r.push(KM_BASIS.r[i] / s);
    out.g.push(KM_BASIS.g[i] / s);
    out.b.push(KM_BASIS.b[i] / s);
  }
  return out;
})();

/** Step 1: the colour's reflectance spectrum over KM_BANDS bands. */
export function spectrumFromRgb(rgb) {
  const [r, g, b] = sanitizeRgb(rgb);
  const out = new Float32Array(KM_BANDS);
  for (let i = 0; i < KM_BANDS; i++) {
    const s = r * KM_BASIS_N.r[i] + g * KM_BASIS_N.g[i] + b * KM_BASIS_N.b[i];
    out[i] = Math.min(1, Math.max(KM_SPECTRUM_FLOOR, s));
  }
  return out;
}

// The basis pseudoinverse (3 × KM_BANDS), from the normal equations
// (AᵀA)⁻¹Aᵀ over the normalized basis — computed once, deterministically.
const KM_PROJECT = (() => {
  const A = [KM_BASIS_N.r, KM_BASIS_N.g, KM_BASIS_N.b];
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let b = 0; b < KM_BANDS; b++) s += A[i][b] * A[j][b];
      m[i][j] = s;
    }
  // 3×3 inverse by adjugate (the basis is well-conditioned by shape).
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, k] = m[2];
  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
  const inv = [
    [(e * k - f * h) / det, (c * h - b * k) / det, (b * f - c * e) / det],
    [(f * g - d * k) / det, (a * k - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
  const P = [new Float32Array(KM_BANDS), new Float32Array(KM_BANDS), new Float32Array(KM_BANDS)];
  for (let ch = 0; ch < 3; ch++)
    for (let band = 0; band < KM_BANDS; band++) {
      let s = 0;
      for (let j = 0; j < 3; j++) s += inv[ch][j] * A[j][band];
      P[ch][band] = s;
    }
  return P;
})();

/** Step 4: a reflectance spectrum back to an sRGB triple (clamped). */
export function spectrumToRgb(spec) {
  const out = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    let s = 0;
    for (let b = 0; b < KM_BANDS; b++) s += KM_PROJECT[ch][b] * (Number(spec[b]) || 0);
    out[ch] = clamp01(s);
  }
  return out;
}

/**
 * Steps 1–2 + character: a colour's KM constants and Curtis character.
 * Pure and uncached — kmConstantsForColor is the cached path.
 * @param {[number, number, number]} rgb sRGB 0..1
 * @returns {{K: Float32Array, S: Float32Array, rho: number, omega: number, gamma: number}}
 */
export function deriveKM(rgb) {
  const [r, g, b] = sanitizeRgb(rgb);
  const spec = spectrumFromRgb([r, g, b]);
  const K = new Float32Array(KM_BANDS);
  const S = new Float32Array(KM_BANDS);
  let ksSum = 0;
  for (let i = 0; i < KM_BANDS; i++) {
    const ks = ((1 - spec[i]) * (1 - spec[i])) / (2 * spec[i]);
    K[i] = ks; // S normalized to 1: K carries the ratio.
    S[i] = 1;
    ksSum += ks;
  }
  const ksMean = ksSum / KM_BANDS;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const mx = Math.max(r, g, b);
  const sat = mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
  // Character heuristics — pinned constants, directions in the header.
  const rho = 0.35 + 0.85 * (1 - lum);
  const omega = clamp01(0.15 + 0.65 * (ksMean / (ksMean + 1.5)));
  const gamma = clamp01(0.1 + 0.6 * (1 - sat) * (1 - Math.abs(lum - 0.45)));
  return { K, S, rho, omega, gamma };
}

const kmCache = new Map();
const KM_CACHE_QUANTUM = 512;

/**
 * The cached derivation (the issue's contract: computed once per colour).
 * Returns the SAME frozen object for the same quantized colour, on
 * every path — field code relies on that identity. The numeric form is
 * the hot path (the field's transfer stage asks per occupied cell);
 * it shares the one cache, allocating nothing on a hit.
 */
export function kmConstantsForRgb(r, g, b) {
  const cr = clamp01(Number(r));
  const cg = clamp01(Number(g));
  const cb = clamp01(Number(b));
  const key =
    (Math.round(cr * KM_CACHE_QUANTUM) << 20) |
    (Math.round(cg * KM_CACHE_QUANTUM) << 10) |
    Math.round(cb * KM_CACHE_QUANTUM);
  let hit = kmCache.get(key);
  if (!hit) {
    hit = Object.freeze(deriveKM([cr, cg, cb]));
    kmCache.set(key, hit);
  }
  return hit;
}

/** Array form of kmConstantsForRgb. */
export function kmConstantsForColor(rgb) {
  const [r, g, b] = sanitizeRgb(rgb);
  return kmConstantsForRgb(r, g, b);
}

/** Test/diagnostic surface: how many colours the cache has derived. */
export function kmCacheSize() {
  return kmCache.size;
}

function coth(x) {
  if (x > 20) return 1;
  if (x < 0.01) return 1 / x + x / 3; // series — the limit the formula needs
  const e = Math.exp(2 * x);
  return (e + 1) / (e - 1);
}

/**
 * Step 3: a mixture's reflectance spectrum. `entries` is a list of
 * { K, S, c } — KM constants (from deriveKM / kmConstantsForColor) at
 * concentration c. Concentrations are in the field's density units;
 * KM_THICKNESS converts total concentration to layer thickness.
 * Zero total concentration reflects the paper (all ones) exactly.
 */
export function mixtureSpectrum(entries, thickness = KM_THICKNESS) {
  const out = new Float32Array(KM_BANDS);
  let total = 0;
  for (const e of entries) total += Math.max(0, Number(e.c) || 0);
  if (!(total > 0)) {
    out.fill(1);
    return out;
  }
  for (let band = 0; band < KM_BANDS; band++) {
    let Km = 0;
    let Sm = 0;
    for (const e of entries) {
      const c = Math.max(0, Number(e.c) || 0);
      if (c === 0) continue;
      Km += c * e.K[band];
      Sm += c * e.S[band];
    }
    Km /= total;
    Sm /= total;
    if (!(Sm > 0)) {
      out[band] = Km > 0 ? 0 : 1;
      continue;
    }
    const a = 1 + Km / Sm;
    const bb = Math.sqrt(Math.max(0, a * a - 1));
    const bSX = bb * Sm * total * thickness;
    if (bSX < 1e-9) {
      out[band] = 1; // no layer over the paper: the paper, exactly
      continue;
    }
    const ct = coth(bSX);
    // Finite layer over a backing of Rg = 1 (the paper):
    // R = (1 − Rg(a − b·coth bSX)) / (a − Rg + b·coth bSX)
    const R = (1 - (a - bb * ct)) / (a - 1 + bb * ct);
    out[band] = Math.min(1, Math.max(0, R));
  }
  return out;
}

/** A mixture's reflectance as an sRGB triple. Entries as mixtureSpectrum. */
export function mixtureReflectanceRgb(entries, thickness = KM_THICKNESS) {
  return spectrumToRgb(mixtureSpectrum(entries, thickness));
}

/**
 * The convenience the field and tests speak: mix COLOURS at
 * concentrations — [{ rgb, c }] — through their derived constants.
 */
export function mixColorsRgb(pairs, thickness = KM_THICKNESS) {
  const entries = (pairs || []).map((p) => {
    const km = kmConstantsForColor(p.rgb);
    return { K: km.K, S: km.S, c: p.c };
  });
  return mixtureReflectanceRgb(entries, thickness);
}

/**
 * The colour a mixture WEARS at full strength — the R∞ colour of the
 * mixed spectrum. The field stores this when pigments blend in a cell:
 * the mixture's identity as a pigment, independent of how much of it
 * the cell currently holds (density rides separately, in alpha).
 */
export function mixturePigmentColor(pairs) {
  const entries = (pairs || []).map((p) => {
    const km = kmConstantsForColor(p.rgb);
    return { K: km.K, S: km.S, c: p.c };
  });
  let total = 0;
  for (const e of entries) total += Math.max(0, Number(e.c) || 0);
  if (!(total > 0)) return null;
  const spec = new Float32Array(KM_BANDS);
  for (let band = 0; band < KM_BANDS; band++) {
    let Km = 0;
    let Sm = 0;
    for (const e of entries) {
      const c = Math.max(0, Number(e.c) || 0);
      if (c === 0) continue;
      Km += c * e.K[band];
      Sm += c * e.S[band];
    }
    Km /= total;
    Sm /= total;
    const ks = Sm > 0 ? Km / Sm : 0;
    spec[band] = 1 + ks - Math.sqrt(ks * ks + 2 * ks); // R∞ closed form
  }
  return spectrumToRgb(spec);
}
