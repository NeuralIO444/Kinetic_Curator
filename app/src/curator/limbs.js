// curator/limbs.js — #1355 Phase 3 step 5: how many pairs of wings a moth has, from how crowded its place is.
//
// Matt (2026-10-13): the dish decides. A formed creature starts with ONE pair; a crowded place grows the second pair and
// a thinning crowd sheds it. That makes four wings at most: the TE four limbs, and a real moth's two pairs. The base
// type never leaves the set.
//
// The signal is the pin's own dish pressure (the formation tracker's per-pin `density`, quantized: 0..1 of a full
// crowd). A creature's own marks are excluded from it (dishPressure skips `_creature`), so a moth cannot grow itself.
// Counted in resolver frames, never in time: it must hold GROW_FRAMES at or above GROW_AT to gain the pair, and
// SHED_FRAMES at or below SHED_AT to lose it. The gap between the two thresholds is the hysteresis.
//
// The decision rides the next frame's resolver input (`dishLimbs`), so a recorded take replays its creatures' limbs.
// The thresholds are the roadmap's open tunables: named, here, and tuned from ?debug=stress.

export const MAX_PAIRS = 2;
/** Crowd (0..1 of a full dish pressure) at or above which the second pair starts to grow: about 15 marks. */
export const LIMB_GROW_AT = 0.6;
/** Crowd at or below which it starts to go again: about 7 marks. Between the two nothing changes. */
export const LIMB_SHED_AT = 0.3;
/** Frames the crowd must hold above GROW_AT (3/4 s at 60 fps). */
export const LIMB_GROW_FRAMES = 45;
/** Frames it must hold below SHED_AT (1.5 s): losing a limb is slower than gaining one. */
export const LIMB_SHED_FRAMES = 90;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * The tracker. `update(states)` takes the formation tracker's per-pin states ([{ x, y, formed, density } | null]) and
 * returns the pairs per pin (1 or 2). A pin that is not formed reads 1 and forgets: a creature starts from one pair.
 */
export function createLimbTracker() {
  let slots = []; // per pin: { pairs, run, x, y }
  return {
    update(states) {
      const out = new Array(states.length);
      const next = new Array(states.length);
      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        if (!s || s.formed !== true) {
          out[i] = 1;
          next[i] = null;
          continue;
        }
        const prev = slots[i] && slots[i].x === s.x && slots[i].y === s.y ? slots[i] : null;
        const slot = prev ? { ...prev } : { pairs: 1, run: 0, x: s.x, y: s.y };
        const d = finite(s.density) ? s.density : 0;
        if (slot.pairs < MAX_PAIRS) {
          slot.run = d >= LIMB_GROW_AT ? slot.run + 1 : 0;
          if (slot.run >= LIMB_GROW_FRAMES) {
            slot.pairs += 1;
            slot.run = 0;
          }
        } else {
          slot.run = d <= LIMB_SHED_AT ? slot.run + 1 : 0;
          if (slot.run >= LIMB_SHED_FRAMES) {
            slot.pairs -= 1;
            slot.run = 0;
          }
        }
        out[i] = slot.pairs;
        next[i] = slot;
      }
      slots = next;
      return out;
    },
    reset() {
      slots = [];
    },
    // #1694 slice 1 — snapshot/restore for the resolver-owned spawn state (#1367's law, fail-closed).
    snapshotState() {
      return { v: 1, slots: slots.map((s) => (s ? { ...s } : null)) };
    },
    restoreState(snap) {
      if (!snap || typeof snap !== 'object' || snap.v !== 1 || !Array.isArray(snap.slots)) return false;
      const next = [];
      for (const s of snap.slots) {
        if (s === null) {
          next.push(null);
          continue;
        }
        if (
          !s ||
          typeof s !== 'object' ||
          !Number.isFinite(s.x) ||
          !Number.isFinite(s.y) ||
          !Number.isFinite(s.run) ||
          (s.pairs !== 1 && s.pairs !== 2)
        )
          return false;
        next.push({ pairs: s.pairs, run: s.run, x: s.x, y: s.y });
      }
      slots = next;
      return true;
    },
  };
}
