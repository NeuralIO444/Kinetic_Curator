/**
 * Glyph atlas baker — Phase 1 (#187). Node-only (uses resvg).
 *
 * Renders the codepoints a project needs into a packed atlas and lays out
 * text runs as positioned quads. This is the subsystem that replaces the
 * SVG <text> path: instead of DOM text nodes, the GL backend draws glyph
 * quads from this atlas.
 *
 * Font note: resvg resolves fonts from the `fontFamily`/`fontFile` options
 * below. In CI there are no system fonts (which is why the parity corpus
 * excludes text-bearing assets), so both the reference and the candidate
 * would render .notdef boxes identically — parity-safe, but not useful
 * text. Ship a real font file (fontFile) before using this for export.
 *
 * The contract's `textRuns` field is reserved for Phase 1; each run is:
 *   { x, y, size, text, color, opacity, font, align }
 * with x/y/size in canvas units (y-down), `font` a CSS font-family string,
 * and align 'left'|'center'|'right'. Additive — no contract version bump.
 */

import { Resvg } from '@resvg/resvg-js';

export const GLYPH_PX = 64; // bake resolution per em
const PAD = 2;

/**
 * @param {string} text all codepoints to bake
 * @param {object} [opts] { fontFamily, fontFile (path), px }
 * @returns {{pixels: Buffer, width: number, height: number,
 *   glyphs: Map<string, {u0,v0,u1,v1, w,h, adv}>}}
 *   w/h/adv in em units; uv rects into the atlas (top-first, no flip).
 */
export function bakeGlyphAtlas(text, opts = {}) {
  const px = opts.px || GLYPH_PX;
  const family = opts.fontFamily || 'sans-serif';
  const chars = [...new Set([...String(text)])].filter((c) => c.trim() !== '');
  const fontOpt = {};
  if (opts.fontFile) fontOpt.fontFiles = [opts.fontFile];

  const cells = [];
  for (const ch of chars) {
    // Measure with a large canvas, then crop to ink.
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${px * 2}" height="${px * 2}">` +
      `<text x="${px}" y="${px * 1.2}" font-family="${family}" font-size="${px}" fill="#fff">${escapeXml(ch)}</text></svg>`;
    const img = new Resvg(svg, { font: { loadSystemFonts: !opts.fontFile, ...fontOpt } }).render();
    const dw = img.width, dh = img.height, d = img.pixels;
    let x0 = dw, y0 = dh, x1 = -1, y1 = -1;
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        if (d[(y * dw + x) * 4 + 3] > 4) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) { cells.push({ ch, empty: true }); continue; }
    const cw = x1 - x0 + 1 + PAD * 2, chh = y1 - y0 + 1 + PAD * 2;
    const crop = Buffer.alloc(cw * chh * 4);
    for (let y = 0; y < chh - PAD * 2; y++) {
      Buffer.from(d.buffer, d.byteOffset + ((y0 + y) * dw + x0) * 4, (x1 - x0 + 1) * 4)
        .copy(crop, ((y + PAD) * cw + PAD) * 4);
    }
    // Advance: resvg doesn't expose metrics; approximate from the ink right
    // edge plus a space. Refine when real font metrics land (Phase 5 export).
    cells.push({ ch, crop, cw, chh, adv: (x1 - x0 + 1 + px * 0.18) / px });
  }

  const cols = Math.max(1, Math.ceil(Math.sqrt(cells.filter((c) => !c.empty).length)));
  const cellW = px + PAD * 2, cellH = px + PAD * 2;
  const solid = cells.filter((c) => !c.empty);
  const rows = Math.max(1, Math.ceil(solid.length / cols));
  const width = cols * cellW, height = rows * cellH;
  const pixels = Buffer.alloc(width * height * 4, 0);
  const glyphs = new Map();
  solid.forEach((c, i) => {
    const cx = (i % cols) * cellW, cy = Math.floor(i / cols) * cellH;
    const ox = cx + Math.floor((cellW - c.cw) / 2), oy = cy + Math.floor((cellH - c.chh) / 2);
    for (let y = 0; y < c.chh; y++) {
      c.crop.copy(pixels, ((oy + y) * width + ox) * 4, y * c.cw * 4, (y + 1) * c.cw * 4);
    }
    glyphs.set(c.ch, {
      u0: ox / width, v0: oy / height, u1: (ox + c.cw) / width, v1: (oy + c.chh) / height,
      w: c.cw / px, h: c.chh / px, adv: c.adv,
    });
  });
  for (const c of cells) if (c.empty) glyphs.set(c.ch, { u0: 0, v0: 0, u1: 0, v1: 0, w: 0, h: 0, adv: 0.3 });
  return { pixels, width, height, glyphs };
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Lay out a text run into positioned quads (canvas units, y-down).
 * @param {object} run { x, y, size, text, color, opacity, align }
 * @param {Map} glyphs from bakeGlyphAtlas
 * @returns {Array<{x,y,w,h, u0,v0,u1,v1, color, opacity}>} quads, x/y = top-left
 */
export function layoutTextRun(run, glyphs) {
  const size = Number(run.size) || 24;
  const chars = [...String(run.text || '')];
  const advs = chars.map((ch) => (glyphs.get(ch) || { adv: 0.3 }).adv * size);
  const total = advs.reduce((a, b) => a + b, 0);
  let x = Number(run.x) || 0;
  if (run.align === 'center') x -= total / 2;
  else if (run.align === 'right') x -= total;
  const y = Number(run.y) || 0;
  const out = [];
  chars.forEach((ch, i) => {
    const g = glyphs.get(ch);
    if (g && g.w > 0) {
      out.push({
        x, y: y - g.h * size * 0.8, w: g.w * size, h: g.h * size,
        u0: g.u0, v0: g.v0, u1: g.u1, v1: g.v1,
        color: run.color || '#ffffff', opacity: run.opacity ?? 1,
      });
    }
    x += advs[i];
  });
  return out;
}
