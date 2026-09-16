// AssetPoolPanel (P02) — pool + overlay media manager (#113)
import { useMemo, useRef } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { ALL_CATEGORIES } from '../data/categories.js';
import { emit, Events } from '../composition/eventBus.js';

const WEIGHT_LABEL = { heavy: 'H', medium: 'M', light: 'L' };
const WEIGHT_TITLE = { heavy: 'heavy (×4)', medium: 'medium (×2)', light: 'light (×1)' };

function ingestMarkup(svg, hint) {
  if (!svg || !String(svg).includes('<')) return;
  emit(Events.ASSETS_INGEST, { svg: String(svg), hint: hint || 'ingest' });
}

export function AssetPoolPanel() {
  const fileRef = useRef(null);
  const swapRef = useRef(null);
  const swapId = useRef(null);
  const { assets } = useApp();
  const { state } = useApp(s => ({
    enabled: s.enabledAssets,
    search: s.search,
    catFilter: s.catFilter,
    poolView: s.poolView,
    weightOverrides: s.assetWeightOverrides || {},
    ingestError: s.ingestError,
  }));
  const { enabled, search, catFilter, poolView, weightOverrides, ingestError } = state;

  const filtered = useMemo(() => {
    let list = assets;
    if (catFilter === 'user') list = list.filter(a => String(a.id).startsWith('user:'));
    else if (catFilter !== 'all') list = list.filter(a => a.category === catFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.id.toLowerCase().includes(q) || a.tags?.some(t => String(t).toLowerCase().includes(q)));
    }
    return list;
  }, [assets, catFilter, search]);

  const overlayCount = assets.filter((a) => String(a.id).startsWith('user:')).length;
  const enabledCount = Object.values(enabled).filter(Boolean).length;
  const effectiveWeight = (a) => weightOverrides[a.id] || a.weight || 'medium';

  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    const text = e.dataTransfer?.getData('text/plain') || e.dataTransfer?.getData('image/svg+xml');
    if (file && /svg/i.test(file.type || file.name)) {
      file.text().then((svg) => ingestMarkup(svg, file.name));
      return;
    }
    if (text) ingestMarkup(text, 'paste');
  };

  return (
    <div className="panel panel-pool" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
      onPaste={(e) => {
        const text = e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('image/svg+xml');
        if (text && /<svg/i.test(text)) { e.preventDefault(); ingestMarkup(text, 'paste'); }
      }} tabIndex={0}>
      <input ref={fileRef} type="file" accept=".svg,image/svg+xml" hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) file.text().then((svg) => ingestMarkup(svg, file.name));
          e.target.value = '';
        }} />
      <input ref={swapRef} type="file" accept=".svg,image/svg+xml" hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = swapId.current;
          if (file && id) file.text().then((svg) => emit(Events.ASSETS_REPLACE, { id, svg }));
          e.target.value = '';
          swapId.current = null;
        }} />
      <PanelHeader tag="P02" title="ASSET POOL" subtitle={`${enabledCount}/${assets.length} active${overlayCount ? ` · ${overlayCount} user` : ''}`}>
        <div className="header-tools">
          <button className="chip-btn" title="Import SVG into project overlay" onClick={() => fileRef.current?.click()}>IMPORT</button>
          <button className={`chip-btn ${poolView === 'grid' ? 'active' : ''}`} onClick={() => emit(Events.ASSETS_POOL_VIEW, 'grid')}>GRID</button>
          <button className={`chip-btn ${poolView === 'list' ? 'active' : ''}`} onClick={() => emit(Events.ASSETS_POOL_VIEW, 'list')}>LIST</button>
        </div>
      </PanelHeader>
      {ingestError && <div style={{ color: 'var(--accent)', fontSize: 11, padding: '4px 10px' }}>INGEST: {ingestError}</div>}
      <div className="pool-controls">
        <div className="cat-filter">
          <button className={`cat-chip ${catFilter === 'all' ? 'active' : ''}`} onClick={() => emit(Events.ASSETS_CAT_FILTER, 'all')}>
            ALL <span className="cat-chip-count">{assets.length}</span>
          </button>
          <button className={`cat-chip ${catFilter === 'user' ? 'active' : ''}`} onClick={() => emit(Events.ASSETS_CAT_FILTER, 'user')}>
            USER <span className="cat-chip-count">{overlayCount}</span>
          </button>
          {ALL_CATEGORIES.map(c => (
            <button key={c} className={`cat-chip ${catFilter === c ? 'active' : ''}`} onClick={() => emit(Events.ASSETS_CAT_FILTER, c)}>
              {c}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
            <button className="chip-btn" onClick={() => emit(Events.ASSETS_TOGGLE_ALL, true)}>ALL ON</button>
            <button className="chip-btn" onClick={() => emit(Events.ASSETS_TOGGLE_ALL, false)}>ALL OFF</button>
          </span>
        </div>
        <div className="pool-search">
          <span className="prompt">⟩</span>
          <input placeholder="filter · drop or paste SVG" value={search} onChange={e => emit(Events.ASSETS_SEARCH, e.target.value)} />
        </div>
      </div>
      <div className={`pool-body ${poolView}`}>
        <div className="asset-grid">
          {filtered.map(a => {
            const w = effectiveWeight(a);
            const isUser = String(a.id).startsWith('user:');
            return (
              <div key={a.id} className={`tile ${enabled[a.id] ? 'tile-on' : ''}`} style={isUser ? { outline: '1px dashed var(--accent)' } : undefined}>
                <button className="tile-toggle" onClick={(e) => e.altKey ? emit(Events.ASSETS_SOLO, { id: a.id }) : emit(Events.ASSETS_TOGGLE, { id: a.id })}>
                  <svg className="tile-svg" viewBox="0 0 100 100" width="40" height="40" dangerouslySetInnerHTML={{ __html: a.svg }} />
                </button>
                <button className="tile-weight" title={WEIGHT_TITLE[w]} onClick={(e) => { e.stopPropagation(); emit(Events.ASSETS_WEIGHT_CYCLE, { id: a.id }); }}
                  style={{ position: 'absolute', top: 2, left: 2, fontSize: 9, fontWeight: 700, padding: '2px 4px', border: '1px solid var(--line)', background: 'rgba(0,0,0,0.5)', color: 'var(--dim)', zIndex: 2 }}>
                  {WEIGHT_LABEL[w]}
                </button>
                <button className="tile-solo" title="Solo" onClick={() => emit(Events.ASSETS_SOLO, { id: a.id })}>◉</button>
                <button type="button" title="Duplicate overlay copy" onClick={(e) => { e.stopPropagation(); emit(Events.ASSETS_DUPLICATE, { id: a.id }); }}
                  style={{ position: 'absolute', bottom: 22, right: 2, fontSize: 8, padding: '2px 4px', border: '1px solid var(--line)', background: 'rgba(0,0,0,0.55)', color: 'var(--dim)', zIndex: 2 }}>DUP</button>
                {isUser && (
                  <>
                    <button type="button" title="Rename overlay id" onClick={(e) => {
                      e.stopPropagation();
                      const name = window.prompt('Overlay id (no user: prefix)', a.id.replace(/^user:/, ''));
                      if (name) emit(Events.ASSETS_RENAME, { id: a.id, name });
                    }} style={{ position: 'absolute', bottom: 22, left: 2, fontSize: 8, padding: '2px 3px', border: '1px solid var(--line)', background: 'rgba(0,0,0,0.55)', color: 'var(--dim)', zIndex: 2 }}>REN</button>
                    <button type="button" title="Replace SVG" onClick={(e) => {
                      e.stopPropagation();
                      swapId.current = a.id;
                      swapRef.current?.click();
                    }} style={{ position: 'absolute', top: 2, right: 18, fontSize: 8, padding: '2px 3px', border: '1px solid var(--line)', background: 'rgba(0,0,0,0.55)', color: 'var(--dim)', zIndex: 2 }}>SWAP</button>
                    <button type="button" title="Delete from overlay (canon untouched)" onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Remove ${a.id}?`)) emit(Events.ASSETS_REMOVE, { id: a.id });
                    }} style={{ position: 'absolute', top: 2, right: 2, fontSize: 8, padding: '2px 3px', border: '1px solid var(--accent)', color: 'var(--accent)', background: 'rgba(0,0,0,0.55)', zIndex: 2 }}>DEL</button>
                  </>
                )}
                <div className="tile-meta">
                  <span className="tile-id">{a.id}</span>
                  <span className="tile-cat">{isUser ? 'user' : a.category}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
