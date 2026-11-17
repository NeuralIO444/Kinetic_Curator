// constructSettle.mjs — WetLab ladder, CONSTRUCT rung: a construct tile that settles into place (spec §13.3; issue #2300).
//
// At t = 0 every part sits a little out from the tile's centre, along the line from the centre to its own centre; as
// t runs to 1 each part slides home (ease-out), later parts starting later. At t >= 1 the markup is byte for byte
// constructTileSvg's, so a settled tile and a banked tile are the same drawing. `t` is handed in by whoever animates;
// this module has no clock. Pure: no Math.random, no store, no React.
import { constructTileSvg, constructPartPoint } from '../engine/constructAssembler.js';

/** How far out (in tile units, the box is 100) a part starts at t = 0. */
export const SETTLE_SPREAD = 12;
/** The share of the run by which the last part starts after the first. */
export const SETTLE_STAGGER = 0.5;

const CENTRE = 50;
const r2 = (n) => Math.round(n * 100) / 100;

/** Ease-out cubic: fast start, gentle landing. 0 → 0, 1 → 1. */
export const ease = (u) => 1 - (1 - u) ** 3;

/** A part's own progress at run time t, staggered by its index. */
function local(t, i, n) {
  const lag = n > 1 ? (SETTLE_STAGGER * i) / (n - 1) : 0;
  return Math.max(0, Math.min(1, t * (1 + SETTLE_STAGGER) - lag));
}

/**
 * The tile's markup at run time `t` (0 = spread out, 1 = settled). Garbage `t` (NaN, negative, missing) reads as
 * settled, so a tile is never stuck apart. Null wherever constructTileSvg is null.
 */
export function settledSvg(record, svgOf, t) {
  const done = constructTileSvg(record, svgOf);
  if (done === null) return null;
  // only a real number in [0, 1) runs the settle; anything else (null, a string, NaN) is the settled tile
  const tt = typeof t === 'number' ? t : NaN;
  if (!Number.isFinite(tt) || tt < 0 || tt >= 1) return done;
  const n = record.parts.length;
  let out = '';
  record.parts.forEach((part, i) => {
    const u = local(tt, i, n);
    let x = part.x;
    let y = part.y;
    if (u < 1) {
      const c = constructPartPoint(part, { x: CENTRE, y: CENTRE });
      const dx = c.x - CENTRE;
      const dy = c.y - CENTRE;
      const d = Math.hypot(dx, dy);
      // a part at the very centre spreads along a fixed direction of its own, so it still visibly arrives
      const ux = d > 1e-6 ? dx / d : Math.cos(i * 2.399963);
      const uy = d > 1e-6 ? dy / d : Math.sin(i * 2.399963);
      const k = (1 - ease(u)) * SETTLE_SPREAD;
      x = r2(part.x + ux * k);
      y = r2(part.y + uy * k);
    }
    out += `<g transform="translate(${x} ${y}) rotate(${part.r}) scale(${part.s})">${svgOf(part.asset)}</g>`;
  });
  return out;
}
