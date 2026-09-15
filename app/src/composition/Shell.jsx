import { useCallback, useEffect, useRef, useState } from 'react';
import { panelsByZone } from './PanelRegistry.js';

const TAB_STORAGE_KEY = 'kc:active-panel-tab';

/**
 * Composition root — zero business logic.
 * Renders registry entries by zone.
 * The secondary zone is a tab strip: one panel visible at a time, and the
 * tab is the only show/hide control in the app.
 */
export function Shell({ dispatchPipe, containerRef, gridTemplate, dividerProps }) {
  const primary = panelsByZone('primary');
  const secondary = panelsByZone('secondary');

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved && secondary.some((p) => p.id === saved)) return saved;
    } catch { /* ignore */ }
    return secondary[0]?.id ?? 'layout';
  });

  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    } catch { /* ignore */ }
  }, [activeTab]);

  const tabRefs = useRef({});
  const selectTab = useCallback((id) => setActiveTab(id), []);

  // Arrow / Home / End navigation — expected of any role="tablist".
  const onTabKeyDown = useCallback((e) => {
    const ids = secondary.map((p) => p.id);
    const i = ids.indexOf(activeTab);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = ids[(i + 1) % ids.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = ids[(i - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    if (!next) return;
    e.preventDefault();
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  }, [secondary, activeTab]);

  const activePanel = secondary.find((p) => p.id === activeTab) ?? secondary[0];

  return (
    <div className="grid" ref={containerRef} style={{ gridTemplateColumns: gridTemplate }}>
      <div className="col col-canvas">
        {primary.map((p) => {
          const Comp = p.component;
          return <Comp key={p.id} dispatch={dispatchPipe} />;
        })}
      </div>
      <div className="col-divider" {...dividerProps(0)} />
      <div className="col col-panels">
        <div className="panel-tabs" role="tablist" aria-label="Control panels" onKeyDown={onTabKeyDown}>
          {secondary.map((p) => {
            const selected = p.id === activeTab;
            return (
              <button
                key={p.id}
                ref={(el) => { tabRefs.current[p.id] = el; }}
                type="button"
                role="tab"
                id={`kc-tab-${p.id}`}
                aria-controls={`kc-tabpanel-${p.id}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={`panel-tab ${selected ? 'active' : ''}`}
                onClick={() => selectTab(p.id)}
                title={p.title}
              >
                <span className="panel-tab-icon" aria-hidden="true">{p.icon}</span>
                <span className="panel-tab-label">{p.title}</span>
              </button>
            );
          })}
        </div>
        {activePanel && (
          <div
            className="panel-tab-content"
            role="tabpanel"
            id={`kc-tabpanel-${activePanel.id}`}
            aria-labelledby={`kc-tab-${activePanel.id}`}
            tabIndex={0}
          >
            {(() => {
              const Comp = activePanel.component;
              return <Comp key={activePanel.id} dispatch={dispatchPipe} />;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
