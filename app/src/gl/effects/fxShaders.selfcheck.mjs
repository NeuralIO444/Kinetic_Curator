// fxShaders.selfcheck.mjs — Phase-2 FX shader library (#188).
//
// The five template effects are browser-safe; these tests run in Node
// against a mock WebGL2 implementation (same pattern as
// template.selfcheck.mjs). They prove the #188 contract:
//   - one fragment shader + one param descriptor per effect
//   - descriptors mirror the SVG-side FX_EFFECT_DEFS ranges/defaults
//   - static + runtime uniform audits pass at registration
//   - all five run top-down through the bridge with zero runner changes
//   - compileFxShaders is the GL compiler: sanitize -> chain steps,
//     unknown kinds fail closed (dropped, never crash)
//   - noise comes from the shared chunk library — no effect reimplements it
import assert from 'node:assert';
import { createBridge } from '../bridge/bridge.mjs';
import {
  registerTemplateEffect,
  getTemplateEffect,
  templateEffectKinds,
  auditEffectSource,
  validateDescriptor,
  __clearTemplateRegistry,
} from './template.mjs';
import { FX_EFFECT_DEFS } from '../../fx/fxFilters.js';
import {
  FX_SHADER_EFFECTS,
  FX_SHADER_KINDS,
  FX_DISPLACE_FS,
  registerFxShaders,
  compileFxShaders,
  fxChunksUsed,
} from './fxShaders.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const parseUniforms = (src) => {
  const names = [];
  const re = /uniform\s+\w+\s+(\w+)\s*;/g;
  let m;
  while ((m = re.exec(src))) names.push(m[1]);
  return names;
};

/** WebGL2 mock that derives active uniforms from the attached FS source. */
function makeMockGl() {
  const calls = [];
  let nextId = 1;
  const call = (name, ...args) => { calls.push({ name, args }); };
  const shaders = new Map();
  const attached = new Map();
  const activeNames = (p) => {
    const list = attached.get(p) || [];
    const fs = list.map((s) => shaders.get(s)).find((s) => s && s.type === 'fs');
    return fs ? parseUniforms(fs.src) : [];
  };
  const gl = {
    VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82, ACTIVE_UNIFORMS: 0x8b86,
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
    createShader: (t) => {
      call('createShader', t);
      const s = { __s: nextId++, type: t === gl.VERTEX_SHADER ? 'vs' : 'fs', src: '' };
      shaders.set(s, s);
      return s;
    },
    shaderSource: (s, src) => { shaders.get(s).src = src; call('shaderSource'); },
    compileShader: (s) => call('compileShader'),
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    deleteShader: (s) => call('deleteShader'),
    createProgram: () => { call('createProgram'); const p = { __p: nextId++ }; attached.set(p, []); return p; },
    attachShader: (p, s) => { attached.get(p).push(s); call('attachShader'); },
    linkProgram: (p) => call('linkProgram'),
    getProgramParameter: (p, pname) => (pname === gl.ACTIVE_UNIFORMS ? activeNames(p).length : true),
    getActiveUniform: (p, i) => ({ name: activeNames(p)[i] }),
    getProgramInfoLog: () => '',
    deleteProgram: (p) => call('deleteProgram'),
    getUniformLocation: (p, uname) => { call('getUniformLocation', uname); return { __loc: uname }; },
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

function makeFxBridge(gl) {
  __clearTemplateRegistry();
  const bridge = createBridge(gl, mockCanvas(), { width: 400, height: 280, dpr: 1 });
  registerFxShaders(bridge, gl);
  return bridge;
}

ok('all five Phase-2 kinds are declared', () => {
  assert.deepEqual([...FX_SHADER_KINDS].sort(), ['displace', 'edge', 'scanlines', 'solarize', 'tear']);
});

ok('descriptors validate and mirror the SVG-side FX catalog', () => {
  for (const [kind, def] of FX_SHADER_EFFECTS) {
    const svgDef = FX_EFFECT_DEFS[kind];
    assert.ok(svgDef, `SVG catalog has ${kind}`);
    const d = validateDescriptor(kind, def.descriptor);
    assert.equal(d.label, svgDef.label, `${kind}: label matches SVG catalog`);
    for (const [pname, p] of Object.entries(svgDef.params)) {
      const tp = d.params[pname];
      assert.ok(tp, `${kind}: param ${pname} present`);
      assert.equal(tp.min, p.min, `${kind}.${pname}: min`);
      assert.equal(tp.max, p.max, `${kind}.${pname}: max`);
      assert.equal(tp.def, p.def, `${kind}.${pname}: def`);
    }
    assert.equal(Object.keys(d.params).length, Object.keys(svgDef.params).length, `${kind}: no extra params`);
    assert.equal(d.pad, 0, `${kind}: pad 0 (padded routing is Phase-3 work)`);
    assert.equal(d.animated, false, `${kind}: not animated`);
  }
});

ok('static source audit is clean for every effect', () => {
  for (const [kind, def] of FX_SHADER_EFFECTS) {
    const d = validateDescriptor(kind, def.descriptor);
    const audit = auditEffectSource(def.fs, d);
    assert.deepEqual(audit.missingInShader, [], `${kind}: no missing uniforms`);
    assert.deepEqual(audit.extraInShader, [], `${kind}: no extra uniforms`);
    assert.ok(def.fs.startsWith('#version 300 es'), `${kind}: version directive first`);
    assert.ok(def.fs.includes('in vec2 v_cuv;'), `${kind}: reads v_cuv`);
  }
});

ok('registration wires all five into the template registry', () => {
  const gl = makeMockGl();
  makeFxBridge(gl);
  const kinds = templateEffectKinds();
  for (const kind of FX_SHADER_KINDS) {
    assert.ok(kinds.includes(kind), `registry has ${kind}`);
    const rec = getTemplateEffect(kind);
    assert.equal(rec.warnings.length, 0, `${kind}: no runtime audit warnings`);
  }
});

ok('duplicate registration fails closed', () => {
  const gl = makeMockGl();
  const bridge = makeFxBridge(gl);
  const [kind, def] = FX_SHADER_EFFECTS[0];
  assert.throws(() => registerTemplateEffect(bridge, gl, kind, def), /already registered/);
});

ok('all five run top-down through the bridge (one pass each)', () => {
  const gl = makeMockGl();
  const bridge = makeFxBridge(gl);
  const L = bridge.layer('fx1');
  const steps = compileFxShaders([
    { kind: 'displace', params: { scale: 24, seed: 7 } },
    { kind: 'tear', params: { bands: 18, amount: 12 } },
    { kind: 'scanlines', params: { density: 0.35, amount: 0.5 } },
    { kind: 'solarize', params: {} },
    { kind: 'edge', params: {} },
  ]);
  assert.equal(steps.length, 5);
  const before = gl.count('drawArrays');
  const out = bridge.runChain('fx1', L.t0, steps);
  assert.equal(gl.count('drawArrays') - before, 5, 'one fullscreen pass per effect');
  assert.ok(out && out.tex, 'chain returns a target');
  // Param values reach the GPU: displace scale default 24 as float.
  const f1 = gl.withName('uniform1f').filter((c) => c.args[0] === 'u_scale');
  assert.ok(f1.length >= 1 && f1[0].args[1] === 24, 'u_scale uploaded');
  const i1 = gl.withName('uniform1i').filter((c) => c.args[0] === 'u_seed');
  assert.ok(i1.length >= 1 && i1[0].args[1] === 7, 'u_seed uploaded as int');
});

ok('compileFxShaders fails closed on unknown kinds and bad params', () => {
  const steps = compileFxShaders([
    { kind: 'displace', params: { scale: 9999, seed: -5 } }, // clamped
    { kind: 'nope', params: {} },                            // dropped
    null,                                                    // dropped
    { kind: 'edge' },                                        // params default to {}
  ]);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].kind, 'displace');
  assert.equal(steps[0].params.scale, 120, 'scale clamped to max');
  assert.equal(steps[0].params.seed, 0, 'seed clamped to min');
  assert.equal(steps[0].aux, null, 'no aux by default');
  assert.equal(steps[1].kind, 'edge');
  assert.deepEqual(steps[1].params, {});
});

