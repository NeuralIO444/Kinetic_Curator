// Toggle row: bleed / mirror / overlap / accum
// #310: blendMode, ACCUM GLOW (accumulationOptics), and paletteShift leave
// performer sight — they stay in state and presets/voices still set them,
// but the selects/sliders are gone. (SHADING was already voice-only via
// #268.) The engine contract falls back to 'normal' for blendMode, so the
// hidden select changes nothing about the render.
import { emit, Events } from '../../composition/eventBus.js';
import { getTaper } from '../../components/taper.js'; // #274: shared slider curves

// #273/#274: response curves at the panel→state boundary. Stored params stay
// in physical units; only the slider position is remapped.
const fadeTaper = getTaper('halfLife', { minFrames: 1, maxFrames: 40 });

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
      {/* #310: the blendMode select is hidden but the state stays — sceneContract
          reads layoutParams.blendMode and falls back to 'normal'; presets and
          voices still set it. The paletteShift select left for the same reason. */}
      {/* #268: SHADING removed — the GL renderer renders everything flat;
          the only consumer was the retired SVG layer. */}
    </div>
  );
}
