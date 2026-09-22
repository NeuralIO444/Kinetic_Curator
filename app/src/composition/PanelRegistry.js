// Panel registry — panels are data, not hard-coded imports.
// Adding a panel = one entry here. The Shell knows nothing about features.
import { lazy } from 'react';
import { CanvasPanel } from '../panels/CanvasPanel.jsx';
import { BuildPanel } from '../panels/BuildPanel.jsx';
import { AssetPoolPanel } from '../panels/AssetPoolPanel.jsx';
import { StimulusPanel } from '../panels/StimulusPanel.jsx';
import { DavisPanel } from '../panels/DavisPanel.jsx';
import { OutputPanel } from '../panels/OutputPanel.jsx';

// Shader Lab (#193) is dev-only: lazy chunk, never registered in prod builds.
const ShaderLabPanel = import.meta.env.DEV
  ? lazy(() => import('../panels/ShaderLabPanel.jsx').then((m) => ({ default: m.ShaderLabPanel })))
  : null;

// Governor X-ray (hardening 5/6) is dev-only: same lazy-chunk pattern.
const GovernorXrayPanel = import.meta.env.DEV
  ? lazy(() => import('../panels/GovernorXrayPanel.jsx').then((m) => ({ default: m.GovernorXrayPanel })))
  : null;

// Governor tuning surface (#259) is dev-only: same lazy-chunk pattern.
const GovernorTunePanel = import.meta.env.DEV
  ? lazy(() => import('../panels/GovernorTunePanel.jsx').then((m) => ({ default: m.GovernorTunePanel })))
  : null;

export const PANEL_REGISTRY = [
  { id: 'canvas',   title: 'CANVAS',   icon: '◆', component: CanvasPanel,    zone: 'primary' },
  { id: 'build',    title: 'BUILD',    icon: '■', component: BuildPanel,     zone: 'secondary' },
  // #248 Phase 1: ASSETS is a drawer, not a tab — panelsByZone('secondary')
  // naturally excludes it now; Shell.jsx mounts it via AssetDrawer instead.
  { id: 'assets',   title: 'ASSETS',   icon: '◇', component: AssetPoolPanel, zone: 'drawer' },
  { id: 'stimulus', title: 'STIMULI',  icon: '▸', component: StimulusPanel,  zone: 'secondary' },
  { id: 'davis',    title: 'DAVIS',    icon: '◎', component: DavisPanel,     zone: 'secondary' },
  { id: 'output',   title: 'OUTPUT',   icon: '⬇', component: OutputPanel,    zone: 'secondary' },
];

if (import.meta.env.DEV && ShaderLabPanel) {
  PANEL_REGISTRY.push(
    { id: 'shaderlab', title: 'SHADER LAB', icon: '◈', component: ShaderLabPanel, zone: 'secondary' },
  );
}

if (import.meta.env.DEV && GovernorXrayPanel) {
  PANEL_REGISTRY.push(
    { id: 'xray', title: 'X-RAY', icon: '◉', component: GovernorXrayPanel, zone: 'secondary' },
  );
}

if (import.meta.env.DEV && GovernorTunePanel) {
  PANEL_REGISTRY.push(
    { id: 'govtune', title: 'GOV TUNE', icon: '◐', component: GovernorTunePanel, zone: 'secondary' },
  );
}

export const panelsByZone = (zone) => PANEL_REGISTRY.filter((p) => p.zone === zone);
