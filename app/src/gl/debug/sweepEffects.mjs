/**
 * sweepEffects.mjs — per-effect sweep tables for the uniform-sweep property
 * tests (backend hardening 1/6). Browser-safe (no Node imports).
 *
 * Every shader effect routed through the checked builders gets a sweep:
 * the 5 template FX shaders (fxShaders.mjs), the 5 builtin FX modes
 * (EFFECT_FS via builtinEffects.mjs), and the 8 ACCUM passes (accum.mjs).
 * The renderer programs (quad/composite/resolve/copy) are not effects —
 * they have no sweepable parameters — so they are covered by the
 * compile+audit gate only.
 *
 * Case kinds:
 * - 'contract': values the effect's knobs can actually take (descriptor /
 *   catalog min..max, defaults, zero, boundaries). Asserts: (1) no
 *   NaN/Infinity in the output, (2) output in [0,1] unless the pass is
 *   HDR by design (echo/add — additive light on 16F buffers), (3) when
 *   tagged noop/near, the zero-param output matches the input.
 * - 'hostile': negative / below-min / extreme values, uploaded RAW
 *   (bypassing sanitizeParams) to probe the shader itself. Asserts finite
 *   output only — out-of-range here is logged, not failed. Rationale: the
 *   shader owns "never non-finite"; the sanitizers own "hostile values
 *   never arrive" (sanitization audit, hardening item 7). A HOSTILE-NaN
 *   finding is printed loudly and counted, but does not fail the build:
 *   the value is outside every knob's contract.
 *
 * Where the zero-no-op lives, per effect (the house pattern is "off means
 * off, provably" — flow=0 skips exactly, silence is a no-op):
 * - shader identity: displace/scale=0, tear/amount=0, scanlines/amount=0,
 *   grain/amount=0, blur/radius=0, feed/flow=0, fade/(keep=1,tz=1,ts=0,prism=0),
 *   echo/ntaps=0, add/amount=0, copy — byte-exact (noop: true).
 * - structural skip: accum-blur at sigma<=1e-3 never runs (createAccum.step
 *   guards `p.frameBlurSigma > 1e-3`); the sweep asserts near-identity
 *   (near: 1 LSB) at sigma=0 and documents the skip.
 * - N/A (always-on, binary): solarize, edge, invert — off means dropped
 *   from the chain, so there is no zero-param identity to prove.
 * - rgbSplit at dx=0 is NOT a no-op (the screen-alpha recombine
 *   1-(1-a)^3 changes fractional alphas — matches the SVG reference, so
 *   this is as-designed, not a bug); off means dropped from the chain.
 *
 * Uniform values replicate the production upload sites exactly:
 * - template FX: uploadUniformsFor (the production function, sanitizer
 *   included) for contract cases; raw direct upload for hostile cases.
 * - builtins: the u_p packers from registerBuiltinEffects
 *   (builtinEffects.mjs) — invert [0,0,0,0], rgbSplit [dx/1000,0,0,0],
 *   grain [amount,0,0,0], blur [radius*(w/1000),0,0,0], posterize
 *   [levels,0,0,0]; u_clipOn=0, u_aux=input except grain's LUT.
 * - ACCUM: the setup callbacks in createAccum (accum.mjs).
 */

import { FULL_VS, EFFECT_FS } from '../shaders.mjs';
import { TEMPLATE_VS, uniformDecls, uploadUniformsFor } from '../effects/template.mjs';
import { injectCommon } from '../effects/chunks.mjs';
import { buildProgramChecked, auditProgramChecked } from './diagnostics.mjs';
import { UNIFORMS as BUILTIN_UNIFORMS } from '../bridge/builtinEffects.mjs';
import { ACCUM_PROGRAMS } from '../accum.mjs';
import { FX_SHADER_EFFECTS } from '../effects/fxShaders.mjs';
import { createSweepLab, runEffectSweep, locMap } from './sweep.mjs';

/* ------------------------------------------------------------------ */
/* shared test textures                                                */
/* ------------------------------------------------------------------ */

