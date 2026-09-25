// The palette-import toast text (#601). Pure so a selfcheck covers it without the panel.
import { sanitizePalette } from '../../state/slices/paletteLibrarySlice.js';

/**
 * Report what the import will actually store, not what the file contained.
 * `importUserPalettes` runs every entry through `sanitizePalette` and then dedupes
 * by `id` (later entry wins), so the honest count is the number of DISTINCT ids
 * among the entries that survive sanitize. An all-junk file must warn, never
 * toast success.
 */
export function paletteImportMessage(list) {
  const valid = (Array.isArray(list) ? list : [list]).map(sanitizePalette).filter(Boolean);
  const stored = new Set(valid.map((p) => p.id)).size;
  return stored === 0
    ? 'No valid palettes in file'
    : `Imported ${stored} palette${stored === 1 ? '' : 's'}`;
}
