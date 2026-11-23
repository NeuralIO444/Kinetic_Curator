// cultureSwarmHost.mjs — CULTURE Phase 1, slice K3 (the parent issue 2188): the GPU half of the
// culture world's swarm (backend 'gpu.swarm.v1', the simBackends vocabulary).
//
// The world (engine/cultureWorld.mjs) is pure and steps its bodies on the JS reference core
// (engine/cultureSwarm.mjs) from its own 120 Hz clock. This host is the same swarm on the GPU
// kernel (gl/swarmSim.mjs): it steps in lockstep with the world's swarm step count under the
// world's standing parameters, and hands back the mirrored state. Tier S per K0 and spec §5.4:
// the GPU swarm is the recording device's own — float-noise kin to the JS reference at one
// step, its own trajectory over a run — never bit-exact against it, which is exactly what
// naming 'gpu.swarm.v1' on the world through setCultureSwarmBackend stamps.
//
// THE ONE DIFFERENCE from the fluid/life mirrors, stated plainly: those hosts re-derive the
// world's birth state from the world seed alone (the medium and the soil are born from the
// seed), so a reseed there means stepping from step zero. Bodies are DEALT, not derived —
// the world is born with an empty table and citizens are a later phase's act — so this
// mirror seeds from the world's table AS IT STANDS when it (re)seeds, and starts at the
// world's current swarm step. The reseed keys are (world seed, population count, a target
// behind the held step). A same-count re-deal mid-flight would not be seen by those keys;
// nothing deals bodies in the app in this slice, and the dealing API that lands with the
// citizens (Phase 5) owns the population epoch that will key it. Readback is synchronous
// (swarmSim exposes read(), no PBO path — unlike the fluid/life hosts' async discipline):
// this mirror is exercised by suites and measurement, not yet by a frame loop.
//
// Nothing creates this host yet: the shell feeds the world on the JS path, and the world is
// not rendered. OFF by default in the strongest sense — no caller, no cost. This host never
// touches the world's stamp itself, and it never steps the world's JS bodies — the two
// swarms are mirrors, not sharers.
//
// Two halves: the pure scheduler (planCultureSwarmSteps — node-testable) and the GL half
// (createCultureSwarmHost).
import { CULTURE_SWARM_PARAMS } from '../engine/cultureSwarm.mjs';
import { CULTURE_SWARM_GPU_BACKEND } from '../engine/cultureWorld.mjs';
import { createGpuSwarm } from './swarmSim.mjs';

/** The backend id this host stamps on everything it hands out. */
export const CULTURE_SWARM_HOST_BACKEND = CULTURE_SWARM_GPU_BACKEND;
/** Most GPU steps one frame call may run catching up to the world (a deeper lag re-seeds from the table instead). */
export const CULTURE_SWARM_GPU_MAX_STEPS_PER_CALL = 64;

/**
 * The kernel parameters for one world swarm step: the world's standing cloud-core
 * values, one 60 fps frame per step, no attractor and no wind (the world's fields are
 * a later phase), the cloud wrap over the dish extent. The parity suite builds the
 * same mapping independently from CULTURE_SWARM_PARAMS, so a drift here is a red
 * suite, not a silent fork.
 */
export function cultureSwarmKernelParams() {
  const p = CULTURE_SWARM_PARAMS;
  return {
    dtFrames: 1,
    sepR: p.sepR,
    aliR: p.aliR,
    cohR: p.cohR,
    sepW: p.sepW,
    aliW: p.aliW,
    cohW: p.cohW,
    damping: p.damping,
    maxSpeed: p.maxSpeed,
    attractor: null,
    attractStrength: 0,
    wind: null,
    bounds: 'wrap',
    canvasW: p.w,
    canvasH: p.h,
  };
}

/**
 * Pure: what the GPU must do to mirror a world whose swarm stands at `targetStep` over
 * `count` dealt bodies under `seed`. `held` is { seed, count, step } or null. A new
 * seed, a changed population count, or a target BEHIND the held step re-seeds — and a
 * re-seed starts AT the target, because the mirror seeds from the world's table as it
 * stands (see the header: bodies are dealt, not derived). Otherwise the GPU runs the
 * difference, bounded per call; a lag deeper than the bound is not chased step by step
 * forever — the caller may simply call again, and each call runs at most the bound.
 * Returns { reseed, from, steps, target } — `from` is the GPU's swarm step AFTER any
 * re-seed.
 */
export function planCultureSwarmSteps(held, seed, count, targetStep) {
  const s = (Number(seed) || 0) >>> 0;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const target = Math.max(0, Math.floor(Number(targetStep) || 0));
  const reseed = !held || held.seed !== s || held.count !== n || target < held.step;
  const from = reseed ? target : held.step;
  const steps = reseed ? 0 : Math.max(0, Math.min(target - from, CULTURE_SWARM_GPU_MAX_STEPS_PER_CALL));
  return { reseed, from, steps, target };
}

/**
 * The GL half. gl: a WebGL2 context (EXT_color_buffer_float required, as the renderer demands).
 *   frame(world) → { swarmStep, state: { x, y, vx, vy }, backend } | null
 * the mirror's state after stepping to (or toward) the world's swarm step — null while
 * the world has no dealt bodies. Synchronous read: the state returned is the state at
 * `swarmStep`, read the call you get it.
 */
export function createCultureSwarmHost(gl) {
  let sim = null; // the GPU swarm, sized to the held population
  let held = null; // { seed, count, step }

  const drop = () => {
    if (sim) sim.dispose();
    sim = null;
    held = null;
  };

  return {
    frame(world) {
      if (!world || !world.bodies) {
        drop();
        return null;
      }
      const b = world.bodies;
      const plan = planCultureSwarmSteps(held, world.seed, b.count, b.step);
      if (plan.reseed) {
        drop();
        if (b.count <= 0) return null;
        sim = createGpuSwarm(gl, b.count);
        sim.seed({
          x: b.x.subarray(0, b.count),
          y: b.y.subarray(0, b.count),
          vx: b.vx.subarray(0, b.count),
          vy: b.vy.subarray(0, b.count),
          mass: b.mass.subarray(0, b.count),
        });
        held = { seed: world.seed >>> 0, count: b.count, step: plan.from };
        return { swarmStep: held.step, state: sim.read(), backend: CULTURE_SWARM_HOST_BACKEND };
      }
      if (!sim) return null;
      const params = cultureSwarmKernelParams();
      for (let k = 0; k < plan.steps; k++) sim.step(params);
      held.step = plan.from + plan.steps;
      return { swarmStep: held.step, state: sim.read(), backend: CULTURE_SWARM_HOST_BACKEND };
    },
    dispose() {
      drop();
    },
  };
}
