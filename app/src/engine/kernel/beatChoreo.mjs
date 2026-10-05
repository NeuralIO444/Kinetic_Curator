/**
 * beatChoreo.mjs — #951 hero-first, beat-quantized transition choreography.
 *
 * The transition is 2 beats long (the BEAT clock derives morph seconds as
 * 2 beats — see gl/beatClock.mjs). This module schedules WHO moves WHEN
 * inside that window:
 *
 *   - the HERO (largest mark, by scale) moves on beat 1 — slot 0, the downbeat;
 *   - the CHORUS follows on subsequent 16th-note slots, ordered by distance
 *     from the hero, so the stagger reads as a wave radiating outward.
 *
 * The starts quantize to the 16th-note grid of the transition itself. When
 * the BEAT clock drives the duration, the slots land exactly on 16th-note
 * boundaries of the dialed tempo; at high BPM the whole stagger compresses
 * naturally into the frenetic zone (duration is 2 beats, so the grid
 * compresses with it). Past the glitch ceiling the engine hard-cuts instead
 * of morphing (beatIsHardCut -> mixSeconds 0), which is the rhythmic-hard-cut
 * zone the issue describes — no choreography runs there at all.
 *
 * Every window still closes at or before t=1 (the #564 handoff invariant):
 * the latest start is 3/8 and the longest duration is capped so
 * delay + dur <= 1, so the completion frame hands raw toItems with no pop.
 *
 * Pure: no GL, no store, no clock. Deterministic per (items, seed) — the
 * same seed replays the same wave, rehearsable like the seeded stagger it
 * replaces. itemMorph keeps its seeded nodeWindow as the fallback for
 * plan-less blends (tests, one-shot calls); the choreo rides planMorph's
 * plan, which is computed once per transition and is universal across
 * systems (grid, fibonacci, CA, swarm — they all resolve to item lists).
 */

/** 16th-note slots inside beat 1: the hero's downbeat + 3 chorus waves. */
export const CHOREO_SLOTS = 4;
/** One slot, in transition fractions: a 16th of the 2-beat transition. */
export const CHOREO_SLOT_T = 1 / 8;
/** Latest start delay: 3/8 — leaves room for every window to close by t=1. */
export const CHOREO_MAX_DELAY = (CHOREO_SLOTS - 1) * CHOREO_SLOT_T;
/** Window shape, shared with the seeded stagger: long moves, soft landings. */
export const CHOREO_DUR_MIN = 0.5;
export const CHOREO_DUR_JIT = 0.15;

/**
 * Index of the hero: the largest mark (max scale). Ties go to the lowest
 * index; an empty list has no hero (-1). Non-finite scales read as 0 —
 * a mark with no scale never outranks one that has.
 */
export function heroIndex(items) {
  let best = -1;
  let bestScale = -Infinity;
  for (let i = 0; i < items.length; i++) {
    const s = Number(items[i]?.scale);
    const sc = Number.isFinite(s) ? s : 0;
    if (sc > bestScale) { bestScale = sc; best = i; }
  }
  return best;
}

/**
 * Chorus indices (everyone but the hero), nearest-first from the hero's
 * position. Distance ties keep index order. Non-finite coordinates read
 * as 0, same as the pairing code.
 */
export function chorusOrder(items, hero) {
  const hx = Number(items[hero]?.x);
  const hy = Number(items[hero]?.y);
  const fx = Number.isFinite(hx) ? hx : 0;
  const fy = Number.isFinite(hy) ? hy : 0;
  return items
    .map((_, i) => i)
    .filter((i) => i !== hero)
    .map((i) => {
      const x = Number(items[i]?.x);
      const y = Number(items[i]?.y);
      const dx = (Number.isFinite(x) ? x : 0) - fx;
      const dy = (Number.isFinite(y) ? y : 0) - fy;
      return { i, d: dx * dx + dy * dy };
    })
    .sort((a, b) => (a.d - b.d) || (a.i - b.i))
    .map((e) => e.i);
}

/**
 * Chorus rank (0 = nearest the hero) -> slot 1..CHOREO_SLOTS-1. The nearest
 * ring of the chorus catches the first 16th after the downbeat; the
 * farthest ring takes the last slot. A lone chorus mark takes slot 1.
 */
export function chorusSlot(rank, chorusCount) {
  if (chorusCount <= 1) return 1;
  return 1 + Math.round((rank * (CHOREO_SLOTS - 2)) / (chorusCount - 1));
}

/**
 * Per-to-index slot plan, computed ONCE per transition (planMorph calls
 * this). The hero owns slot 0; the chorus spreads 1..3 by distance rank.
 */
export function choreoPlan(items) {
  const list = Array.isArray(items) ? items : [];
  const slots = new Array(list.length).fill(0);
  const hero = heroIndex(list);
  if (hero >= 0) {
    const order = chorusOrder(list, hero);
    for (let r = 0; r < order.length; r++) {
      slots[order[r]] = chorusSlot(r, order.length);
    }
  }
  return { hero, slots };
}

/** xorshift-ish avalanche on (index, seed) — same shape as itemMorph's. */
function hash01(i, seed) {
  let h = (Math.imul((i | 0) + 0x9e3779b9, 0x85ebca6b) ^ (seed | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

/**
 * This node's window: a quantized start on the 16th-note grid, and the
 * same seeded duration shape the old stagger used (capped so the window
 * always closes by t=1 — the handoff invariant). Same (slot, index, seed)
 * replays the same window.
 */
export function choreoWindow(slot, i, seed = 0) {
  const s = Math.max(0, Math.min(CHOREO_SLOTS - 1, slot | 0));
  const delay = s * CHOREO_SLOT_T;
  const dur = Math.min(CHOREO_DUR_MIN + hash01(i * 2 + 1, seed) * CHOREO_DUR_JIT, 1 - delay);
  return { delay, dur };
}
