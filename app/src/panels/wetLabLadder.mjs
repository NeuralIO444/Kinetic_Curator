// wetLabLadder.mjs — the WetLab ladder's rung model (docs/design/wetlab-ladder-spec.md §2, §4, §9; step 1).
//
// Five rungs, SHAPE → ASSET → RECIPE → CREATURE → RIG. On every rung the artist keeps things; keeping the third
// item on a rung opens the next one, and an opened rung stays open for that artist in every project (rulings 4, 5,
// 8). Pure and headless: no UI, no clock, no random. The preference store follows the per-viewer pattern of
// dishFluidChip.model.mjs — an injected storage, never throws, never part of a saved project.
//
// The pips are COUNTS (DS rule 2: discrete signals render as numbers), not a score: nothing here awards points,
// levels or streaks (spec §7; "shimmer is a readout, not a reward").

/** The rungs, bottom to top. `noun` is what a rung's keeps are called, for the lock line of the rung above. */
export const RUNGS = Object.freeze([
  Object.freeze({ id: 'shape', label: 'SHAPE', noun: 'SHAPES' }),
  Object.freeze({ id: 'asset', label: 'ASSET', noun: 'ASSETS' }),
  Object.freeze({ id: 'recipe', label: 'RECIPE', noun: 'RECIPES' }),
  Object.freeze({ id: 'creature', label: 'CREATURE', noun: 'CREATURES' }),
  Object.freeze({ id: 'rig', label: 'RIG', noun: 'RIGS' }),
]);

export const RUNG_IDS = Object.freeze(RUNGS.map((r) => r.id));

/** Keeps on a rung that open the next one (ruling 5). A named constant, tuned in the build. */
export const OPEN_AT = 3;

/** The localStorage key for the artist's ladder. */
export const LADDER_KEY = 'kc.wetLabLadder.v1';

const FIRST = RUNG_IDS[0];
const indexOf = (rung) => RUNG_IDS.indexOf(rung);

/** A new artist's ladder: nothing kept, only SHAPE open. */
export function emptyLadder() {
  const kept = {};
  const open = {};
  for (const id of RUNG_IDS) {
    kept[id] = 0;
    open[id] = id === FIRST;
  }
  return { v: 1, kept, open };
}

/**
 * Any stored value as a ladder. Garbled or missing reads as the empty ladder, field by field. The chain is enforced:
 * a rung can only be open if every rung below it is, and a rung with OPEN_AT keeps has opened the one above it, so a
 * hand-edited or half-written record cannot leave the rail in a state the artist could not have reached.
 */
export function sanitizeLadder(raw) {
  const out = emptyLadder();
  if (!raw || typeof raw !== 'object') return out;
  for (const id of RUNG_IDS) {
    const k = Number(raw.kept && raw.kept[id]);
    out.kept[id] = Number.isFinite(k) && k > 0 ? Math.floor(k) : 0;
  }
  for (let i = 1; i < RUNG_IDS.length; i += 1) {
    const id = RUNG_IDS[i];
    const below = RUNG_IDS[i - 1];
    const wasOpen = !!(raw.open && raw.open[id] === true);
    out.open[id] = out.open[below] && (wasOpen || out.kept[below] >= OPEN_AT);
  }
  return out;
}

export function isOpen(ladder, rung) {
  return !!(ladder && ladder.open && ladder.open[rung] === true);
}

/** How many of a rung's pips are filled: the keeps so far, capped at OPEN_AT. */
export function pips(ladder, rung) {
  const k = ladder && ladder.kept ? Number(ladder.kept[rung]) || 0 : 0;
  return Math.max(0, Math.min(OPEN_AT, k));
}

/** The line on a locked rung, four words or fewer; null for the bottom rung, which is never locked. */
export function lockLabel(rung) {
  const i = indexOf(rung);
  if (i <= 0) return null;
  return `KEEP ${OPEN_AT} ${RUNGS[i - 1].noun}`;
}

/**
 * The artist keeps one item on `rung`. Returns `{ ladder, opened }`: the next ladder, and the id of the rung this
 * keep just opened (null when it opened nothing) — the rail lights that rung once and nothing else happens.
 * A keep on a locked rung is refused and changes nothing, so a stray call cannot open the ladder out of order.
 */
export function keep(ladder, rung) {
  const cur = sanitizeLadder(ladder);
  const i = indexOf(rung);
  if (i < 0 || !isOpen(cur, rung)) return { ladder: cur, opened: null };
  const next = { v: 1, kept: { ...cur.kept }, open: { ...cur.open } };
  next.kept[rung] += 1;
  const above = RUNG_IDS[i + 1];
  if (above && !next.open[above] && next.kept[rung] >= OPEN_AT) {
    next.open[above] = true;
    return { ladder: next, opened: above };
  }
  return { ladder: next, opened: null };
}

/** The rung a new artist would work on next: the highest open rung. */
export function topOpenRung(ladder) {
  let top = FIRST;
  for (const id of RUNG_IDS) if (isOpen(ladder, id)) top = id;
  return top;
}

/** Read the stored ladder (never throws; a blocked store reads as a new artist's). */
export function loadLadder(storage) {
  try {
    const raw = storage && storage.getItem(LADDER_KEY);
    return sanitizeLadder(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyLadder();
  }
}

/** Persist the ladder (never throws — a full or blocked store just loses the nicety). Returns whether it wrote. */
export function saveLadder(storage, ladder) {
  try {
    if (!storage) return false;
    storage.setItem(LADDER_KEY, JSON.stringify(sanitizeLadder(ladder)));
    return true;
  } catch {
    return false;
  }
}
