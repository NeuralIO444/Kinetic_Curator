// mindRules.js — #1462 Mind 1: the rules backend, the fallback forever. Pure: a function of (context, { seed, bar }).
//
// Deliberately NEUTRAL where inventing a behaviour would change the picture on its own: Davis proposes nothing and
// LOIS critiques nothing until Matt designs what they may do. The third names the mood the room already asks of her
// set (the same table curator/setLive.js uses), which is a reading, not an action.
// #1462 spec update: LOIS and Davis report the face the honest feed already shows (a canonical state, never invented),
// so a rules decision is always a reading and never asks the stage for a change (mindContract.wantsStage).
import { neutralReply, CANONICAL_STATES } from './mindContract.js';
import { davisRoute, TIER_OPS } from './mindConduct.js';

/** The face the room already shows, as a canonical state, or nothing. */
const reading = (persona, ctx) => {
  const code = ctx && ctx.room ? ctx.room[persona] : null;
  return CANONICAL_STATES[persona].includes(code) ? { state: code } : {};
};

/** The mood a Davis state asks for (mirrors setLive.js's VIBES_FOR first choice). */
const MOOD_FOR_DAVIS = Object.freeze({ FLOW: 'drive', SEEDLING: 'calm', STUCK: 'shift', UGLY: 'sparse', BLOOM: 'lift' });

export const RULES = Object.freeze({
  // #1483 — with audio live Davis conducts: one route to add, from the preset the energy and tempo ask for. Without a
  // show block he is exactly as neutral as he was. The seed is the decision's, so the same dish conducts the same way.
  davis: (ctx, meta = {}) => {
    // a tier that may make no edits (tier 1, or none yet) does not propose them: the books stay honest
    const allowed = (ctx && TIER_OPS[ctx.tier]) || [];
    let route = ctx && ctx.show && allowed.length ? davisRoute(ctx.show, meta.seed) : null;
    if (route && !allowed.includes(route.op)) route = null; // tier 2 may nudge a depth, not add: it does not ask
    return { ...neutralReply('davis'), ...(route ? { route } : {}), ...reading('davis', ctx) };
  },
  // #1483 — a show that has stayed pinned and flat for a phrase is a failed show: she burns it.
  lois: (ctx) => {
    const flat = !!(ctx && ctx.show && !ctx.show.silent && ctx.show.flatBars >= 1); // the window is already a phrase of it
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
