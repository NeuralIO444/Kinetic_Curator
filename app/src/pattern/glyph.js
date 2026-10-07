// glyph.js — PATTERN GLYPH mode: thirteen constructed marks (#1041).
//
// Spec: docs/PATTERN_SPEC.md — Composition (GLYPH), mark construction table.
//
// A mark is a short list of flat primitives in tile-local units: tile size 1,
// origin at the tile center, y down. Later ops paint over earlier ones. Each
// op names the ROLE it paints with (mark / cut / accent / ground); the engine
// maps roles to palette colors. There are no gradients, bevels or textures:
// only flat fills and uniform strokes.
//
//   disc  { cx, cy, r }                 filled circle
//   ring  { cx, cy, r, w }              circle stroke, width w centered on r
//   seg   { x1, y1, x2, y2, w, cap }    line stroke; cap 'round' | 'butt'
//   poly  { pts: [[x, y], ...] }        filled polygon (even-odd)
//   lens  { a, h }                      almond: two arcs, half-width a, half-height h
//
// Geometry is the construction table as written, with one signed edit (#1041
// decision 1): Sunburst rays are 0.16 long with butt caps, so the mark stays
// inside the ±0.30 box instead of kissing it.
//
// Pure: no DOM, no Math.random, no time. Variants come from the tile's rng.

/** Half of the 60% mark box: every mark's bounds are strictly inside ±0.30 at DRIFT 0. */
export const MARK_BOX = 0.30;
/** No stroke is ever thinner than this fraction of the tile, at any DRIFT scale. */
export const MIN_STROKE = 0.012;
/** The only poses: quarter turns. A mark's own diagonal is baked into its construction. */
export const POSES = Object.freeze([0, 90, 180, 270]);

/** Mark names in spec order (vocabulary 11–23). The array index + 11 is the mark id. */
export const GLYPH_MARKS = Object.freeze([
  'sunburst',      // 11
  'pixelCluster',  // 12
  'slashedCircle', // 13
  'squiggle',      // 14
  'chevron',       // 15
  'bolt',          // 16
  'interlock',     // 17
  'eye',           // 18
  'knot',          // 19
  'capsule',       // 20
  'slab',          // 21
  'arrows',        // 22
  'crossedDisc',   // 23
]);

/** Spec id (11–23) of a mark name. */
export const markId = (name) => GLYPH_MARKS.indexOf(name) + 11;

/** The distance anchors: at least one per aligned run of 8 tiles. */
export const FILLED_MARKS = Object.freeze(['bolt', 'slab', 'capsule', 'crossedDisc']);

/** Low MIX alternates these two. */
export const RHYTHM_MARKS = Object.freeze(['sunburst', 'crossedDisc']);

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const TAU = Math.PI * 2;

// Tetrominoes on the 4×4 cell grid, as [col, row] cells.
const TETROMINOES = Object.freeze({
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[1, 1], [2, 1], [1, 2], [2, 2]],
  T: [[0, 1], [1, 1], [2, 1], [1, 2]],
  L: [[1, 0], [1, 1], [1, 2], [2, 2]],
  S: [[1, 1], [2, 1], [0, 2], [1, 2]],
  Z: [[0, 1], [1, 1], [1, 2], [2, 2]], // "the skew"
});

