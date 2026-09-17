/**
 * png.mjs — Phase 5 (#191). Node-only.
 *
 * Minimal 8-bit RGBA PNG encoder that streams rows through zlib instead of
 * building the full filtered raw buffer first. An 8K readback is ~132MB of
 * RGBA; the naive (w*4+1)*h raw buffer would double that before deflate even
 * starts. Here peak memory is one RGBA copy (the caller's pixels) plus the
 * compressed output — no second full-res buffer, per #191's memory rule.
 *
 * Rows are filter type 0 (None): generative-art frames are already noisy
 * enough that adaptive filtering buys little and costs a second pass.
 */

import { createWriteStream } from 'node:fs';
import { createDeflate } from 'node:zlib';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const td = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const cd = Buffer.alloc(4); cd.writeUInt32BE(crc32(Buffer.concat([td, data])));
  return Buffer.concat([len, td, data, cd]);
}

function ihdr(w, h) {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(w, 0); b.writeUInt32BE(h, 4);
  b[8] = 8; b[9] = 6; // 8-bit, RGBA
  return chunk('IHDR', b);
}

/**
 * Write top-first RGBA pixels to a PNG file, streaming rows through deflate.
 * @param {string} path output path
 * @param {Buffer|Uint8Array} pixels w*h*4 bytes, top-first row order
 * @param {number} w width in px
 * @param {number} h height in px
 * @returns {Promise<void>}
 */
export function writePngFile(path, pixels, w, h) {
  return new Promise((resolve, reject) => {
    const px = Buffer.isBuffer(pixels) ? pixels : Buffer.from(pixels);
    if (px.length !== w * h * 4) {
      reject(new Error(`[png] pixel buffer is ${px.length} bytes, expected ${w * h * 4} for ${w}x${h}`));
      return;
    }
    const out = createWriteStream(path);
    out.on('error', reject);
    const deflate = createDeflate({ level: 6 });
    const idatParts = [];
    deflate.on('data', (c) => idatParts.push(c));
    deflate.on('error', (e) => { out.destroy(); reject(e); });
    deflate.on('end', () => {
      try {
        out.write(chunk('IDAT', Buffer.concat(idatParts)));
        out.write(chunk('IEND', Buffer.alloc(0)));
        out.end(() => resolve());
      } catch (e) {
        reject(e);
      }
    });
    out.write(PNG_SIG);
    out.write(ihdr(w, h));

    // One reusable row buffer; copy on write because deflate.write does not
    // synchronously consume the chunk. Backpressure on an 8K frame waits for
    // drain rather than queueing 4320 rows in the stream's buffer.
    const row = Buffer.alloc(w * 4 + 1);
    const rowBytes = w * 4;
    const drain = () => new Promise((r) => deflate.once('drain', r));
    (async () => {
      for (let y = 0; y < h; y++) {
        row[0] = 0; // filter type: None
        px.copy(row, 1, y * rowBytes, (y + 1) * rowBytes);
        if (!deflate.write(Buffer.from(row))) await drain();
      }
      deflate.end();
    })().catch((e) => {
      deflate.destroy();
      out.destroy();
      reject(e);
    });
  });
}
