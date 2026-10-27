// spectrumMarks.mjs — #1482 P3: the dials -> the renderer's `spectrum` contract key. Pure. Returns null when the marks
// are off (all three amounts 0, or the governor has made its first cut), so the key is absent and the frame, and its
// hash, are exactly what they were. The texture bytes are the live spectrum packed into the renderer's 256 x 4 rows.
import { readSpectrum } from './spectrumLive.mjs';
import { packSpectrumTexture, TEX_W, TEX_H } from './spectrumCore.mjs';

/** The four things a mark can listen by, in the order the shader's `map` takes them. */
export const SPECTRUM_MAPS = Object.freeze(['INDEX', 'ANGLE', 'POSITION', 'HASH']);

const bytes = new Uint8Array(TEX_W * TEX_H);
const unit = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
};

/**
 * @param layoutParams  spectrumMap (0..3) and spectrumScale / spectrumDisplace / spectrumColour (0..1)
 * @param shed          the governor's first cut (perfTier1): the marks go quiet before anything else is touched
 * @param state         the spectrum state (default: the live one); reused buffer, so read it before the next frame
 */
export function spectrumMarksFor(layoutParams, shed = false, state = readSpectrum()) {
  if (shed || !layoutParams) return null;
  const scale = unit(layoutParams.spectrumScale);
  const displace = unit(layoutParams.spectrumDisplace);
  const colour = unit(layoutParams.spectrumColour);
  if (!(scale + displace + colour > 0)) return null;
  const m = Math.round(Number(layoutParams.spectrumMap));
  const map = Number.isFinite(m) ? Math.min(SPECTRUM_MAPS.length - 1, Math.max(0, m)) : 0;
  return { map, scale, displace, colour, tex: packSpectrumTexture(state, bytes) };
}
