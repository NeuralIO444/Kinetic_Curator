// groundSnap.js — #1183 palette snap: a share of the marks take the exact colours of the PATTERN tile beneath them.
//
// Matt's decisions (2026-10-12):
//   1. snaps to the colours of the TILE BENEATH the mark (pattern/ground.js `roles`: main first, ground left out)
//   2. one SNAP knob per content layer = the SHARE of marks that snap; a fixed set per seed, the same every frame
//   3. a snapped mark takes the tile colour exactly: GROUND's lean applies only to the marks that did not snap
//   4. both colours snap: main -> the nearest tile colour; accent -> the nearest of the tile's OTHER colours
//      (so the mark keeps two tones; a one-colour tile gives both the same)
//   5. the knob is called SNAP (the palette strip's swatch pins are already "palette locks")
//
// Which marks snap: hashU01(seed, 'snap', mark index, seedOffsets) < share. The 'snap' channel rides the COLOUR
// stream (kernel/rng.js), so re-rolling colour reshuffles which marks snap and re-rolling layout does not. A mark's
// index is its placement index, so the set holds steady frame to frame; raising the knob only ever adds marks.
// Nearest colour: the "redmean" weighted RGB distance, cheap and closer to the eye than plain RGB.
// Pure: no clock, no store.
import { hashU01 } from './kernel/rng.js';

/** '#rrggbb' -> [r, g, b] 0..255, or null. */
function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Redmean colour distance (squared), or Infinity when either is not a hex colour. */
export function colorDistance2(a, b) {
  const p = rgb(a); const q = rgb(b);
  if (!p || !q) return Infinity;
  const rm = (p[0] + q[0]) / 2;
  const dr = p[0] - q[0]; const dg = p[1] - q[1]; const db = p[2] - q[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

/** The candidate nearest to `color` (first wins a tie), or null when there are none. */
export function nearestColor(color, candidates) {
  let best = null; let bestD = Infinity;
  for (const c of candidates || []) {
    const d = colorDistance2(color, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** One mark's snapped { color, accent } given its tile's role colours (never empty; main first). */
export function snapPair(color, accent, roles) {
  const main = nearestColor(color, roles) ?? roles[0];
  const rest = roles.filter((c) => c !== main);
  const acc = rest.length ? (nearestColor(accent, rest) ?? rest[0]) : main;
  return { color: main, accent: acc };
}

/** Does the mark with placement index `index` snap at this share? Deterministic per (seed, offsets, index). */
export function snaps(seed, index, share, seedOffsets = null) {
  if (!(share > 0)) return false;
  if (share >= 1) return true;
  return hashU01(seed >>> 0, 'snap', index | 0, seedOffsets) < share;
}

/**
 * Snap the placed marks. `rolesAt(x, y)` -> the tile's role colours (pattern/ground.js `roles`). Returns
 * `{ colors, accents, snapped }` as NEW arrays (the bind cache's base arrays are never touched) and a Uint8Array
 * marking which marks snapped, or null when nothing snaps (share 0 / no ground): the caller keeps its arrays.
 */
export function applyGroundSnap({ soa, colors, accents, rolesAt, share, seed, seedOffsets = null }) {
  if (!(share > 0) || typeof rolesAt !== 'function' || !soa) return null;
  const n = soa.n | 0;
  let outC = null; let outA = null; let flags = null;
  for (let k = 0; k < n; k++) {
    if (!snaps(seed, soa.index[k], share, seedOffsets)) continue;
    const roles = rolesAt(soa.x[k], soa.y[k]);
    if (!Array.isArray(roles) || !roles.length) continue;
    if (!outC) { outC = colors.slice(); outA = accents.slice(); flags = new Uint8Array(n); }
    const s = snapPair(colors[k], accents[k], roles);
    outC[k] = s.color; outA[k] = s.accent; flags[k] = 1;
  }
  return outC ? { colors: outC, accents: outA, snapped: flags } : null;
}
