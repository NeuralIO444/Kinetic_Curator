// tasteStore — #762: the loaded taste, per machine (`kc:taste:v1`), never in
// project files. A module holder (not the zustand store) so curate.js can read
// it without an import cycle; globalSlice mirrors a summary for the UI.
import { validateTaste, clearRetrainNudge } from './tasteHead.js';

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
    // private window / quota: the session still curates with it, it just won't be remembered.
  }
  clearRetrainNudge(); // #925 — a fresh import re-baselines the retrain nudge
  return { ok: true, taste: r.taste };
}

export function clearTaste() {
  current = null;
  try {
    localStorage.removeItem(TASTE_KEY);
  } catch {
    // deliberately silent
  }
}
