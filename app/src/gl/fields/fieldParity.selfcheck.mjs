// fieldParity.selfcheck.mjs — GPU field parity harness (#1315).
//
// Compares GPU (transform feedback) vs CPU evaluation of the registered
// 'noise' field on a fixed fixture. Bit-match is impossible by physics
// (float64 CPU vs float32 GPU — see fieldCommon.glsl.js), so parity means:
// max |CPU − GPU| <= FIELD_PARITY_TOL, a DOCUMENTED, MEASURED tolerance.
//
// Fixture (fixed): seed 0xC0FFEE, 4096 LCG-scattered points in [0,1)^2,
// freq 2.5, 3 octaves, lacunarity 2, gain 0.5, z 0.37.
//
// Tolerance: measured max 5.1e-7 / mean 7.4e-8 on SwiftShader (headless
// Chromium, 2026-10-10). FIELD_PARITY_TOL = 1e-5 ≈ 20x headroom for
// real-GPU FMA/contraction differences. A planted 0.25 shift exceeds it by
// ~5 orders of magnitude, so the harness still catches real drift.
//
// Tiers:
//   A. Node-only (always runs): registry integration, backend flag, the
//      comparator itself, and the runner's GL plumbing against a scripted
//      mock WebGL2 context.
//   B. Browser (skipped when Playwright Chromium is not installed — the
//      lint-build-selfcheck CI job): real GPU parity on the fixture,
//      a second opt config, GPU determinism, and the planted violation.
import assert from 'node:assert';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createRegistry } from '../../engine/kernel/registry.js';
import { FIELDS } from '../../engine/kernel/field/registry.js';
import { makeNoiseField, NOISE_FIELD_DEFAULTS } from '../../engine/kernel/field/index.js';
import {
  createFieldRunner,
  evaluateFieldColumns,
  getFieldBackend,
  setFieldBackend,
  FIELD_BACKENDS,
} from './fieldRunner.js';
import { NOISE_FIELD_VARYINGS } from './noiseField.glsl.js';
import { glStaticHandler } from '../parity/glStaticServer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GL_DIR = path.join(HERE, '..');

/** Documented parity tolerance — see header. Never raised silently. */
const FIELD_PARITY_TOL = 1e-5;

const FIXTURE = Object.freeze({
  seed: 0xC0FFEE,
  opts: Object.freeze({ freq: 2.5, octaves: 3, lacunarity: 2, gain: 0.5, z: 0.37 }),
  n: 4096,
  lcgSeed: 0x1234,
});
const FIXTURE_B = Object.freeze({
  seed: 42,
  opts: Object.freeze({ freq: 4, octaves: 5, lacunarity: 2, gain: 0.5, z: 1.7 }),
});

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const okAsync = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };

function lcg(seed) {
  let a = seed >>> 0;
  return () => ((a = (Math.imul(a, 1103515245) + 12345) >>> 0) & 0x7fffffff) / 0x7fffffff;
}

/** Fixed fixture columns: Float32Array SoA lanes, like the kernel point set. */
function fixtureColumns() {
  const rnd = lcg(FIXTURE.lcgSeed);
  const x = new Float32Array(FIXTURE.n);
  const y = new Float32Array(FIXTURE.n);
  for (let i = 0; i < FIXTURE.n; i++) { x[i] = rnd(); y[i] = rnd(); }
  return { x, y, count: FIXTURE.n };
}

function cpuReference(seed, opts, columns) {
  const inst = makeNoiseField(seed, opts);
  const out = new Float32Array(columns.count);
  for (let i = 0; i < columns.count; i++) out[i] = inst.sample(columns.x[i], columns.y[i]);
  return out;
}

// ── the comparator (pure; unit-tested below, used by the browser tier) ──

function compareFieldColumns(cpu, gpu, tol) {
  assert.ok(cpu instanceof Float32Array && gpu instanceof Float32Array, 'comparator takes Float32Array columns');
  assert.strictEqual(cpu.length, gpu.length, 'comparator: column lengths match');
  let maxAbs = 0;
  let maxIdx = -1;
  let sum = 0;
  for (let i = 0; i < cpu.length; i++) {
    const d = Math.abs(cpu[i] - gpu[i]);
    sum += d;
    if (d > maxAbs) { maxAbs = d; maxIdx = i; }
  }
  return {
    pass: maxAbs <= tol,
    maxAbs,
    maxIdx,
    meanAbs: cpu.length ? sum / cpu.length : 0,
    tol,
    n: cpu.length,
  };
}

