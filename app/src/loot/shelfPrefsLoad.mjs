// shelfPrefsLoad — Keeps K2 (#1590): the loot read path for
// preferences.json (spec §5).
//
// The document lives at the loot ROOT (beside loot.json — the #1479
// layout: root files outside the four subfolders are the folder's own
// papers, and preferences.json is the shelf's). This loader reads it
// through the loot backend, hands the text to the pure parser
// (curator/shelfPrefs.mjs), and returns what the store applies:
// { prefs, source, lines }. The loot surface calls it on launch (when
// a root is already indexed) and after every rescan — edits take
// effect on the NEXT fill, never mid-fill.
//
// Named gap, narrowed by K3 (#1591): the loot write verb EXISTS now
// (the backends' write(), built for the keeps exports into looks/),
// but writing the defaults document (curator/shelfPrefs.mjs
// DEFAULT_PREFERENCES_TEXT) into a fresh folder is still not wired —
// a missing preferences.json is READ as "shipped defaults in force"
// (the parser's line says so) until a first-setup write is dispatched
// as its own step. Nothing here invents one silently. The iCloud
// conflict copy is never read (S6); when a scan sees one, its name
// is spoken in the lines.
//
// K3: the same document's `shelf.export` namespace is parsed here too
// (curator/shelfDisk.mjs parseShelfExportPrefs) and returned as
// exportPrefs, its corrections folded into the lines after the main
// parser's — one file, one set of named corrections.

import {
  parseShelfPrefs, isConflictCopyName, conflictCopyLine,
} from '../curator/shelfPrefs.mjs';
import { parseShelfExportPrefs } from '../curator/shelfDisk.mjs';

export const PREFERENCES_REL = 'preferences.json';

/**
 * @param {{ backend, root, rels? }} args
 *   backend: a loot backend (loot/lootBackend.mjs) — read(root, rel)
 *   root:    the loot root path/label from the index ('' = no folder)
 *   rels:    relative paths the index/scan knows, for the conflict
 *            copy check (optional; root-level names are what matter)
 */
export async function loadShelfPrefs({ backend, root, rels = [] } = {}) {
  const lines = [];
  for (const rel of (Array.isArray(rels) ? rels : [])) {
    const name = String(rel || '').split('/').pop();
    if (name && isConflictCopyName(name)) lines.push(conflictCopyLine(name));
  }
  if (!root || !backend || typeof backend.read !== 'function'
    || (typeof backend.unavailable === 'function' && backend.unavailable())) {
    // No folder (or no readable backend): shipped defaults, and —
    // with no folder connected — nothing to say anywhere visible.
    const parsed = parseShelfPrefs(null);
    const exp = parseShelfExportPrefs(null);
    return { prefs: parsed.prefs, exportPrefs: exp.exportPrefs, source: 'default', lines };
  }
  let text = null;
  try {
    const read = await backend.read(root, PREFERENCES_REL);
    if (read && read.ok && read.bytes) text = new TextDecoder().decode(read.bytes);
  } catch { /* unreadable reads as missing — the parser names it */ }
  const parsed = parseShelfPrefs(text);
  const exp = parseShelfExportPrefs(text);
  return {
    prefs: parsed.prefs, exportPrefs: exp.exportPrefs, source: parsed.source,
    lines: [...lines, ...parsed.lines, ...exp.lines],
  };
}
