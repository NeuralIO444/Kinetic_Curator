// Randomize unlocked bar
import { emit, Events } from '../../composition/eventBus.js';

export function RandomizeBar({ lockCount }) {
  return (
    <div className="randomize-bar">
      <button className="randomize-btn"
        title="Re-roll every unlocked param. Locked ones keep their values."
        onClick={() => emit(Events.LAYOUT_RANDOMIZE, { type: 'unlocked' })}>
        🎲 RANDOMIZE UNLOCKED
      </button>
      <span className="randomize-hint">{lockCount > 0 ? `${lockCount} locked` : 'all unlocked'}</span>
    </div>
  );
}
