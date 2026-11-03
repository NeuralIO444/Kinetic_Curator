// engine/creatureBody.js — #1851 (creatures, slice 3: body language): the creature tile's drawing as PARTS, so the
// stage can move them.
//
// A creature tile (#1850) is an ordinary pool asset; its motion therefore rides the stage's ordinary per-region
// animation (#1433 regions, #1434 family defaults, #1435 the bend) — no creature branch in the resolver, the renderer
// or the loop. What this module adds is the drawing that makes that possible:
//
//   - each part is its own island of ink. The body is clipped away in a thin moat around every limb and the head
//     (an SVG clipPath — allowlisted by the overlay's door), so the region detector sees each limb and the head as
//     their own regions instead of one blob welded to the body's outline. The moat reads as a joint: a socket gap
//     between part and body, the way a jointed figure is drawn.
//   - limbs are tapered, bowed strokes reaching from their L point outward (away from the body's centre) to near the
//     tile's edge, alternately bowed so neighbours don't mirror; wide enough at the root that the detector keeps them
//     (its sliver rule absorbs hairlines into a neighbour).
//   - the head is a disc on the H point with a beak pointing away from the body and an eye cut through it (evenodd),
//     so it has a facing — a ring has none, and a turning ring is invisible. (Nonzero winding: the eye winds
//     against the disc, which cuts it; the beak winds with it, so where they overlap it stays filled.)
//
// Each part's path carries a class (cr-limb / cr-head). regionDefaults reads them back (creaturePartsFromSvg) to give
// the family defaults: limbs stride or bend, the head looks about, the body stays still. Everything is plain polygons
// (M/L/Z only) in the 100-unit box, so the parse is exact and pure.
//
// Browser-safe, pure, deterministic in the record.

/** Where the body sits inside the tile's 100-unit box: small enough to leave the limbs room to reach. */
export const TILE_BODY_SCALE = 0.55;
const OFF = (100 * (1 - TILE_BODY_SCALE)) / 2;
/** Limb half-width at the root and at the tip (tile units). Under ~2 at the root the detector drops the limb. */
const LIMB_ROOT = 2.2;
const LIMB_TIP = 1.1;
/** The longest a limb reaches, and the inset it keeps from the tile's edge. */
const LIMB_REACH = 30;
const EDGE = 1.5;
/** The joint gap: how far the body is cut back around every part. */
export const JOINT_GAP = 2;
const HEAD_R = 5.5;

/** The class each part's path carries — the region defaults read them back. */
export const PART_LIMB = 'cr-limb';
export const PART_HEAD = 'cr-head';

const r2 = (n) => Math.round(n * 100) / 100;
/** A body point (0..100 in the body's box) in the tile's box. */
const toTile = (p) => ({ x: OFF + p.x * TILE_BODY_SCALE, y: OFF + p.y * TILE_BODY_SCALE });
/** The unit direction from the body's centre to a body point (straight down when the point IS the centre). */
function outward(p) {
  const dx = p.x - 50;
  const dy = p.y - 50;
  const m = Math.hypot(dx, dy);
  return m > 1 ? [dx / m, dy / m] : [0, 1];
}
const polyD = (pts) => `M${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L')}Z`;
function ngon(cx, cy, r, n = 20) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** One limb's outline, grown by `grow` all round (the moat cut uses the grown outline). */
function limbOutline(limb, index, grow = 0) {
  const a = toTile(limb);
  const [ux, uy] = outward(limb);
  const nx = -uy;
  const ny = ux;
  let reach = LIMB_REACH;
  for (const [p, d] of [
    [a.x, ux],
    [a.y, uy],
  ]) {
    if (d > 1e-6) reach = Math.min(reach, (100 - EDGE - p) / d);
    if (d < -1e-6) reach = Math.min(reach, (p - EDGE) / -d);
  }
  reach = Math.max(8, reach);
  const bow = (index % 2 ? -1 : 1) * reach * 0.28; // alternate sides: neighbours never mirror
  const N = 12;
  const left = [];
  const right = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const side = bow * 4 * t * (1 - t); // the knee: the bow peaks mid-limb
    // the curve's own tangent, so the width (and the moat) is measured square to the limb everywhere
    const tx = ux * reach + nx * bow * 4 * (1 - 2 * t);
    const ty = uy * reach + ny * bow * 4 * (1 - 2 * t);
    const tl = Math.hypot(tx, ty) || 1;
    const [px, py] = [-ty / tl, tx / tl];
    const cap = k === 0 ? -grow : k === N ? grow : 0; // grown at both ends too
    const cx = a.x + ux * reach * t + nx * side + (tx / tl) * cap;
    const cy = a.y + uy * reach * t + ny * side + (ty / tl) * cap;
    const w = LIMB_ROOT * (1 - t) + LIMB_TIP * t + grow;
    left.push([cx + px * w, cy + py * w]);
    right.push([cx - px * w, cy - py * w]);
  }
  return [...left, ...right.reverse()];
}

