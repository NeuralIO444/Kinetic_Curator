// Layout mode tiles
import { LAYOUT_MODES } from '../../data/layout-modes.js';
import { emit, Events } from '../../composition/eventBus.js';

export function ModeGrid({ mode }) {
  return (
    <div className="mode-grid">
      {LAYOUT_MODES.map(m => (
        <button
          key={m.id}
          className={`mode-tile ${mode === m.id ? 'active' : ''}`}
          onClick={() => emit(Events.LAYOUT_PARAM, { key: 'mode', value: m.id })}
        >
          <span style={{ fontSize: '11px' }}>{m.glyph}</span>
          {m.name}
        </button>
      ))}
    </div>
  );
}
