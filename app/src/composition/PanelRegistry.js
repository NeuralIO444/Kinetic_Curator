// Panel registry — panels are data, not hard-coded imports.
// Adding a panel = one entry here. The Shell knows nothing about features.
import { lazy } from 'react';
import { CanvasPanel } from '../panels/CanvasPanel.jsx';
import { BuildPanel } from '../panels/BuildPanel.jsx';
import { AssetPoolPanel } from '../panels/AssetPoolPanel.jsx';
import { StimulusPanel } from '../panels/StimulusPanel.jsx';
import { DavisPanel } from '../panels/DavisPanel.jsx';
import { PlayPanel } from '../panels/PlayPanel.jsx';
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
  // #467: ASSETS is a tab again — Matt's play-test reversal of #248 Phase 1
  // (the quiet ◇ drawer trigger was too hidden for a panel this visited).
  // The drawer mechanism in Shell.jsx stays, idle until a panel claims it.
  { id: 'assets',   title: 'ASSETS',   icon: '◇', component: AssetPoolPanel, zone: 'secondary' },
  { id: 'stimulus', title: 'STIMULI',  icon: '▸', component: StimulusPanel,  zone: 'secondary' },
  { id: 'davis',    title: 'DAVIS',    icon: '◎', component: DavisPanel,     zone: 'secondary' },
  // #248 Phase 4: PLAY is new, registered alongside davis/stimulus while
  // they still hold content — expected mid-migration tab-count bulge
  // (PANEL_CONSOLIDATION_PLAN.md §2.8), not a violation of the 4-tab cap.
  { id: 'play',     title: 'PLAY',     icon: '◎', component: PlayPanel,     zone: 'secondary' },
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
