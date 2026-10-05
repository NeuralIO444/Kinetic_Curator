// paletteWing.mjs — pure import/export plumbing for the palette wing (#953).
// The store already owns persistence (paletteLibrarySlice: sanitizePalette,
// localStorage). This module owns the standalone file format and nothing else:
//
//   export: { name, colors: [...hex], meta: { bg, ink, swatches, source, version } }
//   import: accepts the export shape, an array of export shapes, or the raw
//           stored user-palette shape — everything funnels through
//           sanitizePalette, so a hostile file can't smuggle junk into state.
import { sanitizePalette } from '../state/slices/paletteLibrarySlice.js';

export const PALETTE_EXPORT_VERSION = 1;

/**
 * Build the standalone file object for a resolved palette.
 * `name` is the wing's name field (first-class); falls back to the palette name.
 */
export function paletteToExportJson(palette, name) {
  const nm = typeof name === 'string' && name.trim()
    ? name.trim().slice(0, 40)
    : (palette?.name || 'UNTITLED');
  return {
    name: nm,
    colors: [...(palette?.swatches || [])],
    meta: {
      bg: palette?.bg || '#0a0a0a',
      ink: palette?.ink || '#f0f0e8',
      swatches: (palette?.swatches || []).length,
      source: 'kinetic-curator',
      version: PALETTE_EXPORT_VERSION,
    },
  };
}

/** Map one unknown object to the stored user-palette shape (or null). */
function toStoredShape(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw.colors)) {
    return {
      id: raw.id,
      name: raw.name,
      bg: raw.meta?.bg,
      ink: raw.meta?.ink,
      swatches: raw.colors,
    };
  }
  return raw; // already stored shape — sanitizePalette decides
}

/**
 * Parse imported file text into sanitized user palettes.
 * Returns [] for anything unusable — never throws.
 */
export function parseImportPalettes(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map(toStoredShape).map(sanitizePalette).filter(Boolean);
}

/** Random '#rrggbb' seed for the harmony generator (UI-side; not sim). */
export function randomSeedHex(rng = Math.random) {
  const n = Math.floor(rng() * 0x1000000);
  return `#${n.toString(16).padStart(6, '0')}`;
}
