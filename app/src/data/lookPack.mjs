// lookPack.mjs — #2148 step 1 (the DLC Look phase's pipeline loader, docs/DLC_PRESET_TYPES.md §2): the pure half of
// installing Looks. Text or value in, verdict out; no UI, no store, no storage.
//
// What a file may be (the IMPORT row sniffs these through `sniffLookFile`):
//   - one `kc-look/1` preset (a `.kclook` file or pasted JSON), or
//   - a `kc-pack/1` container of Looks: { format: 'kc-pack/1', kind: 'looks', name, author, version, items: [...] }
//     (the DLC spec §1 shape, scoped to Looks — the voices / styles / variants kinds are separate calls).
//
// Each item is read by the kc-look/1 type itself (data/lookPreset.mjs), so the type's rules hold here unchanged: unknown
// formats are refused by name, unknown fields ignored, out-of-range values clamped, cross-scope fields stripped, hostile
// JSON refused. An item that does not read is QUARANTINED with its name and the reason — it is never installed, never
// repaired — and does not stop the items that do read. `name` is pack metadata (the preset type carries none), read here
// from the item wrapper and clamped.
//
// Installing never touches slots: it merges into the Library, deduped by content, capped.
import { parseLookPreset, writeLookPreset, sniffLookFormat } from './lookPreset.mjs';

export const KC_PACK_FORMAT = 'kc-pack';
export const KC_PACK_VERSION = 1;
export const PACK_KIND_LOOKS = 'looks';
/** A pack may carry this many items; the rest are refused (a hostile file cannot flood the Library). */
export const MAX_PACK_ITEMS = 200;
/** The Library holds this many Looks; an install that would pass it installs what fits and says so. */
export const LOOK_LIBRARY_MAX = 200;
export const MAX_NAME = 40;
/** Pasted / dropped text bigger than this is refused unread (a Look is a few hundred bytes). */
export const MAX_PACK_BYTES = 2 * 1024 * 1024;

const PACK_RE = /^kc-pack\/(\d{1,6})$/;
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const cleanName = (v) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, MAX_NAME)
    : '';

/** Which version of the pack container a value claims, or null. */
export function sniffPackFormat(value) {
  if (!isObj(value) || typeof value.format !== 'string') return null;
  const m = PACK_RE.exec(value.format);
  return m ? Number(m[1]) : null;
}

/**
 * What a parsed value claims to be for the Look loader: 'look' (a kc-look/N preset), 'pack' (a kc-pack/N container), or null
 * (not ours — the IMPORT row's other kinds go on). Sniffing is not validation.
 */
export function sniffLookFile(value) {
  if (sniffLookFormat(value) !== null) return 'look';
  if (sniffPackFormat(value) !== null) return 'pack';
  return null;
}

