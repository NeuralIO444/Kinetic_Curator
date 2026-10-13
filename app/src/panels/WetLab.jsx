/**
 * WetLab.jsx — #1355 Phase 3: the wet lab window for one asset. First tool: ATTACH points, the places on the shape
 * where another part may join. Every asset starts with points worked out from its shape (AUTO); click the shape to
 * add a point (up to MAX_ATTACH), click a point to remove it, and the asset uses yours from then on.
 * Same popup shell as RegionPicker. The window is where the asset's creature settings will grow.
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useStore } from '../state/store.js';
import { MAX_ATTACH, ATTACH_BOX } from '../engine/assetAttach.js';
import { autoAttachPoints } from '../engine/autoAttach.js';
import { emit, Events } from '../composition/eventBus.js';

const PREVIEW_PX = 320;

export function WetLab({ assetId, onClose }) {
  const { assets } = useApp();
  const asset = assets.find((a) => a.id === assetId) || null;
  const own = useStore((s) => s.assetAttach?.[assetId]);
  const isOwn = Array.isArray(own); // the artist edited this asset by hand; otherwise the points come from its shape
  const autoAssetAttach = useStore((s) => s.autoAssetAttach);
  const clickAssetAttach = useStore((s) => s.clickAssetAttach);
  const wrapRef = useRef(null);

  // Subscribe ONCE, and read onClose through a ref. Escape is also the app's panic key: its handler changes the store
  // mid-event, the panel re-renders at once, and a listener that re-subscribes on every render is swapped out during
  // the very keydown it was waiting for (the first Escape would be lost).
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!asset) return null;
  const points = isOwn ? own : autoAttachPoints(asset.svg);

  const click = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    clickAssetAttach(asset.id, {
      x: ((e.clientX - rect.left) / rect.width) * ATTACH_BOX,
      y: ((e.clientY - rect.top) / rect.height) * ATTACH_BOX,
    }, points);
  };
  const full = points.length >= MAX_ATTACH;

  return (
    <div style={veil} onClick={() => onClose()} role="presentation">
      <div style={sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Wet lab: ${asset.id}`} data-testid="wet-lab">
        <header style={head}>
          <span className="ttl">wet lab</span>
          <span style={{ color: 'var(--dim)', fontSize: 9, flex: 1 }}>{asset.id}</span>
          <button type="button" className="chip-btn act" title="Close" onClick={onClose}>esc</button>
        </header>
        <div style={body}>
          <div ref={wrapRef} data-testid="wet-lab-stage" onClick={click}
            style={{ position: 'relative', width: PREVIEW_PX, height: PREVIEW_PX, maxWidth: '100%', cursor: 'crosshair', flex: '0 0 auto' }}>
            <svg viewBox="0 0 100 100" width="100%" height="100%"
              style={{ background: '#0a0a0a', border: '1px solid var(--line)', display: 'block' }}
              dangerouslySetInnerHTML={{ __html: asset.svg }} />
            <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {points.map((p, i) => (
                <g key={i} transform={`translate(${p.x} ${p.y})`} data-testid="attach-point">
                  <rect x="-3" y="-3" width="6" height="6" fill="#000" stroke="var(--kc-red)" strokeWidth="0.8" strokeDasharray={isOwn ? undefined : '1.5 1'} />
                  <text y="1.6" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="var(--kc-red)">{i + 1}</text>
                </g>
              ))}
            </svg>
          </div>
          <div style={{ flex: '1 1 auto', minWidth: 160, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={secTitle} data-testid="attach-source">ATTACH · {points.length}/{MAX_ATTACH} · {isOwn ? 'YOURS' : 'AUTO'}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>
              {isOwn ? 'These are your points.' : 'These points were worked out from the shape.'}{' '}
              {full ? 'All four are placed: click a point to remove it.' : 'Click the shape to add a point where another part may join. Click a point to remove it.'}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {isOwn && (
                <button type="button" className="chip-btn act" data-testid="attach-auto" title="Drop your edits and use the points worked out from the shape"
                  onClick={() => autoAssetAttach(asset.id)}>auto</button>
              )}
              {points.length > 0 && (
                <button type="button" className="chip-btn act" data-testid="attach-clear" title="No attach points on this asset"
                  onClick={() => emit(Events.ATTACH_CLEAR, { assetId: asset.id })}>clear points</button>
              )}
            </div>
          </div>
        </div>
        <footer style={foot}>
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>
            every asset has attach points from its shape. your edits replace them for this asset and are saved with the project.
          </span>
        </footer>
      </div>
    </div>
  );
}

const veil = { position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const sheet = {
  width: 620, maxWidth: '92vw', maxHeight: '88vh', background: 'var(--bg, #111)',
  border: '1px solid var(--line)', color: 'var(--ink)', fontFamily: 'inherit',
  display: 'flex', flexDirection: 'column',
};
const head = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--line)', fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, flex: '0 0 auto' };
const body = { display: 'flex', flexWrap: 'wrap', gap: 12, padding: 12, flex: '1 1 auto', minHeight: 0, overflowY: 'auto' };
const foot = { display: 'flex', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--line)', flex: '0 0 auto' };
const secTitle = { fontSize: 9, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--dim)' };
