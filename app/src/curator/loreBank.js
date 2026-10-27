// loreBank.js — #1560 S4: the app side of the lore bank (design docs/research/room-codec/05-lore-api.md).
// Pure: no clock, no storage, no network. The bank itself is a versioned artifact curated OFFLINE
// (studio/curate-lore.py — Wikidata CC0 facts and Met CC0 object data, every date machine-verified
// against its source) and shipped as lore.json beside this module, the same shape of arrangement as
// taste.json and its validator (tasteHead.js): heavy thinking offline, a cheap versioned artifact live,
// and this module as the trust boundary the artifact crosses to get in.
//
// Law 4 (00-overview): the live instrument never calls the network — there is no fetch anywhere here.
// Law 1: nothing in this module writes to the bus or the transcript; it hands story machinery a referent.
//
// Entry shape (05's bank shape, kept as authored — validation is admission, not translation):
//   { id, kind: maxim|ancestor|fact|onthisday, fact, tags: { family, movement, mood },
//     source_id, source_url, rights, retrieved_date, bank_version }
//   onthisday entries additionally carry { month, day } so a date can be matched without parsing prose.
// Provenance is data, per record: any entry can be audited or pulled without touching the rest.
import loreFile from './lore.json' with { type: 'json' };

export const LORE_KIND = 'kc-lore';
export const LORE_VERSION = 1;
export const LORE_KINDS = Object.freeze(['maxim', 'ancestor', 'fact', 'onthisday']);
export const LORE_TAG_AXES = Object.freeze(['family', 'movement', 'mood']);
const MAX_ENTRIES = 512;
const ID_SHAPE = /^[a-z0-9][a-z0-9-]*$/;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // February reads 29: a leap-day record is admissible

const isDateString = (s) => {
  if (typeof s !== 'string' || !DATE_SHAPE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return d <= (m === 2 && !leap ? 28 : DAYS_IN_MONTH[m - 1]);
};

/** One entry, cleaned, or null when it may not enter the bank. Strict about provenance, lax about nothing else. */
function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { id, kind, fact, tags, source_id, source_url, rights, retrieved_date, bank_version } = raw;
  if (typeof id !== 'string' || !ID_SHAPE.test(id) || id.length > 64) return null;
  if (!LORE_KINDS.includes(kind)) return null;
  if (typeof fact !== 'string' || !fact.trim() || fact.length > 400) return null;
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return null;
  const cleanTags = {};
  for (const [k, v] of Object.entries(tags)) {
    if (!LORE_TAG_AXES.includes(k)) return null; // an unknown axis is a file this app reads wrongly, not creatively
    if (typeof v !== 'string' || !v.trim() || v.length > 32) return null;
    cleanTags[k] = v;
  }
  if (typeof cleanTags.family !== 'string') return null; // the family axis is the draw's spine — required
  // provenance rides every record (05): no source, no rights basis, no retrieval date — no entry
  if (typeof source_id !== 'string' || !source_id.trim() || source_id.length > 80) return null;
  if (typeof source_url !== 'string' || !source_url.startsWith('https://') || source_url.length > 200) return null;
  if (typeof rights !== 'string' || !rights.trim() || rights.length > 160) return null;
  if (!isDateString(retrieved_date)) return null;
  if (typeof bank_version !== 'string' || !bank_version.trim() || bank_version.length > 32) return null;
  const entry = { id, kind, fact, tags: cleanTags, source_id, source_url, rights, retrieved_date, bank_version };
  if (kind === 'onthisday') {
    const { month, day } = raw;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1 || day > DAYS_IN_MONTH[month - 1]) return null;
    entry.month = month;
    entry.day = day;
  } else if (raw.month !== undefined || raw.day !== undefined) {
    return null; // a date on a non-date kind is a curation error, not a nuance
  }
  return entry;
}

/**
 * Validate a lore file (a trust boundary: it comes from a file). Returns { ok: true, bank } with clean
 * copies of only well-formed entries, or { ok: false, error }. Fail-closed like validateTaste — but
 * per-record: one rotten entry refuses the FILE, because a bank that silently drops records cannot be
 * audited against its own provenance (the pull-one-entry story in 05 works by editing the file).
 */
