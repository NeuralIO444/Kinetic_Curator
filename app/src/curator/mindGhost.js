// mindGhost.js — #1464 Mind 3: the ghost in the drum machine. The third's presence, as the Stimuli meter draws it.
//
// Ephemeral, never data (the swayView.mjs pattern): she is not in the store, not in a saved document, and no surface
// names her. Her decisions carry their presence in `traits.gh` ({ k: warm | drift | lean, s: 0..1, b: band }), both
// live and when a take replays, so the meter shows exactly what the take recorded. Tier 1 is near-silent (deniable);
// higher tiers make the presences come more often and read more clearly.
import { on, Events } from '../composition/eventBus.js';
import { PERSONAS } from './mindContract.js';

const THIRD = PERSONAS[2];
const NONE = Object.freeze({ kind: null, strength: 0, band: 0 });
let current = NONE;
const listeners = new Set();

/** What the meter should lean toward right now: { kind, strength 0..1, band }. Strength 0 = nothing there. */
export function getGhost() {
  return current;
}
export function subscribeGhost(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(next) {
  if (next.kind === current.kind && next.strength === current.strength && next.band === current.band) return;
  current = next;
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a listener must not break the bus */
    }
  }
}

/** Start following her decisions. Returns stop(). */
export function startGhost() {
  const off = on(Events.MIND_DECISION, (d) => {
    if (!d || d.persona !== THIRD) return;
    const g = d.traits && d.traits.gh;
    set(g ? Object.freeze({ kind: g.k, strength: g.s, band: g.b }) : NONE);
  });
  return () => {
    off();
    resetGhost();
  };
}

/** A take starts or ends: nothing lingers. */
export function resetGhost() {
  set(NONE);
}
