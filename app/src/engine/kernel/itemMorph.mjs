/**
 * itemMorph.mjs — per-item transition between two resolved layer item
 * lists (chip clicks: mode, behave, palette, asset-set). Every particle
 * stays alive through a chip switch and tweens position/scale/rotation/
 * color toward its new layout, instead of the two rendered frames
 * cross-dissolving as pixels (that remains the live loop's fallback for
 * the atlas-bake-wait window and for manual voice-MIX scrubbing — see
 * liveLoop.mjs).
 *
 * There is no true cross-generator identity: grid, fibonacci, cellular
 * automaton, and the swarm physics each produce their own item set with
 * their own key scheme, so "item 5 in fibonacci mode" has no ground-truth
 * counterpart in cellular-automaton mode. matchItems() approximates
 * identity by pairing same-asset items by nearest on-screen distance
 * within each asset group — the same shape slides to its nearest new
 * slot rather than an arbitrary one.
 *
 * #419: the pairing is planned ONCE at transition start (planMorph) and
 * held for the whole MIX duration; each frame only resolves the plan's
 * target slots against its own live item list. Re-matching every frame
 * was O(n^2) per frame AND let near-tied pairs flip mid-flight when the
 * breathing layout (life drift, displacement warp) shifted a target —
 * items darted across their group instead of gliding one straight line.
 *
 * #623 SLEIGHT-OF-HAND v2 — a vocabulary, not one move. #564's single
 * scale-to-zero wave read as a glitch: the eye saw the mechanism, not the
 * magic. Each matched node now draws a seeded pick from a small move set in
 * its own seeded window (moveFor): travelers SMEAR (stretch along the
 * velocity vector, opacity dips ~30%, costume swaps at peak stretch —
 * carried by the velocitySmear shader via synthetic vx/vy), sitters BREATHE
 * (dip to 40%, never zero, regrow with overshoot), and in dense clusters
 * (or by seeded pick) they FADE (scale untouched, alpha dips to ~15%, swap
 * at the bottom). The swap-at-minimum contract survives — the minimum is
 * just each move's lowest-visibility moment now. No node ever sits still,
 * fully visible, mid-change; no two adjacent nodes telegraph the same
 * mechanism.
 * Consequences kept from #564:
 *  - colour/accent no longer interpolate. A tint lerp is a NEW ATLAS CELL
 *    every frame (the tint is baked — see liveAtlas.mjs), which is the
 *    rebake churn of #561. Swapping at the minimum costs one cell, not sixty.
 *  - unmatched items no longer alpha-fade (that fade was the optical
 *    cross-dissolve the Always Alive protocol bans): a leaver shrinks out by
 *    its window's midpoint, a joiner grows in from it. (#626 redoes both.)
 *  - every window closes at or before t=1 (delay ≤ STAGGER, dur ≥ DUR_MIN,
 *    STAGGER + DUR_MIN + DUR_JIT === 1), so the completion frame's handoff
 *    to raw toItems holds no frame and pops nothing.
 *
 * KNOWN CEILING — the swap is hidden by SAMPLING, not by a dead band: the
 * envelope minimum is at u=0.5, but a frame only lands NEAR that instant.
 * How near is a function of how many frames the node's window gets, so the
 * distance from the minimum on the swap frame scales with MIX: negligible
 * at the MIXes the instrument actually plays, degrading toward a cut below
 * roughly 0.75s — i.e. a sub-second MIX no longer has the frames to hide
 * anything and degrades toward the cut it is already asking for.
 */

