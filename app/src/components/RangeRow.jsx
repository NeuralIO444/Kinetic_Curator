// RangeRow — THE slider (#1027). One control, one feel, in every panel: a square
// 14x18 thumb on a 3px track, a 44px hit area, click-to-type readout, double-click
// reset, optional lock and hint tooltip. Only the thumb COLOR changes, per panel:
//   tone 'ink'   (default) — everything that is not BUILD or STIMULI
//   tone 'build'           — BUILD, the color of making
//   tone 'stim'            — STIMULI, the color of input
// layout picks the shape, never the behavior:
//   'row'   (default) label | slider | readout, on the three-column grid
//   'stack' label and readout above the slider (audio / reactivity controls)
//   'bare'  the slider alone; the parent owns the label (route rows, wet tracks, DAVIS)
// A bare `<input type="range">` anywhere else is a bug: rangeRow.selfcheck fails on it.
// #310: per-parameter dice buttons are cut — the CURATOR bar (CURATE) +
// locks + the sub-seed mutate cover the need. The onRandomize prop is gone.
import { useState, useRef, useEffect, useContext } from 'react';
import { getTaper } from './taper.js';
import { RANGE_TONES, RangeToneContext } from './rangeTones.js';

export function RangeRow({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  readout,
  defaultValue,
  locked,
  onToggleLock,
  hint,
  taper,
  taperOpts,
  disabled,
  disabledReason,
  disabledLabel = 'Disabled',
  tone,
  layout = 'row',
  ariaLabel,
  className = '',
  onReset,
}) {
  // the row's own tone wins; otherwise the panel's (BUILD yellow, STIMULI cyan), otherwise ink
  const panelTone = useContext(RangeToneContext);
  const wanted = tone ?? panelTone;
  const toneName = RANGE_TONES.includes(wanted) ? wanted : 'ink';
  // #274: an optional response curve. The slider works in 0..1 space and the
  // taper maps it to physical units at the panel→state boundary; stored
  // params stay physical, so the same stored value renders identically.
  // Click-to-type and double-click reset still speak physical units.
  const t = taper ? getTaper(taper, { min, max, ...(taperOpts || {}) }) : null;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  const handleDoubleClick = () => {
    if (locked || disabled) return;
    // A caller whose reset is its own undo step (not a coalesced drag tick) supplies onReset.
    if (onReset) onReset();
    else if (defaultValue !== undefined) onChange(defaultValue);
  };

  const startEdit = () => {
    if (locked || disabled) return;
    setEditValue(String(value));
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.select();
  }, [editing]);

  const commitEdit = () => {
    if (locked || disabled) {
      setEditing(false);
      return;
    }
    const n = Number(editValue);
    if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
    setEditing(false);
  };

  const labelTitle =
    [hint, defaultValue !== undefined ? `Double-click to reset (${defaultValue})` : null].filter(Boolean).join(' · ') ||
    undefined;
  // #272: mode-gated controls stay visible but inert, with the reason in the
  // tooltip — a control that silently does nothing is a lie; a disabled one
  // with a reason is a label.
  const title =
    [hint, disabled && disabledReason ? `${disabledLabel} — ${disabledReason}` : null].filter(Boolean).join(' · ') ||
    undefined;

  const slider = (
    <input
      type="range"
      className={`single-slider ${className}`.trim()}
      data-tone={toneName}
      aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
      min={t ? 0 : min}
      max={t ? 1 : max}
      step={t ? 0.01 : step}
      value={t ? t.toSlider(value) : value}
      onChange={(e) => onChange(t ? t.toParam(Number(e.target.value)) : Number(e.target.value))}
      onDoubleClick={handleDoubleClick}
      disabled={locked || disabled}
      title={title}
    />
  );

  // The slider alone: the parent owns the label, and there is no lock or typed readout.
  if (layout === 'bare') return slider;

  const lockButton = onToggleLock && (
    <button className={`lock-btn ${locked ? 'locked' : ''}`} onClick={onToggleLock} title={locked ? 'Unlock' : 'Lock'}>
      {locked ? '▪' : '▫'}
    </button>
  );
  const labelEl = (
    <span className="range-label" onDoubleClick={handleDoubleClick} title={labelTitle}>
      {label}
    </span>
  );
  const readoutEl = editing ? (
    <input
      ref={inputRef}
      className="range-edit"
      type="text"
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={commitEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commitEdit();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  ) : (
    <span className="range-readout" onClick={startEdit} title="Click to type value">
      {readout ?? value}
    </span>
  );

  // label and readout above the slider
  if (layout === 'stack') {
    return (
      <div
        className={`range-stack ${locked ? 'range-locked' : ''} ${disabled ? 'range-disabled range-waiting' : ''}`}
        data-tone={toneName}
        title={title}
      >
        <div className="range-stack-head">
          <div className="range-label-group">
            {lockButton}
            {labelEl}
          </div>
          <div className="range-right">{readoutEl}</div>
        </div>
        {slider}
      </div>
    );
  }

  return (
    <div
      className={`range-row ${locked ? 'range-locked' : ''} ${disabled ? 'range-disabled' : ''}`}
      data-tone={toneName}
      title={title}
    >
      <div className="range-label-group">
        {lockButton}
        {labelEl}
      </div>
      {slider}
      <div className="range-right">{readoutEl}</div>
    </div>
  );
}
