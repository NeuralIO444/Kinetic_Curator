// constructPieces.js — #2327 (gait-spec ruling 5), the pure half: a construct as LIVE PIECES. No clock, no store, no GL.
//
// Today `constructTile` bakes a record into ONE flat pool tile. On stage a construct can instead deal as its 12–16
// primitives, each a mark with a parent transform down the join tree, so a gait (#2328) can move them apart. This
// module is the geometry and the accounting; it draws nothing and nothing calls it yet (the stage hook is the next
// slice, in the one-writer files).
//
//   record + the tile's placement  →  expandConstructPieces  →  [{ part, parent, depth, origin, rot, scale }]
//
// The transform system is engine/hierarchy.js's (`expandHierarchy`, `computeWorldTransform`, `HIER_GLOBAL_BUDGET`);
// nothing is re-derived here. A record keeps each piece's flat placement, so the parent-relative anchors are
// computed from it (the exact inverse of `computeWorldTransform`) and the walk lands every piece where the tile
// draws it. That equality is the contract: a still of a construct at rest is the same drawing as pieces and as a
// tile, so a collapse to the tile and a recovery back never pop.
//
// UNITS. A tile's coordinates are the box's (0..ATTACH_BOX). `unit` is scene pixels per box unit — the tile mark's
// drawn size over ATTACH_BOX, which the stage hook reads from the mark. `centre` is the scene position of the tile
// box's centre, `rot` its turn in degrees. Everything returned is in scene units.
//
// THE TREE is derived, the way gait.js reads it: the record keeps each piece's placement but not which piece it
// joined. Pieces were made in join order, so piece 0 is the root and every later piece hangs off the nearest
// EARLIER piece (centre to centre, ties to the earlier). When the assembler records the real parent this reads it.
import { computeWorldTransform, expandHierarchy, HIER_GLOBAL_BUDGET } from './hierarchy.js';
import { constructPartPoint, CONSTRUCT_MAX_PARTS } from './constructAssembler.js';
import { ATTACH_BOX } from './assetAttach.js';

/** Two rests are the same when every corner is within this many scene units (float dust only). */
export const REST_EPSILON = 1e-6;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const rad = (deg) => (deg * Math.PI) / 180;
const HALF = ATTACH_BOX / 2;

/** The record's parts when it has a drawable shape: 1..CONSTRUCT_MAX_PARTS pieces of finite placement. */
function partsOf(record) {
  const parts = Array.isArray(record?.parts) ? record.parts : [];
  if (!parts.length || parts.length > CONSTRUCT_MAX_PARTS) return null;
  for (const p of parts) {
    if (!p || typeof p.asset !== 'string' || !p.asset) return null;
    if (![p.x, p.y, p.r, p.s].every(finite) || !(p.s > 0)) return null;
  }
  return parts;
}

/**
 * The derived join tree: [{ id, parent, depth }], parent before child. Same reading gait.js's `treeOf` uses.
 * Null for a record with no drawable shape.
 */
export function constructJoinTree(record) {
  const parts = partsOf(record);
  if (!parts) return null;
  const centre = parts.map((p) => constructPartPoint(p, { x: HALF, y: HALF }));
  const nodes = [];
  for (let i = 0; i < parts.length; i++) {
    if (i === 0) {
      nodes.push({ id: 'p0', parent: null, depth: 0 });
      continue;
    }
    let best = 0;
    let bestD = Infinity;
    for (let j = 0; j < i; j++) {
      const d = Math.hypot(centre[i].x - centre[j].x, centre[i].y - centre[j].y);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = j;
      }
    }
    nodes.push({ id: `p${i}`, parent: `p${best}`, depth: nodes[best].depth + 1 });
  }
  return nodes;
}

/**
 * Each piece's size per axis in scene px per box unit. A piece turned a quarter turn swaps which of the tile's two
 * stretches lands on which of its axes (a stretch then a quarter turn is a quarter turn then the other stretch), so
 * a stretched tile's pieces stay exact sprites. Any other turn of a stretched tile would shear — not a sprite — and
 * is refused (`stretchOk`).
 */
function axesOf(part, place) {
  const ux = place.unit;
  const uy = place.unitY ?? place.unit;
  const t = (((part.r % 180) + 180) % 180) / 90; // 0 → even quarter turn, 1 → odd quarter turn
  const odd = Math.abs(t - 1) < 1e-9;
  return odd ? { sx: part.s * uy, sy: part.s * ux } : { sx: part.s * ux, sy: part.s * uy };
}

/** A tile stretched (unit ≠ unitY) can deal as pieces only when every piece sits on a quarter turn. */
function stretchOk(parts, place) {
  const uy = place.unitY ?? place.unit;
  if (Math.abs(uy - place.unit) <= 1e-9 * Math.max(1, place.unit)) return true;
  return parts.every(
    (p) => Math.abs((((p.r % 90) + 90) % 90) / 90) < 1e-9 || Math.abs((((p.r % 90) + 90) % 90) / 90 - 1) < 1e-9,
  );
}