function assertFieldParity(cpu, gpu, tol, label) {
  const r = compareFieldColumns(cpu, gpu, tol);
  assert.ok(
    r.pass,
    `[parity:${label}] FAIL maxAbs=${r.maxAbs.toExponential(3)} > tol=${tol} ` +
    `(lane ${r.maxIdx}, mean=${r.meanAbs.toExponential(3)}, n=${r.n})`,
  );
  return r;
}

// ── A. Node-only ─────────────────────────────────────────────────────────

ok('registry: noise declares a gpu twin; other fields do not', () => {
  const noise = FIELDS.get('noise');
  assert.ok(noise, 'noise registered');
  assert.ok(noise.gpu, 'noise has a gpu descriptor');
  assert.equal(typeof noise.gpu.vertexShader, 'string');
  assert.ok(noise.gpu.vertexShader.length > 100, 'vertex shader is a real source string');
  assert.deepStrictEqual([...noise.gpu.varyings], [...NOISE_FIELD_VARYINGS]);
  assert.deepStrictEqual([...noise.gpu.varyings], ['v_field']);
  assert.equal(typeof noise.gpu.fragmentShader, 'string');
  // The JS implementation is untouched and still the payload.
  const inst = noise.create(FIXTURE.seed, {});
  assert.equal(inst.kind, 'noise');
  assert.ok(Number.isFinite(inst.sample(0.3, 0.7)));
  for (const id of ['constant', 'scent', 'ca', 'quadtree']) {
    assert.ok(!FIELDS.get(id).gpu, `${id} has no gpu twin (falls back to JS)`);
  }
});

ok('registry: gpu descriptor shape is validated', () => {
  const reg = createRegistry('probe', { payloadKey: 'create' });
  assert.throws(() => reg.register({ id: 'a', create: () => 0, gpu: null }), /gpu must be an object/);
  assert.throws(() => reg.register({ id: 'a', create: () => 0, gpu: { varyings: ['v'] } }), /gpu\.vertexShader/);
  assert.throws(() => reg.register({ id: 'a', create: () => 0, gpu: { vertexShader: 'x', varyings: [] } }), /gpu\.varyings/);
  assert.throws(() => reg.register({ id: 'a', create: () => 0, gpu: { vertexShader: 'x', varyings: [42] } }), /gpu\.varyings/);
  reg.register({ id: 'a', create: () => 0, gpu: { vertexShader: 'void main(){}', varyings: ['v'] } });
  assert.deepStrictEqual([...reg.get('a').gpu.varyings], ['v']);
  // Re-declaring the identical signature with a gpu twin does not throw
  // (this is how the gl side attaches the descriptor, #1239 boundary).
  reg.register({ id: 'a', create: () => 1, gpu: { vertexShader: 'void main(){}', varyings: ['v'] } });
});

ok('backend: default is js; opt-in is explicit and validated', () => {
  assert.deepStrictEqual([...FIELD_BACKENDS], ['js', 'gpu']);
  assert.strictEqual(getFieldBackend(), 'js');
  assert.strictEqual(setFieldBackend('gpu'), 'gpu');
  assert.strictEqual(getFieldBackend(), 'gpu');
  assert.throws(() => setFieldBackend('webgpu'), /unknown field backend/);
  assert.throws(() => setFieldBackend(''), /unknown field backend/);
  setFieldBackend('js');
  assert.strictEqual(getFieldBackend(), 'js');
});

