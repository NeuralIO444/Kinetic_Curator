// Mode row — the BUILD form of a continuous param (#1607, Strata Q
// Phase 1; DS §2 detent amendment, #1606). Phase 2 (#1608) adds the block
// variant for the strata block editors on this same component — one mode
// row, two seats, never a second component.
//
// A param renders as its name + exact live readout beside an
// OFF · LOW · MID · HIGH TeaMatrix. The modes are hand input only: a tap
// writes the authored stop (PARAM_STOPS in data/layout-modes.js on the
// shelves; panels/build/blockStops.mjs in the blocks); the stored value
// itself stays continuous, so a dice/curator/governor value between stops
// lights its nearest mode and the lit cell wears a dot — the off-detent
// mark (DS §2.1) — while the readout keeps telling the exact truth.
//
// Gesture per D2: tap the readout opens the exact editor in the value
// dock (the #1202 dock, the value editor's docked seat — not a third
// popover); double-click reset lives inside that editor, not on the row.
// A lock pip marks life-drift-locked params, exactly as on ValueButton.
//
// Bipolar rows (Phase 0 paper, stop-table law rule 6 — gain, tempTint,
// hueRotate, grade hue): the stops are unsigned magnitudes and a sign
// cell (− / +, a TeaMatrix pair) sits at the row's left. Tapping a
// magnitude applies it under the row's current sign; tapping the sign
// cell flips the sign at the current magnitude. OFF is true 0 — no sign.
// At exactly 0 the cell shows the ARMED sign (the sign the next magnitude
// tap will take); a stored nonzero value's own sign always wins.
import { useRef, useState } from 'react';
import { useDock } from './useDock.js';
import { TeaMatrix } from './TeaMatrix.jsx';
import { MODE_IDS, MODE_OPTIONS, modeStateFor, bipolarStateFor, bipolarValueFor } from './modeStops.mjs';

const SIGN_OPTIONS = Object.freeze([
  { id: 'neg', label: '−' },
  { id: 'pos', label: '+' },
]);

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
  disabledLabel,
  variant = 'shelf',
  bipolar = false,
  labelHidden = false,
  readoutClassName = '',
  ariaLabel,
}) {
  const { open } = useDock();
  // #1272 — same contract as ValueButton: the dock renders the CURRENT
  // editor through a ref, never the closure captured at open time.
  // Render-phase write is intentional (see ValueButton): the write
  // precedes the dock's read within the same commit.
  const onOpenRef = useRef(onOpen);
  // eslint-disable-next-line react-hooks/refs -- see above
  onOpenRef.current = onOpen;
  // Bipolar: the sign the next magnitude tap takes while the value is 0.
  const [armedSign, setArmedSign] = useState(1);
  const state = bipolar ? bipolarStateFor(stops, value) : modeStateFor(stops, value);
  const effSign = bipolar && state ? (state.sign !== 0 ? state.sign : armedSign) : 1;
  const options = MODE_OPTIONS.map((opt, i) => ({
    ...opt,
    dot: !!state && !state.exact && state.index === i,
  }));
  const offDetent = !!state && !state.exact;
  const openEditor = () => open({ title: title ?? label, open: () => onOpenRef.current() });
  const pickMode = (id) => {
    if (disabled) return;
    const idx = MODE_IDS.indexOf(id);
    if (idx < 0 || !stops) return;
    onSelect(bipolar ? bipolarValueFor(stops, effSign, idx) : stops[idx]);
  };
  const pickSign = (id) => {
    if (disabled) return;
    const s = id === 'neg' ? -1 : 1;
    setArmedSign(s);
    // Flip at the current magnitude: a nonzero value negates; at 0 there
    // is nothing to negate — the tap only arms the sign (rule 6).
    if (Number.isFinite(value) && value !== 0 && (value < 0 ? -1 : 1) !== s) onSelect(-value);
  };

  if (variant === 'block') {
    // The block-editor seat: label · sign · modes · exact readout on one
    // line (the .fx-param / .strata-composite flex rows the sliders sat
    // in). No lock pips in the blocks — locks are a shelf mechanism.
    const readoutTitle = disabled
      ? disabledLabel && disabledReason
        ? `${disabledLabel} — ${disabledReason}`
        : (disabledReason ?? title)
      : (title ?? `${label} — tap for the exact editor`);
    return (
      <div className={`te-mode te-mode-block${disabled ? ' is-disabled' : ''}`} title={disabled ? undefined : title}>
        {!labelHidden && (
          <span className="te-block-label" title={title}>
            {label}
          </span>
        )}
        {bipolar && (
          <span className="te-sign">
            <TeaMatrix
              ariaLabel={`${label} sign`}
              columns={2}
              options={SIGN_OPTIONS}
              value={effSign < 0 ? 'neg' : 'pos'}
              onChange={pickSign}
            />
          </span>
        )}
        <TeaMatrix
          ariaLabel={`${label} mode`}
          columns={4}
          options={options}
          value={state ? state.id : undefined}
          onChange={pickMode}
        />
        <button
          type="button"
          className={`te-block-readout${readoutClassName ? ` ${readoutClassName}` : ''}`}
          disabled={disabled}
          title={readoutTitle}
          onClick={openEditor}
          aria-label={
            ariaLabel ??
            (disabled ? `${label}: ${disabledReason ?? 'disabled'}` : `${label}, ${display}. Tap for the exact editor.`)
          }
        >
          {display}
        </button>
      </div>
    );
  }

  return (
    <div className={`te-mode${disabled ? ' is-disabled' : ''}`}>
      <div className="te-mode-head">
        <button
          type="button"
          className="te-mode-readout"
          disabled={disabled}
          title={disabled ? disabledReason : (title ?? `${label} — tap for the exact editor`)}
          onClick={openEditor}
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
        onChange={pickMode}
      />
    </div>
  );
}
