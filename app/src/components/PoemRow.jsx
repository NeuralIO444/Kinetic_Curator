// FIELD poem group (#1918) — rides the mode strip, to the right of motion (Matt 2026-11-02; was its own row):
//   poem  [WHITTIER — THE SNOW LIES…] [HELD] [ray gun · carson] [keep] [▫ hold] [whisper]
//
// Matt's rulings (2026-11-01). The identity chip names the standing poem and TAP re-deals the poem
// only — look, voice and everything else stand (the dislike path); inert while held. FORM is a pure
// readout. RAY GUN (#2003) arms the standing form's type treatment — tap cycles plain → CARSON →
// GREIMAN → SHOT → plain, the readout names the armed treatment; it is a record on the form, the
// placement itself never moves, and the identity chip above always shows the clean transcription.
// KEEP banks this exact materialized poem into the take. HOLD locks the poem's VALUE against
// KINETIC and CURATOR re-deals (lockedParams.fieldForm). WHISPER (#1906, FIELD S5) flips the standing
// form's presentation register — the same placed field drawn quiet; it is a register on the form,
// not a second system, and the Director never sets it. Discrete state → TE (KC-1 DS rule 2): hard
// states, the lock glyphs, one red (HOLD engaged) at most. Silence is default (rule 4): no poem
// standing, no group. All writes go through the store; the group only reads. RAY GUN's tap goes through the treatments surface (#2010),
// which writes through the store and lets the bus announce the act.
import { useStore } from '../state/store.js';
import { poemIdentity, isPoemKept } from '../poets/poemRow.mjs';
import { treatments } from '../curator/treatmentsLive.mjs'; // #2010: the gun fires through the treatments surface

export function PoemRow() {
  const fieldForm = useStore((s) => s.layoutParams.fieldForm);
  const held = useStore((s) => !!s.lockedParams?.fieldForm);
  const poemKeeps = useStore((s) => s.layoutParams.poemKeeps);
  const redealPoem = useStore((s) => s.redealPoem);
  const togglePoemHold = useStore((s) => s.togglePoemHold);
  const togglePoemWhisper = useStore((s) => s.togglePoemWhisper);
  const keepPoem = useStore((s) => s.keepPoem);

  const id = poemIdentity(fieldForm);
  if (!id) return null;
  const kept = isPoemKept(poemKeeps, fieldForm);
  const whisper = fieldForm.register === 'whisper';
  const raygun = fieldForm.raygun;
  const words = `${id.firstWords}${id.truncated ? '…' : ''}`;
  // #2010 — the tap is the performer's treatment act: it lands through the core API's treatments surface (the same
  // store write as before), so the bus can announce who armed what.
  const cycleRaygun = () => treatments.cycle('poem', { by: 'performer' });

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
          className={`chip-btn poem-act${raygun ? ' active' : ''}`}
          onClick={cycleRaygun}
          aria-pressed={!!raygun}
          title={
            raygun
              ? `Ray gun · ${raygun.mode} — this poem wears the ${raygun.mode} treatment. Tap to cycle: carson, greiman, grit, shot, plain`
              : 'Ray gun — give this poem the treatment: carson, greiman, grit, then shot. Tap to cycle'
          }
        >
          {raygun ? `ray gun · ${raygun.mode}` : 'ray gun'}
        </button>
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
        <button
          type="button"
          className={`chip-btn poem-act${whisper ? ' active' : ''}`}
          onClick={togglePoemWhisper}
          aria-pressed={whisper}
          title={
            whisper
              ? 'Whispering — this poem stands at the quiet register. Tap for its full voice'
              : 'Whisper — this same poem, drawn quiet; the words and their places stand'
          }
        >
          whisper
        </button>
      </div>
    </div>
  );
}
