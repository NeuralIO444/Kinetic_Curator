// Constrained motif kit (#114). Live kernel never imports this until the modal opens.

/** Regular n-gon points (3–8 sides), centered on the 100×100 stage, radius 32. */
export function polygonPoints(n, cx = 50, cy = 50, r = 32) {
  const count = Math.max(3, Math.min(8, Math.floor(Number(n)) || 6));
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

export const PRIMITIVES = {
  ellipse: '<ellipse cx="50" cy="50" rx="22" ry="28" fill="currentColor"/>',
  rect: '<rect x="28" y="28" width="44" height="44" fill="currentColor"/>',
  hex: '<polygon points="50,18 78,34 78,66 50,82 22,66 22,34" fill="currentColor"/>',
  star: '<polygon points="50,16 56,38 80,38 61,52 68,74 50,60 32,74 39,52 20,38 44,38" fill="currentColor"/>',
  dot: '<circle cx="72" cy="28" r="8" fill="currentColor"/>',
  ring: '<circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" stroke-width="8"/>',
};

/** Parametric polygon kit part (sides 3–8), same token paint contract. */
export function polyInner(sides) {
  return `<polygon points="${polygonPoints(sides)}" fill="currentColor"/>`;
}
