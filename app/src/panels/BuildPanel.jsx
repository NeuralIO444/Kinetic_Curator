// BuildPanel shell — UX-5 reorg: the panel reads top-down as four workflow
// sections: ① LAYOUT (structure) → ② CAST (who paints) → ③ MOTION &
// BEHAVIOR (how it moves) → ④ APPEARANCE (the finish). #1202 compacts it on
// the Teenage Engineering model: one button matrix for discrete choices,
// popup value editors docked to the panel edge. No controls cut — every
// control that existed still exists; only the rendering changed. CSS class
// root stays panel-layout (see PANEL_CONSOLIDATION_PLAN.md §5).
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
import { RangeTone } from '../components/RangeTone.jsx';
import { DockProvider } from './build/te/ValueDock.jsx';
import { useDiceRoll } from './layout/useDiceRoll.js';
import { LOIS_LINES } from './loisLines.mjs';

// #1202 — ROLL lives in the panel header. The dice honors
// prefers-reduced-motion: with reduced motion the tray appears without the
// rolling shuffle (the tray itself is the static equivalent).
// (The dice emoji is retired #1028; the header uses a geometric glyph.)
function RollButton({ onRoll }) {
  return (
    <button
      type="button"
      className="te-cell"
      style={{ minHeight: 24, padding: '2px 10px', flexDirection: 'row', gap: 4 }}
      onClick={onRoll}
      title="Roll the tasteful dice — 3 finalists, you crown one"
      aria-label="Roll the dice"
    >
      <span aria-hidden="true">▣</span>
      <span className="te-cell-label">ROLL</span>
    </button>
  );
}

export function BuildPanel() {
  const { state } = useApp(s => ({
    layoutParams: s.layoutParams,
    lockedParams: s.lockedParams,
    trackCount: s.layers.length,
  }));
  const { layoutParams, lockedParams, trackCount } = state;
  const dice = useDiceRoll();

  const lockCount = Object.values(lockedParams).filter(Boolean).length;

  return (
    <RangeTone tone="build">
    <DockProvider>
    <div className="panel panel-layout">
      <PanelHeader tag="P03" title="BUILD" subtitle={layoutParams.composition}>
        {lockCount > 0 && <span className="lock-badge">▪ {lockCount}</span>}
        <RollButton onRoll={dice.roll} />
      </PanelHeader>
      <div className="panel-body">
        {/* ① LAYOUT — structure first: tiles, size/shape sliders, symmetry, bleed/mirror/overlap */}
        <BuildSection num="1" title="Layout">
          <CompositionTiles
            mode={layoutParams.mode}
            tray={dice.tray}
            onCrown={dice.crown}
            onReroll={dice.roll}
            onDismiss={dice.dismiss}
          />
          <LayoutSliders layoutParams={layoutParams} lockedParams={lockedParams} />
          <SymmetryRow layoutParams={layoutParams} />
          <StructureToggles layoutParams={layoutParams} />
        </BuildSection>

        {/* ② CAST — who paints the stage: shapes pool, my voices, layer stack */}
        <BuildSection num="2" title="Cast">
          {/* #1032 — voice 1, bare-stage moment: one track and nothing else. A second track hides it. */}
          {trackCount <= 1 && <div className="lois-line name">{LOIS_LINES.build}</div>}
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
    </DockProvider>
    </RangeTone>
  );
}
