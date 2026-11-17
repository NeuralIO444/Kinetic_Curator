// K3 wiring slice (#2188) — the GPU swarm in SHADOW. OFF unless asked for: the per-Look layout param `gpuSwarm`, the
// window flag __KC_GPU_SWARM, or `?gpuSwarm=1` in the URL. When on, each eligible swarm layer's state is handed to the GPU
// kernel before the JS ParticleSystem steps, the GPU takes one step with the SAME params, and after the JS step the two
// are compared. The JS swarm stays authoritative (K0 R4: JS kernels are the reference); NOTHING from the GPU reaches the
// screen or the take. What this buys: real-input parity numbers and per-frame GPU cost + readback cost on the stage
// hardware (#2183) before any kernel takes over. Scent deposits and breeding stay on the CPU (Matt, 2026-11-16: CPU mirror).
//
// TAKEOVER (the same host, one more step): with the loop's `swarmGpu` input marker up, the layer's JS force loop is skipped and the
// kernel's steering accelerations feed the CPU's accumulators (particles.js `gpuStep` seam); the contact pass, damping, thermal kick,
// speed clamp and integration stay JS in float64, so contact impulses and everything downstream compose exactly as before.
//
// Eligible = a plain cloud swarm the kernel fully covers today: not an organism, no dish contacts (contacts are slice 2b+,
// they inject impulses between forces and integration), no mod steering. (The cloud swarm's point wind ignores the `wind` knob, so the kernel always runs it.) Anything else is skipped
// and counted, never half-simulated.
import { createGpuSwarm, SWARM_CORE_CLOUD, ATTRACTOR_GAIN } from './swarmSim.mjs';
import { isOrganismMode } from '../data/layout-modes.js';
import { dishCurrentsFor, ATTRACTOR_DRIFT_SPEED, attractorDriftSign } from '../engine/dishCurrents.mjs';

/** Is the shadow asked for? Layout param, window flag, or URL, in that order of authority (any one turns it on). */
export function gpuSwarmWanted(layoutParams, win) {
  if (layoutParams && layoutParams.gpuSwarm) return true;
  if (!win) return false;
  if (win.__KC_GPU_SWARM) return true;
  const search = win.location && typeof win.location.search === 'string' ? win.location.search : '';
  return /(?:^|[?&])gpuSwarm=1(?:&|$)/.test(search);
}

/**
 * Is the TAKEOVER asked for? A separate flag from the shadow's: the per-Look layout param `gpuSwarmLive`, `window.__KC_GPU_SWARM_LIVE`,
 * or `?gpuSwarmLive=1`. It rides the resolve input as `swarmGpu: 1` (recorded: the take's header then says the GPU swarm ran), and it
 * implies the host runs (the resolver starts it when the marker is up).
 */
export function gpuSwarmLiveWanted(layoutParams, win) {
  if (layoutParams && layoutParams.gpuSwarmLive) return true;
  if (!win) return false;
  if (win.__KC_GPU_SWARM_LIVE) return true;
  const search = win.location && typeof win.location.search === 'string' ? win.location.search : '';
  return /(?:^|[?&])gpuSwarmLive=1(?:&|$)/.test(search);
}

/** Why a layer can't be shadowed, or null if it can. Pure. */
export function swarmIneligibleReason(system, lp, ctx) {
  if (!system || !(system.n > 0)) return 'empty';
  if (lp.behave && lp.behave !== 'cruise' && lp.behave !== 'seek' && lp.behave !== 'flee') return 'behave';
  // (The resolver hands EVERY layer a dishSession and the shared scent field, so their presence says nothing. A layer in the dish
  // contact pass is covered since the force seam: the kernel runs its #1414 currents and the contact impulses compose on the CPU.
  // MOD steering is three weight multipliers, folded into the params.)
  // Likewise every layer gets the shared scent field handed in; what makes it an organism is its mode.
  if (isOrganismMode(lp.mode) || lp.organism) return 'organism';
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
  // #509 MOD steering: transient per-layer multipliers on the three boids weights (identity by default), as particles.js folds them
  const st = lp.modSteer || null;
  const mul = (k) => (st && Number.isFinite(Number(st[k])) ? Number(st[k]) : 1);
  // #1414 dish currents: inside the dish (contactRadius > 0) the wind and the well are velocities the body relaxes toward
  const inDish = lp.contactRadius > 0;
  const windCur = inDish ? dishCurrentsFor(1) : null; // the cloud swarm's windMul is 1
  const attCur = inDish ? dishCurrentsFor((lp.gravityWells ?? 1) * Math.abs(seekMul)) : null;
  return {
    ...SWARM_CORE_CLOUD,
    sepW: 1.8 * mul('sep'),
    aliW: 1.0 * mul('ali'),
    cohW: (lp.swarmCohesion ?? 1.5) * mul('coh'),
    currents: inDish
      ? {
          wind: windCur.on ? windCur.coupling : 0,
          attract: attCur.on ? attCur.coupling : 0,
          drift: ATTRACTOR_DRIFT_SPEED * attractorDriftSign(seekMul),
        }
      : null,
    damping: lp.damping ?? SWARM_CORE_CLOUD.damping,
    dtFrames: Number.isFinite(ctx.dtSec) && ctx.dtSec > 0 ? ctx.dtSec * 60 : 1, // particles.js: dtFrames = dtSec * 60
    attractor: att,
    attractStrength: att ? (lp.gravityWells ?? 1) * ATTRACTOR_GAIN * seekMul : 0,
    canvasW: ctx.canvasW,
    canvasH: ctx.canvasH,
    wind: {
      // a system on the shared world noise has no seed of its own (particles.js nulls it): the resolver says which seed the world noise is
      seed: ctx.noiseSeed ?? system._noiseSeed,
      freq: lp.noiseFreq ?? 0.005,
      offX: off('X'),
      offY: off('Y'),
      nt: ctx.loopTimeMs * (lp.noiseSpeed ?? 0.5) * 0.001,
    },
  };
}

