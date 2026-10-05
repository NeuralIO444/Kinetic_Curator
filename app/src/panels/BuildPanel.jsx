// BuildPanel shell — UX-5 reorg: the panel reads top-down as four workflow
// sections: ① LAYOUT (structure) → ② CAST (who paints) → ③ MOTION &
// BEHAVIOR (how it moves) → ④ APPEARANCE (the finish). No controls cut —
// every control that existed still exists, same store selectors, same event
// shapes; only the grouping changed. CSS class root stays panel-layout
// (see PANEL_CONSOLIDATION_PLAN.md §5).
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { MixBar } from './layout/MixBar.jsx';
import { CompositionTiles } from './layout/CompositionTiles.jsx';
import { MotionShelf } from './layout/MotionShelf.jsx';
import { ShapesShelf } from './layout/ShapesShelf.jsx';
import { VoicesShelf } from './layout/VoicesShelf.jsx';
import { LayoutSliders } from './layout/LayoutSliders.jsx';
import { SymmetryRow, BehaveRow } from './layout/ChipRows.jsx';
import { StructureToggles } from './layout/StructureToggles.jsx';
import { AccumFamily } from './layout/AccumFamily.jsx';
import { SwarmSliders } from './layout/SwarmSliders.jsx';
import { CreatureSliders } from './layout/CreatureSliders.jsx';
import { AppearanceSliders } from './layout/AppearanceSliders.jsx';
import { SunRow } from './layout/SunRow.jsx';
import { LayerStack } from './build/LayerStack.jsx';
import { BuildSection } from './build/BuildSection.jsx';
import { MathSection } from './build/MathSection.jsx';

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
        {/* ① LAYOUT — structure first: tiles, size/shape sliders, symmetry, bleed/mirror/overlap */}
        <BuildSection num="1" title="Layout">
          <CompositionTiles mode={layoutParams.mode} />
          <LayoutSliders layoutParams={layoutParams} lockedParams={lockedParams} />
          <SymmetryRow layoutParams={layoutParams} />
          <StructureToggles layoutParams={layoutParams} />
        </BuildSection>

        {/* ② CAST — who paints the stage: shapes pool, my voices, layer stack */}
        <BuildSection num="2" title="Cast">
          <div className="voice-row">
            <ShapesShelf />
            <VoicesShelf />
            <MixBar />
          </div>
          <LayerStack />
        </BuildSection>

        {/* ③ MOTION & BEHAVIOR — how it moves: motion/behave chips, physics, creatures, trails */}
        <BuildSection num="3" title="Motion & Behavior">
          <MotionShelf layoutParams={layoutParams} />
          <BehaveRow layoutParams={layoutParams} />
          <SwarmSliders layoutParams={layoutParams} lockedParams={lockedParams} />
          <CreatureSliders layoutParams={layoutParams} lockedParams={lockedParams} />
          <AccumFamily layoutParams={layoutParams} />
        </BuildSection>

        {/* ④ APPEARANCE — the finish: hue, mark shape, growth, sun light */}
        <BuildSection num="4" title="Appearance">
          <AppearanceSliders layoutParams={layoutParams} lockedParams={lockedParams} />
          <SunRow />
        </BuildSection>

        {/* ⑤ MATH — broad strokes over the fine sliders: assignable macro knobs (#724) */}
        <BuildSection num="5" title="Math">
          <MathSection />
        </BuildSection>
      </div>
    </div>
  );
}
