// LayoutPanel shell — composes focused subcomponents.
// No direct store access; emits events the shell routes.
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { ModeGrid } from './layout/ModeGrid.jsx';
import { ParamBlock } from './layout/ParamBlock.jsx';
import { ToggleRow } from './layout/ToggleRow.jsx';
import { CuratorBar } from './layout/CuratorBar.jsx';

export function LayoutPanel() {
  const { state } = useApp(s => ({
    layoutParams: s.layoutParams,
    lockedParams: s.lockedParams,
  }));
  const { layoutParams, lockedParams } = state;

  const lockCount = Object.values(lockedParams).filter(Boolean).length;

  return (
    <div className="panel panel-layout">
      <PanelHeader tag="P04" title="LAYOUT" subtitle={layoutParams.composition}>
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
