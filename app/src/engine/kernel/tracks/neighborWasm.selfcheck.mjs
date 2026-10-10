// node src/engine/kernel/tracks/neighborWasm.selfcheck.mjs
//
// #1318 — kc-neighbor Rust crate (Rust 2/3): spatial hash + neighbor loop.
//
// Acceptance gates:
//   A. kernel/wasm/MANIFEST.json lists kc-neighbor (the #1317 provenance
//      gate in bake/swarmWasm.selfcheck.mjs covers source-hash + bit-for-bit
//      rebuild for every manifest crate — this suite asserts our crate is
//      IN the manifest so a missing build-wasm.sh run fails here too).
//   B. The checked-in wasm loads in Node (loud — parity means nothing
//      without the artifact).
//   C. RNG draw parity: the Rust RNG is the same algorithm and stream
//      partitioning as the JS dish RNG (kernel/rng.js + prng.js) — same
//      seed, JS path vs Rust path, identical draws. Its own selfcheck
//      section, per the design (the hardest correctness requirement).
//   D. Neighbor parity: bit-identical neighbor output (counts + per-target
//      index sequences) JS vs WASM on fixture scenes — mixed, boundary,
//      empty, degenerate, seeded stress, NaN.
//   E. WASM_BACKEND flag: default stays 'js' (this PR does NOT flip it);
//      explicit 'wasm' dispatches to the identical wasm path; the JS
//      implementation is the permanent reference and is never deleted.
//   F. The crate's neighbor sets drive the real FIELD path: wasm indices +
//      JS accumulation reconstructs applyField() bit-for-bit on the mixed
//      fixture (ties the crate to the idea-#4 hot spot it ports).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkRng } from '../../prng.js';
import { rngForIndex, normalizeSeedOffsets } from '../rng.js';
import { applyField, normalizePatch, FIELD_RADIUS } from './trackGraph.js';
import {
  ensureNeighborWasm,
  getNeighborWasm,
  neighborWasmLoadError,
  findNeighborsJS,
  findNeighborsWasm,
  findNeighbors,
  getNeighborBackend,
  setNeighborBackend,
  effectiveNeighborBackend,
} from './neighborWasm.mjs';

const SELFCHECK_DIR = dirname(fileURLToPath(import.meta.url));
const WASM_DIR = join(SELFCHECK_DIR, '..', 'wasm');
const FIELD_SOFT = 1e-4; // mirrors trackGraph.js (module-private there)

// --- A. manifest lists kc-neighbor ---------------------------------------
{
  const manifest = JSON.parse(readFileSync(join(WASM_DIR, 'MANIFEST.json'), 'utf8'));
  const entry = manifest.crates && manifest.crates['kc-neighbor'];
  assert.ok(entry, 'MANIFEST.json must list the kc-neighbor crate (run ./scripts/build-wasm.sh)');
  assert.strictEqual(entry.artifact, 'kc_neighbor.wasm');
  assert.strictEqual(entry.simd128, false, 'kc-neighbor stays scalar per the #1317 policy');
  console.log('[ok] A. MANIFEST.json lists kc-neighbor (scalar, provenance gated by swarmWasm.selfcheck)');
}

// --- B. wasm loads ---------------------------------------------------------
const wasm = await ensureNeighborWasm();
assert.ok(wasm, `kc-neighbor wasm must load in Node (checked-in artifact): ${neighborWasmLoadError()}`);
assert.ok(getNeighborWasm(), 'getNeighborWasm() must return the loaded module');
const X = wasm.instance.exports;
console.log('[ok] B. kc_neighbor.wasm loads and instantiates');

