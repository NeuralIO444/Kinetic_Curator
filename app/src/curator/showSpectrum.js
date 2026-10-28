// showSpectrum.js — #1483 stage 2: the live spectrum, boiled down to three 0..1 numbers for the personas' `show` block.
//   centroid  where the energy sits (dark -> bright), flux  how much it is moving, flatness  noise (1) vs one tone (0).
// Pure: no clock, no randomness. Reads the spectrum state, never writes it.
//
// The show block is sampled once a bar, so `flux` there is the BAR's movement — how far the smoothed spectrum travelled
// since the last bar (createShowSpectrum) — not the core's per-frame fluxTotal, which one sample a bar would catch on a
// random frame (an onset or not). That bar-to-bar change is what LOIS reads when she judges a held show.
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const r3 = (v) => Math.round(v * 1000) / 1000;
const EPS = 1e-6;
const SILENT_RMS = 0.002;

/** @param state the spectrum core's state { smooth, rms, centroid, fluxTotal } @returns {centroid,flux,flatness}|null */
export function spectrumSummary(state) {
  if (!state) return null;
  const s = state.smooth;
  if (!s || typeof s.length !== 'number' || s.length < 1) return null;
  const rms = state.rms;
  if (!Number.isFinite(rms) || rms < SILENT_RMS) return null;
  let logSum = 0;
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const x = s[i] + EPS;
    logSum += Math.log(x);
    sum += x;
  }
  const geo = Math.exp(logSum / s.length);
  const arith = sum / s.length;
  const flat = arith > 0 ? geo / arith : 0;
  const c = Number.isFinite(state.centroid) ? state.centroid : 0;
  const f = Number.isFinite(state.fluxTotal) ? state.fluxTotal : 0;
  return {
    centroid: r3(clamp01(c)),
    flux: r3(clamp01(f)),
    flatness: r3(clamp01(Number.isFinite(flat) ? flat : 0)),
  };
}

/** Mean bar-to-bar change of the smoothed levels (0..1 each) that reads as full movement (flux 1). A first value. */
export const FLUX_FULL = 0.2;

/**
 * The per-bar reader the trio samples: spectrumSummary's centroid and flatness, with `flux` the mean absolute change of
 * the smoothed spectrum since the previous sample, over FLUX_FULL, clamped. The first sample after silence (or ever) has
 * no bar to compare with and returns null, so the show block carries no spectrum that bar rather than a made-up 0.
 */
export function createShowSpectrum() {
  let prev = null;
  return {
    sample(state) {
      const sum = spectrumSummary(state);
      if (!sum) {
        prev = null;
        return null;
      }
      const cur = Float32Array.from(state.smooth, (v) => (Number.isFinite(v) ? v : 0));
      const last = prev;
      prev = cur;
      if (!last || last.length !== cur.length) return null;
      let d = 0;
      for (let i = 0; i < cur.length; i++) d += Math.abs(cur[i] - last[i]);
      return { ...sum, flux: r3(clamp01(d / cur.length / FLUX_FULL)) };
    },
    reset() {
      prev = null;
    },
  };
}
