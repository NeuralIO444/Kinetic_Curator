import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { emit, Events } from '../composition/eventBus.js';
import { EvolveControls } from './davis/EvolveControls.jsx';
import { MorphControls } from './davis/MorphControls.jsx';
import { PhraseControls } from './davis/PhraseControls.jsx';
import { FavoritesList } from './davis/FavoritesList.jsx';

export function DavisPanel() {
  const { state } = useApp(s => ({
    evolveMode: s.evolveMode,
    evolveSource: s.evolveSource,
    evolveTarget: s.evolveTarget,
    evolveInterval: s.evolveInterval,
    autoSnapshot: s.autoSnapshot,
    motionSmoothing: s.motionSmoothing,
    favorites: s.favorites,
    seed: s.seed,
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
    evolveMode, evolveSource, evolveTarget, evolveInterval, autoSnapshot,
    motionSmoothing, favorites, seed, layoutParams,
    phraseEnabled, phraseLength, phraseMode, phraseBeat,
    phraseClock, phraseBpm,
    morphEvolve, morphDurationMs, morphing, audioEnabled,
    beatPulse, audioBands,
  } = state;
  const { palette } = useApp();

  const saveFavorite = () => emit(Events.DAVIS_FAVORITE, {
    action: 'add',
    favorite: {
      seed,
      timestamp: new Date().toISOString().slice(11, 19),
      config: { layout: { ...layoutParams }, palette: { id: palette.id } },
    },
  });

  const phraseProgress = phraseLength > 0 ? (phraseBeat / phraseLength) * 100 : 0;
  const metro = phraseClock === 'metro';
  const rms = audioBands?.rms || 0;
  const noAttack = phraseEnabled && !metro && audioEnabled && phraseBeat === 0 && rms > 0.2;

  return (
    <div className="panel panel-davis">
      <PanelHeader
        tag="P07"
        title="DAVIS MODE"
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
            autoSnapshot={autoSnapshot}
            motionSmoothing={motionSmoothing}
          />

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

          <FavoritesList favorites={favorites} />
      </div>
    </div>
  );
}
