// Toggle row: bleed / recolor / mirror / overlap / accum / blend / shading
import { emit, Events } from '../../composition/eventBus.js';
import { BLEND_MODES, PALETTE_SHIFTS } from '../../data/layout-modes.js';

const TOGGLES = ['bleed', 'recolor', 'mirror', 'overlap', 'accumulation'];

export function ToggleRow({ layoutParams }) {
  return (
    <div className="toggle-row">
      {TOGGLES.map(key => (
        <button
          key={key}
          className={`tg ${layoutParams[key] ? 'tg-on' : ''}`}
          title={key === 'accumulation' ? 'HYPE-style trails — composites into a persistent bitmap' : undefined}
          onClick={() => emit(Events.LAYOUT_PARAM, { key, value: !layoutParams[key] })}
        >
          <span className="tg-box">{layoutParams[key] ? '◉' : '○'}</span>
          {key === 'accumulation' ? 'ACCUM' : key.toUpperCase()}
        </button>
      ))}
      {layoutParams.accumulation && (
        <label
          className="tg"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}
          title="Trail persistence (higher = longer exposure)"
        >
          FADE
          <input
            type="range"
            min={0.5}
            max={0.98}
            step={0.01}
            value={layoutParams.accumulationFade ?? 0.88}
            onChange={(e) =>
              emit(Events.LAYOUT_PARAM, {
                key: 'accumulationFade',
                value: parseFloat(e.target.value),
              })
            }
            style={{ width: 64 }}
          />
        </label>
      )}
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
      <select
        value={layoutParams.paletteShift ?? 'auto'}
        onChange={e => emit(Events.LAYOUT_PARAM, { key: 'paletteShift', value: e.target.value })}
        className="tg blend-mode-select"
        title="How palette colors are distributed across shapes. AUTO follows the composition preset."
      >
        {PALETTE_SHIFTS.map(s => (
          <option key={s} value={s}>COLOR: {s.toUpperCase()}</option>
        ))}
      </select>
    </div>
  );
}
