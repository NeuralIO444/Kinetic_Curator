import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { emit, Events } from '../composition/eventBus.js';
import { BehaveReadout } from './davis/BehaveReadout.jsx';
import { VoiceTiles } from './davis/VoiceTiles.jsx';
import { EvolveProgress } from './davis/EvolveProgress.jsx';
import { helpText } from '../data/helpCopy.js'; // #158: hover titles read the single map
import { captureFavorite } from '../state/slices/davisSlice.js';
// #310: FavoritesList removed from the panel — the bottom tray is canonical.
// (FavoritesList.jsx stays in the tree, unreferenced.)

/** #305 — the four sub-seed streams, in the seed control area. */
const SUB_SEED_STREAMS = [
  { id: 'spatial', label: 'SPATIAL', hint: 'positions, density, attributes, swarm motion' },
  { id: 'color', label: 'COLOR', hint: 'palette slot assignment' },
  { id: 'asset', label: 'ASSET', hint: 'which asset each placement gets' },
  { id: 'noise', label: 'NOISE', hint: 'fBm displacement warp' },
];

export function DavisPanel() {
  const { state } = useApp(s => ({
    evolveMode: s.evolveMode,
    seed: s.seed,
    seedOffsets: s.seedOffsets,
    layoutParams: s.layoutParams,
    enabledAssets: s.enabledAssets,
    phraseEnabled: s.phraseEnabled,
    phraseLength: s.phraseLength,
    phraseBeat: s.phraseBeat,
    phraseClock: s.phraseClock,
    phraseBpm: s.phraseBpm,
    morphing: s.morphing,
    audioEnabled: s.audioEnabled,
    audioBands: s.audioBands,
  }));
  const {
    evolveMode,
    seed, seedOffsets, layoutParams, enabledAssets,
    phraseEnabled, phraseLength, phraseBeat,
    phraseClock, phraseBpm, morphing, audioEnabled,
    audioBands,
  } = state;
  const { palette } = useApp();

  // #719: the one keep capture — seed, offsets (#305), layout, palette, cast.
  const saveFavorite = () => emit(Events.DAVIS_FAVORITE, {
    action: 'add',
    favorite: captureFavorite({ seed, seedOffsets, layoutParams, enabledAssets }, palette.id),
  });

  const metro = phraseClock === 'metro';
  const rms = audioBands?.rms || 0;
  const noAttack = phraseEnabled && !metro && audioEnabled && phraseBeat === 0 && rms > 0.2;
  // Phase A gesture: local FREEZE toggle state (the hook resets on ACCUM
  // toggle, and this row unmounts with it, so the two stay in sync).
  const [accumFrozen, setAccumFrozen] = useState(false);
  const toggleFreeze = () => {
    const next = !accumFrozen;
    setAccumFrozen(next);
    emit(Events.ACCUM_GESTURE, { action: 'freeze', value: next });
  };
  const accumOn = !!layoutParams.accumulation;

  // The header subtitle is unchanged (#616 only moved it out of the JSX). The
  // PERFORM readout is the phrase half of it, stated on its own.
  const phraseStatus = morphing ? 'morphing…'
    : phraseEnabled && metro ? `metro ${phraseBeat}/${phraseLength} @ ${phraseBpm || 120}`
    : phraseEnabled && !audioEnabled ? 'armed · waiting for beat'
    : noAttack ? 'armed · no attack'
    : phraseEnabled ? `${phraseBeat}/${phraseLength}`
    : 'off';
  const subtitle = morphing ? 'morphing…'
    : phraseEnabled && metro ? `metro ${phraseBeat}/${phraseLength} @ ${phraseBpm || 120}`
    : phraseEnabled && !audioEnabled ? 'phrase armed · waiting for beat'
    : noAttack ? 'armed · no attack'
    : phraseEnabled ? `phrase ${phraseBeat}/${phraseLength}`
    : evolveMode ? 'evolving'
    : 'paused';

  return (
    <div className="panel panel-davis">
      <PanelHeader tag="P07" title="GHOST STATION" subtitle={subtitle} />
      <div className="davis-body">
          {/* #248 Phase 5 — MORPH EVOLVE and PHRASE LOOP moved to PLAY.
              The phrase- and morph-related state above stays selected here:
              this panel's own header subtitle still reports live phrase and
              morph status even though the controls that drive them now
              live in PLAY — cross-panel status at a glance, same as Phase 4
              left beatCollision's inputs selected here for PLAY to read. */}
          {/* #616 — the panel reads in three labelled sections. Nothing was
              removed or re-wired: same controls, same events, new headings. */}
          <div className="davis-section-label">VOICES</div>
          {/* #717 — the flagship Voices' one home: load through the voice MIX. */}
          <VoiceTiles />
          <BehaveReadout layoutParams={layoutParams} />

          <div className="davis-section-label">GENERATE</div>
          <div className="davis-actions">
            <button className={`big-btn ${evolveMode ? 'active' : ''}`}
              onClick={() => emit(Events.DAVIS_EVOLVE, { toggle: true })}>
              {evolveMode ? 'STOP' : 'EVOLVE'}
            </button>
            <button className="big-btn" onClick={saveFavorite}>FAVORITE</button>
            <button className="big-btn" onClick={() => emit(Events.DAVIS_EVOLVE, { bumpSeed: true })}>NEW SEED</button>
          </div>

          {/* #305 — mutate one sub-seed stream. Same seed control area, no
              new panel: re-roll one stream's dice while the master seed and
              the other three streams stay locked. Highlighted = mutated. */}
          <div className="davis-actions" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}
            title="Sub-seed streams: re-roll one stream without touching the others">
            {SUB_SEED_STREAMS.map(({ id, label, hint }) => {
              const off = (seedOffsets?.[id] || 0) >>> 0;
              return (
                <button key={id} className={`micro-btn ${off ? 'active' : ''}`}
                  title={`${label} — ${hint}. Re-roll this stream's offset${off ? ` (now 0x${off.toString(16)})` : ' (locked to master seed)'}`}
                  onClick={() => emit(Events.DAVIS_MUTATE_STREAM, { group: id })}>
                  {label}
                </button>
              );
            })}
            <button className="micro-btn"
              title="Lock every stream back to the master seed (all offsets zero)"
              onClick={() => emit(Events.DAVIS_MUTATE_STREAM, { reset: true })}>
              ↺
            </button>
          </div>

          <EvolveProgress />

          <div className="davis-section-label">PERFORM</div>
          <div className="davis-phrase-status" title="Phrase clock status. The controls live in PLAY; this panel only reports.">
            <i>PHRASE</i><b>{phraseStatus}</b>
          </div>
          {accumOn && (
            <div className="davis-actions" title="ACCUM gestures — play the trail buffer">
              <button className={`big-btn ${accumFrozen ? 'active' : ''}`}
                onClick={toggleFreeze}
                title="FREEZE: hold the trails mid-air — no fade, no new marks">
                {accumFrozen ? 'THAW' : 'FREEZE'}
              </button>
              <button className="big-btn"
                onClick={() => emit(Events.ACCUM_GESTURE, { action: 'clear' })}
                title={helpText('davis-clear')}>
                CLEAR
              </button>
              <button className="big-btn"
                onClick={() => emit(Events.ACCUM_GESTURE, { action: 'swell' })}
                title="SWELL: breathe the trail length out and back over ~2 seconds">
                SWELL
              </button>
            </div>
          )}
      </div>
    </div>
  );
}