/** Where a dead slot sits in the GPU's copy: far beyond the canvas and every force radius, each slot on its own spot. */
export const DEAD_PARK = 1e7;
export const DEAD_PARK_STEP = 1e3;

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
    dead: 0, // dead slots parked in the last stepped layer
    applied: 0, // takeover: frames a layer's steering came from the GPU
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
    pre(layerId, system, lp, ctx, { force = false } = {}) {
      // The SHADOW compares a whole GPU step with the JS step, and the kernel has no contact impulses: a dish layer would only
      // report its contacts as drift, so the shadow sits it out. The takeover (force) covers it: the contacts stay on the CPU.
      const why = swarmIneligibleReason(system, lp, ctx) || (!force && lp.contactRadius > 0 ? 'contacts' : null);
      if (why) {
        stats.skipped[why] = (stats.skipped[why] || 0) + 1;
        return null;
      }
      const n = system.n;
      const t0 = now();
      const gpu = gpuFor(layerId, n);
      // Dead slots (a bred / culled population): the JS neighbour grid leaves them out, so the kernel must not see them either. They
      // are parked far outside every force radius for the GPU's copy only (distinct spots, so they never meet each other); their own
      // output is garbage nobody reads (the JS integration and the comparison both skip the dead).
      let sx = system.x.subarray(0, n);
      let sy = system.y.subarray(0, n);
      let dead = 0;
      for (let i = 0; i < n; i++) if (!system.alive[i]) dead++;
      if (dead) {
        sx = Float32Array.from(sx);
        sy = Float32Array.from(sy);
        for (let i = 0; i < n; i++) {
          if (system.alive[i]) continue;
          sx[i] = DEAD_PARK + i * DEAD_PARK_STEP;
          sy[i] = DEAD_PARK;
        }
      }
      stats.dead = dead;
      gpu.seed({
        x: sx,
        y: sy,
        vx: system.vx.subarray(0, n),
        vy: system.vy.subarray(0, n),
        mass: system.mass.subarray(0, n),
        seedOffset: system.seedOffset.subarray(0, n),
      });
      // force = the takeover: the kernel emits its steering acceleration (read().vx/vy) and the CPU integrates; else the shadow's full step
      gpu.step(force ? { ...swarmCoreParams(lp, ctx, system), emit: 'force' } : swarmCoreParams(lp, ctx, system));
      const got = gpu.read();
      const ms = now() - t0;
      stats.frames++;
      stats.agents = n;
      stats.gpuMsAvg += (ms - stats.gpuMsAvg) / stats.frames;
      stats.gpuMsMax = Math.max(stats.gpuMsMax, ms);
      return { got, n, force };
    },
    /**
     * Takeover: the kernel's steering accelerations for this layer as the particles.js seam ({ n, fx, fy }), or null without a
     * force token. The CPU adds them to its accumulators and runs the rest of the legacy step (contacts, damping, clamp, integration).
     */
    forces(token) {
      if (!token || !token.force) return null;
      stats.applied++;
      return { n: token.n, fx: token.got.vx, fy: token.got.vy };
    },
    /** After the JS step: compare the GPU's one step against what the JS swarm just did (alive agents only). */
    post(token, system) {
      if (!token || token.force) return; // a force token carries accelerations, not a state to compare
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
