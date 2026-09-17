/**
 * In-page assertions for the GL debug harness (#193).
 * Runs in headless Chromium via selfcheck.html; results are collected
 * (never thrown mid-suite) and reported back to debug.selfcheck.mjs.
 */
import {
  injectLineDirectives,
  compileShaderChecked,
  buildProgramChecked,
  auditUniforms,
  auditProgramChecked,
  checkGlError,
  diagnosticsLog,
  ShaderCompileError,
} from './diagnostics.mjs';
import { createFlagPass } from './flagPass.mjs';
import {
  packStripValues,
  unpackStripPixels,
  createStripTarget,
  writeStrip,
  readStrip,
  disposeStripTarget,
  formatStripTable,
} from './debugStrip.mjs';
import { createGpuTimer } from './gpuTimer.mjs';
import { createTapRecorder } from './tapPoints.mjs';
import {
  COMMON_VERSION,
  auditChunks,
  injectCommon,
  chunksUsedBy,
} from '../effects/chunks.mjs';
import { refHash12, refVnoise } from '../effects/chunkReference.mjs';
// Shipped-shader coverage (#193 second pass): every program the app
// compiles goes through the checked builders + uniform audit here, so a
// compile/link/audit regression fails the suite with the effect, file,
// and line on the failure.
import { RENDERER_PROGRAMS } from '../renderer.mjs';
import { ACCUM_PROGRAMS } from '../accum.mjs';
import { UNIFORMS as BUILTIN_EFFECT_UNIFORMS } from '../bridge/builtinEffects.mjs';
import { FULL_VS, EFFECT_FS } from '../shaders.mjs';
import { FX_SHADER_EFFECTS } from '../effects/fxShaders.mjs';
import { TEMPLATE_VS, uniformDecls } from '../effects/template.mjs';
import { runAllSweeps } from './sweepEffects.mjs';
import {
  createCostMeasurer,
  MEASURE_W, MEASURE_H, MEASURE_WARMUP, MEASURE_BATCH_DRAWS, MEASURE_BATCHES,
} from './measureCosts.mjs';

const failures = [];
const lines = [];

function log(name, fn) {
  try {
    fn();
    lines.push(`  [ok] ${name}`);
  } catch (e) {
    failures.push(name);
    lines.push(`  [FAIL] ${name}: ${(e && e.message) || e}`);
  }
}

function eq(a, b, msg) {
  if (!Object.is(a, b)) throw new Error(`${msg}: got ${String(a)}, want ${String(b)}`);
}

function near(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg}: got ${a}, want ${b} ±${tol}`);
}

function throwsAs(fn, Cls, msg) {
  try {
    fn();
  } catch (e) {
    if (e instanceof Cls) return e;
    throw new Error(`${msg}: wrong error type ${e && e.constructor && e.constructor.name}: ${e && e.message}`);
  }
  throw new Error(`${msg}: did not throw`);
}

const SIMPLE_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
const SIMPLE_FS = `#version 300 es
precision highp float;
out vec4 o_color;
void main() { o_color = vec4(1.0); }
`;

function makeTex2x2(gl) {
  // Row 0: mid-gray, NaN-red. Row 1: overbright, dim.
  const data = new Float32Array([
    0.5, 0.5, 0.5, 0.5, NaN, 0, 0, 1,
    2.0, 0.5, 0.5, 1, 0.1, 0.2, 0.3, 0.4,
  ]);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 2, 2, 0, gl.RGBA, gl.FLOAT, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function makeTarget2x2(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb };
}

function readFB(gl, w, h) {
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px;
}

export function runAll() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 unavailable in selfcheck page');

  // ---- diagnostics ----
  log('diagnostics: #line goes after #version', () => {
    const out = injectLineDirectives('#version 300 es\nvoid main() {}', 'a.glsl');
    eq(out.startsWith('#version 300 es\n#line 1'), true, 'version stays first');
  });
  log('diagnostics: #line prepended without #version', () => {
    const out = injectLineDirectives('void main() {}', 'b.glsl');
    eq(out.startsWith('#line 1'), true, 'line directive first');
  });
  log('diagnostics: valid shader compiles', () => {
    const sh = compileShaderChecked(gl, gl.VERTEX_SHADER, SIMPLE_VS, { name: 'simple', file: 'simple.glsl' });
    eq(!!sh, true, 'shader handle');
    gl.deleteShader(sh);
  });
  log('diagnostics: broken shader names effect, file, line', () => {
    const bad = '#version 300 es\nprecision highp float;\nvoid main() { gl_Position = ; }\n';
    const e = throwsAs(
      () => compileShaderChecked(gl, gl.FRAGMENT_SHADER, bad, { name: 'brokenFx', file: 'broken.glsl' }),
      ShaderCompileError,
      'compile'
    );
    eq(e.shaderName, 'brokenFx', 'effect name');
    eq(e.file, 'broken.glsl', 'file');
    eq(typeof e.line === 'number' && e.line >= 1, true, `line parsed (got ${e.line})`);
    eq(/broken\.glsl/.test(e.message), true, 'message names the file');
  });
  log('diagnostics: link ok + recorded in diagnostics log', () => {
    diagnosticsLog.clear();
    const p = buildProgramChecked(gl, SIMPLE_VS, SIMPLE_FS, { name: 'simpleProg' });
    eq(!!p, true, 'program handle');
    const kinds = diagnosticsLog.events().map((e) => e.kind);
    eq(kinds.includes('compile') && kinds.includes('link'), true, 'compile+link recorded');
    gl.deleteProgram(p);
  });
  log('diagnostics: uniform audit catches typos', () => {
    const fs = `#version 300 es
