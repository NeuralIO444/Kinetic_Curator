/**
 * Compile-time diagnostics — debug harness Layer 1 (#193).
 *
 * Browser-safe (no Node imports). Wraps shader compile / program link so a
 * failure names the effect, the source file, and the line number:
 *
 * - `#line` directives are injected after `#version` so info-log line
 *   numbers map back to the real source file, not a concatenated string.
 * - Uniform audit catches typos (declared-but-never-set /
 *   set-but-not-declared, e.g. `u_amount` vs `u_amout`).
 * - `checkGlError` is the dev-mode loud-failure helper for the FX path:
 *   silent black screens become thrown errors with the GL enum name.
 *
 * All successful compiles/links are recorded in `diagnosticsLog`, which the
 * dev-only Shader Lab panel reads.
 */

const LINE_RE = /ERROR:\s*\d+:(\d+):/;

function parseErrorLine(log) {
  const m = LINE_RE.exec(log || '');
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Insert `#line 1` after the `#version` directive (GLSL requires `#version`
 * to stay first). Without a `#version` line it goes at the top.
 *
 * Note: the filename-string form (`#line 1 "file"`) is rejected by ANGLE,
 * so only the line number is remapped here — the file name travels in the
 * JS-side error object (ShaderCompileError), which is what the Shader Lab
 * panel and logs display.
 */
export function injectLineDirectives(src, file) {
  const lines = String(src).split('\n');
  const out = [];
  let i = 0;
  if (/^\s*#version\b/.test(lines[0] || '')) {
    out.push(lines[0]);
    i = 1;
  }
  out.push('#line 1');
  for (; i < lines.length; i++) out.push(lines[i]);
  return out.join('\n');
}

export class ShaderCompileError extends Error {
  constructor({ name, file, line, log }) {
    super(
      `[gl-debug] shader compile failed: ${name} (${file}${line ? ':' + line : ''})\n${log}`
    );
    this.name = 'ShaderCompileError';
    this.shaderName = name;
    this.file = file;
    this.line = line;
    this.log = log;
  }
}

export class ProgramLinkError extends Error {
  constructor({ name, log }) {
    super(`[gl-debug] program link failed: ${name}\n${log}`);
    this.name = 'ProgramLinkError';
    this.programName = name;
    this.log = log;
  }
}

const GL_ERROR_NAMES = {
  0x0500: 'INVALID_ENUM',
  0x0501: 'INVALID_VALUE',
  0x0502: 'INVALID_OPERATION',
  0x0503: 'STACK_OVERFLOW',
  0x0504: 'STACK_UNDERFLOW',
  0x0505: 'OUT_OF_MEMORY',
  0x0506: 'INVALID_FRAMEBUFFER_OPERATION',
  0x0507: 'CONTEXT_LOST',
};

export class GlError extends Error {
  constructor(code, label) {
    const hex = '0x' + code.toString(16).padStart(4, '0');
    super(`[gl-debug] GL error ${GL_ERROR_NAMES[code] || hex} (${hex}) after ${label}`);
    this.name = 'GlError';
    this.code = code;
    this.label = label;
  }
}

/** Dev-mode loud failure: throws GlError instead of failing silently. */
export function checkGlError(gl, label) {
  const code = gl.getError();
  if (code !== gl.NO_ERROR) throw new GlError(code, label);
  return true;
}

/** In-memory record of compile/link events for the Shader Lab panel. */
export function createDiagnosticsLog(limit = 200) {
  const events = [];
  return {
    record(ev) {
      events.push({ at: new Date().toISOString().slice(11, 19), ...ev });
      if (events.length > limit) events.splice(0, events.length - limit);
    },
    events() {
      return events.slice();
    },
    clear() {
      events.length = 0;
    },
  };
}

export const diagnosticsLog = createDiagnosticsLog();

/**
 * Compile one shader stage with source mapping.
 * @returns {WebGLShader}
 * @throws {ShaderCompileError} names the effect, file, and line.
 */
export function compileShaderChecked(gl, type, src, { name = 'shader', file = 'unknown.glsl' } = {}) {
  const t0 = performance.now();
  const sh = gl.createShader(type);
  gl.shaderSource(sh, injectLineDirectives(src, file));
  gl.compileShader(sh);
  const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS);
  const log = gl.getShaderInfoLog(sh) || '';
  if (!ok) {
    gl.deleteShader(sh);
    throw new ShaderCompileError({ name, file, line: parseErrorLine(log), log });
  }
  diagnosticsLog.record({
    kind: 'compile',
    name,
    file,
    ok: true,
    ms: Math.round((performance.now() - t0) * 100) / 100,
    log: log.trim(),
  });
  return sh;
}

/**
 * Link a program from two checked stages.
 * @returns {WebGLProgram}
 * @throws {ShaderCompileError|ProgramLinkError}
 */
export function linkProgramChecked(gl, vs, fs, { name = 'program' } = {}) {
  const t0 = performance.now();
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  const ok = gl.getProgramParameter(p, gl.LINK_STATUS);
  const log = gl.getProgramInfoLog(p) || '';
  if (!ok) {
    gl.deleteProgram(p);
    throw new ProgramLinkError({ name, log });
  }
  diagnosticsLog.record({
    kind: 'link',
    name,
    ok: true,
    ms: Math.round((performance.now() - t0) * 100) / 100,
    log: log.trim(),
  });
  return p;
}

/** Compile + link in one call (shaders are deleted after a successful link). */
export function buildProgramChecked(
  gl,
  vsSrc,
  fsSrc,
  { name = 'program', vsFile, fsFile } = {}
) {
  const vs = compileShaderChecked(gl, gl.VERTEX_SHADER, vsSrc, {
    name: `${name}:vs`,
    file: vsFile || `${name}.vs.glsl`,
  });
  let fs = null;
  try {
    fs = compileShaderChecked(gl, gl.FRAGMENT_SHADER, fsSrc, {
      name: `${name}:fs`,
      file: fsFile || `${name}.fs.glsl`,
    });
  } catch (e) {
    gl.deleteShader(vs);
    throw e;
  }
  const p = linkProgramChecked(gl, vs, fs, { name });
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

/** Active uniform names for a linked program (`[0]` suffix stripped). */
export function getActiveUniformNames(gl, program) {
  const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  const names = [];
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) names.push(info.name.replace(/\[0\]$/, ''));
  }
  return names;
}

/**
 * Uniform audit: which declared uniforms were never set, and which set
 * names were never declared (typo detector).
 * @param {string[]} setNames — uniform names the renderer actually set.
 * @returns {{neverSet: string[], undeclared: string[]}}
 */
export function auditUniforms(gl, program, setNames) {
  const declared = new Set(getActiveUniformNames(gl, program));
  const set = new Set(setNames || []);
  return {
    neverSet: [...declared].filter((u) => !set.has(u)),
    undeclared: [...set].filter((u) => !declared.has(u)),
  };
}
