import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { emit, Events } from '../composition/eventBus.js';
import { EvolveControls } from './davis/EvolveControls.jsx';
import { BeatRouter } from './davis/BeatRouter.jsx';
import { MorphControls } from './davis/MorphControls.jsx';
import { PhraseControls } from './davis/PhraseControls.jsx';
import { helpText } from '../data/helpCopy.js'; // #158: hover titles read the single map
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
    evolveSource: s.evolveSource,
    evolveTarget: s.evolveTarget,
    evolveInterval: s.evolveInterval,
    beatRoute: s.beatRoute,
    seed: s.seed,
    seedOffsets: s.seedOffsets,
    layoutParams: s.layoutParams,
    phraseEnabled: s.phraseEnabled,
    phraseLength: s.phraseLength,
    phraseMode: s.phraseMode,
    phraseBeat: s.phraseBeat,
    phraseClock: s.phraseClock,
    phraseBpm: s.phraseBpm,
    morphEvolve: s.morphEvolve,
    morphDurationMs: s.morphDurationMs,
    morphing: s.morphing,
    audioEnabled: s.audioEnabled,
    beatPulse: s.beatPulse,
    audioBands: s.audioBands,
  }));
  const {
    evolveMode, evolveSource, evolveTarget, evolveInterval, beatRoute,
    seed, seedOffsets, layoutParams,
    phraseEnabled, phraseLength, phraseMode, phraseBeat,
    phraseClock, phraseBpm, morphEvolve, morphDurationMs, morphing, audioEnabled,
    beatPulse, audioBands,
  } = state;
  const { palette } = useApp();

  const saveFavorite = () => emit(Events.DAVIS_FAVORITE, {
    action: 'add',
    favorite: {
      seed,
      // #305 — the recipe is only deterministic with the stream offsets.
      seedOffsets: { ...(seedOffsets || {}) },
      timestamp: new Date().toISOString().slice(11, 19),
      config: { layout: { ...layoutParams }, palette: { id: palette.id } },
    },
  });

  const phraseProgress = phraseLength > 0 ? (phraseBeat / phraseLength) * 100 : 0;
  const metro = phraseClock === 'metro';
  const rms = audioBands?.rms || 0;
  const noAttack = phraseEnabled && !metro && audioEnabled && phraseBeat === 0 && rms > 0.2;
  // Beat collision is live when both consumers are armed on the same attack:
  // evolve on SOURCE=BEAT and the phrase on CLOCK=AUDIO.
  const beatCollision = evolveMode && evolveSource === 'beat' && phraseEnabled && (phraseClock || 'audio') === 'audio';
  // Phase A gesture: local FREEZE toggle state (the hook resets on ACCUM
  // toggle, and this row unmounts with it, so the two stay in sync).
  const [accumFrozen, setAccumFrozen] = useState(false);
  const toggleFreeze = () => {
    const next = !accumFrozen;
    setAccumFrozen(next);
    emit(Events.ACCUM_GESTURE, { action: 'freeze', value: next });
  };
  const accumOn = !!layoutParams.accumulation;

  return (
    <div className="panel panel-davis">
      <PanelHeader
        tag="P07"
        title="GHOST STATION"
        subtitle={
          morphing ? 'morphing…'
            : phraseEnabled && metro ? `metro ${phraseBeat}/${phraseLength} @ ${phraseBpm || 120}`
            : phraseEnabled && !audioEnabled ? 'phrase armed · waiting for beat'
            : noAttack ? 'armed · no attack'
            : phraseEnabled ? `phrase ${phraseBeat}/${phraseLength}`
            : evolveMode ? 'evolving'
            : 'paused'
        }
      />
      <div className="davis-body">
          <EvolveControls
            evolveTarget={evolveTarget}
            evolveSource={evolveSource}
            evolveInterval={evolveInterval}
          />

          {beatCollision && <BeatRouter beatRoute={beatRoute || 'both'} />}

          <MorphControls
            morphEvolve={morphEvolve}
            morphDurationMs={morphDurationMs}
            morphing={morphing}
          />

          <PhraseControls
            phraseEnabled={phraseEnabled}
            phraseLength={phraseLength}
            phraseMode={phraseMode}
            phraseBeat={phraseBeat}
            phraseProgress={phraseProgress}
            layoutMode={layoutParams.mode}
            audioEnabled={audioEnabled}
            phraseClock={phraseClock || 'audio'}
            phraseBpm={phraseBpm || 120}
            beatPulse={beatPulse || 0}
            rms={rms}
          />

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
