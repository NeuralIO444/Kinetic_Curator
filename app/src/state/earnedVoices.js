// earnedVoices.js — voices the triad mints from the artist's own work (#1153).
//
// The four factory flagships are retired. A voice is now EARNED: when Davis's BLOOM lands (a keep after a run of
// passes, curator/davisState.js) the instrument shelves that moment as a voice, with the number of rolls it took.
// Rarity is only ever that count, a real measurement (KC-1 DS rule 3), never a dice roll. The Queen is never part
// of it (rule 10): nothing here reads or shows her. A minted voice is frozen history, so it renders as a still tile
// (rule 9). Four slots; a deeper find replaces the one with the fewest rolls.
//
// Pure: no store, no DOM, no clock (the caller passes `at`).

export const EARNED_SLOTS = 4;
/** A find needs at least this many of the artist's own rolls behind it (the same bar as Davis's UGLY / BLOOM). */
export const EARNED_MIN_ROLLS = 5;
export const EARNED_MAX_ROLLS = 99999;

/** True for a voice the triad minted. */
export const isEarned = (v) => !!v && !!v.earned;

/** Deadpan name from the scene: the palette (or 'custom') and the placement mode. <= 24 characters, the shelf cap. */
export function earnedName({ paletteId, paletteOverrides, layoutParams } = {}) {
  const pal = paletteOverrides ? 'custom' : String(paletteId || 'custom');
  const mode = String((layoutParams && layoutParams.mode) || 'scene');
  return `${pal} ${mode}`.slice(0, 24);
}

/** The one-line caption of the moment: how many rolls, how many marks, which seed. All three are facts. */
export function earnedCaption({ rolls, count, seed }) {
  const r = Math.max(0, Math.floor(Number(rolls) || 0));
  const marks = Math.max(0, Math.floor(Number(count) || 0));
  const hex = (Number(seed) >>> 0).toString(16);
  return `after ${r} roll${r === 1 ? '' : 's'} · ${marks} marks · seed ${hex}`;
}

/** What a voice carries to say it was earned. Sanitized: this is read back from localStorage and from bundles. */
export function sanitizeEarned(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rolls = Number(raw.rolls);
  if (!Number.isFinite(rolls) || rolls < 0) return null;
  return {
    rolls: Math.min(EARNED_MAX_ROLLS, Math.floor(rolls)),
    at: Number.isFinite(raw.at) ? raw.at : 0,
    caption: typeof raw.caption === 'string' ? raw.caption.slice(0, 80) : '',
  };
}

/**
 * Shelve a find among the voices. Returns { list, minted, replaced }.
 *  - fewer than EARNED_SLOTS earned: it is added;
 *  - full: it replaces the earned voice with the FEWEST rolls (the oldest of those on a tie) when it is at least as
 *    deep; a shallower find is not shelved (nothing is displaced for something less rare);
 *  - voices the performer made by hand are never touched.
 */
export function mintEarned(list, entry) {
  const all = Array.isArray(list) ? list : [];
  if (!entry || !entry.earned || entry.earned.rolls < EARNED_MIN_ROLLS) return { list: all, minted: false, replaced: null };
  if (all.some((v) => v.id === entry.id)) return { list: all, minted: false, replaced: null };
  const earned = all.filter(isEarned);
  if (earned.length < EARNED_SLOTS) return { list: [...all, entry], minted: true, replaced: null };
  const shallowest = earned.reduce((a, b) => (b.earned.rolls < a.earned.rolls || (b.earned.rolls === a.earned.rolls && b.earned.at < a.earned.at) ? b : a));
  if (entry.earned.rolls < shallowest.earned.rolls) return { list: all, minted: false, replaced: null };
  return { list: all.map((v) => (v.id === shallowest.id ? entry : v)), minted: true, replaced: shallowest.id };
}

/** The earned voices, deepest first (the order the tiles show them). */
export const earnedVoices = (list) => (Array.isArray(list) ? list : []).filter(isEarned)
  .sort((a, b) => b.earned.rolls - a.earned.rolls || b.earned.at - a.earned.at);
