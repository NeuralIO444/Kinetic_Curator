// Panel registry — panels are data, not hard-coded imports.
// Adding a panel = one entry here. The Shell knows nothing about features.
import { lazy } from 'react';
import { CanvasPanel } from '../panels/CanvasPanel.jsx';
import { BuildPanel } from '../panels/BuildPanel.jsx';
import { AssetPoolPanel } from '../panels/AssetPoolPanel.jsx';
import { StimulusPanel } from '../panels/StimulusPanel.jsx';
import { DavisPanel } from '../panels/DavisPanel.jsx';
import { PlayPanel } from '../panels/PlayPanel.jsx';
import { PipelinePanel } from '../panels/PipelinePanel.jsx';
import { devModeOn } from './devMode.mjs';

// The merged DEV panel (#691) re-hosts the three former dev panels —
// Shader Lab (#193), Governor X-ray (hardening 5/6), Governor tuning
// (#259) — as tabs; each tab stays its own lazy chunk, loaded only when
// the tab opens.
//
// The gate, reversed on record (#2077, Matt's ruling 2026-11-10): #691
// made the panel dev-only — never registered in prod builds — so
// MegaMind's ruled home (dev panel first, #1525) was unreachable in the
// shipped app. Registration is now a RUNTIME decision: a dev build, or
// any build with Dev mode on (Settings ≡, persisted by devMode.mjs, off
// by default). The panel stays a lazy chunk either way — it loads only
// when first opened, and with Dev mode off a release build's tab strip
// is exactly what it was before this change. The sharp tools inside
// (GOV TUNE, KERNEL, UNITS editors mutate real state) are the accepted
// cost of the ruling; the mitigations are the ones Matt chose: off by
// default, honestly named, one deliberate toggle in Settings.
const DevPanel = lazy(() => import('../panels/DevPanel.jsx').then((m) => ({ default: m.DevPanel })));

/** The DEV panel is reachable in dev builds, and in any build while Dev mode is on (#2077). */
export const devPanelAvailable = () => import.meta.env.DEV || devModeOn();

export const PANEL_REGISTRY = [
  { id: 'canvas', title: 'CANVAS', icon: '◆', component: CanvasPanel, zone: 'primary' },
  // #962 (UX-2): tab order follows the production metaphor —
  // cast → stage → direction → music → performance → ship.
  // #467: ASSETS is a tab again — Matt's play-test reversal of #248 Phase 1
  // (the quiet ◇ drawer trigger was too hidden for a panel this visited).
  // The drawer mechanism in Shell.jsx stays, idle until a panel claims it.
  { id: 'assets', title: 'ASSETS', icon: '◇', component: AssetPoolPanel, zone: 'secondary' },
  { id: 'build', title: 'BUILD', icon: '■', component: BuildPanel, zone: 'secondary' },
  { id: 'davis', title: 'DIRECTORS', icon: '◎', component: DavisPanel, zone: 'secondary' },
  { id: 'stimulus', title: 'STIMULI', icon: '▸', component: StimulusPanel, zone: 'secondary' },
  // #248 Phase 4: PLAY is new, registered alongside davis/stimulus while
  // they still hold content — expected mid-migration tab-count bulge
  // (PANEL_CONSOLIDATION_PLAN.md §2.8), not a violation of the 4-tab cap.
  { id: 'play', title: 'PLAY', icon: '▶', component: PlayPanel, zone: 'secondary' },
  { id: 'pipeline', title: 'PIPELINE', icon: '⇌', component: PipelinePanel, zone: 'secondary' },
];

PANEL_REGISTRY.push({ id: 'dev', title: 'DEV', icon: '⬢', component: DevPanel, zone: 'secondary' });

// The registry lists every panel; reachability is decided here, at read
// time, so flipping Dev mode adds or removes the DEV tab with no reload.
export const panelsByZone = (zone) =>
  PANEL_REGISTRY.filter((p) => p.zone === zone && (p.id !== 'dev' || devPanelAvailable()));