ok('#590: displace warp is additive — 0 is the legacy effect, and the block is guarded', () => {
  const d = getTemplateEffect('displace').descriptor;
  assert.ok(d.params.warp, 'displace must expose a warp param');
  assert.strictEqual(d.params.warp.def, 0, 'the default must be the legacy effect');
  assert.strictEqual(d.params.warp.min, 0);
  // Guarded, not multiplied: at warp 0 the branch is skipped and np is the
  // identical expression, which is why warp-0 output is bit-identical rather
  // than merely within a tolerance. A "* u_warp" form would still pay for the
  // lookup and could carry a 0*NaN through.
  assert.ok(/if \(u_warp > 0\.0\)/.test(FX_DISPLACE_FS), 'the warp lookup must be branch-guarded');
  assert.ok(FX_DISPLACE_FS.includes('uniform float u_warp;'), 'u_warp must be declared');
  // Sanitization still clamps it like every other param.
  const steps = compileFxShaders([{ kind: 'displace', params: { scale: 24, seed: 7, warp: 999 } }]);
  assert.ok(steps[0].params.warp <= 60, 'warp clamps to its descriptor max');
  assert.strictEqual(compileFxShaders([{ kind: 'displace', params: { scale: 24, seed: 7, warp: NaN } }])[0].params.warp, 0,
    'a non-finite warp falls back to the legacy default');
});

ok('compileFxShaders wires aux textures per kind', () => {
  const fakeAux = { tex: 'lut' };
  const steps = compileFxShaders(
    [{ kind: 'grain', params: { amount: 0.4 } }, { kind: 'edge', params: {} }],
    { auxFor: (kind) => (kind === 'grain' ? fakeAux : null) },
  );
  assert.equal(steps[0].aux, fakeAux, 'grain gets its aux');
  assert.equal(steps[1].aux, null, 'edge gets none');
});

ok('noise comes from the shared chunk library — never reimplemented', () => {
  const used = fxChunksUsed();
  assert.deepEqual(used.displace.sort(), ['kc_fbm']);
  assert.deepEqual(used.tear.sort(), ['kc_vnoise']);
  assert.deepEqual(used.scanlines.sort(), ['kc_fbm']);
  assert.deepEqual(used.solarize, []);
  assert.deepEqual(used.edge, []);
  for (const [kind, def] of FX_SHADER_EFFECTS) {
    const local = /float\s+kc_\w+\s*\(|vec2\s+kc_\w+\s*\(/.test(def.fs);
    assert.equal(local, false, `${kind}: defines no kc_ functions of its own`);
  }
});

console.log(`fxShaders.selfcheck: OK (${n} cases)`);
