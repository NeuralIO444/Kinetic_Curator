// banks.mjs — MIDI banks (#1720): named sets of bindings, one active at a time.
//
// A bank is { name, map } where map is a midi/map.mjs mapping table. The bank
// list lives in the project document next to the legacy `midiMap` field and
// goes through the same trust boundary: every map inside a bank is sanitized
// by sanitizeMidiMap, names are trimmed to a deadpan length, duplicate names
// are dropped (first wins — the panel names banks, it never shows two alike),
// and the count is capped so a hostile document cannot bloat the store.
//
// Backward shape: a document written before banks carries only `midiMap`;
// that becomes the single MAIN bank. When both fields are present the bank
// list wins and `midiMap` is ignored on read — and the ACTIVE bank's map is
// what `midiMap` means everywhere else in the app (the store mirrors it), so
// the engine, the monitor and the exporters never learn what a bank is.
import { sanitizeMidiMap } from './map.mjs';
import { describeKey } from './message.mjs';
import { getMidiTarget } from './targets.mjs';

export const DEFAULT_BANK_NAME = 'MAIN';
export const MAX_BANKS = 8;
export const MAX_BANK_NAME = 24;

const fallbackName = (i) => (i === 0 ? DEFAULT_BANK_NAME : `BANK ${i + 1}`);

/** A bank name as it may be stored: trimmed, capped, never empty. */
export function sanitizeBankName(raw, fallback = DEFAULT_BANK_NAME) {
  if (typeof raw !== 'string') return fallback;
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_BANK_NAME).trim();
  return name || fallback;
}

/**
 * The bank list of a project, from either document shape.
 * @returns {Array<{name: string, map: Object<string,string>}>} always ≥ 1 bank
 */
export function sanitizeMidiBanks(rawBanks, legacyMap) {
  if (Array.isArray(rawBanks)) {
    const out = [];
    const seen = new Set();
    for (const entry of rawBanks) {
      if (out.length >= MAX_BANKS) break;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const name = sanitizeBankName(entry.name, fallbackName(out.length));
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({ name, map: sanitizeMidiMap(entry.map) });
    }
    if (out.length) return out;
  }
  return [{ name: DEFAULT_BANK_NAME, map: sanitizeMidiMap(legacyMap) }];
}

/** The active bank index: an integer naming an existing bank, else 0. */
export function sanitizeMidiActiveBank(raw, banks) {
  const n = Array.isArray(banks) ? banks.length : 0;
  return Number.isInteger(raw) && raw >= 0 && raw < n ? raw : 0;
}

/** The map the instrument plays right now. */
export function activeBankMap(banks, active) {
  const bank = Array.isArray(banks) ? banks[sanitizeMidiActiveBank(active, banks)] : null;
  return bank ? bank.map : {};
}

/** The name a new bank gets: the first free BANK n (or MAIN when the list is empty). */
export function nextBankName(banks) {
  const used = new Set((banks || []).map((b) => b.name));
  let i = banks ? banks.length : 0;
  while (used.has(fallbackName(i))) i++;
  return fallbackName(i);
}

/** Append an empty bank. Returns the same list when the cap is reached. */
export function addBank(banks, name) {
  const list = Array.isArray(banks) ? banks : [];
  if (list.length >= MAX_BANKS) return banks;
  const bankName = sanitizeBankName(name, nextBankName(list));
  if (list.some((b) => b.name === bankName)) return banks;
  return [...list, { name: bankName, map: {} }];
}

/** Drop a bank. The last bank is never dropped — there is always an active map. */
export function removeBank(banks, index) {
  if (!Array.isArray(banks) || banks.length <= 1) return banks;
  if (!Number.isInteger(index) || index < 0 || index >= banks.length) return banks;
  return banks.filter((_, i) => i !== index);
}

/** Rename a bank. Empty names and names another bank already carries are refused. */
export function renameBank(banks, index, rawName) {
  if (!Array.isArray(banks) || !banks[index]) return banks;
  const name = sanitizeBankName(rawName, '');
  if (!name) return banks;
  if (banks.some((b, i) => i !== index && b.name === name)) return banks;
  return banks.map((b, i) => (i === index ? { ...b, name } : b));
}

/** Replace one bank's map (the slice's binding edits land here). */
export function withBankMap(banks, index, map) {
  if (!Array.isArray(banks) || !banks[index]) return banks;
  return banks.map((b, i) => (i === index ? { ...b, map } : b));
}

const KEY_PARTS = /^(note|cc):(\d+):(\d+)$/;
/**
 * The key legend: the active bank's bindings BY KEY, in the order a hand
 * meets them — channel, then notes before CCs, then number. Rows carry the
 * registry label; an id the registry no longer knows reads as itself
 * (a sanitized map cannot contain one, but the legend never hides a row).
 * @returns {Array<{key: string, keyLabel: string, targetId: string, label: string}>}
 */
export function legendEntries(map) {
  const rows = [];
  for (const [key, targetId] of Object.entries(map || {})) {
    const m = KEY_PARTS.exec(key);
    if (!m) continue;
    rows.push({
      key,
      keyLabel: describeKey(key),
      targetId,
      label: getMidiTarget(targetId)?.label || targetId,
      ch: Number(m[2]),
      kind: m[1] === 'note' ? 0 : 1,
      num: Number(m[3]),
    });
  }
  rows.sort((a, b) => a.ch - b.ch || a.kind - b.kind || a.num - b.num);
  return rows.map(({ key, keyLabel, targetId, label }) => ({ key, keyLabel, targetId, label }));
}
