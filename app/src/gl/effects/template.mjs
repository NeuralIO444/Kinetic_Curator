/**
 * GLSL effect authoring template — order:06 (#195). Browser-safe (no Node imports).
 *
 * The contract every effect follows, so the 10 Phase-2 ports stay consistent
 * and effect #11 is a small, mechanical task:
 *
 *   One effect = one fragment shader + one param descriptor.
 *
 * - The vertex shader is shared and fixed (FULL_VS, fullscreen triangle).
 *   Effect authors never write vertex code.
 * - The fragment shader reads `u_tex` and writes its output color. The
 *   bridge owns the ping-pong FBOs and does the swapping — the effect only
 *   transforms input to output, which preserves #185's top-down chain on
 *   the GPU.
 * - Uniform naming: `u_tex` (input, unit 0, bound by the runner), `u_res`
 *   (write-target size in px), `u_time` (seconds; animated effects only),
 *   `u_<param>` (one per declared param, name-matched to the descriptor).
 * - The param descriptor is the JS-side single source of truth: name,
 *   type (float/int/bool/color/vec2), range, default, UI hint. The FX panel
 *   generates controls from it (see controlSpecs) — no hand-built controls
 *   per effect — and the runner auto-uploads uniform values from it.
 * - Precision: `highp float` default in fragment shaders.
 * - No side effects: a shader may not sample any texture except `u_tex`
 *   and may not keep state between frames. Stateful effects
 *   (feedback/accum) go through the Phase-4 path, not this template.
 * - FBO padding: effects that sample outside their pixel (blur, displace)
 *   declare `pad` (pixels) in the descriptor; the bridge sizes the padded
 *   write FBO from it. No per-effect FBO math.
 *
 * Mismatches surface at load: registration runs a static source audit
 * (descriptor param with no matching `uniform` in the shader fails closed)
 * and a runtime uniform audit through the #193 debug harness
 * (declared-but-never-set / set-but-not-declared warnings are recorded,
 * never silent).
 */

import { FULL_VS } from '../shaders.mjs';
import { auditUniforms, diagnosticsLog } from '../debug/diagnostics.mjs';

export const TEMPLATE_VERSION = 1;

/** Shared, fixed vertex shader — every template effect uses this. */
export const TEMPLATE_VS = FULL_VS;

/** Descriptor param type -> bridge uniform kind. */
const PARAM_GLTYPES = {
  float: 'float',
  int: 'int',
  bool: 'int', // uploaded as 0/1
  color: 'vec4', // [r, g, b, a], 0..1
  vec2: 'vec2',
};

const UI_HINTS = new Set(['slider', 'toggle', 'color']);

const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate an effect descriptor; throws a named Error on any violation.
 * @returns the frozen descriptor.
 */
export function validateDescriptor(kind, descriptor) {
  const fail = (why) => {
    throw new Error(`[gl-template] effect "${kind}": invalid descriptor — ${why}`);
  };
  if (!isRecord(descriptor)) fail('descriptor must be an object');
  if (typeof descriptor.label !== 'string' || !descriptor.label) fail('label must be a non-empty string');
  const pad = descriptor.pad ?? 0;
  if (!Number.isInteger(pad) || pad < 0 || pad > 256) fail('pad must be an integer 0..256');
  if (descriptor.animated !== undefined && typeof descriptor.animated !== 'boolean') {
    fail('animated must be a boolean');
  }
  const params = descriptor.params ?? {};
  if (!isRecord(params)) fail('params must be an object');
  for (const [name, p] of Object.entries(params)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) fail(`param "${name}": name must be snake_case`);
    if (!isRecord(p)) fail(`param "${name}": must be an object`);
    if (!PARAM_GLTYPES[p.type]) {
      fail(`param "${name}": unknown type "${p.type}" (float/int/bool/color/vec2)`);
    }
    if (typeof p.label !== 'string' || !p.label) fail(`param "${name}": label must be a non-empty string`);
    if (p.ui !== undefined && !UI_HINTS.has(p.ui)) {
      fail(`param "${name}": unknown ui hint "${p.ui}" (slider/toggle/color)`);
    }
    if (p.type === 'float' || p.type === 'int') {
      for (const k of ['min', 'max', 'def']) {
        if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) fail(`param "${name}": ${k} must be a finite number`);
      }
      if (p.min > p.max) fail(`param "${name}": min > max`);
      if (p.def < p.min || p.def > p.max) fail(`param "${name}": def outside [min, max]`);
      if (p.step !== undefined && (typeof p.step !== 'number' || p.step <= 0)) {
        fail(`param "${name}": step must be a positive number`);
      }
    } else if (p.type === 'bool') {
      if (typeof p.def !== 'boolean') fail(`param "${name}": def must be a boolean`);
    } else if (p.type === 'color') {
      if (!Array.isArray(p.def) || p.def.length !== 4 || p.def.some((c) => typeof c !== 'number' || c < 0 || c > 1)) {
        fail(`param "${name}": def must be [r, g, b, a] with channels 0..1`);
      }
    } else if (p.type === 'vec2') {
      if (!Array.isArray(p.def) || p.def.length !== 2 || p.def.some((c) => typeof c !== 'number' || !Number.isFinite(c))) {
        fail(`param "${name}": def must be [x, y] finite numbers`);
      }
      for (const k of ['min', 'max']) {
        if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) fail(`param "${name}": ${k} must be a finite number`);
      }
      if (p.min > p.max) fail(`param "${name}": min > max`);
    }
  }
  return Object.freeze({
    label: descriptor.label,
    hint: descriptor.hint || '',
    pad,
    animated: !!descriptor.animated,
    params: Object.freeze({ ...params }),
  });
}

