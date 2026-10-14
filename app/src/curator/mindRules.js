// mindRules.js — #1462 Mind 1: the rules backend, the fallback forever. Pure: a function of (context, { seed, bar }).
//
// Deliberately NEUTRAL where inventing a behaviour would change the picture on its own: Davis proposes nothing and
// LOIS critiques nothing until Matt designs what they may do. The third names the mood the room already asks of her
// set (the same table curator/setLive.js uses), which is a reading, not an action.
// #1462 spec update: LOIS and Davis report the face the honest feed already shows (a canonical state, never invented),
// so a rules decision is always a reading and never asks the stage for a change (mindContract.wantsStage).
import { neutralReply, CANONICAL_STATES } from './mindContract.js';

/** The face the room already shows, as a canonical state, or nothing. */
const reading = (persona, ctx) => {
  const code = ctx && ctx.room ? ctx.room[persona] : null;
  return CANONICAL_STATES[persona].includes(code) ? { state: code } : {};
};

/** The mood a Davis state asks for (mirrors setLive.js's VIBES_FOR first choice). */
const MOOD_FOR_DAVIS = Object.freeze({ FLOW: 'drive', SEEDLING: 'calm', STUCK: 'shift', UGLY: 'sparse', BLOOM: 'lift' });

export const RULES = Object.freeze({
  davis: (ctx) => ({ ...neutralReply('davis'), ...reading('davis', ctx) }),
  lois: (ctx) => ({ ...neutralReply('lois'), ...reading('lois', ctx) }),
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
