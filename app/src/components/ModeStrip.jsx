// Mode/behave quick strip — always-visible mode favorites + behave toggle,
// same "reach it from any panel tab" role PaletteStrip plays for palette.
// Mode has ~12 options; PaletteStrip's own "favorites" are just the first
// CHIP_CAP catalog entries (no pinning mechanism today), so this mirrors
// that exact pattern rather than inventing a new one. ModeGrid in the
// LAYOUT panel stays the full picker — this is the quick-access layer.
import { useStore } from '../state/store.js';
import { emit, Events } from '../composition/eventBus.js';
import { LAYOUT_MODES, BEHAVE_MODES } from '../data/layout-modes.js';

const MODE_FAVORITES = LAYOUT_MODES.slice(0, 4);

export function ModeStrip() {
  const mode = useStore((s) => s.layoutParams.mode);
  const behave = useStore((s) => s.layoutParams.behave || 'cruise');

  const setMode = (id) => emit(Events.LAYOUT_PARAM, { key: 'mode', value: id });
  const setBehave = (id) => emit(Events.LAYOUT_PARAM, { key: 'behave', value: id });

  return (
    <div className="mode-strip">
      <span className="mode-strip-label">MODE</span>
      <div className="mode-strip-chips">
        {MODE_FAVORITES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            className={`chip-btn ${mode === m.id ? 'active' : ''}`}
            onClick={() => setMode(m.id)}
            title={`${m.name} — key ${i + 1}`}
          >
            {m.glyph}
          </button>
        ))}
      </div>
      <span className="mode-strip-label">BEHAVE</span>
      <div className="mode-strip-chips">
        {BEHAVE_MODES.map((b) => (
          <button
            key={b}
            type="button"
            className={`chip-btn ${behave === b ? 'active' : ''}`}
            onClick={() => setBehave(b)}
            title={b}
          >
            {b.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
