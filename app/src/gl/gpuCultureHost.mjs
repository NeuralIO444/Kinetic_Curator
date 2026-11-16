// gpuCultureHost.mjs — K2 slice 2b (#2187): the render side owns the GPU culture (backend 'gpu.life.v1', K0 R1).
//
// The resolver stays pure and worker-safe (no GL). This host follows the JS stage's culture on the GPU: it seeds from the
// stage's own generation-0 grid (stage.hostSeed()), steps to the SAME stamped generation the JS stage would (bounded per frame
// by the shed rung, SHED_STEPS), deals the fluid-driven births in shader space before each generation, and reads the grid
// back ASYNCHRONOUSLY (PBO + fence, 1–2 frames late). The caller packs it (dishCultureCells) and hands it to the next
// frame's resolve as input.dishCultureCells. Nothing here is wired to the live loop yet and nothing runs unless a caller
// creates it — OFF by default (the K1 pattern).
//
// Two halves: the pure scheduler (planCultureSteps — node-testable) and the GL half (createGpuCultureHost).
import { SHED_STEPS } from '../engine/dishLifeStage.mjs';
import { createGpuCulture } from './cultureSim.mjs';

/**
 * Pure: what the GPU must do this frame, mirroring the JS stage's bookkeeping (target = the stamp's gen, at most
 * SHED_STEPS[shed] generations per frame; a new seed key or a seek back re-seeds). `held` is { key, gen } or null.
 * Returns { reseed, from, steps, target } — `from` is the generation the GPU is at AFTER any reseed.
 */
export function planCultureSteps(held, key, stamp) {
  const target = Math.max(0, Math.floor(Number(stamp && stamp.gen) || 0));
  const shed = Math.max(0, Math.min(SHED_STEPS.length - 1, Number(stamp && stamp.shed) | 0));
  const reseed = !held || held.key !== key || target < held.gen;
  const from = reseed ? 0 : held.gen;
  const steps = Math.max(0, Math.min(target - from, SHED_STEPS[shed]));
  return { reseed, from, steps, target };
}

/**
 * The GL half. gl: the renderer's WebGL2 context. Returns
 *   frame({ stamp, seedState, fluid }) → { gen, grid } | null
 * where stamp is the resolver's input.dishLife ({ gen, shed, … }), seedState is the stage's hostSeed(), and fluid is
 * { tex, strength, seed } (or null: the uncoupled culture). The result is the newest COMPLETED readback (null until the first
 * lands, and after a reseed until a fresh one does). Never blocks: the fence is polled, not waited on (K1 R3).
 *   readSync() → { gen, grid }   the current grid, synchronously (tests / a stalled-readback fallback)
 */
export function createGpuCultureHost(gl, cols, rows) {
  const sim = createGpuCulture(gl, cols, rows);
  const BYTES = cols * rows;
  let held = null; // { key, gen }
  const pending = []; // in-flight readbacks: { pbo, sync, gen, epoch }
  const freePbos = [];
  let latest = null; // { gen, grid }
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
        const grid = new Uint8Array(BYTES);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, p.pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, grid);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        latest = { gen: p.gen, grid };
      }
      freePbos.push(p.pbo);
    }
  };

  return {
    frame({ stamp, seedState, fluid = null } = {}) {
      if (!stamp || !Number.isFinite(stamp.wakeMs) || !seedState || !seedState.cells) {
        held = null;
        latest = null;
        epoch++;
        return null;
      }
      const plan = planCultureSteps(held, seedState.key, stamp);
      if (plan.reseed) {
        sim.seed(seedState.cells, seedState.blocked, 0);
        held = { key: seedState.key, gen: 0 };
        latest = null;
        epoch++;
      } else {
        sim.setBlocked(seedState.blocked); // terrain can change mid-wake
      }
      for (let n = 0; n < plan.steps; n++) {
        if (fluid && fluid.tex)
          sim.births({ fluidTex: fluid.tex, channel: 1, strength: fluid.strength, seed: fluid.seed });
        sim.step(1, seedState.rule);
      }
      if (plan.steps > 0) {
        held.gen = plan.from + plan.steps;
        // queue a readback of the grid as it stands NOW, polled on later frames
        const pbo = acquirePbo();
        sim.readInto(pbo);
        pending.push({ pbo, sync: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), gen: held.gen, epoch });
        gl.flush();
      }
      poll();
      return latest;
    },
    readSync() {
      return { gen: held ? held.gen : -1, grid: sim.read() };
    },
    dispose() {
      for (const p of pending) gl.deleteSync(p.sync);
      for (const b of [...freePbos, ...pending.map((p) => p.pbo)]) gl.deleteBuffer(b);
      pending.length = 0;
      freePbos.length = 0;
    },
  };
}
