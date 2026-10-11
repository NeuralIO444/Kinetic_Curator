// node src/engine/kernel/field/fieldsWasm.selfcheck.mjs
//
// #1319 — Rust/wasm field fast path (kc-fields crate): the module loads, the
// noise batch is bit-identical to makeNoiseField, the scent sample and step
// are bit-identical to scent.js, out-of-scope configs are refused by the
// scope gate, and the WASM_BACKEND flags default to JS (the JS
// implementations are the permanent references; default stays JS in this
// PR, period).
//
// #1317 provenance: section 0 recomputes this crate's source hash from
// rust/** and fails unless it equals the MANIFEST.json record, and the
// recorded rustcVersion must equal the rust/rust-toolchain.toml pin.
// Bit-for-bit rebuild verification of every manifest crate (including
// kc-fields) is covered by bake/swarmWasm.selfcheck.mjs §1 —
// build-wasm.sh --verify iterates the whole manifest, so it is not
// duplicated here.
//
// Fidelity notes:
// - Noise is pure f64 arithmetic with JS op order — no trig anywhere in
//   this crate (unlike the bake path's libm sin/cos/atan2 ~1-ulp gap), so
//   the gates below assert Object.is bit-identity, not tolerance.
// - The scent grid is f64 (the JS reference keeps a Float64Array —
//   "simulation state, not render state"); point coordinates cross as f32
//   (the SoA x/y columns). JS reference outputs are written through a
//   Float32Array before comparison so the f64→f32 rounding matches the
//   wasm side's `as f32` exactly.

import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeNoiseField } from './index.js';
import { createScentField, SCENT_COLS, SCENT_ROWS } from './scent.js';
import {
  ensureFieldsWasm,
  getFieldsWasm,
  wasmFieldsEligible,
  wasmBackendFor,
  wasmForcedOff,
  fieldsNoiseBatch,
  fieldsScentSample,
  fieldsScentStep,
  fieldsWasmLoadError,
  WASM_BACKEND,
} from './fieldsWasm.mjs';

const SELFCHECK_DIR = dirname(fileURLToPath(import.meta.url));
const RUST_DIR = join(SELFCHECK_DIR, '..', '..', '..', '..', '..', 'rust');
const WASM_DIR = join(SELFCHECK_DIR, '..', 'wasm');

// --- 0. #1317: checked-in kc_fields.wasm matches the checked-in Rust sources
// Manifest spec — MUST match scripts/build-wasm.sh (keep in sync):
//   per crate, files = rust-toolchain.toml, Cargo.toml, Cargo.lock
//   (workspace-level), plus <crate>/Cargo.toml and every *.rs under
//   <crate>/src/ (recursive), paths relative to rust/, sorted byte-wise;
//   digest input per file = "<relpath>\n" + raw file bytes + "\n".
function parseToolchainChannel(tomlPath) {
  const m = readFileSync(tomlPath, 'utf8').match(/^channel\s*=\s*"([^"]+)"/m);
  assert.ok(m, `cannot parse channel from ${tomlPath}`);
  return m[1];
}

function crateSourceHash(crate) {
  const files = ['rust-toolchain.toml', 'Cargo.toml', 'Cargo.lock', `${crate}/Cargo.toml`];
  const walkRs = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walkRs(p);
      else if (name.endsWith('.rs')) files.push(relative(RUST_DIR, p));
    }
  };
  walkRs(join(RUST_DIR, crate, 'src'));
  files.sort();
  const h = createHash('sha256');
  for (const rel of files) {
    h.update(`${rel}\n`);
    h.update(readFileSync(join(RUST_DIR, rel)));
    h.update('\n');
  }
  return h.digest('hex');
}

{
  const manifest = JSON.parse(readFileSync(join(WASM_DIR, 'MANIFEST.json'), 'utf8'));
  const pinned = parseToolchainChannel(join(RUST_DIR, 'rust-toolchain.toml'));
  const entry = (manifest.crates || {})['kc-fields'];
  assert.ok(entry, 'MANIFEST.json has no "kc-fields" entry — run ./scripts/build-wasm.sh');
  assert.strictEqual(
    entry.rustcVersion, pinned,
    `"kc-fields": manifest rustcVersion ${entry.rustcVersion} != pinned ${pinned}`,
  );
  const current = crateSourceHash('kc-fields');
  assert.strictEqual(
    current, entry.sourceHash,
    `stale fields wasm: kc-fields sources changed without a rebuild ` +
      `(run ./scripts/build-wasm.sh):\n  recorded: ${entry.sourceHash}\n  current:  ${current}`,
  );
  console.log(`[ok] crate "kc-fields" manifest matches Rust sources (source hash ${current.slice(0, 12)}…, rustc ${entry.rustcVersion})`);
}

