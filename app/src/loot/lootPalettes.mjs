// lootPalettes.mjs — #1479 slice 7: the loot folder's palette files into the user palette library. Pure of the store: the
// caller injects how bytes are read and how palettes are imported, so a selfcheck drives the REAL sanitiser and the REAL
// library slice against a fake folder.
//
// A file may hold one palette ({ swatches: [...] }), a list of them, or { palettes: [...] }. Every palette goes through the
// library's own sanitizePalette (colours normalised, junk dropped); a file that yields none is refused with a reason.
//
// IDS: a loot palette's id is `loot-<slug>` (from the file's own `id`, else its name, else the file's name), so it can
// NEVER collide with a built-in palette or one the artist made: importUserPalettes lets a later entry win by id, and a
// file called `dusk.json` must not quietly replace the artist's own "dusk". The same file read again gives the same ids
// (nothing duplicates) and an edited file updates the palette it made (the folder is the source of truth for loot).
import { sanitizePalette } from '../state/slices/paletteLibrarySlice.js';
import { markTaken, addRows, sanitizeIndex } from './lootIndex.mjs';
import { slug } from './lootClassify.mjs';

export const MAX_PALETTE_BYTES = 256 * 1024;
export const MAX_PALETTES_PER_FILE = 64;
export const MAX_SWATCHES = 32;
const NAMES_SHOWN = 3;

const decode = (bytes) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; } };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The palette entries a parsed file holds, however it is shaped; never more than MAX_PALETTES_PER_FILE. */
export function entriesOf(parsed) {
  let list = [];
  if (Array.isArray(parsed)) list = parsed;
  else if (isObj(parsed) && Array.isArray(parsed.palettes)) list = parsed.palettes;
  else if (isObj(parsed) && Array.isArray(parsed.userPalettes)) list = parsed.userPalettes; // the app's own export shape
  else if (isObj(parsed)) list = [parsed];
  return list.filter(isObj).slice(0, MAX_PALETTES_PER_FILE);
}

/** One entry as a loot palette (the library's sanitiser, a swatch cap, and a namespaced id), or null. */
export function lootPalette(entry, fallbackName, index = 0) {
  if (!isObj(entry)) return null;
  const swatches = Array.isArray(entry.swatches) ? entry.swatches.slice(0, MAX_SWATCHES) : [];
  const clean = sanitizePalette({ ...entry, swatches, weights: swatches.length === (entry.swatches || []).length ? entry.weights : undefined });
  if (!clean) return null;
  const base = typeof entry.id === 'string' && entry.id ? entry.id : (typeof entry.name === 'string' && entry.name.trim() ? entry.name : `${fallbackName}-${index + 1}`);
  const id = `loot-${slug(base, 30)}`;
  return { ...clean, id, era: 'loot palette' };
}

/** Everything one file would add: { palettes, dropped }. Never throws. */
export function palettesFromText(text, fallbackName) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { palettes: [], dropped: 0, reason: 'not valid JSON' }; }
  const entries = entriesOf(parsed);
  if (entries.length === 0) return { palettes: [], dropped: 0, reason: 'no palettes in file' };
  const out = new Map();
  let dropped = 0;
  entries.forEach((e, i) => {
    const p = lootPalette(e, fallbackName, i);
    if (p) out.set(p.id, p); else dropped += 1;
  });
  if (out.size === 0) return { palettes: [], dropped, reason: 'no usable swatches in file' };
  return { palettes: [...out.values()], dropped };
}

/**
 * @param native  { read(root, rel) -> { ok, bytes } | { ok:false, reason } }
 * @param index   the loot index
 * @param importPalettes (list) => void   the library's importUserPalettes
 * @returns { index, summary: { files, palettes, rejected, unreadable } }
 */
export async function takeInPalettes({ native, index, importPalettes }) {
  let ix = sanitizeIndex(index);
  const todo = Object.entries(ix.items)
    .filter(([, it]) => it.kind === 'palette' && it.state === 'ok' && !it.ingested && !it.hold)
    .sort((a, b) => (a[1].rel < b[1].rel ? -1 : 1));
  const summary = { files: 0, palettes: 0, rejected: 0, unreadable: 0 };
  const rows = [];
  const hold = (id, rel, reason, kind) => { rows.push({ rel, kind: 'palette', outcome: 'rejected', reason }); ix = markTaken(ix, id, { status: 'held', reason }); summary[kind] += 1; };
  for (const [id, it] of todo) {
    const read = await native.read(ix.root, it.rel);
    if (!read.ok) { hold(id, it.rel, `unreadable: ${read.reason}`, 'unreadable'); continue; }
    if (read.bytes.length === 0) { hold(id, it.rel, 'empty file', 'rejected'); continue; }
    if (read.bytes.length > MAX_PALETTE_BYTES) { hold(id, it.rel, 'too big for a palette file', 'rejected'); continue; }
    const text = decode(read.bytes);
    if (text === null) { hold(id, it.rel, 'not text', 'rejected'); continue; }
    const stem = it.rel.split('/').pop().replace(/\.[^.]+$/, '');
    const r = palettesFromText(text, stem);
    if (r.palettes.length === 0) { hold(id, it.rel, r.reason, 'rejected'); continue; }
    try { importPalettes(r.palettes); } catch (e) { hold(id, it.rel, `refused: ${String((e && e.message) || e).slice(0, 80)}`, 'rejected'); continue; }
    summary.files += 1; summary.palettes += r.palettes.length;
    const names = r.palettes.slice(0, NAMES_SHOWN).map((p) => p.name).join(', ') + (r.palettes.length > NAMES_SHOWN ? ', ...' : '');
    const note = `${r.palettes.length} palette${r.palettes.length === 1 ? '' : 's'} in your library: ${names}${r.dropped ? ` (${r.dropped} unusable skipped)` : ''}`;
    rows.push({ rel: it.rel, kind: 'palette', outcome: 'taken-in', reason: note.slice(0, 120) });
    ix = markTaken(ix, id, { status: 'taken', assetId: null });
  }
  return { index: addRows(ix, rows.reverse()), summary };
}
