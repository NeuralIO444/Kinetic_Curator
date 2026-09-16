// AssetStudioModal — motif kit over P02. Not Illustrator.
import { useMemo, useState } from 'react';
import { PRIMITIVES } from '../assets/primitives.js';
import { ALL_CATEGORIES } from '../data/categories.js';
import { emit, Events } from '../composition/eventBus.js';

export function AssetStudioModal({ seedSvg = '', seedId = '', onClose }) {
  const [parts, setParts] = useState(() => (seedSvg ? [seedSvg] : []));
  const [category, setCategory] = useState('organic');
  const [hint, setHint] = useState(seedId.replace(/^user:/, '') || 'motif');

  const svg = useMemo(() => parts.join(''), [parts]);
  const compound = (svg.match(/<(ellipse|rect|polygon|circle|path|line)\b/gi) || []).length > 1;

  const add = (id) => setParts((p) => [...p, PRIMITIVES[id]]);
  const undo = () => setParts((p) => p.slice(0, -1));

  const save = () => {
    if (!svg.includes('<')) return;
    const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${svg}</svg>`;
    if (seedId && String(seedId).startsWith('user:')) {
      emit(Events.ASSETS_REPLACE, { id: seedId, svg: wrapped });
    } else {
      emit(Events.ASSETS_INGEST, { svg: wrapped, hint });
    }
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
          <svg viewBox="0 0 100 100" width="256" height="256" style={stage}
            dangerouslySetInnerHTML={{ __html: grid + svg }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.keys(PRIMITIVES).map((id) => (
                <button key={id} type="button" className="chip-btn" onClick={() => add(id)}>{id}</button>
              ))}
            </div>
            <label style={lbl}>
              family
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={sel}>
                {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={lbl}>
              id hint
              <input value={hint} onChange={(e) => setHint(e.target.value)} style={sel} />
            </label>
            <p style={{ margin: 0, fontSize: 9, color: 'var(--dim)', letterSpacing: '0.04em' }}>
              Save writes user: overlay. Canon 137 untouched. Pen stays in Illustrator.
            </p>
          </div>
        </div>
        <footer style={foot}>
          <button type="button" className="chip-btn" onClick={undo} disabled={!parts.length}>UNDO</button>
          <button type="button" className="chip-btn" onClick={() => setParts([])}>CLEAR</button>
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
const sheet = { width: 480, background: 'var(--bg, #111)', border: '1px solid var(--line)', color: 'var(--ink)', fontFamily: 'inherit' };
const head = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--line)', fontSize: 10, letterSpacing: '0.14em', fontWeight: 700 };
const body = { display: 'flex', gap: 12, padding: 12 };
const stage = { background: '#0a0a0a', border: '1px solid var(--line)', flex: '0 0 auto' };
const foot = { display: 'flex', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--line)' };
const lbl = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9, letterSpacing: '0.08em', color: 'var(--dim)', textTransform: 'uppercase' };
const sel = { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', fontSize: 11, padding: '4px 6px' };
