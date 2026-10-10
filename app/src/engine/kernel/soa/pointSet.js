// Kernel SoA 1/5 — point-set columns (#1305).
//
// Flat typed-array columns are the kernel's native data model
// (docs/design/soa-hot-paths.md, "Proposed architecture").
//
// A point set is one entity cohort: position, velocity, slot, energy,
// plus the dish §1b identity columns — id / family / source — so
// addressability is free at placement, exactly as the dish cost note
// demands. `count` is the live prefix length: readers only touch
// [0, count); the pool's acquire contract (pools.js) says those lanes
// are either zeroed (fresh sets) or fully overwritten by the writer
// before any read.
//
// Column layout (fixed for the whole migration; slices 2–5/5 must not
// reorder without a versioned behavior flag — byte-identical law):
//   x, y, vx, vy : Float32Array — position / velocity
//   slot         : Uint16Array  — feed delay slot / placement slot
//   energy       : Float32Array — scalar energy / weight
//   id           : Uint32Array  — dish §1b entity identity
//   family       : Uint8Array   — dish §1b family code (see below)
//   source       : Uint16Array  — dish §1b source code
//
// PRECISION RULE (#1309 — reconciles the slices into one documented rule).
// Slices chose different widths on purpose, and bit-identity wins over
// uniformity:
//   f64 — compute lanes whose values flow into bit-pinned output. Placement
//     geometry (engine/placement.js: x/y/scale/rotation/alpha/t — f64
//     deliberately, the golden fingerprints 4 decimals on values ~1000,
//     right at float32's resolution) and the liveResolve FIELD/FEED scratch
//     columns (gl/fieldFeedColumns.mjs: normalized coords feed the neighbor
//     accumulation — f32 rounding moved the low bits, so the scratch stays
//     f64 and the object path's bits are reproduced exactly).
//   f32 — storage/transfer lanes where the narrowed value is itself pinned
//     or the consumer re-derives: the PointSet columns above, and the feed
//     delay (u, v) column pairs (tracks/feedOps.js — the f32 luma encode is
//     golden-pinned by feedColumns.golden.json).
// The rule: a lane is f64 when narrowing it would move a golden hash, f32
// when the golden pins the narrowed value or the lane is storage/transfer
// only. Narrowing a lane is a behavior change — it needs a golden proving
// the new bits, or a versioned behavior flag. Never a silent precision
// change.
//
// Family codes: uint8, 0 = unassigned. Codes 1–254 are the writer's
// namespace; code 255 (0xFF) is RESERVED in debug builds — pools.js
// poisons released columns with 0xFF-family so a read-before-write
// fails loudly instead of silently selecting a family. A later slice
// adds the dish string↔code registry; until then writers pick codes.

/** Data columns of a point set, in canonical order. */
export const POINT_COLUMN_NAMES = Object.freeze([
  'x', 'y', 'vx', 'vy', 'slot', 'energy', 'id', 'family', 'source',
]);

/** Family code meaning "no family assigned". */
export const FAMILY_NONE = 0;

/** Family code reserved for debug poisoning — never assign to entities. */
export const FAMILY_DEBUG_POISON = 0xff;

/**
 * Allocate a zeroed point set. Fresh typed arrays are all-zero, which is
 * the "zeroed" branch of the pool acquire contract — a fresh set is safe
 * to read (as empty) before any writer touches it.
 *
 * @param {number} capacity lanes per column (>= 1, floored)
 * @returns {{x,y,vx,vy,slot,energy,id,family,source,count,capacity}}
 *   `count` starts at 0 (empty); `capacity` is pool bookkeeping, not a
 *   data column.
 */
export function createPointSet(capacity) {
  const n = Math.max(1, Math.floor(Number.isFinite(capacity) ? capacity : 1));
  return {
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    slot: new Uint16Array(n),
    energy: new Float32Array(n),
    id: new Uint32Array(n),
    family: new Uint8Array(n),
    source: new Uint16Array(n),
    count: 0,
    capacity: n,
  };
}

/**
 * True when every lane of every column in [0, set.count) holds no debug
 * poison (see pools.js). Pure predicate — the throwing assertion lives in
 * pools.js next to the pool that plants the poison.
 */
export function columnsLookClean(set) {
  const n = set.count | 0;
  for (let i = 0; i < n; i++) {
    if (
      Number.isNaN(set.x[i]) || Number.isNaN(set.y[i]) ||
      Number.isNaN(set.vx[i]) || Number.isNaN(set.vy[i]) ||
      Number.isNaN(set.energy[i])
    ) return false;
    if (set.slot[i] === 0xffff || set.source[i] === 0xffff) return false;
    if (set.id[i] === 0xffffffff) return false;
    if (set.family[i] === FAMILY_DEBUG_POISON) return false;
  }
  return true;
}