// --- C. RNG draw parity ------------------------------------------------------
// The Rust side composes neighbor_stream_seed -> neighbor_rng_create ->
// neighbor_rng_next; the JS side is the real kernel/rng.js rngForIndex.
// Bit-identical f64 draws (deepStrictEqual), battery over seeds, channels
// (numeric per group, unregistered, registered + unregistered strings),
// indices, and sub-seed offsets.
{
  const enc = new TextEncoder();
  const rustChannel = (ch) => {
    if (typeof ch === 'string') {
      const b = enc.encode(ch);
      // Copy into wasm memory via a fresh view (alloc can grow memory).
      const ptr = X.neighbor_alloc(b.length || 1);
      assert.ok(ptr, 'neighbor_alloc failed');
      try {
        new Uint8Array(X.memory.buffer, ptr, b.length).set(b);
        return X.neighbor_hash_channel(ptr, b.length) >>> 0;
      } finally {
        X.neighbor_free(ptr, b.length || 1);
      }
    }
    return (ch | 0) >>> 0;
  };
  const rustDraws = (seed, ch, index, offsets) => {
    const o = offsets || { spatial: 0, color: 0, asset: 0, noise: 0 };
    const s = X.neighbor_stream_seed(
      seed | 0, rustChannel(ch), index >>> 0,
      o.spatial >>> 0, o.color >>> 0, o.asset >>> 0, o.noise >>> 0,
    ) >>> 0;
    const rng = X.neighbor_rng_create(s);
    assert.ok(rng, 'neighbor_rng_create failed');
    try {
      return Array.from({ length: 8 }, () => X.neighbor_rng_next(rng));
    } finally {
      X.neighbor_rng_destroy(rng);
    }
  };
  const jsDraws = (seed, ch, index, offsets) =>
    Array.from({ length: 8 }, rngForIndex(seed, ch, index, offsets));

  const seeds = [0, 1, 444, -7, 0xa17e9b21];
  // One numeric channel per offset group (dens/spatial, asset, color, noise,
  // curate/spatial), an unregistered numeric, registered + unregistered
  // string channels.
  const channels = [1, 4, 5, 6, 8, 99, 'field', 'growth', 'nope'];
  const indices = [0, 5, 2147483647];
  const offsetSets = [
    null,
    { spatial: 0, color: 0, asset: 0, noise: 0 },
    { spatial: 7, color: 0, asset: 0, noise: 0 },
    { spatial: 1, color: 2, asset: 3, noise: 4 },
    { spatial: 0xffffffff, color: 0xffffffff, asset: 0xffffffff, noise: 0xffffffff },
  ];
  let n = 0;
  for (const seed of seeds) {
    for (const ch of channels) {
      for (const index of indices) {
        for (const offsets of offsetSets) {
          const js = jsDraws(seed, ch, index, offsets);
          const rs = rustDraws(seed, ch, index, normalizeSeedOffsets(offsets));
          assert.deepStrictEqual(
            rs, js,
            `RNG draw mismatch: seed=${seed} channel=${JSON.stringify(ch)} index=${index} ` +
            `offsets=${JSON.stringify(offsets)}\n  js:   ${js}\n  rust: ${rs}`,
          );
          n++;
        }
      }
    }
  }
  console.log(`[ok] C1. RNG stream parity: ${n} (seed, channel, index, offsets) streams × 8 draws bit-identical`);

  // C2: the `(seed|0) || 1` guard — seed 0 draws the seed-1 stream.
  {
    const js = Array.from({ length: 4 }, mkRng(0));
    const rng = X.neighbor_rng_create(0);
    const rs = Array.from({ length: 4 }, () => X.neighbor_rng_next(rng));
    X.neighbor_rng_destroy(rng);
    assert.deepStrictEqual(rs, js, 'neighbor_rng_create(0) must draw the mkRng(0) stream');
    console.log('[ok] C2. seed-0 guard parity (mkRng(0) === mkRng(1) stream, both sides)');
  }

  // C3: the exact-1.0 clamp. Invert one xorshift32 step (bit-level forward
  // substitution, self-verified by the round-trip assert) to build a seed
  // whose first draw is exactly 1.0 — both sides must return 1 - EPSILON.
  {
    const invL = (y, s) => {
      y >>>= 0;
      let x = 0;
      for (let i = 0; i < 32; i++) {
        const yb = (y >>> i) & 1;
        x |= (yb ^ (i >= s ? (x >>> (i - s)) & 1 : 0)) << i;
      }
      return x >>> 0;
    };
    const invR = (y, s) => {
      y >>>= 0;
      let x = 0;
      for (let i = 31; i >= 0; i--) {
        const yb = (y >>> i) & 1;
        x |= (yb ^ (i + s < 32 ? (x >>> (i + s)) & 1 : 0)) << i;
      }
      return x >>> 0;
    };
    const fwd = (x) => {
      x >>>= 0;
      x ^= (x << 13) >>> 0; x >>>= 0;
      x ^= x >>> 17;
      x ^= (x << 5) >>> 0; x >>>= 0;
      return x;
    };
    const seed = invL(invR(invL(0xffffffff, 5), 17), 13);
    assert.strictEqual(fwd(seed), 0xffffffff, 'xorshift inverse round-trip');
    const want = 1 - Number.EPSILON;
    assert.strictEqual(mkRng(seed)(), want, 'JS clamp oracle');
    const rng = X.neighbor_rng_create(seed);
    const got = X.neighbor_rng_next(rng);
    X.neighbor_rng_destroy(rng);
    assert.strictEqual(got, want, `Rust clamp: got ${got}, want ${want}`);
    console.log('[ok] C3. exact-1.0 clamp parity (constructed 0xffffffff state → 1 - Number.EPSILON)');
  }

  // C4: neighbor_hash_u32 is the hashU32 avalanche (spot vectors).
  // Ground truth from node: hashU32(12345, 2, 7, <off>) with the offset
  // mixed exactly as rng.js does (Math.imul(off, 0x27d4eb2d)).
  {
    const direct = [
      [12345, 2, 7, 0, 4094089733],
      [12345, 2, 7, 9, 1809433071],
    ];
    for (const [s, c, i, o, want] of direct) {
      const got = X.neighbor_hash_u32(s | 0, (c | 0) >>> 0, i >>> 0, o >>> 0) >>> 0;
      assert.strictEqual(got, want, `neighbor_hash_u32(${s},${c},${i},${o}): got ${got}, want ${want}`);
    }
    console.log('[ok] C4. neighbor_hash_u32 matches the hashU32 avalanche vectors');
  }
}

