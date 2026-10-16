// shelfPrefs — Keeps K2 (#1590): the preferences.json contract.
//
// The sway table and the shelf's settings live in preferences.json in
// the loot folder (Matt's ruling: data, not UI — the dial is NOT a
// control; the file is the control). This module is the pure half:
// the shipped defaults, the parser/clamp, and the defaults document.
// The loot read path (loot/shelfPrefsLoad.mjs) feeds it the file's
// text; the store applies the result on launch and on every rescan, so
// an edit takes effect on the NEXT fill, never mid-fill.
//
// The laws (spec §5 / issue #1590):
//   - namespaced keys (`shelf.*`); unknown keys are tolerated (the doc
//     carries other namespaces' futures — `shelf.export` is K3's).
//   - a bad value clamps to its nearest valid value and the CORRECTION
//     IS NAMED in the returned lines — a hidden clamp breaks trust
//     the same way a hidden eviction does.
//   - a missing or unparseable file means the shipped defaults are in
//     force (FULL WEIRD), and that too is said, in the lines.
//   - an iCloud conflict copy is never read; the loader names it.
//
// PURE: no store, no IO — the census/shuffle determinism discipline
// applies to everything the fill derives from these values.

export const SHELF_PREFS_VERSION = 1;

// Matt's pick, ratified with the shelf design: FULL WEIRD — 8 of 16
// stage slots follow the consensus, 8 break the rules. The stage holds
// 16 slot-cost units (K1), so the table's counts must sum to ≤ 16.
export const FULL_WEIRD_TABLE = Object.freeze({
  consensus: 8,
  neglected: 3,
  wild: 2,
  lois: 2,
  contrarian: 1,
});

// Deal order is the table's reading order: consensus first, the
// contrarian last (it is defined against the other 15).
export const RULE_ORDER = Object.freeze(['consensus', 'neglected', 'wild', 'lois', 'contrarian']);

export const DEFAULT_SHELF_PREFS = Object.freeze({
  version: SHELF_PREFS_VERSION,
  table: FULL_WEIRD_TABLE,
  // Fills whose stage a keep sat on, counting back from the last one,
  // during which it cannot take a consensus slot (the current stage
  // always counts). 0 turns recency suppression off; hand swaps are
  // never suppressed (K1 law).
  recencyWindow: 2,
  // The K1 soft bound, now a real preference: past this many keeps the
  // collection asks to export (K3 acts on it; nothing is ever deleted).
  collectionSoftBound: 400,
});

export const TABLE_TOTAL_MAX = 16;
export const RECENCY_WINDOW_MAX = 8;
export const SOFT_BOUND_MIN = 16;
export const SOFT_BOUND_MAX = 100000;

// Is this table the shipped FULL WEIRD table? (The receipt names the
// table in force; a file that spells the defaults out loud is still
// FULL WEIRD in force.)
export function isFullWeird(prefs) {
  const t = prefs?.table || {};
  return RULE_ORDER.every((r) => t[r] === FULL_WEIRD_TABLE[r]);
}

export function tableTotal(prefs) {
  const t = prefs?.table || {};
  return RULE_ORDER.reduce((n, r) => n + (Number.isFinite(t[r]) ? t[r] : 0), 0);
}

// 'FULL WEIRD' or a plain account of the counts — the name the receipt
// and the dev panel show for the table in force.
export function tableName(prefs) {
  if (isFullWeird(prefs)) return 'FULL WEIRD';
  const t = prefs.table;
  return RULE_ORDER.map((r) => `${r} ${t[r]}`).join(' · ');
}

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

// One setting, read honestly: absent → the default, silently (the doc
// need not spell out every key); present but unusable → the default
// with a named line; present but out of range → clamped, named.
function readInt(raw, key, def, lo, hi, lines) {
  if (raw === undefined || raw === null) return def;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    lines.push(`shelf.${key}: ${JSON.stringify(raw)} is not a number — the default ${def} stands`);
    return def;
  }
  const c = clampInt(raw, lo, hi);
  if (c !== raw) lines.push(`shelf.${key}: ${raw} is outside ${lo}–${hi} — clamped to ${c}`);
  return c;
}

