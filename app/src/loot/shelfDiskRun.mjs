// shelfDiskRun.mjs — #1591 (Keeps K3): the disk tier's IO glue — the
// loot lane's half of the shelf's third tier. The pure law lives in
// curator/shelfDisk.mjs (the planner, the file contract) and the
// store moves live in davisSlice; this file is what touches the
// folder:
//
//   takeInLooks     — read looks/*.json files the scan found into
//                     disk records + stubs (the take-in pattern of
//                     lootIngest.mjs, for keeps instead of assets);
//   applyShelfDiskScan — fold one scan's verdict (which keep files
//                     are present, which are gone) into the store;
//   runShelfExports — when the collection stands past its soft
//                     bound, write the planner's victims to the
//                     folder, read each file back whole, and only
//                     then move the record (Law 1: an export is
//                     spoken, verified, and reversible — the record
//                     is never dropped on a write's say-so).
//
// A keep file whose keep is IN-APP is a fossil: the take-in marks it
// taken and never reads it into a second record — a keep's record
// has exactly one writable home (the store XOR the file), and the
// store wins while the keep is a resident.

import { shelfRow } from '../curator/shelf.mjs';
import {
  planExports,
  diskStubFor,
  parseExportDocument,
  serializeExport,
  exportRelFor,
  keepIdFromLookRel,
  DEFAULT_EXPORT_PREFS,
} from '../curator/shelfDisk.mjs';
import { DEFAULT_SHELF_PREFS } from '../curator/shelfPrefs.mjs';
import { markTaken, addRows } from './lootIndex.mjs';

/**
 * Read the folder's keeps into disk records. Mirrors takeInImages'
 * contract: returns the (possibly advanced) index, the records read
 * (raw export docs keyed by keep id — the store sanitizes at its
 * door), the stubs built for them, and a summary. Files that are not
 * keeps exports (or name a different keep than their filename) are
 * HELD with the reason in the log — never dropped silently, never
 * guessed at. A file that cannot be read this pass is left unmarked:
 * a later scan retries (an iCloud placeholder is not a verdict).
 *
 * `isInApp(keepId)` / `isLoaded(keepId)` read the store: an in-app
 * keep's file is its fossil copy (marked taken unread), and a record
 * already in hand is re-read only when its bytes changed.
 */
export async function takeInLooks({ backend, index, isInApp, isLoaded, assetsById = null, palettesById = null } = {}) {
  let ix = index;
  const records = {};
  const stubs = {};
  const rows = [];
  const summary = { takenIn: 0, held: 0 };
  if (!backend || typeof backend.read !== 'function' || !ix || !ix.root) {
    return { index: ix, records, stubs, summary };
  }
  const entries = Object.entries(ix.items || {})
    .filter(([, it]) => it && it.kind === 'look' && it.state === 'ok')
    .sort((a, b) => (a[1].rel < b[1].rel ? -1 : a[1].rel > b[1].rel ? 1 : 0));
  for (const [id, it] of entries) {
    const keepId = keepIdFromLookRel(it.rel);
    if (!keepId) {
      if (it.ingested || it.hold) continue;
      summary.held += 1;
      rows.push({ rel: it.rel, kind: 'look', outcome: 'rejected', reason: 'not a keeps export — left as found' });
      ix = markTaken(ix, id, { status: 'held', reason: 'not a keeps export — left as found' });
      continue;
    }
    if (typeof isInApp === 'function' && isInApp(keepId)) {
      if (it.ingested) continue;
      // The keep's own file: an archival copy of a shelf resident.
      // Marked taken, never read into a second record.
      ix = markTaken(ix, id, { status: 'taken' });
      rows.push({
        rel: it.rel,
        kind: 'look',
        outcome: 'taken-in',
        reason: 'a keep already on the shelf — its disk copy, unchanged',
      });
      continue;
    }
    if (it.ingested && typeof isLoaded === 'function' && isLoaded(keepId)) continue; // in hand, unchanged
    let read = null;
    try {
      read = await backend.read(ix.root, it.rel);
    } catch {
      read = null;
    }
    if (!read || !read.ok || !read.bytes) continue; // unreadable this pass — unmarked, retried next scan
    const parsed = parseExportDocument(new TextDecoder().decode(read.bytes));
    if (!parsed || parsed.keep.id !== keepId) {
      if (it.ingested) continue; // changed into something else — the record in hand stands
      summary.held += 1;
      const why = parsed ? 'the file names a different keep — left as found' : 'not a keeps export — left as found';
      rows.push({ rel: it.rel, kind: 'look', outcome: 'rejected', reason: why });
      ix = markTaken(ix, id, { status: 'held', reason: why });
      continue;
    }
    records[keepId] = parsed.keep;
    stubs[keepId] = diskStubFor(shelfRow(parsed.keep, [], { assetsById, palettesById }), it.rel);
    ix = markTaken(ix, id, { status: 'taken' });
    rows.push({ rel: it.rel, kind: 'look', outcome: 'taken-in', reason: 'on the shelf — disk tier' });
    summary.takenIn += 1;
  }
  return { index: addRows(ix, rows.reverse()), records, stubs, summary };
}

