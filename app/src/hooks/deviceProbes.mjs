// deviceProbes — runtime device probe descriptors for the governor cost
// head (#1578, T4). Four tiny self-run microbenchmarks at first launch —
// fill rate, instanced draw, blend, JS — whose measured times become the
// `probe.` feature bag costHead.mjs consumes ({ fillRate, instanced,
// blend, js }, milliseconds; see costFeatures / predictMs there).
//
// WHY probes, not device names (issue #1578, FTRF precedent): a descriptor
// measured on THIS device prices an unseen device too, and re-measuring
// absorbs driver drift. The work is the fixed PROBE_SPEC in
// src/gl/parity/costDataset.mjs — the same numbers the bench page
// (costBench.html __kcProbes) runs, so harness labels and runtime features
// stay comparable. The spec values are duplicated here on purpose (the
// house convention: costBench.html duplicates them too, so no page or
// module needs a build step to agree); deviceProbes.selfcheck.mjs pins
// this copy against PROBE_SPEC so the copies cannot drift apart.
//
// HONEST SIGNALS (KC-1 design law — the hard requirement of this slice):
// a probe that fails, times out, or cannot run yields NO descriptor —
// the key is absent, never a guessed/default number. (costHead.mjs's
// runDeviceProbes() placeholder returns neutral 1.0s; this module exists
// precisely to replace that fiction, but wiring it in is the prime
// call-site slice, not this one — nothing here is called by the live
// loop, and an absent key makes predictMs fall back to static tiers.)
//
// Timing discipline (costBench.mjs / costDataset.mjs, unchanged): every
// GPU batch ends in readPixels so the work completes inside the timed
// window (nothing is vsync-censored — no rAF anywhere), 1 warm-up batch
// is discarded (clocks ramp, programs compile), and the reported number
// is the MEDIAN of 5 timed batches.
//
// Budget: the whole measurement pass is capped at PROBE_TIME_BUDGET_MS
// of wall clock, checked between probes; a probe that would start past
// the budget is skipped (absent), never rushed with fewer reps — a
// cheaper measurement would not be the PROBE_SPEC work and would poison
// comparability. A single in-flight batch cannot be interrupted; the
// spec's batches are small by construction (worst observed total on
// weak mobile GPUs is ~1-1.5 s, dominated by the fill probe).
//
// Cache: the descriptor bag persists in localStorage under
// kc:device-probes:v1 (the app's kc:<name>:v1 convention, injectable
// storage backend like curator/diceCrowns.js) so probes run at first
// launch, not every load. The stored record carries DEVICE_PROBES_VERSION;
// a version mismatch is a cache miss and re-measures. Only bags with at
// least one measured descriptor are cached — a total failure (e.g. no
// WebGL2 at all) is retried next launch rather than frozen. A missing
// key inside a cached bag stays missing until the version bumps: the
// version key is the invalidation mechanism, by design.

/** The runtime bag keys, in PROBE_SPEC order. */
export const PROBE_KEYS = Object.freeze(['fillRate', 'instanced', 'blend', 'js']);

/** Cache identity. Bump DEVICE_PROBES_VERSION (and the key suffix) when
 * the work spec or the descriptor semantics change. */
export const DEVICE_PROBES_KEY = 'kc:device-probes:v1';
export const DEVICE_PROBES_VERSION = 1;

/** Total wall-clock budget for one measurement pass (see header). */
export const PROBE_TIME_BUDGET_MS = 2000;

/**
 * The probe work spec — a verbatim copy of PROBE_SPEC in
 * src/gl/parity/costDataset.mjs (pinned equal by the selfcheck).
 */
export const DEVICE_PROBE_SPEC = Object.freeze({
  fill: { size: 512, draws: 16, fragIters: 48 },
  instanced: { instances: 8192, draws: 8 },
  blend: { size: 512, quads: 24 },
  js: { iterations: 2_000_000 },
  reps: 5, // median of 5, after 1 discarded warm-up
});

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * The honesty gate, shared by measurement results and cache reads:
 * keep only known probe keys carrying a finite, positive measured ms.
 * Returns a clean bag, or null when nothing in `raw` is a real
 * measurement. Unknown keys, zeroes, negatives, NaN/Infinity and
 * non-numbers are dropped — never coerced, never defaulted.
 */
export function sanitizeProbeBag(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const bag = {};
  for (const k of PROBE_KEYS) {
    const v = raw[k];
    if (finite(v) && v > 0) bag[k] = v;
  }
  return Object.keys(bag).length ? bag : null;
}

