/**
 * measureCosts.mjs — per-effect GPU cost measurement (backend hardening 3/6).
 * Browser-safe (no Node imports).
 *
 * Reuses the uniform-sweep infrastructure: every SWEEP_EFFECTS entry
 * (its `build(gl)` → { program, locs, apply, dispose } and its maximum
 * contract case's params — the worst-case knob position, which is what
 * the governor must shed against) renders through the sweep lab at
 * 512x512 RGBA16F (the production working format).
 *
 * Timing method (documented for the record — headless Chromium is a liar
 * about GPU time, so this is designed around its quirks):
 * - The debug harness GPU timer (gl/debug/gpuTimer.mjs) is used when the
 *   EXT_disjoint_timer_query_webgl2 extension exists (real GPUs).
 * - In headless Chromium (SwiftShader) the extension is absent AND the
 *   page's performance.now() does not advance across blocking GL calls,
 *   so in-page CPU timing reads 0. Instead the node driver
 *   (costTiers.measure.mjs) wall-times each batch with Date.now().
 * - Every draw is followed by a 1x1 FLOAT readback of the write target:
 *   without a readback SwiftShader elides draws whose output is never
 *   consumed, and gl.finish() alone does not force execution. The
 *   readback is the honest "did the GPU really do it" gate.
 * - Reported value per effect: median of 3 batches x 30 draws, after an
 *   8-draw warmup (JIT + cache warm).
 *
 * The recorded number is a RELATIVE ordering signal, not an absolute
 * budget: the CI gate (gl/costTiers.selfcheck.mjs) works on ratios to the
 * overall median, so the numbers stay meaningful when a different GPU
 * re-measures them. Re-bless with `npm run measure-costs` whenever a
 * shader's cost could have changed.
 */

import { SWEEP_EFFECTS } from './sweepEffects.mjs';
import { createSweepLab } from './sweep.mjs';
import { createGpuTimer } from './gpuTimer.mjs';

export const MEASURE_W = 512;
export const MEASURE_H = 512;
export const MEASURE_WARMUP = 8;
export const MEASURE_BATCH_DRAWS = 30;
export const MEASURE_BATCHES = 3;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/**
 * Build every swept effect once and return a batch runner. The node
 * driver calls warmup(id) once, then runBatch(id, draws) per timed batch
 * and wall-times the calls itself.
 *
 * runBatch resolves to { hwMs } when hardware timer queries produced
 * samples, else null (the driver falls back to its wall time).
 */
export function createCostMeasurer(gl) {
  if (!gl) throw new Error('[measure] WebGL2 unavailable — cannot measure GPU cost');
  const lab = createSweepLab(gl, { w: MEASURE_W, h: MEASURE_H });
  const timer = createGpuTimer(gl);
  const useHw = timer.isHardware;
  const readback = new Float32Array(4);
  const built = new Map();

  for (const def of SWEEP_EFFECTS) {
    const b = def.build(gl);
    // The `costly` contract case = worst-case knob position (tagged in the
    // sweep tables). Loop-bound shaders report their bound and ALU shaders
    // their heaviest preset; the governor sheds against the worst case,
    // so the measurement does too. Falls back to the first contract case.
    const contracts = def.cases.filter((c) => c.kind === 'contract');
    const c = contracts.find((x) => x.costly) ?? contracts[contracts.length - 1] ?? def.cases[0];
    built.set(def.id, { def, program: b.program, locs: b.locs, apply: b.apply, dispose: b.dispose, params: c, caseName: c.name });
  }

  function drawOnce(e) {
    const targets = { out: e.def.outSize === 8 ? lab.t16q : lab.t16a, tmp: lab.t16b };
    if (useHw) timer.begin('cost');
    e.apply(gl, e.locs, e.params, lab, targets);
    // 1x1 FLOAT readback of the write target: legal on RGBA16F, and the
    // sync point that forces SwiftShader to actually execute the draws.
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets.out.fb);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, readback);
    if (useHw) timer.end('cost');
  }

  async function drainTimer() {
    for (let j = 0; j < 900; j++) {
      const r = timer.poll();
      if (r.done) return r;
      // Hardware query results arrive a few frames late — yield instead
      // of busy-spinning.
      await new Promise((res) => setTimeout(res, 0));
    }
    throw new Error('[measure] GPU timer poll never completed');
  }

  return {
    ids: [...built.keys()],
    hwTimer: useHw,
    caseName(id) {
      return built.get(id)?.caseName ?? '';
    },
    warmup(id) {
      const e = built.get(id);
      if (!e) throw new Error(`[measure] unknown effect "${id}"`);
      for (let i = 0; i < MEASURE_WARMUP; i++) drawOnce(e);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    async runBatch(id, draws) {
      const e = built.get(id);
      if (!e) throw new Error(`[measure] unknown effect "${id}"`);
      const hwSamples = [];
      for (let i = 0; i < draws; i++) {
        drawOnce(e);
        if (useHw) {
          const r = await drainTimer();
          if (!r.disjoint) {
            const ms = r.timings.get('cost');
            if (typeof ms === 'number') hwSamples.push(ms);
          }
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return hwSamples.length ? { hwMs: median(hwSamples) } : null;
    },
    dispose() {
      for (const e of built.values()) {
        try { e.dispose(); } catch { /* noop */ }
      }
      built.clear();
      lab.dispose();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
  };
}