export function validateLore(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not a lore file' };
  if (raw.kind !== LORE_KIND) return { ok: false, error: 'not a lore file (kind)' };
  if (raw.version !== LORE_VERSION)
    return { ok: false, error: `lore v${raw.version} — this app reads v${LORE_VERSION}` };
  if (typeof raw.bank_version !== 'string' || !raw.bank_version.trim())
    return { ok: false, error: 'lore has no bank_version' };
  if (!Array.isArray(raw.entries) || raw.entries.length === 0 || raw.entries.length > MAX_ENTRIES) {
    return { ok: false, error: 'lore entries missing or out of bounds' };
  }
  const seen = new Set();
  const entries = [];
  for (const rawEntry of raw.entries) {
    const entry = cleanEntry(rawEntry);
    if (!entry) return { ok: false, error: `bad lore entry: ${String(rawEntry && rawEntry.id)}` };
    if (seen.has(entry.id)) return { ok: false, error: `duplicate lore id: ${entry.id}` };
    seen.add(entry.id);
    if (entry.bank_version !== raw.bank_version)
      return { ok: false, error: `entry ${entry.id} is not of this bank version` };
    entries.push(entry);
  }
  return { ok: true, bank: { kind: LORE_KIND, version: LORE_VERSION, bankVersion: raw.bank_version, entries } };
}

let shipped = undefined; // undefined = not yet read; null = the shipped file failed validation (no lore, honestly)

/** The shipped bank, validated once. Null when the file on disk is not a bank this app may read. */
export function getLoreBank() {
  if (shipped === undefined) {
    const r = validateLore(loreFile);
    shipped = r.ok ? r.bank : null;
  }
  return shipped;
}

/** An entry by id, or null. The story view resolves a beat's lore referent through here. */
export function loreById(bank, id) {
  if (!bank || typeof id !== 'string') return null;
  return bank.entries.find((e) => e.id === id) || null;
}

/** The on-this-day entries for a date (an input — this module reads no clock), in bank order (id-sorted). */
export function loreForDate(bank, month, day) {
  if (!bank || !Number.isInteger(month) || !Number.isInteger(day)) return [];
  return bank.entries.filter((e) => e.kind === 'onthisday' && e.month === month && e.day === day);
}

/**
 * The day's cold-open entry, or null when the bank holds nothing for the date (the common case for a
 * first-pass bank — an absent day is an honest absence, never a borrowed fact from a neighbouring date).
 * The pick among a date's entries is the caller's injected roll, so a given (bank, date, roll stream)
 * always selects the same entry: selection replays exactly.
 */
export function pickOnThisDay(bank, date, roll) {
  const ofDay = loreForDate(bank, date && date.month, date && date.day);
  if (!ofDay.length) return null;
  const r = typeof roll === 'function' ? roll() : 0;
  const i = Math.min(ofDay.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * ofDay.length)));
  return ofDay[i];
}

/**
 * 05's tag draw: the story generator draws lore by tags matching the room's state. Given the axes the
 * room can name, the best-matching entries are those matching the most named axes; the roll picks among
 * that best tier only — a strongly keyed aside outranks a weakly keyed one (salience, as in 04's rules),
 * and the same (bank, tags, roll) always draws the same entry. Null when nothing matches any named axis.
 */
export function drawLore(bank, tags, roll) {
  if (!bank || !tags || typeof tags !== 'object') return null;
  const wanted = LORE_TAG_AXES.filter((a) => typeof tags[a] === 'string' && tags[a]);
  if (!wanted.length) return null;
  let best = [];
  let bestScore = 0;
  for (const e of bank.entries) {
    let score = 0;
    for (const a of wanted) if (e.tags[a] === tags[a]) score++;
    if (score > bestScore) {
      bestScore = score;
      best = [e];
    } else if (score === bestScore && score > 0) best.push(e);
  }
  if (!bestScore) return null;
  const r = typeof roll === 'function' ? roll() : 0;
  const i = Math.min(best.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * best.length)));
  return best[i];
}
