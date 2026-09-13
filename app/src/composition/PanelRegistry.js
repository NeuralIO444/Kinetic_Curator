// Panel registry — panels are data, not hard-coded imports.
// Adding a panel = one entry here. The Shell knows nothing about features.
import { CanvasPanel } from '../panels/CanvasPanel.jsx';
import { LayoutPanel } from '../panels/LayoutPanel.jsx';
import { AssetPoolPanel } from '../panels/AssetPoolPanel.jsx';
import { StimulusPanel } from '../panels/StimulusPanel.jsx';
import { DavisPanel } from '../panels/DavisPanel.jsx';
import { OutputPanel } from '../panels/OutputPanel.jsx';

export const PANEL_REGISTRY = [
  { id: 'canvas',   title: 'CANVAS',   icon: '◆', component: CanvasPanel,   defaultCollapsed: false,  zone: 'primary' },
  { id: 'layout',   title: 'LAYOUT',   icon: '■', component: LayoutPanel,   defaultCollapsed: false,  zone: 'secondary' },
  { id: 'assets',   title: 'ASSETS',   icon: '◇', component: AssetPoolPanel, defaultCollapsed: false,  zone: 'secondary' },
  { id: 'stimulus', title: 'STIMULUS', icon: '▸', component: StimulusPanel, defaultCollapsed: false,  zone: 'secondary' },
  { id: 'davis',    title: 'DAVIS',    icon: '◎', component: DavisPanel,    defaultCollapsed: false,  zone: 'secondary' },
  { id: 'output',   title: 'OUTPUT',   icon: '⬇', component: OutputPanel,   defaultCollapsed: false,  zone: 'secondary' },
];

export const getPanel = (id) => PANEL_REGISTRY.find((p) => p.id === id);
export const panelsByZone = (zone) => PANEL_REGISTRY.filter((p) => p.zone === zone);
