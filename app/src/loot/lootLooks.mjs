// lootLooks.mjs — #2148 step 4 (slice 10): Look files in the loot folder's looks/ join the Look Library through the SAME door as
// Pipeline IMPORT (installLookFile → parseLookFile → kc-look/1). Pure of the store: the caller injects how bytes are read and how a
// Look file is installed, so a selfcheck drives the real parser and the real Library against a fake folder.
//
// Which files: `.kclook` (one Look) and `.kcpack` (a kc-pack/1 of Looks) in looks/. The shelf's own `.json` keep exports in the same
// folder are NOT these — shelfDiskRun owns them and never sees a Look file (takeInLooks skips these extensions).
//
// What it does: installs into the LIBRARY only. A dropped file never fills a slot and never touches the scene (loading from the
// Library into a slot stays the explicit LOAD). A file that does not read is HELD with the reason in the log, named, never half-
// installed. A file is read once: a Look you later remove from the Library does not come back on the next scan (the same file,
// unchanged, is already taken); an edited file is read again and installs by content, so the old Look stays unless you remove it.
import { markTaken, addRows, sanitizeIndex } from './lootIndex.mjs';
import { MAX_PACK_BYTES, lookReceipt } from '../data/lookPack.mjs';

/** A looks/ file this module owns (a Look file, not a shelf keep export). */
export const isLookFileRel = (rel) => typeof rel === 'string' && /\.(kclook|kcpack)$/i.test(rel);

const decode = (bytes) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

/**
 * @param native       { read(root, rel) -> { ok, bytes } | { ok:false, reason } }
 * @param index        the loot index
 * @param installLookFile (text) => { read, merged }   the store's installLookFile
 * @returns { index, summary: { files, looks, rejected, unreadable } }
 */
export async function takeInLookFiles({ native, index, installLookFile }) {
  let ix = sanitizeIndex(index);
  const todo = Object.entries(ix.items)
    .filter(([, it]) => it.kind === 'look' && it.state === 'ok' && !it.ingested && !it.hold && isLookFileRel(it.rel))
    .sort((a, b) => (a[1].rel < b[1].rel ? -1 : 1));
  const summary = { files: 0, looks: 0, rejected: 0, unreadable: 0 };
  const rows = [];
  const hold = (id, rel, reason, kind) => {
    rows.push({ rel, kind: 'look', outcome: 'rejected', reason });
    ix = markTaken(ix, id, { status: 'held', reason });
    summary[kind] += 1;
  };
  for (const [id, it] of todo) {
    const read = await native.read(ix.root, it.rel);
    if (!read.ok) {
      hold(id, it.rel, `unreadable: ${read.reason}`, 'unreadable');
      continue;
    }
    if (read.bytes.length === 0) {
      hold(id, it.rel, 'empty file', 'rejected');
      continue;
    }
    if (read.bytes.length > MAX_PACK_BYTES) {
      hold(id, it.rel, 'too big for a Look file', 'rejected');
      continue;
    }
    const text = decode(read.bytes);
    if (text === null) {
      hold(id, it.rel, 'not text', 'rejected');
      continue;
    }
    let res;
    try {
      res = installLookFile(text);
    } catch (e) {
      hold(id, it.rel, `refused: ${String((e && e.message) || e).slice(0, 80)}`, 'rejected');
      continue;
    }
    if (!res.read.ok) {
      hold(id, it.rel, res.read.error, 'rejected');
      continue;
    }
    if (res.read.items.length === 0) {
      hold(id, it.rel, lookReceipt(res.read, res.merged), 'rejected'); // every item quarantined: named, nothing installed
      continue;
    }
    summary.files += 1;
    summary.looks += res.merged.added;
    rows.push({
      rel: it.rel,
      kind: 'look',
      outcome: 'taken-in',
      reason: lookReceipt(res.read, res.merged).slice(0, 120),
    });
    ix = markTaken(ix, id, { status: 'taken', assetId: null });
  }
  return { index: addRows(ix, rows.reverse()), summary };
}
