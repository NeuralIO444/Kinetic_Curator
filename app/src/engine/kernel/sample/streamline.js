// #1794 — Streamline trace: the field drawn as structure.
//
// A consumer of the node-influence field (kernel/field/nodeField.js).
// Seeded traces start AT graph nodes and integrate the field's flow —
// climbing the propagation gradient from node to node until they arrive
// at a source, leave the plate, or spend their step budget. The traces
// are the picture: placement deals marks along them (with the trail
// tangent as rot01, the brush convention), so the field itself — not
// marks riding it — is what reads on the plate.
//
// Sibling shape is deliberate: the trace build is cached per
// (seed, plate, knobs) like colonize's network, the dealing is brush's
// round-robin over traces, and there is NO jitter — jitter would scatter
// stamps off the trace and break the line (brush/colonize precedent).
//
// Deterministic per seed (replay law): the field is hash-built, seeds are
// hash draws on the 'streamline' channel, integration is fixed-order
// arithmetic. No Math.random anywhere in the trace path. The traces
// themselves never depend on `count` — only the dealing does (brush's
// scheme), so a density edit re-deals the same drawing, it does not
// redraw it.
//
// Perf posture: every bound is a named constant — trace count, steps per
// trace, and the field's node cap bound the build to
// O(TRACES · STEPS · NODES) worst case, paid once per geometry build and
// cached; the per-point sampler read is O(1).

import { createNodeField } from '../field/nodeField.js';
import { hashU01 } from '../rng.js';
import { writeSampleColumns } from './columns.js';
import { makeSmallCache } from '../cache.js';

/** Default traces per build. */
export const STREAMLINE_TRACES = 42;
/** Hard cap on traces — the build cost ceiling's first factor. */
export const STREAMLINE_MAX_TRACES = 96;
/** Default max integration steps per trace. */
export const STREAMLINE_STEPS = 180;
/** Hard cap on steps per trace — the build cost ceiling's second factor. */
export const STREAMLINE_MAX_STEPS = 400;
/** Default step length in px (converted to normalized units per plate). */
export const STREAMLINE_STEP = 6;

/** Below this vector magnitude the field is a dead zone at the point. */
const DEAD_ZONE_EPS = 1e-6;
/** Arrival: within this many step-lengths of a source node, the line connected. */
const ARRIVE_STEPS = 0.8;
/** A trace must travel at least this many steps before arrival can stop it. */
const ARRIVE_MIN_STEPS = 3;

const CACHE_SIZE = 6;
const _cache = makeSmallCache(CACHE_SIZE);

function cacheKey(seed, w, h, traces, steps, step, seedOffsets) {
  const off = (seedOffsets && seedOffsets.spatial) || 0;
  return `streamline:${seed >>> 0}:${off}:${w}x${h}:${traces}:${steps}:${step}`;
}

/** Brush's rot01 convention: the full circle mapped to 0..1. */
function rot01FromDir(dx, dy) {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (((deg % 360) + 540) % 360) / 360;
}

/**
 * Build the streamline traces for one plate. Pure function of the inputs.
 *
 * @returns {{ traces: Array<{ pts: Array<{x,y,rot01}>, node: number, arrived: boolean }>,
 *             field: object }} points in plate px; `node` is the graph node
 *             the trace started from; `arrived` marks traces that reached a
 *             source node (vs. leaving the plate or spending their budget).
 */
