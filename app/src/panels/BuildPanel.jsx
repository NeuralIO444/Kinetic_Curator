// BuildPanel shell — #248 Phase 2: absorbs LAYOUT's composition verbatim
// under the BUILD tab. Same subcomponents, same store selectors, same
// event shapes; only the title/id/tag changed. CSS class root stays
// panel-layout on purpose (see PANEL_CONSOLIDATION_PLAN.md §5 — renaming
// class roots to match new panel names is explicitly out of scope here).
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { ModeGrid } from './layout/ModeGrid.jsx';
import { ParamBlock } from './layout/ParamBlock.jsx';
import { ToggleRow } from './layout/ToggleRow.jsx';
import { CuratorBar } from './layout/CuratorBar.jsx';

export function BuildPanel() {
  const { state } = useApp(s => ({
    layoutParams: s.layoutParams,
    lockedParams: s.lockedParams,
  }));
  const { layoutParams, lockedParams } = state;

  const lockCount = Object.values(lockedParams).filter(Boolean).length;

  return (
    <div className="panel panel-layout">
      <PanelHeader tag="P03" title="BUILD" subtitle={layoutParams.composition}>
        {lockCount > 0 && <span className="lock-badge">🔒 {lockCount}</span>}
      </PanelHeader>
      <div className="panel-body">
        <ModeGrid mode={layoutParams.mode} />
        <CuratorBar lockCount={lockCount} composition={layoutParams.composition} />
        <ParamBlock layoutParams={layoutParams} lockedParams={lockedParams} />
        <ToggleRow layoutParams={layoutParams} />
      </div>
    </div>
  );
}
