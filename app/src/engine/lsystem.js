// engine/lsystem.js — Phase 2 creature system, slice S7: the L-SYSTEM growth — a skeleton GENERATOR variant.
// Where skeleton.js grows the moth's fixed body plan (a spine between two landmarks, chains out each side),
// this module grows a TREE: the skeleton IS the branching structure. A classic Lindenmayer grammar (an axiom
// string rewritten by production rules, then read by a turtle) emits bones in exactly skeleton.js's shape —
// same fields, same construction order discipline (a parent always precedes its children), hashed by the
// same skeletonHash — so every later slice (skinning, poses, the debug draw) reads a tree exactly as it reads
// a moth. The trunk is the spine analogue (chain: null, the last trunk bone carries the H), branches are the
// limb analogues (each bracket group a chain, its root bone carrying the L).
//
// The laws, kept from S1 and the brief:
//   - Pure and seeded. A tree is a function of (seed, creatureId, rule set): creature-level parameters (which
//     grammar, generations, branch angle, step, taper) are drawn once from the kernel RNG on the 'skeleton'
//     channel keyed (seed, creatureId, 'lsystem'); the expansion and the turtle are then plain string and
//     arithmetic. No clocks, no unseeded chance — mathRandomGuard's terms.
//   - Sprouting births (ruling 4): growth is a frame-indexed AMOUNT — sproutAmount(frameIndex) — and
//     growTreeSkeleton poses the grown tree at that amount. A birth replays identically anywhere because
//     nothing in the amount reads a clock: frames are counted, never timed.
//   - Tighten PRUNES at pose time: pruneTreeSkeleton shortens branches as a pure function of band, outermost
//     twigs first, the trunk never. Pruning poses a COPY — the grown structure is never mutated, so the
//     grown skeleton's hash is band-invariant (proven in the selfcheck).
//   - Mirror discipline where the rules call for it: the 'canopy' and 'spire' grammars branch in +/- pairs
//     from an on-axis trunk with grammar-level parameters only (no per-branch jitter), so paired branches
//     are mirror images by construction. 'fern' alternates single fronds — its rules do not call for pairs,
//     and no mirror is claimed for it.
//   - Bounded and total: expansion and interpretation are capped (LSYSTEM_CAPS) and every cap is a
//     deterministic stop, never an error and never an unbounded loop — a hostile rule set grows a
//     truncated tree, not a hung instrument.
import { rngForIndex } from './kernel/rng.js';
import { fnv1a, skeletonHash } from './skeleton.js';

