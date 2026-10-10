// AssetPoolPanel (P02) — pool + overlay media manager (#113) + studio (#114)
import { useMemo, useRef, useState } from 'react';
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
  const [Studio, setStudio] = useState(null);
  const [studioSeed, setStudioSeed] = useState(null);
  // #601: a failed chunk load must say so (was silent). The browser caches a failed
  // dynamic import per URL, so a retry on the same page replays the failure with no
  // network request — only a reload recovers, and the message says so. Cleared at the
  // start of each open so a fresh failure replaces, rather than stacks on, the old one.
  const [studioError, setStudioError] = useState(null);
  const [menu, setMenu] = useState(null); // the user overlay whose actions are open (#1128 tidy: no hover-only controls)
  const { assets } = useApp();
  const { state } = useApp(s => ({
    enabled: s.enabledAssets,
    search: s.search,
    catFilter: s.catFilter,
    poolView: s.poolView,
    weightOverrides: s.assetWeightOverrides || {},
    still: s.assetStill || {},
    ingestError: s.ingestError,
  }));
  const { enabled, search, catFilter, poolView, weightOverrides, still, ingestError } = state;

  const openStudio = async (seed) => {
    setStudioError(null);
    try {
      const mod = await import('./AssetStudioModal.jsx');
      setStudio(() => mod.AssetStudioModal);
      setStudioSeed(seed || null);
    } catch (e) {
      setStudioError(e && e.message ? e.message : String(e));
    }
  };

  const closeStudio = (saved) => {
    setStudio(null);
    setStudioSeed(null);
    if (saved) emit(Events.ASSETS_CAT_FILTER, 'user');
  };

  // #725 region mattes — dynamic import like the studio (keeps the picker
  // out of the initial bundle). The picker looks the asset up live by id.
  const [pickerId, setPickerId] = useState(null);
  const [Picker, setPicker] = useState(null);
  const openPicker = async (id) => {
    const mod = await import('./RegionPicker.jsx');
    setPicker(() => mod.RegionPicker);
    setPickerId(id);
  };

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
          <button className="chip-btn act" title="Motif kit — overlay only" onClick={() => openStudio(null)}>new</button>
          <button className="chip-btn act" title="Import SVG into project overlay" onClick={() => fileRef.current?.click()}>import</button>
          {/* #310: GRID/LIST is a remembered preference now (persisted across
              sessions) — no live toggle. poolView still drives the layout. */}
        </div>
      </PanelHeader>
      {ingestError && <div style={{ color: 'var(--accent)', fontSize: 11, padding: '4px 10px' }}>INGEST: {ingestError}</div>}
      {studioError && <div style={{ color: 'var(--kc-warn)', fontSize: 11, padding: '4px 10px' }}>STUDIO failed to load — reload the page to retry. ({studioError})</div>}
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
            <button className="chip-btn act" onClick={() => emit(Events.ASSETS_TOGGLE_ALL, true)}>all on</button>
            <button className="chip-btn act" onClick={() => emit(Events.ASSETS_TOGGLE_ALL, false)}>all off</button>
          </span>
        </div>
        <div className="pool-search">
          <span className="prompt">⟩</span>
          <input placeholder="filter · drop SVG · paste code from Illustrator or any vector app" value={search} onChange={e => emit(Events.ASSETS_SEARCH, e.target.value)} />
        </div>
      </div>
      <div className={`pool-body ${poolView}`}>
        <div className="asset-grid">
          {filtered.map(a => {
            const w = effectiveWeight(a);
            const isUser = String(a.id).startsWith('user:');
            return (
              <div key={a.id} className={`tile ${enabled[a.id] ? 'tile-on' : ''}${enabled[a.id] && still[a.id] ? ' pinned' : ''}`} style={isUser ? { outline: '1px dashed var(--accent)' } : undefined}>
                <button className="tile-toggle" onClick={(e) => e.altKey ? emit(Events.ASSETS_SOLO, { id: a.id }) : emit(Events.ASSETS_TOGGLE, { id: a.id })}>
                  <svg className="tile-svg" viewBox="0 0 100 100" width="40" height="40" dangerouslySetInnerHTML={{ __html: a.svg }} />
                </button>
                <button className="tile-weight" title={WEIGHT_TITLE[w]} aria-label={`weight ${w}: ${WEIGHT_TITLE[w]}. Tap to change`}
                  onClick={(e) => { e.stopPropagation(); emit(Events.ASSETS_WEIGHT_CYCLE, { id: a.id }); }}>
                  {WEIGHT_LABEL[w]}
                </button>
                <div className="tile-meta" title={`${a.id} · ${isUser ? 'user' : a.category}`}>
                  <span className="tile-id">{a.id}</span>
                </div>
                {/* #1128 — pin this asset still: a discrete on/off, so TE (rule 2). Only assets in use have one. */}
                {(enabled[a.id] || isUser) && (
                  <div className="tile-foot">
                    {enabled[a.id] && (
                      <>
                        <button type="button" className={`tile-still${still[a.id] ? ' on' : ''}`} aria-pressed={!!still[a.id]}
                          aria-label={`${a.id}: ${still[a.id] ? 'pinned still' : 'moves'}`}
                          title={still[a.id] ? 'Pinned still: this asset stays where it is placed. Tap to let it move again.' : 'Moves with the living-motion floor. Tap to pin it still.'}
                          onClick={(e) => { e.stopPropagation(); emit(Events.ASSETS_STILL_TOGGLE, { id: a.id }); }}>
                          <i aria-hidden="true" />still
                        </button>
                        <button type="button" className="tile-dup" aria-label={`Duplicate ${a.id}`} title="Duplicate overlay copy"
                          onClick={(e) => { e.stopPropagation(); emit(Events.ASSETS_DUPLICATE, { id: a.id }); }}>dup</button>
                      </>
                    )}
                    {isUser && (
                      <button type="button" className="tile-more" aria-expanded={menu === a.id} aria-label={`More actions for ${a.id}`}
                        title="Edit, region mattes, rename, swap, delete" onClick={(e) => { e.stopPropagation(); setMenu(menu === a.id ? null : a.id); }}>···</button>
                    )}
                  </div>
                )}
                {isUser && menu === a.id && (
                  <div className="tile-menu" role="group" aria-label={`Actions for ${a.id}`}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); openStudio({ id: a.id, svg: a.svg }); }}>edit</button>
                    <button type="button" title="Region mattes: pick regions for slots A/B/C/D" onClick={(e) => { e.stopPropagation(); openPicker(a.id); }}>regions</button>
                    <button type="button" onClick={(e) => {
                      e.stopPropagation();
                      const name = window.prompt('Overlay id (no user: prefix)', a.id.replace(/^user:/, ''));
                      if (name) emit(Events.ASSETS_RENAME, { id: a.id, name });
                    }}>rename</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); swapId.current = a.id; swapRef.current?.click(); }}>swap</button>
                    <button type="button" className="del" onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Remove ${a.id}?`)) emit(Events.ASSETS_REMOVE, { id: a.id });
                    }}>delete</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {Studio && (
        <Studio
          seedSvg={studioSeed?.svg || ''}
          seedId={studioSeed?.id || ''}
          onClose={closeStudio}
        />
      )}
      {Picker && pickerId && (
        <Picker assetId={pickerId} onClose={() => { setPicker(null); setPickerId(null); }} />
      )}
    </div>
  );
}
