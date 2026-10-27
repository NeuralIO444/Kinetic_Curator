// shelfDisk — Keeps K3 (#1591): the disk tier's pure logic.
//
// The collection's third location. Past the soft bound (a loot
// preferences.json setting since K2), overflow EXPORTS to the loot
// folder — `looks/<keep-id>.json`, the keep record verbatim plus its
// baked still when one exists — instead of being deleted. Export is a
// location, not a graveyard: the exported keep stays listed in the
// collection view, marked on-disk; promoting it to the stage (swap or
// fill) re-imports it transparently; the record lives in exactly one
// place at a time (in the app's store, or in the file — never two
// writable copies; a file left behind by an import is a fossil the
// shelf ignores, overwritten if the keep ever exports again).
//
// Foundation law (outranks everything, K1–K4): NOTHING IS EVER
// SILENTLY LOST — and nothing silently MOVES, either. Every export
// and import is a shelf-history record (§5) and a visible line in the
// surface where it happened. All references are loot-root-relative
// POSIX; an absolute path is never stored, in any file, ever.
//
// This module is the pure half: the export preferences (the
// `shelf.export` namespace of preferences.json), the export planner,
// the export document, and the disk-stub index shapes. The IO lives in
// loot/shelfDiskRun.mjs (the take-in + the export runner) over the
// loot backends' write verb; the store owns the moves (davisSlice).
// Pure: no store, no IO, no clock — callers pass `at`-style facts in.

/** The loot subfolder exports land in (the #1479 folder contract has
 * exactly one looks folder; the preference names it so the document
 * Matt edits is the document K3 reads — any other value clamps here,
 * named, because a file outside the four subfolders is invisible to
 * every scan, which would be a silent loss wearing a setting). */
export const EXPORT_FOLDER = 'looks';

/** What the collection asks for when it crosses the soft bound. */
export const EXPORT_ON_SOFT_BOUND = Object.freeze(['export', 'off']);

export const DEFAULT_EXPORT_PREFS = Object.freeze({
  folder: EXPORT_FOLDER,
  // The record is verbatim; its baked still (spec §2.3) rides when one
  // exists and this is on. Keeps carry no still field today — the
  // crown-time bake (spec opportunity O1) is what will write them —
  // so today this governs a field that is honestly absent.
  includeStills: true,
  // Tolerated for the document's stability (it shipped in the K2
  // defaults text). Under the verbatim law the record IS the record —
  // its seed, offsets and provenance ride because they are the keep,
  // not an attachment — so this key has no separate effect and the
  // parser never "corrects" it. Named here so the tolerance is a
  // decision, not an oversight.
  includeSeeds: true,
  onSoftBound: 'export',
});

const boolOr = (raw, key, def, lines) => {
  if (raw === undefined || raw === null) return def;
  if (typeof raw === 'boolean') return raw;
  lines.push(`shelf.export.${key}: ${JSON.stringify(raw)} is not true or false — the default ${def} stands`);
  return def;
};

/**
 * parseShelfExportPrefs(text) → { exportPrefs, lines }
 * The `shelf.export` namespace of the same preferences.json document
 * K2's parser reads (curator/shelfPrefs.mjs owns the table/bound; the
 * two parsers share the file, never each other's keys). A missing or
 * unparseable file yields the shipped defaults with NO lines — the
 * main parser already spoke for the file as a whole; this one names
 * only its own corrections.
 */
