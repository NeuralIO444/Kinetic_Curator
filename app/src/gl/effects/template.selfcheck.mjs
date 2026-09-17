// template.selfcheck.mjs — GLSL effect authoring template (#195).
//
// The template is browser-safe; these tests run in Node against a mock
// WebGL2 implementation that records every call (same pattern as
// bridge.selfcheck.mjs). They prove the #195 contract:
//   - one effect = one fragment shader + one param descriptor
//   - param -> uniform binding with the u_tex/u_res/u_time/u_<param> names
//   - uniform audits surface mismatches at load, never silently
//   - the FX panel renders controls from the descriptor with no UI code
//   - chains run top-down through the bridge with zero runner changes
import assert from 'node:assert';
import { createBridge, BRIDGE_VERSION } from '../bridge/bridge.mjs';
import {
  TEMPLATE_VERSION,
  TEMPLATE_VS,
  validateDescriptor,
  defaultParams,
  sanitizeParams,
  uniformDecls,
  uploadUniformsFor,
  controlSpecs,
  auditEffectSource,
  registerTemplateEffect,
  getTemplateEffect,
  templateEffectKinds,
  __clearTemplateRegistry,
} from './template.mjs';
import { TEMPLATE_EXAMPLES } from './examples.mjs';
import { TemplateEffectControls } from './TemplateEffectControls.mjs';

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

function makeTemplateBridge(gl) {
  __clearTemplateRegistry();
  const bridge = createBridge(gl, mockCanvas(), { width: 400, height: 280, dpr: 1 });
  for (const [kind, def] of TEMPLATE_EXAMPLES) registerTemplateEffect(bridge, gl, kind, def);
  return bridge;
}

ok('template version + shared fixed vertex shader', () => {
  assert.equal(TEMPLATE_VERSION, 1);
  assert.ok(TEMPLATE_VS.includes('v_cuv'), 'vertex shader outputs v_cuv');
  assert.ok(TEMPLATE_VS.includes('#version 300 es'), 'GLSL ES 3.0');
});

ok('validateDescriptor accepts good descriptors', () => {
  for (const [, def] of TEMPLATE_EXAMPLES) {
    const d = validateDescriptor('x', def.descriptor);
    assert.ok(Object.isFrozen(d), 'descriptor frozen');
  }
});

ok('validateDescriptor rejects bad descriptors', () => {
  const bad = [
    [{}, /label/],
    [{ label: 'x', params: { a: { type: 'nope', label: 'A', def: 0 } } }, /unknown type/],
    [{ label: 'x', params: { a: { type: 'float', label: 'A', min: 5, max: 1, def: 2 } } }, /min > max/],
    [{ label: 'x', params: { a: { type: 'int', label: 'A', min: 0, max: 4, def: 9 } } }, /def outside/],
    [{ label: 'x', params: { a: { type: 'bool', label: 'A', def: 'yes' } } }, /boolean/],
    [{ label: 'x', params: { a: { type: 'color', label: 'A', def: [1, 0, 0] } } }, /\[r, g, b, a\]/],
    [{ label: 'x', pad: -1 }, /pad/],
    [{ label: 'x', params: { 'Bad Name': { type: 'float', label: 'A', min: 0, max: 1, def: 0 } } }, /snake_case/],
  ];
  for (const [desc, re] of bad) {
    assert.throws(() => validateDescriptor('bad', desc), re, JSON.stringify(desc));
  }
});

ok('sanitizeParams clamps, defaults, and drops unknown keys', () => {
  const d = validateDescriptor('p', TEMPLATE_EXAMPLES[1][1].descriptor); // tmplPoster
  assert.deepEqual(sanitizeParams(d, { levels: 99 }), { levels: 8 });
  assert.deepEqual(sanitizeParams(d, { levels: 1 }), { levels: 2 });
  assert.deepEqual(sanitizeParams(d, {}), { levels: 4 });
  assert.deepEqual(sanitizeParams(d, { levels: 5, nope: 1 }), { levels: 5 });
  const g = validateDescriptor('g', TEMPLATE_EXAMPLES[2][1].descriptor); // tmplGrain
  assert.deepEqual(sanitizeParams(g, { amount: 2 }), { amount: 1 });
  assert.deepEqual(defaultParams(g), { amount: 0.4 });
});

