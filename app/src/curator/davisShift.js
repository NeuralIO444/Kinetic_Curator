// curator/davisShift.js — Phase 4 step 2 (#1356): Davis shifts a moth's traits, once, when it is born.
//
// Matt (2026-10-13): the shifts are SHAPE AND COLOUR (spread angle, wing size, body size, which swatch the wings take)
// and they happen ONCE, at birth: when a pin forms, Davis gives that moth its character and it keeps it for life, so
// each moth is an individual and several can be compared. A pin that is moved or removed is a new birth.
//
// Every shift is bounded by engine/creature.js TRAIT_RANGES, and the RANGE WIDTH follows the stress band (roadmap:
// RELAX widest, NORMAL default, TIGHTEN narrowest): the band scales how much of each range a shift may use. The room
// (LOIS, step 3) will scale it further. Davis rolls from the document's own seed streams, not from a clock or Math.random:
// the same dish gives the same moths, and a take replays them (the traits ride the resolver input).
//
// The numbers are first guesses (named constants; tuned from real sessions, like every Phase 3 and 4 threshold).
import { hashU01 } from '../engine/kernel/rng.js';
import { TRAIT_DEFAULTS, TRAIT_RANGES, normalizeTraits } from '../engine/creature.js';
import { BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN } from './stress.js';

/** How much of each trait's range a shift may use, by band: the roadmap's wide / default / narrow. */
export const SHIFT_WIDTH = Object.freeze({ [BAND_RELAX]: 1, [BAND_NORMAL]: 0.65, [BAND_TIGHTEN]: 0.35 });

/** The width for a band (an unknown band, or none yet, reads as NORMAL). */
export function shiftWidthFor(band) {
  return SHIFT_WIDTH[band] ?? SHIFT_WIDTH[BAND_NORMAL];
}

/** A salt per trait so the four rolls are independent. */
const SALT = Object.freeze({ spread: 0x0da15501, wing: 0x0da15502, body: 0x0da15503, swatch: 0x0da15504 });

/** FNV-1a of a string: a stable 32-bit index for the one registered RNG channel. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Davis's roll for one trait: triangular around the default (most shifts are small, a few reach the edge: the
 * same shape refine uses), in [-1, 1].
 */
function signed(seed, offsets, key, trait) {
  const a = hashU01(seed, 'hierarchy', (hash32(key) + SALT[trait]) >>> 0, offsets);
  const b = hashU01(seed, 'hierarchy', (hash32(key) + SALT[trait] + 1) >>> 0, offsets);
  return (a + b) - 1;
}

/**
 * One moth's traits.
 * @param seed        the dish's seed
 * @param seedOffsets the document's seed offsets (re-rolling SPATIAL re-deals every moth's character)
 * @param pin         { x, y } at birth
 * @param ordinal     how many moths this session has been born at this slot (a re-pin is a new moth)
 * @param slot        the pin's index
 * @param width       0..1: the share of each range the shift may use (shiftWidthFor(band) times the room's, later)
 * @param centre      traits to roll AROUND instead of the defaults (a nudge toward the recent keeps, step 5); null = defaults
 */
export function shiftFor({ seed, seedOffsets = null, pin, ordinal = 0, slot = 0, width = SHIFT_WIDTH[BAND_NORMAL], centre = null }) {
  const s = (seed >>> 0);
  const w = Number.isFinite(width) ? Math.min(1, Math.max(0, width)) : SHIFT_WIDTH[BAND_NORMAL];
  const key = `davis:${slot}:${ordinal}:${Math.round((pin && pin.x) || 0)}:${Math.round((pin && pin.y) || 0)}`;
  const R = TRAIT_RANGES;
  const C = centre && typeof centre === 'object' ? normalizeTraits(centre) : TRAIT_DEFAULTS;
  const around = (def, range, trait) => {
    const v = signed(s, seedOffsets, key, trait); // -1..1
    // use `w` of the range on each side of the default (the ranges are asymmetric for the multipliers)
    return v >= 0 ? def + v * w * (range.max - def) : def + v * w * (def - range.min);
  };
  const u = hashU01(s, 'hierarchy', (hash32(key) + SALT.swatch) >>> 0, seedOffsets);
  return normalizeTraits({
    spread: around(C.spread, R.spread, 'spread'),
    wing: around(C.wing, R.wing, 'wing'),
    body: around(C.body, R.body, 'body'),
    // rank 0 is today's moth; a wider shift may reach further down the ranking
    swatch: Math.min(R.swatch.max, Math.max(R.swatch.min, Math.floor(u * (1 + (R.swatch.max - R.swatch.min) * w + 0.5)) + Math.round(C.swatch))),
  });
}

/**
 * The tracker. `update(states, ctx)` takes the formation tracker's per-pin states ([{ x, y, formed } | null]) and
 * { seed, seedOffsets, band }. It returns { traits, born }: `traits` per pin (an object once a pin has formed, null
 * otherwise) and `born`, the shifts made on this update ([{ pin, x, y, traits, band, width }]) — the `davis-shift` events.
 */
export function createShiftTracker() {
  let slots = []; // per pin: { x, y, traits } for a formed pin
  const ordinals = [];
  return {
    // `room`: { width, room } or a function returning one (called only when a moth is born: the room is read at birth)
    update(states, { seed = 0, seedOffsets = null, band = null, roomWidth = 1, room = null, centre = null } = {}) {
      const born = [];
      const next = new Array(states.length);
      const traits = new Array(states.length);
      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        if (!s || s.formed !== true) { next[i] = null; traits[i] = null; continue; }
        const prev = slots[i] && slots[i].x === s.x && slots[i].y === s.y ? slots[i] : null;
        if (prev) { next[i] = prev; traits[i] = prev.traits; continue; }
        ordinals[i] = (ordinals[i] || 0) + 1;
        const r = typeof room === 'function' ? room() : room;
        const rw = r && Number.isFinite(r.width) ? r.width : roomWidth;
        const width = shiftWidthFor(band) * (Number.isFinite(rw) ? Math.min(1, Math.max(0, rw)) : 1);
        const c = typeof centre === 'function' ? centre(r) : centre;
        const t = shiftFor({ seed, seedOffsets, pin: s, ordinal: ordinals[i], slot: i, width, centre: c });
        next[i] = { x: s.x, y: s.y, traits: t };
        traits[i] = t;
        born.push({ pin: i, x: s.x, y: s.y, traits: t, band: band ?? null, width: +width.toFixed(4), room: (r && r.room) || null });
      }
      slots = next;
      return { traits, born };
    },
    reset() { slots = []; ordinals.length = 0; },
  };
}

export const SHIFT_RECORD_VERSION = 2;

/**
 * A take's `davis-shift` log: [frame, pin, spread, wing, body, swatch, room, lois, davis], in order: the room (0 = none)
 * and the two Directors' states that gave the shift its width (`matrix-room`, roadmap Phase 4). The log is authority;
 * the traits also ride the input.
 */
export function createShiftRecorder({ getFrame = () => 0 } = {}) {
  const events = [];
  return {
    update(born) {
      for (const e of born) {
        events.push([getFrame() | 0, e.pin, +e.traits.spread.toFixed(3), +e.traits.wing.toFixed(4), +e.traits.body.toFixed(4), e.traits.swatch,
          e.room ? e.room.n : 0, e.room ? e.room.lois : null, e.room ? e.room.davis : null]);
      }
    },
    finish() { return { version: SHIFT_RECORD_VERSION, events: events.map((e) => e.slice()) }; },
  };
}