ok('dispatch: JS fallback keeps the forever implementation', () => {
  const cols = fixtureColumns();
  // Backend js + runner present: still JS.
  const jsValues = evaluateFieldColumns('noise', FIXTURE.seed, FIXTURE.opts, cols, { runner: { runField: () => { throw new Error('must not run'); } } });
  assert.deepStrictEqual(jsValues, cpuReference(FIXTURE.seed, FIXTURE.opts, cols));
  // Backend gpu but no runner: JS.
  setFieldBackend('gpu');
  try {
    const v2 = evaluateFieldColumns('noise', FIXTURE.seed, FIXTURE.opts, cols, {});
    assert.deepStrictEqual(v2, cpuReference(FIXTURE.seed, FIXTURE.opts, cols));
    // Backend gpu + runner, field without a gpu twin: JS fallback.
    const v3 = evaluateFieldColumns('constant', FIXTURE.seed, { value: 0.5 }, cols, { runner: {} });
    assert.ok(v3.every((v) => v === 0.5), 'constant field falls back to JS');
  } finally {
    setFieldBackend('js');
  }
  assert.throws(() => evaluateFieldColumns('nope', 1, {}, cols), /unknown field/);
});

ok('comparator: pass/fail semantics incl. boundary', () => {
  const a = new Float32Array([0.1, 0.5, 0.9]);
  const same = new Float32Array([0.1, 0.5, 0.9]);
  const r1 = compareFieldColumns(a, same, FIELD_PARITY_TOL);
  assert.equal(r1.pass, true);
  assert.equal(r1.maxAbs, 0);
  // At exactly tol: pass (<=). Just over: fail.
  const edge = new Float32Array([0.1 + FIELD_PARITY_TOL, 0.5, 0.9]);
  assert.equal(compareFieldColumns(a, edge, FIELD_PARITY_TOL).pass, true);
  const over = new Float32Array([0.1 + FIELD_PARITY_TOL * 1.5, 0.5, 0.9]);
  const r2 = compareFieldColumns(a, over, FIELD_PARITY_TOL);
  assert.equal(r2.pass, false);
  assert.equal(r2.maxIdx, 0);
  assert.ok(r2.maxAbs > FIELD_PARITY_TOL);
  assert.throws(() => compareFieldColumns(a, new Float32Array(2), FIELD_PARITY_TOL), /lengths match/);
  // The throwing variant names the offender.
  assert.throws(() => assertFieldParity(a, over, FIELD_PARITY_TOL, 'probe'), /\[parity:probe\] FAIL/);
  const r3 = assertFieldParity(a, same, FIELD_PARITY_TOL, 'probe');
  assert.equal(r3.n, 3);
});

// ── mock WebGL2: runner plumbing without a GPU ───────────────────────────
// The mock emulates the transform-feedback CONTRACT (capture N floats per
// draw into the TF-bound buffer, deterministic pattern out) — not the
// shader math. Value-correctness of the GLSL is the browser tier's job.

const GLC = {
  VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30,
  COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
  SEPARATE_ATTRIBS: 0x8c8d,
  ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88e4, DYNAMIC_COPY: 0x88e8,
  TEXTURE_2D: 0x0de1, TEXTURE0: 0x84c0,
  TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803,
  NEAREST: 0x2600, CLAMP_TO_EDGE: 0x812f,
  R8UI: 0x8232, RED_INTEGER: 0x8d94, UNSIGNED_BYTE: 0x1401, FLOAT: 0x1406,
  POINTS: 0x0000, RASTERIZER_DISCARD: 0x8c89,
  TRANSFORM_FEEDBACK: 0x8e22, TRANSFORM_FEEDBACK_BUFFER: 0x8c8e,
  NO_ERROR: 0,
};

