// bridge.selfcheck.mjs — JS↔GL bridge contract (#194).
//
// The bridge is browser-safe; these tests run in Node against a mock
// WebGL2 implementation that records every call. Pixel-identity of the
// bridge chain against the SVG reference is covered by the existing
// parity harness (fx-chain-2 / fx-chain-3 / fx-invert-wrap), which runs
// the Phase-1 renderer through the bridge after the #194 rewire.
import assert from 'node:assert';
import { createBridge, BRIDGE_VERSION } from './bridge.mjs';
import { registerBuiltinEffects } from './builtinEffects.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

/** Minimal WebGL2 mock: records calls, hands out unique fake objects. */
function makeMockGl({ nullUniforms = [] } = {}) {
  const calls = [];
  let nextId = 1;
  const call = (name, ...args) => { calls.push({ name, args }); };
  const gl = {
    VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
    TEXTURE_2D: 0x0de1, TEXTURE0: 0x84c0, FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0, FRAMEBUFFER_COMPLETE: 0x8cd5,
    RGBA16F: 0x881a, RGBA: 0x1908, HALF_FLOAT: 0x140b,
    CLAMP_TO_EDGE: 0x812f, TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800, NEAREST: 0x2600,
    ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88e4, FLOAT: 0x1406,
    TRIANGLES: 0x0004, BLEND: 0x0be2,
    calls,
    count: (name) => calls.filter((c) => c.name === name).length,
    withName: (name) => calls.filter((c) => c.name === name),
    createShader: (t) => { call('createShader', t); return { __s: nextId++ }; },
    shaderSource: (s) => call('shaderSource', s),
    compileShader: (s) => call('compileShader', s),
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    deleteShader: (s) => call('deleteShader', s),
    createProgram: () => { call('createProgram'); return { __p: nextId++ }; },
    attachShader: (p) => call('attachShader', p),
    linkProgram: (p) => call('linkProgram', p),
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    deleteProgram: (p) => call('deleteProgram', p),
    getUniformLocation: (p, uname) => {
      call('getUniformLocation', uname);
      return nullUniforms.includes(uname) ? null : { __loc: uname };
    },
    createTexture: () => { call('createTexture'); return { __t: nextId++ }; },
    bindTexture: (t, x) => call('bindTexture', x),
    texImage2D: (...a) => call('texImage2D', a[3], a[4]),
    texParameteri: () => call('texParameteri'),
    deleteTexture: (x) => call('deleteTexture', x),
    createFramebuffer: () => { call('createFramebuffer'); return { __f: nextId++ }; },
    bindFramebuffer: (t, x) => call('bindFramebuffer', x),
    framebufferTexture2D: () => call('framebufferTexture2D'),
    checkFramebufferStatus: () => gl.FRAMEBUFFER_COMPLETE,
    deleteFramebuffer: (x) => call('deleteFramebuffer', x),
    createBuffer: () => { call('createBuffer'); return { __b: nextId++ }; },
    bindBuffer: (t, x) => call('bindBuffer', x),
    bufferData: () => call('bufferData'),
    deleteBuffer: (x) => call('deleteBuffer', x),
    viewport: (x, y, w, h) => call('viewport', w, h),
    disable: (x) => call('disable', x),
    useProgram: (p) => call('useProgram', p),
    drawArrays: (m, f, c) => call('drawArrays', c),
    enableVertexAttribArray: (i) => call('enableVertexAttribArray', i),
    vertexAttribPointer: () => call('vertexAttribPointer'),
    disableVertexAttribArray: (i) => call('disableVertexAttribArray', i),
    activeTexture: (x) => call('activeTexture', x),
    uniform1i: (l, v) => call('uniform1i', l.__loc, v),
    uniform1f: (l, v) => call('uniform1f', l.__loc, v),
    uniform2f: (l, a, b) => call('uniform2f', l.__loc, a, b),
    uniform4f: (l, a, b, c, d) => call('uniform4f', l.__loc, a, b, c, d),
  };
  return gl;
}

