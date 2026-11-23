// cultureLifeHost.mjs — CULTURE Phase 1, slice K2 (the parent issue 2187): the GPU half of the
// culture world's DISH LIFE culture (backend 'gpu.life.v1', the simBackends vocabulary).
//
// The world (engine/cultureWorld.mjs) is pure and steps its soil on the JS reference core
// (engine/dishLife.mjs) from its own 120 Hz clock. This host is the same culture on the GPU
// kernel (gl/cultureSim.mjs): it seeds from the world's own initial condition — seedRandom
// under the world seed at CULTURE_LIFE_SEED_DENSITY, recomputed pristine, never read out of
// the live JS grid — steps in lockstep with the world's culture generation, and reads the
// grid back ASYNCHRONOUSLY (PBO + fence, newest completed read, discarded across a reseed),
// the gpuCultureHost / cultureFluidHost discipline.
//
// COUPLING IN SHADER SPACE — the parent issue's shape: both fields GPU-resident, no
// per-frame CPU readback of either. The caller hands frame() the fluid mirror's texture
// (gl/cultureFluidHost.mjs fluidTexture(), RG32F, density in G) and the host deals the
// fluid-biased births in shader space before each generation, at the world's standing
// coupling strength and seed — the same deal the world's JS seam (injectFluidBirths) makes,
// byte-for-byte wherever the density agrees (parity/cultureLifeSim.selfcheck). Handed no
// texture, the mirror runs the UNCOUPLED culture (the gpuCultureHost posture): faithful to
// the world only when the texture is handed in every frame, and the report says so.
//
// The kernel is integer state, so where the JS world and this mirror are fed the same
// density they agree byte-for-byte; but the GPU fluid mirror's density is Tier S (the
// recording device's own float field, kin to the JS medium, never bit-identical to it), so
// a world whose culture this host drives is a decisions-exact world — which is exactly
// what naming 'gpu.life.v1' on the world through setCultureLifeBackend stamps. Nothing
// creates this host yet: the shell feeds the world on the JS path, and the world is not
// rendered. OFF by default in the strongest sense — no caller, no cost. This host never
// touches the world's stamp itself, and it never steps the world's JS culture — the two
// cultures are mirrors, not sharers.
//
// Two halves: the pure scheduler (planCultureLifeSteps — node-testable) and the GL half
// (createCultureLifeHost).
import { seedRandom, CULTURE_RULE } from '../engine/dishLife.mjs';
import { STAGE_COLS, STAGE_ROWS } from '../engine/dishLifeStage.mjs';
import { CULTURE_COUPLING, CULTURE_LIFE_GPU_BACKEND, CULTURE_LIFE_SEED_DENSITY } from '../engine/cultureWorld.mjs';
import { createGpuCulture } from './cultureSim.mjs';

/** The backend id this host stamps on everything it hands out. */
export const CULTURE_LIFE_HOST_BACKEND = CULTURE_LIFE_GPU_BACKEND;
/** Most GPU generations one frame call may run catching up to the world (a seek re-seeds instead). */
export const CULTURE_LIFE_GPU_MAX_STEPS_PER_CALL = 64;

/**
 * Pure: what the GPU must do to mirror a world whose culture stands at `targetGen` under
 * `seed`. `held` is { seed, gen } or null. A new seed or a target BEHIND the held
 * generation re-seeds (the mirror starts over from the world's birth grid); otherwise the
 * GPU runs the difference, bounded per call — a mirror that falls further behind than the
 * bound catches up over calls, never in one stall. Returns { reseed, from, steps, target }
 * — `from` is the GPU's generation AFTER any reseed.
 */
export function planCultureLifeSteps(held, seed, targetGen) {
  const s = (Number(seed) || 0) >>> 0;
  const target = Math.max(0, Math.floor(Number(targetGen) || 0));
  const reseed = !held || held.seed !== s || target < held.gen;
  const from = reseed ? 0 : held.gen;
  const steps = Math.max(0, Math.min(target - from, CULTURE_LIFE_GPU_MAX_STEPS_PER_CALL));
  return { reseed, from, steps, target };
}

/**
 * The GL half. gl: a WebGL2 context.
 *   frame(world, fluidTex) → { gen, grid, backend } | null
 * the newest COMPLETED readback of the mirrored culture (null until the first lands, and
 * after a reseed until a fresh one does). Never blocks: the fence is polled, not waited
 * on — a late grid is a late grid, a consumer reads what it is handed. `fluidTex` is the
 * fluid mirror's state texture (RG32F, density in G) for the in-shader birth deal, or
 * null for the uncoupled mirror.
 *   readSync() → { gen, grid, backend }   the current grid, synchronously (tests / a stalled-readback fallback)
 */
export function createCultureLifeHost(gl) {
  const cols = STAGE_COLS;
  const rows = STAGE_ROWS;
  const sim = createGpuCulture(gl, cols, rows);
  const BYTES = cols * rows;
  let held = null; // { seed, gen }
  const pending = []; // in-flight readbacks: { pbo, sync, gen, epoch }
  const freePbos = [];
  let latest = null; // { gen, grid, backend }
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
        latest = { gen: p.gen, grid, backend: CULTURE_LIFE_HOST_BACKEND };
      }
      freePbos.push(p.pbo);
    }
  };

  return {
    frame(world, fluidTex = null) {
      if (!world || !world.life) {
        held = null;
        latest = null;
        epoch++;
        return null;
      }
      const plan = planCultureLifeSteps(held, world.seed, world.life.gen);
      if (plan.reseed) {
        // The world's initial condition, recomputed pristine: the same seedRandom fill
        // the world itself was born from, never the live JS grid. The world has no mask
        // and no bedrock yet, so the blocked grid is all zeros.
        const cells = seedRandom(cols, rows, world.seed, CULTURE_LIFE_SEED_DENSITY);
        sim.seed(cells, null, 0);
        held = { seed: world.seed >>> 0, gen: 0 };
        latest = null;
        epoch++;
      }
      if (plan.steps > 0) {
        // Per generation, the gpuCultureHost loop: the birth deal in shader space (when
        // a fluid texture is handed in), then one step under the world's rule. The deal
        // is dealt at the sim's own generation counter, which the reseed zeroed and each
        // step advances — the same (seed, generation, index) stream the JS seam draws on.
        for (let n = 0; n < plan.steps; n++) {
          if (fluidTex) sim.births({ fluidTex, channel: 1, strength: CULTURE_COUPLING, seed: world.seed });
          sim.step(1, CULTURE_RULE);
        }
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
      return { gen: held ? held.gen : -1, grid: sim.read(), backend: CULTURE_LIFE_HOST_BACKEND };
    },
    dispose() {
      for (const p of pending) gl.deleteSync(p.sync);
      for (const b of [...freePbos, ...pending.map((p) => p.pbo)]) gl.deleteBuffer(b);
      pending.length = 0;
      freePbos.length = 0;
    },
  };
}
