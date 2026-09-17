// AssetStudioModal — motif kit over P02. Not Illustrator.
// Lazy-loaded: the live bundle never imports this until the modal opens.
import { useEffect, useMemo, useRef, useState } from 'react';
import { PRIMITIVES, polyInner } from '../assets/primitives.js';
import { ingestSvg } from '../assets/ingest.js';
import { ALL_CATEGORIES } from '../data/categories.js';
import { emit, Events } from '../composition/eventBus.js';

let seq = 1;
const SNAP = 10;
const UNDO_CAP = 20;
const snap = (n) => Math.round(n / SNAP) * SNAP;
const clampS = (n) => Math.max(0.3, Math.min(2.5, +Number(n).toFixed(2)));

function axes(p) {
  return { sx: p.sx ?? p.scale ?? 1, sy: p.sy ?? p.scale ?? 1 };
}

function innerFor(p) {
  if (p.kind === 'poly') return polyInner(p.n);
  return PRIMITIVES[p.kind] || p.svg || '';
}

function toSvg(parts) {
  return parts.map((p) => {
    const token = p.token === 'accent' ? 'var(--accent)' : 'var(--ink)';
    const paint = p.stroke
      ? `color: ${token}; fill: none; stroke: currentColor; stroke-width: 3`
      : `color: ${token}`;
    const { sx, sy } = axes(p);
    return `<g style="${paint}" transform="translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${sx} ${sy}) translate(-50 -50)">${innerFor(p)}</g>`;
  }).join('');
}

function fresh(kind, extra = {}) {
  return { key: seq++, kind, x: 50, y: 50, rot: 0, scale: 1, sx: 1, sy: 1, token: 'ink', stroke: false, ...extra };
}

