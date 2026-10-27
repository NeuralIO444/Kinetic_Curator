// BuildPanel shell — UX-5 reorg: the panel reads top-down as four workflow
// sections: ① LAYOUT (structure) → ② CAST (who paints) → ③ MOTION &
// BEHAVIOR (how it moves) → ④ APPEARANCE (the finish). #1202 compacts it on
// the Teenage Engineering model: one button matrix for discrete choices,
// popup value editors docked to the panel edge. No controls cut — every
// control that existed still exists; only the rendering changed. CSS class
// root stays panel-layout (see PANEL_CONSOLIDATION_PLAN.md §5).
import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { MixBar } from './layout/MixBar.jsx';
import { CompositionTiles } from './layout/CompositionTiles.jsx';
import { MotionShelf } from './layout/MotionShelf.jsx';
import { AttractorRow } from './layout/ShiftRows.jsx'; // #1204 — PULL, the dice's shift function
import { useLongPress } from '../hooks/useLongPress.js';
import { ShapesShelf } from './layout/ShapesShelf.jsx';
import { VoicesShelf } from './layout/VoicesShelf.jsx';
import { LayoutSliders } from './layout/LayoutSliders.jsx';
import { SymmetryRow, BehaveRow } from './layout/ChipRows.jsx';
import { StructureToggles } from './layout/StructureToggles.jsx';
import { AccumFamily } from './layout/AccumFamily.jsx';
import { SwarmSliders } from './layout/SwarmSliders.jsx';
import { HypeSliders } from './layout/HypeSliders.jsx'; // #1694 S3 — the hype/moth block (CREATURES + motion params); was CreatureSliders
import { AppearanceSliders } from './layout/AppearanceSliders.jsx';
import { MaterialSliders } from './layout/MaterialSliders.jsx'; // #1585 — material body tunables (Materials M4)
import { ChiaroscuroSection } from './layout/ChiaroscuroSection.jsx';
import { UnlockTreeSection } from './layout/UnlockTreeSection.jsx'; // #1630 — the unlock tree, bottom of BUILD
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
// #1204 — the shift layer: ROLL is the dice, and the dice's second
// function is PULL (attractors). Long-press ROLL opens the PULL row at the
// top of the panel body; a plain tap still just rolls — the hold swallows
// its own release click (useLongPress).
function RollButton({ onRoll, pressProps }) {
  return (
    <button
      type="button"
      className="te-cell"
      style={{ minHeight: 24, padding: '2px 10px', flexDirection: 'row', gap: 4 }}
      onClick={onRoll}
      {...pressProps}
      title="Roll the tasteful dice — 3 finalists, you crown one · long-press: pull"
      aria-label="Roll the dice"
    >
      <span aria-hidden="true">▣</span>
      <span className="te-cell-label">ROLL</span>
    </button>
  );
}

export function BuildPanel() {
  const { state } = useApp((s) => ({
    layoutParams: s.layoutParams,
    lockedParams: s.lockedParams,
    trackCount: s.layers.length,
  }));
  const { layoutParams, lockedParams, trackCount } = state;
  const dice = useDiceRoll();
  // #1204 — PULL row open state (the ROLL button's shift function).
  const [pullOpen, setPullOpen] = useState(false);
  const rollPress = useLongPress(() => setPullOpen((o) => !o));

  const lockCount = Object.values(lockedParams).filter(Boolean).length;

  return (
    <RangeTone tone="build">
      <div className="panel panel-layout">
        {/* #1227: the dock must live INSIDE the panel — .panel-layout's
        overflow:clip only contains descendants, and the always-mounted
        .te-dock (translated 228px off-canvas when closed) widened the
        real page until it did. */}
        <DockProvider>
          <PanelHeader tag="P03" title="BUILD" subtitle={layoutParams.composition}>
            {lockCount > 0 && <span className="lock-badge">▪ {lockCount}</span>}
            <RollButton onRoll={dice.roll} pressProps={rollPress} />
          </PanelHeader>
          <div className="panel-body">
            {/* #1204 — PULL: the dice's shift function, opened by long-pressing
            ROLL. Rides at the top of the body, under its host. */}
            {pullOpen && <AttractorRow layoutParams={layoutParams} />}
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
              <HypeSliders layoutParams={layoutParams} lockedParams={lockedParams} />
              <AccumFamily layoutParams={layoutParams} />
            </BuildSection>

            {/* ④ APPEARANCE — the finish: mark shape, growth, materials, and the
            CHIAROSCURO button (#1587; a button since #1629): the render
            engine's door — the sun + hue + the field→channel map, edited in
            a floating editor over the canvas */}
            <BuildSection num="4" title="Appearance">
              <AppearanceSliders layoutParams={layoutParams} lockedParams={lockedParams} />
              <MaterialSliders layoutParams={layoutParams} lockedParams={lockedParams} />
              <ChiaroscuroSection layoutParams={layoutParams} lockedParams={lockedParams} />
            </BuildSection>

            {/* ⑤ MATH — broad strokes over the fine sliders: assignable macro knobs (#724) */}
            <BuildSection num="5" title="Math">
              <MathSection />
            </BuildSection>

            {/* ⑥ UNLOCKS — #1630: the unlock tree. Every control in BUILD that can
            stand greyed or Davis-only, explained: what it is, lit or dark right
            now, and what lights it. Read-only — nodes never apply anything. */}
            <BuildSection num="6" title="Unlocks">
              <UnlockTreeSection layoutParams={layoutParams} />
            </BuildSection>
          </div>
        </DockProvider>
      </div>
    </RangeTone>
  );
}
