// fieldDirector.js — pure pick-time helpers for FIELD (poets) + Director headroom.
// Deterministic. No live loop. No inventing candidates. Seeded RNG only.

import { GREENLEAF } from '../poets/greenleaf.js';
import { TEIJO } from '../poets/teijo.js';
import { ROSSELLI } from '../poets/rosselli.js';
import { GIBSON } from '../poets/gibson.js';

export const POETS = Object.freeze({
  greenleaf: GREENLEAF,
  teijo: TEIJO,
  rosselli: ROSSELLI,
  gibson: GIBSON,
});

/** Preferred next rooms (adjacency). Data only. Used at pick time. */
export const ROOM_TRANSITIONS = Object.freeze({
  'THE CLASH': ['THE ROOM', 'AGREEMENT'],
  'THE ROOM': ['AGREEMENT', 'THE CLASH', 'DAVIS ALONE'],
  'FULL BURN': ['THE ROOM', 'THE CLASH'],
  AGREEMENT: ['THE ROOM', 'DAVIS ALONE'],
  'DAVIS ALONE': ['THE ROOM', 'AGREEMENT'],
});

/** Slow pacing debt: hot rooms in the last N keeps. Cap 6. Window 24 (#1907 fix):
 * a 12-keep burn streak must still read as debt after the room cools — at 8 the
 * streak flushed out of the window before the eval loop's 30-step scenario ends. */
export const SLOW_DEBT_CAP = 6;
export const SLOW_DEBT_WINDOW = 24;

export function nextSlowDebt(history, currentVerdict) {
  const h = Array.isArray(history) ? history.slice(-SLOW_DEBT_WINDOW) : [];
  h.push(currentVerdict === 'FULL BURN' || currentVerdict === 'THE CLASH' ? 1 : 0);
  const sum = h.reduce((a, b) => a + b, 0);
  return { debt: Math.min(SLOW_DEBT_CAP, sum), history: h };
}

/**
 * Pure poet choice. Seeded. Cool / high-keep → greenleaf|teijo. Hot → rosselli|gibson.
 * Returns { poetId, piece, layout, density } or null (silence).
 */
export function choosePoet({
  intensity = 0.5,
  slowDebt = 0,
  genreLean = null,
  rng = () => 0.5,
  lastRejected = false,
} = {}) {
  if (lastRejected && rng() < 0.7) return null; // damp after rejection
  // Precedence (#1907 fix): a live blaze outranks debt — debt brakes a neutral
  // room toward held forms, it does not call a hot room cool. As first written,
  // debt >= 3 forced the cool pool at any intensity, so a permanently hot room
  // measured hotBias ~0 against the module's own documented behaviour.
  const cool = intensity < 0.35 || (slowDebt >= 3 && intensity <= 0.65);
  const hot = intensity > 0.65;
  const pool = cool
    ? ['greenleaf', 'teijo']
    : hot
      ? ['rosselli', 'gibson']
      : ['greenleaf', 'teijo', 'rosselli', 'gibson'];
  const poetId = pool[Math.floor(rng() * pool.length)] || 'greenleaf';
  const deck = POETS[poetId];
  if (!deck || deck.length === 0) return null;
  const piece = deck[Math.floor(rng() * deck.length)];
  const density = genreLean === 'dense' ? Math.min(1, (piece.density || 0.4) + 0.15) : piece.density || 0.4;
  return {
    poetId,
    pieceId: piece.id,
    lines: piece.lines,
    layout: piece.layout || 'bands',
    density,
  };
}

/** Preferred next room from adjacency, or null. Pure. */
export function preferredNext(currentVerdict, rng = () => 0.5) {
  const next = ROOM_TRANSITIONS[currentVerdict];
  if (!next || next.length === 0) return null;
  return next[Math.floor(rng() * next.length)];
}
