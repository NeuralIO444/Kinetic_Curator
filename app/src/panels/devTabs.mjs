// devTabs.mjs — the merged DEV panel's tabs (#691).
//
// Dev-only: the three former dev panels (Shader Lab #193, Governor X-ray
// hardening 5/6, Governor tuning #259) re-hosted as tabs of a single DEV
// panel. Each entry is a React.lazy() dynamic import, so each sub-panel
// still loads as its own chunk only when its tab opens — the lazy-chunk
// pattern from PanelRegistry is preserved one level deeper.
//
// Node-safe: lazy() defers the dynamic imports, so the dev panel
// selfcheck can import this module to assert the tab shape without a
// browser. Only reachable through the DEV-gated 'dev' registration, so
// prod builds never include it.
import { lazy } from 'react';

// The pending-tab request: Shell's backtick shortcut (#193) can ask for a
// sub-tab before the DEV panel mounts; DevPanel consumes it on mount.
let pendingTab = null;
export function requestDevTab(id) { pendingTab = id; }
export function consumeDevTabRequest() {
  const id = pendingTab;
  pendingTab = null;
  return id;
}

// Dev-only chunks — loaded when the tab opens, never in prod.
const GovernorXrayPanel = lazy(() =>
  import('./GovernorXrayPanel.jsx').then((m) => ({ default: m.GovernorXrayPanel })),
);
const GovernorTunePanel = lazy(() =>
  import('./GovernorTunePanel.jsx').then((m) => ({ default: m.GovernorTunePanel })),
);
const ShaderLabPanel = lazy(() =>
  import('./ShaderLabPanel.jsx').then((m) => ({ default: m.ShaderLabPanel })),
);

/** Tabs of the merged DEV panel — order per #691: X-Ray / Gov Tune / Shader Lab. */
export const DEV_TABS = [
  { id: 'xray',      title: 'X-RAY',      icon: '◉', component: GovernorXrayPanel },
  { id: 'govtune',   title: 'GOV TUNE',   icon: '◐', component: GovernorTunePanel },
  { id: 'shaderlab', title: 'SHADER LAB', icon: '◈', component: ShaderLabPanel },
];

export const devTabById = (id) => DEV_TABS.find((t) => t.id === id) ?? DEV_TABS[0];
