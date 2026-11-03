// assets/resvgFont.mjs — #1950: the ONE font every Node raster of an asset uses.
//
// Seventeen library stamps draw a glyph with <text font-family="ui-monospace,monospace">. Left to resvg's defaults,
// Node rasterizes them with whatever system monospace the machine has — so the committed region bake
// (data/assets/regions.generated.js) was only reproducible on machines that happened to share a font, and a CI runner
// image update (ubuntu 20261025 → 20261101) turned main red. Every Node asset raster now loads exactly this bundled
// font and no system fonts: the bake, the GL atlas and the region partition read identical pixels on every machine.
// (The browser renders text with the viewer's own font, as it always has; the live baker folds raster drift into the
// committed records — assets/regionPartition.js partitionFromDetection.)
import { fileURLToPath } from 'node:url';

export const RESVG_FONT_FAMILY = 'DejaVu Sans Mono';
const FONT_FILE = fileURLToPath(new URL('./fonts/DejaVuSansMono-Bold.ttf', import.meta.url));

/** resvg-js `font` options: the bundled font only, every generic family mapped to it. */
export const RESVG_FONT = Object.freeze({
  fontFiles: [FONT_FILE],
  loadSystemFonts: false,
  defaultFontFamily: RESVG_FONT_FAMILY,
  monospaceFamily: RESVG_FONT_FAMILY,
  sansSerifFamily: RESVG_FONT_FAMILY,
  serifFamily: RESVG_FONT_FAMILY,
});
