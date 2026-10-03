// canvasSizes.selfcheck.mjs — #606 Phase A: variable canvas engine realities.
// Proves accum + export machinery handle non-default canvas sizes:
// portrait 1080x1920 and 4K 3840x2160.
//
// Mock GL (fast): createAccum/begin/step/resize at both sizes against a
// dimension-recording mock GL + mock bridge — every allocated texture and
// every viewport must track the canvas W/H exactly (glow chain at W/8).
// Browser (established glDriver harness, real WebGL via headless Chromium):
//   - accum: renderAccumViaGL at both sizes on a corpus doc (feedback stack
//     allocates and trails at canvas dims).
//   - export: renderExport (the exportStill entrypoint) at both sizes —
//     single stills; chunked readback handles the 33MB 4K frame.
import assert from 'node:assert';

const SIZES = [
  { name: 'portrait', w: 1080, h: 1920 },
  { name: '4k', w: 3840, h: 2160 },
];
const GLOW_DIV_EXPECTED = 8;

// ---------------------------------------------------------------- mock GL ---
// Dimension-recording mock: every texImage2D and viewport call is logged so
// we can assert the accum stack allocates and draws at exactly the canvas
// W/H. Shader/program/buffer calls are stubs (uniform gate passes because
// every queried location resolves).
function makeMockGL() {
  const calls = [];
  let nextId = 1;
  const loc = () => ({ _loc: nextId++ });
  const gl = {
    // constants
    TEXTURE_2D: 0x0de1, TEXTURE0: 0x84c0, RGBA: 0x1908, RGBA8: 0x8058,
    RGBA16F: 0x881a, UNSIGNED_BYTE: 0x1401, HALF_FLOAT: 0x140b, FLOAT: 0x1406,
    COLOR_ATTACHMENT0: 0x8ce0, FRAMEBUFFER: 0x8d40, FRAMEBUFFER_COMPLETE: 0x8cd5,
    LINEAR: 0x2601, CLAMP_TO_EDGE: 0x812f, COLOR_BUFFER_BIT: 0x4000,
    VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82, ACTIVE_UNIFORMS: 0x8b86,
    ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88e4, TRIANGLE_STRIP: 0x0005,
    BLEND: 0x0be2, ONE: 1, ONE_MINUS_SRC_ALPHA: 0x0303,
    drawingBufferWidth: 0, drawingBufferHeight: 0,
    calls,
    // --- uniform introspection for auditProgramChecked: parse the uniforms
    // declared in the attached shader sources so the audit sees the real set.
    _uniformsOf(p) {
      const names = [];
      for (const sh of (p._shaders || [])) {
        const src = sh._src || '';
        for (const m of src.matchAll(/uniform\s+\w+\s+(\w+)(\s*\[[^\]]*\])?\s*;/g)) {
          names.push(m[2] ? `${m[1]}[0]` : m[1]);
        }
      }
      return [...new Set(names)];
    },
    getActiveUniform(p, i) {
      const names = gl._uniformsOf(p);
      return i < names.length ? { name: names[i], size: 1, type: 0 } : null;
    },
    // textures & targets
    createTexture() { const t = { id: nextId++ }; calls.push(['createTexture', t.id]); return t; },
    bindTexture(t, x) { calls.push(['bindTexture', x && x.id]); },
    activeTexture() {},
    texImage2D(t, level, internal, w, h, border, format, type, pixels) {
      calls.push(['texImage2D', w, h]);
    },
    texParameteri() {},
    generateMipmap() {},
    createFramebuffer() { const f = { id: nextId++ }; calls.push(['createFramebuffer', f.id]); return f; },
    bindFramebuffer(t, f) { calls.push(['bindFramebuffer', f && f.id]); },
    framebufferTexture2D() { calls.push(['framebufferTexture2D']); },
    checkFramebufferStatus() { return gl.FRAMEBUFFER_COMPLETE; },
    deleteTexture(t) { calls.push(['deleteTexture', t && t.id]); },
    deleteFramebuffer(f) { calls.push(['deleteFramebuffer', f && f.id]); },
    // shaders & programs
    createShader(type) { const s = { id: nextId++, _type: type, _src: '' }; return s; },
    shaderSource(sh, src) { sh._src = String(src); },
    compileShader() {},
    getShaderParameter() { return true; },
    getShaderInfoLog() { return ''; },
    deleteShader() {},
    createProgram() { return { id: nextId++, _shaders: [] }; },
    attachShader(p, sh) { p._shaders.push(sh); },
    linkProgram() {},
    getProgramParameter(p, pname) {
      if (pname === gl.ACTIVE_UNIFORMS) return gl._uniformsOf(p).length;
      return true;
    },
    getProgramInfoLog() { return ''; },
    deleteProgram(p) { calls.push(['deleteProgram', p && p.id]); },
    getAttribLocation() { return 0; },
    getUniformLocation() { return loc(); },
    useProgram() {},
    uniform1i() {}, uniform1f() {}, uniform2f() {}, uniform3f() {}, uniform4f() {},
    // buffers & draw
    createBuffer() { return { id: nextId++ }; },
    bindBuffer() {},
    bufferData() {},
    deleteBuffer(b) { calls.push(['deleteBuffer', b && b.id]); },
    enableVertexAttribArray() {},
    disableVertexAttribArray() {},
    vertexAttribPointer() {},
    drawArrays(mode, first, count) { calls.push(['drawArrays', count]); },
    // state
    viewport(x, y, w, h) {
      calls.push(['viewport', w, h]);
      gl.drawingBufferWidth = w; gl.drawingBufferHeight = h;
    },
    clearColor() {},
    clear() {},
    enable() {}, disable() {}, blendFunc() {},
    getExtension() { return null; },
    getError() { return 0; },
    NO_ERROR: 0,
  };
  return gl;
}

