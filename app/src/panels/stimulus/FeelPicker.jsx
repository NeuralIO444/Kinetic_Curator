// FEEL (#615) — three audio-feel macros over the eight reactivity params.
// The face is three feels; the eight raw sliders live behind ADVANCED (the
// same ReactivityControls, unchanged). Reads CUSTOM when the live params
// match none of the three (a tweaked slider, a voice, an import) — honest, not
// a guess. Hover a feel to see every number it sets.
import { FEEL_PRESETS, activeFeelId, feelReadout } from '../../data/feels.js';
import { emit, Events } from '../../composition/eventBus.js';

export function FeelPicker({ layoutParams }) {
  const active = activeFeelId(layoutParams);
  return (
    <div className="stim-feel" role="group" aria-label="Audio feel">
      <div className="stim-feel-head">
        <span className="lbl">feel</span>
        <span className={`stim-feel-state ${active === 'custom' ? 'custom' : ''}`}>
          {active === 'custom' ? 'CUSTOM' : ''}
        </span>
      </div>
      <div className="stim-feel-row">
        {FEEL_PRESETS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip-btn stim-feel-btn ${active === f.id ? 'active' : ''}`}
            aria-pressed={active === f.id}
            onClick={() => emit(Events.FEEL_APPLY, { id: f.id })}
            title={`${f.hint}\n${feelReadout(f)}`}
          >
            {f.name}
          </button>
        ))}
      </div>
    </div>
  );
}