// --- 1. module loads -------------------------------------------------------
const wasm = await ensureFieldsWasm();
assert.ok(wasm, `fields wasm must load in Node (checked-in artifact): ${fieldsWasmLoadError()}`);
assert.ok(getFieldsWasm(), 'getFieldsWasm() must return the loaded module');
console.log('[ok] wasm module loads and instantiates');

// --- fixtures --------------------------------------------------------------
// Deterministic PRNG for fixture scenes (JS-side only — the wasm side only
// ever receives the generated points).
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Fixture point scenes: edge cases (including NaN/Infinity, which must
// propagate to NaN identically on both sides) plus a deterministic
// pseudo-random cloud in [0,1) and in [-2,2).
const EDGE_POINTS = [
  [0, 0], [1, 1], [0.5, 0.5], [-1, -1], [2, 3], [-0.0, 0.0],
  [0.99999, 0.00001], [1e-7, -1e-7], [123.456, -789.012],
  [0.0078125, 0.9921875], // exact cell-center-ish fractions
  [Number.NaN, 0.5], [0.5, Number.NaN], [Number.NaN, Number.NaN],
  [Number.POSITIVE_INFINITY, 0.5], [0.5, Number.NEGATIVE_INFINITY],
];
const rand = lcg(0xC0FFEE);
const RAND_POINTS = [];
for (let i = 0; i < 256; i++) RAND_POINTS.push([rand(), rand()]);
for (let i = 0; i < 64; i++) RAND_POINTS.push([rand() * 4 - 2, rand() * 4 - 2]);
const FIXTURE_POINTS = [...EDGE_POINTS, ...RAND_POINTS];

function toF32Columns(points) {
  const n = points.length;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = points[i][0];
    ys[i] = points[i][1];
  }
  return { xs, ys, n };
}

function assertF32Identical(a, b, label) {
  assert.strictEqual(a.length, b.length, `${label}: length mismatch`);
  for (let i = 0; i < a.length; i++) {
    assert.ok(Object.is(a[i], b[i]), `${label}: lane ${i} differs (js=${a[i]}, wasm=${b[i]})`);
  }
}

// --- 2. noise: bit-identical to makeNoiseField -------------------------------
// Raw-export path for edge seeds the scope gate deliberately refuses
// (NaN/Infinity seeds are caller bugs — the wrapper stays loud about them).
// Test-only staging; the wrapper owns the real allocator.
function rawNoiseBatch(seed, { freq = 2.5, octaves = 3, lacunarity = 2, gain = 0.5, z = 0 } = {}, xs, ys, out) {
  const { exports } = wasm.instance;
  const n = xs.length;
  const base = exports.memory.buffer.byteLength; // page-aligned, never collides
  exports.memory.grow(Math.ceil((n * 4 * 3) / 65536) + 1);
  const buf = exports.memory.buffer;
  const px = base, py = base + n * 4, po = base + n * 8;
  new Float32Array(buf, px, n).set(xs);
  new Float32Array(buf, py, n).set(ys);
  exports.fields_noise_batch(seed, freq, octaves, lacunarity, gain, z, px, py, po, n);
  out.set(new Float32Array(exports.memory.buffer, po, n));
  return out;
}

function checkNoiseParity(seed, opts, xs, ys, n, raw) {
  const field = makeNoiseField(seed, opts);
  const ref = new Float32Array(n);
  for (let i = 0; i < n; i++) ref[i] = field.sample(xs[i], ys[i]);
  const out = new Float32Array(n);
  if (raw) rawNoiseBatch(seed, opts, xs, ys, out);
  else fieldsNoiseBatch(wasm, seed, opts, xs, ys, out, n);
  assertF32Identical(ref, out, `noise seed=${seed} opts=${JSON.stringify(opts)}${raw ? ' (raw export)' : ''}`);
  return n;
}

