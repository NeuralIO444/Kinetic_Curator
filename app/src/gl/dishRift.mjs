// dishRift.mjs — #1183 rift slice 1: the connection between an FX layer's TEAR and the marks below it.
//
// Mirrors gl/dishWeather.mjs. For a content layer whose RIFT dial is above 0 and that has an FX layer ABOVE
// it carrying a tear (amount > 0), riftArgs() returns { rift: { bands, amount, strength, W, H } }, which
// buildPlacements shears the marks with; for every other layer it returns the same frozen empty object, so
// nothing is passed and the frame is byte-identical. liveResolve.mjs (a one-writer file) takes only the call
// site; the maths lives in engine/riftShear.mjs.
//
// The dial lives at layoutParams.riftShear and is NOT in DEFAULT_LAYOUT_PARAMS (the spectrumWarp precedent):
// a document that never touched it carries no key, so every hash and golden is unchanged by construction.
//
// Which FX layer is a layer's rift: the NEAREST visible FX layer above it whose sanitized effects include a
// tear with amount > 0 (stack order is depth, as for the ground and the weather).
import { isFxLayer, sanitizeFxEffects } from '../fx/fxFilters.js';

const NONE = Object.freeze({});
const clamp01 = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0);

/** The layer-param key of the RIFT dial. */
export const RIFT_KEY = 'riftShear';

/**
 * The nearest FX layer above `layerId` (bottom -> top order) whose sanitized effects include a tear with
 * amount > 0: `{ layer, tear }` with the SANITIZED tear params, or null. Hidden FX layers are not rifts.
 */
export function nearestRiftAbove(layers, layerId) {
  if (!Array.isArray(layers)) return null;
  const at = layers.findIndex((l) => l && l.id === layerId);
  if (at < 0) return null;
  for (let i = at + 1; i < layers.length; i++) {
    const l = layers[i];
    if (!l || typeof l !== 'object' || !isFxLayer(l) || l.visible === false) continue;
    const tear = sanitizeFxEffects(l.effects).find((e) => e.kind === 'tear');
    if (tear && tear.params.amount > 0) return { layer: l, tear: tear.params };
  }
  return null;
}

/** Extra buildPlacements arguments for one content layer, or the frozen empty object when the dial is 0 or no tear is above. */
export function riftArgs({ layers, layerId, rift, W, H }) {
  const strength = clamp01(rift);
  if (!(strength > 0) || !(W > 0) || !(H > 0)) return NONE;
  const src = nearestRiftAbove(layers, layerId);
  if (!src) return NONE;
  return { rift: { bands: src.tear.bands, amount: src.tear.amount, strength, W, H } };
}
