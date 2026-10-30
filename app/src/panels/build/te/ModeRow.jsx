// Mode row — the BUILD shelf form of a continuous param (#1607, Strata Q
// Phase 1; DS §2 detent amendment, #1606).
//
// A shelf param renders as its name + exact live readout over an
// OFF · LOW · MID · HIGH TeaMatrix. The modes are hand input only: a tap
// writes the authored stop (PARAM_STOPS in data/layout-modes.js); the
// stored value itself stays continuous, so a dice/curator/governor value
// between stops lights its nearest mode and the lit cell wears a dot —
// the off-detent mark (DS §2.1) — while the readout keeps telling the
// exact truth beside it.
//
// Gesture per D2: tap the readout opens the exact editor in the value
// dock (the #1202 dock, the value editor's docked seat — not a third
// popover); double-click reset lives inside that editor, not on the row.
// A lock pip marks life-drift-locked params, exactly as on ValueButton.
import { useRef } from 'react';
import { useDock } from './useDock.js';
import { TeaMatrix } from './TeaMatrix.jsx';
import { MODE_IDS, MODE_OPTIONS, modeStateFor } from './modeStops.mjs';

export function ModeRow({
  label,
  display,
  title,
  value,
  stops,
  onSelect,
  onOpen,
  locked,
  onToggleLock,
  disabled,
  disabledReason,
}) {
  const { open } = useDock();
  // #1272 — same contract as ValueButton: the dock renders the CURRENT
  // editor through a ref, never the closure captured at open time.
  // Render-phase write is intentional (see ValueButton): the write
  // precedes the dock's read within the same commit.
  const onOpenRef = useRef(onOpen);
  // eslint-disable-next-line react-hooks/refs -- see above
  onOpenRef.current = onOpen;
  const state = modeStateFor(stops, value);
  const options = MODE_OPTIONS.map((opt, i) => ({
    ...opt,
    dot: !!state && !state.exact && state.index === i,
  }));
  const offDetent = !!state && !state.exact;
  return (
    <div className={`te-mode${disabled ? ' is-disabled' : ''}`}>
      <div className="te-mode-head">
        <button
          type="button"
          className="te-mode-readout"
          disabled={disabled}
          title={disabled ? disabledReason : (title ?? `${label} — tap for the exact editor`)}
          onClick={() => open({ title: title ?? label, open: () => onOpenRef.current() })}
          aria-label={
            disabled
              ? `${label}: ${disabledReason}`
              : `${label}, ${display}${offDetent ? ', off detent' : ''}. Tap for the exact editor.`
          }
        >
          <span className="te-value-label">{label}</span>
          <span className="te-value-display">{display}</span>
        </button>
        {onToggleLock && (
          <button
            type="button"
            className={`te-lock${locked ? ' locked' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock();
            }}
            title={locked ? `${label} locked against life-drift — tap to unlock` : `Lock ${label} against life-drift`}
            aria-pressed={!!locked}
            aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
          >
            {locked ? '▪' : '▫'}
          </button>
        )}
      </div>
      <TeaMatrix
        ariaLabel={`${label} mode`}
        columns={4}
        options={options}
        value={state ? state.id : undefined}
        onChange={(id) => {
          if (disabled) return;
          const idx = MODE_IDS.indexOf(id);
          if (idx >= 0 && stops) onSelect(stops[idx]);
        }}
      />
    </div>
  );
}
