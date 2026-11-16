// gpuFluidHost.mjs — K1 slice 4a (#2186): the render side owns the GPU fluid (backend 'gpu.gs.v1', K0 R1).
//
// The resolver stays pure and worker-safe (no GL): this host runs the Gray-Scott kernel on the GPU from the SAME
// stamped step the JS stage would follow, reads the density back ASYNCHRONOUSLY (PBO + fence, 1–2 frames late), and
// hands it to the next frame's resolve as input.dishFluidExternal = { step, density }. Nothing here is wired to the live
// loop yet (slice 4b), and nothing runs unless a caller creates it — OFF by default.
//
// Two halves: the pure scheduler (planFluidSteps / densityFromRGBA — node-testable) and the GL half (createGpuFluidHost).
import {
  FLUID_GRID_COLS,
  FLUID_GRID_ROWS,
  FLUID_GRID_STEP_DIVISOR,
  FLUID_SHED_RUNGS,
  clampFluidRung,
} from '../engine/dishFluid.mjs';
import { fluidSeedState } from '../engine/dishFluidStage.mjs';
import { createGpuFluid } from './fluidSim.mjs';

/**
 * Pure: what the GPU must do this frame, mirroring the JS stage's own bookkeeping (target = stamp step / divisor, bounded
 * per frame by the shed rung; a new wake/seed or a seek back re-seeds). `held` is { wakeMs, seed, step } or null.
 * Returns { reseed, from, steps, target } — `from` is the grid step the GPU is at AFTER any reseed.
 */
export function planFluidSteps(held, stamp, seed) {
  const target = Math.max(0, Math.floor((Number(stamp && stamp.step) || 0) / FLUID_GRID_STEP_DIVISOR));
  const rung = FLUID_SHED_RUNGS[clampFluidRung(stamp && stamp.shed)];
  const gridBound = rung.steps > 0 ? Math.max(1, Math.round(rung.steps / FLUID_GRID_STEP_DIVISOR)) : 0;
  const reseed = !held || held.wakeMs !== stamp.wakeMs || held.seed !== (seed | 0) || target < held.step;
  const from = reseed ? 0 : held.step;
  const steps = Math.max(0, Math.min(target - from, gridBound));
  return { reseed, from, steps, target };
}

/**
 * Pure: the published density from a readback of the field as RGBA32F (the one format WebGL2 guarantees readPixels for):
 * u in R, v in G. The density is the v phase — what the JS kernel's fluidDensity returns at the dish grid.
 */
export function densityFromRGBA(rgba, out = new Float32Array(FLUID_GRID_COLS * FLUID_GRID_ROWS)) {
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4 + 1];
  return out;
}

/**
 * The GPU half. gl: the renderer's WebGL2 context (EXT_color_buffer_float already required). Returns
 *   frame({ stamp, seed, magnets, dial, aspectHW, coupleField }) → { step, density } | null
 * the newest COMPLETED readback (null until the first lands, and after a reseed until a fresh one does). Never blocks:
 * the fence is polled, not waited on (K1 R3 — a late field is a late field, the resolver reads what it is handed).
 */
export function createGpuFluidHost(gl) {
  const cols = FLUID_GRID_COLS;
  const rows = FLUID_GRID_ROWS;
  const sim = createGpuFluid(gl, cols, rows);
  const BYTES = cols * rows * 4 * 4;
  let held = null; // { wakeMs, seed, step }
  const pending = []; // in-flight readbacks: { pbo, sync, step }
  const freePbos = [];
  let latest = null; // { step, density }
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
        latest = { step: p.step, density: densityFromRGBA(rgba) };
      }
      freePbos.push(p.pbo);
    }
  };

  return {
    frame({ stamp, seed = 0, magnets, dial, aspectHW, coupleField } = {}) {
      if (!stamp || !Number.isFinite(stamp.wakeMs)) {
        held = null;
        latest = null;
        epoch++;
        return null;
      }
      const plan = planFluidSteps(held, stamp, seed);
      if (plan.reseed) {
        const s = fluidSeedState(stamp.wakeMs, seed, magnets);
        sim.seed(s.u, s.v);
        held = { wakeMs: stamp.wakeMs, seed: seed | 0, step: 0 };
        latest = null;
        epoch++;
      }
      if (coupleField && coupleField.active && coupleField.level) {
        sim.setCulture(coupleField.level, coupleField.cols | 0, coupleField.rows | 0);
      } else {
        sim.setCulture(null, 0, 0);
      }
      if (plan.steps > 0) {
        sim.step(plan.steps, { magnets, ...(dial || {}), aspectHW });
        held.step = plan.from + plan.steps;
        // queue a readback of the field as it stands NOW (the sim's current target), polled on later frames
        const pbo = acquirePbo();
        sim.readInto(pbo);
        pending.push({ pbo, sync: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), step: held.step, epoch });
        gl.flush();
      }
      poll();
      return latest;
    },
    dispose() {
      for (const p of pending) gl.deleteSync(p.sync);
      for (const b of [...freePbos, ...pending.map((p) => p.pbo)]) gl.deleteBuffer(b);
      pending.length = 0;
      freePbos.length = 0;
    },
  };
}