const mockCanvas = () => ({
  width: 400, height: 280,
  addEventListener() {}, removeEventListener() {},
});

function makeBridge(gl, w = 400, h = 280) {
  const bridge = createBridge(gl, mockCanvas(), { width: w, height: h, dpr: 1 });
  registerBuiltinEffects(bridge);
  return bridge;
}

const chainOf = (...kinds) => kinds.map((kind) => ({
  kind, params: kind === 'rgbSplit' ? { dx: 3 } : kind === 'grain' ? { amount: 0.4 } : {},
}));

ok('bridge exposes the contract version', () => {
  assert.equal(BRIDGE_VERSION, 1);
  const gl = makeMockGl();
  assert.equal(makeBridge(gl).version, 1);
});

ok('programs compile once across frames; locations cached', () => {
  const gl = makeMockGl({ nullUniforms: ['u_res'] });
  const bridge = makeBridge(gl);
  const L = bridge.layer('fx1');
  for (let i = 0; i < 3; i++) bridge.runChain('fx1', L.t0, chainOf('invert', 'rgbSplit'));
  assert.equal(gl.count('createProgram'), 1, 'one program for three frames');
  for (const uname of ['u_src', 'u_aux', 'u_effect', 'u_p', 'u_texel', 'u_clipOn']) {
    const c = gl.withName('getUniformLocation').filter((x) => x.args[0] === uname).length;
    assert.equal(c, 1, `location cached for ${uname}`);
  }
});

ok('uniform uploads are dirty-checked', () => {
  const gl = makeMockGl({ nullUniforms: ['u_res'] });
  const bridge = makeBridge(gl);
  const L = bridge.layer('fx1');
  const steps = chainOf('rgbSplit');
  bridge.runChain('fx1', L.t0, steps);
  const afterFirst = gl.count('uniform4f') + gl.count('uniform1i') + gl.count('uniform1f') + gl.count('uniform2f');
  bridge.runChain('fx1', L.t0, chainOf('rgbSplit')); // identical params
  const afterSecond = gl.count('uniform4f') + gl.count('uniform1i') + gl.count('uniform1f') + gl.count('uniform2f');
  assert.equal(afterSecond, afterFirst, 'identical frame uploads nothing');
  bridge.runChain('fx1', L.t0, [{ kind: 'rgbSplit', params: { dx: 9 } }]); // one param changes
  const u4 = gl.withName('uniform4f');
  assert.equal(u4.length, 2, 'only the changed u_p re-uploads');
  assert.deepEqual(u4[1].args.slice(1), [9 / 1000, 0, 0, 0]);
});

ok('chain runs top-down with ping-pong targets', () => {
  const gl = makeMockGl({ nullUniforms: ['u_res'] });
  const bridge = makeBridge(gl);
  const L = bridge.layer('fx1');
  const out = bridge.runChain('fx1', L.t0, chainOf('invert', 'rgbSplit'));
  const fbs = gl.withName('bindFramebuffer').map((c) => c.args[0]);
  // framebuffer binds: makeTarget unbinds (null) twice per target, then the two passes
  const passFbs = fbs.slice(-2);
  assert.equal(passFbs[0], L.t1.fb, 'pass 1 writes t1');
  assert.equal(passFbs[1], L.t0.fb, 'pass 2 writes t0');
  assert.equal(out, L.t0, 'chain returns the final read target');
  const modes = gl.withName('uniform1i').filter((c) => c.args[0] === 'u_effect').map((c) => c.args[1]);
  assert.deepEqual(modes, [0, 1], 'top-down mode order');
});

