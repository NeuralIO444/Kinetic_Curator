// K3 wiring slice (#2188) — the GPU swarm in SHADOW. OFF unless asked for: the per-Look layout param `gpuSwarm`, the
// window flag __KC_GPU_SWARM, or `?gpuSwarm=1` in the URL. When on, each eligible swarm layer's state is handed to the GPU
// kernel before the JS ParticleSystem steps, the GPU takes one step with the SAME params, and after the JS step the two
// are compared. The JS swarm stays authoritative (K0 R4: JS kernels are the reference); NOTHING from the GPU reaches the
// screen or the take. What this buys: real-input parity numbers and per-frame GPU cost + readback cost on the stage
// hardware (#2183) before any kernel takes over. Scent deposits and breeding stay on the CPU (Matt, 2026-11-16: CPU mirror).
//
// Eligible = a plain cloud swarm the kernel fully covers today: not an organism, no dish contacts (contacts are slice 2b+,
// they inject impulses between forces and integration), no mod steering. (The cloud swarm's point wind ignores the `wind` knob, so the kernel always runs it.) Anything else is skipped
// and counted, never half-simulated.
import { createGpuSwarm, SWARM_CORE_CLOUD, ATTRACTOR_GAIN } from './swarmSim.mjs';

/** Is the shadow asked for? Layout param, window flag, or URL, in that order of authority (any one turns it on). */
export function gpuSwarmWanted(layoutParams, win) {
  if (layoutParams && layoutParams.gpuSwarm) return true;
  if (!win) return false;
  if (win.__KC_GPU_SWARM) return true;
  const search = win.location && typeof win.location.search === 'string' ? win.location.search : '';
  return /(?:^|[?&])gpuSwarm=1(?:&|$)/.test(search);
}

/** Why a layer can't be shadowed, or null if it can. Pure. */
export function swarmIneligibleReason(system, lp, ctx) {
  if (!system || !(system.n > 0)) return 'empty';
  if (lp.behave && lp.behave !== 'cruise' && lp.behave !== 'seek' && lp.behave !== 'flee') return 'behave';
  if (lp.contactRadius > 0 || lp.dishSession) return 'contacts';
  if (lp.modSteer) return 'modSteer';
  if (lp.scentField || lp.organism) return 'organism';
  if (ctx && ctx.slowRender) return 'slowRender';
  return null;
}

/** The core params the kernel takes for this layer's step — the same mapping the parity selfcheck pins. */
export function swarmCoreParams(lp, ctx, system) {
  const off = (axis) =>
    Number(
      lp[`noiseDomainOffset${axis}`] ??
        lp.noiseDomainOffset ??
        (ctx.seedOffsets?.noise ? ctx.seedOffsets.noise * 100 : 0),
    ) || 0;
  const att = ctx.attractor || null;
  const seekMul = lp.behave === 'seek' ? 1.6 : lp.behave === 'flee' ? -1.6 : 1;
  return {
    ...SWARM_CORE_CLOUD,
    sepW: 1.8,
    aliW: 1.0,
    cohW: lp.swarmCohesion ?? 1.5,
    damping: lp.damping ?? SWARM_CORE_CLOUD.damping,
    dtFrames: 1,
    attractor: att,
    attractStrength: att ? (lp.gravityWells ?? 1) * ATTRACTOR_GAIN * seekMul : 0,
    canvasW: ctx.canvasW,
    canvasH: ctx.canvasH,
    wind: {
      seed: system._noiseSeed,
      freq: lp.noiseFreq ?? 0.005,
      offX: off('X'),
      offY: off('Y'),
      nt: ctx.loopTimeMs * (lp.noiseSpeed ?? 0.5) * 0.001,
    },
  };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

export function createGpuSwarmHost(gl) {
  const layers = new Map(); // layerId -> { gpu, n }
  const stats = {
    frames: 0,
    skipped: {},
    agents: 0,
    gpuMsAvg: 0,
    gpuMsMax: 0,
    driftPosMax: 0,
    driftVelMax: 0,
  };
  const gpuFor = (id, n) => {
    let L = layers.get(id);
    if (!L || L.n !== n) {
      if (L) L.gpu.dispose();
      L = { gpu: createGpuSwarm(gl, n), n };
      layers.set(id, L);
    }
    return L.gpu;
  };
  return {
    stats,
    /** Before the JS step: returns a token for post(), or null when the layer is skipped. */
    pre(layerId, system, lp, ctx) {
      const why = swarmIneligibleReason(system, lp, ctx);
      if (why) {
        stats.skipped[why] = (stats.skipped[why] || 0) + 1;
        return null;
      }
      const n = system.n;
      const t0 = now();
      const gpu = gpuFor(layerId, n);
      gpu.seed({
        x: system.x.subarray(0, n),
        y: system.y.subarray(0, n),
        vx: system.vx.subarray(0, n),
        vy: system.vy.subarray(0, n),
        mass: system.mass.subarray(0, n),
        seedOffset: system.seedOffset.subarray(0, n),
      });
      gpu.step(swarmCoreParams(lp, ctx, system));
      const got = gpu.read();
      const ms = now() - t0;
      stats.frames++;
      stats.agents = n;
      stats.gpuMsAvg += (ms - stats.gpuMsAvg) / stats.frames;
      stats.gpuMsMax = Math.max(stats.gpuMsMax, ms);
      return { got, n };
    },
    /** After the JS step: compare the GPU's one step against what the JS swarm just did (alive agents only). */
    post(token, system) {
      if (!token) return;
      const { got, n } = token;
      if (system.n !== n) return; // the population changed under the step (breeding / death): nothing to compare
      for (let i = 0; i < n; i++) {
        if (!system.alive[i]) continue;
        stats.driftPosMax = Math.max(
          stats.driftPosMax,
          Math.abs(got.x[i] - system.x[i]),
          Math.abs(got.y[i] - system.y[i]),
        );
        stats.driftVelMax = Math.max(
          stats.driftVelMax,
          Math.abs(got.vx[i] - system.vx[i]),
          Math.abs(got.vy[i] - system.vy[i]),
        );
      }
    },
    dispose() {
      for (const L of layers.values()) L.gpu.dispose();
      layers.clear();
    },
  };
}