export function AssetStudioModal({ seedSvg = '', seedId = '', onClose }) {
  const [parts, setParts] = useState(() => (
    seedSvg ? [fresh('seed', { svg: seedSvg })] : []
  ));
  const [picked, setPicked] = useState(-1);
  const [category, setCategory] = useState('organic');
  const [hint, setHint] = useState(seedId.replace(/^user:/, '') || 'motif');
  const [sides, setSides] = useState(6);
  const [error, setError] = useState('');
  const [undoDepth, setUndoDepth] = useState(0);
  const drag = useRef(null);
  const svgRef = useRef(null);
  const sheetRef = useRef(null);

  // Parts ref mirrors state so commits can snapshot synchronously.
  const partsRef = useRef(parts);
  const histRef = useRef([]);
  const sync = (next) => { partsRef.current = next; setParts(next); };
  const snapshot = () => {
    histRef.current.push(partsRef.current);
    if (histRef.current.length > UNDO_CAP) histRef.current.shift();
    setUndoDepth(histRef.current.length);
  };
  /** Commit a new parts array, pushing the pre-state onto the undo stack. */
  const commit = (fn) => {
    snapshot();
    sync(fn(partsRef.current));
  };
  /** Apply without pushing (drag moves snapshot once at drag start). */
  const live = (fn) => sync(fn(partsRef.current));
  const undo = () => {
    const prev = histRef.current.pop();
    if (prev === undefined) return;
    sync(prev);
    setUndoDepth(histRef.current.length);
    setPicked(-1);
    setError('');
  };

  const svg = useMemo(() => toSvg(parts), [parts]);
  const compound = parts.length > 1;

  // Esc closes the modal; the live canvas keeps running underneath.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = (kind) => {
    commit((p) => {
      const extra = kind === 'poly' ? { n: sides } : {};
      const next = [...p, fresh(kind, extra)];
      setPicked(next.length - 1);
      return next;
    });
  };
  const patchSel = (fn) => {
    if (picked < 0) return;
    commit((p) => p.map((row, i) => (i === picked ? fn(row) : row)));
  };
  const bump = (key, d) => patchSel((r) => {
    const { sx, sy } = axes(r);
    if (key === 'both') {
      const n = clampS((sx + sy) / 2 + d);
      return { ...r, scale: n, sx: n, sy: n };
    }
    const next = key === 'sx' ? clampS(sx + d) : clampS(sy + d);
    return key === 'sx' ? { ...r, sx: next } : { ...r, sy: next };
  });
  const delSel = () => {
    if (picked < 0) return;
    const i = picked;
    commit((p) => p.filter((_, n) => n !== i));
    setPicked(-1);
  };
  const dup = () => {
    if (picked < 0) return;
    commit((p) => {
      const copy = { ...p[picked], key: seq++, x: snap(p[picked].x + 10), y: snap(p[picked].y + 10) };
      const next = [...p, copy];
      setPicked(next.length - 1);
      return next;
    });
  };
  const zShift = (dir) => {
    if (picked < 0) return;
    const i = picked;
    commit((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const next = p.slice();
      const tmp = next[i]; next[i] = next[j]; next[j] = tmp;
      setPicked(j);
      return next;
    });
  };

  const pt = (e) => {
    const el = svgRef.current;
    if (!el) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    };
  };

  const onDown = (e) => {
    const { x, y } = pt(e);
    let hit = -1;
    let best = 1e9;
    partsRef.current.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < best && d < 18 * 18) { best = d; hit = i; }
    });
    setPicked(hit);
    if (hit >= 0) {
      snapshot(); // one undo step for the whole drag
      drag.current = { i: hit, dx: partsRef.current[hit].x - x, dy: partsRef.current[hit].y - y };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const { x, y } = pt(e);
    const { i, dx, dy } = drag.current;
    live((p) => p.map((row, n) => (n === i ? { ...row, x: snap(x + dx), y: snap(y + dy) } : row)));
  };
  const onUp = () => { drag.current = null; };

  // Paste into the stage runs the same allow-list as ingest (#113).
  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('image/svg+xml');
    if (!text || !/<svg|<(path|g|circle|ellipse|rect|polygon|polyline|line)[\s>]/i.test(text)) return;
    e.preventDefault();
    e.stopPropagation();
    const res = ingestSvg(text, { id: 'paste' });
    if (!res.ok) { setError(`paste rejected: ${res.error}`); return; }
    setError('');
    commit((p) => {
      const next = [...p, fresh('seed', { svg: res.asset.svg })];
      setPicked(next.length - 1);
      return next;
    });
  };

  const wrapped = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${svg}</svg>`;

  const save = () => {
    if (!parts.length && !seedSvg) return;
    const body = svg || seedSvg;
    const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
    if (seedId && String(seedId).startsWith('user:')) emit(Events.ASSETS_REPLACE, { id: seedId, svg: out });
    else emit(Events.ASSETS_INGEST, { svg: out, hint, category, weight: 'medium', source: 'hand' });
    onClose(true);
  };

  const exportSvg = () => {
    if (!parts.length && !seedSvg) return;
    const blob = new Blob([wrapped()], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(hint || 'motif').replace(/[^a-z0-9_-]+/gi, '_')}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div style={veil} onClick={() => onClose(false)} role="presentation">
      <div ref={sheetRef} style={sheet} onClick={(e) => e.stopPropagation()} onPaste={onPaste}>
        <header style={head}>
          <span>ASSET STUDIO</span>
          <span style={{ color: 'var(--dim)', fontSize: 9 }}>{compound ? 'compound' : 'single-path'} · snap {SNAP} · undo {undoDepth}/{UNDO_CAP}</span>
          <button type="button" className="chip-btn" title="Close without saving" onClick={() => onClose(false)}>ESC</button>
        </header>
        <div style={body}>
          <svg ref={svgRef} viewBox="0 0 100 100" style={stage}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <g dangerouslySetInnerHTML={{ __html: grid }} />
            <g dangerouslySetInnerHTML={{ __html: svg }} />
            {picked >= 0 && parts[picked] && (
              <circle cx={parts[picked].x} cy={parts[picked].y} r="3" fill="none" stroke="var(--accent)" strokeWidth="0.8" />
            )}
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.keys(PRIMITIVES).map((id) => (
                <button key={id} type="button" className="chip-btn" title={`Add a ${id} shape`} onClick={() => add(id)}>{id}</button>
              ))}
              <button type="button" className="chip-btn" onClick={() => add('poly')}>POLY</button>
              <select value={sides} onChange={(e) => setSides(+e.target.value)} style={field} title="polygon sides">
                {[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Nudge the picked shape left" onClick={() => patchSel((r) => ({ ...r, x: snap(r.x - SNAP) }))}>←</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Nudge the picked shape right" onClick={() => patchSel((r) => ({ ...r, x: snap(r.x + SNAP) }))}>→</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Nudge the picked shape up" onClick={() => patchSel((r) => ({ ...r, y: snap(r.y - SNAP) }))}>↑</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Nudge the picked shape down" onClick={() => patchSel((r) => ({ ...r, y: snap(r.y + SNAP) }))}>↓</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Rotate the picked shape −15°" onClick={() => patchSel((r) => ({ ...r, rot: r.rot - 15 }))}>↺15</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Rotate the picked shape +15°" onClick={() => patchSel((r) => ({ ...r, rot: r.rot + 15 }))}>↻15</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Shrink the picked shape" onClick={() => bump('both', -0.1)}>S-</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Grow the picked shape" onClick={() => bump('both', 0.1)}>S+</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Squash the picked shape horizontally" onClick={() => bump('sx', -0.1)}>Sx-</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Stretch the picked shape horizontally" onClick={() => bump('sx', 0.1)}>Sx+</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Squash the picked shape vertically" onClick={() => bump('sy', -0.1)}>Sy-</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Stretch the picked shape vertically" onClick={() => bump('sy', 0.1)}>Sy+</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Paint the picked shape ink" onClick={() => patchSel((r) => ({ ...r, token: 'ink' }))}>INK</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Paint the picked shape accent" onClick={() => patchSel((r) => ({ ...r, token: 'accent' }))}>ACCENT</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Flip the picked shape between filled and outline" onClick={() => patchSel((r) => ({ ...r, stroke: !r.stroke }))}>FILL/STROKE</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Duplicate the picked shape" onClick={dup}>DUP</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Delete the picked shape" onClick={delSel}>DEL</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Send the picked shape one step back" onClick={() => zShift(-1)}>Z-</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Bring the picked shape one step forward" onClick={() => zShift(1)}>Z+</button>
            </div>
            <label style={lbl} title="Which family the saved asset lands in.">
              family
              <select value={category} title="Which family the saved asset lands in." onChange={(e) => setCategory(e.target.value)} style={field}>
                {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={lbl} title="Name for the saved overlay asset.">
              id hint
              <input value={hint} title="Name for the saved overlay asset." onChange={(e) => setHint(e.target.value)} style={field} />
            </label>
            {error && <p style={{ margin: 0, fontSize: 10, color: 'var(--accent)' }}>{error}</p>}
            <p style={{ margin: 0, fontSize: 9, color: 'var(--dim)', letterSpacing: '0.04em' }}>
              Sx/Sy stretch on one axis. S± stays uniform. No boolean. Pen stays in Illustrator.
            </p>
          </div>
        </div>
        <footer style={foot}>
          <button type="button" className="chip-btn" title="Remove the last added shape" onClick={undo} disabled={!undoDepth}>UNDO</button>
          <button type="button" className="chip-btn" title="Remove every shape" onClick={() => { commit(() => []); setPicked(-1); }}>CLEAR</button>
          <button type="button" className="chip-btn" title="Download the motif as an SVG file" onClick={exportSvg} disabled={!parts.length && !seedSvg}>EXPORT SVG</button>
          <button type="button" className="chip-btn" title="Save this motif to the asset pool" onClick={save} disabled={!parts.length && !seedSvg} style={{ marginLeft: 'auto', borderColor: 'var(--accent)', color: 'var(--accent)' }}>SAVE TO POOL</button>
        </footer>
      </div>
    </div>
  );
}

const grid = '<g stroke="rgba(255,255,255,0.08)" stroke-width="0.4" fill="none">'
  + Array.from({ length: 11 }, (_, i) => `<line x1="${i * 10}" y1="0" x2="${i * 10}" y2="100"/><line x1="0" y1="${i * 10}" x2="100" y2="${i * 10}"/>`).join('')
  + '</g>';

const veil = { position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const sheet = {
  width: 720, height: 520, minWidth: 520, minHeight: 380, maxWidth: '92vw', maxHeight: '88vh',
  resize: 'both', overflow: 'auto',
  background: 'var(--bg, #111)', border: '1px solid var(--line)', color: 'var(--ink)', fontFamily: 'inherit',
  display: 'flex', flexDirection: 'column',
};
const head = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--line)', fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, flex: '0 0 auto' };
const body = { display: 'flex', gap: 12, padding: 12, flex: '1 1 auto', minHeight: 0 };
const stage = { background: '#0a0a0a', border: '1px solid var(--line)', flex: '1 1 auto', minWidth: 280, height: '100%', touchAction: 'none' };
const foot = { display: 'flex', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--line)', flex: '0 0 auto' };
const lbl = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9, letterSpacing: '0.08em', color: 'var(--dim)', textTransform: 'uppercase' };
const field = { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', fontSize: 11, padding: '4px 6px' };
