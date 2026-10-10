// node src/engine/kernel/soa/soa.selfcheck.mjs
// #1305 kernel SoA 1/5 acceptance:
//  - acquire/release round-trip; pool reuse hands back zeroed-or-overwritten
//    columns (debug assertion fires on a planted dirty read)
//  - adapters round-trip objects → columns → objects losslessly
//  - same seed → same columns, bit-identical across runs
// This slice adds no behavior change: nothing in the live path uses the
// columns yet, so there are no goldens to compare — only the contract.

import assert from 'node:assert';
import { mkRng } from '../../prng.js';
import {
  createPointSet,
  POINT_COLUMN_NAMES,
  FAMILY_NONE,
  FAMILY_DEBUG_POISON,
} from './pointSet.js';
import {
  acquirePointSet,
  releasePointSet,
  createPointSetPool,
  assertColumnsClean,
  setSoaDebugEnabled,
  isSoaDebugEnabled,
  SoaContractError,
  soaPoolStats,
} from './pools.js';
import { toObjects, fromObjects } from './adapters.js';

const debugWas = isSoaDebugEnabled();
setSoaDebugEnabled(true); // the contract assertions are a debug-build feature

// ── createPointSet: shape, types, zeroed ────────────────────────────────────
{
  const s = createPointSet(8);
  assert.ok(s.x instanceof Float32Array, 'x is Float32Array');
  assert.ok(s.y instanceof Float32Array, 'y is Float32Array');
  assert.ok(s.vx instanceof Float32Array, 'vx is Float32Array');
  assert.ok(s.vy instanceof Float32Array, 'vy is Float32Array');
  assert.ok(s.energy instanceof Float32Array, 'energy is Float32Array');
  assert.ok(s.slot instanceof Uint16Array, 'slot is Uint16Array');
  assert.ok(s.source instanceof Uint16Array, 'source is Uint16Array');
  assert.ok(s.id instanceof Uint32Array, 'id is Uint32Array');
  assert.ok(s.family instanceof Uint8Array, 'family is Uint8Array');
  for (const name of POINT_COLUMN_NAMES) {
    assert.strictEqual(s[name].length, 8, `${name} has capacity 8`);
    assert.ok(s[name].every((v) => v === 0), `${name} zeroed at birth`);
  }
  assert.strictEqual(s.count, 0, 'count starts at 0');
  assert.strictEqual(s.capacity, 8, 'capacity recorded');
  assert.strictEqual(createPointSet(0).capacity, 1, 'capacity floors at 1');
  assert.strictEqual(createPointSet(2.9).capacity, 2, 'capacity is floored');
  assert.strictEqual(FAMILY_NONE, 0, 'FAMILY_NONE is 0');
  assert.strictEqual(FAMILY_DEBUG_POISON, 0xff, 'poison code is 0xFF');
}

// ── acquire/release round-trip: pool reuse returns the same buffers ────────
{
  const a = acquirePointSet(7, 16);
  assert.strictEqual(a.capacity, 16);
  assert.strictEqual(a.count, 0, 'acquire resets count');
  // Fresh set: zeroed branch of the contract — clean without any write.
  a.count = 16;
  assert.strictEqual(assertColumnsClean(a), true, 'fresh zeroed set is clean');
  // Dirty it like a writer would, then release.
  for (let i = 0; i < 16; i++) {
    a.x[i] = i + 0.5; a.id[i] = 1000 + i; a.family[i] = 7;
  }
  a.count = 16;
  releasePointSet(a);
  assert.strictEqual(soaPoolStats().size, 1, 'released set is parked');
  const b = acquirePointSet(7, 16);
  assert.strictEqual(b.x.buffer, a.x.buffer, 'pool reuse hands back the same buffers');
  assert.strictEqual(b.count, 0, 're-acquire resets count');
  // Debug build: release poisoned every lane, so the stale write is gone —
  // a reader sees loud garbage, never plausible stale data.
  assert.ok(Number.isNaN(b.x[0]), 'debug release poisons float lanes');
  assert.strictEqual(b.id[0], 0xffffffff, 'debug release poisons id lane');
  assert.strictEqual(b.family[0], FAMILY_DEBUG_POISON, 'debug release poisons family lane');
}

