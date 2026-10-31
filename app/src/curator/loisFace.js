// loisFace.js — LOIS, the critic: five states, one fixed face each (#948, #1126; CUT #1856).
//
// NOD    the frame on screen was kept. He holds the nod until you roll or the seed moves.
// BURN   a hot streak: several keeps inside the rolls-vs-keeps window. Chain-smoking.
// VIBE   the quiet room, watching: the base state while you are here.
// AWAY   gone five minutes, literally true. He goes silent (DS rule 4: silence is default).
// CUT    he spent his one cut on the round's deal (BOOK S3, #1856). The word existed in the Mind reply
//        contract for a long time before the face did; the round is what earns it a face. It wears his
//        red (tokens.css: --kc-red, LOIS's red) and it holds while the cut is the standing news — the
//        feed's `cut` flag, raised by loisActivity when a round's cut lands and cleared the way a keep
//        clears: by the next roll or seed change. Until the round is wired live the flag is never set,
//        so the four feed states resolve exactly as they always have.
// Every state reads a real measurement from the honest feed (curator/loisActivity.js); no timer has an opinion.
// His judgment moves; his face does not. (LEAN, the old twelve-second "fresh roll" light, is retired: it was a
// timer holding a face, and the design has no such state.)
//
// Priority: AWAY > CUT > NOD > BURN > VIBE. If you have been gone five minutes nothing is news; while you
// are here, the cut he just spent outranks the kept frame in front of you, which outranks the streak behind you.

export const LOIS_FACES = {
  NOD: { code: 'NOD', face: '( ̄—̄ )', tone: 'mustard', label: 'now you are thinking with your own brains' },
  VIBE: { code: 'VIBE', face: '( ─‿─ )', tone: 'cream', label: 'Quiet room. Watching.' },
  BURN: { code: 'BURN', face: '( ◉‿◉ )', tone: 'mustard', label: 'Hot streak. Do not stop now.' },
  AWAY: { code: 'AWAY', face: '( ── )', tone: 'ink', label: 'Out of the room. Make freely.' },
  CUT: { code: 'CUT', face: '( ─|─ )', tone: 'red', label: 'Cut. That one does not stand.' },
};

/**
 * @param {{away?: boolean, cut?: boolean, frameKept?: boolean, burning?: boolean}} feed the honest flags from loisActivity.snapshot()
 */
export function resolveLoisFace({ away = false, cut = false, frameKept = false, burning = false } = {}) {
  if (away) return LOIS_FACES.AWAY;
  if (cut) return LOIS_FACES.CUT;
  if (frameKept) return LOIS_FACES.NOD;
  if (burning) return LOIS_FACES.BURN;
  return LOIS_FACES.VIBE;
}
