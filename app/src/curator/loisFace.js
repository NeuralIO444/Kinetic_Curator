// loisFace.js — LOIS, the critic: four states, one fixed face each (#948, #1126).
//
// NOD    the frame on screen was kept. He holds the nod until you roll or the seed moves.
// BURN   a hot streak: several keeps inside the rolls-vs-keeps window. Chain-smoking.
// VIBE   the quiet room, watching: the base state while you are here.
// AWAY   gone five minutes, literally true. He goes silent (DS rule 4: silence is default).
// Every state reads a real measurement from the honest feed (curator/loisActivity.js); no timer has an opinion.
// His judgment moves; his face does not. (LEAN, the old twelve-second "fresh roll" light, is retired: it was a
// timer holding a face, and the design has no such state.)
//
// Priority: AWAY > NOD > BURN > VIBE. If you have been gone five minutes the keep is no longer news; while you
// are here, the kept frame in front of you outranks the streak behind you.

export const LOIS_FACES = {
  NOD: { code: 'NOD', face: '( ̄—̄ )', tone: 'mustard', label: 'now you are thinking with your own brains' },
  VIBE: { code: 'VIBE', face: '( ─‿─ )', tone: 'cream', label: 'Quiet room. Watching.' },
  BURN: { code: 'BURN', face: '( ◉‿◉ )', tone: 'mustard', label: 'Hot streak. Do not stop now.' },
  AWAY: { code: 'AWAY', face: '( ── )', tone: 'ink', label: 'Out of the room. Make freely.' },
};

/**
 * @param {{away?: boolean, frameKept?: boolean, burning?: boolean}} feed the three honest flags from loisActivity.snapshot()
 */
export function resolveLoisFace({ away = false, frameKept = false, burning = false } = {}) {
  if (away) return LOIS_FACES.AWAY;
  if (frameKept) return LOIS_FACES.NOD;
  if (burning) return LOIS_FACES.BURN;
  return LOIS_FACES.VIBE;
}