// --- D. neighbor parity --------------------------------------------------------
{
  const cols = (pts) => {
    const tx = new Float32Array(pts.map((p) => p[0]));
    const ty = new Float32Array(pts.map((p) => p[1]));
    return [tx, ty];
  };
  const checkScene = (name, targets, sources, radius, maxNeighbors) => {
    const [tx, ty] = cols(targets);
    const [sx, sy] = cols(sources);
    const js = findNeighborsJS(tx, ty, sx, sy, radius, maxNeighbors);
    const w = findNeighborsWasm(wasm, tx, ty, sx, sy, radius, maxNeighbors);
    assert.deepStrictEqual(
      { counts: [...w.counts], indices: [...w.indices] },
      { counts: [...js.counts], indices: [...js.indices] },
      `neighbor parity failed on scene "${name}"`,
    );
    console.log(`[ok] D. scene "${name}": bit-identical (${tx.length} targets × ${sx.length} sources, r=${radius})`);
  };

  // D1: mixed fixture — inside / on / outside the radius + a far target.
  const R = FIELD_RADIUS; // 0.35
  checkScene(
    'mixed',
    [[0, 0], [0.9, 0.9], [R, 0]],
    [[0.1, 0], [-0.2, 0.2], [0, 0.3], [0.34, 0], [0.36, 0], [0.9, 0.9], [R, 0]],
    R, 16,
  );

  // D2: boundary sweep — sources at exactly r and ±1/+2 f32 ulps.
  {
    const r32 = Math.fround(R);
    const up = (v, k) => {
      const b = new DataView(new ArrayBuffer(4));
      b.setFloat32(0, v);
      b.setUint32(0, b.getUint32(0) + k);
      return b.getFloat32(0);
    };
    checkScene(
      'boundary',
      [[0, 0]],
      [[r32, 0], [up(r32, -1), 0], [up(r32, -2), 0], [up(r32, 1), 0], [up(r32, 2), 0],
       [0, r32], [0, up(r32, 1)], [r32 * Math.SQRT1_2, r32 * Math.SQRT1_2]],
      R, 16,
    );
  }

  // D3: empties + single point.
  checkScene('empty-targets', [], [[0.1, 0.2]], R, 4);
  checkScene('empty-sources', [[0.1, 0.2]], [], R, 4);
  checkScene('single', [[0.5, 0.5]], [[0.5, 0.5]], R, 4);

  // D4: degenerate — all points coincident (every pair within radius).
  {
    const pts = Array.from({ length: 7 }, () => [0.5, 0.5]);
    checkScene('coincident', pts.slice(0, 4), pts.slice(0, 7), R, 7);
  }

  // D5: seeded stress — random scenes, small to near-global radii.
  {
    const rng = mkRng(0xC10C);
    const mk = (n) => Array.from({ length: n }, () => [rng(), rng()]);
    const radii = [0.05, 0.12, R, 2.0];
    for (const [ti, si] of [[8, 24], [48, 160]]) {
      const targets = mk(ti);
      const sources = mk(si);
      for (const radius of radii) {
        // Size maxNeighbors from the JS reference (exact fit — the
        // tightest legal buffer), then prove wasm agrees bit-for-bit.
        const [tx, ty] = cols(targets);
        const [sx, sy] = cols(sources);
        const ref = findNeighborsJS(tx, ty, sx, sy, radius, si);
        const maxN = Math.max(...ref.counts, 1);
        checkScene(`stress t${ti}s${si} r${radius}`, targets, sources, radius, maxN);
      }
    }
  }

  // D6: negative + large coordinates (grid extent spans negative cells).
  checkScene(
    'neg-large',
    [[-100, -200], [5000, -3000], [0, 0]],
    [[-100.5, -200.5], [5000.2, -3000.1], [3, 4], [-1e4, 1e4]],
    2.5, 8,
  );

  // D7: NaN coordinates — `d2 > r2` is false, so NaN pairs are INCLUDED,
  // exactly like applyField. Both sides must agree.
  checkScene('nan', [[NaN, 0]], [[NaN, 0], [0.1, 0]], R, 4);

  // D8: overflow is loud on both sides.
  {
    const [tx, ty] = cols([[0, 0]]);
    const [sx, sy] = cols([[0.1, 0], [0.2, 0]]);
    assert.throws(() => findNeighborsJS(tx, ty, sx, sy, R, 1), RangeError, 'JS ref overflow');
    assert.throws(() => findNeighborsWasm(wasm, tx, ty, sx, sy, R, 1), /overflow/, 'wasm overflow');
    console.log('[ok] D. overflow is loud on both backends (maxNeighbors too small)');
  }

  // D9: bad args are loud on both sides.
  {
    const [tx, ty] = cols([[0, 0]]);
    const [sx, sy] = cols([[0.1, 0]]);
    for (const bad of [0, -1, NaN, Infinity]) {
      assert.throws(() => findNeighborsJS(tx, ty, sx, sy, bad, 4), RangeError);
      // The wasm path validates in checkArgs before crossing the boundary;
      // either way it is loud, never silent.
      assert.throws(() => findNeighborsWasm(wasm, tx, ty, sx, sy, bad, 4), /(radius|failed)/);
    }
    console.log('[ok] D. bad radius (0/negative/NaN/Infinity) is loud on both backends');
  }
}

