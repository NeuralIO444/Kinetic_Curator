// engine/effects.js — Modular effect pipeline for Kinetic Curator
// Pure functions that transform placement data before rendering.

import { computeParticlesWasm, wasmReady } from './wasm-particles.js';

// ── Named constants for particle motion + blast ─────────────────────────────
const TAU = Math.PI * 2;
const PARTICLE_TIME_SCALE = 0.001;     // tick is ms; this normalizes to ~seconds
const PARTICLE_SCALE_MIN = 0.15;
const PARTICLE_SCALE_RANGE = 0.55;
const PARTICLE_ALPHA_MIN = 45;
const PARTICLE_ALPHA_RANGE = 55;
// Motion magic numbers, mirrored exactly in assembly/particles.ts
const FLOW_PHASE_OFFSET = 60;
const FLOW_SPEED_GAIN = 90;
const FLOW_WAVE_SPEED = 0.6;
const FLOW_WAVE_AMP = 0.12;            // fraction of canvasH
const SWARM_FREQ_X = 0.7;
const SWARM_FREQ_Y = 0.9;
const SWARM_AMP = 0.42;                // fraction of canvas dimension
const ORBIT_RADIUS_MIN = 0.18;
const ORBIT_RADIUS_RANGE = 0.32;       // r = canvasH * (min + rad * range)
const ORBIT_OMEGA_GAIN = 0.35;
const ECHO_JITTER_PX_PER_STEP = 10;
const BLAST_FORCE_GAIN = 80;
const BLAST_DURATION_MS = 1000;

/**
 * Apply echo: faded jittered copies of every placement.
 */
export function applyEcho(placements, config) {
  if (!config.enabled) return placements;
  const echoed = [];
  for (let i = 0; i < placements.length; i++) {
    const original = placements[i];
    echoed.push(original);
    for (let echo = 1; echo <= config.count; echo++) {
      const decay = Math.pow(config.decay, echo);
      const jit = ECHO_JITTER_PX_PER_STEP * echo;
      echoed.push({
        ...original,
        x: original.x + (Math.random() - 0.5) * jit,
        y: original.y + (Math.random() - 0.5) * jit,
        scale: original.scale * decay,
        alpha: original.alpha * decay,
        echo: true,
      });
    }
  }
  return echoed;
}

/**
 * Apply trails — no-op here. Real trail history lives in CanvasPanel because
 * it's stateful across frames. Kept exported in case future work moves it
 * back into the pipeline.
 */
export function applyTrails(placements /* , config, history */) {
  return placements;
}

/**
 * Apply feedback — no-op here. Real feedback is a GPU ping-pong inside
 * pixi-renderer.js `setFeedback` / `_captureFeedback`.
 */
export function applyFeedback(placements /* , config */) {
  return placements;
}

// Deterministic integer hash for per-particle params.
// Uses Math.imul so all multiplications stay in 32-bit integer territory —
// matches the AssemblyScript kernel byte-for-byte even at large seeds.
function rand01(seed, i, salt) {
  let k = (Math.imul(seed | 0, 2654435761) + Math.imul(i | 0, 1664525) + (salt | 0)) | 0;
  k = (k ^ (k >>> 13)) | 0;
  k = Math.imul(k, 1013904223) | 0;
  k = (k ^ (k >>> 16)) | 0;
  return (k >>> 0 & 0xffff) / 65535;
}

function particleParams(seed, i) {
  return {
    phase: rand01(seed, i, 0) * TAU,
    radiusSeed: rand01(seed, i, 1),
    speedSeed: rand01(seed, i, 2) + 0.5,
    sizeSeed: rand01(seed, i, 3),
  };
}

/**
 * Apply particle system. Uses WASM kernel when available + count ≥ 32,
 * otherwise an arithmetically-identical JS fallback.
 */
