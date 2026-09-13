// LayoutPanel shell — composes focused subcomponents.
// No direct store access; emits events the shell routes.
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { PresetBrowser } from './layout/PresetBrowser.jsx';
import { ModeGrid } from './layout/ModeGrid.jsx';
import { ParamBlock } from './layout/ParamBlock.jsx';
import { ToggleRow } from './layout/ToggleRow.jsx';
import { RandomizeBar } from './layout/RandomizeBar.jsx';

export function LayoutPanel() {
  const { state } = useApp(s => ({
    layoutParams: s.layoutParams,
    lockedParams: s.lockedParams,
  }));
  const { layoutParams, lockedParams } = state;
  const { open, toggle } = useCollapse(true);

  const lockCount = Object.values(lockedParams).filter(Boolean).length;

  return (
    <div className="panel panel-layout">
      <PanelHeader tag="P04" title="LAYOUT" subtitle={layoutParams.composition} collapsed={!open} onToggle={toggle}>
        {lockCount > 0 && <span className="lock-badge">🔒 {lockCount}</span>}
      </PanelHeader>
      {open && (
        <div className="panel-body">
          <PresetBrowser composition={layoutParams.composition} />
          <ModeGrid mode={layoutParams.mode} />
          <RandomizeBar lockCount={lockCount} />
          <ParamBlock layoutParams={layoutParams} lockedParams={lockedParams} />
          <ToggleRow layoutParams={layoutParams} />
        </div>
      )}
    </div>
  );
}
