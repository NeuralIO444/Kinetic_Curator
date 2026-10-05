// ACCUM trail family — extracted from ToggleRow.jsx (UX-5 reorg).
// Trails are time behavior, not appearance: the ACCUM toggle plus the full
// trail family (LEAVE / RIBBON / COMET, ECHOES, TRAIL FADE, tunnel / prism /
// flow fades, ACCUM FADE, GLOW, FEEDBACK). Lives in MOTION & BEHAVIOR.
// Matt's #319 review restored ACCUM GLOW as a live knob (remapped range
// from #317).
import { emit, Events } from '../../composition/eventBus.js';
import { getTaper } from '../../components/taper.js'; // #274: shared slider curves
import { helpText } from '../../data/helpCopy.js'; // #158: hover titles read the single map

// #273/#274: response curves at the panel→state boundary. Stored params stay
// in physical units; only the slider position is remapped.
const fadeTaper = getTaper('halfLife', { minFrames: 1, maxFrames: 40 });
const glowTaper = getTaper('power', { min: 0, max: 0.25, exp: 2 }); // #317 review: old full-scale blew out at ~50% slider — full travel now sweeps the usable range only

export function AccumFamily({ layoutParams }) {
  return (
    <div className="toggle-row">
      <button
        className={`tg ${layoutParams.accumulation ? 'tg-on' : ''}`}
        title={helpText('layout-accum')}
        onClick={() => emit(Events.LAYOUT_PARAM, { key: 'accumulation', value: !layoutParams.accumulation })}
      >
        <span className="tg-box">{layoutParams.accumulation ? '◉' : '○'}</span>
        ACCUM
      </button>

      {layoutParams.accumulation && (
        <>
        <button type="button" className={`chip-btn${layoutParams.trail === 'leave' ? ' active' : ''}`}
          title={helpText('layout-trail-leave')}
          onClick={() => emit(Events.LAYOUT_PARAM, { key: 'trail', value: layoutParams.trail === 'leave' ? 'accum' : 'leave' })}>
          LEAVE
        </button>
        {['ribbon', 'comet'].map((name) => (
          <button key={name} type="button" className={`chip-btn${layoutParams.trail === name ? ' active' : ''}`}
            title={helpText(name === 'ribbon' ? 'layout-trail-ribbon' : 'layout-trail-comet')}
            onClick={() => emit(Events.LAYOUT_PARAM, { key: 'trail', value: layoutParams.trail === name ? 'accum' : name })}>
            {name.toUpperCase()}
          </button>
        ))}
        <label className="tg" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }} title={helpText('layout-echoes')}>
          ECHOES
          <input type="range" min={0} max={4} step={1} value={layoutParams.echoes ?? 0}
            onChange={(e) => emit(Events.LAYOUT_PARAM, { key: 'echoes', value: parseFloat(e.target.value) })}
            style={{ width: 64 }} />
        </label>
        </>
      )}
      {layoutParams.trail === 'leave' && (
        <label className="tg" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}
          title={helpText('layout-leave-fade')}>
          TRAIL FADE
          <input type="range" min={0} max={0.2} step={0.01}
            value={layoutParams.leaveFade ?? 0}
            onChange={(e) => emit(Events.LAYOUT_PARAM, { key: 'leaveFade', value: parseFloat(e.target.value) })}
            style={{ width: 64 }} />
        </label>
      )}
      {layoutParams.trail === 'leave' && ['tunnel', 'prism', 'flow'].map((name) => (
        <label key={name} className="tg" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}
          title={`${name} fade. Zero keeps the effect. Higher lets it die. Accum is unchanged.`}>
          {name.toUpperCase()} FADE
          <input type="range" min={0} max={1} step={0.01}
            value={layoutParams[`${name}Fade`] ?? 0}
            onChange={(e) => emit(Events.LAYOUT_PARAM, { key: `${name}Fade`, value: parseFloat(e.target.value) })}
            style={{ width: 64 }} />
        </label>
      ))}

      {layoutParams.accumulation && (
        <label
          className="tg"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}
          title="Trail persistence in frames of half-life (1 = strobe, 40 = long exposure)"
        >
          ACCUM FADE
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
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            title="CURL: advects the trail buffer through the project-seed curl — the same weather as the swarm (0 = off)"
          >
            CURL
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={layoutParams.accumulationFlow ?? 0}
              onChange={(e) =>
                emit(Events.LAYOUT_PARAM, {
                  key: 'accumulationFlow',
                  value: parseFloat(e.target.value),
                })
              }
              style={{ width: 64 }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