function dist2(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function groupByAsset(items) {
  const groups = new Map();
  for (const it of items) {
    const k = it.assetId || it.role || 'default';
    let g = groups.get(k);
    if (!g) { g = []; groups.set(k, g); }
    g.push(it);
  }
  return groups;
}

/**
 * #572 — global greedy nearest pairing, without the O(n^3) rescan. The rule is
 * the one the old nested loop implemented: repeatedly take the closest
 * remaining (from, to) pair, first in row-major order on a distance tie, i.e.
 * lexicographic (d, from index, to index). Returns [[fi, tj], ...] in pick
 * order — parity with the old loop is pinned by a selfcheck oracle.
 *
 * Each from-item carries its nearest remaining target in a min-heap keyed
 * (d, i). A popped entry whose target was taken meanwhile is recomputed and
 * pushed back; keys only ever grow as targets disappear, so the first valid pop
 * is the true global minimum. Nearest lookups walk a uniform grid ring by
 * ring, and keep going while a ring could still tie (<=, not <) so the lowest
 * index wins a tie exactly as before. Non-finite coordinates read as 0.
 */
function greedyNearest(fs, ts) {
  const n = fs.length, m = ts.length;
  if (!n || !m) return [];
  const fin = (v) => (Number.isFinite(v) ? v : 0);
  const tx = new Float64Array(m), ty = new Float64Array(m);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let j = 0; j < m; j++) {
    const x = tx[j] = fin(ts[j].x), y = ty[j] = fin(ts[j].y);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const w = x1 - x0, h = y1 - y0;
  const cell = Math.max(Math.sqrt((w * h) / m), Math.max(w, h) / m, 1);
  const cols = Math.floor(w / cell) + 1, rows = Math.floor(h / cell) + 1;
  const cellOf = (v, lo, cnt) => Math.min(cnt - 1, Math.max(0, Math.floor((v - lo) / cell)));
  const grid = Array.from({ length: cols * rows }, () => []);
  for (let j = 0; j < m; j++) grid[cellOf(ty[j], y0, rows) * cols + cellOf(tx[j], x0, cols)].push(j);
  const taken = new Uint8Array(m);
  const maxRing = Math.max(cols, rows);

  let bestJ = -1, bestD = Infinity;
  const scan = (c, qx, qy) => {
    const g = grid[c];
    for (let k = 0; k < g.length; k++) {
      const j = g[k];
      if (taken[j]) continue;
      const dx = qx - tx[j], dy = qy - ty[j];
      const d = dx * dx + dy * dy;
      if (d < bestD || (d === bestD && j < bestJ)) { bestD = d; bestJ = j; }
    }
  };
  const nearest = (qx, qy) => {
    bestJ = -1; bestD = Infinity;
    const cx = cellOf(qx, x0, cols), cy = cellOf(qy, y0, rows);
    for (let r = 0; r <= maxRing; r++) {
      if (bestJ >= 0 && (r - 1) * (r - 1) * cell * cell > bestD && r > 0) break;
      const ya = cy - r, yb = cy + r, xa = cx - r, xb = cx + r;
      for (let y = Math.max(0, ya); y <= Math.min(rows - 1, yb); y++) {
        if (y === ya || y === yb) {
          for (let x = Math.max(0, xa); x <= Math.min(cols - 1, xb); x++) scan(y * cols + x, qx, qy);
        } else {
          if (xa >= 0) scan(y * cols + xa, qx, qy);
          if (xb < cols && xb !== xa) scan(y * cols + xb, qx, qy);
        }
      }
    }
    return bestJ;
  };

  // min-heap of { d, i, j }, ordered (d, i)
  const heap = [];
  const less = (a, b) => a.d < b.d || (a.d === b.d && a.i < b.i);
  const push = (e) => {
    let k = heap.push(e) - 1;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (!less(heap[k], heap[up])) break;
      [heap[k], heap[up]] = [heap[up], heap[k]];
      k = up;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let s = k;
        if (l < heap.length && less(heap[l], heap[s])) s = l;
        if (r < heap.length && less(heap[r], heap[s])) s = r;
        if (s === k) break;
        [heap[k], heap[s]] = [heap[s], heap[k]];
        k = s;
      }
    }
    return top;
  };
  const fx = new Float64Array(n), fy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    fx[i] = fin(fs[i].x); fy[i] = fin(fs[i].y);
    const j = nearest(fx[i], fy[i]);
    push({ d: bestD, i, j });
  }

  const picks = [];
  while (heap.length && picks.length < m) {
    const e = pop();
    if (!taken[e.j]) { taken[e.j] = 1; picks.push([e.i, e.j]); continue; }
    const j = nearest(fx[e.i], fy[e.i]);
    if (j >= 0) push({ d: bestD, i: e.i, j });
  }
  return picks;
}

