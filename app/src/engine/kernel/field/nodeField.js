// kernel/field/nodeField.js — node-influence field source (#1794).
//
// A field built from POINTS, not weather. The kernel's other sources are
// continuous (fBm noise, a CA mask); here each node is an influence source
// that shapes the field around it, and influence PROPAGATES node to node
// along a graph — fairly simple point-to-point relationships that start
// reading as a system almost immediately (the Karlen "Connected Fields"
// tell the issue is filed from).
//
// Pure — no React, no store, no globals. Deterministic per seed: node
// placement rides the hashed 'nodes' channel (the attractor pattern), the
// graph is a pure function of the positions, and propagation is fixed-order
// arithmetic. Same seed + same opts → bit-identical field, forever (replay
// law).
//
// The instance follows the kernel field contract — { kind, sample(nx, ny)
// -> 0..1 } in normalized canvas space, so it composes with combineFields
// and the rejection samplers unchanged — and adds the vector read the
// streamline trace consumer (#1794, kernel/sample/streamline.js) follows:
//
//   sample(nx, ny)        propagated-influence density, 0..1
//   sampleVector(nx, ny)  direction of flow at the point: the falloff-
//                         weighted blend of nearby nodes' flow vectors.
//                         Magnitude carries pull strength; (0, 0) outside
//                         every node's radius.
//
// FLOW RULE: each node's flow vector points along its strongest edge —
// toward its highest-influence neighbour. Traces therefore climb the
// propagation gradient and terminate at sources, so the drawn lines
// CONNECT the graph instead of wandering it. A source is a true sink:
// influence = decay^(graph distance) means sources are the only local
// maxima, so a node with no higher-influence neighbour IS a source and
// its flow is the zero vector — gradient lines end there, they do not
// deflect off it.
//
// Cost: node placement + graph + propagation are init-time CPU
// (O(count) hashes, O(count · links) edges, O(passes · edges) relaxation).
// Sampling is O(count) per call. Tier 0 — the field family's structural
// rate (every registered field rides tier 0; see kernel/field/registry.js).

import { hashU01 } from '../rng.js';

/** Default node count — a sparse graph reads as a system, not a mesh. */
export const NODE_FIELD_COUNT = 26;
/** Hard cap on nodes — sampling is O(count), so the cap bounds every read. */
export const NODE_FIELD_MAX_NODES = 96;
/** Source nodes: the handful of hearts the propagation starts from. */
export const NODE_FIELD_SOURCES = 3;
/** Graph degree: each node links to its k nearest neighbours. */
export const NODE_FIELD_LINKS = 3;
/** Default influence radius in normalized canvas units. */
export const NODE_FIELD_RADIUS = 0.24;
/** Per-hop influence loss during propagation (0..1). */
export const NODE_FIELD_DECAY = 0.82;
/** Relaxation passes — enough for influence to cross the whole graph. */
export const NODE_FIELD_PROPAGATION = 32;
/** Default minimum centre-to-centre spacing (normalized units). */
export const NODE_FIELD_MIN_SPACING = 0.11;

/** Max rejection attempts when spacing nodes apart. */
const SPACING_ATTEMPTS = 8;

/** Smooth falloff (radius -> weight), the attractor profile: 1 at centre. */
function falloffWeight(d) {
  if (d >= 1) return 0;
  const u = 1 - d;
  return u * u * (3 - 2 * u);
}

/**
 * Create a deterministic node-influence field.
 *
 * @param {number} seed master seed
 * @param {object} [opts]
 * @param {number} [opts.count] node count (0 = the empty field: sample 0)
 * @param {number} [opts.radius] influence radius in normalized units
 * @param {number} [opts.sources] number of source nodes (influence 1)
 * @param {number} [opts.links] graph degree (k nearest neighbours)
 * @param {number} [opts.decay] per-hop propagation loss
 * @param {number} [opts.propagation] relaxation passes
 * @param {number} [opts.minSpacing] minimum node spacing (normalized)
 * @param {object|null} [opts.seedOffsets] sub-seed offsets (kernel/rng.js)
 * @returns field instance { kind:'nodes', count, points, influence, flow,
 *   sources, edges, radius, sample(nx, ny), sampleVector(nx, ny, out?) }
 *   — points/flow are Float64Array x,y pairs; influence is per-node 0..1.
 */