function makeMockGL() {
  let nextId = 1;
  const calls = [];
  const uniforms = {};
  const deleted = [];
  const bound = {};
  let tfObj = null;
  let tfBoundBuffer = null;
  let tfActive = false;
  const caps = {};
  const texImages = [];
  // Deterministic stand-in for "the shader ran": lane i -> pattern(i).
  // Chosen float32-exact (multiples of 2^-11) so the mock round-trips bits.
  const pattern = (i) => 0.125 + i / 2048;

  const gl = {
    ...GLC,
    getError: () => GLC.NO_ERROR,
    createShader: (t) => ({ _id: nextId++, _t: t, _src: '' }),
    shaderSource: (s, src) => { s._src = src; },
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    deleteShader: () => {},
    createProgram: () => ({ _id: nextId++, _varyings: null, _mode: null }),
    attachShader: () => {},
    transformFeedbackVaryings(p, varyings, mode) {
      calls.push(['transformFeedbackVaryings', [...varyings], mode]);
      p._varyings = [...varyings]; p._mode = mode;
    },
    linkProgram: (p) => { calls.push(['linkProgram']); p._linked = true; },
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    deleteProgram: (p) => deleted.push(p),
    getAttribLocation: (p, name) => (name === 'a_x' ? 0 : name === 'a_y' ? 1 : -1),
    getUniformLocation: (p, name) => ({ _u: name }),
    useProgram: () => {},
    createBuffer: () => ({ _id: nextId++, _data: null }),
    bindBuffer: (t, b) => { bound[t] = b; },
    bufferData(t, dataOrSize) {
      const b = bound[t];
      b._data = typeof dataOrSize === 'number' ? new Float32Array(dataOrSize / 4) : dataOrSize.slice();
    },
    deleteBuffer: (b) => deleted.push(b),
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    createTexture: () => ({ _id: nextId++ }),
    activeTexture: () => {},
    bindTexture: () => {},
    texParameteri: () => {},
    texImage2D(t, level, internal, w, h, border, format, type, data) {
      texImages.push({ internal, w, h, format, type, bytes: data ? data.length : 0 });
    },
    deleteTexture: (t) => deleted.push(t),
    uniform1i: (l, v) => { uniforms[l._u] = v; },
    uniform1f: (l, v) => { uniforms[l._u] = v; },
    createTransformFeedback: () => ({ _id: nextId++ }),
    bindTransformFeedback: (t, tf) => { tfObj = tf; if (!tf) tfBoundBuffer = null; },
    bindBufferBase: (t, i, b) => { if (tfObj) tfBoundBuffer = b; },
    deleteTransformFeedback: (tf) => deleted.push(tf),
    enable: (c) => { caps[c] = true; },
    disable: (c) => { caps[c] = false; },
    beginTransformFeedback: (m) => { tfActive = m; },
    endTransformFeedback: () => { tfActive = false; },
    drawArrays(mode, first, count) {
      assert.ok(tfActive !== false, 'mock: TF active during draw');
      assert.ok(tfObj, 'mock: TF object bound');
      assert.ok(tfBoundBuffer, 'mock: TF buffer bound at index 0');
      calls.push(['drawArrays', { discard: !!caps[GLC.RASTERIZER_DISCARD], count }]);
      const out = new Float32Array(count);
      for (let i = 0; i < count; i++) out[i] = pattern(first + i);
      tfBoundBuffer._data = out;
    },
    getBufferSubData(t, offset, dst) {
      const b = bound[t];
      assert.ok(b && b._data, 'mock: buffer has a data store');
      dst.set(b._data.subarray(offset / 4, offset / 4 + dst.length));
    },
  };
  return { gl, calls, uniforms, deleted, texImages, pattern };
}

