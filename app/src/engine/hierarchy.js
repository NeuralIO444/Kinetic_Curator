// hierarchy.js — #1206 / Phase 3 step 1: build a creature from parts. Pure; nothing calls it yet.
//
// The engine was a flat scatterer: every mark independent, so nothing could be BUILT. This module adds parent-child
// assembly: a part declares ANCHORS (where things attach) and CHILDREN (what attaches there), and one expansion pass
// turns a root transform plus a parts recipe into the same flat list of items the renderer already draws. The
// renderer never learns a hierarchy exists: no GPU cost, no shader change.
//
//   World_child = World_parent x Local_anchor
//
// A RECIPE is { parts: { [partId]: { asset, anchors?, localBounds?, children? } } } where
//   anchors      { [name]: { dx, dy, dRot?, dScaleX?, dScaleY? } }   offsets in the part's own units, degrees
//   localBounds  { x0, y0, x1, y1 }                                   needed by any child that scatters on the surface
//   children     [ { part, anchor }                                   one child at a named anchor
//                | { part, anchor: 'surface', count, key? } ]         `count` children scattered inside localBounds
//
// GUARDRAILS (never weaken): the walk counts every item it emits and stops at `budget`, and a branch stops at
// `maxDepth`. A recipe that recurses forever, or asks for a million scales, terminates at the caps and says so
// (`truncated`); it cannot hang or exhaust memory. expansionFactor() runs the same walk without emitting, so a caller
// can divide its base count down BEFORE placing anything (the mirror precedent).
//
// DETERMINISM: no clock, no Math.random. Surface scatter comes from an injected `scatter(key, count, bounds)` whose
// key is built from (seed, the parent's path, the anchor), so the same recipe and seed always give the same creature.
import { hashU01 } from './kernel/rng.js';

export const HIER_MAX_DEPTH = 4;
export const HIER_GLOBAL_BUDGET = 2000;
export const SURFACE = 'surface';

/**
 * A child's world transform from its parent's and a local anchor. Per-axis scale (X and Y are independent signals).
 * Approximation, documented in #1206 and correct for sprites (do not "fix"): under a non-uniformly scaled parent a
 * child frame technically shears; rot = parent.rot + dRot is the standard sprite-placement rule.
 */
export function computeWorldTransform(parent, local) {
  const r = (parent.rot * Math.PI) / 180;
  const cosR = Math.cos(r);
  const sinR = Math.sin(r);
  const sx = (local.dx || 0) * parent.scaleX;
  const sy = (local.dy || 0) * parent.scaleY;
  return {
    x: parent.x + (sx * cosR - sy * sinR),
    y: parent.y + (sx * sinR + sy * cosR),
    rot: parent.rot + (local.dRot || 0),
    scaleX: parent.scaleX * (local.dScaleX ?? 1),
    scaleY: parent.scaleY * (local.dScaleY ?? 1),
    depth: (parent.depth || 0) + 1,
  };
}

/** FNV-1a of a path string: turns "root/wingL/scale" into a stable 32-bit offset for the one registered channel. */
function pathHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * The default surface scatter: `count` uniform points inside `bounds`, index-stable and seeded. Every draw rides the
 * one registered 'hierarchy' RNG channel (spatial group), offset by the parent path, so re-rolling SPATIAL re-deals
 * the scatter and colour never does. Step 4 injects the Poisson-disc set here instead; this keeps the module
 * self-contained and testable.
 */
export function hashScatter(seed, seedOffsets = null) {
  return (key, count, bounds) => {
    const base = pathHash(String(key));
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = {
        dx: bounds.x0 + hashU01(seed, 'hierarchy', (base + i * 2) >>> 0, seedOffsets) * (bounds.x1 - bounds.x0),
        dy: bounds.y0 + hashU01(seed, 'hierarchy', (base + i * 2 + 1) >>> 0, seedOffsets) * (bounds.y1 - bounds.y0),
      };
    }
    return out;
  };
}

const finite = (v, d) => (Number.isFinite(v) ? v : d);