export function createNodeField(seed, opts = {}) {
  const count = Math.max(
    0,
    Math.min(NODE_FIELD_MAX_NODES, Math.floor(Number.isFinite(opts.count) ? opts.count : NODE_FIELD_COUNT)),
  );
  const radius = Math.max(1e-6, Number.isFinite(opts.radius) && opts.radius > 0 ? opts.radius : NODE_FIELD_RADIUS);
  const sourceCount = Math.max(
    0,
    Math.min(count, Math.floor(Number.isFinite(opts.sources) ? opts.sources : NODE_FIELD_SOURCES)),
  );
  const links = Math.max(1, Math.floor(Number.isFinite(opts.links) ? opts.links : NODE_FIELD_LINKS));
  const decay = Math.min(1, Math.max(0, Number.isFinite(opts.decay) ? opts.decay : NODE_FIELD_DECAY));
  const passes = Math.max(0, Math.floor(Number.isFinite(opts.propagation) ? opts.propagation : NODE_FIELD_PROPAGATION));
  const minSpacing = Math.max(0, Number.isFinite(opts.minSpacing) ? opts.minSpacing : NODE_FIELD_MIN_SPACING);
  const seedOffsets = opts.seedOffsets ?? null;

  // --- Node placement: hashed scatter with spacing rejection, the
  // attractor pattern — the k-th node is a pure function of the seed; the
  // rejection only ever skips a candidate, it never re-hashes.
  const points = new Float64Array(count * 2);
  let placed = 0;
  let k = 0;
  while (placed < count) {
    let ax = 0;
    let ay = 0;
    let ok = false;
    for (let attempt = 0; attempt < SPACING_ATTEMPTS && !ok; attempt++) {
      ax = hashU01(seed, 'nodes', k * 2 + attempt * 7919, seedOffsets);
      ay = hashU01(seed, 'nodes', k * 2 + 1 + attempt * 7919, seedOffsets);
      ok = true;
      if (minSpacing > 0) {
        const ms2 = minSpacing * minSpacing;
        for (let j = 0; j < placed; j++) {
          const dx = ax - points[j * 2];
          const dy = ay - points[j * 2 + 1];
          if (dx * dx + dy * dy < ms2) {
            ok = false;
            break;
          }
        }
      }
    }
    points[placed * 2] = ax;
    points[placed * 2 + 1] = ay;
    placed++;
    k++;
  }

  // --- Graph: each node links to its k nearest neighbours; edges are the
  // undirected union, so influence and flow travel both ways.
  const adjacency = Array.from({ length: count }, () => []);
  const edgeSet = new Set();
  const edges = [];
  if (count > 1) {
    const dists = [];
    for (let a = 0; a < count; a++) {
      dists.length = 0;
      for (let b = 0; b < count; b++) {
        if (b === a) continue;
        const dx = points[b * 2] - points[a * 2];
        const dy = points[b * 2 + 1] - points[a * 2 + 1];
        dists.push([dx * dx + dy * dy, b]);
      }
      dists.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      const deg = Math.min(links, dists.length);
      for (let e = 0; e < deg; e++) {
        const b = dists[e][1];
        const key = a < b ? a * 1024 + b : b * 1024 + a;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        edges.push([a, b]);
        adjacency[a].push(b);
        adjacency[b].push(a);
      }
    }
    for (const list of adjacency) list.sort((p, q) => p - q);
  }

  // --- Sources: the S nodes with the lowest 'nodeSource' hash — a pure
  // ranking of the seed, never of placement order.
  const ranked = Array.from({ length: count }, (_, j) => [hashU01(seed, 'nodeSource', j, seedOffsets), j]);
  ranked.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const sources = ranked.slice(0, sourceCount).map(([, j]) => j);
  sources.sort((a, b) => a - b);

  // --- Propagation: influence flows source → neighbour → neighbour with
  // a per-hop loss. In-place relaxation in fixed index order (Gauss-Seidel)
  // — deterministic, and `passes` is bounded so build cost is capped.
  const influence = new Float64Array(count);
  for (const s of sources) influence[s] = 1;
  for (let p = 0; p < passes; p++) {
    for (let a = 0; a < count; a++) {
      let v = influence[a];
      const nbrs = adjacency[a];
      for (let e = 0; e < nbrs.length; e++) {
        const cand = influence[nbrs[e]] * decay;
        if (cand > v) v = cand;
      }
      influence[a] = v;
    }
  }

  // --- Flow: toward the highest-influence neighbour (ties → lowest
  // index). A node with no higher-influence neighbour is a source — a
  // sink with zero flow. A node with no neighbours has no flow either.
  const flow = new Float64Array(count * 2);
  for (let a = 0; a < count; a++) {
    const nbrs = adjacency[a];
    let best = -1;
    for (let e = 0; e < nbrs.length; e++) {
      const b = nbrs[e];
      if (influence[b] > influence[a] && (best < 0 || influence[b] > influence[best])) best = b;
    }
    if (best < 0) continue;
    const dx = points[best * 2] - points[a * 2];
    const dy = points[best * 2 + 1] - points[a * 2 + 1];
    const m = Math.hypot(dx, dy);
    if (m > 1e-12) {
      flow[a * 2] = dx / m;
      flow[a * 2 + 1] = dy / m;
    }
  }

  const r2 = radius * radius;

  return {
    kind: 'nodes',
    count,
    points,
    influence,
    flow,
    sources,
    edges,
    radius,
    /**
     * Propagated-influence density at normalized (nx, ny): the falloff-
     * weighted mean of node influences around the point. 0 outside every
     * node's radius — an empty region of this field is genuinely empty,
     * which is what makes placement pool along the network.
     */
    sample(nx, ny) {
      let num = 0;
      let den = 0;
      for (let j = 0; j < count; j++) {
        const dx = nx - points[j * 2];
        const dy = ny - points[j * 2 + 1];
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const w = falloffWeight(Math.sqrt(d2) / radius);
        num += w * influence[j];
        den += w;
      }
      return den > 0 ? Math.min(1, Math.max(0, num / den)) : 0;
    },
    /**
     * Flow at normalized (nx, ny): falloff-weighted blend of nearby nodes'
     * flow vectors, weighted up by influence so strong nodes steer harder.
     * NOT normalized — magnitude is pull strength. (0, 0) outside support;
     * the caller (tracer) decides what a dead zone means.
     *
     * A source contributes INFLOW, not its (zero) node flow: within its
     * radius it pulls the sample point toward itself, radially. A sink
     * whose blend contribution were the zero vector would numerically
     * repel — its high falloff weight would dilute every neighbour's
     * onward flow near the heart, and traces would bend away from the
     * very node they should terminate on.
     */
    sampleVector(nx, ny, out = { x: 0, y: 0 }) {
      let vx = 0;
      let vy = 0;
      for (let j = 0; j < count; j++) {
        const dx = nx - points[j * 2];
        const dy = ny - points[j * 2 + 1];
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const w = falloffWeight(Math.sqrt(d2) / radius) * (0.35 + 0.65 * influence[j]);
        const fx = flow[j * 2];
        const fy = flow[j * 2 + 1];
        if (fx !== 0 || fy !== 0) {
          vx += w * fx;
          vy += w * fy;
        } else if (d2 > 1e-12) {
          // Zero node flow == a source (or an isolated node): radial inflow.
          const m = Math.sqrt(d2);
          vx += w * (-dx / m);
          vy += w * (-dy / m);
        }
      }
      out.x = vx;
      out.y = vy;
      return out;
    },
  };
}
