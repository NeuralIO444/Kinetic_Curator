// ds.jsx — KC-1 DS primitives for the pipeline panel (#1215).
//
// Discrete choices render as a button matrix (ink/red hard states — TE).
// Editable values render as amber buttons opening a panel-edge stepper popup.
// Read-only state renders as a quiet chip (DsChip) — no control.
import { useEffect, useRef, useState } from "react";

/** Discrete choice as a button matrix. One hard state per group. */
export function DsMatrix({ options, value, onChange, label }) {
  return (
    <span className="ds-matrix" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={`ds-mbtn${o.value === value ? " sel" : ""}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** Editable numeric value: amber button, tap opens a stepper popup. */
export function AmberValue({
  label,
  value,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  onChange,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);
  const clamp = (v) => Math.max(min, Math.min(max, v));
  return (
    <span ref={wrapRef} className="ds-amber-wrap">
      <button
        type="button"
        className="ds-amber"
        disabled={disabled}
        aria-label={label}
        title={`${label} — tap to edit`}
        onClick={() => setOpen((o) => !o)}
      >
        {format(value)}
      </button>
      {open && !disabled && (
        <span className="ds-pop" role="dialog" aria-label={label}>
          <button
            type="button"
            aria-label="decrease"
            onClick={() => onChange(clamp(value - step))}
          >
            −
          </button>
          <span className="ds-pop-val">{format(value)}</span>
          <button
            type="button"
            aria-label="increase"
            onClick={() => onChange(clamp(value + step))}
          >
            +
          </button>
        </span>
      )}
    </span>
  );
}

/** Read-only state chip. Quiet text, no control — state lives elsewhere. */
export function DsChip({ children, tone }) {
  return (
    <span className={`ds-chip${tone ? ` tone-${tone}` : ""}`}>{children}</span>
  );
}