/**
 * Fold one scan into the store's disk tier: which keep files are
 * present, which are gone (a gone file marks its stub missing — the
 * listing says so, #1479 slice-9 behaviour), and the records the
 * take-in just read. `get` is the store's getState; the store action
 * owns the laws (fossils, root changes, persistence).
 */
export function applyShelfDiskScan(
  get,
  { root = null, connected = false, index = null, records = {}, freshStubs = {} } = {},
) {
  const present = [];
  const missingIds = [];
  for (const it of Object.values(index?.items || {})) {
    if (!it || it.kind !== 'look') continue;
    const keepId = keepIdFromLookRel(it.rel);
    if (!keepId) continue;
    if (it.state === 'ok') present.push({ keepId, rel: it.rel });
    else if (it.state === 'missing') missingIds.push(keepId);
  }
  get().setShelfDiskScan({ root, connected, records, freshStubs, present, missingIds });
}

/**
 * Run the overflow exports against the connected folder. Guards:
 * a writable backend, a folder the store counts as connected, and
 * the export preference on. Each victim: write the file, read it
 * back, verify it parses to the same keep — only then does the
 * store move the record (davisSlice.shelfExported, which speaks
 * the line). A failed write or a bad read-back stops the run with
 * the reason on the shelf's line and every un-moved keep still in
 * the collection: nothing is half-moved, nothing is silent.
 */
export async function runShelfExports(
  get,
  { backend, root, sessionStartMs = 0, assetsById = null, palettesById = null } = {},
) {
  const exported = [];
  const st = typeof get === 'function' ? get() : null;
  if (!st || !backend || typeof backend.write !== 'function' || !root || !st.shelfDiskConnected) {
    return { exported, stopped: null };
  }
  const xp = st.shelfExportPrefs || DEFAULT_EXPORT_PREFS;
  if (xp.onSoftBound !== 'export') return { exported, stopped: null };
  const bound = (st.shelfPrefs || DEFAULT_SHELF_PREFS).collectionSoftBound;
  for (let guard = 0; guard < 1000; guard += 1) {
    const cur = get();
    const plan = planExports({
      keeps: cur.keeps || [],
      stageIds: cur.keepStage || [],
      bound,
      exportPrefs: xp,
      sessionStartMs,
      performingKeepId: cur.performingKeepId || null,
    });
    const victim = plan.victims[0];
    if (!victim) break;
    const rel = exportRelFor(victim.id, xp.folder);
    const row = shelfRow(victim, cur.keepStage || [], { assetsById, palettesById });
    let w = null;
    try {
      w = await backend.write(root, rel, new TextEncoder().encode(serializeExport(victim, xp)));
    } catch {
      w = null;
    }
    if (!w || !w.ok) {
      cur.setShelfNotice(
        `export stopped — ${(w && w.reason) || 'the folder would not take the file'}; ${row.label} stayed in the collection`,
      );
      return { exported, stopped: victim.id };
    }
    let back = null;
    try {
      back = await backend.read(root, rel);
    } catch {
      back = null;
    }
    const parsed = back && back.ok && back.bytes ? parseExportDocument(new TextDecoder().decode(back.bytes)) : null;
    if (!parsed || parsed.keep.id !== victim.id) {
      cur.setShelfNotice(
        `export stopped — the file for ${row.label} did not read back whole; it stayed in the collection`,
      );
      return { exported, stopped: victim.id };
    }
    cur.shelfExported(victim.id, diskStubFor(row, rel));
    exported.push(victim.id);
  }
  if (exported.length > 1) {
    get().setShelfNotice(
      `exported ${exported.length} keeps to the loot folder — the collection is back at its soft bound`,
    );
  }
  return { exported, stopped: null };
}
