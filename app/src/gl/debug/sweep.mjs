/**
 * sweep.mjs — uniform-sweep property test engine (backend hardening 1/6).
 * Browser-safe (no Node imports).
 *
 * For each swept effect the engine renders every sweep case into a float
 * (RGBA16F) target, then scans the result through the debug flag views:
 *
 * - 'nan' view: any magenta pixel = NaN/Infinity in the output -> FAIL.
 * - 'range' view: any magenta pixel beyond the input's own near-magenta
 *   pixels = out-of-[0,1] output on an in-contract case -> FAIL.
 *   (Out-of-range on hostile/beyond-contract cases is logged, not failed:
 *   the shader owns "never non-finite", the sanitizers own "hostile
 *   values never arrive" — see the sanitization audit, hardening item 7.)
 *
 * - the case tagged `noop: true` additionally renders into an RGBA8 target
 *   and is compared byte-exact against the input pattern: parameter-zero
 *   must be a true no-op (the house pattern: flow=0 skips exactly,
 *   silence is a no-op).
 *
 * Effect-specific knowledge (programs, uniforms, case tables) lives in
 * sweepEffects.mjs; this module only knows how to render, flag-scan, and
 * compare. Serves the guide loop stage.
 */

import { checkGlError } from './diagnostics.mjs';
import { createFlagPass } from './flagPass.mjs';

export const SWEEP_W = 32;
export const SWEEP_H = 32;

/** Deterministic 32x32 RGBA8 test pattern: ramps, primaries, alpha ladder. */
function makeInputPattern(w, h) {
  const bytes = new Uint8Array(w * h * 4);
  let s = 0x9e3779b9;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const alphas = [0, 64, 128, 192, 255];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      // Ramps + hash dither so every channel exercises 0..255; the alpha
      // ladder hits transparent, semi, and opaque.
      const a = alphas[(i + 2 * j) % alphas.length];
      const r = (i * 8 + ((rnd() * 7) | 0)) & 255;
      const g = (j * 8 + ((rnd() * 7) | 0)) & 255;
      const b = ((i + j) * 4 + ((rnd() * 5) | 0)) & 255;
      // Premultiplied working space, matching the renderer: rgb <= a, so
      // effects that assume it (invert's a-rgb, source-over) stay in range
      // by construction instead of tripping the range flag on the input.
      bytes[k] = Math.min(r, a);
      bytes[k + 1] = Math.min(g, a);
      bytes[k + 2] = Math.min(b, a);
      bytes[k + 3] = a;
    }
  }
  // Anchor rows: transparent black, opaque white — the extremes every
  // premultiplied/unpremultiplied path must survive.
  for (let i = 0; i < w; i++) {
    const k0 = i * 4, k1 = (w + i) * 4;
    bytes[k0] = 0; bytes[k0 + 1] = 0; bytes[k0 + 2] = 0; bytes[k0 + 3] = 0;
    bytes[k1] = 255; bytes[k1 + 1] = 255; bytes[k1 + 2] = 255; bytes[k1 + 3] = 255;
  }
  return bytes;
}

function makeTexture(gl, w, h, bytes, { float = false } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (float) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes || null);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function makeTarget(gl, tex, w, h) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('[sweep] framebuffer incomplete');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}

const isMagenta = (px, k) => px[k] >= 250 && px[k + 1] <= 5 && px[k + 2] >= 250;

/**
 * Count exact-magenta (255,0,255) pixels in the first `nPx` pixels of a
 * byte buffer. The bound matters: the lab's scratch buffers are sized for
 * the full 32x32 target, but quarter-resolution scans (e.g. downsample)
 * only fill the first w*h pixels — the rest is stale data from earlier
 * scans and must not be counted.
 */
function countMagenta(px, nPx) {
  let n = 0;
  const end = Math.min(nPx, px.length / 4) * 4;
  for (let k = 0; k < end; k += 4) if (isMagenta(px, k)) n++;
  return n;
}

/**
 * Upload one uniform by declared kind. Samplers bind to their unit;
 * everything else is a plain value upload. A null location (optimized
 * out) is skipped — same convention as the bridge.
 */
export function applyUniforms(gl, locs, decls, values) {
  for (const [name, decl] of Object.entries(decls)) {
    const loc = locs.get(name);
    if (!loc) continue;
    const v = values[name];
    switch (decl.kind) {
      case 'sampler':
        gl.activeTexture(gl.TEXTURE0 + decl.unit);
        gl.bindTexture(gl.TEXTURE_2D, v);
        gl.uniform1i(loc, decl.unit);
        break;
      case 'int': gl.uniform1i(loc, v); break;
      case 'float': gl.uniform1f(loc, v); break;
      case 'vec2': gl.uniform2f(loc, v[0], v[1]); break;
      case 'vec3': gl.uniform3f(loc, v[0], v[1], v[2]); break;
      case 'vec4': gl.uniform4f(loc, v[0], v[1], v[2], v[3]); break;
      default: throw new Error(`[sweep] unknown uniform kind "${decl.kind}" for ${name}`);
    }
  }
}