/** A stable content id: the same Look always gets the same id, so installing it twice is one entry. */
export function lookId(look) {
  // canonical: the layout params in key order, so the same Look written in any key order is one entry
  const lp = JSON.parse(writeLookPreset(look));
  lp.layoutParams = Object.fromEntries(
    Object.keys(lp.layoutParams)
      .sort()
      .map((k) => [k, lp.layoutParams[k]]),
  );
  const text = JSON.stringify(lp);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0xdeadbeef;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
  }
  return `look:${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

const label = (rawItem, index) => cleanName(isObj(rawItem) ? rawItem.name : '') || `item ${index + 1}`;

/**
 * Read a Look file: one kc-look/1 preset or a kc-pack/1 container of Looks. Never throws.
 * @param input JSON text or an already-parsed value
 * @returns {{ ok: true, pack: string, author: string, items: { id, name, look }[], quarantined: { index, name, error }[] }
 *         | { ok: false, error: string }}
 *   `items` are the Looks that read, each with its content id; `quarantined` names every one that did not and why.
 */
export function parseLookFile(input) {
  let raw = input;
  if (typeof input === 'string') {
    if (input.length > MAX_PACK_BYTES) return { ok: false, error: 'that file is too large to be a Look pack' };
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { ok: false, error: `not readable as a Look file (${e.message})` };
    }
  }
  const kind = sniffLookFile(raw);
  if (kind === null) {
    const claimed = isObj(raw) && typeof raw.format === 'string' ? raw.format : null;
    return { ok: false, error: claimed ? `unknown file format "${claimed.slice(0, 40)}"` : 'not a Look file' };
  }

  let rawItems;
  let pack = '';
  let author = '';
  if (kind === 'look') {
    rawItems = [raw];
  } else {
    const version = sniffPackFormat(raw);
    if (version > KC_PACK_VERSION) {
      return {
        ok: false,
        error: `made by a newer version of KC-1 (${KC_PACK_FORMAT}/${version}); this app reads up to ${KC_PACK_FORMAT}/${KC_PACK_VERSION}`,
      };
    }
    if (version < KC_PACK_VERSION) return { ok: false, error: `no migration from ${KC_PACK_FORMAT}/${version}` };
    if (raw.kind !== PACK_KIND_LOOKS) {
      return { ok: false, error: `this loader installs Look packs; this pack is "${String(raw.kind).slice(0, 20)}"` };
    }
    if (!Array.isArray(raw.items)) return { ok: false, error: 'a pack needs an items list' };
    pack = cleanName(raw.name);
    author = cleanName(raw.author);
    rawItems = raw.items;
  }

  const items = [];
  const quarantined = [];
  const seen = new Set();
  rawItems.forEach((it, index) => {
    if (index >= MAX_PACK_ITEMS) {
      if (index === MAX_PACK_ITEMS) {
        quarantined.push({
          index,
          name: label(it, index),
          error: `more than ${MAX_PACK_ITEMS} items; the rest were not read`,
        });
      }
      return;
    }
    const r = parseLookPreset(it);
    if (!r.ok) {
      quarantined.push({ index, name: label(it, index), error: r.error });
      return;
    }
    const id = lookId(r.look);
    if (seen.has(id)) return; // the same Look twice in one file is one Look
    seen.add(id);
    items.push({ id, name: cleanName(isObj(it) ? it.name : '') || pack || 'Look', look: r.look });
  });
  return { ok: true, pack, author, items, quarantined };
}

/**
 * Merge read items into a Library list. Pure: returns the new list and what happened.
 * Existing entries win (an installed Look is never overwritten or renamed by a pack); items past the cap are not installed.
 * @returns {{ library: entry[], added: number, duplicates: number, overflow: number }}
 */
export function installLooks(library, items, cap = LOOK_LIBRARY_MAX) {
  const out = Array.isArray(library) ? library.slice() : [];
  const have = new Set(out.map((e) => e.id));
  let added = 0;
  let duplicates = 0;
  let overflow = 0;
  for (const it of items || []) {
    if (have.has(it.id)) {
      duplicates++;
      continue;
    }
    if (out.length >= cap) {
      overflow++;
      continue;
    }
    out.push({ id: it.id, name: it.name, look: it.look });
    have.add(it.id);
    added++;
  }
  return { library: out, added, duplicates, overflow };
}

/** Accept only well-formed Library entries — the stored list is a trust boundary too. */
export function sanitizeLookLibrary(list, cap = LOOK_LIBRARY_MAX) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const e of list) {
    if (!isObj(e)) continue;
    const r = parseLookPreset(e.look);
    if (!r.ok) continue;
    const id = lookId(r.look);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: cleanName(e.name) || 'Look', look: r.look });
    if (out.length >= cap) break;
  }
  return out;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The quiet receipt: what installed, what was already there, what was quarantined (named).
 * @param read    the parseLookFile result
 * @param merged  the installLooks result
 */
export function lookReceipt(read, merged) {
  if (!read.ok) return `Look import: ${read.error}`;
  const head = read.pack ? `Look pack "${read.pack}"` : 'Look';
  const parts = [`${head} · ${plural(merged.added, 'Look', 'Looks')} installed to Library`];
  if (merged.duplicates) parts.push(`${merged.duplicates} already there`);
  if (merged.overflow) {
    parts.push(`${plural(merged.overflow, 'Look', 'Looks')} not installed — the Library is full (${LOOK_LIBRARY_MAX})`);
  }
  if (read.quarantined.length) {
    const named = read.quarantined
      .slice(0, 3)
      .map((q) => `${q.name}: ${q.error}`)
      .join('; ');
    const more = read.quarantined.length > 3 ? ` (+${read.quarantined.length - 3} more)` : '';
    parts.push(`${plural(read.quarantined.length, 'item', 'items')} quarantined — ${named}${more}`);
  }
  return parts.join(' · ');
}

/** Library entries out as one shareable pack: { format: 'kc-pack/1', kind: 'looks', name, author, version, items }. */
export function buildLookPack(entries, { name = 'Looks', author = '', version = 1 } = {}) {
  return {
    format: `${KC_PACK_FORMAT}/${KC_PACK_VERSION}`,
    kind: PACK_KIND_LOOKS,
    name: cleanName(name) || 'Looks',
    author: cleanName(author),
    version: Number.isInteger(version) && version > 0 ? version : 1,
    items: (entries || []).map((e) => ({ name: cleanName(e.name) || 'Look', ...JSON.parse(writeLookPreset(e.look)) })),
  };
}

/** The pack's file name. */
export const lookPackFilename = () => 'kc-looks.kcpack';