/** The head's disc centre, its outward direction, and the beak/eye geometry. */
function headGeometry(head) {
  const h = toTile(head);
  const [ux, uy] = outward(head);
  const nx = -uy;
  const ny = ux;
  const c = { x: h.x + ux * 1.5, y: h.y + uy * 1.5 };
  return {
    c,
    disc: ngon(c.x, c.y, HEAD_R),
    beak: [
      [c.x + nx * 3, c.y + ny * 3],
      [c.x + ux * 9, c.y + uy * 9],
      [c.x - nx * 3, c.y - ny * 3],
    ],
    eye: ngon(c.x + ux * 2 + nx * 2, c.y + uy * 2 + ny * 2, 1.6, 12),
  };
}

/**
 * The tile's SVG (inner content, the 100-unit box every asset is drawn in): the body asset's own drawing scaled into
 * the middle and cut back around each part, the limbs, and the head. Only allowlisted tags (defs, clipPath, g, path)
 * — the overlay's door re-checks it on every load. Clip ids are namespaced by the record id, so two creatures never
 * share one.
 */
export function creatureTileSvg(record, bodySvg) {
  if (!record || typeof bodySvg !== 'string' || !bodySvg) return null;
  const limbs = Array.isArray(record.limbs) ? record.limbs : [];
  const head = record.head ? headGeometry(record.head) : null;
  const cuts = limbs.map((l, i) => polyD(limbOutline(l, i, JOINT_GAP)));
  if (head) cuts.push(polyD(ngon(head.c.x, head.c.y, HEAD_R + JOINT_GAP + 0.2)));
  const ns = `${String(record.id || 'cr').replace(/[^a-z0-9-]/gi, '')}-j`;
  // one clip per part, nested: an evenodd hole per clip, so overlapping moats never cancel each other out
  let body = `<g transform="translate(${r2(OFF)} ${r2(OFF)}) scale(${TILE_BODY_SCALE})">${bodySvg}</g>`;
  cuts.forEach((_, k) => {
    body = `<g clip-path="url(#${ns}${k})">${body}</g>`;
  });
  const parts = [];
  if (cuts.length) {
    const defs = cuts
      .map((d, k) => `<clipPath id="${ns}${k}"><path clip-rule="evenodd" d="M-50 -50H150V150H-50Z${d}"/></clipPath>`)
      .join('');
    parts.push(`<defs>${defs}</defs>`);
  }
  parts.push(body);
  limbs.forEach((l, i) => {
    parts.push(`<path class="${PART_LIMB}" d="${polyD(limbOutline(l, i))}" fill="var(--accent)"/>`);
  });
  if (head) {
    parts.push(
      // nonzero: the eye winds against the disc (a hole), the beak with it (overlap stays filled)
      `<path class="${PART_HEAD}" d="${polyD(head.disc)}${polyD(head.eye.slice().reverse())}${polyD(head.beak.slice().reverse())}" fill="var(--accent)"/>`,
    );
  }
  return parts.join('');
}

/**
 * The parts a creature tile's SVG declares, read back from its classed paths: [{ role: 'limb'|'head', box: [x0, y0,
 * x1, y1] }] in the 100-unit box, in drawing order. Pure; [] for anything that isn't a creature tile's drawing.
 */
export function creaturePartsFromSvg(svg) {
  const out = [];
  const re = /<path class="(cr-limb|cr-head)"[^>]*?\sd="([^"]*)"/g;
  // Only THIS creature's parts: they are drawn after the body (whose wrappers all close with </g>) and are bare
  // paths. A body that is itself a creature tile carries its own classed parts INSIDE the body — in its own frame,
  // not this one — and those are body, not parts.
  const text = String(svg || '');
  const close = text.lastIndexOf('</g>');
  const tail = close < 0 ? text : text.slice(close + 4);
  for (const m of tail.matchAll(re)) {
    const nums = (m[2].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length < 6) continue;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      x0 = Math.min(x0, nums[i]);
      x1 = Math.max(x1, nums[i]);
      y0 = Math.min(y0, nums[i + 1]);
      y1 = Math.max(y1, nums[i + 1]);
    }
    out.push({ role: m[1] === PART_HEAD ? 'head' : 'limb', box: [x0, y0, x1, y1] });
  }
  return out;
}

/**
 * Which detected region is which part: for each part (drawing order) the largest not-yet-claimed region whose centroid
 * lies inside the part's box. Returns { [regionId]: 'limb'|'head' }; regions no part claims are the body. Pure.
 */
export function creaturePartRegions(svg, regions) {
  const parts = creaturePartsFromSvg(svg);
  const out = {};
  if (!parts.length || !Array.isArray(regions)) return out;
  for (const p of parts) {
    const [x0, y0, x1, y1] = p.box;
    let best = null;
    for (const r of regions) {
      if (!r || out[r.id]) continue;
      const cx = r.cx * 100;
      const cy = r.cy * 100;
      if (cx < x0 - 1 || cx > x1 + 1 || cy < y0 - 1 || cy > y1 + 1) continue;
      // the part's own region sits inside its box; a body region that merely has its centre there reaches out of it
      if (r.x0 * 100 < x0 - 2 || r.x1 * 100 > x1 + 2 || r.y0 * 100 < y0 - 2 || r.y1 * 100 > y1 + 2) continue;
      if (!best || r.area > best.area) best = r;
    }
    if (best) out[best.id] = p.role;
  }
  return out;
}