const BUILD = {
  // 11 — disc r 0.10, 12 rays from r 0.12, length 0.16 (signed edit), butt caps.
  sunburst: () => {
    const ops = [{ type: 'disc', role: 'mark', cx: 0, cy: 0, r: 0.10 }];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU; const c = Math.cos(a); const s = Math.sin(a);
      ops.push({ type: 'seg', role: 'cut', x1: c * 0.12, y1: s * 0.12, x2: c * 0.28, y2: s * 0.28, w: 0.015, cap: 'butt' });
    }
    return ops;
  },

  // 12 — one tetromino plus 0–2 orphan cells on a 4×4 grid inside ±0.22, gap 0.02.
  pixelCluster: (rng) => {
    const shape = TETROMINOES[pick(rng, Object.keys(TETROMINOES))];
    const taken = new Set(shape.map(([c, r]) => r * 4 + c));
    const cells = shape.slice();
    const orphans = Math.floor(rng() * 3);
    for (let k = 0; k < orphans; k++) {
      const free = [];
      for (let i = 0; i < 16; i++) if (!taken.has(i)) free.push(i);
      const i = free[Math.floor(rng() * free.length)];
      taken.add(i); cells.push([i % 4, Math.floor(i / 4)]);
    }
    const pitch = 0.11; const size = 0.09; // 4 × 0.11 = 0.44 wide, cells 0.09 with a 0.02 gap
    return cells.map(([c, r]) => {
      const x = -0.22 + c * pitch + 0.01; const y = -0.22 + r * pitch + 0.01;
      return { type: 'poly', role: 'mark', pts: [[x, y], [x + size, y], [x + size, y + size], [x, y + size]] };
    });
  },

  // 13 — ring r 0.20 stroke 0.04; diagonal bar, stroke 0.045, round caps. A stroke, not a clip.
  slashedCircle: () => [
    { type: 'ring', role: 'mark', cx: 0, cy: 0, r: 0.20, w: 0.04 },
    { type: 'seg', role: 'cut', x1: -0.16, y1: -0.16, x2: 0.16, y2: 0.16, w: 0.045, cap: 'round' },
  ],

  // 14 — one wave, 1.5 periods, amplitude 0.08, across y = 0, stroke 0.05, round caps.
  squiggle: () => {
    const N = 36; const half = 0.22; const ops = [];
    const at = (i) => { const t = i / N; return [-half + t * 2 * half, 0.08 * Math.sin(t * 1.5 * TAU)]; };
    for (let i = 0; i < N; i++) {
      const [x1, y1] = at(i); const [x2, y2] = at(i + 1);
      ops.push({ type: 'seg', role: 'mark', x1, y1, x2, y2, w: 0.05, cap: 'round' });
    }
    return ops;
  },

  // 15 — one or two V's, stroke 0.05, opening 0.28, point at center, stack gap 0.08.
  // Up / down / left / right is the tile's pose.
  chevron: (rng) => {
    const two = rng() < 0.5;
    const offs = two ? [-0.065, 0.065] : [0]; // stack gap 0.08 between the two strokes, plus the stroke itself
    const ops = [];
    for (const dy of offs) {
      ops.push({ type: 'seg', role: 'mark', x1: -0.14, y1: dy - 0.13, x2: 0, y2: dy + 0.13, w: 0.05, cap: 'round' });
      ops.push({ type: 'seg', role: 'mark', x1: 0.14, y1: dy - 0.13, x2: 0, y2: dy + 0.13, w: 0.05, cap: 'round' });
    }
    return ops;
  },

  // 16 — six-vertex lightning polygon, width 0.16, height 0.40. A fixed template.
  bolt: () => [{
    type: 'poly', role: 'mark',
    pts: [[0.02, -0.20], [-0.08, 0.04], [-0.03, 0.04], [-0.02, 0.20], [0.08, -0.04], [0.03, -0.04]],
  }],

  // 17 — two rings r 0.14 at (±0.08, 0), stroke 0.035, same role. The vesica is the overlap.
  interlock: () => [
    { type: 'ring', role: 'mark', cx: -0.08, cy: 0, r: 0.14, w: 0.035 },
    { type: 'ring', role: 'mark', cx: 0.08, cy: 0, r: 0.14, w: 0.035 },
  ],

  // 18 — almond from two arcs, 0.40 × 0.18; triangle pupil, height 0.10, up or down by seed.
  eye: (rng) => {
    const up = rng() < 0.5 ? -1 : 1;
    return [
      { type: 'lens', role: 'mark', a: 0.20, h: 0.09 },
      { type: 'poly', role: 'cut', pts: [[0, 0.05 * up], [-0.05, -0.05 * up], [0.05, -0.05 * up]] },
    ];
  },

  // 19 — circle r 0.16 stroke 0.03, plus a crosshair of two strokes, length 0.28.
  knot: () => [
    { type: 'ring', role: 'mark', cx: 0, cy: 0, r: 0.16, w: 0.03 },
    { type: 'seg', role: 'cut', x1: -0.14, y1: 0, x2: 0.14, y2: 0, w: 0.03, cap: 'butt' },
    { type: 'seg', role: 'cut', x1: 0, y1: -0.14, x2: 0, y2: 0.14, w: 0.03, cap: 'butt' },
  ],

  // 20 — three stacked discs r 0.07 with a 0.02 gap, or one pill 0.36 × 0.16.
  capsule: (rng) => (rng() < 0.5
    ? [-0.16, 0, 0.16].map((cy) => ({ type: 'disc', role: 'mark', cx: 0, cy, r: 0.07 }))
    : [{ type: 'seg', role: 'mark', x1: 0, y1: -0.10, x2: 0, y2: 0.10, w: 0.16, cap: 'round' }]),

  // 21 — parallelogram 0.36 × 0.22, shear 0.08. Optional second flat polygon,
  // offset 0.04, in the accent role, drawn behind. No lighting model.
  slab: (rng) => {
    const face = [[-0.14, -0.11], [0.22, -0.11], [0.14, 0.11], [-0.22, 0.11]];
    const ops = [];
    if (rng() < 0.6) ops.push({ type: 'poly', role: 'accent', pts: face.map(([x, y]) => [x + 0.04, y + 0.04]) });
    ops.push({ type: 'poly', role: 'mark', pts: face });
    return ops;
  },

  // 22 — three filled chevron heads in a row, each 0.12 wide, gap 0.04. Direction is the pose.
  arrows: () => [-0.22, -0.06, 0.10].map((x) => ({
    type: 'poly', role: 'mark',
    pts: [[x, -0.12], [x + 0.05, -0.12], [x + 0.12, 0], [x + 0.05, 0.12], [x, 0.12], [x + 0.07, 0]],
  })),

  // 23 — filled disc r 0.18; an X of two strokes, length 0.28, in the GROUND role (knockout).
  crossedDisc: () => {
    const d = 0.14 * Math.SQRT1_2;
    return [
      { type: 'disc', role: 'mark', cx: 0, cy: 0, r: 0.18 },
      { type: 'seg', role: 'ground', x1: -d, y1: -d, x2: d, y2: d, w: 0.035, cap: 'butt' },
      { type: 'seg', role: 'ground', x1: -d, y1: d, x2: d, y2: -d, w: 0.035, cap: 'butt' },
    ];
  },
};