precision highp float;
uniform float u_a;
uniform float u_b;
out vec4 o_color;
void main() { o_color = vec4(u_a + u_b, 0.0, 0.0, 1.0); }
`;
    const p = buildProgramChecked(gl, SIMPLE_VS, fs, { name: 'auditProg' });
    const r = auditUniforms(gl, p, ['u_a', 'u_typo']);
    eq(JSON.stringify(r.neverSet), JSON.stringify(['u_b']), 'neverSet');
    eq(JSON.stringify(r.undeclared), JSON.stringify(['u_typo']), 'undeclared');
    gl.deleteProgram(p);
  });
  log('diagnostics: checkGlError is loud, not silent', () => {
    gl.enable(0xdeadbeef); // invalid enum -> INVALID_ENUM queued
    const e = throwsAs(() => checkGlError(gl, 'test-label'), Error, 'checkGlError');
    eq(/INVALID_ENUM/.test(e.message) && /test-label/.test(e.message), true, 'names enum + label');
  });

  // ---- flagPass ----
  log('flagPass: NaN pixels painted magenta', () => {
    const fp = createFlagPass(gl);
    const tex = makeTex2x2(gl);
    const t = makeTarget2x2(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    fp.render(tex, 'nan', 2, 2);
    const px = readFB(gl, 2, 2);
    near(px[0], 0, 1, 'finite px r'); eq(px[3], 255, 'finite px a');
    near(px[4], 255, 1, 'nan px r'); near(px[5], 0, 1, 'nan px g'); near(px[6], 255, 1, 'nan px b');
    fp.dispose(); gl.deleteTexture(tex); gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb);
  });
  log('flagPass: alpha view shows alpha as red', () => {
    const fp = createFlagPass(gl);
    const tex = makeTex2x2(gl);
    const t = makeTarget2x2(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    fp.render(tex, 'alpha', 2, 2);
    const px = readFB(gl, 2, 2);
    // row1[1] = (0.1,0.2,0.3,0.4) -> bytes 12..15
    near(px[12], 0.4 * 255, 1.5, 'alpha->red'); eq(px[13], 0, 'g'); eq(px[14], 0, 'b');
    fp.dispose(); gl.deleteTexture(tex); gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb);
  });
  log('flagPass: range view flags out-of-[0,1]', () => {
    const fp = createFlagPass(gl);
    const tex = makeTex2x2(gl);
    const t = makeTarget2x2(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    fp.render(tex, 'range', 2, 2);
    const px = readFB(gl, 2, 2);
    // row1[0] = (2.0,...) -> bytes 8..11 magenta
    near(px[8], 255, 1, 'oor r'); near(px[10], 255, 1, 'oor b');
    // row0[0] = (0.5,0.5,0.5,0.5) -> passed through
    near(px[0], 128, 2, 'in-range r'); near(px[3], 128, 2, 'in-range a');
    fp.dispose(); gl.deleteTexture(tex); gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb);
  });
  log('flagPass: luminance heat ramp is monotonic', () => {
    const fp = createFlagPass(gl);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 2, 1, 0, gl.RGBA, gl.FLOAT,
      new Float32Array([1, 1, 1, 1, 0, 0, 0, 1]));
    gl.bindTexture(gl.TEXTURE_2D, null);
    const t = makeTarget2x2(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, 2, 1);
    fp.render(tex, 'luminance', 2, 1);
    const px = readFB(gl, 2, 1);
    eq(px[0] > 200 && px[2] < 80, true, `white is hot (r=${px[0]},b=${px[2]})`);
    eq(px[6] > 200 && px[4] < 80, true, `black is cold (r=${px[4]},b=${px[6]})`);
    fp.dispose(); gl.deleteTexture(tex); gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb);
  });

  // ---- debugStrip ----
  log('debugStrip: float32 bit-exact round-trip incl. -0/NaN/Inf', () => {
    const vals = [0, 1, -1, 0.5, -2.5, 3.14159265, 1e10, 1e-10, -0, Infinity, -Infinity, NaN];
    const back = unpackStripPixels(packStripValues(vals));
    eq(back.length, vals.length, 'length');
    for (let i = 0; i < vals.length; i++) {
      if (Number.isNaN(vals[i])) eq(Number.isNaN(back[i]), true, `NaN at ${i}`);
      else eq(Object.is(back[i], Math.fround(vals[i])), true, `exact at ${i}`);
    }
  });
  log('debugStrip: GPU write/read round-trip', () => {
    const target = createStripTarget(gl, 4);
    const vals = [1.5, -2.5, 0.25, 1000000];
    writeStrip(gl, target, vals);
    const back = readStrip(gl, target);
    for (let i = 0; i < vals.length; i++) eq(Object.is(back[i], vals[i]), true, `strip[${i}]`);
    disposeStripTarget(gl, target);
  });
  log('debugStrip: table formats labels + values', () => {
    const s = formatStripTable(['u_amount', 'iterations'], [0.5, 16]);
    eq(s.includes('u_amount') && s.includes('0.5') && s.includes('16'), true, 'table content');
  });

  // ---- gpuTimer ----
  log('gpuTimer: begin/end/poll reports a timing', () => {
    const t = createGpuTimer(gl);
    eq(typeof t.isHardware, 'boolean', 'isHardware flag');
    t.begin('probe');
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    t.end('probe');
    let r = null;
    for (let i = 0; i < 240; i++) {
      r = t.poll();
      if (r.done) break;
    }
    eq(!!r && r.done, true, 'poll completes');
    eq(typeof r.disjoint, 'boolean', 'disjoint flag');
    if (!r.disjoint) {
      const ms = r.timings.get('probe');
      eq(typeof ms === 'number' && ms >= 0, true, `timing value (${ms})`);
    }
  });
  log('gpuTimer: end without begin throws', () => {
    const t = createGpuTimer(gl);
    throwsAs(() => t.end('nope'), Error, 'end w/o begin');
  });

  // ---- tapPoints ----
  log('tapPoints: captures named stages 1:1', () => {
    const rec = createTapRecorder(gl);
    const t = makeTarget2x2(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, 2, 2);
    gl.clearColor(0.2, 0.4, 0.6, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const a = rec.tap('stage-a', 2, 2);
    const b = rec.tap('stage-b', 2, 2);
    eq(a.name, 'stage-a', 'name a'); eq(b.w, 2, 'width');
    near(a.pixels[0], 0.2 * 255, 1.5, 'r'); near(a.pixels[1], 0.4 * 255, 1.5, 'g');
    near(a.pixels[2], 0.6 * 255, 1.5, 'b'); eq(a.pixels[3], 255, 'a');
    eq(rec.getTaps().map((x) => x.name).join(','), 'stage-a,stage-b', 'order');
    rec.clear();
    eq(rec.getTaps().length, 0, 'clear');
    gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb);
  });

  // ---- chunk library (#196) ----
  log('chunks: library audits clean', () => {
    eq(auditChunks().errors.length, 0, 'no audit errors');
    eq(COMMON_VERSION, 1, 'version');
  });
  log('chunks: injection keeps #line mapping for chunks and effect body', () => {
    const lines = injectCommon('#version 300 es\nprecision highp float;\nvoid main() {}\n').split('\n');
    eq(lines[0], '#version 300 es', 'version first');
    eq(lines[1], '#line 1', 'chunk block -> common.glsl lines');
    const marker = lines.findIndex((l, i) => i > 2 && l.startsWith('#line '));
    eq(lines[marker], '#line 2', 'effect body -> effect source lines');
    eq(lines[marker + 1], 'precision highp float;', 'body intact');
  });
  const renderChunk = (expr) => {
    const fs = injectCommon(`#version 300 es
