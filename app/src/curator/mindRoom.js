// mindRoom.js — #1145 × Mind: the minds' view of the Director's room, from `director:room` on the bus.
//
// The personas' context carries the room's verdict and its intensity band (mindContext v3), so LOIS, Davis and the
// third think about the argument they are in. Read-only: nothing here, and nothing a mind answers, feeds back into the
// Director (it reads the honest feed only).
import { on, Events } from '../composition/eventBus.js';

let current = null; // { verdict, intensity } or null (silence, or no tick yet)

/** The room as the minds see it: { verdict, intensity } or null. */
export function getMindRoom() { return current ? { ...current } : null; }

/** Start following the Director. Returns stop(). */
export function startMindRoom() {
  const off = on(Events.DIRECTOR_ROOM, (p) => {
    current = p && p.verdict ? { verdict: p.verdict, intensity: p.intensity } : null;
  });
  return () => { off(); current = null; };
}
