import { useCallback, useEffect, useState } from 'react';
import { panelsByZone } from './PanelRegistry.js';

const TAB_STORAGE_KEY = 'kc:active-panel-tab';

/**
 * Composition root — zero business logic.
 * Renders registry entries by zone.
 * Secondary zone uses tabs to avoid vertical scrolling (#13).
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

  const selectTab = useCallback((id) => setActiveTab(id), []);

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
        <div className="panel-tabs" role="tablist" aria-label="Control panels">
          {secondary.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === activeTab}
              className={`panel-tab ${p.id === activeTab ? 'active' : ''}`}
              onClick={() => selectTab(p.id)}
              title={p.title}
            >
              <span className="panel-tab-icon">{p.icon}</span>
              <span className="panel-tab-label">{p.title}</span>
            </button>
          ))}
        </div>
        <div className="panel-tab-content" role="tabpanel">
          {activePanel && (() => {
            const Comp = activePanel.component;
            return <Comp key={activePanel.id} dispatch={dispatchPipe} />;
          })()}
        </div>
      </div>
    </div>
  );
}
