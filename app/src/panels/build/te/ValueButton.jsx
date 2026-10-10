// Amber value button — the ONE continuous-value control (#1202).
//
// Values render amber (KC-1 DS #1121 r6); discrete states never do (r5).
// Tap opens the dock editor; the readout is always the live value. A lock
// pip marks life-drift-locked params — tap it to unlock without opening.
import { useRef } from 'react';
import { useDock } from './useDock.js';

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
  // #1272 — the dock must render the CURRENT editor, not the closure
  // captured at open time. The latest onOpen rides a ref; the dock gets a
  // stable accessor it re-invokes on every render, so store changes flow
  // into the open dock (conditional controls appear, readouts track) and
  // dock drags stop snapping back to the stale value.
  // Render-phase write is intentional here (not effect): the dock reads the
  // ref during the SAME commit, so an effect would leave it one change
  // behind forever. The write always precedes the read within the commit,
  // so there is no torn state.
  const onOpenRef = useRef(onOpen);
  // eslint-disable-next-line react-hooks/refs -- see above
  onOpenRef.current = onOpen;
  return (
    <div className={`te-value${disabled ? ' is-disabled' : ''}`}>
      <button
        type="button"
        className="te-value-btn"
        disabled={disabled}
        title={disabled ? disabledReason : (title ?? `${label} — tap to edit`)}
        onClick={() => open({ title: title ?? label, open: () => onOpenRef.current() })}
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
