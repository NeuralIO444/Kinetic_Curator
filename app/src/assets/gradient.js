// #701 — TE-limited gradients. A deliberate limitation, not a free-for-all.
//
// An asset may opt in with a `gradient` field; absent or invalid means flat,
// and flat is what every existing asset stays. Two types (linear in one of
// four directions, or radial), two stops, and the stops are PALETTE SLOTS
// only — ink, accent, or transparent. No arbitrary colours.
//
// That last constraint is not only taste. The live atlas bakes each asset as
// an R/G MASK (ink = pure red, accent = pure green) and the shader resolves
// the palette per frame (`inkA * v_ink + accA * v_accent`). A gradient
// between palette slots is therefore expressible as a ramp in that mask — an
// ink->accent gradient bakes as red->green and comes out of the shader as a
// per-texel blend of whatever the live palette currently is. An arbitrary
// colour could not survive the mask at all. The limitation is what makes the
// feature free: baked once per cell, zero per-frame cost, no shader change.

export const GRADIENT_TYPES = Object.freeze(['linear', 'radial']);
export const GRADIENT_DIRS = Object.freeze(['up', 'down', 'left', 'right']);
export const GRADIENT_STOPS = Object.freeze(['ink', 'accent', 'transparent']);

/** Linear direction -> objectBoundingBox coordinates. */
const DIR_COORDS = Object.freeze({
  down: { x1: 0, y1: 0, x2: 0, y2: 1 },
  up: { x1: 0, y1: 1, x2: 0, y2: 0 },
  right: { x1: 0, y1: 0, x2: 1, y2: 0 },
  left: { x1: 1, y1: 0, x2: 0, y2: 0 },
});

/**
 * Normalize a raw gradient declaration. Returns null for anything that is not
 * a complete, legal gradient — fail-closed to FLAT, because a half-understood
 * gradient painting an asset is worse than the asset staying as authored.
 *
 * Two transparent stops are rejected: that is an invisible asset, which is
 * never what anyone meant.
 */
export function sanitizeGradient(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = GRADIENT_TYPES.includes(raw.type) ? raw.type : null;
  if (!type) return null;
  const from = GRADIENT_STOPS.includes(raw.from) ? raw.from : null;
  const to = GRADIENT_STOPS.includes(raw.to) ? raw.to : null;
  if (!from || !to) return null;
  if (from === 'transparent' && to === 'transparent') return null;
  if (from === to) return null; // a two-stop gradient between one colour is flat
  const dir = GRADIENT_DIRS.includes(raw.dir) ? raw.dir : 'down';
  return type === 'linear' ? { type, dir, from, to } : { type, from, to };
}

/** Does this asset paint with a gradient? */
export function hasGradient(asset) {
  return sanitizeGradient(asset && asset.gradient) !== null;
}

/**
 * The `<defs>` block for one gradient, with stops resolved to the colours the
 * caller is baking in — real palette hex for the stills path, the R/G mask
 * primaries for the live path. A `transparent` stop takes the OTHER stop's
 * colour at zero opacity, so the ramp fades out instead of fading through
 * black (fading to an unrelated colour is the classic gradient mistake).
 */
export function gradientDefs(gradient, { ink, accent, id = 'kc-grad' }) {
  const g = sanitizeGradient(gradient);
  if (!g) return '';
  const colorOf = (slot) => (slot === 'accent' ? accent : ink);
  // A transparent stop borrows the other stop's colour at zero opacity.
  const fromColor = g.from === 'transparent' ? colorOf(g.to) : colorOf(g.from);
  const toColor = g.to === 'transparent' ? colorOf(g.from) : colorOf(g.to);
  const fromOp = g.from === 'transparent' ? 0 : 1;
  const toOp = g.to === 'transparent' ? 0 : 1;
  const stops =
    `<stop offset="0" stop-color="${fromColor}" stop-opacity="${fromOp}"/>` +
    `<stop offset="1" stop-color="${toColor}" stop-opacity="${toOp}"/>`;
  if (g.type === 'radial') {
    return `<defs><radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient></defs>`;
  }
  const c = DIR_COORDS[g.dir] || DIR_COORDS.down;
  return `<defs><linearGradient id="${id}" x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}">${stops}</linearGradient></defs>`;
}

/**
 * Rewrite one asset's SVG body to paint its INK with the gradient.
 *
 * Ink only, deliberately: accent stays a flat second colour so an asset keeps
 * a readable figure/ground. Assets with no gradient come back byte-identical,
 * which is what keeps every existing asset exactly as it was.
 */
export function applyGradient(svgBody, gradient, { ink, accent, id = 'kc-grad' }) {
  const g = sanitizeGradient(gradient);
  if (!g) return svgBody;
  const defs = gradientDefs(g, { ink, accent, id });
  return defs + String(svgBody).replace(/var\(--ink[^)]*\)/g, `url(#${id})`);
}