// Mock bridge: owns the feedback pair; allocates it through the mock GL so
// its dimensions are recorded too. Pair dims track W/H via closure.
function makeMockBridge(gl, size) {
  return {
    lost: false,
    layer(id, { div = 1 } = {}) {
      const w = Math.max(1, Math.floor(size.w / div));
      const h = Math.max(1, Math.floor(size.h / div));
      const mk = () => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        const fb = gl.createFramebuffer();
        return { tex, fb, w, h };
      };
      return { t0: mk(), t1: mk() };
    },
  };
}

function texSizes(gl) {
  return gl.calls.filter((c) => c[0] === 'texImage2D').map((c) => [c[1], c[2]]);
}
function viewports(gl) {
  return gl.calls.filter((c) => c[0] === 'viewport').map((c) => [c[1], c[2]]);
}

export async function runMockChecks() {
  const { createAccum, accumRecipeParams, GLOW_DIV } = await import('./accum.mjs');
  assert.strictEqual(GLOW_DIV, GLOW_DIV_EXPECTED, `GLOW_DIV changed: ${GLOW_DIV}`);
  let n = 0;
  for (const size of SIZES) {
    const { name, w, h } = size;
    const gl = makeMockGL();
    const bridge = makeMockBridge(gl, size);
    const liveSize = { w, h };
    const liveBridge = makeMockBridge(gl, liveSize);
    const acc = createAccum(gl, liveBridge, { width: w, height: h });
    assert.ok(acc, `${name}: createAccum returned null at ${w}x${h}`);
    n++;

    // One begin + one step exercises the per-frame draw path at canvas size.
    acc.begin('#000000');
    const frameTex = gl.createTexture();
    acc.step(frameTex, accumRecipeParams({ fade: 0.9, optics: 0 }));
    n += 2;

    // Every allocated texture must be canvas-sized, glow-chain at W/8,
    // or the bridge pair at W/div (div=1 here → canvas-sized).
    const gw = Math.floor(w / GLOW_DIV), gh = Math.floor(h / GLOW_DIV);
    const allowed = new Set([`${w}x${h}`, `${gw}x${gh}`, '1x1']);
    for (const [tw, th] of texSizes(gl)) {
      assert.ok(allowed.has(`${tw}x${th}`),
        `${name}: texture ${tw}x${th} not canvas ${w}x${h}, glow ${gw}x${gh}, or the 1x1 curl table`);
      n++;
    }
    // Every viewport must be canvas-sized (begin clears the pair at pair
    // dims = canvas dims here; step draws at canvas dims).
    for (const [vw, vh] of viewports(gl)) {
      assert.ok(allowed.has(`${vw}x${vh}`),
        `${name}: viewport ${vw}x${vh} not canvas-sized`);
      n++;
    }

    // Resize to the other size: scratch reallocates at the new dims.
    const other = SIZES.find((s) => s.name !== name);
    const before = gl.calls.length;
    liveSize.w = other.w; liveSize.h = other.h;
    acc.resize(other.w, other.h);
    const ogw = Math.floor(other.w / GLOW_DIV), ogh = Math.floor(other.h / GLOW_DIV);
    const postCalls = gl.calls.slice(before);
    const postTex = postCalls.filter((c) => c[0] === 'texImage2D').map((c) => [c[1], c[2]]);
    assert.ok(postTex.length > 0, `${name}: resize produced no reallocations`);
    const allowed2 = new Set([`${other.w}x${other.h}`, `${ogw}x${ogh}`, '1x1']);
    for (const [tw, th] of postTex) {
      assert.ok(allowed2.has(`${tw}x${th}`),
        `resize: texture ${tw}x${th} not ${other.w}x${other.h}, glow ${ogw}x${ogh}, or the 1x1 curl table`);
      n++;
    }
    acc.dispose();
  }
  console.log(`canvasSizes.selfcheck: mock GL OK (${n} cases)`);
  return n;
}

