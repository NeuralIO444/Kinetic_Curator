// #706 — shape size tracks luminance. Dark cell = big shape. Light cell = none.

export function shapeRadius(luma, cell) {
  const L = Math.min(1, Math.max(0, Number(luma) || 0));
  const size = Math.max(1, Number(cell) || 1);
  return (1 - L) * size * 0.5;
}
