// ACCUM trail family — TE matrices for the discrete, mode rows for the
// continuous (#1202; detents #1607). Trails are time behavior, not appearance: the ACCUM
// toggle plus the full trail family (LEAVE / RIBBON / COMET, ECHOES, TRAIL
// FADE, tunnel / prism / flow fades, ACCUM FADE, GLOW, WETNESS, TUNNEL /
// PRISM / CURL feedback). Lives in MOTION & BEHAVIOR.
// Matt's #319 review restored ACCUM GLOW as a live knob (remapped range
// from #317).
import { emit, Events } from '../../composition/eventBus.js';
import { getTaper } from '../../components/taper.js'; // #274: shared slider curves
import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { helpText } from '../../data/helpCopy.js'; // #158: hover titles read the single map
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';
import { ModeRow } from '../build/te/ModeRow.jsx';
import { stopsFor } from '../build/te/modeStops.mjs';
import { SliderEditor } from '../build/te/editors.jsx';

// #273/#274: response curves at the panel→state boundary. Stored params stay
// in physical units; only the slider position is remapped.
const fadeTaper = getTaper('halfLife', { minFrames: 1, maxFrames: 40 });
const glowTaper = getTaper('power', { min: 0, max: 0.25, exp: 2 }); // #317 review: old full-scale blew out at ~50% slider — full travel now sweeps the usable range only
const wetTaper = getTaper('power', { min: 0, max: 1, exp: 2 }); // Matt 2026-10-30: linear travel crammed the whole response into 0–0.1 and the rest just got ugly — power-2 spreads the low end (0.1 sits at ~32% travel, wet 0.35 at ~59%, soaked 0.8 at ~89%); full range kept, stored values unchanged

const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });

// #1607 (Strata Q Phase 1) — a trail value is a mode row on the shelf: the
// detents write authored stops in PHYSICAL units (PARAM_STOPS), the exact
// readout opens the same dock editor as before, tapers and all. The
// editor's double-click reset target is the shipped default mapped into
// the editor's own (possibly tapered) units. accumScan has no
// DEFAULT_LAYOUT_PARAMS entry by design (#1804) — its default is absence,
// i.e. 0.
function TrailValue({ label, paramKey, value, min = 0, max = 1, step = 0.01, taper, title, format }) {
  const sliderVal = taper ? taper.toSlider(value) : value;
  const display = format ? format(value) : (Math.round(value * 100) / 100).toString();
  const rawDefault = paramKey === 'accumScan' ? 0 : DEFAULT_LAYOUT_PARAMS[paramKey];
  const editorDefault = rawDefault === undefined ? undefined : taper ? taper.toSlider(rawDefault) : rawDefault;
  return (
    <ModeRow
      label={label}
      display={display}
      title={title}
      value={value}
      stops={stopsFor(paramKey)}
      onSelect={(v) => set(paramKey, v)}
      onOpen={() => (
        <SliderEditor
          ariaLabel={label}
          value={sliderVal}
          min={min}
          max={max}
          step={step}
          format={format}
          defaultValue={editorDefault}
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
        <div className="davis-label lbl" style={{ marginBottom: 2 }} title={helpText('layout-accum')}>
          accum
        </div>
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
          <div className="davis-label lbl" style={{ marginBottom: 2 }}>
            trail
          </div>
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
          <TrailValue
            label="ECHOES"
            paramKey="echoes"
            value={layoutParams.echoes ?? 0}
            min={0}
            max={4}
            step={1}
            format={(v) => `${Math.round(v)}`}
            title={helpText('layout-echoes')}
          />
          {(layoutParams.echoes ?? 0) > 0 && (
            <>
              <TrailValue
                label="SCAN"
                paramKey="accumScan"
                value={layoutParams.accumScan ?? 0}
                min={0}
                max={1}
                step={0.01}
                title="SCAN: slit-scan — each column of the echo mix shows a different moment, so motion smears sideways through time (0 = plain echoes)"
              />
              {(layoutParams.accumScan ?? 0) > 0 && (
                <div>
                  <div className="davis-label lbl" style={{ marginBottom: 2 }}>
                    deep past
                  </div>
                  <TeaMatrix
                    ariaLabel="Scan direction"
                    columns={2}
                    value={layoutParams.accumScanFlip ? 'left' : 'right'}
                    onChange={(id) => set('accumScanFlip', id === 'left')}
                    options={[
                      {
                        id: 'right',
                        label: 'RIGHT',
                        title: 'The oldest echo sits at the right edge; the left edge is now',
                      },
                      {
                        id: 'left',
                        label: 'LEFT',
                        title: 'The oldest echo sits at the left edge; the right edge is now',
                      },
                    ]}
                  />
                </div>
              )}
            </>
          )}
          {trail === 'leave' && (
            <>
              <TrailValue
                label="TRAIL FADE"
                paramKey="leaveFade"
                value={layoutParams.leaveFade ?? 0}
                min={0}
                max={0.2}
                step={0.01}
                title={helpText('layout-leave-fade')}
              />
              {['tunnel', 'prism', 'flow'].map((name) => (
                <TrailValue
                  key={name}
                  label={`${name.toUpperCase()} FADE`}
                  paramKey={`${name}Fade`}
                  value={layoutParams[`${name}Fade`] ?? 0}
                  min={0}
                  max={1}
                  step={0.01}
                  title={`${name} fade. Zero keeps the effect. Higher lets it die. Accum is unchanged.`}
                />
              ))}
            </>
          )}
          <TrailValue
            label="ACCUM FADE"
            paramKey="accumulationFade"
            value={layoutParams.accumulationFade ?? 5.4}
            min={0}
            max={1}
            step={0.01}
            taper={fadeTaper}
            format={(v) => `${(Math.round(v * 10) / 10).toFixed(1)}f`}
            title="Trail persistence in frames of half-life (1 = strobe, 40 = long exposure)"
          />
          <TrailValue
            label="GLOW"
            paramKey="accumulationOptics"
            value={layoutParams.accumulationOptics ?? 0}
            min={0}
            max={1}
            step={0.01}
            taper={glowTaper}
            title="ACCUM optics: bloom + halation + blur-over-time on the trail buffer (0 = off). Effective glow = slider² — full travel is usable; audio can't peg it."
          />
          <TrailValue
            label="WETNESS"
            paramKey="accumulationWetness"
            value={layoutParams.accumulationWetness ?? 0}
            min={0}
            max={1}
            step={0.01}
            taper={wetTaper}
            title={`${helpText('layout-wetness')} Slider runs on a square curve — the low end gets most of the travel (wetness = slider²).`}
          />
          <TrailValue
            label="TUNNEL"
            paramKey="accumulationTunnel"
            value={layoutParams.accumulationTunnel ?? 0}
            min={0}
            max={1}
            step={0.01}
            title="TUNNEL: per-frame zoom + spin of the trail buffer — motion spirals into light-tunnels (0 = off)"
          />
          <TrailValue
            label="PRISM"
            paramKey="accumulationPrism"
            value={layoutParams.accumulationPrism ?? 0}
            min={0}
            max={1}
            step={0.01}
            title="PRISM: trails split into rainbow fringes that separate over time (0 = off)"
          />
          <TrailValue
            label="CURL"
            paramKey="accumulationFlow"
            value={layoutParams.accumulationFlow ?? 0}
            min={0}
            max={1}
            step={0.01}
            title="CURL: advects the trail buffer through the project-seed curl — the same weather as the swarm (0 = off)"
          />
        </div>
      )}
    </div>
  );
}
