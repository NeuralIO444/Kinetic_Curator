/**
 * False-color / NaN-flag debug views — harness Layer 2 (#193).
 *
 * Browser-safe. Renders a source texture through a debug view shader into
 * the currently-bound framebuffer:
 *
 * - `nan`: non-finite pixels (NaN/Inf) painted bright magenta — the classic
 *   "everything went black" becomes a visible diagnosis.
 * - `alpha`: alpha channel visualized as red.
 * - `luminance`: luminance visualized as a blue→cyan→yellow→red heat ramp.
 * - `range`: out-of-[0,1] values painted magenta, everything else passed
 *   through untouched.
 *
 * Orientation: texture row 0 renders to output row 0 (no v-flip), so a
 * readPixels of the output lines up 1:1 with the uploaded texture rows.
 */

import { buildProgramChecked, auditProgramChecked, checkGlError } from './diagnostics.mjs';

export const FLAG_VIEWS = Object.freeze({
  NAN: 'nan',
  ALPHA: 'alpha',
  LUMINANCE: 'luminance',
  RANGE: 'range',
});

const VIEW_IDS = Object.freeze({ nan: 0, alpha: 1, luminance: 2, range: 3 });

const VS = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform int u_view;
in vec2 v_uv;
out vec4 o_color;

vec3 heat(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 col = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), smoothstep(0.00, 0.34, t));
  col = mix(col, vec3(1.0, 1.0, 0.0), smoothstep(0.34, 0.67, t));
  col = mix(col, vec3(1.0, 0.0, 0.0), smoothstep(0.67, 1.00, t));
  return col;
}

void main() {
  vec4 c = texture(u_src, v_uv);
  if (u_view == 0) {
    // Note: GLSL ES has isnan/isinf but no isfinite — spell it out.
    bool bad = isnan(c.r) || isnan(c.g) || isnan(c.b) || isnan(c.a)
            || isinf(c.r) || isinf(c.g) || isinf(c.b) || isinf(c.a);
    o_color = bad ? vec4(1.0, 0.0, 1.0, 1.0) : vec4(0.0, 0.0, 0.0, 1.0);
  } else if (u_view == 1) {
    o_color = vec4(c.a, 0.0, 0.0, 1.0);
  } else if (u_view == 2) {
    float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    o_color = vec4(heat(l), 1.0);
  } else {
    bool oor = c.r < 0.0 || c.r > 1.0
            || c.g < 0.0 || c.g > 1.0
            || c.b < 0.0 || c.b > 1.0
            || c.a < 0.0 || c.a > 1.0;
    o_color = oor ? vec4(1.0, 0.0, 1.0, 1.0) : c;
  }
}
`;

export function createFlagPass(gl) {
  const prog = buildProgramChecked(gl, VS, FS, {
    name: 'flagPass',
    vsFile: 'flagPass.vs.glsl',
    fsFile: 'flagPass.fs.glsl',
  });
  auditProgramChecked(gl, prog, ['u_src', 'u_view'], {
    name: 'flagPass',
    file: 'flagPass.fs.glsl',
  });
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // Fullscreen triangle; uv 0..1 maps 1:1 to texture rows (no flip).
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const u_src = gl.getUniformLocation(prog, 'u_src');
  const u_view = gl.getUniformLocation(prog, 'u_view');

  return {
    /** Render `view` of `srcTex` into the currently-bound framebuffer. */
    render(srcTex, view, w, h) {
      const id = VIEW_IDS[view];
      if (id === undefined) throw new Error(`[gl-debug] unknown flag view: ${view}`);
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(u_src, 0);
      gl.uniform1i(u_view, id);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      checkGlError(gl, 'flagPass.render');
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
    },
  };
}
