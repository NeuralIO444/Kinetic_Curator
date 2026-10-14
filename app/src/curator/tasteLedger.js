// tasteLedger.js — #1173: the taste flywheel's two ledgers.
//
// Every deliberate keep (F, the DAVIS star, J, a crowned dice roll) appends
// one line to keeps.jsonl; every deliberate pass (X) appends one line to
// passes.jsonl. `studio/mlx_run.py --phase 1 --ledgers <dir>` reads them
// directly: keeps are positives, passes are negatives. No HITS export step.
//
// Rules (KC-1 DS):
// - Honest signals only: a line exists only because the artist pressed a key.
//   Nothing here is inferred from dwell or attention.
// - Append-only JSONL, human-readable, one record per line.
// - Labels only. Nothing in the app reads these back to steer rendering —
//   live taste stays gated (#762 / Phase 4, #1356).
// - Local-first: localStorage always; in the desktop app, also mirrored to
//   $APPDATA/ledgers/<kind>.jsonl. No cloud, no account.
import { normalizeSeedOffsets } from '../engine/kernel/rng.js';
import { sanitizeKeepContext } from './keepContext.js';
import { sanitizeProvenance, isProvenance } from './provenance.mjs';

export const LEDGER_KINDS = Object.freeze(['keeps', 'passes']);
export const LEDGER_STORAGE_KEYS = Object.freeze({
  keeps: 'kc:ledger:keeps:v1',
  passes: 'kc:ledger:passes:v1',
});
export const LEDGER_FILES = Object.freeze({ keeps: 'keeps.jsonl', passes: 'passes.jsonl' });
export const LEDGER_DIR = 'ledgers';

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * One ledger line from a captured record (captureFavorite's shape, already
 * sanitized). Shape, keeps and passes alike:
 *   { seed, recipe: { layoutParams, paletteId, seedOffsets?, assets? },
 *     timestamp, keepContext, projectRef, provenance? (#1507) }
 * Absent stays absent: no offsets/cast are invented for legacy shapes;
 * keepContext and projectRef are null when unknown. Null on a record with no
 * usable seed or no timestamp — a line that can't be rendered is not a label.
 */
export function ledgerRow(rec, projectRef) {
  if (!isPlainObject(rec)) return null;
  const seed = Number(rec.seed);
  if (!Number.isFinite(seed)) return null;
  const layout = rec.config?.layout;
  const paletteId = rec.config?.palette?.id;
  const assets = rec.config?.assets;
  const ref = typeof projectRef === 'string' ? projectRef.trim().slice(0, 80) : '';
  // Every keep door stamps the moment; a record without one is not invented a time.
  if (typeof rec.timestamp !== 'string' || !rec.timestamp) return null;
  // #1507 — a mined record's provenance rides into the ledger line too: a
  // pass on a mined render is a judgment WITH its origin, or it is a
  // weaker label than the ledger promises. Absent stays absent.
  const provenance = sanitizeProvenance(rec.provenance);
  return {
    seed: seed >>> 0,
    recipe: {
      layoutParams: isPlainObject(layout) ? { ...layout } : null,
      paletteId: typeof paletteId === 'string' && paletteId ? paletteId : null,
      ...(isPlainObject(rec.seedOffsets) ? { seedOffsets: normalizeSeedOffsets(rec.seedOffsets) } : {}),
      ...(Array.isArray(assets) && assets.length ? { assets: [...assets] } : {}),
    },
    timestamp: rec.timestamp,
    keepContext: sanitizeKeepContext(rec.context) ?? null,
    projectRef: ref || null,
    ...(provenance ? { provenance } : {}),
  };
}

/** The schema check selfcheck asserts and the reader applies to every line. */
export function isLedgerRow(o) {
  if (!isPlainObject(o)) return false;
  if (!Number.isInteger(o.seed) || o.seed < 0 || o.seed > 0xffffffff) return false;
  if (!isPlainObject(o.recipe)) return false;
  if (!('layoutParams' in o.recipe) || !('paletteId' in o.recipe)) return false;
  if (o.recipe.layoutParams !== null && !isPlainObject(o.recipe.layoutParams)) return false;
  if (o.recipe.paletteId !== null && typeof o.recipe.paletteId !== 'string') return false;
  if (typeof o.timestamp !== 'string' || !o.timestamp) return false;
  if (!('keepContext' in o) || (o.keepContext !== null && !isPlainObject(o.keepContext))) return false;
  if (!('projectRef' in o) || (o.projectRef !== null && typeof o.projectRef !== 'string')) return false;
  // #1507 — provenance is optional (legacy lines carry none) but, when a
  // line claims one, it must be a real one.
  if ('provenance' in o && !isProvenance(o.provenance)) return false;
  return true;
}

/** One JSONL line, newline-terminated. */
export function serializeRow(row) {
  return `${JSON.stringify(row)}\n`;
}

/**
 * Parse ledger text. A corrupt or off-schema line is skipped WITH a warning
 * (line number + reason) — never a silent drop. Blank lines are not lines.
 */
export function parseLedger(text, warn = (m) => console.warn(m)) {
  const rows = [];
  let skipped = 0;
  String(text ?? '').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      skipped++;
      warn(`[ledger] line ${i + 1}: not JSON — skipped`);
      return;
    }
    if (!isLedgerRow(o)) {
      skipped++;
      warn(`[ledger] line ${i + 1}: not a ledger row — skipped`);
      return;
    }
    rows.push(o);
  });
  return { rows, skipped };
}

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** The raw JSONL text of one ledger (empty when nothing is kept yet). */
export function readLedgerText(kind, storage = defaultStorage()) {
  if (!LEDGER_KINDS.includes(kind) || !storage) return '';
  try {
    return storage.getItem(LEDGER_STORAGE_KEYS[kind]) || '';
  } catch {
    return '';
  }
}

