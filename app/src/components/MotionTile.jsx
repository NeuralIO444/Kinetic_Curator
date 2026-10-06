import { motionPose, motionReadout } from './motionGlyph.mjs';

function Glyph({ kind, pose }) {
  if (kind === 'wind') {
    return (
      <svg className="motion-glyph" viewBox="0 0 32 32" aria-hidden="true">
        <g style={{ transform: `rotate(${pose.lean}deg)`, transformOrigin: '16px 16px' }}>
          <path d="M6 16h16M17 10l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </g>
      </svg>
    );
  }
  if (kind === 'breath') {
    return (
      <svg className="motion-glyph" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="6" fill="none" stroke="currentColor" strokeWidth="1.6"
          style={{ transform: `scale(${pose.scale})`, transformOrigin: '16px 16px' }} />
      </svg>
    );
  }
  if (kind === 'life') {
    const shift = (pose.drift ?? 0) * 12;
    return (
      <svg className="motion-glyph" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M4 20c4-8 6 4 10 0s6-8 10 0 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6"
          style={{ transform: `translateX(${shift - 6}px)` }} />
      </svg>
    );
  }
  return (
    <svg className="motion-glyph" viewBox="0 0 32 32" aria-hidden="true">
      <g style={{ transform: `rotate(${pose.flap ?? 0}deg)`, transformOrigin: '16px 18px' }}>
        <path d="M16 18 L6 10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </g>
      <g style={{ transform: `rotate(${-(pose.flap ?? 0)}deg)`, transformOrigin: '16px 18px' }}>
        <path d="M16 18 L26 10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </g>
      <circle cx="16" cy="18" r="1.4" fill="currentColor" />
    </svg>
  );
}

// Same slider contract as RangeRow, plus a glyph that tracks the value.
export function MotionTile({ kind, label, value, min = 0, max = 1, step = 0.05, onChange, hint,
  disabled, disabledReason, locked, onToggleLock, defaultValue }) {
  const pose = motionPose(kind, value, min, max);
  const title = [hint, disabled && disabledReason ? `Disabled — ${disabledReason}` : null]
    .filter(Boolean).join(' · ') || undefined;
  const reset = () => {
    if (locked || disabled || defaultValue === undefined) return;
    onChange(defaultValue);
  };
  return (
    <div className={`motion-tile${disabled ? ' motion-tile-disabled' : ''}`} title={title}>
      <Glyph kind={kind} pose={pose} />
      <span className="motion-readout">{motionReadout(value, step)}</span>
      <span className="motion-label" onDoubleClick={reset}>{label}</span>
      <input
        type="range"
        className="single-slider motion-slider"
        data-tone="ink"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={reset}
        disabled={locked || disabled}
      />
      {onToggleLock && (
        <button type="button" className={`lock-btn ${locked ? 'locked' : ''}`} onClick={onToggleLock} title={locked ? 'Unlock' : 'Lock'}>
          {locked ? '🔒' : '🔓'}
        </button>
      )}
    </div>
  );
}