/**
 * Plan the from->to pairing ONCE at transition start (#419). Greedy
 * nearest within each asset group (O(n^2) per group — run once per chip
 * click, not once per frame). The target side is recorded as SLOTS
 * { g: assetGroupKey, j: original index } rather than object refs, so
 * every blend frame can resolve them against its own live target list:
 * life drift and the displacement warp move targets every frame, and the
 * pairing must not follow them.
 * Returns { pairs: [{ f, g, j }], onlyFrom: [items], onlyTo: [{ g, j }] }.
 */
export function planMorph(fromItems, toItems, seed = 0) {
  const fromGroups = groupByAsset(fromItems || []);
  const toGroups = groupByAsset(toItems || []);
  const pairs = [];
  const onlyFrom = [];
  const onlyTo = [];
  const allKeys = new Set([...fromGroups.keys(), ...toGroups.keys()]);

  const leftoverFrom = [];
  const leftoverTo = [];

  // Pass 1: exact same-asset nearest matching
  for (const k of allKeys) {
    const fs = fromGroups.get(k) || [];
    const ts = (toGroups.get(k) || []).map((item, origIdx) => ({ item, origIdx, g: k }));
    const usedF = new Uint8Array(fs.length), usedT = new Uint8Array(ts.length);
    for (const [i, j] of greedyNearest(fs, ts.map((t) => t.item))) {
      pairs.push({ f: fs[i], g: k, j: ts[j].origIdx });
      usedF[i] = 1; usedT[j] = 1;
    }
    fs.forEach((it, i) => { if (!usedF[i]) leftoverFrom.push(it); });
    ts.forEach((t, j) => { if (!usedT[j]) leftoverTo.push(t); });
  }

  // Pass 2: cross-asset nearest spatial matching (Always Alive: no optical cross-fade dissolve)
  // When modes or stub chips use different asset sets, nodes physically travel across the
  // canvas to their nearest destination slot rather than dissolving in place.
  const usedF = new Uint8Array(leftoverFrom.length), usedT = new Uint8Array(leftoverTo.length);
  for (const [i, j] of greedyNearest(leftoverFrom, leftoverTo.map((t) => t.item))) {
    pairs.push({ f: leftoverFrom[i], g: leftoverTo[j].g, j: leftoverTo[j].origIdx });
    usedF[i] = 1; usedT[j] = 1;
  }

  onlyFrom.push(...leftoverFrom.filter((_, i) => !usedF[i]));
  onlyTo.push(...leftoverTo.filter((_, j) => !usedT[j]).map((t) => ({ g: t.g, j: t.origIdx })));
  return { pairs, onlyFrom, onlyTo, seed: (seed >>> 0) };
}

/**
 * Compat surface: materialize a plan into the original ref-tuple shape
 * ([[fromItem, toItem], ...]) against the same `to` it was built from.
 * Greedy order is unchanged, so results are identical to the pre-#419
 * matcher.
 */
export function matchItems(fromItems, toItems) {
  const plan = planMorph(fromItems, toItems);
  const toGroups = groupByAsset(toItems || []);
  return {
    pairs: plan.pairs.map(({ f, g, j }) => [f, toGroups.get(g)[j]]),
    onlyFrom: plan.onlyFrom,
    onlyTo: plan.onlyTo.map(({ g, j }) => toGroups.get(g)[j]),
  };
}

