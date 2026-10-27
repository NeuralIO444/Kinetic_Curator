// lootIngest.mjs — #1479 slice 6: take the loot folder's SVGs into the asset pool. Pure of the store and the bus: the
// caller injects how bytes are read and how an SVG enters the pool, so a selfcheck drives it with the REAL ingest rules
// (hostile markup, nesting, tag allow-list, size, the 32-slot cap) and a fake folder.
//
// The contract (Matt, 2026-10-14): SVG only; every file passes the app's own trust boundary (assets/ingest.js: nothing
// is trusted because it came from the user's own folder); the pool is 32, so the rest are INDEXED and marked "pool full"
// until a slot frees; a file that is refused says why and is not retried until its bytes change; nothing throws.
import { markTaken, addRows, sanitizeIndex } from './lootIndex.mjs';
import { lootHint } from './lootClassify.mjs';

/** The bytes this slice will not even offer to the SVG ingest (its own cap is 48 KB; this just bounds the decode). */
export const MAX_SVG_BYTES = 512 * 1024;

const decode = (bytes) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

/**
 * @param native   { read(root, rel) -> { ok, bytes } | { ok:false, reason } }
 * @param index    the loot index
 * @param ingest   (svgText, hint) -> { ok: true, id } | { ok: false, reason, poolFull? }   how an SVG enters the pool
 * @param onProgress ({ done, total }) => void
 * @returns { index, summary: { taken, rejected, poolFull, unreadable } }
 */
export async function takeInImages({ native, index, ingest, onProgress = null }) {
  let ix = sanitizeIndex(index);
  const todo = Object.entries(ix.items)
    .filter(
      ([, it]) => it.kind === 'image' && it.state === 'ok' && !it.ingested && (!it.hold || /^pool full/.test(it.hold)),
    )
    .sort((a, b) => (a[1].rel < b[1].rel ? -1 : 1));
  const summary = { taken: 0, rejected: 0, poolFull: 0, unreadable: 0 };
  const rows = [];
  let done = 0;
  for (const [id, it] of todo) {
    if (onProgress) {
      try {
        onProgress({ done, total: todo.length });
      } catch {
        /* a progress callback must not stop this */
      }
    }
    done += 1;
    const read = await native.read(ix.root, it.rel);
    if (!read.ok) {
      summary.unreadable += 1;
      rows.push({ rel: it.rel, kind: 'image', outcome: 'rejected', reason: `unreadable: ${read.reason}` });
      ix = markTaken(ix, id, { status: 'held', reason: `unreadable: ${read.reason}` });
      continue;
    }
    if (read.bytes.length === 0) {
      summary.rejected += 1;
      rows.push({ rel: it.rel, kind: 'image', outcome: 'rejected', reason: 'empty file' });
      ix = markTaken(ix, id, { status: 'held', reason: 'empty file' });
      continue;
    }
    if (read.bytes.length > MAX_SVG_BYTES) {
      summary.rejected += 1;
      rows.push({ rel: it.rel, kind: 'image', outcome: 'rejected', reason: 'too big for the pool' });
      ix = markTaken(ix, id, { status: 'held', reason: 'too big for the pool' });
      continue;
    }
    const text = decode(read.bytes);
    if (text === null) {
      summary.rejected += 1;
      rows.push({ rel: it.rel, kind: 'image', outcome: 'rejected', reason: 'not text (not an SVG)' });
      ix = markTaken(ix, id, { status: 'held', reason: 'not text (not an SVG)' });
      continue;
    }
    let r;
    try {
      r = ingest(text, lootHint(id));
    } catch (e) {
      r = { ok: false, reason: String((e && e.message) || e).slice(0, 100) };
    }
    if (r && r.ok) {
      summary.taken += 1;
      rows.push({ rel: it.rel, kind: 'image', outcome: 'taken-in', reason: 'in the pool, off until you enable it' });
      ix = markTaken(ix, id, { status: 'taken', assetId: r.id });
    } else if (r && r.poolFull) {
      summary.poolFull += 1;
      rows.push({ rel: it.rel, kind: 'image', outcome: 'pool-full', reason: 'pool full (32): free a slot and rescan' });
      ix = markTaken(ix, id, { status: 'held', reason: 'pool full (32)' });
    } else {
      summary.rejected += 1;
      const why = (r && r.reason) || 'refused';
      rows.push({ rel: it.rel, kind: 'image', outcome: 'rejected', reason: why });
      ix = markTaken(ix, id, { status: 'held', reason: `rejected: ${why}`.slice(0, 120) });
    }
  }
  if (onProgress && todo.length) {
    try {
      onProgress({ done: todo.length, total: todo.length });
    } catch {
      /* ignore */
    }
  }
  return { index: addRows(ix, rows.reverse()), summary };
}

/** How the store's ingest shows up as the `ingest` function takeInImages wants (kept here so it is tested without React). */
export function ingestVia(getState) {
  return (svg, hint) => {
    const st = getState();
    const before = new Set((st.customAssets || []).map((a) => a.id));
    st.ingestAsset(svg, hint, { source: 'loot' });
    const after = getState();
    const added = (after.customAssets || []).find((a) => !before.has(a.id));
    if (added) return { ok: true, id: added.id };
    const why = String(after.ingestError || 'ingest failed');
    return { ok: false, reason: why, poolFull: /full/i.test(why) };
  };
}
