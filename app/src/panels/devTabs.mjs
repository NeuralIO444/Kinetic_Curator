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
export function requestDevTab(id) {
  pendingTab = id;
}
export function consumeDevTabRequest() {
  const id = pendingTab;
  pendingTab = null;
  return id;
}

// Dev-only chunks — loaded when the tab opens, never in prod.
const GovernorXrayPanel = lazy(() => import('./GovernorXrayPanel.jsx').then((m) => ({ default: m.GovernorXrayPanel })));
const GovernorTunePanel = lazy(() => import('./GovernorTunePanel.jsx').then((m) => ({ default: m.GovernorTunePanel })));
const ShaderLabPanel = lazy(() => import('./ShaderLabPanel.jsx').then((m) => ({ default: m.ShaderLabPanel })));
const BiologyPanel = lazy(() => import('./BiologyPanel.jsx').then((m) => ({ default: m.BiologyPanel })));
const UnitsPanel = lazy(() => import('./UnitsPanel.jsx').then((m) => ({ default: m.UnitsPanel })));
const KernelPanel = lazy(() => import('./KernelPanel.jsx').then((m) => ({ default: m.KernelPanel })));
const MindPanel = lazy(() => import('./MindPanel.jsx').then((m) => ({ default: m.MindPanel })));
const CensusPanel = lazy(() => import('./CensusPanel.jsx').then((m) => ({ default: m.CensusPanel })));
const TasteTreePanel = lazy(() => import('./TasteTreePanel.jsx').then((m) => ({ default: m.TasteTreePanel })));
const ShelfDevPanel = lazy(() => import('./ShelfDevPanel.jsx').then((m) => ({ default: m.ShelfDevPanel })));

/** Tabs of the merged DEV panel — order per #691: X-Ray / Gov Tune / Shader Lab, then Biology (#793), Units, Kernel (#1233), Mind (#1464), Census (#1507), Taste Trees (XGBoost T3), Shelf (#1590). */
export const DEV_TABS = [
  { id: 'xray', title: 'X-RAY', icon: '◉', component: GovernorXrayPanel },
  { id: 'govtune', title: 'GOV TUNE', icon: '◐', component: GovernorTunePanel },
  { id: 'shaderlab', title: 'SHADER LAB', icon: '◈', component: ShaderLabPanel },
  { id: 'biology', title: 'BIOLOGY', icon: '❋', component: BiologyPanel },
  { id: 'units', title: 'UNITS', icon: '✎', component: UnitsPanel },
  { id: 'kernel', title: 'KERNEL', icon: '▦', component: KernelPanel },
  { id: 'mind', title: 'MIND', icon: '◌', component: MindPanel },
  // #1507: the Look Explorer census readout — E1a/E1b artifacts + run
  // yield by corner, rendered read-only from the artifacts themselves.
  { id: 'census', title: 'CENSUS', icon: '▤', component: CensusPanel },
  // XGBoost T3: "read the model" — the active tree head, printed the
  // way the Studio's inspect prints it (spec §7.5).
  { id: 'taste', title: 'TASTE', icon: '♣', component: TasteTreePanel },
  // #1590: the Keeps fill, backstage — the table in force, every named
  // preferences correction, and the last fill's receipt from the ledger.
  { id: 'shelf', title: 'SHELF', icon: '▥', component: ShelfDevPanel },
];

export const devTabById = (id) => DEV_TABS.find((t) => t.id === id) ?? DEV_TABS[0];