function solidTexture(gl, w, h, r, g, b, a) {
  const bytes = new Uint8Array(w * h * 4);
  for (let k = 0; k < bytes.length; k += 4) {
    bytes[k] = r; bytes[k + 1] = g; bytes[k + 2] = b; bytes[k + 3] = a;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/** Deterministic stand-in for the baked grain LUT (sweep needs finite noise, not the resvg bake). */
function grainLutTexture(gl, w, h) {
  const bytes = new Uint8Array(w * h * 4);
  let s = 0x51ed2703;
  for (let k = 0; k < bytes.length; k++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    bytes[k] = (s >>> 8) & 255;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/* ------------------------------------------------------------------ */
/* builders                                                            */
/* ------------------------------------------------------------------ */

function buildChecked(gl, { vs, fs, name, vsFile, fsFile, decls }) {
  const program = buildProgramChecked(gl, vs, fs, { name, vsFile, fsFile });
  auditProgramChecked(gl, program, Object.keys(decls), { name, file: fsFile });
  return { program, locs: locMap(gl, program, Object.keys(decls)) };
}

/** Raw (unsanitized) template values — hostile cases bypass sanitizeParams. */
function rawTemplateValues(descriptor, params, inputTex, w, h) {
  const out = { u_tex: inputTex, u_res: [w, h] };
  if (descriptor.animated) out.u_time = 0;
  for (const [pname, p] of Object.entries(descriptor.params)) {
    let v = params[pname];
    if (p.type === 'bool') v = v ? 1 : 0;
    out[`u_${pname}`] = v;
  }
  return out;
}

/** One template-FX sweep entry (displace/tear/scanlines/solarize/edge). */
function templateEffectDef(kind) {
  const found = FX_SHADER_EFFECTS.find(([k]) => k === kind);
  if (!found) throw new Error(`[sweep] unknown template effect "${kind}"`);
  const def = found[1];
  const descriptor = def.descriptor;
  const decls = uniformDecls(descriptor);
  return {
    id: `fx/${kind}`,
    build(gl) {
      const { program, locs } = buildChecked(gl, {
        vs: TEMPLATE_VS,
        fs: injectCommon(def.fs),
        name: `sweep-fx/${kind}`,
        vsFile: 'template.mjs:TEMPLATE_VS',
        fsFile: def.file,
        decls,
      });
      return {
        program,
        locs,
        apply: (glA, locsA, c, lab, targets) => {
          const values = c.kind === 'hostile'
            ? rawTemplateValues(descriptor, c.params, lab.input.tex, lab.w, lab.h)
            : uploadUniformsFor(descriptor, {
                readTex: lab.input.tex, width: lab.w, height: lab.h, time: 0, params: c.params,
              });
          lab.render(program, targets.out, locsA, decls, values);
        },
        dispose: () => gl.deleteProgram(program),
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* builtin FX (EFFECT_FS modes)                                        */
/* ------------------------------------------------------------------ */

const S = (unit) => ({ kind: 'sampler', unit });

/**
 * One builtin-FX sweep entry. `mode` is the EFFECT_FS u_effect id;
 * `pack(c, lab)` returns u_p exactly as registerBuiltinEffects packs it.
 * Multi-pass effects (blur) override apply.
 */
function builtinEffectDef(id, mode, pack, { aux = false } = {}) {
  const decls = BUILTIN_UNIFORMS;
  return {
    id: `builtin/${id}`,
    build(gl) {
      const { program, locs } = buildChecked(gl, {
        vs: FULL_VS,
        fs: EFFECT_FS,
        name: `sweep-builtin/${id}`,
        vsFile: 'shaders.mjs:FULL_VS',
        fsFile: 'shaders.mjs:EFFECT_FS',
        decls,
      });
      const auxTex = aux ? grainLutTexture(gl, 32, 32) : null;
      const upload = (glA, locsA, c, lab, target) => {
        lab.render(program, target, locsA, decls, {
          u_src: lab.input.tex,
          u_aux: auxTex || lab.input.tex,
          u_effect: mode,
          u_p: pack(c, lab),
          u_texel: [1 / target.w, 1 / target.h],
          u_clip: [0, 0, 0, 0],
          u_clipOn: 0,
        });
      };
      return {
        program,
        locs,
        apply: (glA, locsA, c, lab, targets) => upload(glA, locsA, c, lab, targets.out),
        dispose: () => {
          gl.deleteProgram(program);
          if (auxTex) gl.deleteTexture(auxTex);
        },
      };
    },
  };
}

/** Builtin blur is two separable passes (H then V), like the bridge chain. */
function builtinBlurDef() {
  const base = builtinEffectDef('blur', 3, (c, lab) => [
    c.params.sigmaDirect !== undefined ? c.params.sigmaDirect : (c.params.radius || 0) * (lab.w / 1000),
    0, 0, 0,
  ]);
  const origBuild = base.build;
  base.build = (gl) => {
    const built = origBuild(gl);
    const { program, locs } = built;
    const decls = BUILTIN_UNIFORMS;
    return {
      program,
      locs,
      apply: (glA, locsA, c, lab, targets) => {
        const sigma = c.params.sigmaDirect !== undefined
          ? c.params.sigmaDirect
          : (c.params.radius || 0) * (lab.w / 1000);
        for (const [mode, target] of [[3, targets.tmp], [4, targets.out]]) {
          lab.render(program, target, locsA, decls, {
            u_src: target === targets.tmp ? lab.input.tex : targets.tmp.tex,
            u_aux: lab.input.tex,
            u_effect: mode,
            u_p: [sigma, 0, 0, 0],
            u_texel: [1 / target.w, 1 / target.h],
            u_clip: [0, 0, 0, 0],
            u_clipOn: 0,
          });
        }
      },
      dispose: built.dispose,
    };
  };
  return base;
}

/* ------------------------------------------------------------------ */
/* ACCUM passes                                                        */
/* ------------------------------------------------------------------ */

/** One ACCUM-pass sweep entry. `decls`/`values(c, lab, aux)` mirror createAccum's setup callbacks. */
function accumDef(name, decls, values, { hdr = false, multi = null } = {}) {
  const accDef = ACCUM_PROGRAMS[name];
  return {
    id: `accum/${name}`,
    build(gl) {
      const { program, locs } = buildChecked(gl, {
        vs: FULL_VS,
        fs: accDef.fs,
        name: `sweep-accum/${name}`,
        vsFile: 'accum.mjs:FULL_VS',
        fsFile: accDef.file,
        decls,
      });
      const aux = {
        gray: solidTexture(gl, 32, 32, 128, 128, 128, 255),
        clear: solidTexture(gl, 32, 32, 0, 0, 0, 0),
        bloom: solidTexture(gl, 8, 8, 200, 160, 120, 255),
      };
      const single = (glA, locsA, c, lab, targets) => {
        lab.render(program, targets.out, locsA, decls, values(c, lab, aux));
      };
      return {
        program,
        locs,
        apply: multi
          ? (glA, locsA, c, lab, targets) => multi(glA, locsA, c, lab, targets, program, decls, values, aux)
          : single,
        dispose: () => {
          gl.deleteProgram(program);
          for (const t of Object.values(aux)) gl.deleteTexture(t);
        },
      };
    },
    hdr,
  };
}

// Separable H/V driver shared by accum/blur's two passes.
function accumBlurApply(glA, locsA, c, lab, targets, program, decls, values, aux) {
  for (const [vertical, target] of [[0, targets.tmp], [1, targets.out]]) {
    lab.render(program, target, locsA, decls, values(c, lab, aux, {
      src: target === targets.tmp ? lab.input.tex : targets.tmp.tex,
      vertical,
      w: target.w, h: target.h,
    }));
  }
}

/* ------------------------------------------------------------------ */
/* the sweep table                                                     */
/* ------------------------------------------------------------------ */

const C = (name, params, extra = {}) => ({ name, kind: 'contract', params, ...extra });
const H = (name, params, extra = {}) => ({ name, kind: 'hostile', params, ...extra });

export const SWEEP_EFFECTS = [
  // ---- template FX ----
  {
    ...templateEffectDef('displace'),
    cases: [
      C('defaults', { scale: 24, seed: 7 }),
      C('zero → no-op', { scale: 0, seed: 7 }, { noop: true }),
      C('max', { scale: 120, seed: 99 }),
      C('min scale, min seed', { scale: 1, seed: 0 }),
      H('hostile negative scale', { scale: -10, seed: 7 }),
    ],
  },
  {
    ...templateEffectDef('tear'),
    cases: [
      C('defaults', { bands: 18, amount: 12 }),
      C('zero → no-op', { bands: 18, amount: 0 }, { noop: true }),
      C('max', { bands: 60, amount: 40 }),
      C('min', { bands: 2, amount: 1 }),
      H('hostile negative bands', { bands: -4, amount: 12 }),
      H('hostile negative amount', { bands: 18, amount: -5 }),
    ],
  },
  {
    ...templateEffectDef('scanlines'),
    cases: [
      C('defaults', { density: 0.35, amount: 0.5 }),
      C('zero → no-op', { density: 0.35, amount: 0 }, { noop: true }),
      C('max', { density: 1, amount: 1 }),
      C('min', { density: 0.05, amount: 0.05 }),
      H('hostile negative density', { density: -1, amount: 0.5 }),
      H('hostile over-max amount', { density: 0.35, amount: 2 }),
    ],
  },
  {
    ...templateEffectDef('solarize'),
    cases: [
      // No params: always-on transform. Off means dropped from the chain,
      // so there is no zero-param identity to prove.
      C('always-on', {}),
    ],
  },
  {
    ...templateEffectDef('edge'),
    cases: [
      // No params: always-on transform (see solarize note).
      C('always-on', {}),
    ],
  },

  // ---- builtin FX ----
  {
    ...builtinEffectDef('invert', 0, () => [0, 0, 0, 0]),
    cases: [
      // No strength param: always-on (see solarize note).
      C('on', {}),
    ],
  },
  {
    ...builtinEffectDef('rgbSplit', 1, (c) => [(c.params.dx || 0) / 1000, 0, 0, 0]),
    cases: [
      C('defaults', { dx: 3 }),
      // dx=0 is NOT a no-op: the screen-alpha recombine 1-(1-a)^3 changes
      // fractional alphas. Matches the SVG reference (as-designed); off
      // means dropped from the chain.
      C('zero (not a no-op by design)', { dx: 0 }),
      C('max', { dx: 24 }),
      C('mid', { dx: 12 }),
      H('hostile negative dx', { dx: -8 }),
    ],
  },
  {
    ...builtinEffectDef('grain', 2, (c) => [c.params.amount ?? 0.4, 0, 0, 0], { aux: true }),
    cases: [
      C('defaults', { amount: 0.4 }),
      C('zero → no-op', { amount: 0 }, { noop: true }),
      C('max', { amount: 1 }),
      C('high', { amount: 0.7 }),
      H('hostile negative amount', { amount: -0.5 }),
    ],
  },
  {
    ...builtinBlurDef(),
    cases: [
      C('defaults', { radius: 6 }),
      C('zero → no-op', { radius: 0 }, { noop: true }),
      C('max', { radius: 40 }),
      C('small', { radius: 0.5 }),
      H('hostile deep-loop sigma', { sigmaDirect: 25 }),
    ],
  },
  {
    ...builtinEffectDef('posterize', 5, (c) => [c.params.levels ?? 4, 0, 0, 0]),
    cases: [
      C('defaults', { levels: 4 }),
      C('min', { levels: 2 }),
      C('max', { levels: 8 }),
      // levels=1 is below the catalog minimum of 2: 0/0 → NaN. Reachable
      // today only via unclamped project JSON (builtins pass params
      // through) — flagged for the sanitization audit (item 7).
      H('hostile levels=1 (below min)', { levels: 1 }),
      H('hostile levels=0', { levels: 0 }),
    ],
  },

  // ---- ACCUM passes ----
  {
    ...accumDef('fade',
      { u_src: S(0), u_keep: { kind: 'float' }, u_tunnelZoom: { kind: 'float' }, u_tunnelSpin: { kind: 'float' }, u_prism: { kind: 'float' } },
      (c, lab) => ({
        u_src: lab.input.tex, u_keep: c.params.keep, u_tunnelZoom: c.params.tz,
        u_tunnelSpin: c.params.ts, u_prism: c.params.prism,
      })),
    cases: [
      C('defaults', { keep: 0.88, tz: 1, ts: 0, prism: 0 }),
      // keep=1 is the shader's identity point (the recipe clamps fade to
      // <=0.99, so this is the shader-level proof of the no-op shape).
      C('identity → no-op', { keep: 1, tz: 1, ts: 0, prism: 0 }, { noop: true }),
      C('zero keep (fade to black)', { keep: 0, tz: 1, ts: 0, prism: 0 }),
      C('max feedback', { keep: 0.88, tz: 1.01, ts: 0.01, prism: 0.001 }),
      H('hostile negative keep', { keep: -0.5, tz: 1, ts: 0, prism: 0 }),
    ],
  },
  {
    ...accumDef('feed',
      { u_src: S(0), u_flow: { kind: 'float' } },
      (c, lab) => ({ u_src: lab.input.tex, u_flow: c.params.flow })),
    cases: [
      // The house pattern: flow=0 skips exactly (createAccum.step); the
      // shader at flow=0 is independently the identity.
      C('zero → no-op', { flow: 0 }, { noop: true }),
      C('light', { flow: 0.015 }),
      C('max', { flow: 0.03 }),
      H('hostile negative flow', { flow: -0.03 }),
      H('hostile huge flow', { flow: 0.5 }),
    ],
  },
  {
    ...accumDef('echo',
      {
        u_src: S(0), u_t0: S(1), u_t1: S(2), u_t2: S(3), u_t3: S(4),
        u_w: { kind: 'vec4' }, u_ntaps: { kind: 'int' },
      },
      (c, lab, aux) => ({
        u_src: lab.input.tex, u_t0: lab.input.tex, u_t1: aux.gray, u_t2: aux.clear, u_t3: lab.input.tex,
        u_w: [0.5, 0.35, 0.25, 0.18], u_ntaps: c.params.ntaps,
      }),
      { hdr: true }),
    cases: [
      // ntaps=0: the echo mix is skipped in the recipe; the shader at
      // ntaps=0 is independently the identity.
      C('zero taps → no-op', { ntaps: 0 }, { noop: true }),
      C('one tap', { ntaps: 1 }),
      C('two taps', { ntaps: 2 }),
      C('four taps', { ntaps: 4 }),
    ],
  },
  {
    ...accumDef('blur',
      { u_src: S(0), u_texel: { kind: 'vec2' }, u_sigma: { kind: 'float' }, u_vertical: { kind: 'float' } },
      (c, lab, aux, pass) => ({
        u_src: pass.src, u_texel: [1 / pass.w, 1 / pass.h],
        u_sigma: c.params.sigma, u_vertical: pass.vertical,
      }),
      { multi: accumBlurApply }),
    cases: [
      // sigma=0: the recipe SKIPS the pass (createAccum.step guards
      // frameBlurSigma > 1e-3), so the no-op is structural. At shader
      // level sigma floors to 1e-3: (s*w0)/w0 — near-identity within 1 LSB.
      C('zero → near-identity (pass skipped in recipe)', { sigma: 0 }, { near: 1 }),
      C('frame blur scale', { sigma: 5 }),
      C('bloom scale', { sigma: 13.5 }),
      C('halation scale', { sigma: 33 }),
      H('hostile negative sigma', { sigma: -5 }),
    ],
  },
  {
    ...accumDef('add',
      {
        u_base: S(0), u_bloom: S(1), u_bloomSize: { kind: 'vec2' },
        u_amount: { kind: 'float' }, u_tint: { kind: 'vec3' },
      },
      (c, lab, aux) => ({
        u_base: lab.input.tex, u_bloom: aux.bloom, u_bloomSize: [8, 8],
        u_amount: c.params.amount, u_tint: [1.0, 0.6, 0.35],
      }),
      { hdr: true }),
    cases: [
      // amount=0: base.rgb + 0 is exactly base (IEEE: x+0==x).
      C('zero → no-op', { amount: 0 }, { noop: true }),
      C('bloom scale', { amount: 0.55 }),
      C('max', { amount: 1 }),
      H('hostile negative amount', { amount: -0.5 }),
    ],
  },
  {
    ...accumDef('copy', { u_src: S(0) }, (c, lab) => ({ u_src: lab.input.tex })),
    cases: [
      // Identity control: proves the sweep machinery itself is bit-exact.
      C('passthrough → no-op', {}, { noop: true }),
    ],
  },
  {
    ...accumDef('over',
      { u_src: S(0), u_dst: S(1) },
      (c, lab, aux) => ({ u_src: lab.input.tex, u_dst: aux.gray })),
    cases: [C('source-over', {})],
  },
  {
    ...accumDef('down', { u_src: S(0) }, (c, lab) => ({ u_src: lab.input.tex })),
    // Production shape: the downsample pass box-filters 4x4 source blocks,
    // so it renders quarter-resolution (32 -> 8) into the lab's t16q.
    outSize: 8,
    cases: [C('4x4 box downsample', {})],
  },
];

/** Run every effect's sweep table on an existing WebGL2 context. Returns { lines, failures, skipped? }. */
export function runAllSweeps(gl) {
  if (!gl) {
    const msg = 'sweep tests skipped: no headless Chromium (WebGL2 unavailable)';
    console.log(`  [SKIP] ${msg}`);
    return { lines: [`  [SKIP] ${msg}`], failures: [], skipped: true };
  }
  const lab = createSweepLab(gl);
  const lines = [];
  const failures = [];
  let cases = 0;
  let hostile = 0;
  let noops = 0;
  for (const def of SWEEP_EFFECTS) {
    const r = runEffectSweep(gl, lab, def);
    lines.push(...r.lines);
    failures.push(...r.failures);
    cases += r.cases;
    hostile += r.hostileNotes.length;
    noops += def.cases.filter((c) => c.noop || c.near != null).length;
  }
  lab.dispose();
  lines.unshift(
    `sweep: ${SWEEP_EFFECTS.length} effects, ${cases} cases, ${noops} no-op proof(s)` +
    (hostile ? `, ${hostile} hostile note(s) (logged, not failing)` : '')
  );
  return { lines, failures };
}
