// #1197 — Space-colonization growth (attractor-driven branching).
//
// Organic branching like roots or leaf veins: lines actively grow *toward*
// invisible attractor points scattered through empty areas, consuming attractors
// as they arrive. This is the other growth family — DLA/Eden (`dla`, `eden`
// modes) do aggregation (particles sticking to a cluster, coral-like);
// colonization does pursuit (veins hunting points, venation-like). Different
// algorithm, different feel.
//
// Attractors come from the Poisson-disc sampler (#1193): well-spaced attractors
// make well-spaced veins.
//
// ALGORITHM (classic, init-time CPU only):
//   1. scatter attractors via poissonPointSet;
//   2. start with a root node at the plate centre;
//   3. while attractors remain and under hard cap:
//        - associate each live attractor with its closest node within influence radius;
//        - for each node that has attractors, grow one (or more, on branch probability)
//          child node a step-size distance in the average direction toward them;
//        - kill attractors within kill radius of any node;
//   4. the network of nodes is the form. Sampling deals from the nodes.
//
// CHARACTER KNOBS (species): influence radius, kill radius, branch probability.
// Hard caps asserted: MAX_NODES, MAX_STEPS. Deterministic per seed.
// Composes with motion row (t carries normalised generation / distance from root).
//
// Keep distinct from DLA/Eden in look and code path — no merging the families.

import { poissonPointSet } from './poisson.js';
import { rngForChannel } from '../rng.js';
import { writeSampleColumns } from './columns.js';
import { makeSmallCache } from '../cache.js';

/** Hard cap on nodes — the canvas can never saturate permanently. */
export const COLONIZE_MAX_NODES = 2048;
/** Hard cap on growth steps — no runaway infinite growth. */
export const COLONIZE_MAX_STEPS = 1200;
/** Default influence radius (px). Attractors outside this ignore a node. */
export const COLONIZE_INFLUENCE = 90;
/** Default kill radius (px). Attractors inside this of a node are consumed. */
export const COLONIZE_KILL = 18;
/** Default branch probability (0..1). Chance a node grows a second child. */
export const COLONIZE_BRANCH = 0.25;
/** Step size between parent and child node (px). */
export const COLONIZE_STEP = 7;
/** Attractors relative to requested count. Poisson set is ~2×, we take a slice. */
const ATTRACTOR_MULT = 1.6;
const CACHE_SIZE = 6;

const _cache = makeSmallCache(CACHE_SIZE);

function cacheKey(seed, count, w, h, influence, kill, branch, step, seedOffsets) {
  const off = (seedOffsets && seedOffsets.spatial) || 0;
  return `${seed >>> 0}:${off}:${count}:${w}x${h}:${influence.toFixed(1)}:${kill.toFixed(1)}:${branch.toFixed(2)}:${step.toFixed(1)}`;
}

/**
 * Grow the colonization network. Pure function of the inputs.
 * @returns {{ nodes: Array<{x:number,y:number,birth:number,dist:number}>, consumed: number, attractors: number }}
 */