export function parseShelfExportPrefs(text) {
  const lines = [];
  let doc = null;
  if (typeof text === 'string' && text.trim() !== '') {
    try {
      doc = JSON.parse(text);
    } catch {
      doc = null;
    }
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { exportPrefs: DEFAULT_EXPORT_PREFS, lines };
  const shelf = doc.shelf && typeof doc.shelf === 'object' && !Array.isArray(doc.shelf) ? doc.shelf : {};
  const raw = shelf.export && typeof shelf.export === 'object' && !Array.isArray(shelf.export) ? shelf.export : {};

  let folder = DEFAULT_EXPORT_PREFS.folder;
  if (raw.folder !== undefined && raw.folder !== null) {
    if (raw.folder === EXPORT_FOLDER) folder = EXPORT_FOLDER;
    else
      lines.push(
        `shelf.export.folder: ${JSON.stringify(raw.folder)} is not the loot folder's looks/ — exports land in ${EXPORT_FOLDER}`,
      );
  }
  const includeStills = boolOr(raw.includeStills, 'includeStills', DEFAULT_EXPORT_PREFS.includeStills, lines);
  const includeSeeds = boolOr(raw.includeSeeds, 'includeSeeds', DEFAULT_EXPORT_PREFS.includeSeeds, lines);
  let onSoftBound = DEFAULT_EXPORT_PREFS.onSoftBound;
  if (raw.onSoftBound !== undefined && raw.onSoftBound !== null) {
    if (EXPORT_ON_SOFT_BOUND.includes(raw.onSoftBound)) onSoftBound = raw.onSoftBound;
    else
      lines.push(
        `shelf.export.onSoftBound: ${JSON.stringify(raw.onSoftBound)} is not a behaviour the shelf has (export, or off) — export stands`,
      );
  }
  return { exportPrefs: { folder, includeStills, includeSeeds, onSoftBound }, lines };
}

/** The loot-relative POSIX path of a keep's export file. */
export const exportRelFor = (keepId, folder = EXPORT_FOLDER) => `${folder}/${keepId}.json`;

const KEEP_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/**
 * The keep id a look file's path names, or null when the path is not
 * a keeps export (wrong folder, wrong suffix, an id the shelf would
 * never write). The take-in's recognition rule: the filename stem IS
 * the keep id, and the record inside must agree.
 */
export function keepIdFromLookRel(rel, folder = EXPORT_FOLDER) {
  if (typeof rel !== 'string') return null;
  const parts = rel.split('/');
  if (parts.length !== 2 || parts[0] !== folder) return null;
  const base = parts[1];
  if (!base.endsWith('.json')) return null;
  const id = base.slice(0, -'.json'.length);
  return KEEP_ID.test(id) ? id : null;
}

/**
 * The export document: the keep record VERBATIM (provenance, stamps,
 * gate verdict — a tier move is not a new keep, Law 5) plus its baked
 * still when one exists and stills are included. Serialized with the
 * fields in record order; parse(serialize(k)) returns k exactly for
 * any sanitized record.
 */
export function exportDocumentFor(keep, { includeStills = true } = {}) {
  const doc = { ...(keep || {}) };
  if (!includeStills) delete doc.still;
  return doc;
}

export function serializeExport(keep, exportPrefs = DEFAULT_EXPORT_PREFS) {
  return `${JSON.stringify(exportDocumentFor(keep, exportPrefs), null, 2)}\n`;
}

/** A read export file, parsed: { keep } or null when it is not JSON
 * holding a record with an id. Sanitizing is the store's door, as
 * everywhere — this only shapes. */
export function parseExportDocument(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  if (typeof doc.id !== 'string' || !doc.id) return null;
  return { keep: doc };
}

/**
 * The export planner (the pure half of `shelf.export()`): when the
 * in-app collection stands past the soft bound, which keeps move to
 * disk — LONGEST-UNSTAGED first (spec §2.3): never-staged keeps lead
 * (unstaged the longest of all), then the longest since last staged,
 * oldest-kept breaking ties, id last so the plan is deterministic.
 * Never a victim:
 *   - a staged keep (it is on the deck, not in the overflow pool);
 *   - the performing keep (S1's pin, extended to moves);
 *   - a keep staged within the current session (the artist is working
 *     with it — "never exported under the artist").
 * Returns { victims, over, lines }: `over` is how far past the bound
 * the collection stands; when fewer keeps are exportable than the
 * overflow, the shortfall is a named line, never a quiet reach into
 * the protected set.
 */
export function planExports({
  keeps = [],
  stageIds = [],
  bound = 400,
  exportPrefs = DEFAULT_EXPORT_PREFS,
  sessionStartMs = 0,
  performingKeepId = null,
} = {}) {
  const over = Math.max(0, (keeps || []).length - Math.max(0, Math.floor(Number(bound) || 0)));
  if (over === 0 || !exportPrefs || exportPrefs.onSoftBound === 'off') return { victims: [], over, lines: [] };
  const staged = new Set(stageIds || []);
  const stamp = (k, key) => (Number.isFinite(k?.[key]) ? k[key] : null);
  const eligible = (keeps || []).filter(
    (k) =>
      k &&
      !staged.has(k.id) &&
      k.id !== performingKeepId &&
      !(sessionStartMs > 0 && (stamp(k, 'lastStagedAt') ?? -Infinity) >= sessionStartMs),
  );
  const byUnstaged = (a, b) =>
    (stamp(a, 'lastStagedAt') ?? -Infinity) - (stamp(b, 'lastStagedAt') ?? -Infinity) ||
    (stamp(a, 'keptAt') ?? -Infinity) - (stamp(b, 'keptAt') ?? -Infinity) ||
    (String(a.id) < String(b.id) ? -1 : 1);
  const victims = [...eligible].sort(byUnstaged).slice(0, over);
  const lines = [];
  if (victims.length < over) {
    lines.push(
      `over the soft bound with nothing more exportable — the stage and this session hold the other ${over - victims.length}`,
    );
  }
  return { victims, over, lines };
}

/**
 * The disk anchor account (§6 + audit S5): the Queen's anchor counts
 * disk keeps at full weight — when it can read them. `unread` names
 * the disk keeps whose records are not in hand (folder away, file
 * held): the anchor over the rest is PARTIAL, and the partiality is
 * spoken in the fill receipt and the dev readout — never silent.
 *   stubs:       { keepId: stub } — every keep whose home is a file
 *   diskRecords: { keepId: record } — the ones read this session
 *   inAppIds:    ids whose record lives in the store (fossils aside:
 *                an in-app keep is never a disk keep)
 */
export function anchorAccount({ stubs = {}, diskRecords = {}, inAppIds = new Set() } = {}) {
  const known = Object.keys(stubs || {}).filter((id) => !inAppIds.has(id));
  const unread = known.filter((id) => !(diskRecords || {})[id]);
  return { known: known.length, loaded: known.length - unread.length, unread, partial: unread.length > 0 };
}

/**
 * One disk stub: what the collection listing shows for a keep whose
 * record lives in a file — the row's display fields, copied off the
 * shelf row at export/read time, so a missing file still lists (marked
 * missing, said out loud) and a disconnected folder still shows its
 * shelf. An INDEX, not a record: the record itself lives only in the
 * file, and a stub can never be promoted, loaded, or trained on.
 */
export function diskStubFor(row, rel) {
  if (!row || typeof row.id !== 'string' || !row.id) return null;
  return {
    id: row.id,
    rel: typeof rel === 'string' ? rel : '',
    label: typeof row.label === 'string' ? row.label : '',
    mode: typeof row.mode === 'string' ? row.mode : '',
    paletteId: typeof row.paletteId === 'string' ? row.paletteId : '',
    families: Array.isArray(row.families) ? row.families.filter((f) => typeof f === 'string').slice(0, 12) : [],
    origin: typeof row.origin === 'string' ? row.origin : '',
    corner: typeof row.corner === 'string' ? row.corner : '',
    keptAt: Number.isFinite(row.keptAt) ? row.keptAt : null,
    stagedCount: Number.isFinite(row.stagedCount) ? row.stagedCount : null,
    lastStagedAt: Number.isFinite(row.lastStagedAt) ? row.lastStagedAt : null,
    missing: false,
  };
}

const stubStr = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const stubNum = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : null);

