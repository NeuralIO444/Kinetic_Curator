// AssetPoolPanel (P02) — browse, filter, toggle assets (emit-only actions)
import { useMemo } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { ALL_CATEGORIES } from '../data/categories.js';
import { emit, Events } from '../composition/eventBus.js';

export function AssetPoolPanel() {
  const { assets } = useApp();
  const { state } = useApp(s => ({
    enabled: s.enabledAssets,
    search: s.search,
    catFilter: s.catFilter,
    poolView: s.poolView,
  }));
  const { enabled, search, catFilter, poolView } = state;

  const filtered = useMemo(() => {
    let list = assets;
    if (catFilter !== 'all') list = list.filter(a => a.category === catFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.id.toLowerCase().includes(q) || a.tags?.some(t => String(t).toLowerCase().includes(q)));
    }
    return list;
  }, [assets, catFilter, search]);

  const catCounts = useMemo(() => {
    const counts = {};
    ALL_CATEGORIES.forEach(c => { counts[c] = { total: 0, on: 0 }; });
    assets.forEach(a => {
      if (counts[a.category]) {
        counts[a.category].total++;
        if (enabled[a.id]) counts[a.category].on++;
      }
    });
    return counts;
  }, [assets, enabled]);

  const enabledCount = Object.values(enabled).filter(Boolean).length;

  return (
    <div className="panel panel-pool">
      <PanelHeader tag="P02" title="ASSET POOL" subtitle={`${enabledCount}/${assets.length} active`}>
        <div className="header-tools">
          <button className={`chip-btn ${poolView === 'grid' ? 'active' : ''}`} onClick={() => emit(Events.ASSETS_POOL_VIEW, 'grid')}>GRID</button>
          <button className={`chip-btn ${poolView === 'list' ? 'active' : ''}`} onClick={() => emit(Events.ASSETS_POOL_VIEW, 'list')}>LIST</button>
        </div>
      </PanelHeader>
      <div className="pool-controls">
        <div className="cat-filter">
          <button className={`cat-chip ${catFilter === 'all' ? 'active' : ''}`}
            onClick={() => emit(Events.ASSETS_CAT_FILTER, 'all')}>
            ALL <span className="cat-chip-count">{assets.length}</span>
          </button>
          {ALL_CATEGORIES.map(c => {
            const cc = catCounts[c] || { total: 0, on: 0 };
            return (
              <button key={c} className={`cat-chip ${catFilter === c ? 'active' : ''}`}
                onClick={() => emit(Events.ASSETS_CAT_FILTER, c)}>
                {c} <span className="cat-chip-count">{cc.on}/{cc.total}</span>
              </button>
            );
          })}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
            <button className="chip-btn" onClick={() => emit(Events.ASSETS_TOGGLE_ALL, true)}>ALL ON</button>
            <button className="chip-btn" onClick={() => emit(Events.ASSETS_TOGGLE_ALL, false)}>ALL OFF</button>
          </span>
        </div>
        <div className="pool-search">
          <span className="prompt">⟩</span>
          <input placeholder="filter assets…" value={search}
            onChange={e => emit(Events.ASSETS_SEARCH, e.target.value)} />
        </div>
      </div>
      <div className={`pool-body ${poolView}`}>
        <div className="asset-grid">
          {filtered.map(a => (
            <div key={a.id} className={`tile ${enabled[a.id] ? 'tile-on' : ''}`}>
              <button
                className="tile-toggle"
                onClick={(e) => {
                  if (e.altKey) emit(Events.ASSETS_SOLO, { id: a.id });
                  else emit(Events.ASSETS_TOGGLE, { id: a.id });
                }}
              >
                <svg className="tile-svg" viewBox="0 0 100 100" width="40" height="40"
                  dangerouslySetInnerHTML={{ __html: a.svg }} />
              </button>
              <button
                className="tile-solo"
                title="Solo this shape (or ⌥-click the tile)"
                onClick={() => emit(Events.ASSETS_SOLO, { id: a.id })}
              >
                ◉
              </button>
              <div className="tile-meta">
                <span className="tile-id">{a.id}</span>
                <span className="tile-cat">{a.category}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