await okAsync('runner: mock-GL plumbing (TF contract, call order, readback)', async () => {
  const { gl, calls, uniforms, deleted, texImages, pattern } = makeMockGL();
  const runner = createFieldRunner(gl);
  const cols = fixtureColumns();
  const sub = { x: cols.x, y: cols.y, count: 100 };

  const res = runner.runField('noise', FIXTURE.seed, FIXTURE.opts, sub, { readback: true });
  assert.strictEqual(res.count, 100);
  assert.ok(res.values instanceof Float32Array);
  assert.strictEqual(res.values.length, 100);
  assert.strictEqual(res.gpuBuffer, null);
  for (let i = 0; i < 100; i++) assert.strictEqual(res.values[i], pattern(i), `lane ${i}`);

  // Varyings registered BEFORE link, with the declared names.
  const tfIdx = calls.findIndex((c) => c[0] === 'transformFeedbackVaryings');
  const linkIdx = calls.findIndex((c) => c[0] === 'linkProgram');
  assert.ok(tfIdx !== -1 && linkIdx !== -1 && tfIdx < linkIdx, 'varyings before link');
  assert.deepStrictEqual(calls[tfIdx][1], ['v_field']);
  assert.strictEqual(calls[tfIdx][2], GLC.SEPARATE_ATTRIBS);

  // Rasterizer discarded during the draw; perm table uploaded as 512x1.
  const draw = calls.find((c) => c[0] === 'drawArrays');
  assert.ok(draw[1].discard, 'RASTERIZER_DISCARD on during draw');
  assert.strictEqual(draw[1].count, 100);
  assert.ok(texImages.some((t) => t.w === 512 && t.h === 1 && t.bytes === 512), 'perm table 512x1x1B');

  // Uniforms resolved from the field defaults + overrides.
  assert.strictEqual(uniforms.u_freq, FIXTURE.opts.freq);
  assert.strictEqual(uniforms.u_octaves, FIXTURE.opts.octaves);
  assert.strictEqual(uniforms.u_z, FIXTURE.opts.z);
  assert.strictEqual(uniforms.u_perm, 0);

  // Keep-on-GPU path hands out a buffer the caller releases.
  const kept = runner.runField('noise', FIXTURE.seed, FIXTURE.opts, sub, { readback: false });
  assert.strictEqual(kept.values, null);
  assert.ok(kept.gpuBuffer && kept.count === 100);
  runner.release(kept);
  assert.ok(deleted.includes(kept.gpuBuffer), 'release deletes the GPU buffer');

  // Fail-closed inputs.
  assert.throws(() => createFieldRunner({}), /WebGL2/);
  assert.throws(() => runner.runField('nope', 1, {}, sub), /unknown field/);
  assert.throws(() => runner.runField('constant', 1, {}, sub), /no GPU twin/);
  assert.throws(() => runner.runField('noise', 1, { octaves: 9 }, sub), /outside GPU range/);
  assert.throws(() => runner.runField('noise', 1, {}, { x: new Float64Array(4), y: new Float32Array(4) }), /Float32Array/);
  assert.throws(() => runner.runField('noise', 1, {}, { x: cols.x, y: cols.y, count: 0 }), /bad lane count/);
  // Program compiled once, cached across runs.
  const links = calls.filter((c) => c[0] === 'linkProgram').length;
  assert.strictEqual(links, 1, 'program cached');
  runner.dispose();
});

await okAsync('dispatch: gpu backend + mock runner routes through runField', async () => {
  const { gl, pattern } = makeMockGL();
  const runner = createFieldRunner(gl);
  const cols = fixtureColumns();
  setFieldBackend('gpu');
  try {
    const v = evaluateFieldColumns('noise', FIXTURE.seed, FIXTURE.opts, cols, { runner });
    assert.ok(v instanceof Float32Array && v.length === FIXTURE.n);
    for (let i = 0; i < FIXTURE.n; i++) assert.strictEqual(v[i], pattern(i));
  } finally {
    setFieldBackend('js');
    runner.dispose();
  }
});

// ── B. Browser tier: real GPU parity ──────────────────────────────────────
// Skipped when Playwright Chromium is not installed (the lint-build-selfcheck
// CI job skips `playwright install` to stay fast); the selfcheck-browser CI
// job installs it, so real parity IS enforced in CI.

const b64f32 = (f32) => Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString('base64');
const unb64f32 = (s) => {
  const b = Buffer.from(s, 'base64');
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};

