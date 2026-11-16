// K3 slice 2a (#2188) — dishContacts on the GPU, DETECTION only. No state changes: this pass answers "which cross-strata pairs
// touch this tick", as a compact list of { a, b, nx, ny, overlap } in canonical order (a ascending, then b ascending), which
// is the list the recording stamps as an input (docs/K3_SWARM_COSTING.md §9 ruling 3, §11). Resolution is slice 2b.
//
// ONE unified body table across strata with a stratum-id column (Matt's ruling 4a). All-pairs, measure first (ruling 2):
// the CPU pass's counting-sort grid only prunes pairs; the pair SET it visits is every cross-stratum pair whose discs
// overlap and whose masks admit both groups, so an all-pairs test over the same table finds the same set.
//
// Shape: the pure half (packContactBodies, referenceContacts) is the contract and the test oracle; the GL half runs the
// same predicate in a fragment shader, one fragment per body a scanning b > a. Per-body output is a few slots per pass
// (MRT) plus a count; passes advance a slot base, so no body's list is truncated unless it exceeds `slots` (reported as
// `overflow`, never silent). Readback is PBO + fence, polled not waited on (the gpuFluidHost pattern); read() is the
// synchronous form the parity tests use.
import { contactBodyRadius } from '../engine/dishRadius.mjs';

const TAU = Math.PI * 2;
const GOLDEN = 2.399963229728653;
const SLOTS_PER_PASS = 3;

/**
 * Flatten enrolled strata into the unified body table, in the CPU pass's canonical order (stratum order, then particle
 * index; dead bodies skipped; radius = contactBodyRadius). `active` is [{ sys, radius, umask }], exactly activeEntries().
 * Returns typed arrays of length nb: x, y, r, stratum, cgroup, umask, index (the particle's index in its own system).
 */
export function packContactBodies(active) {
  let cap = 0;
  for (const e of active) cap += e.sys.n;
  const x = new Float64Array(cap);
  const y = new Float64Array(cap);
  const r = new Float64Array(cap);
  const stratum = new Int32Array(cap);
  const cgroup = new Int32Array(cap);
  const umask = new Int32Array(cap);
  const index = new Int32Array(cap);
  let nb = 0;
  for (let s = 0; s < active.length; s++) {
    const e = active[s];
    const sys = e.sys;
    for (let i = 0; i < sys.n; i++) {
      if (!sys.alive[i]) continue;
      x[nb] = sys.x[i];
      y[nb] = sys.y[i];
      r[nb] = contactBodyRadius(e.radius, sys.scale[i], sys.contactTrim ? sys.contactTrim[i] : 1);
      stratum[nb] = s;
      cgroup[nb] = sys.cgroup[i];
      umask[nb] = e.umask | 0;
      index[nb] = i;
      nb++;
    }
  }
  return {
    nb,
    x: x.subarray(0, nb),
    y: y.subarray(0, nb),
    r: r.subarray(0, nb),
    stratum: stratum.subarray(0, nb),
    cgroup: cgroup.subarray(0, nb),
    umask: umask.subarray(0, nb),
    index: index.subarray(0, nb),
  };
}

/** The pair predicate + geometry, shared verbatim in shape by the CPU pass: a < b, different strata, both masks admit both groups, both discs positive, d² < (ra+rb)². */
export function referenceContacts(t) {
  const out = [];
  for (let a = 0; a < t.nb; a++) {
    for (let b = a + 1; b < t.nb; b++) {
      if (t.stratum[a] === t.stratum[b]) continue;
      const ga = t.cgroup[a];
      const gb = t.cgroup[b];
      if (!((t.umask[a] >>> ga) & 1) || !((t.umask[a] >>> gb) & 1)) continue;
      if (!((t.umask[b] >>> ga) & 1) || !((t.umask[b] >>> gb) & 1)) continue;
      const ra = t.r[a];
      const rb = t.r[b];
      if (!(ra > 0) || !(rb > 0)) continue;
      const rr = ra + rb;
      const dx = t.x[b] - t.x[a];
      const dy = t.y[b] - t.y[a];
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let dist = Math.sqrt(d2);
      let nx;
      let ny;
      if (dist > 1e-9) {
        nx = dx / dist;
        ny = dy / dist;
      } else {
        const ang = ((t.stratum[a] * 131 + t.index[a]) * GOLDEN + (t.stratum[b] * 131 + t.index[b]) * 1.2) % TAU;
        nx = Math.cos(ang);
        ny = Math.sin(ang);
        dist = 0;
      }
      out.push({ a, b, nx, ny, overlap: rr - dist });
    }
  }
  return out;
}