/** Default param values from a (validated) descriptor. */
export function defaultParams(descriptor) {
  const out = {};
  for (const [name, p] of Object.entries(descriptor.params)) out[name] = coerceParam(p, p.def);
  return out;
}

function coerceParam(p, v) {
  switch (p.type) {
    case 'float': {
      const n = Number(v);
      const c = Number.isFinite(n) ? n : p.def;
      return Math.min(p.max, Math.max(p.min, c));
    }
    case 'int': {
      const n = Number(v);
      const c = Number.isFinite(n) ? Math.round(n) : p.def;
      return Math.min(p.max, Math.max(p.min, c));
    }
    case 'bool':
      return v === undefined ? p.def : !!v;
    case 'color': {
      if (Array.isArray(v) && v.length === 4) {
        return v.map((c) => Math.min(1, Math.max(0, Number(c) || 0)));
      }
      return p.def.slice();
    }
    case 'vec2': {
      if (Array.isArray(v) && v.length === 2) {
        return v.map((c) => {
          const n = Number.isFinite(Number(c)) ? Number(c) : 0;
          return Math.min(p.max, Math.max(p.min, n));
        });
      }
      return p.def.slice();
    }
    default:
      return v;
  }
}

/**
 * Sanitize caller-supplied params against the descriptor: unknown keys
 * dropped, missing keys defaulted, values clamped/coerced. Mirrors the
 * SVG-side FX param sanitizing (fail-closed rendering, never a crash).
 */
export function sanitizeParams(descriptor, params) {
  const out = {};
  const src = isRecord(params) ? params : {};
  for (const [name, p] of Object.entries(descriptor.params)) {
    out[name] = coerceParam(p, name in src ? src[name] : p.def);
  }
  return out;
}

/** Param value -> uploadable uniform value (bool becomes 0/1). */
function paramToUniform(p, value) {
  const v = coerceParam(p, value);
  if (p.type === 'bool') return v ? 1 : 0;
  if (Array.isArray(v)) return v.slice();
  return v;
}

/**
 * Bridge uniform declarations for a descriptor:
 * `{ u_tex: { kind: 'sampler', unit: 0 }, u_res: { kind: 'vec2' }, ... }`.
 * `u_time` is declared only for animated effects.
 */
export function uniformDecls(descriptor) {
  const decls = {
    u_tex: { kind: 'sampler', unit: 0 },
    u_res: { kind: 'vec2' },
  };
  if (descriptor.animated) decls.u_time = { kind: 'float' };
  for (const [name, p] of Object.entries(descriptor.params)) {
    decls[`u_${name}`] = { kind: PARAM_GLTYPES[p.type] };
  }
  return decls;
}

/** Uniform names the runner uploads for one step: `{ u_tex, u_res, u_time?, u_<param> }`. */
export function uploadUniformsFor(descriptor, { readTex, width, height, time, params }) {
  const clean = sanitizeParams(descriptor, params);
  const out = {
    u_tex: readTex,
    u_res: [width, height],
  };
  if (descriptor.animated) out.u_time = time;
  for (const [name, p] of Object.entries(descriptor.params)) {
    out[`u_${name}`] = paramToUniform(p, clean[name]);
  }
  return out;
}

/**
 * Declarative control specs for the FX panel. The panel renders these
 * with generic controls (slider/toggle/color) — no per-effect UI code.
 * Each spec: { name, type, label, min, max, step, def, ui, hint }.
 */
export function controlSpecs(descriptor) {
  return Object.entries(descriptor.params).map(([name, p]) => ({
    name,
    type: p.type,
    label: p.label,
    min: p.min,
    max: p.max,
    step: p.step ?? (p.type === 'int' ? 1 : 0.01),
    def: Array.isArray(p.def) ? p.def.slice() : p.def,
    ui: p.ui || (p.type === 'bool' ? 'toggle' : p.type === 'color' ? 'color' : 'slider'),
    hint: p.hint || '',
  }));
}

