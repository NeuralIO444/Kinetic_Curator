// lootScan.mjs — #1479: the plan for one scan of the loot folder. Pure: a fake filesystem drives it in tests, the Rust
// commands (a later slice) drive it live. Nothing here reads a file, hashes a byte or touches the store.
//
// Two phases, because hashing is the expensive part and most files have not changed:
//   1. planScan({ entries, prev, nowMs, rootReachable }) -> which entries are unchanged (same rel, size and mtime as the
//      index), which are ignored or skipped (with the reason that goes in the log), and which `needHash`.
//   2. the caller hashes only needHash and calls planScan again with the hashes attached; the result then says what to
//      add, what is a duplicate, what changed, what was renamed and what is missing.
// The content hash is identity: a rename keeps the item and updates its path; a copy dedupes.
import { classify, lootId } from './lootClassify.mjs';

/** A file modified this recently may still be being written: skip it this scan, say so, and pick it up on the next. */
export const SETTLE_MS = 2000;

const byRel = (a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);

/**
 * @param entries       [{ rel, size, mtimeMs, hash? }] from the listing; `hash` only where it has been computed
 * @param prev          the index: { items: { [id]: { rel, size, mtimeMs, hash, state } } } or null
 * @param nowMs         the scan's clock reading (passed in: this module reads no clock)
 * @param rootReachable false when the folder could not be listed at all (an unmounted volume): nothing is marked missing
 */
export function planScan({ entries = [], prev = null, nowMs = 0, rootReachable = true } = {}) {
  const out = { add: [], dup: [], changed: [], renamed: [], unchanged: [], missing: [], skipped: [], needHash: [], collisions: [], unreachable: !rootReachable };
  const prevItems = prev && prev.items && typeof prev.items === 'object' ? Object.entries(prev.items) : [];
  const prevByRel = new Map(prevItems.map(([id, it]) => [it.rel, { id, ...it }]));
  const prevByHash = new Map();
  for (const [id, it] of prevItems) if (it.hash && !prevByHash.has(it.hash)) prevByHash.set(it.hash, { id, ...it });

  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e === 'object').slice().sort(byRel);
  const seenLower = new Map();
  const livePaths = new Set();
  const candidates = [];

  for (const e of list) {
    const c = classify(e.rel);
    if (c.ignored) continue; // outside the known subfolders: not ours, not logged
    const key = String(e.rel).toLowerCase();
    if (seenLower.has(key)) { out.collisions.push({ rel: e.rel, with: seenLower.get(key) }); out.skipped.push({ rel: e.rel, kind: c.kind, reason: 'name differs only by case' }); continue; }
    seenLower.set(key, e.rel);
    if (!c.ok) { out.skipped.push({ rel: e.rel, kind: c.kind, reason: c.reason }); continue; }
    livePaths.add(e.rel);
    if (Number.isFinite(e.mtimeMs) && Number.isFinite(nowMs) && nowMs - e.mtimeMs < SETTLE_MS && nowMs - e.mtimeMs > -SETTLE_MS) {
      out.skipped.push({ rel: e.rel, kind: c.kind, reason: 'still changing' });
      continue;
    }
    const known = prevByRel.get(e.rel);
    if (known && known.state !== 'missing' && known.size === e.size && known.mtimeMs === e.mtimeMs && !e.hash) {
      out.unchanged.push({ rel: e.rel, id: known.id });
      continue;
    }
    if (!e.hash) { out.needHash.push(e.rel); continue; }
    candidates.push({ e, c });
  }

  // phase 2: classify the hashed files. Deterministic: sorted by rel, the first of identical bytes is the one that adds.
  const claimed = new Map(); // hash -> rel that took it this scan
  for (const { e, c } of candidates) {
    const known = prevByRel.get(e.rel);
    if (known && known.hash === e.hash) { out.unchanged.push({ rel: e.rel, id: known.id }); claimed.set(e.hash, e.rel); continue; }
    if (known && known.hash !== e.hash) { out.changed.push({ rel: e.rel, id: known.id, hash: e.hash, kind: c.kind, stem: c.stem }); claimed.set(e.hash, e.rel); continue; }
    if (claimed.has(e.hash)) { out.dup.push({ rel: e.rel, of: claimed.get(e.hash), hash: e.hash, kind: c.kind }); continue; }
    const same = prevByHash.get(e.hash);
    if (same && !livePaths.has(same.rel)) {
      out.renamed.push({ rel: e.rel, from: same.rel, id: same.id, hash: e.hash, kind: c.kind });
      claimed.set(e.hash, e.rel);
      continue;
    }
    if (same) { out.dup.push({ rel: e.rel, of: same.rel, hash: e.hash, kind: c.kind }); continue; } // a copy of a file still here
    out.add.push({ rel: e.rel, hash: e.hash, kind: c.kind, stem: c.stem, size: e.size, mtimeMs: e.mtimeMs, id: lootId(c.stem, e.hash) });
    claimed.set(e.hash, e.rel);
  }

  // what the index remembers that the folder no longer shows (only when the folder could be listed, and only once every
  // hash is in: a pending hash could still turn a "missing" into a rename)
  if (rootReachable && out.needHash.length === 0) {
    const renamedFrom = new Set(out.renamed.map((r) => r.from));
    for (const [id, it] of prevItems) {
      if (livePaths.has(it.rel) || renamedFrom.has(it.rel) || it.state === 'missing') continue;
      out.missing.push({ id, rel: it.rel, hash: it.hash });
    }
  }
  return out;
}

/** The counts a status line shows. */
export function summarize(plan) {
  return {
    add: plan.add.length, dup: plan.dup.length, changed: plan.changed.length, renamed: plan.renamed.length,
    unchanged: plan.unchanged.length, missing: plan.missing.length, skipped: plan.skipped.length, needHash: plan.needHash.length,
  };
}