{
  const seeds = [444, 0, 1, 7, 0xa17e9b21, -7, 3.14, 2 ** 31, 2 ** 32 + 5];
  const edgeSeeds = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const paramSets = [
    {}, // registry defaults: freq 2.5, octaves 3, lacunarity 2, gain 0.5, z 0
    { freq: 0.5, octaves: 1, lacunarity: 2, gain: 0.5, z: 10 },
    { freq: 8, octaves: 8, lacunarity: 2.5, gain: 0.7, z: -3.25 },
    { freq: 0, octaves: 1, lacunarity: 3, gain: 0.9, z: 0.125 },
  ];
  const { xs, ys, n } = toF32Columns(FIXTURE_POINTS);
  let checked = 0;
  for (const seed of seeds) {
    for (const opts of paramSets) checked += checkNoiseParity(seed, opts, xs, ys, n, false);
  }
  for (const seed of edgeSeeds) {
    for (const opts of paramSets) checked += checkNoiseParity(seed, opts, xs, ys, n, true);
  }
  console.log(`[ok] noise batch bit-identical to JS across ${checked} seed/param/point lanes (incl. NaN/Inf coords + edge seeds)`);
}

// --- 2b. large batch: staging must not touch the module's own memory ----------
// 150k points = 1.8 MB of staged columns. A bump allocator starting at
// address 0 walks into the Rust shadow stack (low 1 MiB) around ~87k points;
// the wrapper pins its region past the module's initial memory instead.
{
  const n = 150_000;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = ((i * 2654435761) >>> 0) / 4294967296;
    ys[i] = ((i * 40503 + 17) >>> 0) % 65536 / 65536;
  }
  const opts = { freq: 3, octaves: 4, lacunarity: 2, gain: 0.5, z: 0.5 };
  const field = makeNoiseField(444, opts);
  const out = new Float32Array(n);
  fieldsNoiseBatch(wasm, 444, opts, xs, ys, out, n);
  for (let i = 0; i < n; i++) {
    const ref = field.sample(xs[i], ys[i]);
    if (!Object.is(Math.fround(ref), out[i])) assert.fail(`large batch lane ${i}: ${out[i]} != ${ref}`);
  }
  // module still sound after the big call: a small batch is still exact
  const { xs: sx, ys: sy, n: sn } = toF32Columns(FIXTURE_POINTS);
  checkNoiseParity(7, {}, sx, sy, sn, false);
  console.log(`[ok] ${n}-point noise batch bit-identical; module memory intact afterwards`);
}

// --- 3. scent sample: bit-identical to scent.js --------------------------------
// The JS field keeps its grid private, so the fixture grid is built with the
// exact deposit sequence on both sides: the JS field via field.deposit, the
// wasm side via a Float64Array replicating deposit's index math.
const SCENT_COLS_FIX = SCENT_COLS;
const SCENT_ROWS_FIX = SCENT_ROWS;

function depositInto(cells, cols, rows, nx, ny, amount) {
  if (!(amount > 0)) return; // mirrors scent.js deposit exactly
  const cx = Math.min(cols - 1, Math.max(0, Math.round(nx * cols - 0.5)));
  const cy = Math.min(rows - 1, Math.max(0, Math.round(ny * rows - 0.5)));
  cells[cy * cols + cx] += amount;
}

function buildScentFixture(cols, rows) {
  const field = createScentField(cols, rows);
  const cells = new Float64Array(cols * rows);
  const drand = lcg(0x5ce4);
  const deposits = [];
  for (let i = 0; i < 40; i++) {
    const nx = drand() * 1.2 - 0.1; // some out-of-bounds on purpose (clamped)
    const ny = drand() * 1.2 - 0.1;
    const amount = 0.25 + drand() * 3.75;
    deposits.push([nx, ny, amount]);
  }
  // NaN/zero-amount deposits are no-ops on both sides.
  deposits.push([0.5, 0.5, 0], [0.5, 0.5, -1], [0.5, 0.5, Number.NaN]);
  for (const [nx, ny, amount] of deposits) {
    field.deposit(nx, ny, amount);
    depositInto(cells, cols, rows, nx, ny, amount);
  }
  return { field, cells };
}

{
  for (const [cols, rows] of [[SCENT_COLS_FIX, SCENT_ROWS_FIX], [5, 3], [2, 2], [1, 1]]) {
    const { field, cells } = buildScentFixture(cols, rows);
    const { xs, ys, n } = toF32Columns(FIXTURE_POINTS);
    const ref = new Float32Array(n);
    for (let i = 0; i < n; i++) ref[i] = field.sample(xs[i], ys[i]);
    const out = new Float32Array(n);
    fieldsScentSample(wasm, cells, cols, rows, xs, ys, out, n);
    assertF32Identical(ref, out, `scent-sample ${cols}x${rows}`);
  }
  console.log('[ok] scent sample bit-identical to JS on 64x36 + edge grids (incl. NaN/Inf coords)');
}