// --- storage (diceCrowns pattern: injectable backend, memory fallback) ---

const memStore = new Map();
const memoryBackend = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => void memStore.set(k, v),
};

function backend(storage) {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* fall through */
  }
  return memoryBackend;
}

/**
 * The cached descriptor bag, or null on any miss: nothing stored,
 * unreadable JSON, a stale version, or a record whose probes are all
 * junk (sanitizeProbeBag refuses it). A miss re-measures; it never
 * fabricates.
 */
export function readCachedProbes(storage) {
  try {
    const raw = backend(storage).getItem(DEVICE_PROBES_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || typeof rec !== 'object' || rec.v !== DEVICE_PROBES_VERSION) return null;
    return sanitizeProbeBag(rec.probes);
  } catch {
    return null;
  }
}

/**
 * Persist a measured bag. Returns false (and writes nothing) when the
 * bag holds no real measurement — failures are not cached. Storage
 * errors (quota, privacy mode) are swallowed: the bag still serves the
 * session, it just is not persisted.
 */
export function writeCachedProbes(bag, storage, now = Date.now) {
  const clean = sanitizeProbeBag(bag);
  if (!clean) return false;
  try {
    backend(storage).setItem(DEVICE_PROBES_KEY, JSON.stringify({ v: DEVICE_PROBES_VERSION, at: now(), probes: clean }));
    return true;
  } catch {
    return false;
  }
}

// --- measurement ---

const defaultNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

/**
 * Time one probe: 1 warm-up batch (discarded), then `reps` timed
 * batches, median reported, rounded to 4 decimals like the bench page.
 * Returns null when any batch throws or the median is not a finite
 * positive number — the caller records an absence, not a number.
 * Exported for the selfcheck; `now` is injectable for the same reason.
 */
export function timeBatches(fn, { reps = DEVICE_PROBE_SPEC.reps, now = defaultNow } = {}) {
  try {
    fn(); // warm-up, discarded
    const times = [];
    for (let r = 0; r < reps; r++) {
      const t0 = now();
      fn();
      times.push(now() - t0);
    }
    const s = [...times].sort((a, b) => a - b);
    const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    return finite(mid) && mid > 0 ? +mid.toFixed(4) : null;
  } catch {
    return null;
  }
}

/** One JS-probe batch: the PROBE_SPEC math loop, verbatim from the bench page. */
export function jsProbeBatch() {
  let a = 0.0001;
  const n = DEVICE_PROBE_SPEC.js.iterations;
  for (let i = 0; i < n; i++) {
    a += Math.sin(a + i * 1e-7) * Math.cos(a * 0.5);
  }
  if (!Number.isFinite(a)) throw new Error('[deviceProbes] js probe diverged');
}

