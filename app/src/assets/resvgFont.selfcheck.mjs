// resvgFont.selfcheck.mjs — #1950: every Node raster of an asset uses ONE bundled font, so the region bake (and the GL
// atlas) read the same pixels on every machine. Main went red when the CI runner's system monospace changed under the
// seventeen <text> stamps; these checks pin the fix.
//
//   font       the bundled file is present and renders the text stamps' glyphs (ink, not blank)
//   isolation  the pinned raster ignores the machine's fonts: the same pixels with or without a decoy font offered
//   wired      the bake, the GL atlas and its region partition construct resvg with the pinned font (source guard)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { RESVG_FONT, RESVG_FONT_FAMILY } from './resvgFont.mjs';
import { canonicalSvg } from './regionBake.mjs';
import { ASSETS } from '../data/assets/index.js';

const textStamps = ASSETS.filter((a) => /<text\b/.test(a.svg));
const ink = (opts) => (svg) => {
  const px = new Resvg(canonicalSvg(svg), opts).render().pixels;
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 24) n++;
  return { n, px: Buffer.from(px) };
};

assert.ok(existsSync(RESVG_FONT.fontFiles[0]), 'the bundled font file is in the repo');
assert.equal(RESVG_FONT.loadSystemFonts, false, 'no system fonts');
assert.ok(textStamps.length >= 10, `fixture: the library has text stamps (${textStamps.length})`);
for (const a of textStamps) {
  // the glyph changes the picture (ink over a plate counts the same pixels, so compare the pixels themselves)
  const withText = ink({ font: RESVG_FONT })(a.svg).px;
  const noText = ink({ font: RESVG_FONT })(a.svg.replace(/<text\b[\s\S]*?<\/text>/g, '')).px;
  assert.ok(!withText.equals(noText), `${a.id}: its glyph renders with the pinned font`);
}
console.log('  [ok] font: the bundled font renders every text stamp’s glyph');

// a decoy font offered alongside must not change a pixel: only the pinned family is ever resolved
const decoys = [
  '/usr/share/texmf/fonts/opentype/public/lm/lmmono10-regular.otf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
].filter(existsSync);
for (const a of textStamps.slice(0, 6)) {
  const pinned = ink({ font: RESVG_FONT })(a.svg).px;
  const offered = ink({ font: { ...RESVG_FONT, fontFiles: [...decoys, ...RESVG_FONT.fontFiles] } })(a.svg).px;
  assert.ok(pinned.equals(offered), `${a.id}: identical with a decoy font offered`);
}
assert.equal(RESVG_FONT.defaultFontFamily, RESVG_FONT_FAMILY);
console.log(`  [ok] isolation: the pinned raster ignores other fonts (${decoys.length} decoys offered)`);

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
assert.match(src('./regionBake.mjs'), /new Resvg\(canonicalSvg\(svg\), \{ font: RESVG_FONT \}\)/, 'the bake');
const atlas = src('../gl/atlas.mjs');
assert.equal(
  (atlas.match(/new Resvg\(/g) || []).length,
  (atlas.match(/\{ font: RESVG_FONT \}/g) || []).length,
  'the atlas',
);
console.log('  [ok] wired: the bake and the GL atlas raster with the pinned font');
console.log('resvgFont.selfcheck: 3 checks passed');