// ── planted dirty read: the debug assertion FIRES ──────────────────────────
{
  const s = acquirePointSet(7, 4); // reused (poisoned) or fresh (zeroed)
  releasePointSet(s);
  const t = acquirePointSet(7, 4); // definitely the poisoned one
  assert.strictEqual(t.x.buffer, s.x.buffer, 're-acquired the poisoned set');
  t.count = 4; // plant: claim 4 live lanes without overwriting any
  assert.throws(() => assertColumnsClean(t), SoaContractError,
    'debug assertion fires on a planted dirty read');
  // Full overwrite clears the poison: the assertion goes quiet.
  for (let i = 0; i < 4; i++) {
    t.x[i] = i; t.y[i] = -i; t.vx[i] = 0.25; t.vy[i] = 0.5;
    t.slot[i] = i; t.energy[i] = 1; t.id[i] = i + 1; t.family[i] = 7; t.source[i] = 3;
  }
  assert.strictEqual(assertColumnsClean(t), true, 'fully overwritten set is clean');
  // Partial overwrite still trips: lane 3 left poisoned.
  const u = acquirePointSet(9, 4);
  releasePointSet(u);
  const v = acquirePointSet(9, 4);
  v.count = 4;
  for (let i = 0; i < 3; i++) { v.x[i] = 1; v.y[i] = 1; v.vx[i] = 1; v.vy[i] = 1; v.energy[i] = 1; v.slot[i] = 1; v.id[i] = 1; v.family[i] = 9; v.source[i] = 1; }
  assert.throws(() => assertColumnsClean(v), SoaContractError,
    'partial overwrite still trips the assertion');
  releasePointSet(t);
  releasePointSet(v);
}

// ── pool discipline: one unified pool, bounded, evict-oldest (#1243) ───────
{
  const pool = createPointSetPool(2);
  const a = pool.acquire(1, 4);
  const b = pool.acquire(1, 4);
  const c = pool.acquire(1, 4);
  pool.release(a);
  pool.release(b);
  assert.strictEqual(pool.size, 2, 'pool fills to cap');
  pool.release(c); // full: evicts oldest (a), parks c
  assert.strictEqual(pool.size, 2, 'release on full keeps the cap');
  const got = [pool.acquire(1, 4), pool.acquire(1, 4)];
  const bufs = new Set(got.map((s) => s.x.buffer));
  assert.ok(!bufs.has(a.x.buffer), 'oldest-released set was evicted');
  assert.ok(bufs.has(b.x.buffer) && bufs.has(c.x.buffer), 'newer sets survive');
  // Family lane preference: a set released under family 5 comes back for 5.
  const pool2 = createPointSetPool(4);
  const f5 = pool2.acquire(5, 8);
  const f6 = pool2.acquire(6, 8);
  pool2.release(f6);
  pool2.release(f5);
  const back = pool2.acquire(5, 8);
  assert.strictEqual(back.x.buffer, f5.x.buffer, 'family lane preferred on acquire');
  // Best-fit: a small request does not burn the big buffer.
  const pool3 = createPointSetPool(4);
  const big = pool3.acquire(1, 64);
  const small = pool3.acquire(1, 4);
  pool3.release(big);
  pool3.release(small);
  const req = pool3.acquire(1, 4);
  assert.strictEqual(req.x.buffer, small.x.buffer, 'acquire best-fits capacity');
  pool3.release(req);
  pool3.release(big);
}

// ── guards: reserved family code, non-set release ──────────────────────────
{
  assert.throws(() => acquirePointSet(0xff, 4), SoaContractError,
    'family code 0xFF is reserved for debug poison');
  assert.throws(() => releasePointSet({}), SoaContractError,
    'releasing a non-point-set throws');
  assert.throws(() => releasePointSet(null), SoaContractError,
    'releasing null throws');
}