function createProbeContext() {
  if (typeof document === 'undefined') throw new Error('[deviceProbes] no DOM for probe canvas');
  const cv = document.createElement('canvas');
  cv.width = DEVICE_PROBE_SPEC.fill.size;
  cv.height = DEVICE_PROBE_SPEC.fill.size;
  const gl = cv.getContext('webgl2', { antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('[deviceProbes] WebGL2 unavailable for probes');
  return gl;
}

function probeShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error('[deviceProbes] probe shader: ' + gl.getShaderInfoLog(sh));
  return sh;
}
function probeProgram(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, probeShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, probeShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('[deviceProbes] probe program link failed');
  return p;
}

const VS_FULL = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;

/**
 * The three GPU batch functions over one shared probe context and one
 * shared render target — the costBench.html __kcProbes work, verbatim
 * in sizes, draw counts, shaders and the readPixels flush. Any failure
 * (shader compile, incomplete framebuffer, GL error surfaced as a
 * throw) propagates to timeBatches, which turns it into an absence.
 */
function gpuBatchFns(gl) {
  const spec = DEVICE_PROBE_SPEC;
  const px = new Uint8Array(4);
  const flush = () => gl.readPixels(spec.fill.size / 2, spec.fill.size / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, spec.fill.size, spec.fill.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
    throw new Error('[deviceProbes] probe framebuffer incomplete');

  // fill: fragment-bound fullscreen pass, spec.fragIters sin/cos loop.
  const fillProg = probeProgram(
    gl,
    VS_FULL,
    `#version 300 es
    precision highp float; out vec4 o;
    void main(){ float a = 0.0; vec2 q = gl_FragCoord.xy / ${spec.fill.size}.0;
      for (int i = 0; i < ${spec.fill.fragIters}; i++) { float f = float(i) * 0.013; a += sin(q.x * 40.0 + f) * cos(q.y * 40.0 - f); }
      o = vec4(vec3(a * 0.02 + 0.5), 1.0); }`,
  );
  const fill = () => {
    gl.viewport(0, 0, spec.fill.size, spec.fill.size);
    gl.useProgram(fillProg);
    for (let d = 0; d < spec.fill.draws; d++) gl.drawArrays(gl.TRIANGLES, 0, 3);
    flush();
  };

  // instanced: spec.instances 2-triangle quads, one instanced draw each.
  const instProg = probeProgram(
    gl,
    `#version 300 es
    layout(location=0) in vec2 pos; layout(location=1) in vec2 off;
    void main(){ gl_Position = vec4(pos * 0.02 + off, 0.0, 1.0); }`,
    `#version 300 es
    precision highp float; out vec4 o; void main(){ o = vec4(0.8, 0.4, 0.2, 1.0); }`,
  );
  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const offs = new Float32Array(spec.instanced.instances * 2);
  for (let i = 0; i < spec.instanced.instances; i++) {
    offs[i * 2] = ((i % 91) / 91) * 1.8 - 0.9;
    offs[i * 2 + 1] = (((i / 91) | 0) / 91) * 1.8 - 0.9;
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb0 = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb0);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const vb1 = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb1);
  gl.bufferData(gl.ARRAY_BUFFER, offs, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);
  const instanced = () => {
    gl.viewport(0, 0, spec.fill.size, spec.fill.size);
    gl.useProgram(instProg);
    gl.bindVertexArray(vao);
    for (let d = 0; d < spec.instanced.draws; d++)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, spec.instanced.instances);
    gl.bindVertexArray(null);
    flush();
  };

  // blend: spec.blend.quads fullscreen blended quads, alpha 0.1.
  const blendProg = probeProgram(
    gl,
    VS_FULL,
    `#version 300 es
    precision highp float; out vec4 o; void main(){ o = vec4(0.5, 0.3, 0.7, 0.1); }`,
  );
  const blend = () => {
    gl.viewport(0, 0, spec.blend.size, spec.blend.size);
    gl.useProgram(blendProg);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (let d = 0; d < spec.blend.quads; d++) gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    flush();
  };

  return { fillRate: fill, instanced, blend };
}

/**
 * Run the four probes now (no cache). Always resolves — never throws —
 * with a bag holding ONLY the probes that honestly measured; a probe
 * that cannot run here is absent. The GPU context is created for the
 * GPU probes only, shared across them, and lost again before return so
 * first launch leaves no extra context behind. The JS probe is
 * independent of WebGL and still runs when the GPU probes cannot.
 * `budgetMs` / `now` are injectable for the selfcheck.
 */
export async function measureDeviceProbes({ budgetMs = PROBE_TIME_BUDGET_MS, now = defaultNow } = {}) {
  const raw = {};
  const t0 = now();
  const overBudget = () => now() - t0 >= budgetMs;

  let gl = null;
  try {
    gl = createProbeContext();
  } catch {
    gl = null; // no WebGL2 / no DOM: GPU descriptors stay absent
  }
  if (gl) {
    try {
      const batches = gpuBatchFns(gl);
      for (const key of ['fillRate', 'instanced', 'blend']) {
        if (overBudget()) break;
        raw[key] = timeBatches(batches[key], { now });
      }
    } catch {
      // Setup failed mid-way: whatever already measured stands, the
      // rest stays absent. (timeBatches itself never throws.)
    } finally {
      try {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        /* context already gone */
      }
    }
  }

  if (!overBudget()) raw.js = timeBatches(jsProbeBatch, { now });

  return sanitizeProbeBag(raw) ?? {};
}

let inflight = null;

/**
 * The device's probe descriptors: the cached bag when a valid one
 * exists, otherwise a fresh measurement that is then cached. `force`
 * re-measures (and overwrites the cache on success). Concurrent calls
 * share one measurement. Always resolves with a bag — possibly empty,
 * possibly partial; consumers must treat every key as optional, which
 * is exactly the contract predictMs already enforces (a missing probe
 * feature is a fallback to static tiers, never a guess).
 * `measure` is injectable for the selfcheck.
 */
export async function getDeviceProbes({ storage, force = false, measure = measureDeviceProbes } = {}) {
  if (!force) {
    const cached = readCachedProbes(storage);
    if (cached) return cached;
  }
  if (!inflight) {
    inflight = (async () => {
      const bag = sanitizeProbeBag(await measure()) ?? {};
      if (Object.keys(bag).length) writeCachedProbes(bag, storage);
      return bag;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
