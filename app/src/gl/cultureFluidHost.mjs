// cultureFluidHost.mjs — CULTURE Phase 1, slice K1 (the parent issue 2186): the GPU half of the
// culture world's dish fluid (backend 'gpu.gs.v1', the simBackends vocabulary).
//
// The world (engine/cultureWorld.mjs) is pure and steps its medium on the JS reference kernel
// (engine/dishFluid.mjs) from its own 120 Hz clock. This host is the same medium on the GPU
// kernel (gl/fluidSim.mjs): it seeds from the world's own initial condition — createFluid under
// fluidSeedKey(world.seed, 0), recomputed pristine, never read out of the live JS field — steps
// in lockstep with the world's fluid step count, and reads the density back ASYNCHRONOUSLY
// (PBO + fence, newest completed read, discarded across a reseed), the gpuFluidHost discipline.
// Tier S per K0 and spec §5.4: the GPU field is the recording device's own — same-device
// reproducible, float-noise kin to the JS reference, never bit-exact against it.
//
// Nothing creates this host yet: the shell feeds the world on the JS path, and the world is not
// rendered. OFF by default in the strongest sense — no caller, no cost. When a later phase wires
// it in, that wiring names this backend on the world through setCultureFluidBackend, which flips
// the world's law to 'decisions-exact' in the same motion; this host never touches the world's
// stamp itself, and it never steps the world's JS field — the two media are mirrors, not sharers.
//
// Two halves: the pure scheduler (planCultureFluidSteps — node-testable) and the GL half
// (createCultureFluidHost).
import { createFluid, fluidSeedKey, FLUID_GRID_COLS, FLUID_GRID_ROWS } from '../engine/dishFluid.mjs';
import { CULTURE_FLUID_GPU_BACKEND } from '../engine/cultureWorld.mjs';
import { createGpuFluid } from './fluidSim.mjs';
import { densityFromRGBA } from './gpuFluidHost.mjs';

/** The backend id this host stamps on everything it hands out. */
export const CULTURE_FLUID_HOST_BACKEND = CULTURE_FLUID_GPU_BACKEND;
/** Most GPU passes one frame call may run catching up to the world (a seek re-seeds instead). */
export const CULTURE_FLUID_GPU_MAX_STEPS_PER_CALL = 64;

/**
 * Pure: what the GPU must do to mirror a world whose fluid stands at `targetStep` under `seed`.
 * `held` is { seed, step } or null. A new seed or a target BEHIND the held step re-seeds (the
 * mirror starts over from the world's initial condition); otherwise the GPU runs the difference,
 * bounded per call — a mirror that falls further behind than the bound catches up over calls,
 * never in one stall. Returns { reseed, from, steps, target } — `from` is the GPU's fluid step
 * AFTER any reseed.
 */
export function planCultureFluidSteps(held, seed, targetStep) {
  const s = (Number(seed) || 0) >>> 0;
  const target = Math.max(0, Math.floor(Number(targetStep) || 0));
  const reseed = !held || held.seed !== s || target < held.step;
  const from = reseed ? 0 : held.step;
  const steps = Math.max(0, Math.min(target - from, CULTURE_FLUID_GPU_MAX_STEPS_PER_CALL));
  return { reseed, from, steps, target };
}

/**
 * The GL half. gl: a WebGL2 context (EXT_color_buffer_float required, as the renderer demands).
 *   frame(world) → { fluidStep, density, backend } | null
 * the newest COMPLETED readback of the mirrored field (null until the first lands, and after a
 * reseed until a fresh one does). Never blocks: the fence is polled, not waited on — a late
 * field is a late field, a consumer reads what it is handed.
 */
export function createCultureFluidHost(gl) {
  const cols = FLUID_GRID_COLS;
  const rows = FLUID_GRID_ROWS;
  const sim = createGpuFluid(gl, cols, rows);
  const BYTES = cols * rows * 4 * 4;
  let held = null; // { seed, step }
  const pending = []; // in-flight readbacks: { pbo, sync, step, epoch }
  const freePbos = [];
  let latest = null; // { fluidStep, density, backend }
  let epoch = 0; // bumped on reseed: readbacks from an older epoch are discarded

  const acquirePbo = () => {
    const b = freePbos.pop() || gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, BYTES, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return b;
  };
  const poll = () => {
    while (pending.length) {
      const p = pending[0];
      const st = gl.clientWaitSync(p.sync, 0, 0);
      if (st !== gl.ALREADY_SIGNALED && st !== gl.CONDITION_SATISFIED) break;
      pending.shift();
      gl.deleteSync(p.sync);
      if (p.epoch === epoch) {
        const rgba = new Float32Array(cols * rows * 4);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, p.pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rgba);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        latest = { fluidStep: p.step, density: densityFromRGBA(rgba), backend: CULTURE_FLUID_HOST_BACKEND };
      }
      freePbos.push(p.pbo);
    }
  };

  return {
    frame(world) {
      if (!world || !world.fluid) {
        held = null;
        latest = null;
        epoch++;
        return null;
      }
      const plan = planCultureFluidSteps(held, world.seed, world.fluid.step);
      if (plan.reseed) {
        // The world's initial condition, recomputed pristine: the same createFluid the world
        // itself was born from (fluidSeedKey(seed, 0), no magnets), never the live JS field.
        const s = createFluid({ cols, rows, seedKey: fluidSeedKey(world.seed, 0) });
        sim.seed(s.u, s.v);
        held = { seed: world.seed >>> 0, step: 0 };
        latest = null;
        epoch++;
      }
      if (plan.steps > 0) {
        // The world's stepFluid runs under the kernel defaults (no magnets, no culture field,
        // the dial defaults) — fluidStepUniforms({}) sanitizes to exactly those.
        sim.step(plan.steps, {});
        held.step = plan.from + plan.steps;
        const pbo = acquirePbo();
        sim.readInto(pbo);
        pending.push({ pbo, sync: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), step: held.step, epoch });
        gl.flush();
      }
      poll();
      return latest;
    },
    /** The mirrored field texture (RG32F, density in G) for a shader-space reader (K2). Null before a seed. */
    fluidTexture() {
      return held ? sim.texture() : null;
    },
    dispose() {
      for (const p of pending) gl.deleteSync(p.sync);
      for (const b of [...freePbos, ...pending.map((p) => p.pbo)]) gl.deleteBuffer(b);
      pending.length = 0;
      freePbos.length = 0;
    },
  };
}
