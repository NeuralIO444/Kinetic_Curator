// dishLifeBorn.mjs — #2152 slice 2 (re-cut): DISH LIFE births are copies of the stage's own marks. Pure.
//
// Matt's rulings (2026-11-16, docs/design/dish-life-on-assets.md "Slice 2, re-cut"): Life is never drawn; where the culture
// is alive on empty ground, a COPY OF THE NEAREST DEALT MARK stands there. Copies are real marks (same asset, colour,
// material, the parent's own motion that frame), always smaller and quieter than a dealt mark; at most BORN_CAP of them;
// their total ink never passes BORN_SHARE of the visible dealt ink; births land NEAREST THEIR PARENT FIRST.
//
// The law, per frame (a pure function of the published culture, the LIFE dial and the frame's marks — no memory):
//   occupied    a dish cell any mark's body covers (the culture seed's own coverage field) — never a birth there
//   parents     the dealt marks still visible (not terrain, not the poem, not a copy, not the culture's own cells); each
//               claims the cell under its centre, first in layer/item order
//   distance    rings across the dish grid outward from the parents' cells (8-neighbour steps); a cell's parent is the
//               one whose ring reached it first
//   candidates  cells not occupied whose culture is alive or still decaying (level above the LIFE floor), nearest ring
//               first, ties by cell index
//   count       at most ceil(BORN_CAP × dial) — raising the dial lets the rings spread farther
//   share       births stop when the copies' ink (|scale × scaleY| × alpha) would pass BORN_SHARE × the parents' ink
//   copy        the parent, at the cell centre, scale × BORN_SCALE and alpha × BORN_ALPHA, then faded and shrunk by its
//               own cell's level (the slice 1 fade, at full strength: a copy lives only by its cell)
//   lean        then the ferrofluid's lean, as a mark standing there would take it (order 2 of the seam)
// No parents → no copies (never a shape of Life's own). Nothing is edited in place: the result is extra items.

import { coverageField } from './dishLifeSeed.mjs';
import { LIFE_GONE_BELOW, LIFE_SHRINK, easedLevel } from './dishLifeCouple.mjs';
import { markDriftDelta } from './dishFluidDrift.mjs';
import { isFluidDuplicate } from './dishFluidDuplicates.mjs';

/** The most copies Life seats at once (Matt, 2026-11-16 — the unification ruling). */
export const BORN_CAP = 256;
/** The copies' total ink never passes this share of the visible dealt marks' ink (Matt, 2026-11-16). */
export const BORN_SHARE = 0.5;
/** A copy's size relative to its parent: always smaller than a dealt mark. */
export const BORN_SCALE = 0.6;
/** A copy's opacity relative to its parent: always quieter than a dealt mark. */
export const BORN_ALPHA = 0.7;
/** Every copy's key starts with this — the copies are recognisable and never copied themselves. */
export const BORN_KEY = 'life-born:';

export const isLifeBorn = (it) => !!it && typeof it.key === 'string' && it.key.startsWith(BORN_KEY);

const isTerrainItem = (it) => it.held === true || it.locked === true || it.life === 'bedrock';
const keyStarts = (it, p) => typeof it.key === 'string' && it.key.startsWith(p);
/** A mark that can be copied: a dealt mark, not terrain, not the poem, not a copy, not the culture's own drawing. */
const canParent = (it) =>
  !isTerrainItem(it) &&
  !isLifeBorn(it) &&
  !isFluidDuplicate(it) &&
  !keyStarts(it, 'field-') &&
  !keyStarts(it, 'life:') &&
  !keyStarts(it, 'speck:');

const fin = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const inkOf = (scale, scaleY, alpha) => Math.abs(scale * scaleY) * Math.max(0, alpha);

/**
 * The born copies for one frame. `published`: the field stage's holder ({ active, cols, rows, level }). `layers`: the
 * frame's content layers in stack order, each { items }. `opts`: { W, H, life (the LIFE dial, already shed-folded),
 * lean (the fluid's drift field or null), ease (slice 3: read the level eased across a cycle roll), share (the ink share; BORN_SHARE unless a suite isolates another rule) }. Returns one array per layer (same order): the copies whose parent lives in
 * that layer. Every array is empty when the gate is closed.
 */