/** One walk, shared by expandHierarchy (emit) and expansionFactor (count only). */
function walk(root, recipe, { budget, maxDepth, scatter, emit, problems }) {
  const parts = (recipe && recipe.parts) || {};
  let total = 0;
  let truncated = false;
  // explicit stack (no recursion): a pathological recipe cannot blow the call stack either
  const stack = [
    {
      partId: root.part,
      world: {
        x: root.x,
        y: root.y,
        rot: finite(root.rot, 0),
        scaleX: finite(root.scaleX, 1),
        scaleY: finite(root.scaleY, 1),
        depth: 0,
      },
      path: String(root.key ?? 'root'),
      anchorId: null,
    },
  ];
  while (stack.length) {
    const node = stack.pop();
    const part = Object.prototype.hasOwnProperty.call(parts, node.partId) ? parts[node.partId] : null;
    if (!part) {
      problems.push(`unknown part "${String(node.partId)}"`);
      continue;
    }
    if (total >= budget) {
      truncated = true;
      break;
    }
    total += 1;
    if (emit) emit(part, node);
    if (node.world.depth >= maxDepth) {
      if (Array.isArray(part.children) && part.children.length) truncated = true; // a branch was cut at the depth cap
      continue;
    }
    const kids = Array.isArray(part.children) ? part.children : [];
    // push in reverse so children are processed (and emitted) in declaration order
    for (let c = kids.length - 1; c >= 0; c--) {
      const child = kids[c];
      if (!child || typeof child.part !== 'string') {
        problems.push(`"${node.partId}": child ${c} names no part`);
        continue;
      }
      if (child.anchor === SURFACE) {
        const b = part.localBounds;
        if (!b || ![b.x0, b.y0, b.x1, b.y1].every(Number.isFinite)) {
          problems.push(`"${node.partId}": a surface child needs localBounds`);
          continue;
        }
        const want = Math.max(0, Math.floor(finite(child.count, 0)));
        // never ask the sampler for more than the budget could ever hold
        const count = Math.min(want, Math.max(0, budget - total));
        if (count < want) truncated = true;
        const pts = scatter(`${node.path}/${child.key ?? child.part}`, count, b);
        for (let i = pts.length - 1; i >= 0; i--) {
          stack.push({
            partId: child.part,
            world: computeWorldTransform(node.world, pts[i]),
            path: `${node.path}/${child.key ?? child.part}#${i}`,
            anchorId: SURFACE,
          });
        }
      } else {
        const anchor =
          part.anchors && Object.prototype.hasOwnProperty.call(part.anchors, child.anchor)
            ? part.anchors[child.anchor]
            : null;
        if (!anchor) {
          problems.push(`"${node.partId}": no anchor "${String(child.anchor)}"`);
          continue;
        }
        stack.push({
          partId: child.part,
          world: computeWorldTransform(node.world, anchor),
          path: `${node.path}/${child.anchor}`,
          anchorId: child.anchor,
        });
      }
    }
  }
  return { total, truncated };
}

/**
 * Expand one root into a flat item list. Root: { x, y, rot?, scaleX?, scaleY?, part, key? }.
 * Items: { assetId, x, y, rotation, scaleX, scaleY, _hier: { depth, anchorId, rootKey, path } }, in a stable order
 * (a parent before its children, children in declaration order). `_hier` is metadata for later drivers, never
 * serialized. Returns { items, truncated, problems }: `truncated` when a cap cut the creature short, `problems` for
 * recipe mistakes (an unknown part or anchor is skipped and named, never guessed).
 */
export function expandHierarchy(
  root,
  recipe,
  { seed = 0, budget = HIER_GLOBAL_BUDGET, maxDepth = HIER_MAX_DEPTH, scatter = null } = {},
) {
  const items = [];
  const problems = [];
  const rootKey = String(root.key ?? 'root');
  const { truncated } = walk(root, recipe, {
    budget: Math.max(0, Math.floor(budget)),
    maxDepth: Math.max(0, Math.floor(maxDepth)),
    scatter: scatter || hashScatter(seed),
    problems,
    emit: (part, node) =>
      items.push({
        assetId: part.asset,
        x: node.world.x,
        y: node.world.y,
        rotation: node.world.rot,
        scaleX: node.world.scaleX,
        scaleY: node.world.scaleY,
        _hier: { depth: node.world.depth, anchorId: node.anchorId, rootKey, path: node.path },
      }),
  });
  return { items, truncated, problems };
}

/**
 * How many items ONE root of `partId` expands to under the caps (the same walk, counting only). A caller divides its
 * base count by this before placement so a creature can never overflow the item budget.
 */
export function expansionFactor(recipe, partId, { budget = HIER_GLOBAL_BUDGET, maxDepth = HIER_MAX_DEPTH } = {}) {
  const problems = [];
  const { total } = walk({ x: 0, y: 0, part: partId }, recipe, {
    budget: Math.max(0, Math.floor(budget)),
    maxDepth: Math.max(0, Math.floor(maxDepth)),
    // counting needs positions only to keep the walk identical; a fixed point is enough
    scatter: (key, count) => new Array(count).fill({ dx: 0, dy: 0 }),
    problems,
    emit: null,
  });
  return Math.max(1, total);
}
