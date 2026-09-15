// Toggle row: bleed / recolor / mirror / overlap / blend mode
import { emit, Events } from '../../composition/eventBus.js';
import { BLEND_MODES } from '../../data/layout-modes.js';

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
      <select
        value={layoutParams.blendMode}
        onChange={e => emit(Events.LAYOUT_PARAM, { key: 'blendMode', value: e.target.value })}
        className="tg blend-mode-select"
        title="Blend mode"
      >
        {BLEND_MODES.map(mode => (
          <option key={mode} value={mode}>{mode.toUpperCase()}</option>
        ))}
      </select>
      <select
        value={layoutParams.shading}
        onChange={e => emit(Events.LAYOUT_PARAM, { key: 'shading', value: e.target.value })}
        className="tg blend-mode-select"
        title="Shading"
      >
        <option value="flat">SHADING: FLAT</option>
        <option value="gloss">SHADING: GLOSS</option>
      </select>
    </div>
  );
}