/**
 * The hierarchy recipe for a record: one part per piece, one named anchor per child on its parent. An anchor is the
 * child's placement in the parent's own frame — the inverse of `computeWorldTransform` — so the walk reproduces the
 * record's flat placements, stretch included.
 */
function recipeOf(parts, tree, place) {
  const ux = place.unit;
  const uy = place.unitY ?? place.unit;
  const recipe = { parts: {} };
  for (let i = 0; i < parts.length; i++) recipe.parts[`p${i}`] = { asset: parts[i].asset, anchors: {}, children: [] };
  for (let i = 1; i < parts.length; i++) {
    const j = Number(tree[i].parent.slice(1));
    const P = parts[j];
    const C = parts[i];
    const a = rad(P.r);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const pj = axesOf(P, place);
    const ci = axesOf(C, place);
    // the tile's stretch acts on the box offset first, then the parent's turn is undone, then the parent's own size
    const wx = (C.x - P.x) * ux;
    const wy = (C.y - P.y) * uy;
    const anchor = {
      dx: (cos * wx + sin * wy) / pj.sx,
      dy: (-sin * wx + cos * wy) / pj.sy,
      dRot: C.r - P.r,
      dScaleX: ci.sx / pj.sx,
      dScaleY: ci.sy / pj.sy,
    };
    const name = `a${i}`;
    recipe.parts[`p${j}`].anchors[name] = anchor;
    recipe.parts[`p${j}`].children.push({ part: `p${i}`, anchor: name });
  }
  return recipe;
}

/** Where the tile's box origin sits in the scene: the centre, minus the box's half-diagonal stretched and turned. */
function boxOrigin({ centre, rot, unit, unitY }) {
  const a = rad(rot);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hx = HALF * unit;
  const hy = HALF * (unitY ?? unit);
  return { x: centre.x - (hx * cos - hy * sin), y: centre.y - (hx * sin + hy * cos) };
}

const validPlace = (place) =>
  !!place &&
  finite(place.unit) &&
  place.unit > 0 &&
  (place.unitY === undefined || (finite(place.unitY) && place.unitY > 0)) &&
  finite(place.rot) &&
  finite(place.centre?.x) &&
  finite(place.centre?.y);

/** Can this record deal as pieces under this placement? (drawable shape, readable placement, no shear). */
export function canDealAsPieces(record, place) {
  const parts = partsOf(record);
  return !!parts && validPlace(place) && stretchOk(parts, place);
}

/**
 * A construct as pieces, at rest.
 * @param record  a construct record ({ parts: [{ asset, x, y, r, s }] }).
 * @param place   { centre: {x,y}, rot, unit, unitY? } — the tile mark's placement (see UNITS above). `unitY` is the
 *   vertical stretch when the mark is not square; a stretched tile deals as pieces only on quarter turns.
 * @param opts    { budget } — the most pieces this call may emit (defaults to the hierarchy's global budget).
 * @returns { pieces, truncated, problems } where each piece is
 *   { id, parent, depth, asset, origin: {x,y}, rot, scale, scaleY } — `origin` is where the primitive's box origin
 *   lands, `rot` its turn in degrees, `scale`/`scaleY` scene pixels per box unit on its two axes. `pieces: null` for an
 *   undrawable record or placement, or a stretched tile whose pieces are not on quarter turns (that would shear).
 */
export function expandConstructPieces(record, place, { budget = HIER_GLOBAL_BUDGET } = {}) {
  const parts = partsOf(record);
  if (!parts || !validPlace(place)) return { pieces: null, truncated: false, problems: ['no drawable construct'] };
  if (!stretchOk(parts, place)) return { pieces: null, truncated: false, problems: ['a stretched tile would shear'] };
  const tree = constructJoinTree(record);
  const recipe = recipeOf(parts, tree, place);
  const o = boxOrigin(place);
  const uy = place.unitY ?? place.unit;
  // the root piece is the tile's own frame composed with part 0's placement
  const a = rad(place.rot);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const p0 = parts[0];
  const ax0 = axesOf(p0, place);
  const rootWorld = {
    x: o.x + (cos * p0.x * place.unit - sin * p0.y * uy),
    y: o.y + (sin * p0.x * place.unit + cos * p0.y * uy),
    rot: place.rot + p0.r,
    scaleX: ax0.sx,
    scaleY: ax0.sy,
    part: 'p0',
    key: 'construct',
  };
  const { items, truncated, problems } = expandHierarchy(rootWorld, recipe, {
    budget,
    maxDepth: parts.length,
  });
  // the walk's path names anchors, and an anchor is named for the child it holds: 'construct/a1/a3' is piece 3
  const partIdOf = (path) => (path === 'construct' ? 'p0' : `p${path.split('/').pop().slice(1)}`);
  const byPart = new Map(items.map((it) => [partIdOf(it._hier.path), it]));
  const out = [];
  for (const node of tree) {
    const it = byPart.get(node.id);
    if (!it) continue; // cut by the budget: a construct is never half-built (see planConstructPieces)
    out.push({
      id: node.id,
      parent: node.parent,
      depth: node.depth,
      asset: it.assetId,
      origin: { x: it.x, y: it.y },
      rot: it.rotation,
      scale: it.scaleX,
      scaleY: it.scaleY,
    });
  }
  return { pieces: out, truncated, problems };
}