const CENTRE = 50; // the asset box's centre; trees grow in the same centred box units as skeleton.js
const rad = (deg) => (deg * Math.PI) / 180;
const finite = (v, d) => (Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(finite(v, 0), 0, 1);
const normDeg = (d) => (((d + 180) % 360) + 360) % 360 - 180;

/** The hard bounds on grammar growth — expansion and interpretation are total under these, always. */
export const LSYSTEM_CAPS = Object.freeze({
  generations: 6, // rewriting rounds, however many the seed or a caller asks for
  stringLength: 16384, // characters of expanded string; past this, expansion stops (deterministic slice)
  bones: 384, // emitted bones per tree; past this, the turtle stops
  depth: 12, // bracket nesting the turtle will honour; deeper pushes are ignored in pairs with their pops
});

/** Sprouting takes this many counted frames from seed to full growth (ruling 4: counted, never timed). */
export const SPROUT_FRAMES = 120;

/**
 * The grammars — a rule set is data, like skeleton.js's plans: an axiom and one production per symbol.
 * Symbols: F grows one bone segment; + / - turn by the branch angle; [ / ] open and close a branch;
 * X, Y, L are apices (they expand; the turtle walks past them). Every set's X production opens with F,
 * so generation 1 always grows at least one trunk bone.
 *   canopy — paired limbs at every apex: the mirror-disciplined canopy.
 *   fern   — alternating single fronds (X leans on Y, Y leans on X): no pairs, no mirror claimed.
 *   spire  — a tall paired trunk with short paired twigs (L expands once, to twig segments, then stops).
 */
export const LSYSTEM_RULE_SETS = Object.freeze([
  Object.freeze({
    id: 'canopy', paired: true, axiom: 'X',
    rules: Object.freeze({ X: 'F[+X][-X]FX' }),
  }),
  Object.freeze({
    id: 'fern', paired: false, axiom: 'X',
    rules: Object.freeze({ X: 'F[-Y]FX', Y: 'F[+X]FY' }),
  }),
  Object.freeze({
    id: 'spire', paired: true, axiom: 'X',
    rules: Object.freeze({ X: 'F[+L][-L]FFX', L: 'FF' }),
  }),
]);

/** The seeded stream for a creature's tree — the 'skeleton' channel, keyed as skeleton.js keys its parts. */
function treeStream(seed, creatureId, seedOffsets) {
  return rngForIndex(seed, 'skeleton', fnv1a(`${creatureId}:lsystem`), seedOffsets);
}

/**
 * Bone construction, field for field skeleton.js's makeBone (kept local: skeleton.js does not export its
 * factory, and a tree bone must be indistinguishable in shape from a moth bone — the selfcheck pins the
 * key set against a real moth bone).
 */
function makeBone({ id, parent, chain, role, side, marker, base, tip, parentAngleDeg }) {
  const dx = tip.x - base.x;
  const dy = tip.y - base.y;
  const length = Math.hypot(dx, dy);
  const ux = length > 0 ? dx / length : 0;
  const uy = length > 0 ? dy / length : -1;
  const angleDeg = normDeg((Math.atan2(uy, ux) * 180) / Math.PI);
  return {
    id, parent, chain, role, side, marker,
    base: { x: base.x, y: base.y }, tip: { x: tip.x, y: tip.y },
    ux, uy, angleDeg, length,
    localAngleDeg: parentAngleDeg == null ? 0 : normDeg(angleDeg - parentAngleDeg),
  };
}

/** A unit vector `deg` degrees clockwise from straight up, in canvas orientation (y down) — skeleton.js's. */
function dirFromUp(deg) {
  const r = rad(deg);
  return { x: Math.sin(r), y: -Math.cos(r) };
}

/**
 * Rewrite the axiom by the rule set's productions for `generations` rounds. Pure string work, bounded:
 * generations clamp to the cap, and a round that would pass the string cap is sliced to it and ends the
 * expansion — the same input always slices at the same character.
 */
export function expandLSystem(ruleSet, generations) {
  const gens = clamp(Math.floor(finite(generations, 0)), 0, LSYSTEM_CAPS.generations);
  const rules = (ruleSet && ruleSet.rules) || {};
  let s = (ruleSet && ruleSet.axiom) || '';
  for (let g = 0; g < gens; g++) {
    let next = '';
    for (const ch of s) next += rules[ch] ?? ch;
    if (next.length > LSYSTEM_CAPS.stringLength) { s = next.slice(0, LSYSTEM_CAPS.stringLength); break; }
    s = next;
  }
  return s;
}

/**
 * Grow one tree skeleton. Pure: the same inputs always grow the same tree.
 *
 * @param seed        the document seed
 * @param creatureId  stable per creature — half the RNG key
 * @param ruleSet     a rule set object, an id from LSYSTEM_RULE_SETS, or null (the seed chooses)
 * @param pose        optional overrides for the drawn parameters: { generations, angleDeg, stepLen, ratio } —
 *                    any field absent takes the seeded draw, so an override never shifts another parameter
 * @param seedOffsets the document's seed offsets (the tree rides the SPATIAL stream, like the moth's frame)
 * @returns { plan, creatureId, bones, headBone, hash } — skeleton.js's return shape; plan is `lsystem:<id>`.
 *          Bones are in GROWTH order (the turtle grows the tree the way the tree grows: a trunk segment,
 *          its branches, the next trunk segment), parents always before children.
 */
export function buildTreeSkeleton({ seed = 0, creatureId = 'c0', ruleSet = null, pose = {}, seedOffsets = null } = {}) {
  // Creature-level parameters, drawn in a fixed order from the seeded stream BEFORE any override applies.
  const stream = treeStream(seed, creatureId, seedOffsets);
  const drawnSet = LSYSTEM_RULE_SETS[Math.floor(stream() * LSYSTEM_RULE_SETS.length) % LSYSTEM_RULE_SETS.length];
  const drawn = {
    generations: 3 + Math.floor(stream() * 3), // 3..5 rounds
    angleDeg: 16 + stream() * 14, // the branch angle: 16..30 degrees
    stepLen: 11 + stream() * 5, // the trunk segment length, in box units: 11..16
    ratio: 0.68 + stream() * 0.1, // branch segments taper by this per bracket depth: 0.68..0.78
  };
  const wanted = typeof ruleSet === 'string' ? LSYSTEM_RULE_SETS.find((s) => s.id === ruleSet) : ruleSet;
  const set = wanted && wanted.rules ? wanted : drawnSet;
  const generations = clamp(Math.floor(finite(pose.generations, drawn.generations)), 0, LSYSTEM_CAPS.generations);
  const angleDeg = finite(pose.angleDeg, drawn.angleDeg);
  const stepLen = Math.max(0.1, finite(pose.stepLen, drawn.stepLen));
  const ratio = clamp(finite(pose.ratio, drawn.ratio), 0.1, 1);

  // The turtle: read the expanded string once, emitting a bone per F. State is plain values plus a bounded
  // stack; every loop is bounded by the string (itself capped) and the bone cap.
  const str = expandLSystem(set, generations);
  const bones = [];
  let pos = { x: 0, y: CENTRE }; // rooted at the bottom centre of the box, like the moth's tail point
  let heading = 0; // degrees clockwise from straight up
  let step = stepLen;
  let parentId = null;
  let parentAngle = null;
  let chain = null; // null on the trunk; `branch/<n>` inside a bracket group
  let chainSeg = 0;
  let chainSide = 'C';
  let trunkCount = 0;
  let chainCount = 0;
  const stack = [];
  let skippedPushes = 0;
  for (const ch of str) {
    if (bones.length >= LSYSTEM_CAPS.bones) break;
    if (ch === 'F') {
      const dir = dirFromUp(heading);
      const tip = { x: pos.x + dir.x * step, y: pos.y + dir.y * step };
      let id; let role; let marker; let side;
      if (chain === null) {
        id = `trunk/${trunkCount++}`; role = 'spine'; marker = null; side = 'C';
      } else {
        id = `${chain}/${chainSeg}`; role = 'limb'; marker = chainSeg === 0 ? 'L' : null;
        if (chainSeg === 0) chainSide = dir.x > 1e-9 ? 'R' : dir.x < -1e-9 ? 'L' : 'C';
        side = chainSide;
      }
      const bone = makeBone({ id, parent: parentId, chain, role, side, marker, base: pos, tip, parentAngleDeg: parentAngle });
      bones.push(bone);
      pos = tip; parentId = id; parentAngle = bone.angleDeg;
      if (chain !== null) chainSeg++;
    } else if (ch === '+') {
      heading += angleDeg;
    } else if (ch === '-') {
      heading -= angleDeg;
    } else if (ch === '[') {
      if (stack.length >= LSYSTEM_CAPS.depth) { skippedPushes++; continue; }
      stack.push({ pos, heading, step, parentId, parentAngle, chain, chainSeg, chainSide });
      step *= ratio;
      chain = `branch/${chainCount++}`;
      chainSeg = 0;
    } else if (ch === ']') {
      if (skippedPushes > 0) { skippedPushes--; continue; }
      const st = stack.pop();
      if (!st) continue; // an unbalanced close in a caller-supplied grammar: ignored, never fatal
      ({ pos, heading, step, parentId, parentAngle, chain, chainSeg, chainSide } = st);
    }
    // every other symbol (X, Y, L, ...) is an apex: it shaped the string, the turtle walks past it
  }

  // The head: the last trunk bone — the tree's crown — takes the H, exactly where the moth's last spine
  // bone carries it. (A caller grammar that grows no trunk at all names its root bone instead.)
  let headBone = null;
  for (let i = bones.length - 1; i >= 0; i--) {
    if (bones[i].chain === null || i === 0) {
      bones[i].role = 'head';
      bones[i].marker = 'H';
      headBone = bones[i].id;
      break;
    }
  }

  const skel = { plan: `lsystem:${set.id || 'custom'}`, creatureId, bones, headBone };
  skel.hash = skeletonHash(skel);
  return skel;
}

/** Each bone's generation depth: how many chain boundaries its ancestry crosses (trunk 0, branches 1, sub-branches 2...). */
function generationDepths(skel) {
  const byId = new Map(((skel && skel.bones) || []).map((b) => [b.id, b]));
  const depths = new Map();
  for (const b of (skel && skel.bones) || []) {
    let d = 0;
    let cur = b;
    const seen = new Set([b.id]);
    while (cur.parent && byId.has(cur.parent) && !seen.has(cur.parent)) {
      const parent = byId.get(cur.parent);
      if (parent.chain !== cur.chain) d++;
      seen.add(cur.id);
      cur = parent;
    }
    depths.set(b.id, d);
  }
  return depths;
}

const GROWTH_WINDOW = 0.25; // each bone's sprout spans this fraction of the whole growth, overlapped

/** One bone's sprout factor at a growth amount: bones sprout in growth (construction) order, each eased. */
function growthFactor(index, count, amount) {
  if (amount >= 1) return 1;
  if (amount <= 0) return 0;
  const u = count <= 1 ? 0 : index / (count - 1);
  const raw = clamp01((amount - u * (1 - GROWTH_WINDOW)) / GROWTH_WINDOW);
  return raw * raw * (3 - 2 * raw); // smoothstep: a bone swells in, never pops
}

/** One bone's prune factor at a band: the trunk is never pruned; twigs prune first and furthest. */
function pruneFactor(bone, depth, maxDepth, band) {
  if (band <= 0 || bone.chain === null) return 1;
  const weight = 0.3 + 0.7 * (maxDepth > 0 ? depth / maxDepth : 0);
  return 1 - band * weight;
}

/**
 * Re-pose a tree skeleton with per-bone length factors, by forward kinematics over the bone tree: a bone's
 * base is its parent's POSED tip, its direction its parent's posed direction plus its local angle. Only
 * tree skeletons repose honestly this way — every tree bone grows out of its parent's tip by construction
 * (a moth's chain roots sit on landmarks instead, so this is not a moth operation). The source is never
 * mutated; the posed copy rehashes.
 */
function reposeTree(skel, factorOf) {
  const posed = new Map();
  const bones = ((skel && skel.bones) || []).map((b, i) => {
    const parent = b.parent ? posed.get(b.parent) : null;
    const angleDeg = parent ? normDeg(parent.angleDeg + b.localAngleDeg) : b.angleDeg;
    const base = parent ? parent.tip : b.base;
    const length = b.length * factorOf(b, i);
    const tip = { x: base.x + Math.cos(rad(angleDeg)) * length, y: base.y + Math.sin(rad(angleDeg)) * length };
    const out = {
      ...b, base, tip,
      ux: Math.cos(rad(angleDeg)), uy: Math.sin(rad(angleDeg)),
      angleDeg, length,
    };
    posed.set(b.id, out);
    return out;
  });
  const out = { ...skel, bones };
  out.hash = skeletonHash(out);
  return out;
}

/**
 * Pose a grown tree: sprout it to `growth` (0..1) and prune it to `band` (0 = Relax, untouched; 1 = full
 * Tighten, the outermost twigs collapsed). Both are poses of the one grown structure — see the header.
 */
export function poseTreeSkeleton(skel, { growth = 1, band = 0 } = {}) {
  const g = clamp01(growth);
  const b = clamp01(band);
  if (g === 1 && b === 0) return reposeTree(skel, () => 1);
  const depths = generationDepths(skel);
  const maxDepth = Math.max(0, ...depths.values());
  const count = ((skel && skel.bones) || []).length;
  return reposeTree(skel, (bone, i) => growthFactor(i, count, g) * pruneFactor(bone, depths.get(bone.id) || 0, maxDepth, b));
}

/** The sprouting pose alone: the tree at growth amount `amount` (0 = seed, 1 = fully grown). */
export function growTreeSkeleton(skel, amount) {
  return poseTreeSkeleton(skel, { growth: amount });
}

/** The prune pose alone: the fully grown tree under band `band` (branch length/visibility only — a pose). */
export function pruneTreeSkeleton(skel, band) {
  return poseTreeSkeleton(skel, { band });
}

/**
 * The growth amount at a counted frame index — ruling 4's whole mechanism: a birth is frames counted from
 * the birth frame, so the same (birth frame, frame index) sprouts the same amount on any device, and a
 * recorded take replays the sprout exactly. `frames` is the sprout's length in frames (SPROUT_FRAMES).
 */
export function sproutAmount(frameIndex, frames = SPROUT_FRAMES) {
  const span = Math.max(1, finite(frames, SPROUT_FRAMES));
  return clamp01(finite(frameIndex, 0) / span);
}