/** Line counts for the PIPELINE readout. */
export function ledgerCounts(storage = defaultStorage()) {
  const count = (kind) => readLedgerText(kind, storage).split('\n').filter((l) => l.trim()).length;
  return { keeps: count('keeps'), passes: count('passes') };
}

const isTauri = () => typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

/** Desktop mirror: append the same line to $APPDATA/ledgers/<kind>.jsonl. */
async function appendToAppData(kind, line) {
  const { BaseDirectory, createDir, writeTextFile } = await import('@tauri-apps/api/fs');
  await createDir(LEDGER_DIR, { dir: BaseDirectory.AppData, recursive: true });
  await writeTextFile(`${LEDGER_DIR}/${LEDGER_FILES[kind]}`, line, { dir: BaseDirectory.AppData, append: true });
}

/**
 * Append one record to a ledger. Returns the row written, or null when the
 * record has no usable seed. A storage failure is reported, never swallowed.
 * `opts.storage` / `opts.fileSink` are for selfcheck; the app uses defaults.
 */
export function appendToLedger(kind, rec, projectRef, opts = {}) {
  if (!LEDGER_KINDS.includes(kind)) throw new Error(`unknown ledger: ${kind}`);
  const row = ledgerRow(rec, projectRef);
  if (!row) return null;
  const line = serializeRow(row);
  const storage = 'storage' in opts ? opts.storage : defaultStorage();
  const warn = opts.warn || ((m, e) => console.warn(m, e));
  if (storage) {
    try {
      const key = LEDGER_STORAGE_KEYS[kind];
      storage.setItem(key, (storage.getItem(key) || '') + line);
    } catch (e) {
      warn(`[ledger] ${kind}: local save failed — export the ledgers from PIPELINE`, e);
    }
  }
  const sink = 'fileSink' in opts ? opts.fileSink : (isTauri() ? appendToAppData : null);
  if (sink) {
    Promise.resolve()
      .then(() => sink(kind, line))
      .catch((e) => warn(`[ledger] ${kind}: desktop file append failed`, e));
  }
  return row;
}

/** Download both ledgers as plain .jsonl files (PIPELINE → ↓ LEDGERS). */
export function downloadLedgers(storage = defaultStorage()) {
  for (const kind of LEDGER_KINDS) {
    const blob = new Blob([readLedgerText(kind, storage)], { type: 'application/x-ndjson' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = LEDGER_FILES[kind];
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
}