/**
 * The tile's own placement of the same shape, piece by piece, WITHOUT the hierarchy: what the flat tile draws. The
 * rest contract compares this with `expandConstructPieces` — they are two routes to one drawing.
 */
export function flatPiecePlacements(record, place) {
  const parts = partsOf(record);
  if (!parts || !validPlace(place) || !stretchOk(parts, place)) return null;
  const o = boxOrigin(place);
  const uy = place.unitY ?? place.unit;
  const a = rad(place.rot);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return parts.map((p, i) => {
    const ax = axesOf(p, place);
    return {
      id: `p${i}`,
      asset: p.asset,
      origin: {
        x: o.x + (cos * p.x * place.unit - sin * p.y * uy),
        y: o.y + (sin * p.x * place.unit + cos * p.y * uy),
      },
      rot: place.rot + p.r,
      scale: ax.sx,
      scaleY: ax.sy,
    };
  });
}

/** The four corners of a piece's primitive box in the scene (the primitive's own box, whole). */
export function pieceCorners(piece) {
  const a = rad(piece.rot);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const sy = piece.scaleY ?? piece.scale;
  return [
    [0, 0],
    [ATTACH_BOX, 0],
    [0, ATTACH_BOX],
    [ATTACH_BOX, ATTACH_BOX],
  ].map(([x, y]) => ({
    x: piece.origin.x + (cos * x * piece.scale - sin * y * sy),
    y: piece.origin.y + (sin * x * piece.scale + cos * y * sy),
  }));
}

/** The mark a piece draws as: the centre of its primitive box, the turn, and the size on each axis (px per box unit). */
export function pieceMark(piece) {
  const a = rad(piece.rot);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const sy = piece.scaleY ?? piece.scale;
  return {
    assetId: piece.asset,
    x: piece.origin.x + (cos * HALF * piece.scale - sin * HALF * sy),
    y: piece.origin.y + (sin * HALF * piece.scale + cos * HALF * sy),
    rotation: piece.rot,
    scale: piece.scale,
    scaleY: sy,
  };
}

/**
 * The largest distance (scene units) between any corner of two piece lists, matched by id. Infinity when the lists
 * do not name the same pieces. 0 means they are the same drawing.
 */
export function maxPieceDelta(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  const byId = new Map(b.map((p) => [p.id, p]));
  let max = 0;
  for (const p of a) {
    const q = byId.get(p.id);
    if (!q) return Infinity;
    const ca = pieceCorners(p);
    const cb = pieceCorners(q);
    for (let i = 0; i < ca.length; i++) max = Math.max(max, Math.hypot(ca[i].x - cb[i].x, ca[i].y - cb[i].y));
  }
  return max;
}

/**
 * May the pieces collapse to the flat tile on this frame? Only when they are at rest — every piece where the tile
 * draws it. The governor's order is freeze → pin → collapse, so by the time this asks, motion is frozen; a piece still
 * off its rest holds the collapse a frame rather than popping. Returns { ok, delta }.
 */
export function canCollapse(pieces, record, place) {
  const rest = flatPiecePlacements(record, place);
  const delta = rest ? maxPieceDelta(pieces, rest) : Infinity;
  return { ok: delta <= REST_EPSILON, delta };
}

/**
 * The cap ladder for constructs on stage. `constructs` are the stage's constructs in a stable order
 * ([{ key, record }]); each deals as its pieces while the budget holds and as its flat tile once it would not — whole
 * constructs, never a half-built one, earliest first. A construct's pieces count against `budget`, the hierarchy's
 * own global cap by default, so the existing ladder is the one ceiling.
 * @returns { pieces: [key…], tiles: [key…], used } — `used` is the piece count dealt.
 */
export function planConstructPieces(constructs, { budget = HIER_GLOBAL_BUDGET, taken = 0 } = {}) {
  const pieces = [];
  const tiles = [];
  let used = 0;
  const room = Math.max(0, Math.floor(budget) - Math.max(0, Math.floor(taken)));
  for (const c of Array.isArray(constructs) ? constructs : []) {
    const n = partsOf(c?.record)?.length || 0;
    if (n > 0 && used + n <= room) {
      pieces.push(c.key);
      used += n;
    } else {
      tiles.push(c?.key);
    }
  }
  return { pieces, tiles, used };
}

// re-exported so the stage hook reads one module for the transform it shares with creatures
export { computeWorldTransform };