export function lifeBornItems(
  published,
  layers,
  { W, H, life = 0, lean = null, share = BORN_SHARE, ease = false } = {},
) {
  const list = Array.isArray(layers) ? layers : [];
  const out = list.map(() => []);
  const dial = Math.min(1, Math.max(0, fin(life, 0)));
  if (!(dial > 0) || !published || published.active !== true || !published.level) return out;
  const cols = published.cols | 0;
  const rows = published.rows | 0;
  const n = cols * rows;
  const w = fin(W, 0);
  const h = fin(H, 0);
  if (!(n > 0) || published.level.length < n || !(w > 0) || !(h > 0)) return out;
  const levelAt = (i) => easedLevel(published, i, ease); // slice 3: across a roll, copies fade like the marks

  // parents claim the cell under their centre (first in layer/item order); every mark's body marks its cells occupied
  const owner = new Int32Array(n).fill(-1);
  const parents = [];
  const bodies = [];
  let dealtInk = 0;
  for (let li = 0; li < list.length; li++) {
    const items = list[li] && Array.isArray(list[li].items) ? list[li].items : [];
    for (const it of items) {
      if (!it || !Number.isFinite(it.x) || !Number.isFinite(it.y)) continue;
      bodies.push(it);
      if (!canParent(it)) continue;
      const alpha = fin(it.alpha, 0);
      const scale = fin(it.scale, 1);
      const scaleY = fin(it.scaleY, scale);
      if (!(alpha > 0) || !(Math.abs(scale * scaleY) > 0)) continue;
      const cx = Math.floor((it.x / w) * cols);
      const cy = Math.floor((it.y / h) * rows);
      if (!(cx >= 0 && cx < cols && cy >= 0 && cy < rows)) continue;
      dealtInk += inkOf(scale, scaleY, alpha);
      const i = cy * cols + cx;
      if (owner[i] === -1) {
        owner[i] = parents.length;
        parents.push({ it, li, scale, scaleY, alpha });
      }
    }
  }
  if (!parents.length) return out;
  const cov = coverageField(bodies, { canvasW: w, canvasH: h, cols, rows });

  // rings outward from the parents' cells: breadth-first over the 8-neighbourhood, sources in cell order
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (owner[i] !== -1) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % cols;
    const y = (i - x) / cols;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= cols) continue;
        const j = yy * cols + xx;
        if (dist[j] !== -1) continue;
        dist[j] = dist[i] + 1;
        owner[j] = owner[i];
        queue[tail++] = j;
      }
    }
  }

  const cands = [];
  for (let i = 0; i < n; i++) {
    if (cov[i] > 0 || dist[i] <= 0) continue;
    if (!(levelAt(i) > LIFE_GONE_BELOW)) continue;
    cands.push(i);
  }
  if (!cands.length) return out;
  cands.sort((a, b) => dist[a] - dist[b] || a - b);

  const maxCount = Math.min(BORN_CAP, Math.ceil(BORN_CAP * dial));
  const inkBudget = (share >= 0 ? share : BORN_SHARE) * dealtInk;
  let ink = 0;
  let count = 0;
  for (const i of cands) {
    if (count >= maxCount) break;
    const p = parents[owner[i]];
    const f = Math.min(1, levelAt(i));
    const grow = BORN_SCALE * (1 - LIFE_SHRINK * (1 - f));
    const scale = p.scale * grow;
    const scaleY = p.scaleY * grow;
    const alpha = p.alpha * BORN_ALPHA * f;
    const add = inkOf(scale, scaleY, alpha);
    if (ink + add > inkBudget) break; // the share rule: nearest-first, so nothing farther may jump the queue
    ink += add;
    count++;
    const cx = i % cols;
    const cy = (i - cx) / cols;
    let x = ((cx + 0.5) / cols) * w;
    let y = ((cy + 0.5) / rows) * h;
    const d = lean ? markDriftDelta(lean, x, y) : null;
    if (d) {
      x += d.dx;
      y += d.dy;
    }
    out[p.li].push({ ...p.it, x, y, scale, scaleY, alpha, index: i, key: `${BORN_KEY}${i}` });
  }
  return out;
}
