// curator/doctrineLayout.mjs — the doctrines' layout call at ARM time (Persona Kernel P6, #2386).
//
// poets/doctrineLayout.js is the draw (record -> stamps). This is the decision (call -> record): when a Director's
// doctrine call arms the ray gun, may it also name a layout axis, and in which hand?
//
//   OFF BY DEFAULT. The switch is per machine and never saved (`window.__KC_DOCTRINE_LAYOUT === true`, like the band's
//   `__KC_BAND`); off, a call names no layout axis and is exactly what it was.
//   THE ARTIST WINS. A held poem (HOLD) or a kept one never takes a layout move, and a call that is laid out by the band
//   (verdict layOut) plays no layout.
//   THE BAND, where it is on (R8). A horn's verdict on this phrase's call — agree (build) or disagree (counter) — sets
//   the move's handedness against the stage's standing layout: build keeps its hand, counter takes the opposite. The
//   verdict comes from the band (personas/band.mjs), which reads the relation table; with the shipped table unruled
//   (null) the band plays nothing, so no verdict ever arrives and the call just draws its own hand from its seed.
//   No number here: this file reads none of the unruled band tuning.
//
// Pure: no store, no bus, no clock. The live adapter (doctrineLayoutLive.js) reads the switch and the band's view.
import { layoutMove, layoutHandOf, seedHand, hasLayout, LAYOUT_MOVES } from '../poets/doctrineLayout.js';

export { layoutSignals } from '../poets/doctrineLayout.js';

/** The doctrine ids that have a layout move. */
export const LAYOUT_DOCTRINE_IDS = Object.freeze(Object.keys(LAYOUT_MOVES));

/**
 * A band answer ({ verdict, move }, curator/hornFaces.js bandRead) as a layout stance: 'build' | 'counter' | 'rest', or
 * null when there is no answer to read. A horn's disagreement is a counter-move; anything unknown reads as no stance.
 */
export function layoutStance(answer) {
  if (!answer || typeof answer !== 'object') return null;
  if (answer.move === 'build' || answer.verdict === 'agree') return 'build';
  if (answer.move === 'counter' || answer.verdict === 'disagree') return 'counter';
  if (answer.move === 'rest' || answer.verdict === 'layOut') return 'rest';
  return null;
}

/**
 * The layout axes a doctrine call names, as record keys to spread into the treatment record (`{}` = none).
 *
 * @param id    the doctrine ('carson' | 'greiman' | 'ashworth')
 * @param seed  the record's own seed (the move and the hand draw off it — no extra draw from any stream)
 * @param ctx   { on, held, kept, stance, standing }
 *   on        the switch (default false)
 *   held      the poem is HOLD-locked: the artist's word
 *   kept      the standing poem was kept: the artist's word
 *   stance    'build' | 'counter' | 'rest' | null — what the band said (layoutStance)
 *   standing  the treatment record standing before this call, whose hand a stance answers (or null)
 */
export function layoutAxes(id, seed, { on = false, held = false, kept = false, stance = null, standing = null } = {}) {
  if (on !== true || held || kept) return {};
  if (!LAYOUT_DOCTRINE_IDS.includes(id) || !Number.isInteger(seed) || seed < 0) return {};
  if (stance === 'rest') return {};
  const axes = { [layoutMove(seed)]: 1 };
  if (stance === 'build' || stance === 'counter') {
    const ref = hasLayout(standing) ? layoutHandOf(standing) : seedHand(seed);
    axes.hand = stance === 'build' ? ref : -ref;
  }
  return axes;
}
