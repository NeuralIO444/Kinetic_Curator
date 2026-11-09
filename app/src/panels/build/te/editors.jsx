// Dock editors — one per DS #1121 rule 2 family (#1202).
// slider → linear value, dial → angular/wrapping, dual → min/max range,
// stepper → integer counts. Sliders are the house RangeRow (#1027), never
// native inputs; the BUILD tone (amber) comes from the panel's RangeTone.
import { useRef } from 'react';
import { RangeRow } from '../../../components/RangeRow.jsx';
import { steppedStopValue } from './modeStops.mjs';

function fmtVal(value, format, unit) {
  const s = format ? format(value) : String(value);
  return unit ? `${s}${unit}` : s;
}

export function SliderEditor({ value, min, max, step = 1, unit, format, onChange, ariaLabel, defaultValue }) {
  return (
    <div className="te-editor">
      <div className="te-editor-readout">{fmtVal(value, format, unit)}</div>
      {/* #1607 (D2) — double-click reset lives inside the exact editor: the
          RangeRow's reset speaks the editor's own units, so a caller whose
          editor works in taper/percent space passes its default mapped
          into that space. Absent = no reset target, as before. */}
      <RangeRow
        layout="bare"
        ariaLabel={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        defaultValue={defaultValue}
      />
      <div className="te-editor-scale">
        <span>{fmtVal(min, format, unit)}</span>
        <span>{fmtVal(max, format, unit)}</span>
      </div>
    </div>
  );
}

export function DualEditor({ low, high, min, max, step = 1, unit, format, onChange, ariaLabel }) {
  return (
    <div className="te-editor">
      <div className="te-editor-readout">
        {fmtVal(low, format, unit)} – {fmtVal(high, format, unit)}
      </div>
      <label className="te-dual-row">
        <span>MIN</span>
        <RangeRow
          layout="bare"
          ariaLabel={`${ariaLabel} minimum`}
          min={min}
          max={Math.max(min, high)}
          step={step}
          value={Math.min(low, high)}
          onChange={(v) => onChange(Math.min(v, high), high)}
        />
      </label>
      <label className="te-dual-row">
        <span>MAX</span>
        <RangeRow
          layout="bare"
          ariaLabel={`${ariaLabel} maximum`}
          min={Math.min(low, max)}
          max={max}
          step={step}
          value={Math.max(low, high)}
          onChange={(v) => onChange(Math.min(low, high), Math.max(v, low))}
        />
      </label>
      <div className="te-editor-scale">
        <span>{fmtVal(min, format, unit)}</span>
        <span>{fmtVal(max, format, unit)}</span>
      </div>
    </div>
  );
}

export function StepperEditor({ value, min, max, step = 1, stops, unit, format, onChange, ariaLabel }) {
  // #2038 QA fix — a `stops` table makes the stepper detent-only: −/+
  // move to the ADJACENT stop (steppedStopValue), never to a uniform
  // increment, so a non-uniform detent table (the rotation 0/15/45/90)
  // is offered exactly, with no in-between values a data law would
  // silently erase. Without stops, the original uniform step + clamp.
  const hasStops = Array.isArray(stops) && stops.length > 0;
  const lo = hasStops ? Math.min(...stops) : min;
  const hi = hasStops ? Math.max(...stops) : max;
  const clampStep = (dir) => {
    const next = hasStops ? steppedStopValue(stops, value, dir) : Math.min(max, Math.max(min, value + dir * step));
    if (next != null) onChange(next);
  };
  return (
    <div className="te-editor te-stepper">
      <button
        type="button"
        className="te-step-btn"
        onClick={() => clampStep(-1)}
        aria-label={`Decrease ${ariaLabel}`}
        disabled={value <= lo}
      >
        −
      </button>
      <div className="te-editor-readout">{fmtVal(value, format, unit)}</div>
      <button
        type="button"
        className="te-step-btn"
        onClick={() => clampStep(1)}
        aria-label={`Increase ${ariaLabel}`}
        disabled={value >= hi}
      >
        +
      </button>
    </div>
  );
}

// Angular dial — drag vertically to turn; wraps at the ends (#1202: dial → angular).
export function DialEditor({ value, min = 0, max = 360, unit = '°', onChange, ariaLabel }) {
  const dragRef = useRef(null);
  const span = max - min;

  const startDrag = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = value;
    dragRef.current = { startY, startVal };
    const move = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      // Full span per 240px of drag; wrap around the ends.
      let v = d.startVal + ((d.startY - ev.clientY) / 240) * span;
      v = ((((v - min) % span) + span) % span) + min;
      onChange(Math.round(v * 10) / 10);
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const frac = span > 0 ? (value - min) / span : 0;
  return (
    <div className="te-editor te-dial-wrap">
      <div
        className="te-dial"
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        tabIndex={0}
        onPointerDown={startDrag}
        onKeyDown={(e) => {
          const step = span / 72;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            onChange(((((value - min + step) % span) + span) % span) + min);
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onChange(((((value - min - step) % span) + span) % span) + min);
          }
        }}
      >
        <div className="te-dial-face">
          <div className="te-dial-needle" style={{ transform: `rotate(${frac * 360}deg)` }} />
        </div>
      </div>
      <div className="te-editor-readout">
        {Math.round(value)}
        {unit}
      </div>
      <div className="te-editor-hint">
        drag to turn · wraps at {max}
        {unit}
      </div>
    </div>
  );
}
