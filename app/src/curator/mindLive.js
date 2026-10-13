// mindLive.js — #1462 Mind 1: the live driver. Once a bar each persona thinks about the room; the result is published
// as `mind:decision` telemetry (the persona, the bar, the backend, the reply) and nothing else. No decision is applied
// to the stage in Mind 1: the rules backends are neutral, and applying a decision (a request through emitOn('bar') to
// the slice owner) arrives with the behaviours Matt designs for each persona.
import { on, emit, Events } from '../composition/eventBus.js';
import { buildContext } from './mindContext.js';
import { createThinker } from './mindThinker.js';
import { PERSONAS } from './mindContract.js';

/**
 * @param getSnapshot () => the plain object buildContext takes
 * @param getSeed     () => the document seed
 * @param backends    { davis?, lois?, queen? } optional model backends (async); absent = rules only
 * @param available   () => boolean (mind:status), default false
 * @returns stop()
 */
export function startMind({ getSnapshot, getSeed, backends = {}, available = () => false, log = () => {} }) {
  const thinkers = PERSONAS.map((persona) => createThinker({ persona, mind: backends[persona] || null, available, log }));
  const off = on(Events.CLOCK_BAR, (p) => {
    if (!p || !Number.isInteger(p.bar)) return;
    let ctx;
    try { ctx = buildContext(getSnapshot()); } catch { return; }
    const seed = ((Number(getSeed()) >>> 0) ^ Math.imul(p.bar + 1, 0x9e3779b1)) >>> 0; // the document seed, the bar
    for (const t of thinkers) {
      const d = t.onBar({ bar: p.bar, context: ctx, seed });
      if (d) emit(Events.MIND_DECISION, d, { cause: 'mind' });
    }
  });
  return () => { off(); thinkers.forEach((t) => t.reset()); };
}
