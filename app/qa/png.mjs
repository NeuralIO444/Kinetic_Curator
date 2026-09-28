// #704 — a dependency-free PNG reader, so a QA scenario can measure what the
// canvas actually RENDERED rather than what its parameters claimed. Enough of
// the format for 8-bit screenshots: IHDR, inflate(IDAT), unfilter.
import { inflateSync } from 'node:zlib';
export function decodePng(buf) {
  let p = 8, w = 0, h = 0, bitDepth = 8, colorType = 6;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('bitDepth ' + bitDepth);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!ch) throw new Error('colorType ' + colorType);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++];
    const row = raw.subarray(rp, rp + stride); rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0, v = row[x];
      let r;
      if (f === 0) r = v; else if (f === 1) r = v + a; else if (f === 2) r = v + b;
      else if (f === 3) r = v + ((a + b) >> 1);
      else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
             r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[x] = r & 255;
    }
  }
  return { w, h, ch, data: out };
}
export function lumStats(png) {
  const { w, h, ch, data } = png;
  let sum = 0, dark = 0, bright = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const o = i * ch;
    const l = ch >= 3 ? (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255 : data[o] / 255;
    sum += l; if (l < 0.12) dark++; if (l > 0.75) bright++;
  }
  return { mean: +(sum / n).toFixed(4), darkShare: +(dark / n).toFixed(3), brightShare: +(bright / n).toFixed(3) };
}
