// Kernel cache helper (#1243) — one size-bounded cache discipline for the
// kernel's small memoization maps.
//
// DISCIPLINE (documented, per #1243 review):
// - `makeSmallCache(n)` returns a cache holding at most `n` entries.
// - Inserting a NEW key when the cache is full evicts the OLDEST-inserted
//   entry (FIFO / evict-oldest), then inserts. Re-setting an existing key
//   is a plain overwrite — it does not count as new and does not evict.
// - This replaces the four previously-inconsistent disciplines:
//   `.clear()` on the 9th entry (`_voronoiCentres`, `_lsysCache`,
//   `_growthCache` — nuked hot entries) and FIFO-ish single delete on the
//   8th (`_quadCache`). All four now share cap + evict-oldest.
//
// OUT OF SCOPE: `_caFieldByGrid` stays a WeakMap (#1243 review). It is keyed
// by grid identity so the field is collected with the grid; a size-capped
// Map would pin those keys and leak (or drop a hot grid).
//
// VALUES ARE PURE IN THEIR KEY: every caller computes a deterministic value
// from the key alone, so eviction can only change whether a recompute
// happens — never the value returned. (growth.js is the partial exception:
// its aggregates are advanced in place, but a miss replays from tick 0 with
// the same stream, so (seed, tick) looks identical either way.)

/**
 * A small, size-bounded Map with FIFO eviction.
 * @param {number} n max entries (>0; floored)
 * @returns {{ get, set, has, delete, clear, size }} cache handle
 */
export function makeSmallCache(n) {
  const cap = Math.max(1, Math.floor(Number.isFinite(n) ? n : 8));
  const map = new Map();
  return {
    /** Read; `undefined` on miss (callers' values are never undefined). */
    get(key) {
      return map.get(key);
    },
    /**
     * Write. A new key on a full cache evicts the oldest-inserted entry
     * first. Returns the stored value (handy for `cache.set(k, v)` chains).
     */
    set(key, value) {
      if (!map.has(key) && map.size >= cap) {
        // Map preserves insertion order: the first key is the oldest.
        map.delete(map.keys().next().value);
      }
      map.set(key, value);
      return value;
    },
    has(key) {
      return map.has(key);
    },
    delete(key) {
      return map.delete(key);
    },
    clear() {
      map.clear();
    },
    get size() {
      return map.size;
    },
  };
}

/**
 * Get-or-compute: return the cached value for `key`, or compute it with
 * `make()`, store it (evicting oldest if full), and return it.
 */
export function cacheGetOrSet(cache, key, make) {
  let value = cache.get(key);
  if (value === undefined) {
    value = make();
    cache.set(key, value);
  }
  return value;
}
