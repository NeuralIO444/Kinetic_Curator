import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { panelsByZone } from './PanelRegistry.js';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { DrawerOverlay } from '../components/DrawerOverlay.jsx';

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
  // #248 Phase 1 mechanism, kept generic: drawer-zone panels open as an
  // overlay from whichever tab is active, closing back to it, one at a
  // time. No panel claims the zone since #467 moved ASSETS back into the
  // strip — this block renders nothing until one does.
  const drawers = panelsByZone('drawer');
  const [openDrawerId, setOpenDrawerId] = useState(null);
  const openDrawer = drawers.find((p) => p.id === openDrawerId) ?? null;

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved && secondary.some((p) => p.id === saved)) return saved;
    } catch { /* ignore */ }
    return secondary[0]?.id ?? 'build';
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

  // Dev-only (#193 → #691): backtick opens the merged DEV panel on the Shader Lab tab.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const onKey = async (e) => {
      if (e.key !== '`' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      if (!secondary.some((p) => p.id === 'dev')) return;
      e.preventDefault();
      // DEV-gated dynamic import, same dead-code-elimination pattern as the
      // registry's lazy chunks — no dev chunk leaks into the prod bundle.
      const { requestDevTab } = await import('../panels/devTabs.mjs');
      requestDevTab('shaderlab');
      setActiveTab('dev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [secondary]);

  return (
    <div className="grid" ref={containerRef} style={{ gridTemplateColumns: gridTemplate }}>
      <div className="col col-canvas">
        {primary.map((p) => {
          const Comp = p.component;
          return (
            <ErrorBoundary key={p.id} label={`panel:${p.id}`}>
              <Comp dispatch={dispatchPipe} />
            </ErrorBoundary>
          );
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
        {drawers.length > 0 && (
          <div className="panel-drawer-triggers">
            {drawers.map((p) => (
              <button
                key={p.id}
                type="button"
                className="panel-drawer-trigger"
                onClick={() => setOpenDrawerId(p.id)}
                title={`Open ${p.title}`}
              >
                <span className="panel-tab-icon" aria-hidden="true">{p.icon}</span>
                <span className="panel-tab-label">{p.title}</span>
              </button>
            ))}
          </div>
        )}
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
              return (
                <ErrorBoundary key={activePanel.id} label={`panel:${activePanel.id}`}>
                  <Suspense fallback={<div style={{ padding: 12, opacity: 0.6 }}>loading panel…</div>}>
                    <Comp dispatch={dispatchPipe} />
                  </Suspense>
                </ErrorBoundary>
              );
            })()}
          </div>
        )}
      </div>
      {openDrawer && (
        <ErrorBoundary label={`panel:${openDrawer.id}`}>
          <Suspense fallback={null}>
            <DrawerOverlay Comp={openDrawer.component} onClose={() => setOpenDrawerId(null)} />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
