// stageTestPattern.mjs — #607 STAGE Phase B.
// Pure layout for the stage test pattern: SMPTE-style bars up top, a
// grayscale/pluge strip below, geometry the StageView draws verbatim.

/** The seven bars, left to right, as CSS colors. */
export const TEST_PATTERN_BARS = [
  '#c0c0c0', // gray
  '#c0c000', // yellow
  '#00c0c0', // cyan
  '#00c000', // green
  '#c000c0', // magenta
  '#c00000', // red
  '#0000c0', // blue
];

/** Grayscale steps for the lower strip, with pluge blacks at the edges. */
export const TEST_PATTERN_GRAYSCALE = ['#0a0a0a', '#1a1a1a', '#404040', '#808080', '#c0c0c0', '#ffffff'];

/**
 * Bar rects for a W×H stage. Bars take the top ~67%, the grayscale strip
 * the bottom ~33%. Never throws; degenerate sizes collapse to empty.
 * @returns {{bars: Array<{x,y,w,h,color}>, strip: Array<{x,y,w,h,color}>}}
 */
export function testPatternLayout(w, h) {
  const W = Math.max(0, Math.floor(Number(w) || 0));
  const H = Math.max(0, Math.floor(Number(h) || 0));
  if (W < 1 || H < 1) return { bars: [], strip: [] };
  const barH = Math.floor(H * 0.67);
  const bars = TEST_PATTERN_BARS.map((color, i) => ({
    x: Math.floor((W * i) / TEST_PATTERN_BARS.length),
    y: 0,
    w: Math.ceil(W / TEST_PATTERN_BARS.length),
    h: barH,
    color,
  }));
  const stripY = barH;
  const stripH = H - barH;
  const strip = TEST_PATTERN_GRAYSCALE.map((color, i) => ({
    x: Math.floor((W * i) / TEST_PATTERN_GRAYSCALE.length),
    y: stripY,
    w: Math.ceil(W / TEST_PATTERN_GRAYSCALE.length),
    h: stripH,
    color,
  }));
  return { bars, strip };
}
