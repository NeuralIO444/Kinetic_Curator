// Shader Lab — dev-only GLSL debug panel (#193).
//
// Exercises the real debug modules against the Phase 1 shaders in the live
// browser: compile diagnostics with file:line mapping, uniform audits,
// false-color/NaN flag views, GPU timings, and the debug strip.
//
// Registered only when import.meta.env.DEV (see PanelRegistry) and loaded
// via React.lazy, so production bundles never include it.

import { useEffect, useRef, useState } from 'react';
import { PanelHeader } from '../components/PanelHeader.jsx';
import {
  buildProgramChecked,
  auditUniforms,
  diagnosticsLog,
} from '../gl/debug/diagnostics.mjs';
import { createFlagPass, FLAG_VIEWS } from '../gl/debug/flagPass.mjs';
import { createGpuTimer } from '../gl/debug/gpuTimer.mjs';
import {
  packStripValues,
  unpackStripPixels,
  formatStripTable,
} from '../gl/debug/debugStrip.mjs';
import { tapToDataURL } from '../gl/debug/tapPoints.mjs';
import {
  QUAD_VS, QUAD_FS, FULL_VS, COMPOSITE_FS, EFFECT_FS, RESOLVE_FS, COPY_FS,
} from '../gl/shaders.mjs';

// Programs the Phase 1 renderer builds (mirrors renderer.mjs).
const PROGRAMS = [
  { name: 'quad', vs: QUAD_VS, fs: QUAD_FS, set: ['u_canvas', 'u_atlas'] },
  { name: 'composite', vs: FULL_VS, fs: COMPOSITE_FS, set: ['u_src', 'u_dst', 'u_blend', 'u_opacity', 'u_clip', 'u_clipOn'] },
  { name: 'effect', vs: FULL_VS, fs: EFFECT_FS, set: ['u_src', 'u_aux', 'u_effect', 'u_p', 'u_texel', 'u_clip', 'u_clipOn'] },
  { name: 'resolve', vs: FULL_VS, fs: RESOLVE_FS, set: ['u_src'] },
  { name: 'copy', vs: FULL_VS, fs: COPY_FS, set: ['u_src'] },
];
// NOTE: the `set` lists mirror the uniforms renderer.mjs uploads. If the
// renderer starts setting a new uniform, the audit below flags it as
// neverSet — update the list, don't silence the audit.

const VIEW_LABELS = { nan: 'NaN/Inf', alpha: 'Alpha→red', luminance: 'Luminance heat', range: 'Out-of-range' };

function getGL(canvas) {
  return canvas.getContext('webgl2', { antialias: false, alpha: false });
}

/** Synthetic 48×48 float texture: gradient + NaN block + overbright block. */
function makeDemoTexture(gl) {
  const S = 48;
  const data = new Float32Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const g = (x + y) / (2 * S);
      data[i] = g; data[i + 1] = g * 0.5; data[i + 2] = 0.2; data[i + 3] = 0.5 + 0.5 * (x / S);
      if (x >= 8 && x < 20 && y >= 8 && y < 20) { data[i] = NaN; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 1; }
      if (x >= 28 && x < 40 && y >= 28 && y < 40) { data[i] = 2.5; data[i + 1] = 0.5; data[i + 2] = 0.5; data[i + 3] = 1; }
    }
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, S, S, 0, gl.RGBA, gl.FLOAT, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { tex, size: S };
}

function makeTarget(gl, s) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, s, s, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb };
}