export function buildStreamlines({
  seed,
  seedOffsets = null,
  w,
  h,
  traces = STREAMLINE_TRACES,
  steps = STREAMLINE_STEPS,
  step = STREAMLINE_STEP,
}) {
  const key = cacheKey(seed, w, h, traces, steps, step, seedOffsets);
  const hit = _cache.get(key);
  if (hit) return hit;

  const field = createNodeField(seed, { seedOffsets });
  const { points, flow, sources } = field;
  const nodeCount = field.count;
  const stepN = step / Math.max(w, h);
  const sourceSet = new Set(sources);
  const v = { x: 0, y: 0 };

  // Direction at a normalized point: the field's flow where it has one;
  // in a dead zone, the pull toward the nearest node (the issue's
  // "getting pulled elsewhere"); at the node itself, the node's own flow.
  // Returns false when there is no direction at all (isolated zero-flow).
  function direction(px, py, out) {
    field.sampleVector(px, py, v);
    let vx = v.x;
    let vy = v.y;
    if (vx * vx + vy * vy < DEAD_ZONE_EPS * DEAD_ZONE_EPS) {
      let best = -1;
      let bestD2 = Infinity;
      for (let j = 0; j < nodeCount; j++) {
        const dx = points[j * 2] - px;
        const dy = points[j * 2 + 1] - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = j;
        }
      }
      if (best < 0) return false;
      if (bestD2 > DEAD_ZONE_EPS * DEAD_ZONE_EPS) {
        const m = Math.sqrt(bestD2);
        vx = (points[best * 2] - px) / m;
        vy = (points[best * 2 + 1] - py) / m;
      } else {
        vx = flow[best * 2];
        vy = flow[best * 2 + 1];
        if (vx === 0 && vy === 0) return false;
      }
    }
    const m = Math.hypot(vx, vy);
    out.x = vx / m;
    out.y = vy / m;
    return true;
  }

  const out = [];
  const dir = { x: 0, y: 0 };
  const mid = { x: 0, y: 0 };
  for (let t = 0; t < traces; t++) {
    const nodeIdx = nodeCount > 0 ? t % nodeCount : -1;
    let px;
    let py;
    if (nodeIdx >= 0) {
      // Start at the node, offset by a hash draw so sibling traces off the
      // same node fan out instead of overdrawing one line. The offset can
      // push past the rim for an edge node — clamp back onto the plate.
      px = points[nodeIdx * 2] + (hashU01(seed, 'streamline', t * 2, seedOffsets) - 0.5) * field.radius;
      py = points[nodeIdx * 2 + 1] + (hashU01(seed, 'streamline', t * 2 + 1, seedOffsets) - 0.5) * field.radius;
      px = Math.min(1, Math.max(0, px));
      py = Math.min(1, Math.max(0, py));
    } else {
      px = 0.5;
      py = 0.5;
    }
    const pts = [];
    // `arrived` means travelled-and-connected: set only by the arrival
    // check during integration. A trace that starts on a source and never
    // leaves is a point at the heart — it did not arrive, it began there.
    let arrived = false;
    // The seed point is always recorded, even when no direction leaves it
    // (a source start): a trace is never an empty point list.
    const seedRot =
      nodeIdx >= 0 && (flow[nodeIdx * 2] !== 0 || flow[nodeIdx * 2 + 1] !== 0)
        ? rot01FromDir(flow[nodeIdx * 2], flow[nodeIdx * 2 + 1])
        : 0;
    pts.push({ x: px * w, y: py * h, rot01: seedRot });
    if (direction(px, py, dir)) {
      pts[0].rot01 = rot01FromDir(dir.x, dir.y);
      for (let s = 0; s < steps; s++) {
        // Midpoint integration: direction at the half-step steers the
        // full step, so traces bend with the field instead of faceting.
        if (!direction(px + dir.x * stepN * 0.5, py + dir.y * stepN * 0.5, mid)) break;
        let nx = px + mid.x * stepN;
        let ny = py + mid.y * stepN;
        // Leaving the plate ends the trace ON the boundary (the clamped
        // point is recorded, then the line stops) — dealt points are
        // never off-plate.
        const exits = nx < 0 || nx > 1 || ny < 0 || ny > 1;
        if (exits) {
          nx = Math.min(1, Math.max(0, nx));
          ny = Math.min(1, Math.max(0, ny));
        }
        px = nx;
        py = ny;
        pts.push({ x: px * w, y: py * h, rot01: rot01FromDir(mid.x, mid.y) });
        if (exits) break;
        dir.x = mid.x;
        dir.y = mid.y;
        // Arrival: the trace reached a source node's doorstep — the line
        // connected two points of the graph, which is the drawing's verb.
        if (s + 1 >= ARRIVE_MIN_STEPS) {
          let done = false;
          for (const src of sourceSet) {
            const dx = points[src * 2] - px;
            const dy = points[src * 2 + 1] - py;
            const arrive = stepN * ARRIVE_STEPS;
            if (dx * dx + dy * dy < arrive * arrive) {
              done = true;
              break;
            }
          }
          if (done) {
            arrived = true;
            break;
          }
        }
      }
    }
    out.push({ pts, node: nodeIdx, arrived });
  }

  const result = { traces: out, field };
  _cache.set(key, result);
  return result;
}

export function clearStreamlineCache() {
  _cache.clear();
}

/**
 * Sampler: (ctx) => { x, y, t, rot01 }.
 * Deals the cached traces round-robin (brush's scheme): t is progress
 * along the trace (0 at the node it left, 1 at its end), rot01 is the
 * trace tangent, so stamps aim along the line. No jitter, no ctx.rng —
 * the line is the structure.
 */
export function streamline(ctx) {
  const { i, count, w, h, seed, seedOffsets } = ctx;
  const traces = Number.isFinite(ctx.streamlineTraces)
    ? Math.max(1, Math.min(STREAMLINE_MAX_TRACES, Math.floor(ctx.streamlineTraces)))
    : STREAMLINE_TRACES;
  const steps = Number.isFinite(ctx.streamlineSteps)
    ? Math.max(4, Math.min(STREAMLINE_MAX_STEPS, Math.floor(ctx.streamlineSteps)))
    : STREAMLINE_STEPS;
  const step = Number.isFinite(ctx.streamlineStep) && ctx.streamlineStep > 0 ? ctx.streamlineStep : STREAMLINE_STEP;

  const built = buildStreamlines({ seed, seedOffsets, w, h, traces, steps, step });
  const list = built.traces;
  if (!list.length || !list[0].pts.length) {
    if (writeSampleColumns(ctx, w / 2, h / 2, 0.5)) return;
    return { x: w / 2, y: h / 2, t: 0.5 };
  }
  const per = Math.max(1, Math.ceil(count / list.length));
  const trace = list[Math.floor(i / per) % list.length];
  const pts = trace.pts;
  const idx = Math.min(i % per, pts.length - 1);
  const p = pts[idx];
  const t = pts.length > 1 ? idx / (pts.length - 1) : 0.5;
  if (writeSampleColumns(ctx, p.x, p.y, t, p.rot01)) return;
  return { x: p.x, y: p.y, t, rot01: p.rot01 };
}