await okAsync('browser: GPU vs CPU within documented tolerance (fixture)', async () => {
  let browser = null;
  let server = null;
  try {
    browser = await chromium.launch();
  } catch (e) {
    // Same skip contract as src/gl/parity/parity.selfcheck.mjs.
    if (/Executable doesn't exist/.test(String((e && e.message) || e))) {
      console.log('  [skip] GPU parity: Playwright browser not installed in this environment');
      return;
    }
    throw e;
  }
  try {
    server = http.createServer(glStaticHandler(GL_DIR));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e)));
    await page.goto(`http://127.0.0.1:${port}/fields/fieldHarness.html`);
    await page.waitForFunction('window.__kcReady === true', null, { timeout: 30000 });

    // Fresh page: backend defaults to 'js' (the byte-identical path).
    const meta = await page.evaluate(() => window.__kcFieldMeta());
    assert.strictEqual(meta.backend, 'js', 'fresh page defaults to js backend');
    assert.ok(meta.fields.noise.hasGpu, 'noise gpu twin visible to the page');

    const run = (fieldId, seed, opts, xB64, yB64, plantShift) =>
      page.evaluate(
        ([f, s, o, xb, yb, sh]) => window.__kcFieldRun({
          fieldId: f, seed: s, opts: o, xB64: xb, yB64: yb, plantShift: sh,
        }),
        [fieldId, seed, opts, xB64, yB64, plantShift],
      );

    const cols = fixtureColumns();
    const cpu = cpuReference(FIXTURE.seed, FIXTURE.opts, cols);
    const xB64 = b64f32(cols.x);
    const yB64 = b64f32(cols.y);

    await page.evaluate((b) => window.__kcSetBackend(b), 'gpu');
    try {
      const r1 = await run('noise', FIXTURE.seed, { ...FIXTURE.opts }, xB64, yB64, 0);
      assert.ok(r1.ok, `harness run failed: ${r1.error}`);
      assert.strictEqual(r1.count, FIXTURE.n);
      assert.strictEqual(r1.backend, 'gpu');
      const gpu = unb64f32(r1.valuesB64);
      const pr = assertFieldParity(cpu, gpu, FIELD_PARITY_TOL, 'noise/fixture');
      console.log(`  [info] noise fixture: maxAbs=${pr.maxAbs.toExponential(3)} meanAbs=${pr.meanAbs.toExponential(3)} (tol=${FIELD_PARITY_TOL})`);

      // Second opt config (more octaves, nonzero z) stays inside tolerance.
      const cpuB = cpuReference(FIXTURE_B.seed, FIXTURE_B.opts, cols);
      const rB = await run('noise', FIXTURE_B.seed, { ...FIXTURE_B.opts }, xB64, yB64, 0);
      assert.ok(rB.ok, `harness run B failed: ${rB.error}`);
      const prB = assertFieldParity(cpuB, unb64f32(rB.valuesB64), FIELD_PARITY_TOL, 'noise/config-B');
      console.log(`  [info] noise config-B: maxAbs=${prB.maxAbs.toExponential(3)} meanAbs=${prB.meanAbs.toExponential(3)}`);

      // The GPU path is a pure function of (seed, x, y): two runs agree
      // bit-for-bit on the same device.
      const r2 = await run('noise', FIXTURE.seed, { ...FIXTURE.opts }, xB64, yB64, 0);
      assert.ok(r2.ok, `harness run 2 failed: ${r2.error}`);
      const again = unb64f32(r2.valuesB64);
      let detMax = 0;
      for (let i = 0; i < gpu.length; i++) detMax = Math.max(detMax, Math.abs(gpu[i] - again[i]));
      assert.strictEqual(detMax, 0, 'GPU field eval is deterministic per device');

      // Planted violation: shift the GPU inputs by 0.25 while the CPU
      // reference stays put — the harness MUST report failure.
      const rP = await run('noise', FIXTURE.seed, { ...FIXTURE.opts }, xB64, yB64, 0.25);
      assert.ok(rP.ok, `planted run failed: ${rP.error}`);
      const planted = compareFieldColumns(cpu, unb64f32(rP.valuesB64), FIELD_PARITY_TOL);
      assert.strictEqual(planted.pass, false, 'planted tolerance violation must fail the comparison');
      assert.ok(planted.maxAbs > FIELD_PARITY_TOL * 100, `planted diff dwarfs the tolerance (${planted.maxAbs.toExponential(3)})`);
      assert.throws(
        () => assertFieldParity(cpu, unb64f32(rP.valuesB64), FIELD_PARITY_TOL, 'noise/planted'),
        /\[parity:noise\/planted\] FAIL/,
        'planted violation throws in the asserting path',
      );
      console.log(`  [info] planted shift caught: maxAbs=${planted.maxAbs.toExponential(3)} >> tol=${FIELD_PARITY_TOL}`);
    } finally {
      await page.evaluate((b) => window.__kcSetBackend(b), 'js');
      assert.deepStrictEqual(pageErrors, [], `harness page errors: ${pageErrors.join('; ')}`);
      await page.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});

console.log(`fieldParity.selfcheck: OK (${n} cases)`);