export function colonizeNetwork({
  seed,
  seedOffsets = null,
  w,
  h,
  count,
  influence = COLONIZE_INFLUENCE,
  kill = COLONIZE_KILL,
  branch = COLONIZE_BRANCH,
  step = COLONIZE_STEP,
}) {
  const key = cacheKey(seed, count, w, h, influence, kill, branch, step, seedOffsets);
  const hit = _cache.get(key);
  if (hit) return hit;

  const nAttr = Math.max(8, Math.round(count * ATTRACTOR_MULT));
  // Poisson set as the attractor field. Dedicated stream not needed beyond Poisson's own.
  const attractorsRaw = poissonPointSet(seed, nAttr, w, h, seedOffsets);
  const attractors = attractorsRaw.slice(0, nAttr).map((p) => ({ x: p.x, y: p.y, alive: true }));
  const aliveCount = attractors.length;

  const nodes = [];
  // Root at centre.
  const root = { x: w / 2, y: h / 2, parent: -1, birth: 0, dist: 0 };
  nodes.push(root);

  const stream = rngForChannel(seed, 'colonize', seedOffsets);
  const kill2 = kill * kill;
  const infl2 = influence * influence;

  let steps = 0;
  let consumed = 0;

  while (steps < COLONIZE_MAX_STEPS && nodes.length < COLONIZE_MAX_NODES) {
    steps++;
    // Associate attractors → closest node within influence.
    const assoc = new Map(); // nodeIndex -> array of attractor indices
    let any = false;
    for (let a = 0; a < attractors.length; a++) {
      const at = attractors[a];
      if (!at.alive) continue;
      let best = -1;
      let bestD2 = infl2;
      for (let n = 0; n < nodes.length; n++) {
        const nd = nodes[n];
        const dx = at.x - nd.x;
        const dy = at.y - nd.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = n;
        }
      }
      if (best >= 0) {
        any = true;
        if (!assoc.has(best)) assoc.set(best, []);
        assoc.get(best).push(a);
      }
    }
    if (!any) break;

    // Grow from nodes that have attractors.
    const toGrow = Array.from(assoc.keys());
    let grew = false;
    for (const ni of toGrow) {
      if (nodes.length >= COLONIZE_MAX_NODES) break;
      const parent = nodes[ni];
      const ats = assoc.get(ni);
      // Average direction.
      let sx = 0;
      let sy = 0;
      for (const ai of ats) {
        const at = attractors[ai];
        const dx = at.x - parent.x;
        const dy = at.y - parent.y;
        const d = Math.hypot(dx, dy) || 1;
        sx += dx / d;
        sy += dy / d;
      }
      const mag = Math.hypot(sx, sy) || 1;
      const dirx = sx / mag;
      const diry = sy / mag;

      // Primary child.
      const nx = parent.x + dirx * step;
      const ny = parent.y + diry * step;
      // Clamp to plate with a small margin.
      const cx = Math.min(w - 4, Math.max(4, nx));
      const cy = Math.min(h - 4, Math.max(4, ny));
      const dist = parent.dist + step;
      nodes.push({ x: cx, y: cy, parent: ni, birth: steps, dist });
      grew = true;

      // Optional second branch.
      if (nodes.length < COLONIZE_MAX_NODES && stream() < branch && ats.length > 1) {
        // Slight perpendicular offset for the branch.
        const px = -diry;
        const py = dirx;
        const side = stream() < 0.5 ? 1 : -1;
        const bx = parent.x + (dirx * 0.7 + px * side * 0.5) * step;
        const by = parent.y + (diry * 0.7 + py * side * 0.5) * step;
        const bcx = Math.min(w - 4, Math.max(4, bx));
        const bcy = Math.min(h - 4, Math.max(4, by));
        nodes.push({ x: bcx, y: bcy, parent: ni, birth: steps, dist: parent.dist + step * 0.8 });
      }
    }
    if (!grew) break;

    // Kill attractors within kill radius of any node.
    for (let a = 0; a < attractors.length; a++) {
      const at = attractors[a];
      if (!at.alive) continue;
      for (let n = 0; n < nodes.length; n++) {
        const nd = nodes[n];
        const dx = at.x - nd.x;
        const dy = at.y - nd.y;
        if (dx * dx + dy * dy < kill2) {
          at.alive = false;
          consumed++;
          break;
        }
      }
    }
  }

  const out = {
    nodes,
    consumed,
    attractors: aliveCount,
    steps,
  };
  _cache.set(key, out);
  return out;
}

export function clearColonizeCache() {
  _cache.clear();
}

/**
 * Sampler: (ctx) => { x, y, t }.
 * Deals from the cached network nodes. t is normalised distance from root
 * (0 at root → 1 at farthest), so motion / band colouring can ride the growth order.
 * No jitter (would break the vein structure). Dedicated stream only for the growth itself.
 */
export function colonize(ctx) {
  const {
    i, count, w, h, seed, seedOffsets,
    colonizeInfluence, colonizeKill, colonizeBranch, colonizeStep,
  } = ctx;
  const influence = Number.isFinite(colonizeInfluence) && colonizeInfluence > 0
    ? colonizeInfluence : COLONIZE_INFLUENCE;
  const kill = Number.isFinite(colonizeKill) && colonizeKill > 0
    ? colonizeKill : COLONIZE_KILL;
  const branch = Number.isFinite(colonizeBranch)
    ? Math.max(0, Math.min(1, colonizeBranch)) : COLONIZE_BRANCH;
  const step = Number.isFinite(colonizeStep) && colonizeStep > 0
    ? colonizeStep : COLONIZE_STEP;

  const net = colonizeNetwork({
    seed, seedOffsets, w, h, count, influence, kill, branch, step,
  });
  const nodes = net.nodes;
  if (!nodes.length) {
    if (writeSampleColumns(ctx, w / 2, h / 2, 0)) return;
    return { x: w / 2, y: h / 2, t: 0 };
  }
  const k = i % nodes.length;
  const nd = nodes[k];
  // Normalise dist against the farthest node so t spans 0..1.
  let maxDist = 1;
  for (const n of nodes) if (n.dist > maxDist) maxDist = n.dist;
  const t = nd.dist / maxDist;
  if (writeSampleColumns(ctx, nd.x, nd.y, t)) return;
  return { x: nd.x, y: nd.y, t };
}
