// Toggle row: bleed / recolor / mirror / overlap / accum / blend / shading
import { emit, Events } from '../../composition/eventBus.js';
import { BLEND_MODES, PALETTE_SHIFTS } from '../../data/layout-modes.js';

const TOGGLES = ['bleed', 'recolor', 'mirror', 'overlap', 'accumulation'];
const TOGGLE_TITLES = {
  bleed: 'Let shapes spill past the canvas edge.',
  recolor: 'Re-tint shapes from the palette on re-roll.',
  mirror: 'Mirror the layout.',
  overlap: 'Let shapes overlap each other.',
  accumulation: 'HYPE-style trails — composites into a persistent bitmap',
};

export function ToggleRow({ layoutParams }) {
  return (
    <div className="toggle-row">
      {TOGGLES.map(key => (
        <button
          key={key}
          className={`tg ${layoutParams[key] ? 'tg-on' : ''}`}
          title={TOGGLE_TITLES[key]}
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
            title="Trail persistence (higher = longer exposure)"
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
      {layoutParams.accumulation && (
        <label
          className="tg"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}
          title="ACCUM optics: bloom + halation + blur-over-time on the trail buffer (0 = off)"
        >
          GLOW
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={layoutParams.accumulationOptics ?? 0}
            title="ACCUM optics: bloom + halation + blur-over-time on the trail buffer (0 = off)"
            onChange={(e) =>
              emit(Events.LAYOUT_PARAM, {
                key: 'accumulationOptics',
                value: parseFloat(e.target.value),
              })
            }
            style={{ width: 64 }}
          />
        </label>
      )}
      {layoutParams.accumulation && (
        <div className="tg" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
          <span title="Feedback transforms on the trail buffer — zoom + spin light-tunnels, RGB channel drift">FEEDBACK</span>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            title="TUNNEL: per-frame zoom + spin of the trail buffer — motion spirals into light-tunnels (0 = off)"
          >
            TUNNEL
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={layoutParams.accumulationTunnel ?? 0}
              onChange={(e) =>
                emit(Events.LAYOUT_PARAM, {
                  key: 'accumulationTunnel',
                  value: parseFloat(e.target.value),
                })
              }
              style={{ width: 64 }}
            />
          </label>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            title="PRISM: trails split into rainbow fringes that separate over time (0 = off)"
          >
            PRISM
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={layoutParams.accumulationPrism ?? 0}
              onChange={(e) =>
                emit(Events.LAYOUT_PARAM, {
                  key: 'accumulationPrism',
                  value: parseFloat(e.target.value),
                })
              }
              style={{ width: 64 }}
            />
          </label>
        </div>
      )}
      <select
        value={layoutParams.blendMode}
        onChange={e => emit(Events.LAYOUT_PARAM, { key: 'blendMode', value: e.target.value })}
        className="tg blend-mode-select"
        title="How shapes mix where they overlap."
      >
        {BLEND_MODES.map(mode => (
          <option key={mode} value={mode}>{mode.toUpperCase()}</option>
        ))}
      </select>
      <select
        value={layoutParams.shading}
        onChange={e => emit(Events.LAYOUT_PARAM, { key: 'shading', value: e.target.value })}
        className="tg blend-mode-select"
        title="Shading: flat color or a glossy highlight."
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
