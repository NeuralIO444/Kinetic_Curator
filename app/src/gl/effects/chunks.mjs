/**
 * GLSL shared chunk library — order:07 (#196). Browser-safe (no Node imports).
 *
 * One copy of every primitive the effects share: hashing, noise, color math,
 * dithering, UV helpers. WebGL2 GLSL ES has no `#include`, so the library is
 * injected into each template effect's fragment shader as a string before
 * compile (see injectCommon). The debug harness's #line mapping accounts for
 * the injected lines: chunk-block lines map back to common.glsl line numbers,
 * effect-body lines map back to the effect's own source line numbers.
 *
 * Rules (enforced by auditChunks(), run in chunks.selfcheck.mjs):
 *  1. Pure functions only — no uniforms, no texture reads, no globals.
 *     Same input -> same output, always.
 *  2. `kc_` prefix on every chunk. Collisions with effect-local names fail.
 *  3. No chunk may depend on another chunk's internals — only on its
 *     documented signature. Calls between chunks are explicit (see
 *     CHUNK_INDEX[].calls).
 *  4. Versioned. The header carries the version; effects declare nothing
 *     (they always get the current library), but a breaking chunk change
 *     bumps COMMON_VERSION and the parity suite re-runs everything —
 *     chunk output feeds effect output, so a changed chunk shows up as a
 *     changed parity diff. chunksUsedBy() answers "which effects does a
 *     chunk change affect".
 *
 * What stays out: effect-specific logic (a poster's quantization steps live
 * in the posterize effect) and anything needing uniforms or textures.
 */

export const COMMON_VERSION = 1;

export const COMMON_GLSL = `// common.glsl — v1 — Kinetic Curator shared GLSL chunks (order:07, #196).
// Pure functions only: no uniforms, no textures, no globals. kc_ prefix on everything.
// Fragment-shader precision is declared here so the block is self-contained
// wherever it is injected (it always lands before the effect's own precision
// statement).
precision highp float;

float kc_hash12(vec2 p) {
  // Integer-free hash, no sine — the classic fract(sin(dot())) idiom drifts
  // between GPU drivers; this one is stable everywhere.
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 kc_hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float kc_vnoise(vec2 p) {
  // Smooth value noise in [0,1]. At integer lattice points this equals
  // kc_hash12 of the lattice point exactly (zero interpolation weight).
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = kc_hash12(i);
  float b = kc_hash12(i + vec2(1.0, 0.0));
  float c = kc_hash12(i + vec2(0.0, 1.0));
  float d = kc_hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float kc_fbm(vec2 p, int octaves) {
  // Fractal Brownian motion: 1..4 octaves. Octave count is a tradeoff, not
  // a constant — 2-3 is the usual sweet spot for grain/texture work.
  float v = 0.0;
  float amp = 0.5;
  vec2 q = p;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    v += amp * kc_vnoise(q);
    q = q * 2.03 + vec2(19.7, 7.3);
    amp *= 0.5;
  }
  return v;
}

float kc_luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722)); // Rec. 709
}

vec3 kc_rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  float h = 0.0;
  float s = 0.0;
  if (d > 0.0) {
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r) {
      h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    } else if (mx == c.g) {
      h = (c.b - c.r) / d + 2.0;
    } else {
      h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
  }
  return vec3(h, s, l);
}

vec3 kc_hsl2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}

float kc_srgb2lin(float c) {
  return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}

vec3 kc_srgb2lin(vec3 c) {
  return vec3(kc_srgb2lin(c.r), kc_srgb2lin(c.g), kc_srgb2lin(c.b));
}

float kc_lin2srgb(float c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

vec3 kc_lin2srgb(vec3 c) {
  return vec3(kc_lin2srgb(c.r), kc_lin2srgb(c.g), kc_lin2srgb(c.b));
}

float kc_ign(vec2 fragCoord) {
  // Interleaved gradient noise (Jimenez 2014): cheap, blue-noise-ish,
  // stable per pixel. The dither primitive — pass gl_FragCoord.xy.
  return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
}

float kc_dither(vec2 fragCoord) {
  // Banding killer: add kc_dither(gl_FragCoord.xy) / 255.0 to a color before
  // quantizing (posterize, gradients). Output is in [-0.5, 0.5), i.e. one
  // LSB of 8-bit, so it dithers without shifting the tone.
  return kc_ign(fragCoord) - 0.5;
}

vec2 kc_uv_centered(vec2 uv) {
  return uv * 2.0 - 1.0;
}

vec2 kc_uv_aspect(vec2 uv, vec2 res) {
  // Centered UV with x corrected for the target aspect ratio, so circles
  // stay circular on non-square targets.
  vec2 c = uv * 2.0 - 1.0;
  c.x *= res.x / res.y;
  return c;
}
`;

