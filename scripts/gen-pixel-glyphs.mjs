// Pixel glyph pack — #702. The grids live in
// app/src/data/assets/assets-pixel-glyphs.js (the catalog builds the rects).
// This script prints the contact sheet so a review can see the lattice
// without booting the app. Run: node scripts/gen-pixel-glyphs.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS_PIXEL } from '../app/src/data/assets/assets-pixel-glyphs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CELL = 8;
const cols = 8;
const tile = 20 + 7 * CELL;
const gap = 14;
const rows = Math.ceil(ASSETS_PIXEL.length / cols);
const W = 24 + cols * (tile + gap) - gap + 24;
const H = 36 + rows * (tile + 16 + gap);
const parts = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
  `<rect width="${W}" height="${H}" fill="#050505"/>`,
  `<text x="24" y="22" fill="#f0f0f0" font-family="ui-sans-serif,sans-serif" font-size="13">PXG ${ASSETS_PIXEL.length} stamps</text>`,
];
ASSETS_PIXEL.forEach((a, i) => {
  const c = i % cols;
  const r = Math.floor(i / cols);
  const ox = 24 + c * (tile + gap);
  const oy = 36 + r * (tile + 16 + gap);
  const body = a.svg
    .replaceAll('var(--ink)', '#f0f0f0')
    .replaceAll('var(--accent)', '#00e5ff')
    .replaceAll('width="10"', 'width="7"')
    .replaceAll('height="10"', 'height="7"')
    .replace(/x="(\d+)"/g, (_, n) => `x="${(Number(n) - 15) * 0.8}"`)
    .replace(/y="(\d+)"/g, (_, n) => `y="${(Number(n) - 15) * 0.8}"`);
  parts.push(`<g transform="translate(${ox + 10},${oy + 10})">${body}</g>`);
  parts.push(`<text x="${ox}" y="${oy + tile + 12}" fill="#969696" font-family="ui-sans-serif,sans-serif" font-size="10">${a.id.replace('pxg_', '')}</text>`);
});
parts.push('</svg>');
writeFileSync(join(root, 'docs/pxg-contact.svg'), parts.join('\n'));
console.log('wrote', ASSETS_PIXEL.length, 'stamps to docs/pxg-contact.svg');
