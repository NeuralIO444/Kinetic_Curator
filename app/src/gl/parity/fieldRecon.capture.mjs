// node src/gl/parity/fieldRecon.capture.mjs [outDir] — #2182 WS3: the side-by-side capture.
// Renders the committed calibration field (two magnets, 600 steps, seedKey 1234567) through the real WebGL2
// renderer with the field body's density read at the cell (legacy), bilinear and bicubic, at matched seeds, and
// writes fieldRecon-{cell,bilinear,bicubic}.png plus a side-by-side montage and a 2.5x crop of the pooled region.
// Prints a sha256 of each render, so "mode 0 is byte-identical to main" is checkable by running this on both.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { buildSceneContract } from '../sceneContract.js';
import { createFluid, stepFluid, fluidDensity, sanitizeMagnets } from '../../engine/dishFluid.mjs';
import { fieldBodyScaleBase } from '../../engine/dishFluidChannel.mjs';
import { openHarnessPage, buildRenderPayload, evaluateChunked, closeGlDriver } from './glDriver.mjs';

const outDir = process.argv[2] || '/tmp/fieldRecon';
fs.mkdirSync(outDir, { recursive: true });
const W = 960;
const H = 660;

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const magnets = sanitizeMagnets([
  { x: 0.5, y: 0.5 },
  { x: 0.25, y: 0.3 },
]);
const fluid = createFluid({ cols: 96, rows: 54, seedKey: 1234567, magnets });
for (let i = 0; i < 600; i++) stepFluid(fluid, { magnets });
const density = fluidDensity(fluid);
const desc = {
  layerId: 'L1',
  poolIds: [
    'org_blob_01',
    'geo_circle_01',
    'mrk_dots_01',
    'mrk_ring_01',
    'geo_star5_01',
    'flora_flower_01',
    'line_squiggle_01',
    'rad_rings_01',
    'dot_field_01',
    'stamp_glyph_01',
    'hae_diatom_01',
    'pxg_cross',
  ],
  ink: '#f0f0e8',
  seedKey: 1234567,
  budget: 8192,
  scaleBase: fieldBodyScaleBase(W, H),
  aspectHW: H / W,
};
const contract = buildSceneContract({
  doc: { seed: 7, layers: [{ id: 'L1', type: 'content' }], fieldBody: desc },
  resolvedLayers: [{ id: 'L1', type: 'content', items: [] }],
  caps: null,
  accum: null,
});

const { page, close } = await openHarnessPage('/parity/glHarness.html');
const shots = {};
for (const [name, mode] of [
  ['cell', 0],
  ['bilinear', 1],
  ['bicubic', 2],
]) {
  await page.evaluate((m) => {
    window.__kcFieldRecon = m;
  }, mode);
  const payload = buildRenderPayload(contract, {
    width: W,
    height: H,
    bg: '#0a0a0a',
    fieldBody: { density, blocked: null, step: 600 },
  });
  const res = await evaluateChunked(page, '__kcRender', payload);
  const px = new Uint8Array(Buffer.from(res.pixelsB64, 'base64'));
  shots[name] = px;
  fs.writeFileSync(path.join(outDir, `fieldRecon-${name}.png`), png(px, res.width, res.height));
  console.log(
    name.padEnd(9),
    crypto.createHash('sha256').update(px).digest('hex').slice(0, 16),
    `${res.width}x${res.height}`,
  );
}
// montage: three crops of the pooled region (around the centre magnet), each upscaled 2x nearest, side by side
const cw = 300;
const ch = 220;
const x0 = Math.floor(W / 2 - cw / 2);
const y0 = Math.floor(H / 2 - ch / 2);
const S = 2;
const mw = cw * S * 3 + 8 * 2;
const mh = ch * S;
const mont = new Uint8Array(mw * mh * 4).fill(16);
for (let k = 0; k < 3; k++) {
  const src = shots[['cell', 'bilinear', 'bicubic'][k]];
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < cw * S; x++) {
      const sx = x0 + Math.floor(x / S);
      const sy = y0 + Math.floor(y / S);
      const di = (y * mw + k * (cw * S + 8) + x) * 4;
      const si = (sy * W + sx) * 4;
      mont[di] = src[si];
      mont[di + 1] = src[si + 1];
      mont[di + 2] = src[si + 2];
      mont[di + 3] = 255;
    }
  }
}
fs.writeFileSync(path.join(outDir, 'fieldRecon-montage.png'), png(mont, mw, mh));
await close();
await closeGlDriver();
console.log('wrote', outDir);