// --- 4. scent step: bit-identical diffuse/decay --------------------------------
// Compare through cell-center sampling: sampling at ((cx+0.5)/cols,
// (cy+0.5)/rows) returns exactly that cell (fx=fy=0), so probing every
// cell center is a full bit-for-bit grid comparison without exposing the
// JS field's private cells.
function gridViaCellCenters(field, wasmCells, cols, rows, label) {
  const n = cols * rows;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      xs[i] = (x + 0.5) / cols;
      ys[i] = (y + 0.5) / rows;
    }
  }
  const ref = new Float32Array(n);
  for (let i = 0; i < n; i++) ref[i] = field.sample(xs[i], ys[i]);
  const out = new Float32Array(n);
  fieldsScentSample(wasm, wasmCells, cols, rows, xs, ys, out, n);
  assertF32Identical(ref, out, label);
}

{
  for (const [cols, rows, steps] of [[SCENT_COLS_FIX, SCENT_ROWS_FIX, 12], [5, 3, 30]]) {
    const { field, cells } = buildScentFixture(cols, rows);
    // Non-default decay/diffuse on the small grid; defaults on the big one.
    const opts = cols === 5 ? { decay: 0.9, diffuse: 0.4 } : {};
    for (let s = 0; s < steps; s++) field.step(opts);
    const wasmCells = Float64Array.from(cells);
    for (let s = 0; s < steps; s++) fieldsScentStep(wasm, wasmCells, cols, rows, opts);
    gridViaCellCenters(field, wasmCells, cols, rows, `scent-step ${cols}x${rows} x${steps}`);
  }
  console.log('[ok] scent step bit-identical to JS after 12 default + 30 custom-param steps');
}

// --- 5. determinism + seed sensitivity -----------------------------------------
{
  const { xs, ys, n } = toF32Columns(FIXTURE_POINTS);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  fieldsNoiseBatch(wasm, 1234, {}, xs, ys, a, n);
  fieldsNoiseBatch(wasm, 1234, {}, xs, ys, b, n);
  assertF32Identical(a, b, 'noise determinism');
  const c = new Float32Array(n);
  fieldsNoiseBatch(wasm, 1235, {}, xs, ys, c, n);
  let diff = 0;
  for (let i = 0; i < n; i++) if (!Object.is(a[i], c[i])) diff++;
  assert.ok(diff > n / 2, 'a different seed must change most noise lanes');

  const { cells } = buildScentFixture(8, 5);
  const g1 = Float64Array.from(cells);
  const g2 = Float64Array.from(cells);
  fieldsScentStep(wasm, g1, 8, 5, {});
  fieldsScentStep(wasm, g1, 8, 5, {});
  fieldsScentStep(wasm, g2, 8, 5, {});
  fieldsScentStep(wasm, g2, 8, 5, {});
  for (let i = 0; i < g1.length; i++) {
    assert.ok(Object.is(g1[i], g2[i]), `scent step not deterministic at cell ${i}`);
  }
  console.log('[ok] wasm field eval is exactly deterministic run-to-run and seed-sensitive');
}

// --- 6. scope gate --------------------------------------------------------------
{
  assert.deepStrictEqual(wasmFieldsEligible('noise', { seed: 1, freq: 2.5, octaves: 3, lacunarity: 2, gain: 0.5, z: 0, count: 4, xsLen: 4, ysLen: 4, outLen: 4 }).ok, true);
  const bad = [
    ['empty', ['noise', { count: 0, xsLen: 0, ysLen: 0, outLen: 0 }], 'empty'],
    ['short buffer', ['noise', { seed: 1, freq: 1, octaves: 3, lacunarity: 2, gain: 0.5, z: 0, count: 4, xsLen: 3, ysLen: 4, outLen: 4 }], 'short-buffer'],
    ['bad octaves', ['noise', { seed: 1, freq: 1, octaves: 9, lacunarity: 2, gain: 0.5, z: 0, count: 4, xsLen: 4, ysLen: 4, outLen: 4 }], 'bad-octaves'],
    ['bad seed', ['noise', { seed: Number.NaN, freq: 1, octaves: 3, lacunarity: 2, gain: 0.5, z: 0, count: 4, xsLen: 4, ysLen: 4, outLen: 4 }], 'bad-seed'],
    ['grid mismatch', ['scent-step', { cols: 4, rows: 4, cellsLen: 15, decay: 0.9, diffuse: 0.2 }], 'grid-mismatch'],
    ['bad grid', ['scent-sample', { cols: 0, rows: 4, cellsLen: 0, count: 1, xsLen: 1, ysLen: 1, outLen: 1 }], 'bad-grid'],
  ];
  for (const [label, args, reason] of bad) {
    const r = wasmFieldsEligible(...args);
    assert.strictEqual(r.ok, false, `${label} must be ineligible`);
    assert.strictEqual(r.reason, reason, `${label} reason`);
  }
  // Ineligible calls throw — no silent wrong answers.
  assert.throws(
    () => fieldsNoiseBatch(wasm, 1, {}, new Float32Array(2), new Float32Array(2), new Float32Array(2), 0),
    /ineligible \(empty\)/,
    'empty noise batch must throw',
  );
  console.log('[ok] scope gate refuses out-of-scope configs with named reasons');
}

