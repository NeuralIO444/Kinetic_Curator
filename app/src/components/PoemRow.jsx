// FIELD poem group (#1918) — rides the mode strip, to the right of motion (Matt 2026-11-02; was its own row):
//   poem  [WHITTIER — THE SNOW LIES…] [HELD] [keep] [▫ hold]
//
// Matt's rulings (2026-11-01). The identity chip names the standing poem and TAP re-deals the poem
// only — look, voice and everything else stand (the dislike path); inert while held. FORM is a pure
// readout. KEEP banks this exact materialized poem into the take. HOLD locks the poem's VALUE against
// KINETIC and CURATOR re-deals (lockedParams.fieldForm). Discrete state → TE (KC-1 DS rule 2): hard
// states, the lock glyphs, one red (HOLD engaged) at most. Silence is default (rule 4): no poem
// standing, no group. All writes go through the store; the group only reads.
import { useStore } from '../state/store.js';
import { poemIdentity, isPoemKept } from '../poets/poemRow.mjs';

export function PoemRow() {
  const fieldForm = useStore((s) => s.layoutParams.fieldForm);
  const held = useStore((s) => !!s.lockedParams?.fieldForm);
  const poemKeeps = useStore((s) => s.layoutParams.poemKeeps);
  const redealPoem = useStore((s) => s.redealPoem);
  const togglePoemHold = useStore((s) => s.togglePoemHold);
  const keepPoem = useStore((s) => s.keepPoem);

  const id = poemIdentity(fieldForm);
  if (!id) return null;
  const kept = isPoemKept(poemKeeps, fieldForm);
  const words = `${id.firstWords}${id.truncated ? '…' : ''}`;

  return (
    <div className="poem-row" role="group" aria-label="Poem">
      <span className="mode-strip-label lbl">poem</span>
      <div className="mode-strip-chips">
        <button
          type="button"
          className="chip-btn poem-id"
          onClick={redealPoem}
          disabled={held}
          title={
            held
              ? `${id.surname} — ${words} · held: release HOLD to re-deal the poem`
              : `${id.surname} — ${words} · tap: a new poem, nothing else moves`
          }
          aria-label={`Poem: ${id.surname}, ${words}.${held ? ' Held.' : ' Tap to re-deal the poem only.'}`}
        >
          <span className="poem-id-poet">{id.surname}</span>
          <span className="poem-id-sep" aria-hidden="true">
            {' — '}
          </span>
          <span className="poem-id-words">{words}</span>
        </button>
        <span className="chip-btn poem-form" title={`Form: ${id.form}`} aria-label={`Form ${id.form}`}>
          {id.form}
        </span>
        <button
          type="button"
          className={`chip-btn poem-act${kept ? ' active' : ''}`}
          onClick={keepPoem}
          aria-pressed={kept}
          title={kept ? 'Kept — this exact poem is banked in the take' : 'Keep — bank this exact poem into the take'}
        >
          keep
        </button>
        <button
          type="button"
          className={`chip-btn poem-act poem-hold${held ? ' held' : ''}`}
          onClick={togglePoemHold}
          aria-pressed={held}
          title={
            held
              ? 'Held — KINETIC and CURATOR pass this poem by. Tap to release'
              : 'Hold — lock this poem against KINETIC and CURATOR re-deals'
          }
        >
          <span className="poem-lock" aria-hidden="true">
            {held ? '▪' : '▫'}
          </span>
          hold
        </button>
      </div>
    </div>
  );
}