export function applyParticles(placements, config, ctx = {}) {
  if (!config.enabled) return placements;
  const { count, speed = 1, motionEnabled = false, motionType = 'flow', tick = 0 } = config;
  const { canvasW = 1000, canvasH = 700, seed = 1, swatches = ['#ffffff'] } = ctx;

  // Hot path: WASM kernel
  if (wasmReady() && count >= 32) {
    const out = computeParticlesWasm({
      count, seed, tick, speed, motionEnabled, motionType, canvasW, canvasH,
    });
    if (out) {
      const particles = new Array(count);
      for (let i = 0; i < count; i++) {
        particles[i] = {
          x: out.x[i],
          y: out.y[i],
          scale: out.scale[i],
          rotation: 0,
          alpha: out.alpha[i],
          particle: true,
          color: swatches[i % swatches.length],
          accent: swatches[(i + 3) % swatches.length],
        };
      }
      return placements.length ? [...placements, ...particles] : particles;
    }
  }

  // JS fallback — same math as the WASM kernel.
  const t = tick * PARTICLE_TIME_SCALE * speed;
  const particles = new Array(count);
  for (let i = 0; i < count; i++) {
    const p = particleParams(seed, i);
    let x, y;
    if (motionEnabled) {
      switch (motionType) {
        case 'flow': {
          const lane = p.radiusSeed * canvasH;
          const xRaw = (p.phase * FLOW_PHASE_OFFSET + t * FLOW_SPEED_GAIN * p.speedSeed) % (canvasW + 200);
          x = xRaw - 100;
          y = lane + Math.sin(t * FLOW_WAVE_SPEED + p.phase) * canvasH * FLOW_WAVE_AMP;
          break;
        }
        case 'orbit': {
          const r = canvasH * (ORBIT_RADIUS_MIN + p.radiusSeed * ORBIT_RADIUS_RANGE);
          const sign = i % 2 === 0 ? 1 : -1;
          const omega = t * ORBIT_OMEGA_GAIN * p.speedSeed * sign;
          x = canvasW / 2 + Math.cos(p.phase + omega) * r;
          y = canvasH / 2 + Math.sin(p.phase + omega) * r;
          break;
        }
        case 'swarm':
        default: {
          x = canvasW / 2 + Math.sin(t * p.speedSeed * SWARM_FREQ_X + p.phase) * canvasW * SWARM_AMP;
          y = canvasH / 2 + Math.cos(t * p.speedSeed * SWARM_FREQ_Y + p.phase * 1.3) * canvasH * SWARM_AMP;
          break;
        }
      }
    } else {
      x = p.radiusSeed * canvasW;
      y = ((p.phase * 1000) % canvasH);
    }
    particles[i] = {
      x, y,
      scale: PARTICLE_SCALE_MIN + p.sizeSeed * PARTICLE_SCALE_RANGE,
      rotation: 0,
      alpha: PARTICLE_ALPHA_MIN + p.sizeSeed * PARTICLE_ALPHA_RANGE,
      particle: true,
      color: swatches[i % swatches.length],
      accent: swatches[(i + 3) % swatches.length],
    };
  }
  return placements.length ? [...placements, ...particles] : particles;
}

/**
 * Push placements outward from a blast center, decaying linearly over 1s.
 * Returns the SAME object instance for items outside the radius (zero alloc).
 */
export function applyBlastRadius(placements, config, ctx = {}) {
  if (!config.enabled) return placements;
  const { canvasW = 1000, canvasH = 700, blastCenter } = ctx;
  let centerX = canvasW / 2;
  let centerY = canvasH / 2;
  let intensity = 1;
  if (blastCenter && typeof blastCenter.t === 'number') {
    const age = Date.now() - blastCenter.t;
    if (age > BLAST_DURATION_MS) return placements;
    centerX = blastCenter.x;
    centerY = blastCenter.y;
    intensity = 1 - age / BLAST_DURATION_MS;
  }
  const radius = config.radius;
  const force = config.force;
  let out = null;
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    const dx = p.x - centerX;
    const dy = p.y - centerY;
    const distSq = dx * dx + dy * dy;
    if (distSq < radius * radius && distSq > 0.001) {
      const dist = Math.sqrt(distSq);
      const angle = Math.atan2(dy, dx);
      const falloff = (radius - dist) / radius;
      const push = falloff * force * BLAST_FORCE_GAIN * intensity;
      if (!out) out = placements.slice();
      out[i] = { ...p, x: p.x + Math.cos(angle) * push, y: p.y + Math.sin(angle) * push };
    }
  }
  return out || placements;
}

/**
 * Apply color effects — no-op here. Color selection happens up-front in
 * CanvasPanel via applyHarmony + colorForPlacement; this function is kept
 * exported for pipeline-signature uniformity.
 */
export function applyColorEffects(placements /* , config */) {
  return placements;
}

/**
 * Main effect pipeline.
 * The no-op stubs (applyTrails, applyFeedback, applyColorEffects) are NOT
 * called here — they're kept exported in case future versions need them, but
 * calling them every frame was pure overhead.
 */
export function processEffects(placements, effectConfig, ctx = {}) {
  let processed = placements;

  processed = applyEcho(processed, {
    enabled: effectConfig.echoEnabled,
    count: effectConfig.echoCount,
    decay: effectConfig.echoDecay,
  });

  processed = applyParticles(
    processed,
    {
      enabled: effectConfig.particlesEnabled,
      count: effectConfig.particleCount,
      speed: effectConfig.particleSpeed,
      motionEnabled: effectConfig.motionEnabled,
      motionType: effectConfig.motionType,
      tick: ctx.tick,
    },
    ctx,
  );

  processed = applyBlastRadius(
    processed,
    {
      enabled: effectConfig.blastRadiusEnabled,
      radius: effectConfig.blastRadius,
      force: effectConfig.blastForce,
    },
    ctx,
  );

  return processed;
}