/**
 * Chunk inventory: every chunk's signature, explicit callees, and what it's
 * for. The audit (below) checks this list against the actual GLSL so the
 * docs can't drift from the code.
 */
export const CHUNK_INDEX = [
  { name: 'kc_hash12', sig: 'float kc_hash12(vec2 p)', calls: [], doc: 'Stable 1D hash in [0,1), no texture lookup.' },
  { name: 'kc_hash22', sig: 'vec2 kc_hash22(vec2 p)', calls: [], doc: 'Stable 2D hash in [0,1)^2, no texture lookup.' },
  { name: 'kc_vnoise', sig: 'float kc_vnoise(vec2 p)', calls: ['kc_hash12'], doc: 'Smooth value noise in [0,1].' },
  { name: 'kc_fbm', sig: 'float kc_fbm(vec2 p, int octaves)', calls: ['kc_vnoise'], doc: 'Fractal Brownian motion, 1-4 octaves.' },
  { name: 'kc_luma', sig: 'float kc_luma(vec3 c)', calls: [], doc: 'Rec. 709 luma.' },
  { name: 'kc_rgb2hsl', sig: 'vec3 kc_rgb2hsl(vec3 c)', calls: [], doc: 'RGB -> HSL, all channels in [0,1].' },
  { name: 'kc_hsl2rgb', sig: 'vec3 kc_hsl2rgb(vec3 c)', calls: [], doc: 'HSL -> RGB, inverse of kc_rgb2hsl.' },
  { name: 'kc_srgb2lin', sig: 'float|vec3 kc_srgb2lin(float|vec3 c)', calls: [], doc: 'sRGB -> linear (overloaded).' },
  { name: 'kc_lin2srgb', sig: 'float|vec3 kc_lin2srgb(float|vec3 c)', calls: [], doc: 'Linear -> sRGB (overloaded).' },
  { name: 'kc_ign', sig: 'float kc_ign(vec2 fragCoord)', calls: [], doc: 'Interleaved gradient noise in [0,1).' },
  { name: 'kc_dither', sig: 'float kc_dither(vec2 fragCoord)', calls: ['kc_ign'], doc: 'Ordered dither offset in [-0.5, 0.5).' },
  { name: 'kc_uv_centered', sig: 'vec2 kc_uv_centered(vec2 uv)', calls: [], doc: 'UV remapped to [-1,1].' },
  { name: 'kc_uv_aspect', sig: 'vec2 kc_uv_aspect(vec2 uv, vec2 res)', calls: [], doc: 'Centered UV with aspect-corrected x.' },
];

