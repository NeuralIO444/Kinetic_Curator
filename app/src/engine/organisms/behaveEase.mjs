// #722 — behave pills ease steering over ~1s. No canvas dissolve.
import { morphEase } from '../../gl/paletteMix.mjs';

export const BEHAVE_EASE_MS = 1000;

export function blendBehave(from, to, t) {
  const e = morphEase(Math.min(1, Math.max(0, t)));
  const keys = new Set([...Object.keys(from || {}), ...Object.keys(to || {})]);
  const out = { ...to };
  for (const k of keys) {
    const a = from?.[k];
    const b = to?.[k];
    if (typeof b === 'number') out[k] = (typeof a === 'number' ? a : 0) + (b - (typeof a === 'number' ? a : 0)) * e;
  }
  return out;
}