export const CONTACTS_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
uniform sampler2D u_body;   // x, y, r, 0
uniform isampler2D u_ids;   // stratum, cgroup, umask, index
uniform int u_n;
uniform int u_w;
uniform int u_slotBase;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;
const float TAU = 6.283185307179586;
const float GOLDEN = 2.399963229728653;
ivec2 at(int i) { return ivec2(i % u_w, i / u_w); }
void main() {
  int a = int(gl_FragCoord.y) * u_w + int(gl_FragCoord.x);
  vec4 none = vec4(-1.0, 0.0, 0.0, 0.0);
  o0 = none; o1 = none; o2 = none; o3 = vec4(0.0);
  if (a >= u_n) return;
  vec4 A = texelFetch(u_body, at(a), 0);
  ivec4 IA = texelFetch(u_ids, at(a), 0);
  int count = 0;
  for (int b = a + 1; b < u_n; b++) {
    ivec4 IB = texelFetch(u_ids, at(b), 0);
    if (IB.x == IA.x) continue;
    if (((IA.z >> IA.y) & 1) == 0 || ((IA.z >> IB.y) & 1) == 0) continue;
    if (((IB.z >> IA.y) & 1) == 0 || ((IB.z >> IB.y) & 1) == 0) continue;
    vec4 B = texelFetch(u_body, at(b), 0);
    if (!(A.z > 0.0) || !(B.z > 0.0)) continue;
    float rr = A.z + B.z;
    vec2 d = B.xy - A.xy;
    float d2 = dot(d, d);
    if (d2 >= rr * rr) continue;
    float dist = sqrt(d2);
    vec2 n;
    if (dist > 1e-9) {
      n = d / dist;
    } else {
      float ang = mod(float(IA.x * 131 + IA.w) * GOLDEN + float(IB.x * 131 + IB.w) * 1.2, TAU);
      n = vec2(cos(ang), sin(ang));
      dist = 0.0;
    }
    int slot = count - u_slotBase;
    vec4 rec = vec4(float(b), n.x, n.y, rr - dist);
    if (slot == 0) o0 = rec;
    else if (slot == 1) o1 = rec;
    else if (slot == 2) o2 = rec;
    count++;
  }
  o3 = vec4(float(count), 0.0, 0.0, 0.0);
}
`;

const FULL_VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Texture layout for n bodies: width-128 rows, like the swarm. */
export function contactTextureLayout(n, width = 128) {
  const count = Math.max(1, n | 0);
  const w = Math.min(count, width);
  return { w, h: Math.ceil(count / w), n: count };
}

/**
 * GL half. createGpuContacts(gl, maxBodies, { slots = 6 }) -> { detect(table) -> { contacts, overflow } (sync), submit(table),
 * poll() -> { contacts, overflow } | null (async, PBO + fence), dispose() }. `slots` is the per-body list length
 * (a multiple of 3); a body with more lower-index partners than that reports the excess in `overflow`.
 */
export function createGpuContacts(gl, maxBodies, { slots = 6 } = {}) {
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('[dishContactsGpu] EXT_color_buffer_float required');
  const passes = Math.max(1, Math.ceil(slots / SLOTS_PER_PASS));
  const { w, h } = contactTextureLayout(maxBodies);
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`[dishContactsGpu] ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, FULL_VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, CONTACTS_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`[dishContactsGpu] ${gl.getProgramInfoLog(prog)}`);
  const U = (n) => gl.getUniformLocation(prog, n);
  const mkTex = (internal, format, type, data) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    return t;
  };
  const bodyTex = mkTex(gl.RGBA32F, gl.RGBA, gl.FLOAT, null);
  const idsTex = mkTex(gl.RGBA32I, gl.RGBA_INTEGER, gl.INT, null);
  const outTex = [0, 1, 2, 3].map(() => mkTex(gl.RGBA32F, gl.RGBA, gl.FLOAT, null));
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  for (let k = 0; k < 4; k++)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k, gl.TEXTURE_2D, outTex[k], 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
  const vao = gl.createVertexArray();
  const texels = w * h;
  const bodyBuf = new Float32Array(texels * 4);
  const idsBuf = new Int32Array(texels * 4);
  let pending = null;

  const upload = (t) => {
    if (t.nb > maxBodies) throw new Error(`[dishContactsGpu] ${t.nb} bodies exceeds capacity ${maxBodies}`);
    for (let i = 0; i < t.nb; i++) {
      bodyBuf[i * 4] = t.x[i];
      bodyBuf[i * 4 + 1] = t.y[i];
      bodyBuf[i * 4 + 2] = t.r[i];
      idsBuf[i * 4] = t.stratum[i];
      idsBuf[i * 4 + 1] = t.cgroup[i];
      idsBuf[i * 4 + 2] = t.umask[i];
      idsBuf[i * 4 + 3] = t.index[i];
    }
    gl.bindTexture(gl.TEXTURE_2D, bodyTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.FLOAT, bodyBuf);
    gl.bindTexture(gl.TEXTURE_2D, idsTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA_INTEGER, gl.INT, idsBuf);
  };

  const run = (t, readInto) => {
    upload(t);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bodyTex);
    gl.uniform1i(U('u_body'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, idsTex);
    gl.uniform1i(U('u_ids'), 1);
    gl.uniform1i(U('u_n'), t.nb);
    gl.uniform1i(U('u_w'), w);
    for (let p = 0; p < passes; p++) {
      gl.uniform1i(U('u_slotBase'), p * SLOTS_PER_PASS);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      readInto(p);
    }
  };

  // Decode the per-pass attachments into the canonical list: a ascending, slots in b-ascending order across passes.
  const decode = (t, planes) => {
    const contacts = [];
    let overflow = 0;
    for (let a = 0; a < t.nb; a++) {
      const total = planes[0][3][a * 4]; // the count attachment is the same every pass
      if (total > slots) overflow += total - slots;
      for (let p = 0; p < passes; p++) {
        for (let k = 0; k < SLOTS_PER_PASS; k++) {
          const rec = planes[p][k];
          const b = rec[a * 4];
          if (b < 0) continue;
          contacts.push({ a, b, nx: rec[a * 4 + 1], ny: rec[a * 4 + 2], overlap: rec[a * 4 + 3] });
        }
      }
    }
    return { contacts, overflow };
  };

  return {
    slots: passes * SLOTS_PER_PASS,
    /** Synchronous: run, readPixels, decode. For tests and the cost bench; the resolver path uses submit/poll. */
    detect(t) {
      const planes = Array.from({ length: passes }, () => [null, null, null, null]);
      run(t, (p) => {
        for (let k = 0; k < 4; k++) {
          const buf = new Float32Array(texels * 4);
          gl.readBuffer(gl.COLOR_ATTACHMENT0 + k);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, buf);
          planes[p][k] = buf;
        }
      });
      return decode(t, planes);
    },
    /** Async: queue PBO readbacks behind a fence; poll() returns the decoded result once the GPU is done, else null. */
    submit(t) {
      const pbos = [];
      run(t, (p) => {
        const row = [];
        for (let k = 0; k < 4; k++) {
          const pbo = gl.createBuffer();
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
          gl.bufferData(gl.PIXEL_PACK_BUFFER, texels * 16, gl.STREAM_READ);
          gl.readBuffer(gl.COLOR_ATTACHMENT0 + k);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, 0);
          row.push(pbo);
        }
        pbos.push(row);
      });
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      pending = { t, pbos, sync: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) };
      gl.flush();
    },
    poll() {
      if (!pending) return null;
      const st = gl.clientWaitSync(pending.sync, 0, 0);
      if (st === gl.TIMEOUT_EXPIRED) return null;
      const { t, pbos, sync } = pending;
      pending = null;
      gl.deleteSync(sync);
      const planes = pbos.map((row) =>
        row.map((pbo) => {
          const buf = new Float32Array(texels * 4);
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
          gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buf);
          gl.deleteBuffer(pbo);
          return buf;
        }),
      );
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      return decode(t, planes);
    },
    dispose() {
      gl.deleteProgram(prog);
      [bodyTex, idsTex, ...outTex].forEach((x) => gl.deleteTexture(x));
      gl.deleteFramebuffer(fbo);
      gl.deleteVertexArray(vao);
    },
  };
}