ok('blur expands to two separable passes', () => {
  const gl = makeMockGl({ nullUniforms: ['u_res'] });
  const bridge = makeBridge(gl);
  const L = bridge.layer('fx1');
  bridge.runChain('fx1', L.t0, [{ kind: 'blur', params: { radius: 6 } }]);
  const modes = gl.withName('uniform1i').filter((c) => c.args[0] === 'u_effect').map((c) => c.args[1]);
  assert.deepEqual(modes, [3, 4], 'blurH then blurV');
  const sigmas = gl.withName('uniform4f').map((c) => c.args[1]);
  const expected = Math.max(0.5, 6 * (400 / 1000));
  assert.ok(sigmas.every((s) => Math.abs(s - expected) < 1e-9), 'sigma scaled by write width');
});

ok('u_texel and u_res reflect the write target size', () => {
  const gl = makeMockGl({ nullUniforms: ['u_res'] });
  const bridge = makeBridge(gl);
  const L = bridge.layer('fx1');
  bridge.runChain('fx1', L.t0, chainOf('invert'));
  const texel = gl.withName('uniform2f').filter((c) => c.args[0] === 'u_texel');
  assert.equal(texel.length, 1);
  assert.ok(Math.abs(texel[0].args[1] - 1 / 400) < 1e-12);
  assert.ok(Math.abs(texel[0].args[2] - 1 / 280) < 1e-12);
  // u_res has no location in EFFECT_FS (optimized out) — skipped, never crashes
  assert.ok(!gl.withName('uniform2f').some((c) => c.args[0] === 'u_res'));
});

ok('unknown effect kinds fail closed', () => {
  const gl = makeMockGl();
  const bridge = makeBridge(gl);
  const L = bridge.layer('fx1');
  assert.throws(() => bridge.runChain('fx1', L.t0, [{ kind: 'displace', params: {} }]), /unknown effect kind/);
});

ok('defineEffect rejects unregistered programs', () => {
  const gl = makeMockGl();
  const bridge = createBridge(gl, mockCanvas(), {});
  assert.throws(
    () => bridge.defineEffect('nope', { program: 'missing', passes: [] }),
    /not registered/
  );
});

ok('zero GL allocation per frame after warmup', () => {
  const gl = makeMockGl({ nullUniforms: ['u_res'] });
  const bridge = makeBridge(gl);
  const L = bridge.layer('fx1');
  bridge.runChain('fx1', L.t0, chainOf('invert', 'rgbSplit', 'grain'));
  const snap = ['createTexture', 'createFramebuffer', 'createBuffer', 'createProgram']
    .map((k) => gl.count(k));
  for (let i = 0; i < 3; i++) bridge.runChain('fx1', L.t0, chainOf('invert', 'rgbSplit', 'grain'));
  const now = ['createTexture', 'createFramebuffer', 'createBuffer', 'createProgram']
    .map((k) => gl.count(k));
  assert.deepEqual(now, snap, 'no per-frame allocation');
});

ok('resize reallocates FBOs without recompiling shaders', () => {
  const gl = makeMockGl({ nullUniforms: ['u_res'] });
  const bridge = makeBridge(gl);
  const L = bridge.layer('fx1');
  bridge.runChain('fx1', L.t0, chainOf('invert'));
  const texSizes = gl.withName('texImage2D').map((c) => [c.args[0], c.args[1]]);
  assert.ok(texSizes.every(([w, h]) => w === 400 && h === 280));
  bridge.resize(800, 560, 1);
  const L2 = bridge.layer('fx1');
  assert.equal(L2.t0.w, 800);
  assert.equal(L2.t0.h, 560);
  assert.equal(gl.count('createProgram'), 1, 'resize never recompiles');
  bridge.runChain('fx1', L2.t0, chainOf('invert'));
  const texel = gl.withName('uniform2f').filter((c) => c.args[0] === 'u_texel').pop();
  assert.ok(Math.abs(texel.args[1] - 1 / 800) < 1e-12, 'u_texel re-uploaded at new size');
});

