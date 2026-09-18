// Toggle row: bleed / mirror / overlap / accum / blend
import { emit, Events } from '../../composition/eventBus.js';
import { BLEND_MODES, PALETTE_SHIFTS } from '../../data/layout-modes.js';
import { getTaper } from '../../components/taper.js'; // #274: shared slider curves

// #273/#274: response curves at the panel→state boundary. Stored params stay
// in physical units; only the slider position is remapped.
const fadeTaper = getTaper('halfLife', { minFrames: 1, maxFrames: 40 });
const glowTaper = getTaper('power', { min: 0, max: 1, exp: 2 });

// #268: RECOLOR removed — nothing in the GL renderer ever read it. A
// control that moves and changes nothing is worse than no control.
const TOGGLES = ['bleed', 'mirror', 'overlap', 'accumulation'];

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
          title="Trail persistence in frames of half-life (1 = strobe, 40 = long exposure)"
        >
          FADE
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={fadeTaper.toSlider(layoutParams.accumulationFade ?? 5.4)}
            onChange={(e) =>
              emit(Events.LAYOUT_PARAM, {
                key: 'accumulationFade',
                value: fadeTaper.toParam(parseFloat(e.target.value)),
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
          title="ACCUM optics: bloom + halation + blur-over-time on the trail buffer (0 = off). Effective glow = slider² — full travel is usable; audio can't peg it."
        >
          GLOW
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={glowTaper.toSlider(layoutParams.accumulationOptics ?? 0)}
            onChange={(e) =>
              emit(Events.LAYOUT_PARAM, {
                key: 'accumulationOptics',
                value: glowTaper.toParam(parseFloat(e.target.value)),
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
        title="Blend mode"
      >
        {BLEND_MODES.map(mode => (
          <option key={mode} value={mode}>{mode.toUpperCase()}</option>
        ))}
      </select>
      {/* #268: SHADING removed — the GL renderer renders everything flat;
          the only consumer was the retired SVG layer. */}
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
