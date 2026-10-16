/**
 * RegionPicker.jsx — #725 slice 2: click a color region in the asset preview,
 * assign it to a named slot (A/B/C/D). Build-time picking; slots are keyed
 * by stable region ID (redraw-same-color survives, recolor breaks).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { emit, Events } from '../composition/eventBus.js';
import { useApp } from '../state/AppContext.jsx';
import { rasterizeRegions, regionAt, REGION_RASTER_PX } from '../assets/regionRaster.js';
import { REGION_SLOTS, normalizeRegionSlots, slotOfRegion } from '../assets/regionSlots.js';

const SLOT_COLORS = { A: '#ffd166', B: '#06d6a0', C: '#118ab2', D: '#ef476f' };
const PREVIEW_PX = 240;

export function RegionPicker({ assetId, onClose }) {
  const { assets } = useApp();
  const asset = assets.find((a) => a.id === assetId) || null;
  const [cached, setCached] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [activeSlot, setActiveSlot] = useState('A');
  const overlayRef = useRef(null);
  const wrapRef = useRef(null);

  const slots = useMemo(() => normalizeRegionSlots(asset?.regionSlots), [asset?.regionSlots]);

  useEffect(() => {
    let live = true;
    const svg = asset?.svg;
    if (svg) {
      rasterizeRegions(svg).then((r) => { if (live) setCached({ svg, data: r }); }).catch(() => {});
    }
    return () => { live = false; };
  }, [asset?.svg]);

  // Never show a stale rasterization after the SVG changes.
  const shown = cached && cached.svg === asset?.svg ? cached.data : null;

  // Paint hover + slot tints onto the overlay canvas.
  useEffect(() => {
    const cv = overlayRef.current;
    if (!cv || !shown) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, PREVIEW_PX, PREVIEW_PX);
    if (!shown.idMap) return;
    const img = ctx.createImageData(REGION_RASTER_PX, REGION_RASTER_PX);
    const tint = (hex, alpha) => {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return [r, g, b, Math.round(alpha * 255)];
    };
    const slotIdx = {};
    shown.regions.forEach((r, i) => { slotIdx[r.id] = i; });
    const hoverIdx = hoverId != null ? slotIdx[hoverId] : -1;
    const data = img.data;
    for (let i = 0; i < shown.idMap.length; i++) {
      const ri = shown.idMap[i];
      if (ri < 0) continue;
      const rid = shown.regions[ri].id;
      let c = null;
      const s = slotOfRegion(slots, rid);
      if (s) c = tint(SLOT_COLORS[s], 0.30);
      if (ri === hoverIdx) c = tint('#ffffff', 0.55);
      if (!c) continue;
      const o = i * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = c[3];
    }
    const off = document.createElement('canvas');
    off.width = REGION_RASTER_PX; off.height = REGION_RASTER_PX;
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, PREVIEW_PX, PREVIEW_PX);
  }, [shown, hoverId, slots]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!asset) return null;

  const pick = (e) => {
    if (!shown) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * shown.w;
    const y = ((e.clientY - rect.top) / rect.height) * shown.h;
    const rid = regionAt(shown, x, y);
    if (rid) emit(Events.ASSETS_REGION_SLOT, { id: asset.id, slot: activeSlot, regionId: rid });
  };
  const hover = (e) => {
    if (!shown) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * shown.w;
    const y = ((e.clientY - rect.top) / rect.height) * shown.h;
    setHoverId(regionAt(shown, x, y));
  };
  const unassign = (slot) => emit(Events.ASSETS_REGION_SLOT, { id: asset.id, slot, regionId: null });

  const regions = shown?.regions || [];
  const hoverRegion = regions.find((r) => r.id === hoverId);

  return (
    <div style={veil} onClick={() => onClose()} role="presentation">
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <header style={head}>
          <span className="ttl">region mattes</span>
          <span style={{ color: 'var(--dim)', fontSize: 9 }}>{asset.id} · {regions.length} regions</span>
          <button type="button" className="chip-btn act" title="Close" onClick={onClose}>esc</button>
        </header>
        <div style={body}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <div ref={wrapRef} style={{ position: 'relative', width: PREVIEW_PX, height: PREVIEW_PX, cursor: 'crosshair' }}
              onClick={pick} onMouseMove={hover} onMouseLeave={() => setHoverId(null)}>
              <svg viewBox="0 0 100 100" width={PREVIEW_PX} height={PREVIEW_PX}
                style={{ background: '#0a0a0a', border: '1px solid var(--line)', display: 'block' }}
                dangerouslySetInnerHTML={{ __html: asset.svg }} />
              <canvas ref={overlayRef} width={PREVIEW_PX} height={PREVIEW_PX}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--dim)', minHeight: 14 }}>
              {hoverRegion ? `${hoverRegion.id} · #${hoverRegion.color}` : 'click a region to assign it'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {REGION_SLOTS.map((s) => (
                <button key={s} type="button" className={`chip-btn ${activeSlot === s ? 'active' : ''}`}
                  onClick={() => setActiveSlot(s)}
                  style={activeSlot === s ? { borderColor: SLOT_COLORS[s], color: SLOT_COLORS[s] } : undefined}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: '1 1 auto', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="ttl" style={secTitle}>slot assignments</div>
            {REGION_SLOTS.map((s) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{ width: 14, height: 14, background: SLOT_COLORS[s], display: 'inline-block' }} />
                <span style={{ fontWeight: 700, width: 12 }}>{s}</span>
                <span style={{ color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {slots[s] || '—'}
                </span>
                {slots[s] && (
                  <button type="button" className="chip-btn" title={`Unassign slot ${s}`} onClick={() => unassign(s)}>×</button>
                )}
              </div>
            ))}
            <div style={secTitle}>REGIONS ({regions.length})</div>
            <div style={{ overflowY: 'auto', flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 60 }}>
              {!shown && <span style={{ fontSize: 11, color: 'var(--dim)' }}>detecting regions…</span>}
              {regions.map((r) => {
                const s = slotOfRegion(slots, r.id);
                return (
                  <button key={r.id} type="button" className="chip-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start', textAlign: 'left' }}
                    title={`Assign to slot ${activeSlot}`}
                    onClick={() => emit(Events.ASSETS_REGION_SLOT, { id: asset.id, slot: activeSlot, regionId: r.id })}>
                    <span style={{ width: 12, height: 12, background: `#${r.color}`, display: 'inline-block', flex: '0 0 auto' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.id}</span>
                    {s && (
                      <span style={{ marginLeft: 'auto', fontWeight: 700, color: SLOT_COLORS[s], flex: '0 0 auto' }}>{s}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <footer style={foot}>
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>
            slots follow stable region IDs — redraw keeping the color, assignments survive; recolor, they break.
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
const body = { display: 'flex', gap: 12, padding: 12, flex: '1 1 auto', minHeight: 0 };
const foot = { display: 'flex', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--line)', flex: '0 0 auto' };
const secTitle = { fontSize: 9, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--dim)' };
