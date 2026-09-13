// Toggle row: bleed / recolor / mirror / overlap
import { emit, Events } from '../../composition/eventBus.js';

const TOGGLES = ['bleed', 'recolor', 'mirror', 'overlap'];

export function ToggleRow({ layoutParams }) {
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