ok('uniformDecls maps param types; u_time only when animated', () => {
  const poster = validateDescriptor('p', TEMPLATE_EXAMPLES[1][1].descriptor);
  const grain = validateDescriptor('g', TEMPLATE_EXAMPLES[2][1].descriptor);
  assert.deepEqual(uniformDecls(poster), {
    u_tex: { kind: 'sampler', unit: 0 },
    u_res: { kind: 'vec2' },
    u_levels: { kind: 'int' },
  });
  assert.equal(uniformDecls(grain).u_time.kind, 'float');
  assert.equal(uniformDecls(grain).u_amount.kind, 'float');
  assert.ok(!('u_time' in uniformDecls(poster)), 'non-animated effects skip u_time');
});

ok('controlSpecs describe panel controls with no per-effect code', () => {
  const poster = validateDescriptor('p', TEMPLATE_EXAMPLES[1][1].descriptor);
  const specs = controlSpecs(poster);
  assert.equal(specs.length, 1);
  assert.deepEqual(
    { name: specs[0].name, ui: specs[0].ui, min: specs[0].min, max: specs[0].max, def: specs[0].def },
    { name: 'levels', ui: 'slider', min: 2, max: 8, def: 4 },
  );
  const all = validateDescriptor('a', {
    label: 'All', params: {
      on: { type: 'bool', label: 'On', def: true },
      tint: { type: 'color', label: 'Tint', def: [1, 0, 0, 1] },
      off: { type: 'vec2', label: 'Offset', min: -10, max: 10, def: [0, 0] },
    },
  });
  const uis = Object.fromEntries(controlSpecs(all).map((s) => [s.name, s.ui]));
  assert.deepEqual(uis, { on: 'toggle', tint: 'color', off: 'slider' });
});

ok('TemplateEffectControls renders from the descriptor only', () => {
  const poster = validateDescriptor('p', TEMPLATE_EXAMPLES[1][1].descriptor);
  const el = TemplateEffectControls({ descriptor: poster, values: {}, onChange: () => {} });
  assert.equal(el.type, 'div');
  const [row] = el.props.children;
  assert.equal(row.type.name, 'SliderRow', 'slider param -> SliderRow');
  assert.equal(row.props.spec.min, 2);
  assert.equal(row.props.spec.max, 8);
  assert.equal(row.props.value, 4, 'missing value falls back to def');

  const tog = validateDescriptor('t', {
    label: 'T', params: { on: { type: 'bool', label: 'On', def: true } },
  });
  const tel = TemplateEffectControls({ descriptor: tog, values: { on: false }, onChange: () => {} });
  assert.equal(tel.props.children[0].type.name, 'ToggleRow');
  assert.equal(tel.props.children[0].props.value, false);

  const v2 = validateDescriptor('v', {
    label: 'V', params: { off: { type: 'vec2', label: 'Offset', min: -10, max: 10, def: [1, 2] } },
  });
  const vel = TemplateEffectControls({ descriptor: v2, values: {}, onChange: () => {} });
  assert.equal(vel.props.children.length, 2, 'vec2 -> X/Y slider pair');
  assert.equal(vel.props.children[0].props.spec.label, 'Offset X');
  assert.equal(vel.props.children[0].props.value, 1);
});

ok('examples pass the static source audit with no warnings', () => {
  for (const [kind, def] of TEMPLATE_EXAMPLES) {
    const d = validateDescriptor(kind, def.descriptor);
    const audit = auditEffectSource(def.fs, d);
    assert.deepEqual(audit, { missingInShader: [], extraInShader: [] }, kind);
  }
});

ok('registration wires effects into the bridge with zero runner changes', () => {
  const gl = makeMockGl();
  const bridge = makeTemplateBridge(gl);
  assert.deepEqual(templateEffectKinds(), ['tmplInvert', 'tmplPoster', 'tmplGrain']);
  for (const kind of templateEffectKinds()) {
    assert.deepEqual(getTemplateEffect(kind).warnings, [], `${kind}: no audit warnings`);
  }
  const L = bridge.layer('fx1');
  const out = bridge.runChain('fx1', L.t0, [
    { kind: 'tmplPoster', params: { levels: 3 } },
    { kind: 'tmplGrain', params: { amount: 0.7 } },
    { kind: 'tmplInvert', params: {} },
  ], { time: 1.5 });
  assert.ok(out === L.t1 || out === L.t0, 'chain returns a bridge-owned target');
  // Param -> uniform binding with the template's naming convention.
  const iLevels = gl.withName('uniform1i').filter((c) => c.args[0] === 'u_levels');
  assert.equal(iLevels.length, 1, 'u_levels uploaded once');
  assert.equal(iLevels[0].args[1], 3);
  const iTime = gl.withName('uniform1f').filter((c) => c.args[0] === 'u_time');
  assert.equal(iTime.length, 1, 'u_time uploaded once (animated effect only)');
  assert.equal(iTime[0].args[1], 1.5);
  const res = gl.withName('uniform2f').filter((c) => c.args[0] === 'u_res');
  assert.ok(res.length >= 1, 'u_res uploaded');
  assert.deepEqual(res[0].args.slice(1), [400, 280]);
});

