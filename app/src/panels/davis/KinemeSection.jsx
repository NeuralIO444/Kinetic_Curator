// KinemeSection — the KINEME row in the DIRECTOR panel (slice 6).
//
// Kineme's own taxonomy row (Matt decision 7): the global RATE plus the
// four curated v1 driver amounts. No artist names on the surface.
// Amount 0 = today's render exactly; the drivers hard-gate.
import { RangeRow } from '../../components/RangeRow.jsx';
import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { emit, Events } from '../../composition/eventBus.js';

const DRIVERS = [
  { key: 'kinemeBreath', label: 'BREATH', hint: 'Slow scale swell on each mark — every mark breathes on its own phase.' },
  { key: 'kinemeDrift', label: 'DRIFT', hint: 'Slow position wander — marks drift on decorrelated phases.' },
  { key: 'kinemePulse', label: 'PULSE', hint: 'Rhythmic scale thump, one thump per mark per period.' },
  { key: 'kinemeBrushWobble', label: 'WOBBLE', hint: 'Brush trail wobble + edge boil, stepped at the boil rate.' },
];

export function KinemeSection({ layoutParams }) {
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lp = layoutParams || {};
  return (
    <>
      <div className="davis-section-label">KINEME</div>
      <div className="param-block">
        <RangeRow label="RATE" value={lp.kinemeRate ?? DEFAULT_LAYOUT_PARAMS.kinemeRate}
          min={0} max={4} step={0.1} defaultValue={1}
          onChange={(v) => set('kinemeRate', v)}
          hint="How alive the piece is — scales every kineme driver. 0 freezes living motion, 1 is real time." />
        {DRIVERS.map(({ key, label, hint }) => (
          <RangeRow key={key} label={label} value={lp[key] ?? 0}
            min={0} max={1} step={0.01} defaultValue={0}
            onChange={(v) => set(key, v)}
            hint={hint} />
        ))}
        <RangeRow label="BOIL" value={lp.kinemeBoilFps ?? DEFAULT_LAYOUT_PARAMS.kinemeBoilFps}
          min={6} max={12} step={1} defaultValue={8}
          onChange={(v) => set('kinemeBoilFps', v)}
          hint="Boil frame rate — 8 is the classic hand-drawn rate, 6 is an obvious boil, 12 a subtle quiver." />
      </div>
    </>
  );
}
