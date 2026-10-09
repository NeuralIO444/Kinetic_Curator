// Amber value button — the ONE continuous-value control (#1202).
//
// Values render amber (KC-1 DS #1121 r6); discrete states never do (r5).
// Tap opens the dock editor; the readout is always the live value. A lock
// pip marks life-drift-locked params — tap it to unlock without opening.
import { useDock } from './ValueDock.jsx';

export function ValueButton({
  label,
  display,
  title,
  onOpen,
  locked,
  onToggleLock,
  disabled,
  disabledReason,
}) {
  const { open } = useDock();
  return (
    <div className={`te-value${disabled ? ' is-disabled' : ''}`}>
      <button
        type="button"
        className="te-value-btn"
        disabled={disabled}
        title={disabled ? disabledReason : (title ?? `${label} — tap to edit`)}
        onClick={() => open({ title: title ?? label, open: onOpen })}
        aria-label={disabled ? `${label}: ${disabledReason}` : `${label}, ${display}. Tap to edit.`}
      >
        <span className="te-value-label">{label}</span>
        <span className="te-value-display">{display}</span>
      </button>
      {onToggleLock && (
        <button
          type="button"
          className={`te-lock${locked ? ' locked' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
          title={locked ? `${label} locked against life-drift — tap to unlock` : `Lock ${label} against life-drift`}
          aria-pressed={!!locked}
          aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
        >
          {locked ? '▪' : '▫'}
        </button>
      )}
    </div>
  );
}