ok('chain runs top-down: each effect reads the previous output', () => {
  const gl = makeMockGl();
  const bridge = makeTemplateBridge(gl);
  const L = bridge.layer('fx1');
  gl.calls.length = 0; // drop allocation-time binds; only chain passes count
  bridge.runChain('fx1', L.t0, [
    { kind: 'tmplPoster', params: {} },
    { kind: 'tmplGrain', params: {} },
    { kind: 'tmplInvert', params: {} },
  ]);
  // u_tex is bound via bindTexture; the bound texture must ping-pong
  // t0 -> t1 -> t0 across the three steps (#185 top-down order).
  const bound = gl.withName('bindTexture').map((c) => c.args[0]);
  assert.deepEqual(bound, [L.t0.tex, L.t1.tex, L.t0.tex]);
});

ok('uniform uploads are dirty-checked across frames', () => {
  const gl = makeMockGl();
  const bridge = makeTemplateBridge(gl);
  const L = bridge.layer('fx1');
  const steps = [{ kind: 'tmplPoster', params: { levels: 5 } }];
  bridge.runChain('fx1', L.t0, steps, { time: 1 });
  const n1 = gl.count('uniform1i');
  bridge.runChain('fx1', L.t0, steps, { time: 1 });
  assert.equal(gl.count('uniform1i'), n1, 'identical frame uploads nothing');
  bridge.runChain('fx1', L.t0, [{ kind: 'tmplPoster', params: { levels: 6 } }], { time: 1 });
  const last = gl.withName('uniform1i').filter((c) => c.args[0] === 'u_levels').pop();
  assert.equal(last.args[1], 6, 'changed param re-uploads');
});

ok('pad declaration flows to the bridge FBO allocation', () => {
  const gl = makeMockGl();
  __clearTemplateRegistry();
  const bridge = createBridge(gl, mockCanvas(), { width: 400, height: 280, dpr: 1 });
  const FS = TEMPLATE_EXAMPLES[0][1].fs; // invert shader, no out-of-pixel sampling...
  registerTemplateEffect(bridge, gl, 'tmplPad', {
    fs: FS,
    descriptor: { ...TEMPLATE_EXAMPLES[0][1].descriptor, label: 'Padded', pad: 8 },
    file: 'test:tmplPad',
  });
  const L = bridge.layer('fx1');
  assert.ok(L.padT0 && L.padT1, 'padded FBO pair allocated');
  assert.equal(L.padT0.w, 400 + 16);
});

ok('uniform audit fails closed at load on a typo', () => {
  const gl = makeMockGl();
  __clearTemplateRegistry();
  const bridge = createBridge(gl, mockCanvas(), { width: 400, height: 280, dpr: 1 });
  const [, grainDef] = TEMPLATE_EXAMPLES[2];
  assert.throws(
    () => registerTemplateEffect(bridge, gl, 'typo', {
      fs: grainDef.fs, // declares u_amount...
      descriptor: {
        ...grainDef.descriptor,
        params: {
          // ...but the descriptor renamed it to u_amout's param
          amout: { type: 'float', label: 'Amount', min: 0, max: 1, def: 0.4, ui: 'slider' },
        },
      },
      file: 'test:typo',
    }),
    /uniform audit failed.*u_amout/,
    'renamed param surfaces at load, not as silent wrong output',
  );
  assert.throws(
    () => registerTemplateEffect(bridge, gl, 'stray', {
      fs: grainDef.fs, // declares u_amount...
      descriptor: { label: 'Stray', animated: true, params: {} }, // ...but no param claims it
      file: 'test:stray',
    }),
    /uniform audit failed.*u_amount/,
    'shader-side stray uniform surfaces at load',
  );
  registerTemplateEffect(bridge, gl, 'tmplInvert', TEMPLATE_EXAMPLES[0][1]);
  assert.throws(
    () => registerTemplateEffect(bridge, gl, 'tmplInvert', TEMPLATE_EXAMPLES[0][1]),
    /already registered/,
  );
  __clearTemplateRegistry();
});

console.log(`template.selfcheck: OK (${n} cases)`);
