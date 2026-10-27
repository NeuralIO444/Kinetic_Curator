// SpectrumMarks (#1482 P3) — what the marks do with the spectrum. Off by default: all three amounts at 0 is today's
// frame. The four buttons pick which frequency a mark listens to; the three amounts say what it does about it.
import { emit, Events } from '../../composition/eventBus.js';
import { RangeRow } from '../../components/RangeRow.jsx';
import { SPECTRUM_MAPS } from '../../gl/spectrumMarks.mjs';

const MAP_HINT = [
  'Marks listen in the order they were drawn: first to last sweeps low to high.',
  'A mark listens by the way it is turned: its angle is its frequency.',
  'A mark listens by where it sits: left is low, right is high.',
  'Each mark has its own frequency, chosen once and kept.',
];

const AMOUNTS = [
  { key: 'spectrumScale', label: 'SCALE', hint: 'Marks grow with the level at their frequency.' },
  {
    key: 'spectrumDisplace',
    label: 'DISPLACE',
    hint: 'Marks are pushed by onsets at their frequency, each in its own direction.',
  },
  { key: 'spectrumColour', label: 'COLOUR', hint: 'Ink moves toward its accent with the peak at its frequency.' },
];

export function SpectrumMarks({ layoutParams }) {
  const map = Math.round(layoutParams.spectrumMap ?? 0);
  const on = AMOUNTS.some((a) => (layoutParams[a.key] ?? 0) > 0);
  return (
    <div className="stim-spectrum-marks" role="group" aria-label="Spectrum marks">
      <div className="stim-motion-head">
        <span>marks</span>
        <span className="stim-motion-hint">{on ? 'listening' : 'off · raise an amount'}</span>
      </div>
      <div className="stim-spectrum-maps">
        {SPECTRUM_MAPS.map((name, i) => (
          <button
            key={name}
            type="button"
            className={`chip-btn stim-feel-btn ${map === i ? 'active' : ''}`}
            aria-pressed={map === i}
            title={MAP_HINT[i]}
            onClick={() => emit(Events.LAYOUT_PARAM, { key: 'spectrumMap', value: i })}
          >
            {name}
          </button>
        ))}
      </div>
      {AMOUNTS.map((a) => {
        const v = layoutParams[a.key] ?? 0;
        return (
          <RangeRow
            key={a.key}
            layout="stack"
            tone="stim"
            label={a.label}
            value={v}
            min={0}
            max={1}
            step={0.05}
            readout={`${Math.round(v * 100)}%`}
            hint={a.hint}
            onChange={(x) => emit(Events.LAYOUT_PARAM, { key: a.key, value: x })}
          />
        );
      })}
    </div>
  );
}