precision highp float;
out vec4 o;
void main() {
  vec2 p = gl_FragCoord.xy;
  o = ${expr};
}
`);
    const prog = buildProgramChecked(gl, SIMPLE_VS, fs, { name: 'chunk-probe' });
    const W = 8, H = 8;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, W, H);
    gl.useProgram(prog);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.deleteBuffer(vbo);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    gl.deleteProgram(prog);
    return px;
  };
  log('chunks: injected library compiles through the harness', () => {
    // A successful renderChunk already proves compile+link; this one is the
    // explicit syntax gate with the harness's diagnostics attached.
    const fs = injectCommon('#version 300 es\nprecision highp float;\nout vec4 o;\nvoid main() { o = vec4(kc_fbm(vec2(1.0), 3)); }\n');
    const sh = compileShaderChecked(gl, gl.FRAGMENT_SHADER, fs, { name: 'chunk-syntax', file: 'common.glsl' });
    eq(!!sh, true, 'chunk block compiles');
    gl.deleteShader(sh);
  });
  log('chunks: kc_hash12 renders like the CPU reference', () => {
    const px = renderChunk('vec4(kc_hash12(p), 0.0, 0.0, 1.0)');
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        near(px[(j * 8 + i) * 4] / 255, refHash12(i + 0.5, j + 0.5), 0.02, `hash12 ${i},${j}`);
      }
    }
  });
  log('chunks: kc_vnoise (calls kc_hash12) renders like the CPU reference', () => {
    const px = renderChunk('vec4(kc_vnoise(p * 0.35), 0.0, 0.0, 1.0)');
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        near(px[(j * 8 + i) * 4] / 255, refVnoise((i + 0.5) * 0.35, (j + 0.5) * 0.35), 0.02, `vnoise ${i},${j}`);
      }
    }
  });
  log('chunks: chunksUsedBy tracks chunk -> effect dependencies', () => {
    eq(
      chunksUsedBy('void main() { o = vec4(kc_dither(p), kc_vnoise(p), 0.0, 1.0); }').join(','),
      'kc_dither,kc_vnoise',
      'direct chunk uses'
    );
    eq(chunksUsedBy('void main() {}').length, 0, 'no chunk uses');
  });

  // ---- shipped shader coverage (#193 second pass) ----
  // Every program the app ships: compile + link through the checked
  // builders, then the uniform audit against the same upload lists
  // production uses (RENDERER_PROGRAMS / ACCUM_PROGRAMS / the bridge's
  // declared uniform sets). A failure throws with the effect, file, and
  // line — the log() wrapper records it as a failed case.
  for (const def of RENDERER_PROGRAMS) {
    log(`coverage: renderer/${def.name} compiles + audits clean`, () => {
      const p = buildProgramChecked(gl, def.vs, def.fs, {
        name: `coverage-${def.name}`, vsFile: def.vsFile, fsFile: def.fsFile,
      });
      try {
        auditProgramChecked(gl, p, def.uniforms, { name: `coverage-${def.name}`, file: 'shaders.mjs' });
      } finally {
        gl.deleteProgram(p);
      }
    });
  }
  for (const [pname, def] of Object.entries(ACCUM_PROGRAMS)) {
    log(`coverage: accum-${pname} compiles + audits clean`, () => {
      const p = buildProgramChecked(gl, FULL_VS, def.fs, {
        name: `accum-${pname}`, vsFile: 'accum.mjs:FULL_VS', fsFile: def.file,
      });
      try {
        auditProgramChecked(gl, p, def.uniforms, { name: `accum-${pname}`, file: def.file });
      } finally {
        gl.deleteProgram(p);
      }
    });
  }
  log('coverage: bridge builtin effect program compiles + audits clean', () => {
    const p = buildProgramChecked(gl, FULL_VS, EFFECT_FS, {
      name: 'effect', vsFile: 'shaders.mjs:FULL_VS', fsFile: 'shaders.mjs:EFFECT_FS',
    });
    try {
      auditProgramChecked(gl, p, Object.keys(BUILTIN_EFFECT_UNIFORMS), {
        name: 'effect', file: 'shaders.mjs:EFFECT_FS',
      });
    } finally {
      gl.deleteProgram(p);
    }
  });
  for (const [kind, def] of FX_SHADER_EFFECTS) {
    log(`coverage: fx/${kind} compiles + audits clean`, () => {
      const p = buildProgramChecked(gl, TEMPLATE_VS, injectCommon(def.fs), {
        name: `fx/${kind}`, vsFile: 'template.mjs:TEMPLATE_VS', fsFile: def.file,
      });
      try {
        auditProgramChecked(gl, p, Object.keys(uniformDecls(def.descriptor)), {
          name: `fx/${kind}`, file: def.file,
        });
      } finally {
        gl.deleteProgram(p);
      }
    });
  }
  log('coverage: flagPass compiles + audits clean', () => {
    // createFlagPass builds through buildProgramChecked + the checked
    // audit internally — constructing it here exercises both.
    const fp = createFlagPass(gl);
    fp.dispose();
  });

  // ---- uniform sweeps (backend hardening 1/6) ----
  {
    const sweep = runSweepsOn(gl);
    for (const line of sweep.lines) lines.push(line);
    for (const f of sweep.failures) failures.push(f);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { lines, failures };
}

/**
 * The uniform-sweep section on its own, for focused runs
 * (`npm run selfcheck:sweep`). Same code path as the full suite's tail.
 */
export function runSweepSection() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  return runSweepsOn(gl);
}

/** Sweep section on an existing context (used by runAll's tail). */
function runSweepsOn(gl) {
  const lines = [];
  const failures = [];
  // Per-effect parameter sweeps: normal/zero/max/boundary (contract cases,
  // asserted) plus negative/extreme (hostile cases, characterized). Each
  // effect renders through the checked builders into a float target and is
  // scanned with the flag views: no NaN/Inf, in-[0,1] output, and
  // parameter-zero provably a no-op. A WebGL2-less environment prints the
  // loud skip inside runAllSweeps instead of failing.
  try {
    const sweep = runAllSweeps(gl);
    for (const line of sweep.lines) lines.push(line);
    for (const f of sweep.failures) failures.push(f);
  } catch (e) {
    failures.push('sweep-harness');
    lines.push(`  [FAIL] sweep harness threw: ${(e && e.message) || e}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { lines, failures };
}

