// Structure toggles — extracted from ToggleRow.jsx (UX-5 reorg).
// BLEED / MIRROR / OVERLAP live in LAYOUT; the ACCUM trail family moved to
// MOTION & BEHAVIOR (AccumFamily.jsx).
import { emit, Events } from '../../composition/eventBus.js';

const TOGGLES = ['bleed', 'mirror', 'overlap'];

export function StructureToggles({ layoutParams }) {
  return (
    <div className="toggle-row">
      {TOGGLES.map(key => (
        <button
          key={key}
          className={`tg ${layoutParams[key] ? 'tg-on' : ''}`}
          onClick={() => emit(Events.LAYOUT_PARAM, { key, value: !layoutParams[key] })}
        >
          <span className="tg-box">{layoutParams[key] ? '◉' : '○'}</span>
          {key.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
