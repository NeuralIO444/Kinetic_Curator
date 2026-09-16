// resvg/SVG2 has no plus-lighter; screen is the nearest supported mode (#96).
export const BLEND_FALLBACK = { 'plus-lighter': 'screen' };

const warned = new Set();

/** Map unsupported CSS blend modes for resvg. Warns once per mode per process. */
export function blend(mode) {
  if (!mode || mode === 'normal') return null;
  const mapped = BLEND_FALLBACK[mode];
  if (mapped) {
    if (!warned.has(mode)) {
      warned.add(mode);
      console.warn(
        `[studio] WARNING: blendMode "${mode}" is not in resvg; using "${mapped}" offline (#96)`,
      );
    }
    return mapped;
  }
  return mode;
}
