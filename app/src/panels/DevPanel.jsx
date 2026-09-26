// DevPanel — the merged dev-only panel (#691).
//
// Re-hosts the three dev-only tools (X-Ray, Gov Tune, Shader Lab) under
// three tabs of a single DEV panel, instead of three separate tabs on the
// Shell's tab strip. The sub-panels are loaded UNCHANGED: each stays behind
// React.lazy() (see devTabs.mjs), so each still ships as its own chunk,
// loaded only when its tab opens. Registered only when import.meta.env.DEV
// (see PanelRegistry) — prod bundles never include it.
//
// The backtick shortcut (#193, carried over from the old SHADER LAB tab):
// while this panel is open, backtick jumps to the Shader Lab tab.
import { Suspense, useEffect, useState } from 'react';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { DEV_TABS, consumeDevTabRequest, devTabById } from './devTabs.mjs';

export function DevPanel(props) {
  const [activeId, setActiveId] = useState(() => consumeDevTabRequest() ?? DEV_TABS[0].id);
  const active = devTabById(activeId);

  // Backtick (#193): jump to the Shader Lab tab while the DEV panel is open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '`' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      e.preventDefault();
      setActiveId('shaderlab');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ActiveComp = active.component;
  return (
    <div className="panel panel-dev">
      <PanelHeader tag="DEV" title="DEV TOOLS" subtitle="dev-only — not in prod builds" />
      <div className="panel-tabs" role="tablist" aria-label="Dev tools">
        {DEV_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === active.id}
            tabIndex={t.id === active.id ? 0 : -1}
            className={`panel-tab ${t.id === active.id ? 'active' : ''}`}
            onClick={() => setActiveId(t.id)}
            title={t.title}
          >
            <span className="panel-tab-icon" aria-hidden="true">{t.icon}</span>
            <span className="panel-tab-label">{t.title}</span>
          </button>
        ))}
      </div>
      <div className="panel-tab-content" role="tabpanel" aria-label={active.title}>
        <Suspense fallback={<div style={{ padding: 12, opacity: 0.6 }}>loading tool…</div>}>
          <ActiveComp {...props} />
        </Suspense>
      </div>
    </div>
  );
}
