// AssetPoolPanel (P02) — browse, filter, toggle assets
import { useMemo } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { usePanelResize } from '../hooks/usePanelResize.js';
import { ALL_CATEGORIES } from '../data/categories.js';
import * as A from '../state/actions.js';

export function AssetPoolPanel() {
  const { dispatch, assets } = useApp();
  const { state } = useApp(s => ({
    enabled: s.enabledAssets,
    search: s.search,
    catFilter: s.catFilter,
    poolView: s.poolView,
  }));
  const { enabled, search, catFilter, poolView } = state;
  const { open, toggle } = useCollapse(false);
  const { height, handleProps } = usePanelResize(320, { min: 120, max: 600 });

  const filtered = useMemo(() => {
    let list = assets;
    if (catFilter !== 'all') list = list.filter(a => a.category === catFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.id.toLowerCase().includes(q) || a.tags?.some(t => t.includes(q)));
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
    <div className="panel panel-pool" style={open ? { height, maxHeight: 'none' } : undefined}>
      <PanelHeader tag="P02" title="ASSET POOL" subtitle={`${enabledCount}/${assets.length} active`} collapsed={!open} onToggle={toggle}>
        <div className="header-tools">
          <button className={`chip-btn ${poolView === 'grid' ? 'active' : ''}`} onClick={() => dispatch({ type: A.SET_POOL_VIEW, payload: 'grid' })}>GRID</button>
          <button className={`chip-btn ${poolView === 'list' ? 'active' : ''}`} onClick={() => dispatch({ type: A.SET_POOL_VIEW, payload: 'list' })}>LIST</button>
        </div>
      </PanelHeader>
      {open && (
        <>
          <div className="pool-controls">
            <div className="cat-filter">
              <button className={`cat-chip ${catFilter === 'all' ? 'active' : ''}`}
                onClick={() => dispatch({ type: A.SET_CAT_FILTER, payload: 'all' })}>
                ALL <span className="cat-chip-count">{assets.length}</span>
              </button>
              {ALL_CATEGORIES.map(c => {
                const cc = catCounts[c] || { total: 0, on: 0 };
                return (
                  <button key={c} className={`cat-chip ${catFilter === c ? 'active' : ''}`}
                    onClick={() => dispatch({ type: A.SET_CAT_FILTER, payload: c })}>
                    {c} <span className="cat-chip-count">{cc.on}/{cc.total}</span>
                  </button>
                );
              })}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                <button className="chip-btn" onClick={() => dispatch({ type: A.TOGGLE_ALL_ASSETS, payload: true })}>ALL ON</button>
                <button className="chip-btn" onClick={() => dispatch({ type: A.TOGGLE_ALL_ASSETS, payload: false })}>ALL OFF</button>
              </span>
            </div>
            <div className="pool-search">
              <span className="prompt">⟩</span>
              <input placeholder="filter assets…" value={search}
                onChange={e => dispatch({ type: A.SET_SEARCH, payload: e.target.value })} />
            </div>
          </div>
          <div className={`pool-body ${poolView}`}>
            <div className="asset-grid">
              {filtered.map(a => (
                <div key={a.id} className={`tile ${enabled[a.id] ? 'tile-on' : ''}`}>
                  <button className="tile-toggle" onClick={() => dispatch({ type: A.TOGGLE_ASSET, id: a.id })}>
                    <svg className="tile-svg" viewBox="0 0 100 100" width="40" height="40"
                      dangerouslySetInnerHTML={{ __html: a.svg }} />
                  </button>
                  <div className="tile-meta">
                    <span className="tile-id">{a.id}</span>
                    <span className="tile-cat">{a.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel-resize-handle" {...handleProps}>
            <div className="resize-grip"></div>
          </div>
        </>
      )}
    </div>
  );
}
