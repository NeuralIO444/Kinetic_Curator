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
import { SliderDialog } from './SliderDialog.jsx';
import { fitRange } from './sliderBounds.mjs';
import { sliderBounds, useSliderBounds } from '../hooks/useSliderBounds.js';

// #1127 — a single tap on a slider's NAME opens its dialog; a double-click still resets, so the tap waits a beat
// to be sure a second click is not coming.
const TAP_NAME_MS = 240;

export function RangeRow({ label, value, min = 0, max = 100, step = 1, onChange, readout,
  defaultValue, locked, onToggleLock, hint, taper, taperOpts, disabled, disabledReason,
  disabledLabel = 'Disabled', tone, layout = 'row', ariaLabel, className = '', onReset }) {
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
    if (locked || disabled) { setEditing(false); return; }
    const n = Number(editValue);
    if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
    setEditing(false);
  };

  const labelTitle = [hint, defaultValue !== undefined ? `Double-click to reset (${defaultValue})` : null]
    .filter(Boolean).join(' · ') || undefined;
  // #272: mode-gated controls stay visible but inert, with the reason in the
  // tooltip — a control that silently does nothing is a lie; a disabled one
  // with a reason is a label.
  const title = [hint, disabled && disabledReason ? `${disabledLabel} — ${disabledReason}` : null]
    .filter(Boolean).join(' · ') || undefined;

  const slider = (
    <input
      type="range"
      className={`single-slider ${className}`.trim()}
      data-tone={toneName}
      aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
      min={t ? 0 : min} max={t ? 1 : max} step={t ? 0.01 : step}
      value={t ? t.toSlider(value) : value}
      onChange={e => onChange(t ? t.toParam(Number(e.target.value)) : Number(e.target.value))}
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
    <input ref={inputRef} className="range-edit" type="text" value={editValue}
      onChange={e => setEditValue(e.target.value)}
      onBlur={commitEdit}
      onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
    />
  ) : (
    <span className="range-readout" onClick={startEdit} title="Click to type value">{readout ?? value}</span>
  );

  // label and readout above the slider
  if (layout === 'stack') {
    return (
      <div className={`range-stack ${locked ? 'range-locked' : ''} ${disabled ? 'range-disabled range-waiting' : ''}`} data-tone={toneName} title={title}>
        <div className="range-stack-head">
          <div className="range-label-group">{lockButton}{labelEl}</div>
          <div className="range-right">{readoutEl}</div>
        </div>
        {slider}
      </div>
    );
  }

  return (
    <div className={`range-row ${locked ? 'range-locked' : ''} ${disabled ? 'range-disabled' : ''}`} data-tone={toneName} title={title}>
      <div className="range-label-group">
        {lockButton}
        {labelEl}
      </div>
      {slider}
      <div className="range-right">{readoutEl}</div>
    </div>
  );
}

