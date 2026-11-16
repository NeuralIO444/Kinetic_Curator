// K3 slice 2b (#2188) — dishContacts RESOLUTION on the GPU: positional depenetration + the dry bounce impulse (restitution
// averaged across the seam, impulse modes only), as per-body DELTAS over the unified body table of 2a. The medium (cling,
// friction, spin) and the side effects (deform, wet stamps, density) are later slices (2d); with no wetness the CPU pass
// reduces to exactly this (pairMed is null), so this is the dry pass, whole.
//
// The CPU pass is sequential in canonical order (a later pair sees an earlier pair's correction). A GPU pass is parallel, so
// it is JACOBI: every body gathers its corrections from the SAME snapshot and they are applied together, AVERAGED over the
// body's contact count (a plain sum would overcorrect a body squeezed by k neighbours k-fold). Documented divergence, in the
// spirit of the leak's Jacobi (slice 1g): for a body in exactly ONE contact (any isolated pair) the result is the CPU pass
// bit-for-bit in structure (float32 in the shader), which the selfcheck pins against the real runDishContacts; dense piles
// are judged by properties (finite, momentum-conserving per pair, overlap shrinks), and the stamped contact list (2c) is what
// makes replay exact on any device.
//
// Pure half (referenceResolve) is the contract and the test oracle; the GL half runs the same maths, one fragment per body
// gathering over every other body (all-pairs, both directions, the same predicate as detection).
const TAU = Math.PI * 2;
const GOLDEN = 2.399963229728653;

/** Pair maths shared by every consumer (float64): the contact between canonical lo < hi, or null. */
function pairContact(t, lo, hi) {
  if (t.stratum[lo] === t.stratum[hi]) return null;
  const ga = t.cgroup[lo];
  const gb = t.cgroup[hi];
  if (!((t.umask[lo] >>> ga) & 1) || !((t.umask[lo] >>> gb) & 1)) return null;
  if (!((t.umask[hi] >>> ga) & 1) || !((t.umask[hi] >>> gb) & 1)) return null;
  const ra = t.r[lo];
  const rb = t.r[hi];
  if (!(ra > 0) || !(rb > 0)) return null;
  const rr = ra + rb;
  const dx = t.x[hi] - t.x[lo];
  const dy = t.y[hi] - t.y[lo];
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return null;
  let dist = Math.sqrt(d2);
  let nx;
  let ny;
  if (dist > 1e-9) {
    nx = dx / dist;
    ny = dy / dist;
  } else {
    const ang = ((t.stratum[lo] * 131 + t.index[lo]) * GOLDEN + (t.stratum[hi] * 131 + t.index[hi]) * 1.2) % TAU;
    nx = Math.cos(ang);
    ny = Math.sin(ang);
    dist = 0;
  }
  return { nx, ny, overlap: rr - dist };
}

/**
 * The Jacobi resolution over a packed table: returns { dx, dy, dvx, dvy, count } Float64Arrays (per body: the averaged
 * positional correction, the averaged velocity change, the number of contacts). Apply as x += dx, vx += dvx.
 */
export function referenceResolve(t) {
  const n = t.nb;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const dvx = new Float64Array(n);
  const dvy = new Float64Array(n);
  const count = new Int32Array(n);
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const c = pairContact(t, a, b);
      if (!c) continue;
      const w1 = 1 / t.mass[a];
      const w2 = 1 / t.mass[b];
      const wSum = w1 + w2;
      const corr = c.overlap / wSum;
      dx[a] -= c.nx * corr * w1;
      dy[a] -= c.ny * corr * w1;
      dx[b] += c.nx * corr * w2;
      dy[b] += c.ny * corr * w2;
      if (t.impulse[a] && t.impulse[b]) {
        const vn = (t.vx[b] - t.vx[a]) * c.nx + (t.vy[b] - t.vy[a]) * c.ny;
        if (vn < 0) {
          const e = (t.restitution[a] + t.restitution[b]) / 2;
          const jimp = (-(1 + e) * vn) / wSum;
          dvx[a] -= c.nx * jimp * w1;
          dvy[a] -= c.ny * jimp * w1;
          dvx[b] += c.nx * jimp * w2;
          dvy[b] += c.ny * jimp * w2;
        }
      }
      count[a]++;
      count[b]++;
    }
  }
  for (let i = 0; i < n; i++) {
    if (count[i] > 1) {
      dx[i] /= count[i];
      dy[i] /= count[i];
      dvx[i] /= count[i];
      dvy[i] /= count[i];
    }
  }
  return { dx, dy, dvx, dvy, count };
}

