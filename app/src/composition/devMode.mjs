// devMode — the Dev mode preference (#2077, Matt's ruling 2026-11-10).
//
// One boolean, per machine, OFF by default, persisted in localStorage with
// the app's other small preferences (the tasteGate pattern) — the Settings
// surface's standing rule is "no second prefs store", so this is a key in
// the same store, not a new system, and it is never part of a saved project.
//
// What it gates: the merged DEV panel's registration. PanelRegistry reads
// devModeOn() to decide whether a RELEASE build shows the panel (dev builds
// always do). Listeners let the Shell re-render the tab strip the moment the
// Settings toggle flips — no reload. When storage refuses the write, the
// value still holds for the session and noteSessionOnly() says so (#1641),
// exactly like the experimental taste switch.
import { noteSessionOnly } from '../state/sessionOnly.mjs';

export const DEV_MODE_KEY = 'kc:dev-mode:v1';

function read() {
  try {
    return localStorage.getItem(DEV_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

let on = read();
const listeners = new Set();

export function devModeOn() {
  return on;
}

export function setDevMode(value) {
  on = !!value;
  try {
    if (on) localStorage.setItem(DEV_MODE_KEY, '1');
    else localStorage.removeItem(DEV_MODE_KEY);
  } catch {
    // #1641: the switch still holds for this session — and says it will revert at reload.
    noteSessionOnly();
  }
  for (const f of [...listeners]) f();
  return on;
}

/** Subscribe to Dev mode flips (the Shell's tab strip re-renders on change). */
export function onDevModeChange(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}