// `dialog` (optional) turns on the tap-name dialog (#1127): { key, hard: {min,max}, title, spin? }. `spin` makes the row a
// SPIN | RANGE row (ROTATE): { value, onChange, defaultValue, max }. Spin on shows one rev/s slider instead of the handles.
export function DualRangeRow({ label, low, high, min: minProp = 0, max: maxProp = 100, step = 1,
  onChangeLow, onChangeHigh, onChangeRange, readout, defaultLow, defaultHigh,
  locked, onToggleLock, hint, tone, dialog }) {
  const [min, max] = useSliderBounds(dialog?.key || '', [minProp, maxProp]); // the performer's span, session only
  const [dialogOpen, setDialogOpen] = useState(false);
  const tapTimer = useRef(null);
  useEffect(() => () => clearTimeout(tapTimer.current), []);
  const spinOn = !!(dialog?.spin && dialog.spin.value > 0);
  const panelTone = useContext(RangeToneContext);
  const wanted = tone ?? panelTone;
  const toneName = RANGE_TONES.includes(wanted) ? wanted : 'ink';
  const [editing, setEditing] = useState(false);
  const [editLow, setEditLow] = useState('');
  const [editHigh, setEditHigh] = useState('');
  const lowRef = useRef(null);

  const handleDoubleClick = () => {
    clearTimeout(tapTimer.current); // a double-click is a reset, not a dialog
    if (locked) return;
    if (defaultLow !== undefined) onChangeLow(defaultLow);
    if (defaultHigh !== undefined) onChangeHigh(defaultHigh);
  };
  const tapName = () => {
    if (!dialog) return;
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setDialogOpen(true), TAP_NAME_MS);
  };
  const applySpan = (mn, mx, rev) => {
    sliderBounds.set(dialog.key, mn, mx);
    const [fl, fh] = fitRange(low, high, mn, mx);
    if (fl !== low || fh !== high) (onChangeRange || ((a, b) => { onChangeLow(a); onChangeHigh(b); }))(fl, fh);
    if (rev !== null && dialog.spin) dialog.spin.onChange(rev);
  };
  const resetAll = () => {
    sliderBounds.reset(dialog.key);
    if (defaultLow !== undefined && defaultHigh !== undefined) (onChangeRange || ((a, b) => { onChangeLow(a); onChangeHigh(b); }))(defaultLow, defaultHigh);
    if (dialog.spin) dialog.spin.onChange(dialog.spin.defaultValue);
  };

  const startEdit = () => {
    if (locked) return;
    setEditLow(String(low));
    setEditHigh(String(high));
    setEditing(true);
  };

  useEffect(() => {
    if (editing && lowRef.current) lowRef.current.select();
  }, [editing]);

  const commitEdit = () => {
    if (locked) { setEditing(false); return; }
    const nLow = Number(editLow);
    const nHigh = Number(editHigh);
    if (!isNaN(nLow)) onChangeLow(Math.max(min, Math.min(max, nLow)));
    if (!isNaN(nHigh)) onChangeHigh(Math.max(min, Math.min(max, nHigh)));
    setEditing(false);
  };

  const onTrackPointer = (e) => {
    if (locked) return;
    if (e.target.tagName === 'INPUT') return;
    const box = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
    const raw = min + t * (max - min);
    const v = Math.round(raw / step) * step;
    if (Math.abs(v - low) <= Math.abs(v - high)) onChangeLow(Math.min(v, high));
    else onChangeHigh(Math.max(v, low));
  };

  // #961 — middle grab: drag the active range to slide both thumbs together,
  // spread preserved, clamped at the ends. Zero-spread ranges move the point.
  const grabDrag = useRef(null);
  const shiftRange = (fromLow, fromHigh, shift) => {
    const spread = fromHigh - fromLow;
    const clamped = Math.max(min - fromLow, Math.min(max - fromHigh, shift));
    const newLow = fromLow + clamped;
    // One atomic update: the parents' onChangeLow/onChangeHigh each rebuild
    // the pair from stale closure state, so two sequential calls race and
    // the second wins with a half-old pair. Prefer onChangeRange when given.
    if (onChangeRange) onChangeRange(newLow, newLow + spread);
    else { onChangeLow(newLow); onChangeHigh(newLow + spread); }
  };
  const onGrabPointerDown = (e) => {
    if (locked) return;
    e.stopPropagation();
    e.preventDefault();
    const box = e.currentTarget.parentElement.getBoundingClientRect();
    grabDrag.current = { startX: e.clientX, startLow: low, startHigh: high, width: box.width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onGrabPointerMove = (e) => {
    const st = grabDrag.current;
    if (!st) return;
    const dv = ((e.clientX - st.startX) / st.width) * (max - min);
    shiftRange(st.startLow, st.startHigh, Math.round(dv / step) * step);
  };
  const onGrabPointerUp = () => { grabDrag.current = null; };
  const onGrabKeyDown = (e) => {
    if (locked) return;
    let shift;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') shift = -step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') shift = step;
    else if (e.key === 'Home') shift = min - low;
    else if (e.key === 'End') shift = max - high;
    else return;
    e.preventDefault();
    shiftRange(low, high, shift);
  };

  const labelTitle = [hint, defaultLow !== undefined ? `Double-click to reset (${defaultLow}–${defaultHigh})` : null]
    .filter(Boolean).join(' · ') || undefined;

  // Grab handle geometry: covers the active range; zero-spread gets a 16px
  // hit target centered on the point.
  const loPct = ((low - min) / (max - min)) * 100;
  const hiPct = ((high - min) / (max - min)) * 100;
  const zeroSpread = hiPct <= loPct;
  const grabStyle = zeroSpread
    ? { left: `calc(${loPct}% - 8px)`, width: '16px' }
    : { left: `${loPct}%`, width: `${hiPct - loPct}%` };

  return (
    <div className={`range-row ${locked ? 'range-locked' : ''}`} data-tone={toneName} title={hint}>
      <div className="range-label-group">
        {onToggleLock && (
          <button className={`lock-btn ${locked ? 'locked' : ''}`} onClick={onToggleLock} title={locked ? 'Unlock' : 'Lock'}>
            {locked ? '▪' : '▫'}
          </button>
        )}
        <span className={`range-label${dialog ? ' range-label-tap' : ''}`} onDoubleClick={handleDoubleClick} title={dialog ? `${labelTitle ? `${labelTitle} · ` : ''}Tap the name for options` : labelTitle}
          {...(dialog ? { role: 'button', tabIndex: 0, onClick: tapName, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDialogOpen(true); } } } : {})}>
          {label}
        </span>
        {dialogOpen && (
          <SliderDialog title={dialog.title || label} span={[min, max]} hard={dialog.hard}
            spin={dialog.spin ? { value: dialog.spin.value, fallback: dialog.spin.defaultValue, max: dialog.spin.max } : null}
            onApplySpan={applySpan} onResetAll={resetAll} onClose={() => setDialogOpen(false)} />
        )}
      </div>
      {spinOn ? (
        <RangeRow layout="bare" value={dialog.spin.value} min={0} max={dialog.spin.max} step={0.01}
          onChange={dialog.spin.onChange} ariaLabel={`${label} spin, revolutions per second`} />
      ) : (
      <div className="dual-slider" onDoubleClick={handleDoubleClick} onPointerDown={onTrackPointer} title={hint}>
        <div className="dual-track" />
        <div className="dual-fill" style={{ left: `${((low - min) / (max - min)) * 100}%`, width: `${((high - low) / (max - min)) * 100}%` }} />
        <input type="range" min={min} max={max} step={step} value={low} onChange={e => onChangeLow(Number(e.target.value))} disabled={locked} />
        <input type="range" min={min} max={max} step={step} value={high} onChange={e => onChangeHigh(Number(e.target.value))} disabled={locked} />
        <div
          className="dual-grab"
          style={grabStyle}
          role="slider"
          tabIndex={locked ? -1 : 0}
          aria-label={`${label} range`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={`${low} to ${high}`}
          title="Drag to move the whole range"
          onPointerDown={onGrabPointerDown}
          onPointerMove={onGrabPointerMove}
          onPointerUp={onGrabPointerUp}
          onPointerCancel={onGrabPointerUp}
          onKeyDown={onGrabKeyDown}
        />
      </div>
      )}
      <div className="range-right">
        {editing ? (
          <span className="range-edit-dual">
            <input ref={lowRef} className="range-edit" type="text" value={editLow}
              onChange={e => setEditLow(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            />
            <span>–</span>
            <input className="range-edit" type="text" value={editHigh}
              onChange={e => setEditHigh(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            />
          </span>
        ) : spinOn ? (
          <span className="range-readout spin-readout"><span className="spin-glyph" aria-hidden="true">↻</span> {dialog.spin.value.toFixed(2)} rev/s</span>
        ) : (
          <span className="range-readout" onClick={startEdit} title="Click to type value">{readout ?? `${low}–${high}`}</span>
        )}
      </div>
    </div>
  );
}
