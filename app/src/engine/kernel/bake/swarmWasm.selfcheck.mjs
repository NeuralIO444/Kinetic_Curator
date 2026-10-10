// node src/engine/kernel/bake/swarmWasm.selfcheck.mjs
//
// #175 — Rust/wasm swarm fast path: the module loads, the noise field is
// bit-identical to noise.js, the port is faithful (tight gates at low step
// counts), long bakes agree with JS at the distribution level, out-of-scope
// configs fall back to JS exactly, and the 400x120 workload is faster than
// the JS engine it replaces.
//
// #1235/#1317 — the checked-in wasm must match the checked-in Rust sources:
// the gate in section 0 recomputes the source hash of every crate in
// app/src/engine/kernel/wasm/MANIFEST.json and fails unless it equals the
// recorded hash. Section 1 rebuilds every crate from source with
// scripts/build-wasm.sh --verify (self-installing the pinned toolchain) and
// fails CI on a bit-level artifact mismatch, naming the stale crate.
//
// On fidelity: the swarm is chaotic, and the wasm module evaluates sin/cos/
// atan2 with libm while JS uses V8's implementations (~1 ulp apart — the same
// gap the engine already documents between x64 and arm64 in kernel/bake's
// header). A 1-ulp wind-force perturbation grows ~1.35x per step, so after
// ~60 steps the two trajectories are microscopically different swarms with
// the same macroscopic distribution. The gates below assert exactly that:
// bit-exact noise, near-exact short bakes, distribution-level long bakes.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeParticles } from './index.js';
import {
  ensureSwarmWasm,
  getSwarmWasm,
  wasmBakeEligible,
  swarmWasmLoadError,
} from './swarmWasm.mjs';
import { createNoise } from '../../noise.js';
import { DEFAULT_LAYOUT_PARAMS } from '../../../data/layout-modes.js';

const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] };
const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const base = {
  seed: 0xa17e9b21,
  count: 400,
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  activeAssets: assets,
  palette,
  canvasW: 1000,
  canvasH: 700,
  steps: 120,
};

// --- 0. #1317: checked-in wasm matches the checked-in Rust sources -------
// Manifest spec — MUST match scripts/build-wasm.sh (keep in sync):
//   per crate, files = rust-toolchain.toml, Cargo.toml, Cargo.lock
//   (workspace-level: a toolchain/lock bump invalidates every crate),
//   plus <crate>/Cargo.toml and every *.rs under <crate>/src/ (recursive),
//   paths relative to rust/, sorted byte-wise;
//   digest input per file = "<relpath>\n" + raw file bytes + "\n".
// A source change without a manifest rebuild fails here, NAMING the stale
// crate; the recorded rustcVersion must equal the rust/rust-toolchain.toml
// pin, or the manifest was written by the wrong toolchain.
const SELFCHECK_DIR = dirname(fileURLToPath(import.meta.url));
const RUST_DIR = join(SELFCHECK_DIR, '..', '..', '..', '..', '..', 'rust');
const WASM_DIR = join(SELFCHECK_DIR, '..', 'wasm');

function parseToolchainChannel(tomlPath) {
  const m = readFileSync(tomlPath, 'utf8').match(/^channel\s*=\s*"([^"]+)"/m);
  assert.ok(m, `cannot parse channel from ${tomlPath}`);
  return m[1];
}

function crateSourceHash(crate) {
  const files = [
    'rust-toolchain.toml',
    'Cargo.toml',
    'Cargo.lock',
    `${crate}/Cargo.toml`,
  ];
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
  const manifestPath = join(WASM_DIR, 'MANIFEST.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    assert.fail(
      `kernel wasm MANIFEST.json is missing or invalid — run ./scripts/build-wasm.sh: ${e.message}`,
    );
  }
  const pinned = parseToolchainChannel(join(RUST_DIR, 'rust-toolchain.toml'));
  const crates = manifest.crates || {};
  assert.ok(Object.keys(crates).length > 0, 'MANIFEST.json lists no crates');
  for (const [crate, entry] of Object.entries(crates)) {
    assert.strictEqual(
      entry.rustcVersion,
      pinned,
      `crate "${crate}": manifest rustcVersion ${entry.rustcVersion} != pinned toolchain ${pinned} ` +
        `(rebuild with ./scripts/build-wasm.sh)`,
    );
    const current = crateSourceHash(crate);
    assert.strictEqual(
      current,
      entry.sourceHash,
      `stale kernel wasm: crate "${crate}" sources changed without a rebuild ` +
        `(run ./scripts/build-wasm.sh):\n` +
        `  recorded: ${entry.sourceHash}\n  current:  ${current}`,
    );
    console.log(
      `[ok] crate "${crate}" manifest matches Rust sources ` +
        `(source hash ${current.slice(0, 12)}…, rustc ${entry.rustcVersion})`,
    );
  }
}

