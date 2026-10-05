// RangeRow — slider with lock, click-to-type readout, optional hint tooltip
// #310: per-parameter dice buttons are cut — the CURATOR bar (CURATE) +
// locks + the sub-seed mutate cover the need. The onRandomize prop is gone.
import { useState, useRef, useEffect } from 'react';
import { getTaper } from './taper.js';

export function RangeRow({ label, value, min = 0, max = 100, step = 1, onChange, readout,
  defaultValue, locked, onToggleLock, hint, taper, taperOpts, disabled, disabledReason }) {
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
    if (defaultValue !== undefined) onChange(defaultValue);
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
  const title = [hint, disabled && disabledReason ? `Disabled — ${disabledReason}` : null]
    .filter(Boolean).join(' · ') || undefined;

  return (
    <div className={`range-row ${locked ? 'range-locked' : ''} ${disabled ? 'range-disabled' : ''}`} title={title}>
      <div className="range-label-group">
        {onToggleLock && (
          <button className={`lock-btn ${locked ? 'locked' : ''}`} onClick={onToggleLock} title={locked ? 'Unlock' : 'Lock'}>
            {locked ? '🔒' : '🔓'}
          </button>
        )}
        <span className="range-label" onDoubleClick={handleDoubleClick} title={labelTitle}>
          {label}
        </span>
      </div>
      <input
        type="range"
        className="single-slider"
        min={t ? 0 : min} max={t ? 1 : max} step={t ? 0.01 : step}
        value={t ? t.toSlider(value) : value}
        onChange={e => onChange(t ? t.toParam(Number(e.target.value)) : Number(e.target.value))}
        onDoubleClick={handleDoubleClick}
        disabled={locked || disabled}
        title={title}
      />
      <div className="range-right">
        {editing ? (
          <input ref={inputRef} className="range-edit" type="text" value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
          />
        ) : (
          <span className="range-readout" onClick={startEdit} title="Click to type value">{readout ?? value}</span>
        )}
      </div>
    </div>
  );
}

export function DualRangeRow({ label, low, high, min = 0, max = 100, step = 1,
  onChangeLow, onChangeHigh, onChangeRange, readout, defaultLow, defaultHigh,
  locked, onToggleLock, hint }) {
  const [editing, setEditing] = useState(false);
  const [editLow, setEditLow] = useState('');
  const [editHigh, setEditHigh] = useState('');
  const lowRef = useRef(null);

  const handleDoubleClick = () => {
    if (locked) return;
    if (defaultLow !== undefined) onChangeLow(defaultLow);
    if (defaultHigh !== undefined) onChangeHigh(defaultHigh);
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
    <div className={`range-row ${locked ? 'range-locked' : ''}`} title={hint}>
      <div className="range-label-group">
        {onToggleLock && (
          <button className={`lock-btn ${locked ? 'locked' : ''}`} onClick={onToggleLock} title={locked ? 'Unlock' : 'Lock'}>
            {locked ? '🔒' : '🔓'}
          </button>
        )}
        <span className="range-label" onDoubleClick={handleDoubleClick} title={labelTitle}>
          {label}
        </span>
      </div>
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
        ) : (
          <span className="range-readout" onClick={startEdit} title="Click to type value">{readout ?? `${low}–${high}`}</span>
        )}
      </div>
    </div>
  );
}