// --- 7. default stays JS ----------------------------------------------------------
{
  assert.strictEqual(WASM_BACKEND.noise, false, 'WASM_BACKEND.noise must default to false');
  assert.strictEqual(WASM_BACKEND.scent, false, 'WASM_BACKEND.scent must default to false');
  assert.strictEqual(wasmBackendFor('noise'), false);
  assert.strictEqual(wasmBackendFor('scent'), false);
  assert.strictEqual(wasmBackendFor('quadtree'), false, 'unknown field ids stay JS');
  assert.strictEqual(wasmForcedOff(), false, 'KC_FIELDS_WASM unset must not force off');
  console.log('[ok] WASM_BACKEND defaults to JS for every field (default stays JS, #1319)');
}

// --- 8. performance: HARD = not slower than JS -----------------------------------
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function timeMs(fn, { warmup, trials }) {
  for (let i = 0; i < warmup; i++) fn();
  const ts = [];
  for (let i = 0; i < trials; i++) {
    const t0 = performance.now();
    fn();
    ts.push(performance.now() - t0);
  }
  return median(ts);
}
{
  const N = 4096;
  const { xs, ys } = toF32Columns(FIXTURE_POINTS);
  const big = { xs: new Float32Array(N), ys: new Float32Array(N) };
  for (let i = 0; i < N; i++) {
    big.xs[i] = xs[i % xs.length];
    big.ys[i] = ys[i % ys.length];
  }
  const out = new Float32Array(N);
  const refField = makeNoiseField(777, {});
  const jsMs = timeMs(() => {
    for (let i = 0; i < N; i++) out[i] = refField.sample(big.xs[i], big.ys[i]);
  }, { warmup: 1, trials: 5 });
  const wasmMs = timeMs(() => fieldsNoiseBatch(wasm, 777, {}, big.xs, big.ys, out, N), { warmup: 2, trials: 7 });
  const ratio = jsMs / Math.max(wasmMs, 1e-9);
  console.log(`  [info] noise batch ${N} pts: JS ${jsMs.toFixed(2)}ms, wasm ${wasmMs.toFixed(2)}ms (${ratio.toFixed(2)}x)`);
  assert.ok(wasmMs <= jsMs * 1.05, `wasm must not be slower than JS: ${wasmMs.toFixed(2)} > ${jsMs.toFixed(2)}`);

  const { cells } = buildScentFixture(SCENT_COLS_FIX, SCENT_ROWS_FIX);
  const jsField = createScentField(SCENT_COLS_FIX, SCENT_ROWS_FIX);
  for (let i = 0; i < cells.length; i++) jsField.deposit(((i * 37) % SCENT_COLS_FIX) / SCENT_COLS_FIX, ((i * 53) % SCENT_ROWS_FIX) / SCENT_ROWS_FIX, 1);
  const wasmCells = Float64Array.from(cells);
  const jsStepMs = timeMs(() => jsField.step(), { warmup: 1, trials: 5 });
  const wasmStepMs = timeMs(() => fieldsScentStep(wasm, wasmCells, SCENT_COLS_FIX, SCENT_ROWS_FIX, {}), { warmup: 2, trials: 7 });
  const stepRatio = jsStepMs / Math.max(wasmStepMs, 1e-9);
  console.log(`  [info] scent step 64x36: JS ${jsStepMs.toFixed(2)}ms, wasm ${wasmStepMs.toFixed(2)}ms (${stepRatio.toFixed(2)}x)`);
  assert.ok(wasmStepMs <= jsStepMs * 1.05, `wasm step must not be slower than JS: ${wasmStepMs.toFixed(2)} > ${jsStepMs.toFixed(2)}`);
}
console.log('\nfieldsWasm.selfcheck: all green (parity bit-identical; wasm not slower than JS)');