// --- 1. #1317: checked-in wasm rebuilds bit-for-bit from the rust/** sources
// Rebuild gate, no workflow change needed: scripts/build-wasm.sh --verify
// self-installs the pinned toolchain via rustup (ubuntu-latest lint runners
// carry rustup), rebuilds every crate to a temp dir with cargo --locked, and
// fails NAMING the crate on any artifact mismatch — changes nothing on disk.
// No skip-if-no-cargo fallback: a missing toolchain is a loud failure.
{
  const REPO_ROOT = join(RUST_DIR, '..');
  try {
    execFileSync('bash', [join(REPO_ROOT, 'scripts', 'build-wasm.sh'), '--verify'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      timeout: 600_000,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    assert.fail(
      `build-wasm.sh --verify failed — the checked-in kernel wasm does not ` +
        `reproduce bit-for-bit from the rust/** sources (the script names the ` +
        `stale crate in the output above; rebuild with ./scripts/build-wasm.sh): ` +
        `${e.message}`,
    );
  }
  console.log('[ok] build-wasm.sh --verify: checked-in wasm reproduces bit-for-bit from source');
}

const wasm = await ensureSwarmWasm();
assert.ok(wasm, `swarm wasm must load in Node (checked-in artifact): ${swarmWasmLoadError()}`);
assert.ok(getSwarmWasm(), 'getSwarmWasm() must return the loaded module');
console.log('[ok] wasm module loads and instantiates');

{
  const points = [
    [0, 0, 0], [1.5, -2.25, 3.125], [100.7, 200.3, 0.5],
    [-50.25, 75.5, -12.75], [0.001, 0.002, 999.999], [-999.5, -999.5, -999.5],
  ];
  const seeds = [444, 0, 1, 7, 0xa17e9b21, -7, 3.14, NaN];
  let checked = 0;
  for (const seed of seeds) {
    const js = createNoise(seed);
    for (const [x, y, z] of points) {
      const a = js.noise3D(x, y, z);
      const b = wasm.instance.exports.swarm_noise3d(seed, x, y, z);
      assert.ok(Object.is(a, b), `noise mismatch: seed=${seed} (${x},${y},${z}) js=${a} wasm=${b}`);
      checked++;
    }
  }
  console.log(`[ok] noise bit-identical to JS across ${checked} seed/point combos`);
}

function maxPosDiff(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
    if (d > m) m = d;
  }
  return m;
}
{
  for (const [steps, limit] of [[1, 1e-12], [10, 1e-9]]) {
    const js = bakeParticles({ ...base, steps, engine: 'js' });
    const w = bakeParticles({ ...base, steps, engine: 'wasm' });
    const d = maxPosDiff(js, w);
    assert.ok(d <= limit, `wasm/JS fidelity at ${steps} steps: ${d} > ${limit}`);
    console.log(`[ok] wasm vs JS at ${steps} steps: max pos diff ${d.toExponential(2)} (limit ${limit})`);
  }
}

const w1 = bakeParticles({ ...base, engine: 'wasm' });
const w2 = bakeParticles({ ...base, engine: 'wasm' });
assert.strictEqual(w1.length, w2.length);
for (let i = 0; i < w1.length; i++) {
  assert.ok(Object.is(w1[i].x, w2[i].x) && Object.is(w1[i].y, w2[i].y),
    `wasm bake not deterministic at particle ${i}`);
}
console.log('[ok] wasm bake is exactly deterministic run-to-run');

const wDiff = bakeParticles({ ...base, seed: 0xbeef, engine: 'wasm' });
assert.ok(maxPosDiff(w1, wDiff) > 1, 'a different seed must give a different wasm swarm');
console.log('[ok] wasm bake is seed-sensitive');

function distStats(items) {
  let mx = 0, my = 0;
  for (const p of items) { mx += p.x; my += p.y; }
  mx /= items.length; my /= items.length;
  let sx = 0, sy = 0;
  for (const p of items) { sx += (p.x - mx) ** 2; sy += (p.y - my) ** 2; }
  return { mx, my, sdx: Math.sqrt(sx / items.length), sdy: Math.sqrt(sy / items.length) };
}
for (const seed of [0xa17e9b21, 12345]) {
  const js = bakeParticles({ ...base, seed, engine: 'js' });
  const w = bakeParticles({ ...base, seed, engine: 'wasm' });
  const a = distStats(js), b = distStats(w);
  const cdx = Math.abs(a.mx - b.mx), cdy = Math.abs(a.my - b.my);
  const sdx = Math.abs(a.sdx - b.sdx), sdy = Math.abs(a.sdy - b.sdy);
  assert.ok(cdx <= 15 && cdy <= 15, `centroid drift too large: ${cdx}, ${cdy}`);
  assert.ok(sdx <= 8 && sdy <= 8, `spread drift too large: ${sdx}, ${sdy}`);
  for (const p of w) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'non-finite wasm position');
  }
  console.log(`[ok] 120-step distribution: centroid drift (${cdx.toFixed(2)}, ${cdy.toFixed(2)})px, ` +
    `spread drift (${sdx.toFixed(2)}, ${sdy.toFixed(2)})px`);
}

