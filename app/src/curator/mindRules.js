// mindRules.js — #1462 Mind 1: the rules backend, the fallback forever. Pure: a function of (context, { seed, bar }).
//
// Deliberately NEUTRAL where inventing a behaviour would change the picture on its own: Davis proposes nothing and
// LOIS critiques nothing until Matt designs what they may do. The third names the mood the room already asks of her
// set (the same table curator/setLive.js uses), which is a reading, not an action.
// #1462 spec update: LOIS and Davis report the face the honest feed already shows (a canonical state, never invented),
// so a rules decision is always a reading and never asks the stage for a change (mindContract.wantsStage).
import { neutralReply, CANONICAL_STATES } from './mindContract.js';
import { davisRoute, davisSpectrum, TIER_OPS, PHRASE_BARS } from './mindConduct.js';

/** Flat bars before LOIS burns a show: the window is a phrase, then one more phrase of rope (Matt 2026-10-27). */
export const LOIS_BURN_BARS = PHRASE_BARS + 1;

/** The face the room already shows, as a canonical state, or nothing. */
const reading = (persona, ctx) => {
  const code = ctx && ctx.room ? ctx.room[persona] : null;
  return CANONICAL_STATES[persona].includes(code) ? { state: code } : {};
};

/** The mood a Davis state asks for (mirrors setLive.js's VIBES_FOR first choice). */
const MOOD_FOR_DAVIS = Object.freeze({
  FLOW: 'drive',
  SEEDLING: 'calm',
  STUCK: 'shift',
  UGLY: 'sparse',
  BLOOM: 'lift',
});

export const RULES = Object.freeze({
  // #1483 — with audio live Davis conducts: one route to add, from the preset the energy and tempo ask for. Without a
  // show block he is exactly as neutral as he was. The seed is the decision's, so the same dish conducts the same way.
  // meta.heat (0..1) is the conducting temperature: how far toward daring picks he may reach (davisRoute). Engine-side
  // only — never in the context a model is told, never in the record (the recorded reply is what replays).
  davis: (ctx, meta = {}) => {
    // a tier that may make no edits (tier 1, or none yet) does not propose them: the books stay honest
    const allowed = (ctx && TIER_OPS[ctx.tier]) || [];
    // stage 2: when the route table has nothing for him, he may re-tune the spectrum marks instead (davisSpectrum)
    let route =
      ctx && ctx.show && allowed.length
        ? (davisRoute(ctx.show, meta.seed, meta.heat) ??
          (allowed.includes('spectrum') ? davisSpectrum(ctx.show, meta.seed) : null))
        : null;
    if (route && !allowed.includes(route.op)) route = null; // tier 2 may nudge a depth, not add: it does not ask
    return { ...neutralReply('davis'), ...(route ? { route } : {}), ...reading('davis', ctx) };
  },
  // #1483 — a show that has stayed flat is a failed show: she burns it. She is the cautious one (Matt 2026-10-27): she
  // gives it a second phrase first (LOIS_BURN_BARS) — Davis already re-rolls on the first, so he gets the rope.
  lois: (ctx) => {
    const flat = !!(ctx && ctx.show && !ctx.show.silent && ctx.show.flatBars >= LOIS_BURN_BARS);
    return { ...neutralReply('lois'), ...(flat ? { state: 'BURN' } : reading('lois', ctx)) };
  },
  queen: (ctx) => {
    if (ctx && ctx.room && ctx.room.lois === 'AWAY') return { mood: 'calm', lean: {} };
    const mood = (ctx && ctx.room && MOOD_FOR_DAVIS[ctx.room.davis]) || 'calm';
    return { mood, lean: {} };
  },
});

export function rulesReply(persona, ctx, meta = {}) {
  const f = RULES[persona];
  return f ? f(ctx, meta) : null;
}
