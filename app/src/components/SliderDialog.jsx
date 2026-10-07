import { useEffect, useId, useRef, useState } from 'react';
import { parseBoundsDraft } from './sliderBounds.mjs';

// The tap-name dialog (#1127). Single-tap a slider's NAME to open it. Nothing changes until APPLY; Escape or a tap
// outside closes it untouched. RESET DEFAULT puts the value and the span back and closes.
//   span     SLIDER MIN / MAX: widen the slider up to the hard limit, or narrow it. Session only.
//   spin     (ROTATE only) a SPIN | RANGE mode switch and the spin speed in rev/s.
export function SliderDialog({ title, span, hard, onApplySpan, onResetAll, spin, onClose }) {
  const id = useId();
  const [min, setMin] = useState(String(span[0]));
  const [max, setMax] = useState(String(span[1]));
  const [mode, setMode] = useState(spin ? (spin.value > 0 ? 'SPIN' : 'RANGE') : null);
  const [speed, setSpeed] = useState(String(spin ? (spin.value > 0 ? spin.value : spin.fallback) : ''));
  const [error, setError] = useState('');
  const first = useRef(null);

  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const apply = () => {
    const b = parseBoundsDraft({ min, max }, hard);
    if (!b.ok) { setError(b.error); return; }
    let rev = null;
    if (spin) {
      if (mode === 'SPIN') {
        rev = Number(speed);
        if (!Number.isFinite(rev) || rev <= 0 || rev > spin.max) { setError(`SPEED must be above 0 and at most ${spin.max} rev/s.`); return; }
      } else rev = 0;
    }
    onApplySpan(b.min, b.max, rev);
    onClose();
  };

  return (
    <div className="slider-dialog-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="slider-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <h3 id={`${id}-t`} className="ttl">{title}</h3>
        {spin && (
          <div className="slider-dialog-field">
            <span className="lbl" id={`${id}-m`}>MODE</span>
            <div className="slider-dialog-seg" role="group" aria-labelledby={`${id}-m`}>
              {['SPIN', 'RANGE'].map((m) => (
                <button key={m} type="button" className="act" aria-pressed={mode === m} onClick={() => { setMode(m); setError(''); }}>{m}</button>
              ))}
            </div>
          </div>
        )}
        {spin && mode === 'SPIN' && (
          <label className="slider-dialog-field">
            <span className="lbl">SPEED (REV/S)</span>
            <input ref={first} className="range-edit" inputMode="decimal" value={speed} onChange={(e) => setSpeed(e.target.value)} />
          </label>
        )}
        <label className="slider-dialog-field">
          <span className="lbl">SLIDER MIN</span>
          <input ref={spin && mode === 'SPIN' ? null : first} className="range-edit" inputMode="decimal" value={min} onChange={(e) => { setMin(e.target.value); setError(''); }} />
        </label>
        <label className="slider-dialog-field">
          <span className="lbl">SLIDER MAX</span>
          <input className="range-edit" inputMode="decimal" value={max} onChange={(e) => { setMax(e.target.value); setError(''); }} />
        </label>
        <p className="slider-dialog-note">The slider can stretch from {hard.min} to {hard.max}. Kept until you reload; never saved with the project.</p>
        {error && <p className="slider-dialog-error" role="alert">{error}</p>}
        <div className="slider-dialog-actions">
          <button type="button" className="act" onClick={() => { onResetAll(); onClose(); }}>RESET DEFAULT</button>
          <button type="button" className="act" onClick={onClose}>CANCEL</button>
          <button type="button" className="act slider-dialog-apply" onClick={apply}>APPLY</button>
        </div>
      </div>
    </div>
  );
}
