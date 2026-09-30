// node src/engine/particles.lorenzReseed.selfcheck.mjs
//
// #710 — Lorenz re-entry: restart-from-seed lock.
//
// Re-tapping the lorenz behave pill must restart the SAME dance from seed
// (rehearsable) — never a random one, and never a resume of the frozen
// poles (persist-across-exits was rejected as unrehearsable by feel).
// The engine re-seeds every agent's Lorenz phase state from the seeded
// hashes on entry into the lorenz behave; this pins that contract:
//
//   enter lorenz → run frames → exit to flock → run frames → re-enter
//   lorenz → phase state (lorenzX/Y/Z) bit-identical to first entry.
//
// Positions are deliberately NOT asserted: behave switches glide through
// the blend path, so positions legitimately differ after a switch. Only
// the phase state must be identical.

import assert from 'node:assert';
import { ParticleSystem } from './particles.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] };
const SEED = 0x710;
const W = 1000;
const H = 700;
const N = 60;

const lp = (behave) => normalizeLayoutParams({
  ...DEFAULT_LAYOUT_PARAMS, mode: 'hype', behave, particleCount: N,
});

function step(sys, behave, frames, t0) {
  for (let s = 0; s < frames; s++) {
    sys.update(lp(behave), assets, palette, SEED, t0 + s * (1000 / 60), null);
  }
}

/** Copy the live phase columns — the engine mutates them in place. */
function snapshotPhase(sys) {
  return {
    x: Float64Array.from(sys.lorenzX.subarray(0, sys.n)),
    y: Float64Array.from(sys.lorenzY.subarray(0, sys.n)),
    z: Float64Array.from(sys.lorenzZ.subarray(0, sys.n)),
  };
}

function assertPhaseIdentical(a, b, label) {
  assert.strictEqual(a.x.length, b.x.length, `${label}: live agent count`);
  for (let i = 0; i < a.x.length; i++) {
    assert.ok(
      Object.is(a.x[i], b.x[i]) && Object.is(a.y[i], b.y[i]) && Object.is(a.z[i], b.z[i]),
      `${label}: agent ${i} phase state differs on re-entry — ` +
      `(${a.x[i]}, ${a.y[i]}, ${a.z[i]}) vs (${b.x[i]}, ${b.y[i]}, ${b.z[i]}). ` +
      `The lorenz entry re-seed is broken: re-entry must restart the seeded dance, ` +
      `not resume frozen poles or draw at random. Do not relax this assertion.`,
    );
  }
}

// The contract: enter lorenz → exit to flock → re-enter → identical phase.
{
  const sys = new ParticleSystem();
  sys.init(N, W, H, assets, palette, SEED);
  step(sys, 'lorenz', 1, 1_000_000);
  const first = snapshotPhase(sys);
  // Sanity: the dance actually advances while the behave is active — a
  // frozen phase state would make the re-entry assertion vacuous.
  step(sys, 'lorenz', 30, 2_000_000);
  const advanced = snapshotPhase(sys);
  let moved = false;
  for (let i = 0; i < N; i++) {
    if (!Object.is(first.x[i], advanced.x[i]) || !Object.is(first.y[i], advanced.y[i])) {
      moved = true;
      break;
    }
  }
  assert.ok(moved, 'lorenz phase state must advance while active (else this test is vacuous)');
  // Every agent must be clear of the origin fixed point on entry — a seeded
  // agent left at (0,0,0) would never move and never will.
  for (let i = 0; i < N; i++) {
    assert.ok(
      Math.abs(first.x[i]) > 1e-9 || Math.abs(first.y[i]) > 1e-9 || Math.abs(first.z[i]) > 1e-9,
      `agent ${i} seeded onto the origin fixed point`,
    );
  }
  // Exit to flock, then re-enter: the dance restarts from seed.
  step(sys, 'flock', 30, 3_000_000);
  step(sys, 'lorenz', 1, 4_000_000);
  const reentered = snapshotPhase(sys);
  assertPhaseIdentical(first, reentered, 're-entry');
}

// Entry from a different prior behave restarts identically too, and two
// independent systems with the same seed agree on entry state.
{
  const sys = new ParticleSystem();
  sys.init(N, W, H, assets, palette, SEED);
  step(sys, 'cruise', 20, 1_000_000);
  step(sys, 'lorenz', 1, 2_000_000);
  const viaCruise = snapshotPhase(sys);

  const sys2 = new ParticleSystem();
  sys2.init(N, W, H, assets, palette, SEED);
  step(sys2, 'lorenz', 1, 1_000_000);
  const direct = snapshotPhase(sys2);
  assertPhaseIdentical(viaCruise, direct, 'cross-system');
}

console.log('#710 lorenz re-entry: restart-from-seed locked');
