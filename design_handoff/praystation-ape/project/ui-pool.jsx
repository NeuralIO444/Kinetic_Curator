// AssetPool panel — browse, toggle, filter, search, download

const { useState: useStateAP, useMemo: useMemoAP } = React;

function AssetPool({ ink, accent, bg, enabled, setEnabled, search, setSearch, catFilter, setCatFilter, view, setView }) {
  const cats = ['all', ...window.ASSET_CATEGORIES];
  const counts = useMemoAP(() => {
    const c = { all: window.ASSETS.length };
    window.ASSET_CATEGORIES.forEach(cat => {
      c[cat] = window.ASSETS.filter(a => a.category === cat).length;
    });
    return c;
  }, []);

  const filtered = useMemoAP(() => {
    return window.ASSETS.filter(a => {
      if (catFilter !== 'all' && a.category !== catFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!a.id.toLowerCase().includes(q) && !a.tags.some(t => t.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [search, catFilter]);

  const enabledCount = filtered.filter(a => enabled[a.id]).length;

  return (
    <section className="panel panel-pool">
      <PanelHeader
        tag="P02"
        title="ASSET_POOL.pde"
        subtitle={`${window.ASSETS.length} glyphs · ${enabledCount}/${filtered.length} active in view`}
        right={
          <div className="header-tools">
            <button
              className={classNames('chip-btn', view === 'grid' && 'active')}
              onClick={() => setView('grid')}
            >▦ GRID</button>
            <button
              className={classNames('chip-btn', view === 'list' && 'active')}
              onClick={() => setView('list')}
            >☰ LIST</button>
          </div>
        }
      />
      <div className="pool-controls">
        <div className="cat-filter">
          {cats.map(c => (
            <button
              key={c}
              className={classNames('cat-chip', catFilter === c && 'active')}
              onClick={() => setCatFilter(c)}
            >
              <span className="cat-chip-name">{c}</span>
              <span className="cat-chip-count">{counts[c]}</span>
            </button>
          ))}
        </div>
        <div className="pool-search">
          <span className="prompt">$</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="grep tag|id..."
            spellCheck={false}
          />
          {search && <button className="micro-btn" onClick={() => setSearch('')}>✕</button>}
        </div>
        <div className="bulk-tools">
          <button className="chip-btn" onClick={() => {
            const next = { ...enabled };
            filtered.forEach(a => { next[a.id] = true; });
            setEnabled(next);
          }}>ENABLE VISIBLE</button>
          <button className="chip-btn" onClick={() => {
            const next = { ...enabled };
            filtered.forEach(a => { next[a.id] = false; });
            setEnabled(next);
          }}>DISABLE VISIBLE</button>
          <button className="chip-btn" onClick={() => {
            const next = { ...enabled };
            filtered.forEach(a => { next[a.id] = Math.random() < 0.5; });
            setEnabled(next);
          }}>RANDOM 50%</button>
        </div>
      </div>

      <div className={classNames('pool-body', view)}>
        {view === 'grid' ? (
          <div className="asset-grid">
            {filtered.map(a => (
              <AssetTile key={a.id} asset={a} ink={ink} accent={accent} bg={bg}
                on={!!enabled[a.id]}
                onToggle={() => setEnabled({ ...enabled, [a.id]: !enabled[a.id] })}
                onDownload={() => downloadSVG(a, ink, accent)}
              />
            ))}
          </div>
        ) : (
          <div className="asset-list">
            <div className="asset-list-header">
              <span className="col col-on">ON</span>
              <span className="col col-pv">PV</span>
              <span className="col col-id">id</span>
              <span className="col col-cat">category</span>
              <span className="col col-tags">tags</span>
              <span className="col col-w">weight</span>
              <span className="col col-d">density</span>
              <span className="col col-sc">scale</span>
              <span className="col col-rot">rot</span>
              <span className="col col-act"></span>
            </div>
            {filtered.map(a => (
              <AssetRow key={a.id} asset={a} ink={ink} accent={accent} bg={bg}
                on={!!enabled[a.id]}
                onToggle={() => setEnabled({ ...enabled, [a.id]: !enabled[a.id] })}
                onDownload={() => downloadSVG(a, ink, accent)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AssetTile({ asset, ink, accent, bg, on, onToggle, onDownload }) {
  return (
    <div className={classNames('tile', on && 'tile-on')}>
      <button className="tile-toggle" onClick={onToggle} title={on ? 'disable' : 'enable'}>
        <div className="tile-svg" dangerouslySetInnerHTML={{ __html: svgWrap(asset, ink, accent, 64) }} />
      </button>
      <div className="tile-meta">
        <span className="tile-id">{asset.id}</span>
        <span className="tile-cat">{asset.category}</span>
      </div>
      <div className="tile-actions">
        <span className={classNames('tile-state', on ? 'on' : 'off')}>{on ? '●' : '○'}</span>
        <button className="micro-btn dl" onClick={onDownload} title="download .svg">↓</button>
      </div>
    </div>
  );
}

function AssetRow({ asset, ink, accent, bg, on, onToggle, onDownload }) {
  return (
    <div className={classNames('row', on && 'row-on')}>
      <span className="col col-on">
        <button className={classNames('toggle', on && 'toggle-on')} onClick={onToggle}>
          {on ? '■' : '□'}
        </button>
      </span>
      <span className="col col-pv">
        <span className="row-svg" dangerouslySetInnerHTML={{ __html: svgWrap(asset, ink, accent, 28) }} />
      </span>
      <span className="col col-id mono">{asset.id}</span>
      <span className="col col-cat">{asset.category}</span>
      <span className="col col-tags">
        {asset.tags.map(t => <span key={t} className="tag-pill">{t}</span>)}
      </span>
      <span className="col col-w">{asset.weight}</span>
      <span className="col col-d">{asset.density}</span>
      <span className="col col-sc mono">[{asset.scale[0]}–{asset.scale[1]}]</span>
      <span className="col col-rot mono">{asset.rotate}</span>
      <span className="col col-act">
        <button className="micro-btn dl" onClick={onDownload}>↓ svg</button>
      </span>
    </div>
  );
}

window.AssetPool = AssetPool;