export const RESOLVE_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
uniform sampler2D u_body;   // x, y, r, mass
uniform sampler2D u_vel;    // vx, vy, impulse, restitution
uniform isampler2D u_ids;   // stratum, cgroup, umask, index
uniform int u_n;
uniform int u_w;
layout(location = 0) out vec4 o0; // dx, dy, count, 0
layout(location = 1) out vec4 o1; // dvx, dvy, 0, 0
const float TAU = 6.283185307179586;
const float GOLDEN = 2.399963229728653;
ivec2 at(int i) { return ivec2(i % u_w, i / u_w); }
void main() {
  int i = int(gl_FragCoord.y) * u_w + int(gl_FragCoord.x);
  o0 = vec4(0.0); o1 = vec4(0.0);
  if (i >= u_n) return;
  vec4 BI = texelFetch(u_body, at(i), 0);
  vec4 VI = texelFetch(u_vel, at(i), 0);
  ivec4 II = texelFetch(u_ids, at(i), 0);
  vec2 dp = vec2(0.0);
  vec2 dv = vec2(0.0);
  float count = 0.0;
  for (int j = 0; j < u_n; j++) {
    if (j == i) continue;
    ivec4 IJ = texelFetch(u_ids, at(j), 0);
    if (IJ.x == II.x) continue;
    // canonical order decides who is A (lower index) and the normal's direction
    bool iIsLo = i < j;
    ivec4 ILo = iIsLo ? II : IJ;
    ivec4 IHi = iIsLo ? IJ : II;
    if (((ILo.z >> ILo.y) & 1) == 0 || ((ILo.z >> IHi.y) & 1) == 0) continue;
    if (((IHi.z >> ILo.y) & 1) == 0 || ((IHi.z >> IHi.y) & 1) == 0) continue;
    vec4 BJ = texelFetch(u_body, at(j), 0);
    if (!(BI.z > 0.0) || !(BJ.z > 0.0)) continue;
    vec4 BLo = iIsLo ? BI : BJ;
    vec4 BHi = iIsLo ? BJ : BI;
    float rr = BLo.z + BHi.z;
    vec2 d = BHi.xy - BLo.xy;
    float d2 = dot(d, d);
    if (d2 >= rr * rr) continue;
    float dist = sqrt(d2);
    vec2 n;
    if (dist > 1e-9) {
      n = d / dist;
    } else {
      float ang = mod(float(ILo.x * 131 + ILo.w) * GOLDEN + float(IHi.x * 131 + IHi.w) * 1.2, TAU);
      n = vec2(cos(ang), sin(ang));
      dist = 0.0;
    }
    float overlap = rr - dist;
    float w1 = 1.0 / BLo.w;
    float w2 = 1.0 / BHi.w;
    float wSum = w1 + w2;
    float corr = overlap / wSum;
    float wMine = iIsLo ? w1 : w2;
    float side = iIsLo ? -1.0 : 1.0;
    dp += side * n * corr * wMine;
    vec4 VLo = iIsLo ? VI : texelFetch(u_vel, at(j), 0);
    vec4 VHi = iIsLo ? texelFetch(u_vel, at(j), 0) : VI;
    if (VLo.z > 0.5 && VHi.z > 0.5) {
      float vn = dot(VHi.xy - VLo.xy, n);
      if (vn < 0.0) {
        float e = (VLo.w + VHi.w) * 0.5;
        float jimp = (-(1.0 + e) * vn) / wSum;
        dv += side * n * jimp * wMine;
      }
    }
    count += 1.0;
  }
  if (count > 1.0) { dp /= count; dv /= count; }
  o0 = vec4(dp, count, 0.0);
  o1 = vec4(dv, 0.0, 0.0);
}
`;

const FULL_VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** createGpuContactResolve(gl, maxBodies) -> { resolve(table) -> { dx, dy, dvx, dvy, count } (Float32Arrays, sync), dispose() }. */
export function createGpuContactResolve(gl, maxBodies) {
  if (!gl.getExtension('EXT_color_buffer_float'))
    throw new Error('[dishContactsResolveGpu] EXT_color_buffer_float required');
  const count = Math.max(1, maxBodies | 0);
  const w = Math.min(count, 128);
  const h = Math.ceil(count / w);
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(`[dishContactsResolveGpu] ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, FULL_VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, RESOLVE_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(`[dishContactsResolveGpu] ${gl.getProgramInfoLog(prog)}`);
  const U = (name) => gl.getUniformLocation(prog, name);
  const mkTex = (internal, format, type) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    return t;
  };
  const bodyTex = mkTex(gl.RGBA32F, gl.RGBA, gl.FLOAT);
  const velTex = mkTex(gl.RGBA32F, gl.RGBA, gl.FLOAT);
  const idsTex = mkTex(gl.RGBA32I, gl.RGBA_INTEGER, gl.INT);
  const outTex = [mkTex(gl.RGBA32F, gl.RGBA, gl.FLOAT), mkTex(gl.RGBA32F, gl.RGBA, gl.FLOAT)];
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  outTex.forEach((t, k) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  const vao = gl.createVertexArray();
  const texels = w * h;
  const bodyBuf = new Float32Array(texels * 4);
  const velBuf = new Float32Array(texels * 4);
  const idsBuf = new Int32Array(texels * 4);
  return {
    resolve(t) {
      if (t.nb > count) throw new Error(`[dishContactsResolveGpu] ${t.nb} bodies exceeds capacity ${count}`);
      for (let i = 0; i < t.nb; i++) {
        bodyBuf.set([t.x[i], t.y[i], t.r[i], t.mass[i]], i * 4);
        velBuf.set([t.vx[i], t.vy[i], t.impulse[i], t.restitution[i]], i * 4);
        idsBuf.set([t.stratum[i], t.cgroup[i], t.umask[i], t.index[i]], i * 4);
      }
      const up = (tex, format, type, data) => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, format, type, data);
      };
      up(bodyTex, gl.RGBA, gl.FLOAT, bodyBuf);
      up(velTex, gl.RGBA, gl.FLOAT, velBuf);
      up(idsTex, gl.RGBA_INTEGER, gl.INT, idsBuf);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      [bodyTex, velTex, idsTex].forEach((tex, k) => {
        gl.activeTexture(gl.TEXTURE0 + k);
        gl.bindTexture(gl.TEXTURE_2D, tex);
      });
      gl.uniform1i(U('u_body'), 0);
      gl.uniform1i(U('u_vel'), 1);
      gl.uniform1i(U('u_ids'), 2);
      gl.uniform1i(U('u_n'), t.nb);
      gl.uniform1i(U('u_w'), w);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const read = (k) => {
        const buf = new Float32Array(texels * 4);
        gl.readBuffer(gl.COLOR_ATTACHMENT0 + k);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, buf);
        return buf;
      };
      const a = read(0);
      const b = read(1);
      const out = {
        dx: new Float32Array(t.nb),
        dy: new Float32Array(t.nb),
        dvx: new Float32Array(t.nb),
        dvy: new Float32Array(t.nb),
        count: new Int32Array(t.nb),
      };
      for (let i = 0; i < t.nb; i++) {
        out.dx[i] = a[i * 4];
        out.dy[i] = a[i * 4 + 1];
        out.count[i] = a[i * 4 + 2];
        out.dvx[i] = b[i * 4];
        out.dvy[i] = b[i * 4 + 1];
      }
      return out;
    },
    dispose() {
      gl.deleteProgram(prog);
      [bodyTex, velTex, idsTex, ...outTex].forEach((x) => gl.deleteTexture(x));
      gl.deleteFramebuffer(fbo);
      gl.deleteVertexArray(vao);
    },
  };
}
