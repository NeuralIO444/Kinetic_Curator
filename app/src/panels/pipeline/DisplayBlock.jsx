import { useStore } from '../../state/store.js';
import { emit, Events } from '../../composition/eventBus.js';
import { helpText } from '../../data/helpCopy.js';
import { AmberValue, DsMatrix } from './ds.jsx';
import { EXPOSURE_STOPS_MAX, EXPOSURE_STOPS_MIN, formatExposureStops } from '../../gl/exposureModel.mjs';

// #740/#741: global display settings — how the frame is resolved to the screen.
// Both are per-machine (their own localStorage keys), never project content.
// FXAA applies to the live canvas and to exports (what you see is what you
// export); gate weave is live-only — recordings get it, stills stay exact.
// #1830: exposure joins them — the resolve exposure in stops, on the
// exposure model's detent table; the amber value IS the stop readout (TE).
const setFxaa = (on) => emit(Events.DISPLAY_FXAA, { on });
const setWeave = (on) => emit(Events.DISPLAY_WEAVE, { on });
const setExposureStops = (stops) => emit(Events.DISPLAY_EXPOSURE, { stops });

export function DisplayBlock() {
  const fxaa = useStore((s) => s.fxaa);
  const shed = useStore((s) => s.fxaaShed);
  const weave = useStore((s) => s.weave);
  const exposureStops = useStore((s) => s.exposureStops);
  return (
    <>
      <div className="pipeline-row" title={helpText('output-fxaa')}>
        <span style={{ flex: 1, fontSize: 11 }}>
          EDGE AA · FXAA
          {fxaa && shed && <em style={{ marginLeft: 6, color: 'var(--kc-red)' }}>shed by governor</em>}
        </span>
        <DsMatrix
          label="FXAA"
          options={[
            { value: true, label: 'ON' },
            { value: false, label: 'OFF' },
          ]}
          value={fxaa}
          onChange={setFxaa}
        />
      </div>
      <div className="pipeline-row" title={helpText('output-weave')}>
        <span className="lbl" style={{ flex: 1, fontSize: 11 }}>
          film · gate weave
        </span>
        <DsMatrix
          label="gate weave"
          options={[
            { value: true, label: 'ON' },
            { value: false, label: 'OFF' },
          ]}
          value={weave}
          onChange={setWeave}
        />
      </div>
      <div className="pipeline-row" title={helpText('output-exposure')}>
        <span className="lbl" style={{ flex: 1, fontSize: 11 }}>
          exposure · stops
        </span>
        <AmberValue
          label="exposure"
          value={exposureStops}
          min={EXPOSURE_STOPS_MIN}
          max={EXPOSURE_STOPS_MAX}
          step={0.5}
          format={formatExposureStops}
          onChange={setExposureStops}
        />
      </div>
    </>
  );
}
