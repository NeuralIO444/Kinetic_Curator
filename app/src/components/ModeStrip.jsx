// Mode/behave quick strip — always-visible mode favorites + behave toggle,
// same "reach it from any panel tab" role PaletteStrip plays for palette.
// Mode has ~12 options; PaletteStrip's own "favorites" are just the first
// CHIP_CAP catalog entries (no pinning mechanism today), so this mirrors
// that exact pattern rather than inventing a new one. ModeGrid in the
// LAYOUT panel stays the full picker — this is the quick-access layer.
import { useStore } from '../state/store.js';
import { emit, Events } from '../composition/eventBus.js';
import { LAYOUT_MODES } from '../data/layout-modes.js';
import { STUB_VOICES, MOTION_MODES, isMotionActive } from '../data/voices.js';

const MODE_FAVORITES = LAYOUT_MODES.slice(0, 4);
const STUB_IDS = new Set(STUB_VOICES.map((v) => v.id));

export function ModeStrip() {
  const mode = useStore((s) => s.layoutParams.mode);
  const layoutParams = useStore((s) => s.layoutParams);
  const loadMotion = useStore((s) => s.loadMotion);

  const loadStubMode = useStore((s) => s.loadStubMode);
  // #517: stub modes ride the MIX road; anything else is a bare mode switch.
  const setMode = (id) => (STUB_IDS.has(id) ? loadStubMode(id) : emit(Events.LAYOUT_PARAM, { key: 'mode', value: id }));

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
      <span className="mode-strip-label">MOTION</span>
      <div className="mode-strip-chips">
        {MOTION_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`chip-btn ${isMotionActive(layoutParams, m) ? 'active' : ''}`}
            onClick={() => loadMotion(m.id)}
            title={`${m.name} — ${m.vibe}`}
          >
            {m.name.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
