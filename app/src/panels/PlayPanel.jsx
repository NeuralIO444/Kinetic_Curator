// PlayPanel shell — #248 Phase 4: first PLAY content. EVOLVE target chips
// (shimmer-scored) + SOURCE/INTERVAL, and BeatRouter when the beat
// collision is live. Both subcomponents are unchanged internally —
// BeatRouter's own header comment says it was "built as a standalone
// section so it ports cleanly into the consolidated PLAY panel."
// MorphControls/PhraseControls/transport buttons/ACCUM gestures stay in
// DavisPanel for now (later phases).
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { EvolveControls } from './davis/EvolveControls.jsx';
import { BeatRouter } from './davis/BeatRouter.jsx';

export function PlayPanel() {
  const { state } = useApp(s => ({
    evolveMode: s.evolveMode,
    evolveSource: s.evolveSource,
    evolveTarget: s.evolveTarget,
    evolveInterval: s.evolveInterval,
    beatRoute: s.beatRoute,
    phraseEnabled: s.phraseEnabled,
    phraseClock: s.phraseClock,
  }));
  const {
    evolveMode, evolveSource, evolveTarget, evolveInterval, beatRoute,
    phraseEnabled, phraseClock,
  } = state;

  // Beat collision is live when both consumers are armed on the same
  // attack: evolve on SOURCE=BEAT and the phrase on CLOCK=AUDIO. Same calc
  // DavisPanel still runs for its own (not-yet-moved) PhraseControls.
  const beatCollision = evolveMode && evolveSource === 'beat' && phraseEnabled && (phraseClock || 'audio') === 'audio';

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
      </div>
    </div>
  );
}