// --- E. WASM_BACKEND flag -------------------------------------------------------
{
  assert.strictEqual(getNeighborBackend(), 'js', 'default backend must be js');
  assert.strictEqual(effectiveNeighborBackend(), 'js', 'effective backend must be js without opt-in');
  assert.throws(() => setNeighborBackend('cuda'), RangeError, 'unknown backend throws');

  // Explicit wasm dispatch == JS reference, bit-for-bit.
  const rng = mkRng(77);
  const mk = (n) => Array.from({ length: n }, () => [rng(), rng()]);
  const T = mk(32);
  const S = mk(96);
  const toC = (pts) => [new Float32Array(pts.map((p) => p[0])), new Float32Array(pts.map((p) => p[1]))];
  const [tx, ty] = toC(T);
  const [sx, sy] = toC(S);
  setNeighborBackend('wasm');
  assert.strictEqual(effectiveNeighborBackend(), 'wasm');
  const w = await ensureNeighborWasm();
  assert.ok(w, 'wasm backend selected but module failed to load');
  const a = findNeighbors(tx, ty, sx, sy, FIELD_RADIUS, { maxNeighbors: 96 });
  const b = findNeighbors(tx, ty, sx, sy, FIELD_RADIUS, { maxNeighbors: 96, backend: 'js' });
  assert.deepStrictEqual(
    { counts: [...a.counts], indices: [...a.indices] },
    { counts: [...b.counts], indices: [...b.indices] },
    'wasm-backend dispatch must equal the JS reference',
  );
  // Env opt-in wins; unsetting restores the stored backend.
  process.env.KC_NEIGHBOR_WASM = '1';
  assert.strictEqual(effectiveNeighborBackend(), 'wasm', 'KC_NEIGHBOR_WASM=1 opts in');
  delete process.env.KC_NEIGHBOR_WASM;
  assert.strictEqual(effectiveNeighborBackend(), 'wasm', 'stored backend still wasm');
  setNeighborBackend('js');
  assert.strictEqual(getNeighborBackend(), 'js', 'backend restored to js');
  assert.strictEqual(effectiveNeighborBackend(), 'js');
  console.log("[ok] E. WASM_BACKEND flag: default 'js', explicit 'wasm' dispatches bit-identical, env opt-in works");
}