export function ShaderLabPanel() {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const [noGL, setNoGL] = useState(false);
  const [compileRows, setCompileRows] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [thumbs, setThumbs] = useState({});
  const [timer, setTimer] = useState(null);
  const [strip, setStrip] = useState('');
  const [logRows, setLogRows] = useState([]);

  useEffect(() => {
    const gl = getGL(canvasRef.current);
    if (!gl) { setNoGL(true); return; }
    glRef.current = gl;

    // 1 — compile check + uniform audit for every Phase 1 program.
    const cRows = [];
    const aRows = [];
    for (const p of PROGRAMS) {
      try {
        const prog = buildProgramChecked(gl, p.vs, p.fs, {
          name: p.name,
          vsFile: 'shaders.mjs', fsFile: 'shaders.mjs',
        });
        cRows.push({ name: p.name, ok: true });
        const a = auditUniforms(gl, prog, p.set);
        aRows.push({ name: p.name, ...a });
        gl.deleteProgram(prog);
      } catch (e) {
        cRows.push({ name: p.name, ok: false, detail: `${e.file || ''}${e.line ? ':' + e.line : ''} ${e.log || e.message}`.trim() });
      }
    }
    setCompileRows(cRows);
    setAuditRows(aRows);

    // 2 — flag views over the synthetic texture.
    const fp = createFlagPass(gl);
    const demo = makeDemoTexture(gl);
    const target = makeTarget(gl, demo.size);
    const urls = {};
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    for (const key of Object.values(FLAG_VIEWS)) {
      fp.render(demo.tex, key, demo.size, demo.size);
      const px = new Uint8Array(demo.size * demo.size * 4);
      gl.readPixels(0, 0, demo.size, demo.size, gl.RGBA, gl.UNSIGNED_BYTE, px);
      urls[key] = tapToDataURL({ name: key, w: demo.size, h: demo.size, pixels: px }, 144);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fp.dispose();
    gl.deleteTexture(demo.tex); gl.deleteTexture(target.tex); gl.deleteFramebuffer(target.fb);
    setThumbs(urls);

    // 3 — GPU timer capability + one measured clear.
    const t = createGpuTimer(gl);
    t.begin('clear');
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    t.end('clear');
    let tries = 0;
    const pollTimer = setInterval(() => {
      const r = t.poll();
      if (r.done || ++tries > 120) {
        clearInterval(pollTimer);
        setTimer({
          hardware: t.isHardware,
          disjoint: r.disjoint,
          ms: r.disjoint ? null : r.timings.get('clear'),
        });
      }
    }, 16);

    // 4 — debug strip round-trip as a printed table.
    const labels = ['u_amount', 'u_texel.x', 'iterations', 'seed'];
    const values = [0.75, 0.0025, 16, 0xC0FFEE];
    const back = unpackStripPixels(packStripValues(values));
    setStrip(formatStripTable(labels, back));

    setLogRows(diagnosticsLog.events().slice().reverse());
    return () => clearInterval(pollTimer);
  }, []);

  if (noGL) {
    return (
      <div>
        <PanelHeader tag="DEV" title="SHADER LAB" subtitle="GLSL debug harness" />
        <p style={{ padding: 12 }}>WebGL2 is unavailable in this browser — Shader Lab needs it.</p>
      </div>
    );
  }

  return (
    <div>
      <PanelHeader tag="DEV" title="SHADER LAB" subtitle="GLSL debug harness · dev only">
        <span style={{ fontSize: 11, opacity: 0.7 }}>shortcut: `</span>
      </PanelHeader>
      <canvas ref={canvasRef} width="8" height="8" style={{ display: 'none' }} />

      <section style={{ padding: '8px 12px' }}>
        <h4 style={{ margin: '4px 0' }}>Compile check</h4>
        {compileRows.map((r) => (
          <div key={r.name} style={{ fontFamily: 'monospace', fontSize: 12, color: r.ok ? '#8f8' : '#f88' }}>
            {r.ok ? '✓' : '✗'} {r.name}{r.ok ? '' : ` — ${r.detail}`}
          </div>
        ))}
      </section>

      <section style={{ padding: '8px 12px' }}>
        <h4 style={{ margin: '4px 0' }}>Uniform audit</h4>
        {auditRows.map((r) => (
          <div key={r.name} style={{ fontFamily: 'monospace', fontSize: 12 }}>
            <span style={{ color: '#ccc' }}>{r.name}:</span>{' '}
            {r.neverSet.length === 0 && r.undeclared.length === 0
              ? <span style={{ color: '#8f8' }}>clean</span>
              : <span style={{ color: '#fc6' }}>
                  {r.neverSet.length > 0 && `never set: ${r.neverSet.join(', ')} `}
                  {r.undeclared.length > 0 && `undeclared: ${r.undeclared.join(', ')}`}
                </span>}
          </div>
        ))}
      </section>

      <section style={{ padding: '8px 12px' }}>
        <h4 style={{ margin: '4px 0' }}>Flag views <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.7 }}>(gradient + NaN block + overbright block)</span></h4>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.values(FLAG_VIEWS).map((key) => (
            <figure key={key} style={{ margin: 0, textAlign: 'center' }}>
              {thumbs[key]
                ? <img src={thumbs[key]} alt={VIEW_LABELS[key]} width="144" height="144" style={{ imageRendering: 'pixelated', border: '1px solid #444' }} />
                : <div style={{ width: 144, height: 144, background: '#222' }} />}
              <figcaption style={{ fontSize: 11, opacity: 0.8 }}>{VIEW_LABELS[key]}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section style={{ padding: '8px 12px' }}>
        <h4 style={{ margin: '4px 0' }}>GPU timing</h4>
        <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {timer === null ? 'measuring…'
            : timer.disjoint ? 'disjoint — clock unreliable, batch discarded'
            : `${timer.hardware ? 'hardware' : 'CPU fallback'} · clear: ${timer.ms == null ? 'n/a' : timer.ms.toFixed(3) + ' ms'}`}
        </div>
      </section>

      <section style={{ padding: '8px 12px' }}>
        <h4 style={{ margin: '4px 0' }}>Debug strip</h4>
        <pre style={{ fontSize: 12, margin: 0 }}>{strip}</pre>
      </section>

      <section style={{ padding: '8px 12px' }}>
        <h4 style={{ margin: '4px 0' }}>Diagnostics log</h4>
        {logRows.length === 0 && <div style={{ fontSize: 12, opacity: 0.7 }}>no compile/link events yet this session</div>}
        {logRows.map((e, i) => (
          <div key={i} style={{ fontFamily: 'monospace', fontSize: 12 }}>
            <span style={{ opacity: 0.6 }}>{e.at}</span> {e.kind} <span style={{ color: '#ccc' }}>{e.name}</span>
            {e.file && <span style={{ opacity: 0.7 }}> ({e.file})</span>} · {e.ms} ms
          </div>
        ))}
      </section>
    </div>
  );
}
