// AssetStudioModal — motif kit over P02. Not Illustrator.
import { useMemo, useRef, useState } from 'react';
import { PRIMITIVES } from '../assets/primitives.js';
import { ALL_CATEGORIES } from '../data/categories.js';
import { emit, Events } from '../composition/eventBus.js';

let seq = 1;

function toSvg(parts) {
  return parts.map((p) => (
    `<g transform="translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.scale}) translate(-50 -50)">${PRIMITIVES[p.kind] || p.svg || ''}</g>`
  )).join('');
}

export function AssetStudioModal({ seedSvg = '', seedId = '', onClose }) {
  const [parts, setParts] = useState(() => (
    seedSvg
      ? [{ key: seq++, kind: 'seed', svg: seedSvg, x: 50, y: 50, rot: 0, scale: 1 }]
      : []
  ));
  const [picked, setPicked] = useState(-1);
  const [category, setCategory] = useState('organic');
  const [hint, setHint] = useState(seedId.replace(/^user:/, '') || 'motif');
  const drag = useRef(null);
  const svgRef = useRef(null);

  const svg = useMemo(() => toSvg(parts), [parts]);
  const compound = parts.length > 1 || (seedSvg && parts.length >= 1);

  const add = (kind) => {
    setParts((p) => {
      setPicked(p.length);
      return [...p, { key: seq++, kind, x: 50, y: 50, rot: 0, scale: 1 }];
    });
  };
  const patchSel = (fn) => {
    if (picked < 0) return;
    setParts((p) => p.map((row, i) => (i === picked ? fn(row) : row)));
  };
  const undo = () => {
    setParts((p) => p.slice(0, -1));
    setPicked(-1);
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
    parts.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < best && d < 18 * 18) { best = d; hit = i; }
    });
    setPicked(hit);
    if (hit >= 0) {
      drag.current = { i: hit, dx: parts[hit].x - x, dy: parts[hit].y - y };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const { x, y } = pt(e);
    const { i, dx, dy } = drag.current;
    setParts((p) => p.map((row, n) => (n === i ? { ...row, x: Math.round(x + dx), y: Math.round(y + dy) } : row)));
  };
  const onUp = () => { drag.current = null; };

  const save = () => {
    if (!svg.includes('<') && !seedSvg) return;
    const body = svg || seedSvg;
    const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
    if (seedId && String(seedId).startsWith('user:')) emit(Events.ASSETS_REPLACE, { id: seedId, svg: wrapped });
    else emit(Events.ASSETS_INGEST, { svg: wrapped, hint });
    onClose();
  };

  return (
    <div style={veil} onClick={onClose} role="presentation">
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <header style={head}>
          <span>ASSET STUDIO</span>
          <span style={{ color: 'var(--dim)', fontSize: 9 }}>{compound ? 'compound' : 'single-path'} · 100²</span>
          <button type="button" className="chip-btn" onClick={onClose}>ESC</button>
        </header>
        <div style={body}>
          <svg ref={svgRef} viewBox="0 0 100 100" width="256" height="256" style={stage}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <g dangerouslySetInnerHTML={{ __html: grid }} />
            <g dangerouslySetInnerHTML={{ __html: svg }} />
            {picked >= 0 && parts[picked] && (
              <circle cx={parts[picked].x} cy={parts[picked].y} r="3" fill="none" stroke="var(--accent)" strokeWidth="0.8" />
            )}
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.keys(PRIMITIVES).map((id) => (
                <button key={id} type="button" className="chip-btn" onClick={() => add(id)}>{id}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <button type="button" className="chip-btn" disabled={picked < 0} onClick={() => patchSel((r) => ({ ...r, x: r.x - 5 }))}>←</button>
              <button type="button" className="chip-btn" disabled={picked < 0} onClick={() => patchSel((r) => ({ ...r, x: r.x + 5 }))}>→</button>
              <button type="button" className="chip-btn" disabled={picked < 0} onClick={() => patchSel((r) => ({ ...r, y: r.y - 5 }))}>↑</button>
              <button type="button" className="chip-btn" disabled={picked < 0} onClick={() => patchSel((r) => ({ ...r, y: r.y + 5 }))}>↓</button>
              <button type="button" className="chip-btn" disabled={picked < 0} onClick={() => patchSel((r) => ({ ...r, rot: r.rot - 15 }))}>↺15</button>
              <button type="button" className="chip-btn" disabled={picked < 0} onClick={() => patchSel((r) => ({ ...r, rot: r.rot + 15 }))}>↻15</button>
              <button type="button" className="chip-btn" disabled={picked < 0} onClick={() => patchSel((r) => ({ ...r, scale: Math.max(0.3, +(r.scale - 0.1).toFixed(2)) }))}>S-</button>
              <button type="button" className="chip-btn" disabled={picked < 0} onClick={() => patchSel((r) => ({ ...r, scale: Math.min(2.5, +(r.scale + 0.1).toFixed(2)) }))}>S+</button>
            </div>
            <label style={lbl}>
              family
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={field}>
                {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={lbl}>
              id hint
              <input value={hint} onChange={(e) => setHint(e.target.value)} style={field} />
            </label>
            <p style={{ margin: 0, fontSize: 9, color: 'var(--dim)', letterSpacing: '0.04em' }}>
              Click a shape, drag or nudge. 15° rotate. Save → user: overlay.
            </p>
          </div>
        </div>
        <footer style={foot}>
          <button type="button" className="chip-btn" onClick={undo} disabled={!parts.length}>UNDO</button>
          <button type="button" className="chip-btn" onClick={() => { setParts([]); setPicked(-1); }}>CLEAR</button>
          <button type="button" className="chip-btn" onClick={save} disabled={!parts.length} style={{ marginLeft: 'auto', borderColor: 'var(--accent)', color: 'var(--accent)' }}>SAVE TO POOL</button>
        </footer>
      </div>
    </div>
  );
}

const grid = '<g stroke="rgba(255,255,255,0.08)" stroke-width="0.4" fill="none">'
  + Array.from({ length: 11 }, (_, i) => `<line x1="${i * 10}" y1="0" x2="${i * 10}" y2="100"/><line x1="0" y1="${i * 10}" x2="100" y2="${i * 10}"/>`).join('')
  + '</g>';

const veil = { position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const sheet = { width: 520, background: 'var(--bg, #111)', border: '1px solid var(--line)', color: 'var(--ink)', fontFamily: 'inherit' };
const head = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--line)', fontSize: 10, letterSpacing: '0.14em', fontWeight: 700 };
const body = { display: 'flex', gap: 12, padding: 12 };
const stage = { background: '#0a0a0a', border: '1px solid var(--line)', flex: '0 0 auto', touchAction: 'none' };
const foot = { display: 'flex', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--line)' };
const lbl = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9, letterSpacing: '0.08em', color: 'var(--dim)', textTransform: 'uppercase' };
const field = { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', fontSize: 11, padding: '4px 6px' };
