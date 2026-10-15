// lootCopy.mjs — #1479: the words the loot row says. Pure (no JSX) so a selfcheck covers them. The voice is the
// instrument's: lowercase, deadpan, no celebration, no badges, and it states the count (Matt's rule for any guard).
export const DESKTOP_ONLY = 'desktop only';
export const NOT_CONFIRMED = 'desktop check not confirmed yet';
export const NOT_REACHABLE = 'folder not reachable';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The quiet status line under the row: what the index holds and what the last scan did. */
export function statusLine({ items = 0, missing = 0, added = 0, skipped = 0, scanned = false } = {}) {
  if (!scanned && items === 0) return 'no folder yet';
  const bits = [plural(items, 'item', 'items')];
  if (added) bits.push(`${added} added`);
  if (skipped) bits.push(`${skipped} skipped`);
  if (missing) bits.push(`${missing} missing`);
  return bits.join(' · ');
}

/** One log row as text: `images/a.svg  skipped: raster not supported yet`. */
export function logLine(r) {
  if (!r || typeof r.rel !== 'string') return '';
  const why = r.reason ? `: ${r.reason}` : '';
  return `${r.rel}  ${r.outcome}${why}`;
}

/** The confirm before forgetting the folder: states the count and that the files are untouched. */
export function confirmForgetMessage(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return `Forget the loot folder and its ${plural(n, 'item', 'items')}? Your files are not touched, and assets already in the pool stay.`;
}

/** Row labels, lowercase like the rest of PIPELINE. */
export const LABELS = Object.freeze({
  title: 'loot folder',
  point: 'point at folder...',
  change: 'change folder...',
  rescan: 'rescan',
  forget: 'forget',
  scanning: 'scanning...',
  hashing: (done, total) => `reading ${done} of ${total}...`,
  hint: 'images/ audio/ palettes/ looks/ — your files are read in place, never copied or moved',
  logTitle: 'ingest log',
  empty: 'nothing in the log yet',
});