// parseShelfPrefs(text) → { prefs, source, lines }
//   text: the file's text, or null when no readable file exists.
//   source: 'file' when a real file parsed (corrections and all),
//           'default' when the shipped defaults are in force.
//   lines: every correction and fallback, in plain words, in read
//          order — surfaced verbatim in the dev panel and the shelf.
export function parseShelfPrefs(text) {
  if (text === null || text === undefined || String(text).trim() === '') {
    return {
      prefs: DEFAULT_SHELF_PREFS,
      source: 'default',
      lines: ['no preferences.json in the loot folder — shipped defaults in force (FULL WEIRD)'],
    };
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return {
      prefs: DEFAULT_SHELF_PREFS,
      source: 'default',
      lines: ['preferences.json is not readable JSON — shipped defaults in force (FULL WEIRD)'],
    };
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return {
      prefs: DEFAULT_SHELF_PREFS,
      source: 'default',
      lines: ['preferences.json holds no settings object — shipped defaults in force (FULL WEIRD)'],
    };
  }
  const shelf = (doc.shelf && typeof doc.shelf === 'object' && !Array.isArray(doc.shelf)) ? doc.shelf : {};
  const rawTable = (shelf.table && typeof shelf.table === 'object' && !Array.isArray(shelf.table)) ? shelf.table : {};
  const lines = [];
  const table = {};
  for (const rule of RULE_ORDER) {
    table[rule] = readInt(rawTable[rule], `table.${rule}`, FULL_WEIRD_TABLE[rule], 0, TABLE_TOTAL_MAX, lines);
  }
  let total = RULE_ORDER.reduce((n, r) => n + table[r], 0);
  if (total > TABLE_TOTAL_MAX) {
    // The stage holds 16: trim the excess from the LAST rules in deal
    // order (the consensus is the table's spine; the contrarian is
    // defined against a full stage and yields first).
    const over = total;
    for (const rule of [...RULE_ORDER].reverse()) {
      if (total <= TABLE_TOTAL_MAX) break;
      const cut = Math.min(table[rule], total - TABLE_TOTAL_MAX);
      if (cut > 0) {
        lines.push(`shelf.table: the counts sum to ${over}, over the 16-slot stage — ${rule} trimmed ${table[rule]} → ${table[rule] - cut}`);
        table[rule] -= cut;
        total -= cut;
      }
    }
  }
  const recencyWindow = readInt(shelf.recencyWindow, 'recencyWindow', DEFAULT_SHELF_PREFS.recencyWindow, 0, RECENCY_WINDOW_MAX, lines);
  const collectionSoftBound = readInt(shelf.collectionSoftBound, 'collectionSoftBound', DEFAULT_SHELF_PREFS.collectionSoftBound, SOFT_BOUND_MIN, SOFT_BOUND_MAX, lines);
  return {
    prefs: { version: SHELF_PREFS_VERSION, table, recencyWindow, collectionSoftBound },
    source: 'file',
    lines,
  };
}

// The iCloud conflict copy (spec S6): sync-conflicted duplicates of
// the preferences file are ignored — and named by the loader.
export function isConflictCopyName(name) {
  return /^preferences \(conflicted copy[^)]*\)\.json$/i.test(String(name || ''));
}

export function conflictCopyLine(name) {
  return `${name} ignored — the canonical preferences.json wins`;
}

// The document a first loot setup writes (and the text the K2 report
// ships as the reference): every default spelled out, so the file is
// self-documenting. JSON carries no comments — the _about string is
// the comment. shelf.export is K3's namespace, present so the doc
// Matt edits today is the doc K3 reads tomorrow.
export const DEFAULT_PREFERENCES_TEXT = `${JSON.stringify({
  _about: 'Kinetic Curator preferences. Human-editable; read on launch and on every loot rescan — edits take effect on the NEXT fill, never mid-fill. Bad values clamp to the nearest valid value and the correction is named in the dev panel (SHELF tab). Delete the file and the shipped defaults (FULL WEIRD) are in force.',
  shelf: {
    table: { ...FULL_WEIRD_TABLE },
    recencyWindow: DEFAULT_SHELF_PREFS.recencyWindow,
    collectionSoftBound: DEFAULT_SHELF_PREFS.collectionSoftBound,
    export: { folder: 'looks', includeStills: true, includeSeeds: true, onSoftBound: 'export' },
  },
}, null, 2)}\n`;