// Quarter turns are exact: no trig, so a posed mark has the same bounds as its
// construction with the axes swapped.
const turnPt = (x, y, q) => (q === 0 ? [x, y] : q === 1 ? [-y, x] : q === 2 ? [-x, -y] : [y, -x]);

function poseOp(op, q) {
  if (q === 0) return op;
  switch (op.type) {
    case 'disc': case 'ring': { const [cx, cy] = turnPt(op.cx, op.cy, q); return { ...op, cx, cy }; }
    case 'seg': {
      const [x1, y1] = turnPt(op.x1, op.y1, q); const [x2, y2] = turnPt(op.x2, op.y2, q);
      return { ...op, x1, y1, x2, y2 };
    }
    case 'poly': return { ...op, pts: op.pts.map(([x, y]) => turnPt(x, y, q)) };
    case 'lens': return { ...op, vertical: (q % 2 === 1) !== !!op.vertical };
    default: throw new Error(`unknown glyph op: ${op.type}`);
  }
}

/**
 * Build a mark's ops in tile-local units, posed.
 * @param {string} name   one of GLYPH_MARKS
 * @param {() => number} rng   the tile's seeded stream (variant choices)
 * @param {number} pose   0 | 90 | 180 | 270
 */
export function buildMark(name, rng, pose = 0) {
  if (!BUILD[name]) throw new Error(`unknown glyph mark: ${name}`);
  if (!POSES.includes(pose)) throw new Error(`glyph pose ${pose} is not a quarter turn`);
  const q = pose / 90;
  return BUILD[name](rng).map((op) => withBox(poseOp(op, q)));
}

