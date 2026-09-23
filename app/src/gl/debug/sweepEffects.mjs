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
 *   grain/amount=0, glow/amount=0, feed/flow=0, fade/(keep=1,tz=1,ts=0,prism=0),
 *   echo/ntaps=0, copy — byte-exact (noop: true).
 *   (#308: the instrument has no gaussian blur — the builtin blur and the
 *   accum blur/add sweep entries were deleted with the blur passes. The
 *   glow pass has a sweep entry (accum/glow: mip-chain bloom + stipple +
 *   chromatic offset, measured for the cost-tier gate) and is also covered
 *   by the GPU-vs-mirror parity checks in accum.selfcheck.mjs.)
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
 *   grain [amount,0,0,0], posterize [levels,0,0,0]; u_clipOn=0,
 *   u_aux=input except grain's LUT.
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

/**
 * Mipmapped warm aux texture (#308): stand-in for the ACCUM glow target —
 * RGBA8 with a full mip chain (LINEAR_MIPMAP_LINEAR), the format GLOW_FS
 * samples with textureLod. Solid warm gray so every mip level is finite
 * and the sweep's byte-exact no-op case (amount=0) holds.
 */
function glowTexture(gl, size) {
  const bytes = new Uint8Array(size * size * 4);
  for (let k = 0; k < bytes.length; k += 4) {
    bytes[k] = 200; bytes[k + 1] = 160; bytes[k + 2] = 120; bytes[k + 3] = 255;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  gl.generateMipmap(gl.TEXTURE_2D);
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
        // (#308) mipmapped stand-in for the ACCUM glow target, for the glow
        // sweep entry's u_glow sampler.
        glow: glowTexture(gl, 64),
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
      C('max', { scale: 120, seed: 99 }, { costly: true }),
      C('min scale, min seed', { scale: 1, seed: 0 }),
      H('hostile negative scale', { scale: -10, seed: 7 }),
    ],
  },
  {
    ...templateEffectDef('tear'),
    cases: [
      C('defaults', { bands: 18, amount: 12 }),
      C('zero → no-op', { bands: 18, amount: 0 }, { noop: true }),
      C('max', { bands: 60, amount: 40 }, { costly: true }),
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
      C('max', { density: 1, amount: 1 }, { costly: true }),
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
      C('always-on', {}, { costly: true }),
    ],
  },
  {
    ...templateEffectDef('edge'),
    cases: [
      // No params: always-on transform (see solarize note).
      C('always-on', {}, { costly: true }),
    ],
  },

  // ---- builtin FX ----
  {
    ...builtinEffectDef('invert', 0, () => [0, 0, 0, 0]),
    cases: [
      // No strength param: always-on (see solarize note).
      C('on', {}, { costly: true }),
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
      C('max', { dx: 24 }, { costly: true }),
      C('mid', { dx: 12 }),
      H('hostile negative dx', { dx: -8 }),
    ],
  },
  {
    ...builtinEffectDef('grain', 2, (c) => [c.params.amount ?? 0.4, 0, 0, 0], { aux: true }),
    cases: [
      C('defaults', { amount: 0.4 }),
      C('zero → no-op', { amount: 0 }, { noop: true }),
      C('max', { amount: 1 }, { costly: true }),
      C('high', { amount: 0.7 }),
      H('hostile negative amount', { amount: -0.5 }),
    ],
  },
  {
    ...builtinEffectDef('posterize', 5, (c) => [c.params.levels ?? 4, 0, 0, 0]),
    cases: [
      C('defaults', { levels: 4 }),
      C('min', { levels: 2 }),
      C('max', { levels: 8 }, { costly: true }),
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
      { u_src: S(0), u_keep: { kind: 'float' }, u_bg: { kind: 'vec3' }, u_tunnelZoom: { kind: 'float' }, u_tunnelSpin: { kind: 'float' }, u_prism: { kind: 'float' } },
      (c, lab) => ({
        u_src: lab.input.tex, u_keep: c.params.keep,
        // #287 fade-to-paper target — production sources this from the
        // palette bg (accum.mjs's real 'fade' pass); the sweep has no
        // palette, so a fixed stand-in is enough to satisfy the uniform
        // audit and give the keep<1 cases a real fade destination.
        u_bg: [0, 0, 0],
        u_tunnelZoom: c.params.tz,
        u_tunnelSpin: c.params.ts, u_prism: c.params.prism,
      })),
    cases: [
      C('defaults', { keep: 0.88, tz: 1, ts: 0, prism: 0 }),
      // keep=1 is the shader's identity point (the recipe clamps fade to
      // <=0.99, so this is the shader-level proof of the no-op shape).
      C('identity → no-op', { keep: 1, tz: 1, ts: 0, prism: 0 }, { noop: true }),
      C('zero keep (fade to black)', { keep: 0, tz: 1, ts: 0, prism: 0 }),
      C('max feedback', { keep: 0.88, tz: 1.01, ts: 0.01, prism: 0.001 }, { costly: true }),
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
      C('max', { flow: 0.03 }, { costly: true }),
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
      C('four taps', { ntaps: 4 }, { costly: true }),
    ],
  },
  {
    ...accumDef('copy', { u_src: S(0) }, (c, lab) => ({ u_src: lab.input.tex })),
    cases: [
      // Identity control: proves the sweep machinery itself is bit-exact.
      C('passthrough → no-op', {}, { noop: true, costly: true }),
    ],
  },
  {
    ...accumDef('over',
      { u_src: S(0), u_dst: S(1) },
      (c, lab, aux) => ({ u_src: lab.input.tex, u_dst: aux.gray })),
    cases: [C('source-over', {}, { costly: true })],
  },
  {
    ...accumDef('down', { u_src: S(0) }, (c, lab) => ({ u_src: lab.input.tex })),
    // Production shape (#308): the downsample pass box-filters 8x8 source
    // blocks (GLOW_DIV) via texelFetch into the glow target's base level.
    // The lab renders it into the quarter-res t16q target (32 -> 8), so the
    // outer blocks read past the 32px source edge and return 0 — harmless
    // for the finiteness/range scan, which is all this entry asserts.
    outSize: 8,
    cases: [C('8x8 box downsample', {}, { costly: true })],
  },
  {
    ...accumDef('glow',
      {
        u_base: S(0), u_glow: S(1), u_glowSize: { kind: 'vec2' },
        u_lod: { kind: 'float' }, u_stipple: { kind: 'float' },
        u_chromaTexels: { kind: 'float' }, u_amount: { kind: 'float' },
        u_tint: { kind: 'vec3' },
      },
      (c, lab, aux) => ({
        u_base: lab.input.tex, u_glow: aux.glow, u_glowSize: [64, 64],
        u_lod: c.params.lod ?? 1, u_stipple: c.params.stipple ?? 0.5,
        u_chromaTexels: c.params.chromaTexels ?? 1,
        u_amount: c.params.amount ?? 0.55, u_tint: [1.0, 0.6, 0.35],
      }),
      // hdr: amount=1 over a bright input exceeds 1.0 by design (bloom adds light).
      { hdr: true }),
    // Production shape (#308): the glow target is canvas/8 RGBA8 with a full
    // mip chain; lod 1 ≈ canvas/16. amount=0 is a provable no-op
    // (base + 0·tint·glow·gate is exactly base, IEEE).
    cases: [
      C('defaults', {}),
      C('zero → no-op', { amount: 0 }, { noop: true }),
      C('max', { amount: 1, stipple: 1, chromaTexels: 1.5, lod: 3 }, { costly: true }),
      H('hostile negative amount', { amount: -0.5 }),
    ],
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
