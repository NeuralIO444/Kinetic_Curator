// engine/constructLead.js — #2108 (constructs, slice 5c): "constructs lead".
//
// Matt's ruling (2026-11-17): where a style is in play, the house constructs lead the pool. This is the whole of
// it, as a pure function of a dealt pool: when the CONSTRUCTS gate is on, the pool's leading slots are swapped for
// constructs of the style in play (half the pool, rounded up); the rest of the pool is what the deal dealt.
//
// It draws nothing from the roll's rng, so the stream every later roll sees is identical with the gate on or
// off; and it is only ever called with the gate on, so off is the deal exactly as it was (byte-identical).
// The same pool and style give the same lead, always: the house constructs are picked by a hash of the dealt pool.

import { ASSETS_CONSTRUCTS } from '../data/assets/index.js';

/** FNV-1a of a string: a stable 32-bit key. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The house construct tile ids by style, in catalogue order. */
const BY_STYLE = (() => {
  const m = new Map();
  for (const t of ASSETS_CONSTRUCTS) {
    if (!m.has(t.style)) m.set(t.style, []);
    m.get(t.style).push(t.id);
  }
  return m;
})();
const STYLE_ORDER = [...BY_STYLE.keys()];

/** How many of a pool's slots constructs take: half, rounded up (a pool of 4–6 gives 2–3). */
export const constructSlots = (n) => Math.ceil(n / 2);

/** True for a house construct's tile id. */
export const isHouseConstructId = (id) => ASSETS_CONSTRUCTS.some((t) => t.id === id);

/**
 * The pool with its leading slots swapped for constructs of the style in play.
 * @param ids the dealt pool's asset ids.
 * @param style the style in play (a Look's first style), or none: the deal then names no style, so the pool's own
 *   hash picks one of the eleven.
 * @returns a new array of the same length: `constructSlots(n)` house constructs first (distinct, one style),
 *   then the dealt ids in their order (those not already a construct), cut to size.
 */
export function leadWithConstructs(ids, style = null) {
  const list = Array.isArray(ids) ? ids : [];
  if (!list.length) return list.slice();
  const key = hash32(list.join('|'));
  const chosen = style && BY_STYLE.has(style) ? style : STYLE_ORDER[key % STYLE_ORDER.length];
  const own = BY_STYLE.get(chosen) || [];
  const k = Math.min(constructSlots(list.length), own.length);
  const lead = [];
  for (let i = 0; i < own.length && lead.length < k; i++) lead.push(own[(key + i) % own.length]);
  const rest = list.filter((id) => !lead.includes(id));
  return [...lead, ...rest].slice(0, list.length);
}
