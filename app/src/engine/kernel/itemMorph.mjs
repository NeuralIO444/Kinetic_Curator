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
 * #564 SLEIGHT-OF-HAND — one director, not per-chip blends. A node never
 * changes costume while you can see it: it scales to exactly zero at its own
 * centre, swaps identity (asset, colour, accent, role) at the minimum, and
 * grows back as the new thing. Each node gets its own seeded window inside
 * the transition (nodeWindow), so the swap sweeps across the canvas as a
 * wave instead of every node flipping on one frame. Consequences:
 *  - colour/accent no longer interpolate. A tint lerp is a NEW ATLAS CELL
 *    every frame (the tint is baked — see liveAtlas.mjs), which is the
 *    rebake churn of #561. Swapping at zero scale costs one cell, not sixty.
 *  - unmatched items no longer alpha-fade (that fade was the optical
 *    cross-dissolve the Always Alive protocol bans): a leaver shrinks out by
 *    its window's midpoint, a joiner grows in from it.
 *  - every window closes at or before t=1 (delay ≤ STAGGER, dur ≥ DUR_MIN,
 *    STAGGER + DUR_MIN + DUR_JIT === 1), so the completion frame's handoff
 *    to raw toItems holds no frame and pops nothing.
 *
 * KNOWN CEILING — the swap is hidden by SAMPLING, not by a dead band: the
 * envelope is exactly 0 at u=0.5, but a frame only lands NEAR that instant.
 * How near is a function of how many frames the node's half-window gets, so
 * the residual size on the swap frame scales with MIX: ~0.2% of full size at
 * MIX 2s (the default), ~1% at 1s, ~37% at 0.25s — i.e. below roughly 0.75s
 * a MIX no longer has the frames to hide anything and degrades toward the
 * cut it is already asking for. Upgrade path if a sub-second MIX ever needs
 * to be clean: hold the envelope at zero across a band around u=0.5 whose
 * width comes from the caller's real dt, not a constant.
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
    const fs = (fromGroups.get(k) || []).slice();
    const ts = (toGroups.get(k) || []).map((item, origIdx) => ({ item, origIdx, g: k }));
    while (fs.length && ts.length) {
      let bi = 0, bj = 0, bd = Infinity;
      for (let i = 0; i < fs.length; i++) {
        for (let j = 0; j < ts.length; j++) {
          const d = dist2(fs[i], ts[j].item);
          if (d < bd) { bd = d; bi = i; bj = j; }
        }
      }
      pairs.push({ f: fs[bi], g: k, j: ts[bj].origIdx });
      fs.splice(bi, 1);
      ts.splice(bj, 1);
    }
    leftoverFrom.push(...fs);
    leftoverTo.push(...ts);
  }

  // Pass 2: cross-asset nearest spatial matching (Always Alive: no optical cross-fade dissolve)
  // When modes or stub chips use different asset sets, nodes physically travel across the
  // canvas to their nearest destination slot rather than dissolving in place.
  while (leftoverFrom.length && leftoverTo.length) {
    let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < leftoverFrom.length; i++) {
      for (let j = 0; j < leftoverTo.length; j++) {
        const d = dist2(leftoverFrom[i], leftoverTo[j].item);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    pairs.push({ f: leftoverFrom[bi], g: leftoverTo[bj].g, j: leftoverTo[bj].origIdx });
    leftoverFrom.splice(bi, 1);
    leftoverTo.splice(bj, 1);
  }

  onlyFrom.push(...leftoverFrom);
  onlyTo.push(...leftoverTo.map((t) => ({ g: t.g, j: t.origIdx })));

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
/** Strict scale-to-zero at the midpoint: no bead, nothing left to see mid-swap. */
const swapEnv = (u) => (u < 0.5 ? shrinkEnv(u) : growEnv(u));

const numOr = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * Blend fromItems -> toItems at eased t in [0,1]. t<=0 returns fromItems
 * verbatim, t>=1 returns toItems verbatim (reference equality, so callers
 * can drop the transition once the blended list === toItems).
 *
 * #564: every node runs the director's scale swap inside its own seeded
 * window. A matched pair travels (x/y/rotation/alpha/base scale) on its own
 * progress u while its drawn scale rides swapEnv(u) — full size, down to
 * exactly zero at u=0.5, back to full. Its COSTUME (asset, colour, accent,
 * role, key) is the source item's below the minimum and the target item's
 * above it, so the swap only ever happens at zero scale. An unmatched target
 * grows in from the midpoint; an unmatched source shrinks out by it. Nothing
 * alpha-fades and nothing lerps a tint.
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
      out.push({
        k: (1 - w) * fromRank + w * toRank,
        o: {
          // #564: costume comes from ONE side, chosen at the minimum. Never a
          // blend of the two, so a node is never a third thing that exists in
          // neither pose (and never needs an atlas cell for one).
          ...(u < 0.5 ? f : to),
          x: lerp(f.x, to.x, g),
          y: lerp(f.y, to.y, g),
          scale: lerp(Number(f.scale) || 1, Number(to.scale) || 1, g) * swapEnv(u),
          rotation: lerpAngle(Number(f.rotation) || 0, Number(to.rotation) || 0, g),
          alpha: lerp(numOr(f.alpha, 100), numOr(to.alpha, 100), g),
        },
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
