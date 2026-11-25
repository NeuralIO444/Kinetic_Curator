// personas/devSwitches.mjs — the in-app DEV switch for the opt-in persona features (Matt, 2026-11-19/20:
// "In-app DEV toggle for band/layout after P10 — off by default, never saved in the project").
//
// Each row is the console flag it stands for, nothing more: this module holds NO state of its own. A row reads the
// feature's own `…On()` reader and writes through the feature's own setter, so the console path and the switch can
// never disagree, and the effect is exactly the console's (all three flags are read live: the band at every phrase,
// doctrine layout at every doctrine call, audible beats on every tick — no reload).
//
// NEVER SAVED: nothing here touches the store, a project, a take or storage. A reload starts every row off (the
// console flags do the same; the PERSONA TUNE tab that hosts the rows is session-only too). What a take records while
// a feature is on is that feature's own section, by its own design — unchanged here.
//
// Deliberately NOT here: the Wire (`__KC_WIRE`) — read once at launch and inert until a feed list is approved, so an
// in-app row would do nothing without a reload and a console-only feed override. The audible volume / tone levers
// stay console-only too (numbers, not switches).
//
// Labels are the features' internal keys, callsign-safe and unsigned (Matt signs copy): the PR lists them.
import { bandOn, setBandOn } from './bandLive.js';
import { doctrineLayoutOn, setDoctrineLayoutOn } from '../curator/doctrineLayoutLive.js';
import { audibleOn, setAudibleOn } from '../curator/beatSynthLive.js';

/** The rows, in order. `label` is the only text a row renders (besides on / off). */
export const DEV_SWITCHES = Object.freeze([
  Object.freeze({ id: 'band', label: 'band', read: bandOn, write: setBandOn }),
  Object.freeze({ id: 'doctrineLayout', label: 'doctrine layout', read: doctrineLayoutOn, write: setDoctrineLayoutOn }),
  Object.freeze({ id: 'audible', label: 'audible beats', read: audibleOn, write: setAudibleOn }),
]);

const byId = (id) => DEV_SWITCHES.find((s) => s.id === id) ?? null;
const listeners = new Set();

/** Is this row's feature on right now (whoever set it — the row or the console)? Unknown ids read off. */
export function devSwitchOn(id) {
  const s = byId(id);
  return s ? s.read() === true : false;
}

/** Flip one row: writes the feature's own flag (on = `true`, off = removed). Returns the state in force. */
export function setDevSwitch(id, value) {
  const s = byId(id);
  if (!s) return false;
  const now = s.write(value === true) === true;
  for (const f of [...listeners]) {
    try {
      f();
    } catch {
      /* a listener must not stop the switch */
    }
  }
  return now;
}

/** Subscribe to row flips (the panel re-renders on them); returns the unsubscribe. */
export function onDevSwitchChange(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}