// --- F. the crate drives the real FIELD path ------------------------------------
// wasm neighbor sets + JS accumulation reconstruct applyField() bit-for-bit
// on the mixed fixture — the ported hot spot, end to end. The objects are
// built FROM the f32 columns, so both sides compute in f64 on identical
// inputs (f32-vs-f64 boundary values like exactly-0.35 agree by
// construction — that comparison belongs to sections D, not here).
{
  const R = FIELD_RADIUS;
  const rawTargets = [[0, 0], [0.9, 0.9], [R, 0]];
  const rawSources = [
    [0.1, 0], [-0.2, 0.2], [0, 0.3],
    [0.34, 0], [0.36, 0], [0.9, 0.9], [R, 0],
  ];
  const tx = new Float32Array(rawTargets.map((p) => p[0]));
  const ty = new Float32Array(rawTargets.map((p) => p[1]));
  const sx = new Float32Array(rawSources.map((p) => p[0]));
  const sy = new Float32Array(rawSources.map((p) => p[1]));
  const targets = rawTargets.map((_, i) => ({ x: tx[i], y: ty[i] }));
  const sources = rawSources.map((_, j) => ({ x: sx[j], y: sy[j] }));
  const patch = normalizePatch({ from: 0, to: 1, mode: 'field', strength: 1, polarity: 1 });
  const want = applyField(targets, sources, patch);

  const { counts, indices } = findNeighborsWasm(wasm, tx, ty, sx, sy, R, sources.length);
  const gain = 0.002 * 1 * 1;
  const got = targets.map((q, i) => {
    let ax = 0;
    let ay = 0;
    const base = i * sources.length;
    for (let k = 0; k < counts[i]; k++) {
      const s = sources[indices[base + k]];
      const dx = s.x - q.x;
      const dy = s.y - q.y;
      const d2 = dx * dx + dy * dy;
      ax += dx / (d2 + FIELD_SOFT);
      ay += dy / (d2 + FIELD_SOFT);
    }
    return { ...q, x: q.x + ax * gain, y: q.y + ay * gain };
  });
  assert.deepStrictEqual(got, want, 'wasm neighbor sets + JS accumulation must reconstruct applyField()');
  console.log('[ok] F. wasm neighbor sets reconstruct applyField() bit-for-bit on the mixed fixture');
}

console.log('\nneighborWasm selfcheck: all green (#1318)');
