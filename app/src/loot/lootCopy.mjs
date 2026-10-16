// lootCopy.mjs — #1479: the words the loot row says. Pure (no JSX) so a selfcheck covers them. The voice is the
// instrument's: lowercase, deadpan, no celebration, no badges, and it states the count (Matt's rule for any guard).
export const DESKTOP_ONLY = 'desktop only';
export const NOT_CONFIRMED = 'desktop check not confirmed yet';
export const NOT_REACHABLE = 'folder not reachable';
// the browser backend (slice 5b): plain reasons, never a dead button
export const WEB_UNSUPPORTED = 'needs chrome or edge, or the desktop app';
export const WEB_INSECURE = 'needs a secure page (https)';
export const LINK_LOST = 'folder link lost: point at the folder again';
export const ALLOW_AGAIN = 'allow access to the folder, then rescan';
export const NOT_BROWSER_FOLDER = 'not a browser folder: point at the folder again';

/** The folder as the row shows it: a desktop path as it is, a browser folder by name and where it is kept. */
export function rootLabel(root) {
  if (typeof root !== 'string' || !root) return '';
  return root.startsWith('web:') ? `${root.slice(4)} (kept in this browser)` : root;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The quiet status line under the row: what the index holds and what the last scan did. */
export function statusLine({ items = 0, missing = 0, added = 0, skipped = 0, taken = 0, held = 0, scanned = false } = {}) {
  if (!scanned && items === 0) return 'no folder yet';
  const bits = [plural(items, 'item', 'items')];
  if (added) bits.push(`${added} found`);
  if (taken) bits.push(`${taken} in the pool`);
  if (held) bits.push(`${held} held`);
  if (skipped) bits.push(`${skipped} skipped`);
  if (missing) bits.push(`${missing} missing`);
  return bits.join(' · ');
}

const MISSING_SHOWN = 3;
const KEEPS = Object.freeze({ image: 'the pool keeps its copy', palette: 'the palette stays in your library', audio: 'it leaves the STIMULI menu', look: 'the shelf marks the keep missing' });

/** Honest lines for files that were taken in and are no longer in the folder: [`images/a.svg: source missing, the pool keeps its copy`]. */
export function missingLines(index) {
  const items = (index && index.items && typeof index.items === 'object') ? Object.values(index.items) : [];
  const gone = items.filter((it) => it && it.state === 'missing' && typeof it.rel === 'string').sort((a, b) => (a.rel < b.rel ? -1 : 1));
  const lines = gone.slice(0, MISSING_SHOWN).map((it) => `${it.rel}: source missing${it.ingested && KEEPS[it.kind] ? `, ${KEEPS[it.kind]}` : ''}`);
  if (gone.length > MISSING_SHOWN) lines.push(`and ${gone.length - MISSING_SHOWN} more missing`);
  return lines;
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
  hint: 'images/ audio/ palettes/ looks/ — your files stay where they are; KC-1 writes only its own keep exports into looks/',
  logTitle: 'ingest log',
  empty: 'nothing in the log yet',
});
