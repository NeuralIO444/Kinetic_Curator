// curator/doctrines.mjs — #2010 (RAY GUN line, P5): the two DOCTRINES.
//
// A doctrine is a NAMED CALLER PROFILE inside the Director's treatment call — never a persona (D2, Matt 2026-11-06:
// no new DIRECTORS seats, no new room-matrix axis, no fifth stratum; the 2026-10-15 strata ruling stands). It is a
// chooser: given a draw, it names which treatment the ray gun arms. It invents no parameter outside the treatment
// record's own streams (the mode comes from here; the seed, wear and distort ride the record exactly as a performer's
// tap writes them), and it never gates or deals — a doctrine chooses among treatments the gun already has.
//
//   CARSON    arms HOT: the geometry modes that also carry the distortion channel (P3) — carson, shot — so a hand
//             to CARSON leans, drips, tears and scatters.
//   ASHWORTH  arms PROCESS-FIRST: Swiss Grit (P2) — the grid first, destruction by rule, the degraded bake (P1)
//             running as a machine setting. The one mode that is a system, not a gesture.
//
// Pure: no store, no bus, no clock. The store (state/slices/layoutSlice.js) draws and writes; this names.
//
// #2381 (Persona Kernel P1): this file is now a READER of the `kc-persona/1` records — each doctrine's
// name, modes and title live in its record's `doctrine` slot (app/src/personas/) and are projected here
// into exactly the frozen shape this module has always exported. GREIMAN's record exists but is NOT
// projected: she joins DOCTRINES in P5 (the HYBRID slice), so nothing below changes until then.

import { getPersona } from '../personas/registry.mjs';

const doctrineEntry = (id) => {
  const d = getPersona(id).doctrine;
  return Object.freeze({
    id,
    name: d.name,
    modes: Object.freeze([...d.modes]),
    title: d.title,
  });
};

export const DOCTRINES = Object.freeze({
  carson: doctrineEntry('carson'),
  ashworth: doctrineEntry('ashworth'),
});

export const DOCTRINE_IDS = Object.freeze(Object.keys(DOCTRINES));

export const isDoctrine = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(DOCTRINES, id);

/**
 * The mode a doctrine arms for a unit draw (0 ≤ draw < 1). With more than one mode the draw picks; when `standing`
 * (the mode already armed) is what it picked, the call moves to the next of its modes — a doctrine's call is always a
 * change when it has one to make. Unknown doctrine → null.
 */
export function doctrineMode(id, draw, standing = null) {
  if (!isDoctrine(id)) return null;
  const modes = DOCTRINES[id].modes;
  const d = Number.isFinite(draw) ? Math.min(Math.max(draw, 0), 0.9999999999) : 0;
  let i = Math.floor(d * modes.length);
  if (modes[i] === standing) i = (i + 1) % modes.length;
  return modes[i];
}

/** Which doctrine a mode belongs to (for the readout), or null (greiman is nobody's). */
export function doctrineOfMode(mode) {
  for (const id of DOCTRINE_IDS) if (DOCTRINES[id].modes.includes(mode)) return id;
  return null;
}
