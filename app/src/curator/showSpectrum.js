// showSpectrum.js — #1483 stage 2: the live spectrum, boiled down to three 0..1 numbers for the personas' `show` block.
//   centroid  where the energy sits (dark -> bright), flux  how much it is moving, flatness  noise (1) vs one tone (0).
// Pure: no clock, no randomness. Reads the spectrum state, never writes it.
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
