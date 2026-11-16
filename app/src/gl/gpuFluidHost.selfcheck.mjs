// node src/gl/gpuFluidHost.selfcheck.mjs
// K1 slice 4a (#2186) — the GPU fluid host's pure half: the step scheduler mirrors the JS stage's bookkeeping, and the
// readback unpack is the v phase. (The GL half is exercised on a real context — parity/fluidSim — and skips here.)
import assert from 'node:assert/strict';
import { planFluidSteps, densityFromRGBA } from './gpuFluidHost.mjs';
import {
  fluidStamp,
  FLUID_GRID_COLS,
  FLUID_GRID_ROWS,
  FLUID_GRID_STEP_DIVISOR,
  FLUID_SHED_RUNGS,
} from '../engine/dishFluid.mjs';

const N = FLUID_GRID_COLS * FLUID_GRID_ROWS;
let groups = 0;

// A: first frame seeds and steps toward the stamp, bounded by the rung
{
  const stamp = fluidStamp(1000, { shed: 0 });
  const p = planFluidSteps(null, stamp, 7);
  assert.equal(p.reseed, true);
  assert.equal(p.from, 0);
  assert.equal(p.target, Math.floor(stamp.step / FLUID_GRID_STEP_DIVISOR));
  const bound = Math.max(1, Math.round(FLUID_SHED_RUNGS[0].steps / FLUID_GRID_STEP_DIVISOR));
  assert.equal(p.steps, Math.min(p.target, bound));
  groups++;
}
// B: a held field continues (no reseed) and never overshoots the target
{
  const stamp = fluidStamp(2000, { shed: 0 });
  const target = Math.floor(stamp.step / FLUID_GRID_STEP_DIVISOR);
  const p = planFluidSteps({ wakeMs: stamp.wakeMs, seed: 7, step: target - 1 }, stamp, 7);
  assert.equal(p.reseed, false);
  assert.equal(p.from, target - 1);
  assert.equal(p.steps, 1);
  assert.equal(
    planFluidSteps({ wakeMs: stamp.wakeMs, seed: 7, step: target }, stamp, 7).steps,
    0,
    'caught up = no steps',
  );
  groups++;
}
// C: new wake, new seed, or a seek BACK all reseed
{
  const stamp = fluidStamp(2000, { shed: 0 });
  const held = { wakeMs: stamp.wakeMs, seed: 7, step: 50 };
  assert.equal(planFluidSteps({ ...held, wakeMs: stamp.wakeMs + 1 }, stamp, 7).reseed, true, 'new wake');
  assert.equal(planFluidSteps(held, stamp, 8).reseed, true, 'new seed');
  const back = planFluidSteps({ ...held, step: 9999 }, stamp, 7);
  assert.equal(back.reseed, true, 'a seek back re-seeds');
  assert.equal(back.from, 0);
  groups++;
}
// D: the heaviest shed rung (no steps allowed) holds the field; junk stamps are inert
{
  const last = FLUID_SHED_RUNGS.length - 1;
  const stamp = fluidStamp(2000, { shed: last });
  const p = planFluidSteps({ wakeMs: stamp.wakeMs, seed: 7, step: 0 }, stamp, 7);
  assert.equal(p.steps, FLUID_SHED_RUNGS[last].steps > 0 ? p.steps : 0);
  assert.ok(Number.isFinite(planFluidSteps(null, {}, 0).target));
  groups++;
}
// E: the readback unpack is the v channel, and reuses an output buffer when given one
{
  const rgba = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    rgba[i * 4] = 0.25;
    rgba[i * 4 + 1] = i / N;
    rgba[i * 4 + 2] = 9;
    rgba[i * 4 + 3] = 1;
  }
  const d = densityFromRGBA(rgba);
  assert.equal(d.length, N);
  assert.equal(d[0], 0);
  assert.ok(Math.abs(d[N - 1] - (N - 1) / N) < 1e-6);
  const out = new Float32Array(N);
  assert.equal(densityFromRGBA(rgba, out), out);
  groups++;
}
console.log(`gpuFluidHost.selfcheck: OK (${groups} groups) — K1 slice 4a #2186`);
