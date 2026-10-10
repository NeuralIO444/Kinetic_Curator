// Kernel SoA 1/5 — point-set pool (#1305).
//
// One unified pool for point sets, following the makeSmallCache
// discipline from #1243: size-bounded, evict-oldest. Releasing into a
// full pool drops the oldest-released set (it becomes garbage); the cap
// bounds live memory, eviction never changes a value a writer computes —
// it only decides whether the next acquire allocates fresh.
//
// ACQUIRE CONTRACT (documented invariant — load-bearing for the
// byte-identical law, per docs/design/soa-hot-paths.md "Risks"):
//   After acquirePointSet, the columns in [0, count) are either
//   (a) ZEROED — fresh sets come from createPointSet, whose typed arrays
//       are all-zero by construction, or
//   (b) FULLY OVERWRITTEN by the writer before any read.
//   There is no third state. In particular a writer must never read a
//   lane it did not write: pooled buffers are reused across frames and a
//   stale lane is a nondeterminism source (different pool history =>
//   different bits).
//
// DEBUG ENFORCEMENT: with debug on (default; KC_SOA_DEBUG=0 or
// setSoaDebugEnabled(false) disables), releasePointSet POISONS every
// column — NaN for the float lanes, 0xFFFF for slot/source, 0xFFFFFFFF
// for id, 0xFF for family — so a read-before-write produces loud
// garbage instead of plausible stale data. assertColumnsClean(set)
// scans [0, set.count) and throws SoaContractError on the first poisoned
// lane. Migration-slice writers call it in debug builds after their full
// overwrite and before reading; the selfcheck plants a dirty read and
// asserts the throw fires. With debug off, assertColumnsClean is a
// no-op returning true and release skips poisoning (prod path: the
// writer's overwrite is the only cost).

import { createPointSet, FAMILY_DEBUG_POISON, columnsLookClean } from './pointSet.js';

/** Thrown when the acquire contract is violated in a debug build. */
export class SoaContractError extends Error {
  constructor(message) {
    super(`[soa] acquire-contract violation: ${message}`);
    this.name = 'SoaContractError';
  }
}

// Debug defaults ON (selfchecks run in node; browser dev too). Prod
// builds / perf runs opt out explicitly. Read off globalThis so this
// module stays browser-bundle clean (no `process` global in .js files).
let debugEnabled = !(
  typeof globalThis.process !== 'undefined' &&
  globalThis.process.env &&
  globalThis.process.env.KC_SOA_DEBUG === '0'
);

/** Enable/disable debug poisoning + assertions. Returns the new state. */
export function setSoaDebugEnabled(on) {
  debugEnabled = on !== false;
  return debugEnabled;
}

/** Current debug state (tests use this to restore after toggling). */
export function isSoaDebugEnabled() {
  return debugEnabled;
}

/**
 * Debug assertion: the live lanes [0, set.count) hold no poison, i.e. the
 * writer either took a zeroed fresh set or fully overwrote a reused one.
 * No-op (returns true) when debug is off.
 * @throws {SoaContractError} in debug builds on the first poisoned lane.
 */
export function assertColumnsClean(set) {
  if (!debugEnabled) return true;
  if (!set || typeof set.count !== 'number') {
    throw new SoaContractError('assertColumnsClean called on a non-point-set');
  }
  if (!columnsLookClean(set)) {
    throw new SoaContractError(
      `set (capacity ${set.capacity}, count ${set.count}) has poisoned lanes ` +
        '— it was read before being fully overwritten (or was never zeroed)'
    );
  }
  return true;
}

function poison(set) {
  set.x.fill(NaN);
  set.y.fill(NaN);
  set.vx.fill(NaN);
  set.vy.fill(NaN);
  set.energy.fill(NaN);
  set.slot.fill(0xffff);
  set.source.fill(0xffff);
  set.id.fill(0xffffffff);
  set.family.fill(FAMILY_DEBUG_POISON);
}

/**
 * One unified point-set pool. Internal free list holds { set, family }
 * entries in release order (oldest first) so eviction is evict-oldest
 * across the whole pool — the makeSmallCache discipline, one cap, one
 * order, no per-family pools. Family lanes are a lookup preference only:
 * acquire prefers a set released under the same family code (cache
 * warmth), then falls back to any family with sufficient capacity —
 * the writer overwrites every column including family, so a cross-family
 * reuse is contract-safe.
 *
 * @param {number} maxSets bound on pooled sets (>= 1, floored)
 */
export function createPointSetPool(maxSets) {
  const cap = Math.max(1, Math.floor(Number.isFinite(maxSets) ? maxSets : 16));
  const free = []; // [{ set, family }] — release order, oldest at [0]

  function evictOldest() {
    free.shift(); // dropped; GC reclaims the buffers
  }

  return {
    /** Pool cap (makeSmallCache-style bound). */
    get cap() {
      return cap;
    },
    /** Number of sets currently parked in the pool. */
    get size() {
      return free.length;
    },

    /**
     * Take a set with capacity >= minCapacity, preferring the family lane.
     * Best-fit (smallest sufficient capacity) within the preferred pass so
     * a small request doesn't burn a large buffer. count is reset to 0;
     * the columns are zeroed (fresh) or poisoned (debug) / stale (prod) —
     * see the acquire contract above.
     */
    acquire(family, minCapacity) {
      const fam = (family >>> 0) & 0xff;
      if (fam === FAMILY_DEBUG_POISON) {
        throw new SoaContractError('family code 0xFF is reserved for debug poison');
      }
      const need = Math.max(1, Math.floor(Number.isFinite(minCapacity) ? minCapacity : 1));
      let best = -1;
      for (let pass = 0; pass < 2 && best < 0; pass++) {
        for (let i = 0; i < free.length; i++) {
          const e = free[i];
          if (e.set.capacity < need) continue;
          if (pass === 0 && e.family !== fam) continue;
          if (best < 0 || e.set.capacity < free[best].set.capacity) best = i;
        }
      }
      let set;
      if (best >= 0) {
        set = free.splice(best, 1)[0].set;
      } else {
        set = createPointSet(need);
      }
      set.count = 0;
      set._poolFamily = fam; // lane tag for the next release
      return set;
    },

    /**
     * Park a set for reuse. count is reset to 0; in debug builds every
     * column is poisoned so the next reader must overwrite before reading
     * (assertColumnsClean enforces it). Releasing into a full pool evicts
     * the oldest-released set first (evict-oldest, per #1243).
     */
    release(set) {
      if (!set || !set.x || typeof set.capacity !== 'number') {
        throw new SoaContractError('releasePointSet called on a non-point-set');
      }
      set.count = 0;
      if (debugEnabled) poison(set);
      while (free.length >= cap) evictOldest();
      free.push({ set, family: (set._poolFamily >>> 0) & 0xff });
      return set;
    },
  };
}

// The one unified pool the module-level acquire/release use.
const defaultPool = createPointSetPool(16);

/**
 * Acquire a point set from the unified pool.
 * @param {number} family uint8 family code (0 = unassigned; 0xFF reserved)
 * @param {number} minCapacity lanes needed (>= 1)
 */
export function acquirePointSet(family, minCapacity) {
  return defaultPool.acquire(family, minCapacity);
}

/** Release a point set back to the unified pool. */
export function releasePointSet(set) {
  return defaultPool.release(set);
}

/** The default pool's cap / occupancy (selfcheck + diagnostics). */
export function soaPoolStats() {
  return { cap: defaultPool.cap, size: defaultPool.size };
}