/** Sanitize one persisted stub; junk drops whole, never repairs. */
export function sanitizeDiskStub(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.id !== 'string' || !KEEP_ID.test(raw.id)) return null;
  const rel = typeof raw.rel === 'string' ? raw.rel : '';
  if (keepIdFromLookRel(rel) !== raw.id) return null; // the stub must name its own file
  return {
    id: raw.id,
    rel,
    label: stubStr(raw.label, 160),
    mode: stubStr(raw.mode, 80),
    paletteId: stubStr(raw.paletteId, 80),
    families: Array.isArray(raw.families)
      ? raw.families
          .filter((f) => typeof f === 'string')
          .map((f) => f.slice(0, 40))
          .slice(0, 12)
      : [],
    origin: stubStr(raw.origin, 40),
    corner: stubStr(raw.corner, 40),
    keptAt: stubNum(raw.keptAt),
    stagedCount: Number.isFinite(raw.stagedCount) && raw.stagedCount >= 1 ? Math.floor(raw.stagedCount) : null,
    lastStagedAt: stubNum(raw.lastStagedAt),
    missing: raw.missing === true,
  };
}

/** The persisted stub index: { v, root, stubs } — this machine's diary
 * of what lives on its disk, bound to one loot root (a different
 * folder is a different shelf). Sanitized whole, like every kc: key. */
export function sanitizeDiskIndex(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1) return { v: 1, root: null, stubs: {} };
  const stubs = {};
  const entries =
    raw.stubs && typeof raw.stubs === 'object' && !Array.isArray(raw.stubs) ? Object.entries(raw.stubs) : [];
  for (const [id, s] of entries) {
    const clean = sanitizeDiskStub(s);
    if (clean && clean.id === id) stubs[id] = clean;
  }
  return { v: 1, root: typeof raw.root === 'string' && raw.root ? raw.root.slice(0, 1024) : null, stubs };
}