/** name -> location map for one program. */
export function locMap(gl, program, names) {
  const m = new Map();
  for (const n of names) m.set(n, gl.getUniformLocation(program, n));
  return m;
}

/**
 * The sweep lab: input pattern, float + byte write targets, the
 * fullscreen triangle, and the flag pass. One per runAllSweeps call.
 */
export function createSweepLab(gl, { w = SWEEP_W, h = SWEEP_H } = {}) {
  // The flag scans need NaN/Inf and >1 values to survive the write, so
  // sweep targets are RGBA16F — the extension must be enabled first.
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('[sweep] EXT_color_buffer_float unavailable — cannot scan float targets');
  }
  const inputBytes = makeInputPattern(w, h);
  const inputTex = makeTexture(gl, w, h, inputBytes);
  const t16a = makeTarget(gl, makeTexture(gl, w, h, null, { float: true }), w, h);
  const t16b = makeTarget(gl, makeTexture(gl, w, h, null, { float: true }), w, h);
  // Quarter-resolution float target for the accum downsample pass, which
  // box-filters 4x4 source blocks via texelFetch — rendering it at full
  // size would read out of bounds, so it gets a production-shaped target.
  const t16q = makeTarget(gl, makeTexture(gl, w / 4, h / 4, null, { float: true }), w / 4, h / 4);
  const t8 = makeTarget(gl, makeTexture(gl, w, h, null), w, h);
  const flag = createFlagPass(gl);
  const flagPx = new Uint8Array(w * h * 4);
  // Direct float readback scratch. NOTE: readPixels(RGBA, UNSIGNED_BYTE)
  // from a RGBA16F target queues INVALID_OPERATION in Chromium — float
  // targets must be read back as FLOAT. This buffer is the ground truth
  // behind the 'range' view's magenta ambiguity (a legitimately-magenta
  // in-range pixel passes that view through untouched).
  const flagFloat = new Float32Array(w * h * 4);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  /** Draw the lab's fullscreen triangle with `program` into `target`. */
  function drawTri() {
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  function draw(program, target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.disable(gl.BLEND);
    gl.useProgram(program);
    drawTri();
  }

  /**
   * Full effect render: bind target, make the program current, upload
   * uniforms (program must be current — setting uniforms with no program
   * bound queues INVALID_OPERATION), draw.
   */
  function render(program, target, locs, decls, values) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.disable(gl.BLEND);
    gl.useProgram(program);
    applyUniforms(gl, locs, decls, values);
    drawTri();
  }

  function readBytes(target) {
    const px = new Uint8Array(target.w * target.h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.readPixels(0, 0, target.w, target.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return px;
  }

  /**
   * Flag-scan `target` (a lab target object): the 'nan' magenta view and
   * the 'range' magenta view render into the lab's RGBA8 target, plus a
   * direct FLOAT readback of the effect target as ground truth.
   *
   * Returns { nan, rangeFlagged, nonFinite, outOfRange }:
   * - nan: magenta pixels in the 'nan' view. Unambiguous — the view
   *   paints finite pixels black, so every magenta pixel is non-finite.
   * - rangeFlagged: magenta pixels in the 'range' view (includes
   *   legitimately-magenta in-range pixels, which pass through).
   * - nonFinite / outOfRange: direct float-scan counts — the arbiter for
   *   the range view's magenta ambiguity.
   */
  function scanFlags(target) {
    const nPx = target.w * target.h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t8.fb);
    flag.render(target.tex, 'nan', target.w, target.h);
    gl.readPixels(0, 0, target.w, target.h, gl.RGBA, gl.UNSIGNED_BYTE, flagPx);
    const nan = countMagenta(flagPx, nPx);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t8.fb);
    flag.render(target.tex, 'range', target.w, target.h);
    gl.readPixels(0, 0, target.w, target.h, gl.RGBA, gl.UNSIGNED_BYTE, flagPx);
    const rangeFlagged = countMagenta(flagPx, nPx);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.readPixels(0, 0, target.w, target.h, gl.RGBA, gl.FLOAT, flagFloat);
    // Pixel counts (not value counts): a pixel is non-finite if ANY
    // channel is, out-of-range if any finite channel leaves [0,1].
    let nonFinite = 0, outOfRange = 0;
    for (let p = 0; p < nPx; p++) {
      const o = p * 4;
      let bad = false, oor = false;
      for (let k = 0; k < 4; k++) {
        const v = flagFloat[o + k];
        if (!Number.isFinite(v)) { bad = true; break; }
        if (v < 0 || v > 1) oor = true;
      }
      if (bad) nonFinite++;
      else if (oor) outOfRange++;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { nan, rangeFlagged, nonFinite, outOfRange };
  }

  function dispose() {
    for (const t of [t16a, t16b, t16q, t8]) {
      gl.deleteFramebuffer(t.fb);
      gl.deleteTexture(t.tex);
    }
    gl.deleteTexture(inputTex);
    gl.deleteBuffer(vbo);
    flag.dispose();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  return {
    w, h,
    input: { tex: inputTex, bytes: inputBytes },
    t16a, t16b, t16q, t8,
    draw, render, readBytes, scanFlags, dispose,
  };
}

/**
 * Run one effect's sweep table. Returns { lines, failures, hostileNotes }.
 *
 * def = {
 *   id, label,
 *   build(gl) -> { program, apply(gl, locs, c, lab, targets), dispose() },
 *   cases: [{ name, kind: 'contract'|'hostile', params, hdr?, noop?, note? }],
 * }
 * apply() renders the case's params with the final image in targets.out.
 * Contract cases assert: finite output, in-[0,1] output (unless hdr), and
 * byte-exact input==output when noop. Hostile cases assert finite output
 * only; anything else is logged, not failed (see module header).
 */
export function runEffectSweep(gl, lab, def) {
  const lines = [];
  const failures = [];
  const hostileNotes = [];
  const fail = (msg) => {
    failures.push(`${def.id}: ${msg}`);
    lines.push(`  [FAIL] sweep ${def.id} — ${msg}`);
  };
  const info = (msg) => lines.push(`  [info] sweep ${def.id} — ${msg}`);

  let built = null;
  try {
    built = def.build(gl);
  } catch (e) {
    fail(`build: ${(e && e.message) || e}`);
    return { lines, failures, hostileNotes, cases: 0 };
  }
  const { program, locs, apply, dispose } = built;
  let nCases = 0;
  let nNoop = 0;

  for (const c of def.cases) {
    nCases++;
    try {
      // Float render: the flag views need NaN/Inf and >1 to survive, so
      // the scan always runs on a 16F target. The downsample pass renders
      // quarter-resolution (production shape) into t16q.
      const outTarget = def.outSize === 8 ? lab.t16q : lab.t16a;
      apply(gl, locs, c, lab, { out: outTarget, tmp: lab.t16b });
      checkGlError(gl, `sweep:${def.id}:${c.name}`);
      const scan = lab.scanFlags(outTarget);
      if (scan.nan > 0 || scan.nonFinite > 0) {
        // The 'nan' flag view is unambiguous (finite -> black), and the
        // direct float scan is ground truth; report the larger count.
        const n = Math.max(scan.nan, scan.nonFinite);
        const msg = `${c.name}: ${n} non-finite pixel(s) (flag view: ${scan.nan}, direct: ${scan.nonFinite})`;
        if (c.kind === 'hostile') {
          hostileNotes.push(msg);
          lines.push(`  [HOSTILE-NaN] sweep ${def.id} — ${msg} (beyond contract; see sanitization audit)`);
        } else {
          fail(msg);
        }
      }
      if (c.kind === 'contract' && !c.hdr && !def.hdr && scan.outOfRange > 0) {
        fail(`${c.name}: ${scan.outOfRange} out-of-range pixel(s)`);
      } else if (scan.outOfRange > 0) {
        info(`${c.name}: ${scan.outOfRange} out-of-range pixel(s) (beyond contract — logged, not failing)`);
      }
      if (c.noop || c.near != null) {
        nNoop++;
        // Byte render: RGBA8 -> RGBA8. noop demands bit-exact identity;
        // near: N allows up to N LSBs of rounding drift (documented per
        // effect — e.g. accum-blur@0 is (s*w0)/w0, whose no-op is the
        // structural skip in createAccum.step, not the shader).
        const budget = c.noop ? 0 : c.near;
        apply(gl, locs, c, lab, { out: lab.t8, tmp: lab.t16b });
        checkGlError(gl, `sweep:${def.id}:${c.name}:noop`);
        const px = lab.readBytes(lab.t8);
        const want = lab.input.bytes;
        let maxDiff = 0;
        for (let k = 0; k < px.length; k++) {
          const d = Math.abs(px[k] - want[k]);
          if (d > maxDiff) maxDiff = d;
        }
        if (maxDiff > budget) {
          fail(`${c.name}: zero is not a no-op — max byte diff ${maxDiff} (budget ${budget})`);
        }
      }
    } catch (e) {
      fail(`${c.name}: threw: ${(e && e.message) || e}`);
    }
  }

  try { dispose(); } catch { /* noop */ }
  const ok = failures.length === 0;
  lines.unshift(
    `  [${ok ? 'ok' : 'FAIL'}] sweep ${def.id} — ${nCases} case(s)` +
    (nNoop ? `, ${nNoop} no-op proof(s)` : '') +
    (hostileNotes.length ? `, ${hostileNotes.length} hostile note(s)` : '')
  );
  return { lines, failures, hostileNotes, cases: nCases };
}
