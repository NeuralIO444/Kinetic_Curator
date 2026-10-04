// hueAudio.mjs — apply the #790 color.hue route output to contract layers.
//
// The route output is in degrees; it rides on top of each layer's layout
// hueRotate, which the composite pass turns into the hueRotate uniform
// (#262). Per-frame colour/palette/tint changes would rebake the atlas, so
// hue ONLY ever modulates this uniform — never the palette or tints.
//
// 0 (no route in the table / default table) leaves the layers untouched, so
// today's render is bit-identical. Non-finite input is ignored: a NaN hue
// would poison the hue-rotation matrix for the whole frame.

/** Clamp a route hue output to finite degrees. Never trust the caller. */
export function sanitizeHueAudio(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(180, Math.max(-180, v));
}

/**
 * Add an audio hue offset (degrees) to every layer's layout.hueRotate.
 * Mutates the passed layer objects in place (like applyParallax); layers
 * without a layout are skipped. Returns the applied offset (0 = untouched).
 */
export function applyHueAudio(layers, hueDegrees) {
  const offset = sanitizeHueAudio(hueDegrees);
  if (offset === 0 || !Array.isArray(layers)) return 0;
  for (const layer of layers) {
    if (layer && layer.layout) {
      layer.layout.hueRotate = (Number(layer.layout.hueRotate) || 0) + offset;
    }
  }
  return offset;
}