/**
 * The GPU-cost measurement section on its own (`npm run measure-costs`,
 * ?only=measure). Builds the measurer and parks it on window for the node
 * driver (costTiers.measure.mjs), which wall-times each batch itself —
 * headless Chromium's in-page clock does not advance across blocking GL
 * calls, so the page cannot time itself there. Never asserts: measurement
 * is data; the declaration-vs-measured gate is costTiers.selfcheck.mjs.
 */
export function runMeasureSection() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  const measurer = createCostMeasurer(gl);
  window.__kcMeasure = {
    ids: measurer.ids,
    hwTimer: measurer.hwTimer,
    caseName: (id) => measurer.caseName(id),
    warmup: (id) => measurer.warmup(id),
    runBatch: (id, draws) => measurer.runBatch(id, draws),
    dispose: () => measurer.dispose(),
  };
  window.__kcMeasureReady = true;
  const lines = [
    `measure: ${measurer.ids.length} effects ready @${MEASURE_W}x${MEASURE_H} ` +
    `(warmup ${MEASURE_WARMUP}, ${MEASURE_BATCHES} batches x ${MEASURE_BATCH_DRAWS} draws, ` +
    `${measurer.hwTimer ? 'hardware' : 'node wall-time'} timing)`,
  ];
  return { lines };
}