// ── adapters: lossless round trip ──────────────────────────────────────────
{
  const objs = [
    { x: 0.1, y: -2.5, vx: 3.25, vy: 0, slot: 7, energy: 1.5, id: 42, family: 3, source: 11 },
    { x: 1000.75, y: 0, vx: -0.1, vy: 99.99, slot: 65534, energy: 0, id: 4294967294, family: 254, source: 0 },
    { x: 1 }, // missing fields default to 0
  ];
  const set = fromObjects(objs);
  assert.strictEqual(set.count, 3, 'fromObjects sets count');
  assert.strictEqual(set.capacity, 3, 'fromObjects sizes capacity to input');
  const back = toObjects(set);
  assert.strictEqual(back.length, 3);
  // Float lanes round to float32 on the way in; the expected values are the
  // float32-rounded ones, and the second round trip is exactly stable.
  const f32 = (v) => new Float32Array([v])[0];
  assert.deepStrictEqual(back[0], {
    x: f32(0.1), y: f32(-2.5), vx: f32(3.25), vy: 0, slot: 7,
    energy: f32(1.5), id: 42, family: 3, source: 11,
  }, 'first object survives with float32 rounding');
  assert.deepStrictEqual(back[1], {
    x: f32(1000.75), y: 0, vx: f32(-0.1), vy: f32(99.99), slot: 65534,
    energy: 0, id: 4294967294, family: 254, source: 0,
  }, 'boundary integer values survive');
  assert.deepStrictEqual(back[2], {
    x: 1, y: 0, vx: 0, vy: 0, slot: 0, energy: 0, id: 0, family: 0, source: 0,
  }, 'missing fields default to 0');
  const again = toObjects(fromObjects(back));
  assert.deepStrictEqual(again, back, 'objects → columns → objects is lossless');
  assert.deepStrictEqual(toObjects(fromObjects([])), [], 'empty array round-trips');
  // Kill-list hygiene: adapters stay object-shaped, never leak pool state.
  assert.ok(!('capacity' in back[0]), 'toObjects emits plain data, no bookkeeping');
}

// ── determinism: same seed → same columns, bit-identical ───────────────────
function fillFromSeed(set, seed, n) {
  const rng = mkRng(seed);
  for (let i = 0; i < n; i++) {
    set.x[i] = rng() * 2000 - 1000;
    set.y[i] = rng() * 2000 - 1000;
    set.vx[i] = rng() * 2 - 1;
    set.vy[i] = rng() * 2 - 1;
    set.slot[i] = Math.floor(rng() * 65534);
    set.energy[i] = rng() * 10;
    set.id[i] = Math.floor(rng() * 4294967294);
    set.family[i] = 1 + Math.floor(rng() * 253); // never the 0xFF poison code
    set.source[i] = Math.floor(rng() * 65534);
  }
  set.count = n;
}
function snapshot(set) {
  return Buffer.concat(POINT_COLUMN_NAMES.map((c) => Buffer.from(set[c].buffer)));
}
{
  const N = 64;
  const runA = createPointSet(N);
  fillFromSeed(runA, 1234, N);
  const runB = createPointSet(N);
  fillFromSeed(runB, 1234, N);
  const snapA = snapshot(runA);
  const snapB = snapshot(runB);
  assert.strictEqual(Buffer.compare(snapA, snapB), 0,
    'same seed → bit-identical columns across runs');
  // Through the pool too: release, re-acquire, refill from the same seed.
  releasePointSet(runA);
  const runC = acquirePointSet(2, N);
  fillFromSeed(runC, 1234, N);
  assert.strictEqual(Buffer.compare(snapshot(runC), snapA), 0,
    'same seed → same columns after an acquire/release cycle');
  assert.strictEqual(assertColumnsClean(runC), true, 'refilled set passes the contract');
  const runD = createPointSet(N);
  fillFromSeed(runD, 9999, N);
  assert.notStrictEqual(Buffer.compare(snapshot(runD), snapA), 0,
    'different seed → different columns (sanity)');
  releasePointSet(runB);
  releasePointSet(runC);
  releasePointSet(runD);
}

// ── debug off: no poisoning, assertion is a no-op ───────────────────────────
{
  setSoaDebugEnabled(false);
  const s = acquirePointSet(1, 4);
  for (let i = 0; i < 4; i++) s.x[i] = 123.456; // garbage, no overwrite discipline
  s.count = 4;
  releasePointSet(s);
  const t = acquirePointSet(1, 4);
  assert.strictEqual(t.x.buffer, s.x.buffer, 'pool still reuses with debug off');
  assert.strictEqual(t.x[0], new Float32Array([123.456])[0], 'no poisoning with debug off (prod path: writer overwrites)');
  t.count = 4;
  assert.strictEqual(assertColumnsClean(t), true, 'assertion is a no-op with debug off');
  setSoaDebugEnabled(true);
  releasePointSet(t);
}

setSoaDebugEnabled(debugWas);
console.log('soa.selfcheck: ok — acquire/release contract, adapters, determinism');