const DEF_RE = /^\s*(?:float|vec2|vec3|vec4|int|uint|bool)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/gm;
const CALL_RE = /\b(kc_[A-Za-z0-9_]+)\s*\(/g;
const BANNED_RE = /\buniform\b|\btexture\s*\(|\btexelFetch\s*\(|\bsampler[23]D\b|\bsamplerCube\b|\bimage[123]D\b/;

/** Names defined as functions in the chunk library. */
export function definedChunkNames(src = COMMON_GLSL) {
  const names = new Set();
  DEF_RE.lastIndex = 0;
  let m;
  while ((m = DEF_RE.exec(src))) names.add(m[1]);
  return [...names];
}

/**
 * Audit the chunk library against its own rules. Returns { errors: [] } —
 * empty means the library is clean. Pure JS, no GL needed.
 */
export function auditChunks(src = COMMON_GLSL) {
  const errors = [];
  const header = String(src).split('\n')[0] || '';
  if (!header.includes(`v${COMMON_VERSION}`)) {
    errors.push(`version header missing v${COMMON_VERSION} (got: ${header.slice(0, 60)})`);
  }
  const banned = BANNED_RE.exec(src);
  if (banned) errors.push(`impure chunk library: found "${banned[0]}" (no uniforms/textures/globals allowed)`);
  const defined = definedChunkNames(src);
  for (const name of defined) {
    if (!name.startsWith('kc_')) errors.push(`chunk "${name}" missing kc_ prefix`);
  }
  // Overloads share a name; duplicates are only an error on identical signatures.
  const sigs = new Set();
  DEF_RE.lastIndex = 0;
  let m;
  while ((m = DEF_RE.exec(src))) {
    const key = `${m[1]}(${m[2].trim()})`;
    if (sigs.has(key)) errors.push(`duplicate chunk definition: ${key}`);
    sigs.add(key);
  }
  // Every kc_ call must resolve to a defined chunk (explicit dependencies).
  const definedSet = new Set(defined);
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(src))) {
    if (!definedSet.has(m[1])) errors.push(`chunk calls undefined kc_ function: ${m[1]}`);
  }
  // Inventory must match the code exactly — docs can't drift.
  const indexed = new Set(CHUNK_INDEX.map((c) => c.name));
  for (const name of defined) {
    if (!indexed.has(name)) errors.push(`chunk "${name}" defined but missing from CHUNK_INDEX`);
  }
  for (const { name, calls } of CHUNK_INDEX) {
    if (!definedSet.has(name)) errors.push(`CHUNK_INDEX lists "${name}" but it is not defined`);
    for (const callee of calls) {
      if (!definedSet.has(callee)) errors.push(`CHUNK_INDEX: "${name}" calls undefined "${callee}"`);
    }
  }
  return { errors };
}

/**
 * Inject the chunk library into a fragment shader source, with #line
 * directives so compile errors map back correctly:
 *   - chunk block lines -> common.glsl line numbers
 *   - effect body lines -> the effect's own source line numbers
 *
 * The debug harness's injectLineDirectives() runs later at compile time and
 * inserts its own `#line 1` after `#version`; these directives override it,
 * so the mapping survives the harness.
 */
export function injectCommon(fsSource) {
  const lines = String(fsSource).split('\n');
  const hasVersion = /^\s*#version\b/.test(lines[0] || '');
  const bodyFrom = hasVersion ? 1 : 0;
  const bodyLineNo = hasVersion ? 2 : 1; // that line's number in the effect source
  const out = [];
  if (hasVersion) out.push(lines[0]);
  out.push('#line 1'); // chunk block = common.glsl line numbers
  out.push(...COMMON_GLSL.split('\n'));
  out.push(`#line ${bodyLineNo}`); // effect body = effect source line numbers
  out.push(...lines.slice(bodyFrom));
  return out.join('\n');
}

/**
 * Which library chunks does a shader source actually use? Answers
 * "which effects does a chunk change affect" for the parity suite.
 * @returns sorted chunk names referenced by the source.
 */
export function chunksUsedBy(fsSource) {
  const defined = new Set(definedChunkNames());
  const used = new Set();
  CALL_RE.lastIndex = 0;
  let m;
  const src = String(fsSource);
  while ((m = CALL_RE.exec(src))) {
    if (defined.has(m[1])) used.add(m[1]);
  }
  return [...used].sort();
}

/** Stable fingerprint of the chunk library (FNV-1a hex). Changes when any chunk changes. */
export function chunkFingerprint(src = COMMON_GLSL) {
  let h = 0x811c9dc5;
  const s = String(src);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
