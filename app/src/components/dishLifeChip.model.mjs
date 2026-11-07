// dishLifeChip.model.mjs — what the footer's DISH LIFE chip shows, as a pure function of the store (#1923).
//
// The chip sits to the right of the undo/redo pair in the master bar. Its glyph is a Game-of-Life glider; it LIGHTS
// when the quiet culture is actually running (the loop publishes `dishLifeAwake` on transitions), dims when the
// governor has slowed or held it, and sits dark when the layer is off. Pure so the states are pinned without a DOM.

import { helpText } from '../data/helpCopy.js';

export const STRENGTH_MIN = 0.05;
export const STRENGTH_MAX = 1;
const STORAGE_KEY = 'kc.dishLife.v1';

const clampStrength = (v) => (Number.isFinite(Number(v)) ? Math.min(STRENGTH_MAX, Math.max(0, Number(v))) : 0.35);
// #1923 Phase 2 — the coupling dial's clamp: 0..1, and junk reads as 0 (off — the dial starts at 0).
const clampCoupling = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0);

/** @returns {{ state: 'off'|'on'|'slowed'|'held'|'arming', lit: boolean, label: string, title: string, percent: number }} */
export function dishLifeChipModel(s = {}) {
  const enabled = s.dishLife === true;
  const strength = clampStrength(s.dishLifeStrength);
  const percent = Math.round(strength * 100);
  const shed = s.dishLifeShed | 0;
  let state;
  if (!enabled) state = 'off';
  else if (!(strength > 0)) state = 'off';
  else if (s.dishLifeAwake !== true)
    state = 'arming'; // on, but the loop has not started it (paused / not yet running)
  else if (shed >= 2) state = 'held';
  else if (shed === 1) state = 'slowed';
  else state = 'on';
  const lit = state === 'on' || state === 'slowed' || state === 'held';
  const label = { off: 'life off', arming: 'life armed', on: 'life running', slowed: 'life slowed', held: 'life held' }[
    state
  ];
  return { state, lit, label, title: `${helpText(`dish-life-${state}`)} (${percent}%)`, percent };
}

/** The stored per-viewer preference ({ on, strength, coupling }) from a Storage-like, or null. Never throws.
 * A preference stored before the coupling dial existed carries no coupling key and reads as 0. */
export function readDishLifePref(storage) {
  try {
    const raw = storage && storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return null;
    return { on: p.on === true, strength: clampStrength(p.strength), coupling: clampCoupling(p.coupling) };
  } catch {
    return null;
  }
}

/** Save the preference. Never throws (private windows, blocked storage). */
export function writeDishLifePref(storage, { on, strength, coupling }) {
  try {
    if (storage)
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ on: on === true, strength: clampStrength(strength), coupling: clampCoupling(coupling) }),
      );
    return true;
  } catch {
    return false;
  }
}