function lerp(a, b, t) { return a + (b - a) * t; }

/** Shortest-path angle interpolation (degrees) — 350deg -> 10deg turns +20, not -340. */
function lerpAngle(a, b, t) {
  const d = ((b - a) % 360 + 540) % 360 - 180;
  return a + d * t;
}


// ── #564 director: the seeded swap wave ─────────────────────────────────────
// Each node owns a window [delay, delay+dur] inside the transition's [0,1].
// STAGGER + DUR_MIN + DUR_JIT === 1 exactly, so the latest-starting, longest-
// running node still closes at t=1 — no node is mid-swap at the handoff.
const STAGGER = 0.35;
const DUR_MIN = 0.5;
const DUR_JIT = 0.15;

/** xorshift-ish avalanche on (index, seed). Index-stable: same seed, same wave. */
function hash01(i, seed) {
  let h = (Math.imul((i | 0) + 0x9e3779b9, 0x85ebca6b) ^ (seed | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

/** The node at output index `i`: when its swap starts and how long it takes. */
export function nodeWindow(i, seed = 0) {
  return {
    delay: hash01(i * 2, seed) * STAGGER,
    dur: DUR_MIN + hash01(i * 2 + 1, seed) * DUR_JIT,
  };
}

/** Transition progress -> this node's own progress, clamped to its window. */
function nodeT(t, i, seed) {
  const { delay, dur } = nodeWindow(i, seed);
  const u = (t - delay) / dur;
  return u <= 0 ? 0 : (u >= 1 ? 1 : u);
}

/** Smootherstep — zero slope at both ends, so no node starts or stops with a jerk. */
function ease(x) {
  const c = x <= 0 ? 0 : (x >= 1 ? 1 : x);
  return c * c * c * (c * (c * 6 - 15) + 10);
}

const shrinkEnv = (u) => 1 - ease(u * 2);      // 1 -> 0 across the window's first half
const growEnv = (u) => ease(u * 2 - 1);        // 0 -> 1 across its second half
// (swapEnv died in #623: one scale-to-zero wave for every state change read
// as a glitch, not a trick. Matched nodes now draw from the move vocabulary
// below; growEnv/shrinkEnv survive only for the unmatched joiner/leaver
// paths until #626 redoes them.)

// ── #623: the move vocabulary ───────────────────────────────────────────────
// The stagger (nodeWindow) still picks WHEN a node plays; a second seeded
// hash picks WHICH move. Same (index, seed) replays the same choreography —
// deterministic, rehearsable. The swap-at-minimum contract survives: the
// costume still comes from exactly one side, chosen at u=0.5 — but the
// minimum is now each move's lowest-visibility moment (peak stretch, the
// bottom of the breath, the bottom of the fade), never scale zero.
export const MOVE_SMEAR = 0;   // the traveler: stretches along its motion, swaps at peak stretch
export const MOVE_BREATH = 1;  // the sitter: dips to 40% (never zero), regrows with overshoot
export const MOVE_FADE = 2;    // the quiet one: scale untouched, alpha dips, swaps at the bottom

/** Scene units a node must travel to count as a traveler (smears). */
export const SMEAR_TRAVEL = 48;
/** At/above this node count, sitters fade instead of breathe — less churn. */
export const DENSE_COUNT = 256;
/**
 * Peak smear drive in scene-units/frame of synthetic velocity. 12 × the
 * shader's SMEAR_K (0.06) ≈ 0.72 stretch — the quad grows ~1.7x along its
 * travel direction at the window's midpoint, then relaxes.
 */
export const SMEAR_VEL = 12;

const MOVE_SALT = 0x51ed27;

/**
 * Which move the node at output index `i` plays. Travelers smear; in dense
 * clusters sitters fade; otherwise a second seeded hash splits sitters
 * between breath and fade. Index-stable per seed, like nodeWindow.
 */
export function moveFor(i, seed, travel, dense) {
  if (travel >= SMEAR_TRAVEL) return MOVE_SMEAR;
  if (dense) return MOVE_FADE;
  return hash01(i, (seed ^ MOVE_SALT) | 0) < 0.5 ? MOVE_BREATH : MOVE_FADE;
}

/**
 * Breath: anticipation dip to 40% (never zero), then a spring regrow with a
 * slight overshoot — game-feel follow-through. The kink at u=0.5 is the snap
 * the eye follows; the costume changes underneath it.
 */
function breathEnv(u) {
  if (u <= 0.5) return 1 - 0.6 * ease(u * 2);
  const v = (u - 0.5) * 2; // 0..1
  return 0.4 + 0.6 * (1 - Math.cos(v * Math.PI * 1.5) * Math.exp(-3 * v));
}

/** Alpha multiplier per move over the node's window u in [0,1]. */
function moveAlpha(move, u) {
  const dip = Math.sin(Math.PI * u); // 0 → 1 → 0, peak mid-window
  if (move === MOVE_SMEAR) return 1 - 0.3 * dip;  // opacity dips ~30% at peak stretch
  if (move === MOVE_FADE) return 1 - 0.85 * dip;   // dips to ~15%; the swap hides at the bottom
  return 1;                                        // breath: scale does the talking
}

/** Scale multiplier per move. Smear and fade never touch scale. */
function moveScale(move, u) {
  return move === MOVE_BREATH ? breathEnv(u) : 1;
}

const numOr = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * Blend fromItems -> toItems at eased t in [0,1]. t<=0 returns fromItems
 * verbatim, t>=1 returns toItems verbatim (reference equality, so callers
 * can drop the transition once the blended list === toItems).
 *
 * #623: every matched node plays its seeded move (moveFor) inside its own
 * window. A matched pair travels (x/y/rotation/alpha/base scale) on its own
 * eased progress u while its drawn scale/alpha ride the move's envelope —
 * smear stretches along travel with a ~30% opacity dip, breath dips to 40%
 * scale with overshoot regrow, fade dips alpha to ~15% with scale untouched.
 * Its COSTUME (asset, colour, accent, role, key) is the source item's below
 * u=0.5 and the target item's above it, so the swap only ever happens at
 * the move's lowest-visibility moment. An unmatched target grows in from
 * the midpoint; an unmatched source shrinks out by it. Nothing lerps a tint.
 *
 * `plan` is the planMorph() result captured at transition start (#419):
 * the pairing stays fixed for the whole transition while every slot
 * resolves against THIS frame's targets, so endpoints breathe with the
 * live layout but an item never changes target mid-flight. Omitted
 * (tests, one-shot blends) => a fresh plan, identical to the old
 * per-call match.
 *
 * DRAW ORDER is array order (packInstanceData never re-sorts), so it must be
 * continuous at BOTH ends of the blend or overlapping items flip stacking in one
 * frame (a z-fight): t<=0 returns fromItems in ITS order, and the completion
 * frame presents raw toItems (#444). Emitting in raw to-order for every t fixed
 * the end but flipped the order on the very first blend frame of every chip click.
 * Now each item carries a depth key that slides from its from-rank to its
 * to-rank; the list is stably sorted by it. The key reaches pure to-rank by
 * t = ORDER_SETTLE, so from there the first |to| entries ARE raw to-order (and
 * leavers trail, at ~0 scale since #564) — no flip at the handoff either.
 */
const ORDER_SETTLE = 0.9;

export function blendItems(fromItems, toItems, t, plan = null) {
  if (t <= 0) return fromItems;
  if (t >= 1) return toItems;
  const resolved = plan || planMorph(fromItems, toItems);
  const { pairs, onlyFrom } = resolved;
  const seed = resolved.seed | 0;
  const toList = toItems || [];
  const toGroups = groupByAsset(toList);
  const idxOf = new Map(toList.map((it, i) => [it, i]));
  const partner = new Array(toList.length).fill(null); // to-index -> matched from-item
  for (const { f, g, j } of pairs) {
    const to = toGroups.get(g)?.[j];
    if (!to) continue; // defensive: slot set shrank (shouldn't mid-transition)
    const i = idxOf.get(to);
    if (i === undefined || partner[i]) continue; // defensive: unresolvable / duplicate ref
    partner[i] = f;
  }
  const fromList = fromItems || [];
  const idxFrom = new Map(fromList.map((it, i) => [it, i]));
  const fromLen = fromList.length || 1;
  const toLen = toList.length || 1;
  const w = Math.min(1, t / ORDER_SETTLE); // depth-key weight: 0 = from order, 1 = to order
  const out = []; // { o: item, k: depth key }
  for (let i = 0; i < toList.length; i++) {
    const to = toList[i];
    const f = partner[i];
    const toRank = i / toLen;
    const u = nodeT(t, i, seed);
    if (f) {
      const fromRank = (idxFrom.get(f) ?? i) / fromLen;
      const g = ease(u); // travel progress — eased so the node's own move has no jerk
      // #623: the node's move, picked seeded per index. The costume still
      // swaps at u=0.5 — each move's lowest-visibility moment — never a
      // blend of the two sides, so a node is never a third thing that
      // exists in neither pose (and never needs an atlas cell for one).
      const ffx = Number.isFinite(f.x) ? f.x : 0, ffy = Number.isFinite(f.y) ? f.y : 0;
      const ttx = Number.isFinite(to.x) ? to.x : 0, tty = Number.isFinite(to.y) ? to.y : 0;
      const dx = ttx - ffx, dy = tty - ffy;
      const travel = Math.hypot(dx, dy);
      const move = moveFor(i, seed, travel, toList.length >= DENSE_COUNT);
      const o = {
        ...(u < 0.5 ? f : to),
        x: lerp(f.x, to.x, g),
        y: lerp(f.y, to.y, g),
        scale: lerp(Number(f.scale) || 1, Number(to.scale) || 1, g) * moveScale(move, u),
        rotation: lerpAngle(Number(f.rotation) || 0, Number(to.rotation) || 0, g),
        alpha: lerp(numOr(f.alpha, 100), numOr(to.alpha, 100), g) * moveAlpha(move, u),
      };
      if (move === MOVE_SMEAR) {
        // Stretch along the travel direction, peaking mid-window — the
        // velocitySmear carrier (QUAD_VS stretches a_inst2.zw; toInstance
        // passes vx/vy through). Synthetic and seeded: the same seed
        // replays the same stretch, independent of frame rate.
        const vAmt = (SMEAR_VEL * Math.sin(Math.PI * u)) / (travel || 1);
        o.vx = dx * vAmt;
        o.vy = dy * vAmt;
      }
      out.push({
        k: (1 - w) * fromRank + w * toRank,
        o,
      });
    } else {
      // unmatched target grows in from its window's midpoint (#444: raw position)
      out.push({ k: toRank, o: { ...to, scale: (Number(to.scale) || 1) * growEnv(u) } });
    }
  }
  // unmatched source shrinks out by its window's midpoint; its key drifts past
  // every to-rank so it trails at settle. Window indices continue past the
  // to-list so a leaver and a joiner never share one node's slot in the wave.
  let wi = toList.length;
  for (const f of onlyFrom) {
    const fromRank = (idxFrom.get(f) ?? 0) / fromLen;
    const u = nodeT(t, wi++, seed);
    out.push({ k: (1 - w) * fromRank + w * 2, o: { ...f, scale: (Number(f.scale) || 1) * shrinkEnv(u) } });
  }
  // Array.prototype.sort is stable: ties keep emission order.
  out.sort((x, y) => x.k - y.k);
  return out.map((e) => e.o);
}
