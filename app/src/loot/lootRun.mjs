// lootRun.mjs — #1479: one scan, end to end, over an injected native side. No store, no React, no clock of its own:
// the row calls it, and a selfcheck drives it with a fake filesystem.
//
//   list (native) -> plan -> hash only what changed (native, one at a time) -> plan again -> fold into the index
//
// Nothing is dropped silently: a file that cannot be hashed becomes an "unreadable: why" row and the scan carries on;
// a listing the native side refuses (symlinks, depth) is logged; a folder that cannot be listed changes nothing.
import { planScan, summarize } from './lootScan.mjs';
import { applyPlan, asPrev, sanitizeIndex } from './lootIndex.mjs';

/**
 * @param native   createLootNative(): { scan, hash }
 * @param index    the current index (its `root` is what is scanned)
 * @param nowMs    the scan's clock reading
 * @param onProgress ({ done, total }) => void while hashing
 * @returns { ok: true, index, rows, summary, truncated } | { ok: false, reason, index }
 */
export async function runScan({ native, index, nowMs = 0, onProgress = null }) {
  const base = sanitizeIndex(index);
  if (!base.root) return { ok: false, reason: 'no folder yet', index: base };
  const listing = await native.scan(base.root);
  if (!listing.ok) return { ok: false, reason: listing.reason || 'scan failed', index: base };

  const listed = listing.entries;
  const prev = asPrev(base);
  const first = planScan({ entries: listed, prev, nowMs, rootReachable: listing.reachable });
  const need = first.needHash;
  const hashes = new Map();
  const failed = new Map();
  for (let i = 0; i < need.length; i++) {
    if (onProgress) {
      try {
        onProgress({ done: i, total: need.length });
      } catch {
        /* a progress callback must not stop a scan */
      }
    }
    const h = await native.hash(base.root, need[i]);
    if (h.ok) hashes.set(need[i], h.hash);
    else failed.set(need[i], h.reason || 'unreadable');
  }
  if (onProgress && need.length) {
    try {
      onProgress({ done: need.length, total: need.length });
    } catch {
      /* ignore */
    }
  }

  const withHashes = listed.map((e) => (hashes.has(e.rel) ? { ...e, hash: hashes.get(e.rel) } : e));
  const plan = planScan({ entries: withHashes, prev, nowMs, rootReachable: listing.reachable });
  // what the native side declined to list (symlinks, too deep) and what could not be hashed are rows too
  for (const s of listing.skipped) plan.skipped.push({ rel: s.rel, kind: null, reason: s.reason });
  for (const [rel, why] of failed) plan.skipped.push({ rel, kind: null, reason: `unreadable: ${why}` });
  plan.needHash = plan.needHash.filter((r) => !failed.has(r)); // a failed hash is logged once, not left pending forever
  if (listing.truncated) plan.skipped.push({ rel: '', kind: null, reason: 'folder too large: listing stopped early' });

  const folded = applyPlan(base, plan, { nowMs });
  return {
    ok: true,
    index: folded.index,
    rows: folded.rows,
    summary: summarize(plan),
    truncated: listing.truncated,
    unreachable: !listing.reachable,
  };
}
