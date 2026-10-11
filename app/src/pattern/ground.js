// ground.js — #1183 slice 1: what is the GROUND under a layer, and what colour is it at a point.
//
// "One Petri Dish": a PATTERN layer is the ground the marks rest on, not an image mixed over them. Two pure pieces:
//
//   nearestPatternBelow(layers, layerId)   WHICH pattern is a layer's ground: the nearest visible PATTERN layer
//                                          below it in the stack (Matt, 2026-10-11: stack order is depth). `layers`
//                                          is bottom -> top, as everywhere else.
//   patternGround(pattern, palette, w, h)  WHAT colour that ground is: { at(x, y, t) } in scene units, built on the
//                                          SAME grid and the same pan the renderer rasterizes (patternSource.js), so
//                                          the mark and the pixels beneath it can never disagree. `t` is loop time in
//                                          seconds: a drifting pattern moves the ground, and the colour follows.
//                                          FIELD and QUILT: the tile's (or hero block's) base colour. GLYPH: its one
//                                          ground colour.
//
// No clock, no DOM, no GL. The grid is cached per (pattern, palette, size): the picture, never the time.
import { assign, assignQuilt, assignGlyph, groundColorAt, panOffset } from './engine.js';
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

/**
 * The ground of a pattern over a w x h scene. `at(x, y, t)` returns the hex colour of the tile under scene point
 * (x, y) at loop time t seconds: tile.colors[0], the colour the renderer paints where no motif lands.
 */
export function patternGround(pattern, palette, w, h) {
  const p = sanitizePattern(pattern);
  const pal = patternPalette(palette);
  const { tileW, grid } = gridFor(p, pal, w, h);
  // GLYPH draws marks on ONE ground colour: that colour is the ground everywhere, whatever the pan.
  if (p.mode === 'GLYPH') return { at: () => grid.ground };
  return {
    at(x, y, t = 0) {
      const off = panOffset(p.seed, p.drift, p.drift > 0 ? Number(t) || 0 : 0);
      const X = x / tileW + off.x;
      const Y = y / tileW + off.y;
      if (p.mode === 'QUILT') {
        // a 2x2 hero block covers its four cells: the block's ground, not the hidden tile's
        const tc = ((Math.floor(X) % grid.cols) + grid.cols) % grid.cols;
        const tr = ((Math.floor(Y) % grid.rows) + grid.rows) % grid.rows;
        const hero = grid.heroAt ? grid.heroAt[tr * grid.cols + tc] : -1;
        if (hero >= 0 && grid.heroes[hero]) return grid.heroes[hero].colors[0];
      }
      return groundColorAt(grid, X, Y);
    },
  };
}
