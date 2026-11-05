// dishLifeChip.model.mjs — what the footer's DISH LIFE chip shows, as a pure function of the store (#1923).
//
// The chip sits to the right of the undo/redo pair in the master bar. Its glyph is a Game-of-Life glider; it LIGHTS
// when the quiet culture is actually running (the loop publishes `dishLifeAwake` on transitions), dims when the
// governor has slowed or held it, and sits dark when the layer is off. Pure so the states are pinned without a DOM.

export const STRENGTH_MIN = 0.05;
export const STRENGTH_MAX = 1;
const STORAGE_KEY = 'kc.dishLife.v1';

const clampStrength = (v) => (Number.isFinite(Number(v)) ? Math.min(STRENGTH_MAX, Math.max(0, Number(v))) : 0.35);

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
  const base =
    'DISH LIFE — a quiet Game of Life layer under the picture: marks near a living colony breathe and fray a little. ' +
    'The Director, the trio and the KINETIC buttons keep doing their thing.';
  const status = {
    off: 'Off. Click to turn it on.',
    arming: `On at ${percent}% — it starts with the run.`,
    on: `Running at ${percent}%. Click to turn it off.`,
    slowed: `Running at ${percent}%, slowed — the governor is spending it first. Click to turn it off.`,
    held: `Held still at ${percent}% — the governor is spending it first. Click to turn it off.`,
  }[state];
  const label = { off: 'life off', arming: 'life armed', on: 'life running', slowed: 'life slowed', held: 'life held' }[
    state
  ];
  return { state, lit, label, title: `${base} ${status}`, percent };
}

/** The stored per-viewer preference ({ on, strength }) from a Storage-like, or null. Never throws. */
export function readDishLifePref(storage) {
  try {
    const raw = storage && storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return null;
    return { on: p.on === true, strength: clampStrength(p.strength) };
  } catch {
    return null;
  }
}

/** Save the preference. Never throws (private windows, blocked storage). */
export function writeDishLifePref(storage, { on, strength }) {
  try {
    if (storage) storage.setItem(STORAGE_KEY, JSON.stringify({ on: on === true, strength: clampStrength(strength) }));
    return true;
  } catch {
    return false;
  }
}
