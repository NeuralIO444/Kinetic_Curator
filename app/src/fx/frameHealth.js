// frameHealth.js — is this frame alive? (#1107)
//
// A roll can land a washed-out or black picture that no static rule predicts (pale marks on a pale ground, many
// translucent layers): only the frame itself says. "Ink" is everything noticeably different from the background
// (the most common colour). A dead frame has almost no ink, or ink within a hair of the background's brightness
// (pale on pale, dark on dark). The same measure the rollSafety selfcheck uses on 36 seeded rolls.

/** Dead when less than 1% of the frame is ink, or the ink sits within 0.15 of the background's luma. */
export const DEAD_COVERAGE = 0.01;
export const DEAD_LUMA_GAP = 0.15;

/** @param {Uint8ClampedArray|Uint8Array} px RGBA bytes  @returns {{coverage:number, lumaGap:number}} */
export function frameHealth(px) {
  const total = px.length / 4;
  if (!total) return { coverage: 0, lumaGap: 0 };
  const h = new Map();
  for (let i = 0; i < px.length; i += 4) { const k = (px[i] >> 3) * 1024 + (px[i + 1] >> 3) * 32 + (px[i + 2] >> 3); h.set(k, (h.get(k) || 0) + 1); }
  let bk = 0; let best = -1;
  for (const [k, c] of h) if (c > best) { best = c; bk = k; }
  const br = ((bk >> 10) << 3) + 4; const bgc = (((bk >> 5) & 31) << 3) + 4; const bb = ((bk & 31) << 3) + 4;
  const bl = (0.2126 * br + 0.7152 * bgc + 0.0722 * bb) / 255;
  let n = 0; let gap = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (Math.abs(px[i] - br) + Math.abs(px[i + 1] - bgc) + Math.abs(px[i + 2] - bb) <= 36) continue;
    n += 1; gap += Math.abs((0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255 - bl);
  }
  return { coverage: n / total, lumaGap: n ? gap / n : 0 };
}

export const isDeadFrame = (h) => !h || !(h.coverage >= DEAD_COVERAGE) || !(h.lumaGap >= DEAD_LUMA_GAP);
