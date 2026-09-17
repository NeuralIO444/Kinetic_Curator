// PrintDeskModal — print desk (#172). A modal on OUTPUT for *print*, not live.
//
// The desk renders a frozen 1×/2× still of the current composition (the same
// still RENDER FINAL captures — the live GL frame, including ACCUM trails —
// via the loop's GPU readback), shows it as a PNG preview at 1000×700, and
// lets the operator stack the ffmpeg allow-list post filters (chips, one
// amount each, off by default).
//
// APPLY runs the stack on the *source still* → preview PNG. The sidecar
// (`_render` + `post`) lists the stack with the exact ffmpeg filtergraph so
// `studio/print_post.py` reproduces it with real ffmpeg. SAVE downloads the
// preview PNG + sidecar. CANCEL drops the temp blob URLs. The live canvas
// never calls ffmpeg — the desk is client-side pixel math; the filtergraph
// string is what travels to the farm.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { RangeRow } from '../components/RangeRow.jsx';
import { captureStill } from '../hooks/useMediaExport.js';
import {
  POST_CHIPS,
  applyPostStack,
  sanitizeStack,
  stackToFfmpeg,
  stackToFarmCommand,
} from '../fx/printPost.js';

const PREVIEW_W = 1000;
const PREVIEW_H = 700;

function blobToPixels(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ data: id.data, width: c.width, height: c.height });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('still decode failed')); };
    img.src = url;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function freshChips() {
  const out = {};
  for (const c of POST_CHIPS) out[c.id] = { on: false, amount: c.def };
  return out;
}

