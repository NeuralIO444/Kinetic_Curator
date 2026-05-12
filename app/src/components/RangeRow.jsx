// RangeRow — slider with lock, dice, and click-to-type readout
// Bundle 3: parameter exploration controls
import { useState, useRef, useEffect } from 'react';

export function RangeRow({ label, value, min = 0, max = 100, step = 1, onChange, readout,
  defaultValue, locked, onToggleLock, onRandomize }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  const handleDoubleClick = () => {
    if (defaultValue !== undefined) onChange(defaultValue);
  };

  const startEdit = () => {
    setEditValue(String(value));
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.select();
  }, [editing]);

  const commitEdit = () => {
    const n = Number(editValue);
    if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
    setEditing(false);
  };

  return (
    <div className={`range-row ${locked ? 'range-locked' : ''}`}>
      <div className="range-label-group">
        {onToggleLock && (
          <button className={`lock-btn ${locked ? 'locked' : ''}`} onClick={onToggleLock} title={locked ? 'Unlock' : 'Lock'}>
            {locked ? '🔒' : '🔓'}
          </button>
        )}
        <span className="range-label" onDoubleClick={handleDoubleClick}
          title={defaultValue !== undefined ? `Double-click to reset (${defaultValue})` : undefined}>
          {label}
        </span>
      </div>
      <input
        type="range"
        className="single-slider"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        onDoubleClick={handleDoubleClick}
        disabled={locked}
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
        {onRandomize && (
          <button className="dice-btn" onClick={onRandomize} title="Randomize" disabled={locked}>🎲</button>
        )}
      </div>
    </div>
  );
}

export function DualRangeRow({ label, low, high, min = 0, max = 100, step = 1,
  onChangeLow, onChangeHigh, readout, defaultLow, defaultHigh,
  locked, onToggleLock, onRandomize }) {
  const [editing, setEditing] = useState(false);
  const [editLow, setEditLow] = useState('');
  const [editHigh, setEditHigh] = useState('');
  const lowRef = useRef(null);

  const handleDoubleClick = () => {
    if (defaultLow !== undefined) onChangeLow(defaultLow);
    if (defaultHigh !== undefined) onChangeHigh(defaultHigh);
  };

  const startEdit = () => {
    setEditLow(String(low));
    setEditHigh(String(high));
    setEditing(true);
  };

  useEffect(() => {
    if (editing && lowRef.current) lowRef.current.select();
  }, [editing]);

  const commitEdit = () => {
    const nLow = Number(editLow);
    const nHigh = Number(editHigh);
    if (!isNaN(nLow)) onChangeLow(Math.max(min, Math.min(max, nLow)));
    if (!isNaN(nHigh)) onChangeHigh(Math.max(min, Math.min(max, nHigh)));
    setEditing(false);
  };

  return (
    <div className={`range-row ${locked ? 'range-locked' : ''}`}>
      <div className="range-label-group">
        {onToggleLock && (
          <button className={`lock-btn ${locked ? 'locked' : ''}`} onClick={onToggleLock} title={locked ? 'Unlock' : 'Lock'}>
            {locked ? '🔒' : '🔓'}
          </button>
        )}
        <span className="range-label" onDoubleClick={handleDoubleClick}
          title={defaultLow !== undefined ? `Double-click to reset (${defaultLow}–${defaultHigh})` : undefined}>
          {label}
        </span>
      </div>
      <div className="dual-slider" onDoubleClick={handleDoubleClick}>
        <div className="dual-track" />
        <div className="dual-fill" style={{ left: `${((low - min) / (max - min)) * 100}%`, width: `${((high - low) / (max - min)) * 100}%` }} />
        <input type="range" min={min} max={max} step={step} value={low} onChange={e => onChangeLow(Number(e.target.value))} disabled={locked} />
        <input type="range" min={min} max={max} step={step} value={high} onChange={e => onChangeHigh(Number(e.target.value))} disabled={locked} />
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
        {onRandomize && (
          <button className="dice-btn" onClick={onRandomize} title="Randomize" disabled={locked}>🎲</button>
        )}
      </div>
    </div>
  );
}
