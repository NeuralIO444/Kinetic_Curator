// PlayPanel shell — #248 Phase 4: first PLAY content (EVOLVE target chips,
// shimmer-scored, + SOURCE/INTERVAL, and BeatRouter when the beat collision
// is live). Phase 5 adds MORPH EVOLVE + PHRASE LOOP. All subcomponents are
// unchanged internally — BeatRouter's own header comment says it was
// "built as a standalone section so it ports cleanly into the consolidated
// PLAY panel." Transport buttons/sub-seed streams/ACCUM gestures stay in
// DavisPanel for now (later phases).
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { EvolveControls } from './davis/EvolveControls.jsx';
import { BeatRouter } from './davis/BeatRouter.jsx';
import { MorphControls } from './davis/MorphControls.jsx';
import { PhraseControls } from './davis/PhraseControls.jsx';

export function PlayPanel() {
  const { state } = useApp(s => ({
    evolveMode: s.evolveMode,
    evolveSource: s.evolveSource,
    evolveTarget: s.evolveTarget,
    evolveInterval: s.evolveInterval,
    beatRoute: s.beatRoute,
    phraseEnabled: s.phraseEnabled,
    phraseLength: s.phraseLength,
    phraseMode: s.phraseMode,
    phraseBeat: s.phraseBeat,
    phraseClock: s.phraseClock,
    euclidBeats: s.euclidBeats,
    euclidSteps: s.euclidSteps,
    euclidRotate: s.euclidRotate,
    phraseBpm: s.phraseBpm,
    morphEvolve: s.morphEvolve,
    morphDurationMs: s.morphDurationMs,
    morphing: s.morphing,
    audioEnabled: s.audioEnabled,
    beatPulse: s.beatPulse,
    audioBands: s.audioBands,
    layoutParams: s.layoutParams,
  }));
  const {
    evolveMode, evolveSource, evolveTarget, evolveInterval, beatRoute,
    phraseEnabled, phraseLength, phraseMode, phraseBeat, phraseClock, phraseBpm,
    euclidBeats, euclidSteps, euclidRotate,
    morphEvolve, morphDurationMs, morphing, audioEnabled, beatPulse, audioBands,
    layoutParams,
  } = state;

  // Beat collision is live when both consumers are armed on the same
  // attack: evolve on SOURCE=BEAT and the phrase on CLOCK=AUDIO.
  const beatCollision = evolveMode && evolveSource === 'beat' && phraseEnabled && (phraseClock || 'audio') === 'audio';
  const phraseProgress = phraseLength > 0 ? (phraseBeat / phraseLength) * 100 : 0;
  const rms = audioBands?.rms || 0;

  return (
    <div className="panel panel-davis">
      <PanelHeader tag="P04" title="PLAY" subtitle={evolveMode ? 'evolving' : 'paused'} />
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
          euclidBeats={euclidBeats}
          euclidSteps={euclidSteps}
          euclidRotate={euclidRotate}
          beatPulse={beatPulse || 0}
          rms={rms}
        />
      </div>
    </div>
  );
}