assert.deepStrictEqual(wasmBakeEligible({ layoutParams: { mode: 'swarm' }, count: 10 }).ok, true);
for (const [label, args, reason] of [
  ['hype mode', { layoutParams: { mode: 'hype' }, count: 10 }, 'organism-mode'],
  ['contacts', { layoutParams: { mode: 'swarm', contactRadius: 5 }, count: 10 }, 'contacts'],
  ['attractor', { layoutParams: { mode: 'swarm' }, attractor: { x: 1, y: 2 }, count: 10 }, 'attractor'],
  ['empty', { layoutParams: { mode: 'swarm' }, count: 0 }, 'empty'],
  // #287 — the wasm cloud path doesn't implement the breathing scale
  // modulation; the JS engine handles it.
  ['breath', { layoutParams: { mode: 'swarm', breath: 0.5 }, count: 10 }, 'breath'],
]) {
  const r = wasmBakeEligible(args);
  assert.strictEqual(r.ok, false, `${label} must be ineligible`);
  assert.strictEqual(r.reason, reason, `${label} reason`);
}
console.log('[ok] scope gate routes hype/contacts/attractor/empty/breath to JS');

{
  const small = { ...base, count: 40, steps: 30 };
  // #814 — engine:"wasm" on a config the gate refuses throws (no silent JS fallback).
  assert.throws(
    () => bakeParticles({ ...small, layoutParams: { ...small.layoutParams, mode: 'hype' }, engine: 'wasm' }),
    /cannot bake this config \(organism-mode\)/,
    'hype + engine:"wasm" must throw',
  );
  assert.throws(
    () => bakeParticles({ ...small, layoutParams: { ...small.layoutParams, contactRadius: 8 }, engine: 'wasm' }),
    /cannot bake this config \(contacts\)/,
    'contacts + engine:"wasm" must throw',
  );
  // engine:'auto' still routes both to the JS engine.
  assert.ok(Array.isArray(bakeParticles({ ...small, layoutParams: { ...small.layoutParams, mode: 'hype' }, engine: 'auto' })));
  assert.ok(Array.isArray(bakeParticles({ ...small, layoutParams: { ...small.layoutParams, contactRadius: 8 }, engine: 'auto' })));
  globalThis.process.env.KC_SWARM_WASM = '0';
  try {
    const forced = bakeParticles({ ...small, engine: 'auto' });
    const plain = bakeParticles({ ...small, engine: 'js' });
    assert.deepStrictEqual(
      forced.map((p) => [p.x, p.y]),
      plain.map((p) => [p.x, p.y]),
      'KC_SWARM_WASM=0 must force the JS engine',
    );
  } finally {
    delete globalThis.process.env.KC_SWARM_WASM;
  }
  console.log('[ok] fallback paths produce exactly the JS result');
}

// --- 9. performance: HARD = not slower than JS; SOFT = 30ms reference budget ---
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
  const REF_BUDGET_MS = 30;
  const jsMs = timeMs(() => bakeParticles({ ...base, engine: 'js' }), { warmup: 1, trials: 5 });
  const wasmMs = timeMs(() => bakeParticles({ ...base, engine: 'wasm' }), { warmup: 2, trials: 7 });
  const ratio = jsMs / Math.max(wasmMs, 1e-9);
  const underBudget = wasmMs <= REF_BUDGET_MS;
  const enforce = String(globalThis.process?.env?.KC_WASM_ENFORCE_BUDGET || '') === '1';

  console.log(
    `  [${underBudget ? 'OK  ' : 'SOFT'}] wasm bake 400x120: ${wasmMs.toFixed(2)}ms ` +
    `(reference budget ${REF_BUDGET_MS}ms${enforce ? ', ENFORCED' : ', advisory'})`,
  );
  console.log(`  [info] JS baseline on this machine: ${jsMs.toFixed(2)}ms — wasm is ${ratio.toFixed(2)}x faster`);
  console.log('  [info] reference machine (JS ~36ms per #175) projects to ' +
    `${(36 / ratio).toFixed(1)}ms for wasm`);

  assert.ok(wasmMs <= jsMs * 1.05,
    `wasm must not be slower than JS: wasm ${wasmMs.toFixed(2)}ms > JS ${jsMs.toFixed(2)}ms`);

  if (enforce && !underBudget) {
    assert.fail(
      `KC_WASM_ENFORCE_BUDGET=1: wasm ${wasmMs.toFixed(2)}ms exceeds reference budget ${REF_BUDGET_MS}ms`,
    );
  }
}
console.log('\nswarmWasm.selfcheck: all green (parity hard; budget soft unless KC_WASM_ENFORCE_BUDGET=1)');
