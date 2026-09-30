// map.mjs — the MIDI mapping table: sanitizer + binding edits (#617). Pure.
//
// { bindKey: targetId } saved in the project like every other field. One
// binding per target and one target per key: learning a target again MOVES it.
// Garbage never passes: unknown targets and malformed keys are dropped.
import { isBindKey } from './message.mjs';
import { getMidiTarget } from './targets.mjs';

export const MAX_BINDINGS = 64;

/**
 * Can this kind of message drive this kind of target?
 *   notes  → triggers and holds (a pad)
 *   CC     → everything (a knob scales; a CC also fires/holds a trigger, for
 *            controllers whose pads send CC)
 */
export function canBind(key, target) {
  if (!target) return false;
  return key.startsWith('cc:') || target.kind !== 'cc';
}

/** @returns {Object<string,string>} always an object; {} = nothing mapped */
export function sanitizeMidiMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  const usedTargets = new Set();
  for (const [key, id] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_BINDINGS) break;
    if (!isBindKey(key) || typeof id !== 'string' || usedTargets.has(id)) continue;
    const t = getMidiTarget(id);
    if (!t || !canBind(key, t)) continue;
    out[key] = id;
    usedTargets.add(id);
  }
  return out;
}

/** Bind `key` → `targetId`, moving any earlier binding of either. Returns a new map (or the same one if refused). */
export function bindTarget(map, key, targetId) {
  const t = getMidiTarget(targetId);
  if (!isBindKey(key) || !canBind(key, t)) return map;
  const next = {};
  for (const [k, id] of Object.entries(map)) if (k !== key && id !== targetId) next[k] = id;
  next[key] = targetId;
  return sanitizeMidiMap(next);
}

/** Drop a target's binding. */
export function unbindTarget(map, targetId) {
  const next = {};
  for (const [k, id] of Object.entries(map)) if (id !== targetId) next[k] = id;
  return next;
}

/** The key a target is bound to, or null. */
export function keyFor(map, targetId) {
  for (const [k, id] of Object.entries(map)) if (id === targetId) return k;
  return null;
}