// A conservative axis-aligned box around one op (#1101): the sampler walks every pixel of the mark box, and
// most pixels are nowhere near most ops (a sunburst is thirteen ops). A pixel outside an op's box cannot hit
// it, so it skips the op. The box only ever errs outward (strokes use a half-width that covers any DRIFT
// scale down to 0.4), so culling never changes a pixel.
const BOX_PAD = 1e-9;
function opBox(op) {
  switch (op.type) {
    case 'disc': return [op.cx - op.r, op.cy - op.r, op.cx + op.r, op.cy + op.r];
    case 'ring': { const e = op.r + Math.max(op.w, MIN_STROKE / 0.4) / 2; return [op.cx - e, op.cy - e, op.cx + e, op.cy + e]; }
    case 'seg': {
      const h = Math.max(op.w, MIN_STROKE / 0.4) / 2;
      return [Math.min(op.x1, op.x2) - h, Math.min(op.y1, op.y2) - h, Math.max(op.x1, op.x2) + h, Math.max(op.y1, op.y2) + h];
    }
    case 'poly': {
      let a = Infinity; let b = Infinity; let c = -Infinity; let d = -Infinity;
      for (const [x, y] of op.pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
      return [a, b, c, d];
    }
    case 'lens': return op.vertical ? [-op.h, -op.a, op.h, op.a] : [-op.a, -op.h, op.a, op.h];
    default: return null;
  }
}
const withBox = (op) => { const b = opBox(op); return b ? { ...op, bb: [b[0] - BOX_PAD, b[1] - BOX_PAD, b[2] + BOX_PAD, b[3] + BOX_PAD] } : op; };

const strokeW = (w, scale) => Math.max(w, MIN_STROKE / scale);

function hit(op, x, y, scale) {
  const bb = op.bb; // hand-built ops (tests) have no box and are tested directly
  if (bb !== undefined && (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3])) return false;
  switch (op.type) {
    case 'disc': { const a = x - op.cx; const b = y - op.cy; return a * a + b * b < op.r * op.r; }
    case 'ring': {
      const a = x - op.cx; const b = y - op.cy;
      return Math.abs(Math.sqrt(a * a + b * b) - op.r) < strokeW(op.w, scale) / 2;
    }
    case 'seg': {
      const dx = op.x2 - op.x1; const dy = op.y2 - op.y1;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? ((x - op.x1) * dx + (y - op.y1) * dy) / len2 : 0;
      if (op.cap === 'butt' && (t < 0 || t > 1)) return false;
      const tc = Math.min(1, Math.max(0, t));
      const px = op.x1 + dx * tc - x; const py = op.y1 + dy * tc - y;
      const half = strokeW(op.w, scale) / 2;
      return px * px + py * py < half * half;
    }
    case 'poly': {
      let inside = false; const p = op.pts;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const pi = p[i]; const pj = p[j]; // indexed, not destructured: this runs once per pixel
        const xi = pi[0]; const yi = pi[1]; const xj = pj[0]; const yj = pj[1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    case 'lens': {
      const [u, v] = op.vertical ? [y, x] : [x, y];
      const R = (op.a * op.a + op.h * op.h) / (2 * op.h); const d = R - op.h;
      return u * u + (v - d) * (v - d) < R * R && u * u + (v + d) * (v + d) < R * R;
    }
    default: return false;
  }
}

/**
 * The role painted at tile-local point (x, y), or null for the tile's ground.
 * `scale` is the DRIFT pulse: the mark is scaled about the tile center, and a
 * stroke that would drop under MIN_STROKE after scaling is clamped up to it.
 */
export function sampleMark(ops, x, y, scale = 1) {
  const sx = x / scale; const sy = y / scale;
  // Nothing is ever painted outside the mark box, and most of a tile is negative space:
  // leave before walking the ops.
  if (sx <= -MARK_BOX || sx >= MARK_BOX || sy <= -MARK_BOX || sy >= MARK_BOX) return null;
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i]; const bb = op.bb;
    if (bb !== undefined && (sx < bb[0] || sx > bb[2] || sy < bb[1] || sy > bb[3])) continue; // not even a call for a shape this pixel cannot touch
    if (hit(op, sx, sy, scale)) return op.role;
  }
  return null;
}

/**
 * Analytic axis-aligned bounds of a mark at scale 1, stroke caps included.
 * @returns {{minX, maxX, minY, maxY}}
 */
export function markBounds(ops) {
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  const add = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  for (const op of ops) {
    if (op.type === 'disc' || op.type === 'ring') {
      const r = op.r + (op.type === 'ring' ? Math.max(op.w, MIN_STROKE) / 2 : 0);
      add(op.cx - r, op.cy - r); add(op.cx + r, op.cy + r);
    } else if (op.type === 'seg') {
      const half = Math.max(op.w, MIN_STROKE) / 2;
      if (op.cap === 'round') {
        add(op.x1 - half, op.y1 - half); add(op.x1 + half, op.y1 + half);
        add(op.x2 - half, op.y2 - half); add(op.x2 + half, op.y2 + half);
      } else {
        const dx = op.x2 - op.x1; const dy = op.y2 - op.y1; const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * half; const ny = (dx / len) * half;
        add(op.x1 + nx, op.y1 + ny); add(op.x1 - nx, op.y1 - ny); add(op.x2 + nx, op.y2 + ny); add(op.x2 - nx, op.y2 - ny);
      }
    } else if (op.type === 'poly') {
      for (const [x, y] of op.pts) add(x, y);
    } else if (op.type === 'lens') {
      if (op.vertical) { add(-op.h, -op.a); add(op.h, op.a); } else { add(-op.a, -op.h); add(op.a, op.h); }
    }
  }
  return { minX, maxX, minY, maxY };
}

/** Every stroke width a mark uses (for the degenerate ban). */
export const strokeWidths = (ops) => ops.filter((o) => o.type === 'ring' || o.type === 'seg').map((o) => o.w);

/** The roles a mark paints with, ground knockouts excluded. */
export const motifRoles = (ops) => [...new Set(ops.map((o) => o.role).filter((r) => r !== 'ground'))];
