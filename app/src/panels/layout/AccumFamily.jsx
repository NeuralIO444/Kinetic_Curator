// ACCUM trail family — TE matrices for the discrete, value buttons for the
// continuous (#1202). Trails are time behavior, not appearance: the ACCUM
// toggle plus the full trail family (LEAVE / RIBBON / COMET, ECHOES, TRAIL
// FADE, tunnel / prism / flow fades, ACCUM FADE, GLOW, WETNESS, TUNNEL /
// PRISM / CURL feedback). Lives in MOTION & BEHAVIOR.
// Matt's #319 review restored ACCUM GLOW as a live knob (remapped range
// from #317).
import { emit, Events } from '../../composition/eventBus.js';
import { getTaper } from '../../components/taper.js'; // #274: shared slider curves
import { helpText } from '../../data/helpCopy.js'; // #158: hover titles read the single map
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';
import { ValueButton } from '../build/te/ValueButton.jsx';
import { SliderEditor } from '../build/te/editors.jsx';

// #273/#274: response curves at the panel→state boundary. Stored params stay
// in physical units; only the slider position is remapped.
const fadeTaper = getTaper('halfLife', { minFrames: 1, maxFrames: 40 });
const glowTaper = getTaper('power', { min: 0, max: 0.25, exp: 2 }); // #317 review: old full-scale blew out at ~50% slider — full travel now sweeps the usable range only

const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });

function TrailValue({ label, paramKey, value, min = 0, max = 1, step = 0.01, taper, title, format }) {
  const sliderVal = taper ? taper.toSlider(value) : value;
  const display = format ? format(value) : (Math.round(value * 100) / 100).toString();
  return (
    <ValueButton
      label={label}
      display={display}
      title={title}
      onOpen={() => (
        <SliderEditor
          ariaLabel={label}
          value={sliderVal}
          min={min} max={max} step={step}
          format={format}
          onChange={(v) => set(paramKey, taper ? taper.toParam(v) : v)}
        />
      )}
    />
  );
}

export function AccumFamily({ layoutParams }) {
  const accum = !!layoutParams.accumulation;
  const trail = layoutParams.trail ?? 'accum';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      <div>
        <div className="davis-label lbl" style={{ marginBottom: 2 }} title={helpText('layout-accum')}>accum</div>
        <TeaMatrix
          ariaLabel="Accumulation"
          columns={2}
          tone="red"
          value={accum ? 'on' : 'off'}
          onChange={(id) => set('accumulation', id === 'on')}
          options={[
            { id: 'on', label: 'ON', title: helpText('layout-accum') },
            { id: 'off', label: 'OFF', title: helpText('layout-accum') },
          ]}
        />
      </div>

      {accum && (
        <div>
          <div className="davis-label lbl" style={{ marginBottom: 2 }}>trail</div>
          <TeaMatrix
            ariaLabel="Trail"
            columns={3}
            value={trail}
            onChange={(id) => set('trail', trail === id ? 'accum' : id)}
            options={[
              { id: 'leave', label: 'LEAVE', title: helpText('layout-trail-leave') },
              { id: 'ribbon', label: 'RIBBON', title: helpText('layout-trail-ribbon') },
              { id: 'comet', label: 'COMET', title: helpText('layout-trail-comet') },
            ]}
          />
          <div className="te-editor-hint">tap again to clear back to plain accum</div>
        </div>
      )}

      {accum && (
        <div className="slider-stack">
          <TrailValue label="ECHOES" paramKey="echoes" value={layoutParams.echoes ?? 0}
            min={0} max={4} step={1} format={(v) => `${Math.round(v)}`}
            title={helpText('layout-echoes')} />
          {trail === 'leave' && (
            <>
              <TrailValue label="TRAIL FADE" paramKey="leaveFade" value={layoutParams.leaveFade ?? 0}
                min={0} max={0.2} step={0.01} title={helpText('layout-leave-fade')} />
              {['tunnel', 'prism', 'flow'].map((name) => (
                <TrailValue key={name} label={`${name.toUpperCase()} FADE`} paramKey={`${name}Fade`}
                  value={layoutParams[`${name}Fade`] ?? 0}
                  min={0} max={1} step={0.01}
                  title={`${name} fade. Zero keeps the effect. Higher lets it die. Accum is unchanged.`} />
              ))}
            </>
          )}
          <TrailValue label="ACCUM FADE" paramKey="accumulationFade"
            value={layoutParams.accumulationFade ?? 5.4}
            min={0} max={1} step={0.01} taper={fadeTaper}
            format={(v) => `${(Math.round(v * 10) / 10).toFixed(1)}f`}
            title="Trail persistence in frames of half-life (1 = strobe, 40 = long exposure)" />
          <TrailValue label="GLOW" paramKey="accumulationOptics"
            value={layoutParams.accumulationOptics ?? 0}
            min={0} max={1} step={0.01} taper={glowTaper}
            title="ACCUM optics: bloom + halation + blur-over-time on the trail buffer (0 = off). Effective glow = slider² — full travel is usable; audio can't peg it." />
          <TrailValue label="WETNESS" paramKey="accumulationWetness"
            value={layoutParams.accumulationWetness ?? 0}
            min={0} max={1} step={0.01}
            title={helpText('layout-wetness')} />
          <TrailValue label="TUNNEL" paramKey="accumulationTunnel"
            value={layoutParams.accumulationTunnel ?? 0}
            min={0} max={1} step={0.01}
            title="TUNNEL: per-frame zoom + spin of the trail buffer — motion spirals into light-tunnels (0 = off)" />
          <TrailValue label="PRISM" paramKey="accumulationPrism"
            value={layoutParams.accumulationPrism ?? 0}
            min={0} max={1} step={0.01}
            title="PRISM: trails split into rainbow fringes that separate over time (0 = off)" />
          <TrailValue label="CURL" paramKey="accumulationFlow"
            value={layoutParams.accumulationFlow ?? 0}
            min={0} max={1} step={0.01}
            title="CURL: advects the trail buffer through the project-seed curl — the same weather as the swarm (0 = off)" />
        </div>
      )}
    </div>
  );
}
