// ground.js — #1183 slice 1: what is the GROUND under a layer, and what colour is it at a point.
//
// "One Petri Dish": a PATTERN layer is the ground the marks rest on, not an image mixed over them. Two pure pieces:
//
//   nearestPatternBelow(layers, layerId)   WHICH pattern is a layer's ground: the nearest visible PATTERN layer
//                                          below it in the stack (Matt, 2026-10-11: stack order is depth). `layers`
//                                          is bottom -> top, as everywhere else.
//   patternGround(pattern, palette, w, h)  WHAT colour that ground is: { at(x, y, t) } in scene units, built on the
//                                          SAME grid and the same pan the renderer rasterizes (patternSource.js), so
//                                          the mark and the tile beneath it can never disagree. `t` is loop time in
//                                          seconds: a drifting pattern moves the ground, and the colour follows.
//                                          It is the tile's MAIN colour (see patternGround).
//
// No clock, no DOM, no GL. The grid is cached per (pattern, palette, size): the picture, never the time.
import { assign, assignQuilt, assignGlyph, panOffset } from './engine.js';
import { patternPalette } from './patternSource.js';
import { sanitizePattern } from '../state/patternTrack.js';

/** The nearest visible PATTERN layer below `layerId` (bottom -> top order), or null. */
export function nearestPatternBelow(layers, layerId) {
  if (!Array.isArray(layers)) return null;
  const at = layers.findIndex((l) => l && l.id === layerId);
  for (let i = at - 1; i >= 0; i--) {
    const l = layers[i];
    if (l && typeof l === 'object' && l.type === 'pattern' && l.visible !== false && l.pattern) return l;
  }
  return null;
}

const CACHE_SIZE = 6;
const _grids = new Map();

/** The same grid patternSource.buildGrid makes for a w x h frame (kept in step by ground.selfcheck). */
function gridFor(p, pal, w, h) {
  const key = JSON.stringify([p.mode, p.seed, p.density, p.mix, p.hero, pal.swatches, pal.bg, pal.weights ?? null, w, h]);
  let g = _grids.get(key);
  if (g) return g;
  const tileW = w / p.density;
  const rows = Math.max(1, Math.ceil(h / tileW));
  const grid = p.mode === 'GLYPH' ? assignGlyph(p.seed, p.density, p.mix, pal)
    : p.mode === 'FIELD' ? assign(p.seed, p.density, p.mix, pal, rows)
      : assignQuilt(p.seed, p.density, p.mix, p.hero, pal, rows);
  g = { tileW, grid };
  if (_grids.size >= CACHE_SIZE) _grids.delete(_grids.keys().next().value);
  _grids.set(key, g);
  return g;
}

/** A tile's MAIN colour: its first motif colour (FIELD, QUILT) or its mark colour (GLYPH); the base colour if it has no motif. */
function mainColor(tile, grid) {
  if (tile && Array.isArray(tile.colors)) return tile.colors[1] ?? tile.colors[0];
  if (tile && tile.roles && typeof tile.roles.mark === 'string') return tile.roles.mark;
  return grid.ground ?? '#000000';
}

/**
 * The ground of a pattern over a w x h scene. `at(x, y, t)` returns the hex of the MAIN COLOUR of the tile under
 * scene point (x, y) at loop time t seconds (Matt, 2026-10-11: marks lean toward each tile's main colour).
 *
 * Why not the tile's base colour (`groundColorAt`, tile.colors[0])? Measured: it is the SAME flat background colour
 * for every tile of every pattern, so leaning toward it only darkens the marks and the choice of pattern, and its
 * drift, would not show. The main colour varies tile by tile, so marks on one tile share a hue and the pattern's
 * blocks read through them. It is constant inside a tile (no flicker at motif edges as things move).
 */
export function patternGround(pattern, palette, w, h) {
  const p = sanitizePattern(pattern);
  const pal = patternPalette(palette);
  const { tileW, grid } = gridFor(p, pal, w, h);
  return {
    at(x, y, t = 0) {
      const off = panOffset(p.seed, p.drift, p.drift > 0 ? Number(t) || 0 : 0);
      const tc = ((Math.floor(x / tileW + off.x) % grid.cols) + grid.cols) % grid.cols;
      const tr = ((Math.floor(y / tileW + off.y) % grid.rows) + grid.rows) % grid.rows;
      const i = tr * grid.cols + tc;
      // a QUILT 2x2 hero block covers its four cells: the block's colour, not the hidden tile's
      const hero = grid.heroAt ? grid.heroAt[i] : -1;
      return mainColor(hero >= 0 && grid.heroes && grid.heroes[hero] ? grid.heroes[hero] : grid.tiles[i], grid);
    },
    /**
     * #1183 tile-edge nudge — WHERE inside its tile scene point (x, y) sits at loop time t: `{ u, v, size }`, with
     * u, v in [0, 1) across the tile and `size` its side in scene units. A QUILT 2x2 hero block is one tile here (the
     * marks feel the block's edges, not the hidden cells'). Same grid, same pan as `at`, so the two never disagree.
     */
    cell(x, y, t = 0) {
      const off = panOffset(p.seed, p.drift, p.drift > 0 ? Number(t) || 0 : 0);
      const gx = x / tileW + off.x;
      const gy = y / tileW + off.y;
      const fx = gx - Math.floor(gx);
      const fy = gy - Math.floor(gy);
      const tc = ((Math.floor(gx) % grid.cols) + grid.cols) % grid.cols;
      const tr = ((Math.floor(gy) % grid.rows) + grid.rows) % grid.rows;
      const hero = grid.heroAt ? grid.heroAt[tr * grid.cols + tc] : -1;
      const h = hero >= 0 && grid.heroes ? grid.heroes[hero] : null;
      if (h && Number.isFinite(h.c) && Number.isFinite(h.r)) {
        return { u: (tc - h.c + fx) / 2, v: (tr - h.r + fy) / 2, size: tileW * 2 };
      }
      return { u: fx, v: fy, size: tileW };
    },
  };
}
