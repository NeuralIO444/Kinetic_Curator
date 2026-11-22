// voiceChooser — Persona Adapters A7 (#2400): the per-persona chooser over Matt-signed lines.
//
// Matt's rulings (2026-11-21, on #2400):
//   1. The chooser is a learned head under the same laws as the decision heads — trained
//      nightly on labeled line-moments, earn-in ≥200 + ≥0.3 held-out, beat-the-old. Until a
//      horn's chooser earns in, today's selection (hornLines.lineFor) runs untouched.
//   2. Repetition is a soft decay: after a line is used, its rank dips and recovers over
//      time (the named constants below); the head still decides.
//   3. Empty set = silence: when no signed line fits the moment, the persona says nothing
//      that turn. Never a fallback — the old selection cannot promise a signed pick either,
//      so silence is the only honest answer, under both paths.
//
// The chooser only ever ranks hornLines.signedCandidates — lines that exist in the signed
// copy matrix (hornLines.selfcheck pins HORN_LINES character-for-character against the
// matrix page). It generates nothing, and an unsigned line is never a candidate.
import { HORN_LINES, signedCandidates, turnMoments, callsignOf } from './hornLines.mjs';
import { voiceFeatures } from './voiceFeatures.mjs';
import { scoreTreeHeadWith } from './tasteHead.js';

/** Ruling 2's dip: a just-used line's score drops by this much, recovering linearly. */
export const VOICE_DECAY_DIP = 0.25;
/** Ruling 2's recovery: the dip is fully gone after this many chooser calls. */
export const VOICE_DECAY_TURNS = 12;

/**
 * A chooser over a set of earned-in voice heads ({ <horn>: { version, head } } — the shape
 * tasteHead.voiceHeads returns; null/empty = no head has earned in). Stateful by design:
 * the decay clock lives here, one tick per choose() call, so a line's dip is measured in
 * the band's own speaking turns. The caller keeps ONE chooser per head-version set (see
 * roomFeed) — a new head version starts a fresh chooser and a fresh clock.
 */
export function createVoiceChooser(heads, lines = HORN_LINES) {
  const earned = heads && typeof heads === 'object' ? heads : {};
  const lastUsedAt = new Map(); // line id -> chooser-call index of its last use
  let calls = 0;

  const decayFor = (id) => {
    const at = lastUsedAt.get(id);
    if (at === undefined) return 0;
    const age = calls - at;
    return VOICE_DECAY_DIP * Math.max(0, 1 - age / VOICE_DECAY_TURNS);
  };

  /**
   * One moment ({ persona, ctx, to }) → the chosen HornLine, or null (silence, ruling 3).
   * With no earned-in head for the horn this is exactly lineFor's pick — signedCandidates
   * is in lineFor's order, so candidates[0] is today's selection, untouched (ruling 1).
   */
  function choose(moment) {
    if (!moment) return null;
    calls += 1;
    const candidates = signedCandidates(moment.persona, moment.ctx, moment.to, lines);
    if (!candidates.length) return null;
    const slot = earned[moment.persona];
    let pick = candidates[0];
    if (slot && slot.head) {
      let best = -Infinity;
      for (const c of candidates) {
        const p = scoreTreeHeadWith(slot.head, voiceFeatures({ line: c.id, ctx: moment.ctx, to: moment.to }));
        const score = (Number.isFinite(p) ? p : 0) - decayFor(c.id);
        if (score > best) {
          best = score;
          pick = c;
        }
      }
    }
    lastUsedAt.set(pick.id, calls);
    return pick;
  }

  /**
   * One band turn → its spoken lines [{ persona, id, text }], in moment order — the
   * head-steered twin of hornLines.linesForTurn, with the same fill law (the addressee's
   * callsign; COVER for a cut). Moments whose caller has no callsign stay silent, exactly
   * as linesForTurn keeps them.
   */
  function linesForTurn(turn) {
    const out = [];
    const to = callsignOf(turn && turn.by);
    for (const m of turnMoments(turn)) {
      if (m.ctx !== 'cut' && !to) continue;
      const l = choose(m);
      if (l) out.push({ persona: m.persona, id: l.id, text: l.text.replace('{to}', m.ctx === 'cut' ? 'COVER' : to) });
    }
    return out;
  }

  return { choose, linesForTurn };
}