// -------------------------------------------------------------- browser ------
export async function runBrowserChecks() {
  const { getScene } = await import('./parity/corpus.mjs');
  const { resolveLayers } = await import('../../../studio/render.mjs');
  const { buildSceneContract } = await import('./sceneContract.js');
  const { getRenderCaps } = await import('../data/quality.js');
  const { renderAccumViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const { renderExport } = await import('./exportStill.mjs');

  let n = 0;
  try {
    for (const { name, w, h } of SIZES) {
      // Export path: the exportStill entrypoint, real render at canvas size.
      const doc = JSON.parse(JSON.stringify(getScene('single-basic').doc));
      const still = await renderExport({ doc, width: w, height: h });
      assert.strictEqual(still.width, w, `${name}: export width ${still.width} !== ${w}`);
      assert.strictEqual(still.height, h, `${name}: export height ${still.height} !== ${h}`);
      assert.strictEqual(still.pixels.length, w * h * 4, `${name}: export pixel buffer size`);
      // Not blank: the corpus doc renders something.
      let lit = 0;
      for (let i = 0; i < still.pixels.length; i += 4 * 997) lit += still.pixels[i] + still.pixels[i + 1] + still.pixels[i + 2];
      assert.ok(lit > 0, `${name}: export rendered blank`);
      n += 4;
      console.log(`canvasSizes.selfcheck: export ${w}x${h} OK`);

      // Accum path: feedback stack allocates and trails at canvas dims.
      const caps = getRenderCaps(doc.quality || 'balanced', false);
      const frames = [];
      for (const progress of [0, 0.5, 1]) {
        const rl = resolveLayers(doc, { caps, motion: 'auto', progress });
        frames.push(buildSceneContract({
          doc, resolvedLayers: rl, caps,
          accum: { enabled: true, fade: 0.9, optics: 0.2, background: '#000000' },
        }));
      }
      const acc = await renderAccumViaGL(frames, { width: w, height: h, fade: 0.9, optics: 0.2 });
      assert.strictEqual(acc.width, w, `${name}: accum width ${acc.width} !== ${w}`);
      assert.strictEqual(acc.height, h, `${name}: accum height ${acc.height} !== ${h}`);
      assert.strictEqual(acc.pixels.length, w * h * 4, `${name}: accum pixel buffer size`);
      n += 3;
      console.log(`canvasSizes.selfcheck: accum ${w}x${h} OK`);
    }
  } finally {
    await closeGlDriver();
  }
  console.log(`canvasSizes.selfcheck: browser OK (${n} cases)`);
  return n;
}

async function main() {
  const skipBrowser = process.argv.includes('--skip-browser');
  let n = await runMockChecks();
  if (!skipBrowser) {
    try {
      n += await runBrowserChecks();
    } catch (e) {
      // The lint job does not install the Playwright browser. The e2e job does.
      if (/Executable doesn't exist/.test(e.message || '') && /playwright/i.test(e.message || '')) {
        console.log('  [skip] browser canvas-size checks: Playwright browser not installed in this environment');
      } else {
        throw e;
      }
    }
  }
  console.log(`canvasSizes.selfcheck: OK (${n} cases)`);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) main().catch((e) => { console.error('canvasSizes.selfcheck FAILED:', e.message); process.exit(1); });
