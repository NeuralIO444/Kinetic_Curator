import { useStore } from '../state/store.js';

// ConstructsChip — the footer's CONSTRUCTS switch (#2108, constructs slice 5c): off by default. On, every KIN look
// pass and every CHAOS roll swaps its pool's leading slots for the house constructs of the style in play
// (engine/constructLead.js). The choice rides the project (state.constructLead), so a take of the same project
// replays the same pool; off, every roll is exactly as it was.
export function ConstructsChip() {
  const on = useStore((s) => s.constructLead === true);
  const setConstructLead = useStore((s) => s.setConstructLead);
  return (
    <div className="undo-group constructs" role="group" aria-label="Constructs">
      <button
        type="button"
        className={`undo-btn constructs-chip ${on ? '' : 'disabled'}`}
        data-constructs={on ? 'on' : 'off'}
        onClick={() => setConstructLead(!on)}
        aria-pressed={on}
        aria-label={on ? 'Constructs on: KIN pools are led by constructs' : 'Constructs off'}
        title={
          on
            ? 'CONSTRUCTS on — KIN and CHAOS pools are led by constructs built from the style in play. Click to turn off.'
            : 'CONSTRUCTS off — click to let KIN and CHAOS deal constructs built from the style in play.'
        }
      >
        CONSTRUCTS
      </button>
    </div>
  );
}
