// WetLabRungRail.jsx — the WetLab ladder's rung rail (docs/design/wetlab-ladder-spec.md §4, §12.7; #2281).
//
// SHAPE · CONSTRUCT · CREATURE · RIG across the top, Spore-style stages. Each rung shows three pips (the keeps that
// open the next rung). A locked rung is a disabled button that says what opens it. Tapping an open rung selects it;
// the WetLab shows only that rung's strip. No animation (DS rule 7), no toast, no score: pips are counts.
import { RUNGS, OPEN_AT, isOpen, pips, lockLabel } from './wetLabLadder.mjs';

export function WetLabRungRail({ ladder, selected, onSelect }) {
  return (
    <nav style={rail} aria-label="wet lab ladder" data-testid="rung-rail">
      {RUNGS.map((r, i) => {
        const open = isOpen(ladder, r.id);
        const sel = selected === r.id;
        const filled = pips(ladder, r.id);
        const lock = open ? null : lockLabel(r.id);
        return (
          <span key={r.id} style={cell}>
            {i > 0 && <span style={joint} aria-hidden="true" />}
            <button
              type="button"
              className="chip-btn"
              style={{ ...rung, ...(sel ? rungOn : null), ...(open ? null : rungLocked) }}
              disabled={!open}
              aria-pressed={sel}
              aria-label={open ? `${r.label}, ${filled} of ${OPEN_AT} kept` : `${r.label}, locked: ${lock}`}
              data-testid={`rung-${r.id}`}
              data-open={open ? 'true' : 'false'}
              onClick={() => open && onSelect(r.id)}
            >
              <span style={label}>{r.label}</span>
              {open ? (
                <span style={pipRow} data-testid={`rung-pips-${r.id}`} data-filled={filled} aria-hidden="true">
                  {Array.from({ length: OPEN_AT }, (_, k) => (
                    <span key={k} style={{ ...pip, ...(k < filled ? pipOn : null) }} />
                  ))}
                </span>
              ) : (
                <span style={lockLine} data-testid={`rung-lock-${r.id}`}>
                  {lock}
                </span>
              )}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

const rail = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 0,
  padding: '8px 10px',
  borderTop: '1px solid var(--line)',
  flex: '0 0 auto',
};
const cell = { display: 'flex', alignItems: 'center' };
const joint = { width: 14, height: 1, background: 'var(--line)', display: 'block' };
const rung = {
  minHeight: 44,
  minWidth: 92,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '4px 10px',
  fontFamily: 'inherit',
};
const rungOn = { borderColor: 'var(--accent)', color: 'var(--accent)' };
const rungLocked = { opacity: 1, color: 'var(--dim)', borderStyle: 'dashed', cursor: 'default' };
const label = { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em' };
const pipRow = { display: 'flex', gap: 3 };
const pip = { width: 6, height: 6, border: '1px solid currentColor', display: 'block', boxSizing: 'border-box' };
const pipOn = { background: 'currentColor' };
const lockLine = { fontSize: 8, letterSpacing: '0.1em', color: 'var(--dim)' };
