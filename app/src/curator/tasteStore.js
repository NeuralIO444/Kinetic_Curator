// tasteStore — #762: the loaded taste, per machine (`kc:taste:v1`), never in
// project files. A module holder (not the zustand store) so curate.js can read
// it without an import cycle; globalSlice mirrors a summary for the UI.
import { validateTaste, clearRetrainNudge } from './tasteHead.js';
import { mergePersonasSection } from './personaHeadsBridge.mjs';
import { noteSessionOnly } from '../state/sessionOnly.mjs';

export const TASTE_KEY = 'kc:taste:v1';

function read() {
  try {
    const raw = localStorage.getItem(TASTE_KEY);
    if (!raw) return null;
    const r = validateTaste(JSON.parse(raw)); // re-validated: storage is a trust boundary too
    return r.ok ? r.taste : null;
  } catch {
    return null;
  }
}

let current = read();

export function getTaste() {
  return current;
}

/** Validate + keep a taste file. Returns { ok, error? }. */
export function importTaste(raw) {
  const r = validateTaste(raw);
  if (!r.ok) return r;
  current = r.taste;
  try {
    localStorage.setItem(TASTE_KEY, JSON.stringify(r.taste));
  } catch {
    // #1641: the session still curates with it — and now says it won't be remembered.
    noteSessionOnly();
  }
  clearRetrainNudge(); // #925 — a fresh import re-baselines the retrain nudge
  return { ok: true, taste: r.taste };
}

/**
 * #2439 — the boot bridge's landing: overlay trained persona heads onto the loaded taste, IN MEMORY ONLY.
 * The stored taste is never rewritten (the adapters store stays the trainer's file; a later import or clear
 * behaves exactly as before). With no taste loaded there is nothing to overlay onto — the heads wait for a
 * taste rather than conjuring one. Returns whether the overlay landed.
 */
export function overlayPersonasSection(overlay) {
  if (!overlay || !current) return false;
  current = { ...current, personas: mergePersonasSection(current.personas, overlay) };
  return true;
}

/**
 * #2398 (Adapters A5) — overlay the nightly store's learned relation offsets onto the loaded
 * taste, in memory only, under the boot bridge's law: the store wins per pair, pairs the store
 * does not carry keep whatever the taste already had, and the stored taste is never rewritten.
 * Returns false (changing nothing) when no taste is loaded or the overlay is empty.
 */
export function overlayRelationsSection(overlay) {
  if (!overlay || !Object.keys(overlay).length || !current) return false;
  current = { ...current, relations: { ...(current.relations || {}), ...overlay } };
  return true;
}

export function clearTaste() {
  current = null;
  try {
    localStorage.removeItem(TASTE_KEY);
  } catch {
    // #1641: was "deliberately silent" — a refused remove means the
    // cleared taste can resurrect next boot, and that is said out loud.
    noteSessionOnly();
  }
}
