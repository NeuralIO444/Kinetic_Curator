// node src/engine/kernel/cache.selfcheck.mjs
// #1243 — one cache discipline acceptance: makeSmallCache(n) is a
// size-bounded cache with FIFO (evict-oldest) eviction, correct
// hit/miss/delete/clear behavior, and a working cacheGetOrSet helper.

import assert from 'node:assert';
import { makeSmallCache, cacheGetOrSet } from './cache.js';

// ── hit/miss correctness ──────────────────────────────────────────────────
{
  const c = makeSmallCache(4);
  assert.strictEqual(c.get('missing'), undefined, 'miss reads undefined');
  assert.strictEqual(c.has('missing'), false, 'miss reports false for has');
  c.set('a', 1);
  assert.strictEqual(c.get('a'), 1, 'hit returns the stored value');
  assert.strictEqual(c.has('a'), true, 'hit reports true for has');
  c.set('a', 2);
  assert.strictEqual(c.get('a'), 2, 're-set overwrites in place');
  assert.strictEqual(c.size, 1, 're-set does not grow the cache');
}

// ── bounded size + evict-oldest order ─────────────────────────────────────
{
  const c = makeSmallCache(3);
  c.set('a', 'A'); c.set('b', 'B'); c.set('c', 'C');
  assert.strictEqual(c.size, 3, 'fills to cap');
  c.set('d', 'D'); // full: evicts oldest ('a'), keeps b/c/d
  assert.strictEqual(c.size, 3, 'insert on full keeps the cap');
  assert.strictEqual(c.get('a'), undefined, 'oldest entry was evicted');
  assert.strictEqual(c.get('b'), 'B');
  assert.strictEqual(c.get('c'), 'C');
  assert.strictEqual(c.get('d'), 'D');
  // Insertion order follows Map: evicting 'a' then inserting 'd' leaves
  // order b, c, d — next eviction drops 'b'.
  c.set('e', 'E');
  assert.strictEqual(c.get('b'), undefined, 'second-oldest evicted next');
  assert.strictEqual(c.get('c'), 'C');
  assert.strictEqual(c.get('d'), 'D');
  assert.strictEqual(c.get('e'), 'E');
  // Re-setting an existing key on a full cache evicts nothing.
  c.set('c', 'C2');
  assert.strictEqual(c.size, 3, 'overwrite on full evicts nothing');
  assert.strictEqual(c.get('d'), 'D', 'overwrite does not disturb neighbors');
  assert.strictEqual(c.get('c'), 'C2');
}

// ── delete + clear ────────────────────────────────────────────────────────
{
  const c = makeSmallCache(2);
  c.set('a', 1); c.set('b', 2);
  assert.strictEqual(c.delete('a'), true, 'delete of present key returns true');
  assert.strictEqual(c.get('a'), undefined, 'deleted key misses');
  assert.strictEqual(c.size, 1);
  assert.strictEqual(c.delete('nope'), false, 'delete of absent key returns false');
  c.set('c', 3); // 'b' is now oldest; room after delete means no eviction
  assert.strictEqual(c.get('b'), 2, 'no spurious eviction after a delete');
  c.clear();
  assert.strictEqual(c.size, 0, 'clear empties the cache');
  assert.strictEqual(c.get('b'), undefined, 'clear drops all entries');
  c.set('z', 26);
  assert.strictEqual(c.get('z'), 26, 'cache usable after clear');
}

// ── getOrSet: compute once, return the same instance ─────────────────────
{
  const c = makeSmallCache(2);
  let calls = 0;
  const make = () => { calls++; return { v: calls }; };
  const first = cacheGetOrSet(c, 'k', make);
  const second = cacheGetOrSet(c, 'k', make);
  assert.strictEqual(calls, 1, 'factory runs once per key');
  assert.strictEqual(first, second, 'hit returns the identical value');
  assert.strictEqual(c.size, 1);
}

// ── getOrSet honors the cap (evict-oldest through the helper) ─────────────
{
  const c = makeSmallCache(2);
  cacheGetOrSet(c, 'a', () => 'A');
  cacheGetOrSet(c, 'b', () => 'B');
  cacheGetOrSet(c, 'c', () => 'C');
  assert.strictEqual(c.size, 2, 'cap holds through getOrSet');
  assert.strictEqual(c.get('a'), undefined, 'oldest evicted through getOrSet');
  assert.strictEqual(c.get('c'), 'C');
}

// ── cap floors: n < 1 behaves as 1, non-integers floor ────────────────────
{
  const one = makeSmallCache(0);
  one.set('a', 1); one.set('b', 2);
  assert.strictEqual(one.size, 1, 'cap 0 floors to 1');
  assert.strictEqual(one.get('a'), undefined);
  const floored = makeSmallCache(2.9);
  floored.set('a', 1); floored.set('b', 2); floored.set('c', 3);
  assert.strictEqual(floored.size, 2, 'non-integer cap floors');
}

console.log('cache.selfcheck: OK — makeSmallCache bounded, FIFO eviction, hit/miss, delete/clear, getOrSet');
