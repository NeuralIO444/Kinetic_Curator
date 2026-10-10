export const FEED_OPS = Object.freeze(['grad', 'curl']);
export const FEED_OP_DEFAULT = 'curl';

function gridAt(luma, w, h, x, y) {
  const xx = Math.max(0, Math.min(w - 1, x));
  const yy = Math.max(0, Math.min(h - 1, y));
  return luma[yy * w + xx] || 0;
}

function diffs(luma, w, h, x, y) {
  const dx = (gridAt(luma, w, h, x + 1, y) - gridAt(luma, w, h, x - 1, y)) * 0.5;
  const dy = (gridAt(luma, w, h, x, y + 1) - gridAt(luma, w, h, x, y - 1)) * 0.5;
  return { dx, dy };
}

export function lumaToGrad(luma, w, h) {
  const width = w | 0;
  const height = h | 0;
  const flow = new Float32Array(width * height * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { dx, dy } = diffs(luma, width, height, x, y);
      const i = (y * width + x) * 2;
      flow[i] = dx;
      flow[i + 1] = dy;
    }
  }
  return { flow, w: width, h: height, op: 'grad' };
}

export function lumaToCurl(luma, w, h) {
  const width = w | 0;
  const height = h | 0;
  const flow = new Float32Array(width * height * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { dx, dy } = diffs(luma, width, height, x, y);
      const i = (y * width + x) * 2;
      flow[i] = dy;
      flow[i + 1] = -dx;
    }
  }
  return { flow, w: width, h: height, op: 'curl' };
}

export function lumaToFlow(luma, w, h, op = FEED_OP_DEFAULT) {
  return op === 'grad' ? lumaToGrad(luma, w, h) : lumaToCurl(luma, w, h);
}

// #1308 — column-writing mode of the luma→flow encoder: the SoA successor
// to lumaToFlow's allocate-an-interleaved-array behavior. Encodes into the
// caller-owned u/v column pair (Struct-of-Arrays: u and v are separate
// columns, not interleaved lanes) and never allocates — the delay path's
// double-buffered front/back pairs are written here, then swapped.
// Bit-identical to lumaToFlow: same central differences, same float32
// stores, only deinterleaved. uOut/vOut must have length >= w*h; every
// lane is written (full overwrite — the acquire-contract-safe pattern).
export function lumaToGradInto(luma, w, h, uOut, vOut) {
  const width = w | 0;
  const height = h | 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { dx, dy } = diffs(luma, width, height, x, y);
      const i = y * width + x;
      uOut[i] = dx;
      vOut[i] = dy;
    }
  }
  return { u: uOut, v: vOut, w: width, h: height, op: 'grad' };
}

export function lumaToCurlInto(luma, w, h, uOut, vOut) {
  const width = w | 0;
  const height = h | 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { dx, dy } = diffs(luma, width, height, x, y);
      const i = y * width + x;
      uOut[i] = dy;
      vOut[i] = -dx;
    }
  }
  return { u: uOut, v: vOut, w: width, h: height, op: 'curl' };
}

export function lumaToFlowInto(luma, w, h, uOut, vOut, op = FEED_OP_DEFAULT) {
  return op === 'grad'
    ? lumaToGradInto(luma, w, h, uOut, vOut)
    : lumaToCurlInto(luma, w, h, uOut, vOut);
}

export function fieldInvariants(field) {
  const w = field.w | 0;
  const h = field.h | 0;
  const f = field.flow;
  const u = (x, y) => f[(y * w + x) * 2] || 0;
  const v = (x, y) => f[(y * w + x) * 2 + 1] || 0;
  let div = 0;
  let curl = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const du_dx = (u(x + 1, y) - u(x - 1, y)) * 0.5;
      const dv_dy = (v(x, y + 1) - v(x, y - 1)) * 0.5;
      const dv_dx = (v(x + 1, y) - v(x - 1, y)) * 0.5;
      const du_dy = (u(x, y + 1) - u(x, y - 1)) * 0.5;
      div += Math.abs(du_dx + dv_dy);
      curl += Math.abs(dv_dx - du_dy);
      n++;
    }
  }
  return { meanAbsDiv: n ? div / n : 0, meanAbsCurl: n ? curl / n : 0, n };
}