export function PrintDeskModal({ onClose }) {
  const { palette, glLoopRef } = useApp();
  const { state } = useApp((s) => ({
    seed: s.seed,
    layoutParams: s.layoutParams,
  }));
  const { seed, layoutParams } = state;
  const seedStr = (seed >>> 0).toString(16);
  const accumOn = !!layoutParams.accumulation;

  const [res, setRes] = useState(2);
  const [phase, setPhase] = useState('working'); // working | ready
  const [applying, setApplying] = useState(false);
  const [source, setSource] = useState(null);   // { url, blob, pixels, width, height }
  const [preview, setPreview] = useState(null); // { url, blob } — null means showing source
  const [chips, setChips] = useState(freshChips);
  const [sidecar, setSidecar] = useState(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState(null);
  const urlsRef = useRef([]);

  const trackUrl = (url) => { urlsRef.current.push(url); return url; };
  const dropPreview = useCallback(() => {
    setPreview((prev) => {
      if (prev) {
        const i = urlsRef.current.indexOf(prev.url);
        if (i >= 0) urlsRef.current.splice(i, 1);
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
  }, []);

  // Render the frozen source still at 1×/2×. Same capture RENDER FINAL uses;
  // the farm equivalent is `studio.py render --res <res>`.
  const capture = useCallback(async (resolution) => {
    setPhase('working');
    setError(null);
    dropPreview();
    setSidecar(null);
    setStale(false);
    try {
      // Same capture RENDER FINAL uses: the live GL frame (trail buffer when
      // ACCUM is on) at 1×/2×.
      const { blob } = await captureStill({
        loopRef: glLoopRef,
        resolution,
        seedStr,
        downloadFile: false,
      });
      const pixels = await blobToPixels(blob);
      const url = trackUrl(URL.createObjectURL(blob));
      setSource((prev) => {
        if (prev) {
          const i = urlsRef.current.indexOf(prev.url);
          if (i >= 0) urlsRef.current.splice(i, 1);
          URL.revokeObjectURL(prev.url);
        }
        return { url, blob, pixels, width: pixels.width, height: pixels.height };
      });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setPhase('ready');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accumOn, palette.bg, seedStr]);

  useEffect(() => {
    // Mount-time sync with an external system (the live canvas): the desk
    // must render its source still when it opens — there is no event to
    // subscribe to, so the setState calls below are the mount sync the lint
    // rule carves out, it just can't tell that from the call site.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    capture(res);
    return () => {
      for (const u of urlsRef.current) URL.revokeObjectURL(u);
      urlsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeRes = (r) => {
    if (r === res || phase === 'working') return;
    setRes(r);
    capture(r);
  };

  const stack = POST_CHIPS
    .filter((c) => chips[c.id].on)
    .map((c) => ({ chip: c.id, amount: chips[c.id].amount }));
  const filtergraph = stackToFfmpeg(stack);
  const anyOn = stack.length > 0;

  const setChip = (id, patch) => {
    setChips((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setStale(true);
  };

  const buildSidecar = (clean, width, height) => ({
    _render: {
      seed: seed >>> 0,
      seedHex: seedStr,
      resolution: `${res}x`,
      width,
      height,
      renderer: accumOn
        ? 'app still export (live GL ACCUM trail buffer); farm equivalent: studio.py render --accum'
        : 'app still export (live GL frame); farm equivalent: studio.py render',
      timestamp: new Date().toISOString(),
    },
    post: {
      engine: 'client canvas (preview only — the farm run is the print master)',
      stack: clean.map(({ chip, amount }) => ({
        chip,
        amount,
        ffmpeg: stackToFfmpeg([{ chip, amount }]),
      })),
      ffmpeg_filtergraph: stackToFfmpeg(clean),
      farm_command: stackToFarmCommand(clean, 'source.png', 'preview.png'),
    },
  });

  const apply = () => {
    if (!source || applying || !anyOn) return;
    setApplying(true);
    setError(null);
    // Let the APPLYING veil paint before the pixel loop blocks the thread.
    requestAnimationFrame(() => setTimeout(() => {
      try {
        const clean = sanitizeStack(stack);
        const out = applyPostStack(source.pixels, clean, seed >>> 0);
        const c = document.createElement('canvas');
        c.width = out.width;
        c.height = out.height;
        c.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
        c.toBlob((blob) => {
          if (!blob) {
            setError('preview encode failed');
            setApplying(false);
            return;
          }
          dropPreview();
          const url = trackUrl(URL.createObjectURL(blob));
          setPreview({ url, blob });
          setSidecar(buildSidecar(clean, out.width, out.height));
          setStale(false);
          setApplying(false);
        }, 'image/png');
      } catch (e) {
        setError(e.message || String(e));
        setApplying(false);
      }
    }, 30));
  };

  const save = () => {
    if (!source) return;
    const blob = preview?.blob ?? source.blob;
    const doc = sidecar ?? buildSidecar([], source.width, source.height);
    const base = `kc-print-${seedStr}-r${res}x`;
    downloadBlob(blob, `${base}.png`);
    downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
      `${base}.post.json`);
    onClose(true);
  };

  const cancel = () => onClose(false);

  const busy = phase === 'working' || applying;
  const shownUrl = preview?.url ?? source?.url;

  return (
    <div style={veil} onClick={cancel} role="presentation">
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <header style={head}>
          <span>PRINT DESK</span>
          <span style={{ color: 'var(--dim)', fontSize: 9 }}>
            seed {seedStr} · {res}× · {sidecar ? 'posted' : stale ? 'stack changed' : 'source still'}
          </span>
          <button type="button" className="chip-btn" onClick={cancel} title="Close the desk (CANCEL drops the temp files)">ESC</button>
        </header>
        <div style={body}>
          <div style={previewWrap}>
            {shownUrl && !error && (
              <img
                src={shownUrl}
                alt={`Print preview, seed ${seedStr}`}
                style={{ width: PREVIEW_W, height: PREVIEW_H, maxWidth: '100%', objectFit: 'contain', background: '#000' }}
              />
            )}
            {busy && (
              <div style={workingVeil}>
                {phase === 'working' ? 'RENDERING STILL…' : 'APPLYING…'}
              </div>
            )}
            {error && !busy && (
              <div style={{ color: '#ff5d7a', fontSize: 11, padding: 12 }}>{error}</div>
            )}
          </div>
          <div style={side}>
            <div style={sectLabel}>STILL</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              {[1, 2].map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`chip-btn ${res === r ? 'active' : ''}`}
                  title={`Render the source still at ${r}× (${r * PREVIEW_W}×${r * PREVIEW_H})`}
                  onClick={() => changeRes(r)}
                  disabled={busy}
                  style={res === r ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
                >
                  {r}×
                </button>
              ))}
              <button
                type="button"
                className="chip-btn"
                title="Re-render the source still from the current composition"
                onClick={() => capture(res)}
                disabled={busy}
              >
                ⟳
              </button>
            </div>
            <div style={sectLabel}>POST · allow-list</div>
            {POST_CHIPS.map((c) => {
              const cs = chips[c.id];
              return (
                <div key={c.id} style={{ marginBottom: 2 }}>
                  <button
                    type="button"
                    className={`chip-btn ${cs.on ? 'active' : ''}`}
                    title={`${c.hint} — one amount, off by default`}
                    onClick={() => setChip(c.id, { on: !cs.on })}
                    disabled={busy}
                    style={cs.on ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
                  >
                    {c.id}
                  </button>
                  {cs.on && (
                    <RangeRow
                      label=""
                      value={cs.amount}
                      min={c.min}
                      max={c.max}
                      step={c.step}
                      onChange={(v) => setChip(c.id, { amount: v })}
                      readout={`${cs.amount}${c.unit ? ` ${c.unit}` : ''}`}
                      hint={`${c.hint} — amount ${c.min}…${c.max}`}
                    />
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="big-btn"
              onClick={apply}
              disabled={!anyOn || !source || busy}
              title="Run the chip stack on the source still → preview PNG"
              style={{
                width: '100%', marginTop: 6, fontWeight: 800, letterSpacing: '0.08em',
                background: anyOn && !busy ? 'var(--accent)' : 'var(--line)',
                color: anyOn && !busy ? '#000' : 'var(--dim)',
                borderColor: 'var(--accent)',
              }}
            >
              {applying ? 'APPLYING…' : stale && sidecar ? '↻ RE-APPLY' : '▶ APPLY'}
            </button>
            {filtergraph && (
              <div
                title="Exact ffmpeg filtergraph for this stack — travels in the sidecar; studio/print_post.py runs it on the farm"
                style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--dim)', marginTop: 6, wordBreak: 'break-all' }}
              >
                {filtergraph}
              </div>
            )}
            <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 6, letterSpacing: '0.04em' }}>
              Preview is client-side. The farm run
              (<span style={{ fontFamily: 'monospace' }}>print_post.py</span>) is the print master.
            </div>
          </div>
        </div>
        <footer style={foot}>
          <span style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: '0.04em' }}>
            SAVE downloads the preview PNG + <span style={{ fontFamily: 'monospace' }}>.post.json</span> sidecar
          </span>
          <button type="button" className="chip-btn" onClick={cancel} title="Close the desk — temp files are dropped" style={{ marginLeft: 'auto' }}>
            CANCEL
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={save}
            disabled={!source || busy}
            title="Download the preview PNG and the _render.post sidecar"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            ↓ SAVE
          </button>
        </footer>
      </div>
    </div>
  );
}

const veil = { position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const sheet = {
  width: 1290, maxWidth: '96vw', maxHeight: '94vh',
  background: 'var(--bg, #111)', border: '1px solid var(--line)', color: 'var(--ink)', fontFamily: 'inherit',
  display: 'flex', flexDirection: 'column',
};
const head = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--line)', fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, flex: '0 0 auto' };
const body = { display: 'flex', gap: 12, padding: 12, flex: '1 1 auto', minHeight: 0, overflow: 'auto' };
const previewWrap = {
  position: 'relative', flex: '1 1 auto', minWidth: 0, display: 'flex',
  alignItems: 'flex-start', justifyContent: 'center', background: '#0a0a0a',
  border: '1px solid var(--line)', overflow: 'auto',
};
const workingVeil = {
  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.6)', color: 'var(--accent)', fontSize: 12, letterSpacing: '0.2em', fontWeight: 700,
};
const side = { width: 230, flex: '0 0 auto', display: 'flex', flexDirection: 'column' };
const sectLabel = { fontSize: 9, letterSpacing: '0.12em', color: 'var(--dim)', margin: '6px 0 4px' };
const foot = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--line)', flex: '0 0 auto' };