ok('context loss drops handles, pauses the chain, restore rebuilds', () => {
  const gl = makeMockGl({ nullUniforms: ['u_res'] });
  const bridge = makeBridge(gl);
  const L = bridge.layer('fx1');
  bridge.runChain('fx1', L.t0, chainOf('invert'));
  assert.equal(bridge.lost, false);
  bridge.handleContextLost();
  assert.equal(bridge.lost, true);
  assert.ok(gl.count('deleteProgram') >= 1, 'programs dropped');
  assert.ok(gl.count('deleteTexture') >= 2, 'textures dropped');
  assert.throws(() => bridge.runChain('fx1', L.t0, chainOf('invert')), /context lost/);
  const progsBefore = gl.count('createProgram');
  bridge.handleContextRestored();
  assert.equal(bridge.lost, false);
  assert.ok(gl.count('createProgram') > progsBefore, 'programs recompiled on restore');
  const L2 = bridge.layer('fx1'); // targets rebuild
  assert.ok(L2.t0 && L2.t1, 'FBOs rebuilt');
  bridge.runChain('fx1', L2.t0, chainOf('invert')); // resumes without throwing
});

ok('pad descriptor allocates padded targets', () => {
  const gl = makeMockGl({ nullUniforms: ['u_res'] });
  const bridge = makeBridge(gl);
  const L = bridge.layer('fx1');
  assert.equal(L.padT0, null, 'no padded targets without pad effects');
  bridge.defineEffect('wide', {
    program: 'effect',
    pad: 16,
    passes: [{ mode: 0, params: () => [0, 0, 0, 0] }],
  });
  const L2 = bridge.layer('fx1');
  assert.equal(L2.padT0.w, 400 + 32);
  assert.equal(L2.padT0.h, 280 + 32);
  bridge.runChain('fx1', L2.t0, [{ kind: 'wide', params: {} }]);
  const passFbs = gl.withName('bindFramebuffer').map((c) => c.args[0]).slice(-1);
  assert.equal(passFbs[0], L2.padT0.fb, 'padded pass writes the padded target');
});

ok('stats expose the dev instrumentation counters', () => {
  const gl = makeMockGl({ nullUniforms: ['u_res'] });
  const bridge = makeBridge(gl);
  const L = bridge.layer('fx1');
  bridge.runChain('fx1', L.t0, chainOf('invert'));
  const s = bridge.stats();
  assert.equal(s.programsCompiled, 1);
  assert.ok(s.targetsAllocated >= 2);
  assert.ok(s.uniformUploads > 0);
  assert.ok(s.uniformSkips >= 0);
  assert.equal(s.contextLosses, 0);
  assert.equal(s.framesRun, 1);
});

ok('passes may supply a custom uniform map (#195 template)', () => {
  const gl = makeMockGl();
  const bridge = makeBridge(gl);
  bridge.registerProgram('custom', 'vs-src', 'fs-src', {
    uniforms: {
      u_tex: { kind: 'sampler', unit: 0 },
      u_res: { kind: 'vec2' },
      u_time: { kind: 'float' },
      u_amount: { kind: 'float' },
    },
  });
  bridge.defineEffect('customFx', {
    program: 'custom',
    pad: 0,
    passes: [{
      uniforms: (step, { read, wTarget, time }) => ({
        u_tex: read.tex,
        u_res: [wTarget.w, wTarget.h],
        u_time: time,
        u_amount: step.params.amount ?? 0.5,
      }),
    }],
  });
  const L = bridge.layer('fx1');
  bridge.runChain('fx1', L.t0, [{ kind: 'customFx', params: { amount: 0.25 } }], { time: 2.5 });
  const t = gl.withName('uniform1f').filter((c) => c.args[0] === 'u_time');
  assert.equal(t.length, 1, 'u_time reaches the pass');
  assert.equal(t[0].args[1], 2.5);
  const a = gl.withName('uniform1f').filter((c) => c.args[0] === 'u_amount');
  assert.equal(a[0].args[1], 0.25);
});

console.log(`bridge.selfcheck: OK (${n} cases)`);
