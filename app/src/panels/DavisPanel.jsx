import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { EvolveControls } from './davis/EvolveControls.jsx';
import { MorphControls } from './davis/MorphControls.jsx';
import { PhraseControls } from './davis/PhraseControls.jsx';
import { FavoritesList } from './davis/FavoritesList.jsx';

export function DavisPanel() {
  const { dispatch, palette } = useApp();
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
    morphEvolve: s.morphEvolve,
    morphDurationMs: s.morphDurationMs,
    morphing: s.morphing,
  }));
  const {
    evolveMode, evolveSource, evolveTarget, evolveInterval, autoSnapshot,
    motionSmoothing, favorites, seed, layoutParams,
    phraseEnabled, phraseLength, phraseMode, phraseBeat,
    morphEvolve, morphDurationMs, morphing,
  } = state;
  const { open, toggle } = useCollapse(false);

  const favoriteCurrent = () => {
    dispatch({
      type: 'ADD_FAVORITE',
      favorite: {
        seed,
        timestamp: new Date().toISOString().slice(11, 19),
        config: { layout: { ...layoutParams }, palette: { id: palette.id } },
      },
    });
  };

  const phraseProgress = phraseLength > 0 ? (phraseBeat / phraseLength) * 100 : 0;

  return (
    <div className="panel panel-davis">
      <PanelHeader
        tag="P07"
        title="DAVIS MODE"
        subtitle={morphing ? 'morphing…' : phraseEnabled ? `phrase ${phraseBeat}/${phraseLength}` : evolveMode ? 'evolving' : 'paused'}
        collapsed={!open}
        onToggle={toggle}
      />
      {open && (
        <div className="davis-body">
          <EvolveControls
            evolveTarget={evolveTarget}
            evolveSource={evolveSource}
            evolveInterval={evolveInterval}
            autoSnapshot={autoSnapshot}
            motionSmoothing={motionSmoothing}
            evolveMode={evolveMode}
            onDispatch={dispatch}
          />

          <MorphControls
            morphEvolve={morphEvolve}
            morphDurationMs={morphDurationMs}
            morphing={morphing}
            onDispatch={dispatch}
          />

          <PhraseControls
            phraseEnabled={phraseEnabled}
            phraseLength={phraseLength}
            phraseMode={phraseMode}
            phraseBeat={phraseBeat}
            phraseProgress={phraseProgress}
            onDispatch={dispatch}
          />

          <div className="davis-actions">
            <button className={`big-btn ${evolveMode ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'SET_EVOLVE_MODE', payload: !evolveMode })}>
              {evolveMode ? 'STOP' : 'EVOLVE'}
            </button>
            <button className="big-btn" onClick={favoriteCurrent}>FAVORITE</button>
            <button className="big-btn" onClick={() => dispatch({ type: 'BUMP_SEED' })}>NEW SEED</button>
          </div>

          <FavoritesList favorites={favorites} onDispatch={dispatch} />
        </div>
      )}
    </div>
  );
}
