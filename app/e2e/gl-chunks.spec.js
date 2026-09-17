// gl-chunks.spec.js — chunk library GPU render tests (#196, order:07).
//
// Renders every common.glsl chunk through real WebGL2 (SwiftShader in the
// e2e-smoke CI job) and compares each pixel against the JS CPU reference
// with tolerance. The debug harness page tests (selfcheck.page.mjs) cover
// the same path on dev machines; this spec is the CI gate.
import { test, expect } from '@playwright/test';
import { auditChunks, injectCommon } from '../src/gl/effects/chunks.mjs';
import * as ref from '../src/gl/effects/chunkReference.mjs';

const W = 8;
const H = 8;
const TOL = 0.02; // 8-bit quantization + float32-vs-float64 slop

// Each case: a main() body using `p` (gl_FragCoord.xy), and a JS reference
// returning [r, g, b] for pixel-center (x, y).
const CASES = [
  {
    name: 'kc_hash12',
    body: 'o = vec4(kc_hash12(p), 0.0, 0.0, 1.0);',
    ref: (x, y) => [ref.refHash12(x, y), 0, 0],
  },
  {
    name: 'kc_hash22',
    body: 'o = vec4(kc_hash22(p), 0.0, 1.0);',
    ref: (x, y) => { const h = ref.refHash22(x, y); return [h[0], h[1], 0]; },
  },
  {
    name: 'kc_vnoise',
    body: 'o = vec4(kc_vnoise(p * 0.35), 0.0, 0.0, 1.0);',
    ref: (x, y) => [ref.refVnoise(x * 0.35, y * 0.35), 0, 0],
  },
  {
    name: 'kc_fbm',
    body: 'o = vec4(kc_fbm(p * 0.2, 3), 0.0, 0.0, 1.0);',
    ref: (x, y) => [ref.refFbm(x * 0.2, y * 0.2, 3), 0, 0],
  },
  {
    name: 'kc_luma',
    body: 'o = vec4(vec3(kc_luma(vec3(p.x / 8.0, p.y / 8.0, 0.25))), 1.0);',
    ref: (x, y) => { const l = ref.refLuma(x / 8, y / 8, 0.25); return [l, l, l]; },
  },
  {
    name: 'kc_rgb2hsl',
    body: 'o = vec4(kc_rgb2hsl(vec3(p.x / 8.0, p.y / 8.0, 0.5)), 1.0);',
    ref: (x, y) => ref.refRgb2hsl(x / 8, y / 8, 0.5),
  },
  {
    name: 'kc_hsl2rgb',
    body: 'o = vec4(kc_hsl2rgb(vec3(p.x / 8.0, 0.8, p.y / 8.0)), 1.0);',
    ref: (x, y) => ref.refHsl2rgb(x / 8, 0.8, y / 8),
  },
  {
    name: 'kc_srgb2lin',
    body: 'o = vec4(kc_srgb2lin(p.x / 8.0), 0.0, 0.0, 1.0);',
    ref: (x) => [ref.refSrgb2lin(x / 8), 0, 0],
  },
  {
    name: 'kc_lin2srgb',
    body: 'o = vec4(kc_lin2srgb(p.x / 8.0), 0.0, 0.0, 1.0);',
    ref: (x) => [ref.refLin2srgb(x / 8), 0, 0],
  },
  {
    name: 'kc_ign',
    body: 'o = vec4(kc_ign(p), 0.0, 0.0, 1.0);',
    ref: (x, y) => [ref.refIgn(x, y), 0, 0],
  },
  {
    name: 'kc_dither',
    body: 'o = vec4(kc_dither(p) + 0.5, 0.0, 0.0, 1.0);',
    ref: (x, y) => [ref.refDither(x, y) + 0.5, 0, 0],
  },
  {
    name: 'kc_uv_centered',
    body: 'vec2 c = kc_uv_centered(p / 8.0); o = vec4(c * 0.5 + 0.5, 0.0, 1.0);',
    ref: (x, y) => { const c = ref.refUvCentered(x / 8, y / 8); return [c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5, 0]; },
  },
  {
    name: 'kc_uv_aspect',
    body: 'vec2 c = kc_uv_aspect(p / 8.0, vec2(8.0, 4.0)); o = vec4(c * 0.25 + 0.5, 0.0, 1.0);',
    ref: (x, y) => { const c = ref.refUvAspect(x / 8, y / 8, 8, 4); return [c[0] * 0.25 + 0.5, c[1] * 0.25 + 0.5, 0]; },
  },
];

const fsSrcFor = (body) => injectCommon(`#version 300 es
precision highp float;
out vec4 o;
void main() {
  vec2 p = gl_FragCoord.xy;
  ${body}
}
`);

/** Render one fragment source to W×H RGBA8 in the page; null when no WebGL2. */
async function renderInPage(page, fsSrc) {
  return page.evaluate(({ fsSrc, w, h }) => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return null;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('chunk shader compile failed: ' + gl.getShaderInfoLog(s));
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER,
      '#version 300 es\nlayout(location=0) in vec2 a_pos;\nvoid main(){gl_Position=vec4(a_pos,0.,1.);}');
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('chunk program link failed: ' + gl.getProgramInfoLog(prog));
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const out = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return Array.from(out);
  }, { fsSrc, w: W, h: H });
}

test.describe('GLSL chunk library', () => {
  test('library audit is clean (pure, prefixed, versioned)', () => {
    expect(auditChunks().errors).toEqual([]);
  });

  test('every chunk renders like the CPU reference', async ({ page }) => {
    await page.goto('/');
    for (const c of CASES) {
      const px = await renderInPage(page, fsSrcFor(c.body));
      if (px === null) test.skip(true, 'WebGL2 unavailable in this browser');
      const bad = [];
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
          const want = c.ref(i + 0.5, j + 0.5);
          for (let k = 0; k < 3; k++) {
            const got = px[(j * W + i) * 4 + k] / 255;
            if (Math.abs(got - want[k]) > TOL) {
              bad.push(`${c.name} pixel(${i},${j}) ch${k}: got ${got.toFixed(4)} want ${want[k].toFixed(4)}`);
            }
          }
        }
      }
      expect(bad, c.name).toEqual([]);
    }
  });
});