/** `uniform <type> <name>;` declarations in a fragment source. */
const UNIFORM_RE = /uniform\s+(?:sampler2D|samplerCube|float|int|uint|bool|vec2|vec3|vec4|mat2|mat3|mat4)\s+(\w+)\s*;/g;

function declaredUniformNames(fsSource) {
  const names = new Set();
  let m;
  UNIFORM_RE.lastIndex = 0;
  while ((m = UNIFORM_RE.exec(String(fsSource)))) names.add(m[1]);
  return names;
}

function expectedUniformNames(descriptor) {
  const names = new Set(['u_tex', 'u_res']);
  if (descriptor.animated) names.add('u_time');
  for (const name of Object.keys(descriptor.params)) names.add(`u_${name}`);
  return names;
}

/**
 * Static source audit (no GL needed): every name the template will upload
 * must be declared in the shader, and the shader must not declare anything
 * outside the contract (no second texture, no stray state).
 * @returns {{ missingInShader: string[], extraInShader: string[] }}
 */
export function auditEffectSource(fsSource, descriptor) {
  const declared = declaredUniformNames(fsSource);
  const expected = expectedUniformNames(descriptor);
  return {
    missingInShader: [...expected].filter((u) => !declared.has(u)),
    extraInShader: [...declared].filter((u) => !expected.has(u)),
  };
}

const registry = new Map(); // kind -> { descriptor, decls, rec, file, warnings }

/**
 * Register one template effect on a bridge: program `fx/<kind>` from the
 * shared vertex shader + the effect's fragment shader, wired as a single
 * bridge pass whose uniforms come from the descriptor. Zero runner
 * changes per effect — this call is the whole integration.
 *
 * Static audit failures throw (fail closed at load, naming the effect);
 * runtime audit warnings are recorded in the registry + diagnostics log.
 */
export function registerTemplateEffect(bridge, gl, kind, { fs, descriptor, file } = {}) {
  if (registry.has(kind)) throw new Error(`[gl-template] effect "${kind}" is already registered`);
  if (typeof fs !== 'string' || !fs.includes('void main')) {
    throw new Error(`[gl-template] effect "${kind}": fs must be a fragment shader source`);
  }
  const d = validateDescriptor(kind, descriptor);
  const staticAudit = auditEffectSource(fs, d);
  if (staticAudit.missingInShader.length || staticAudit.extraInShader.length) {
    throw new Error(
      `[gl-template] effect "${kind}": uniform audit failed at load — ` +
      `missing in shader: [${staticAudit.missingInShader.join(', ')}]; ` +
      `extra in shader: [${staticAudit.extraInShader.join(', ')}]`
    );
  }
  const decls = uniformDecls(d);
  const programName = `fx/${kind}`;
  const rec = bridge.registerProgram(programName, TEMPLATE_VS, fs, {
    uniforms: decls,
    file: file || `effect:${kind}`,
  });
  bridge.defineEffect(kind, {
    program: programName,
    pad: d.pad,
    passes: [
      {
        uniforms: (step, { read, wTarget, time }) =>
          uploadUniformsFor(d, {
            readTex: read.tex,
            width: wTarget.w,
            height: wTarget.h,
            time,
            params: step.params,
          }),
      },
    ],
  });
  // Runtime audit through the #193 debug harness: catches uniforms the
  // compiler optimized out or names the uploader never set.
  const setNames = Object.keys(uploadUniformsFor(d, {
    readTex: null, width: 1, height: 1, time: 0, params: defaultParams(d),
  }));
  const runtime = auditUniforms(gl, rec.program, setNames);
  const warnings = [];
  if (runtime.neverSet.length) warnings.push(`declared-but-never-set: ${runtime.neverSet.join(', ')}`);
  if (runtime.undeclared.length) warnings.push(`set-but-not-declared: ${runtime.undeclared.join(', ')}`);
  for (const w of warnings) {
    diagnosticsLog.record({ kind: 'template-audit', name: kind, file: file || `effect:${kind}`, ok: false, log: w });
  }
  registry.set(kind, { descriptor: d, decls, rec, file: file || `effect:${kind}`, warnings });
  return d;
}

export function getTemplateEffect(kind) {
  const rec = registry.get(kind);
  if (!rec) throw new Error(`[gl-template] unknown template effect "${kind}"`);
  return rec;
}

export function templateEffectKinds() {
  return [...registry.keys()];
}

/** For tests: drop all registrations. */
export function __clearTemplateRegistry() {
  registry.clear();
}
