// lootClassify.mjs — #1479: what a file in the loot folder is, from its path alone. Pure: no filesystem, no clock.
//
// The folder contract: the subfolder says the intent (images/, audio/, palettes/, looks/); anything outside those is
// ignored; a file inside one that cannot be used is SKIPPED with a reason, never dropped silently. Matt's v1 choices
// (2026-10-14): SVG only for images (rasters are recognised and logged "not supported yet"), looks/ lands after the Look
// phase, so a Look file is recognised and logged until then.
export const LOOT_SUBFOLDERS = Object.freeze({ images: 'image', audio: 'audio', palettes: 'palette', looks: 'look' });
export const MAX_REL_LENGTH = 512;

/** extension -> { kind, supported, reason } per kind. A recognised-but-unsupported type is reported, not guessed at. */
const EXT = Object.freeze({
  image: { '.svg': { ok: true }, '.png': { ok: false, reason: 'raster not supported yet' }, '.jpg': { ok: false, reason: 'raster not supported yet' }, '.jpeg': { ok: false, reason: 'raster not supported yet' }, '.gif': { ok: false, reason: 'raster not supported yet' }, '.webp': { ok: false, reason: 'raster not supported yet' } },
  audio: { '.wav': { ok: true }, '.mp3': { ok: true }, '.aif': { ok: true }, '.aiff': { ok: true } },
  palette: { '.json': { ok: true } },
  look: { '.json': { ok: false, reason: 'looks not supported yet' }, '.kclook': { ok: false, reason: 'looks not supported yet' } },
});

/** A path as POSIX segments, or null when it is unsafe or malformed. Never throws. */
export function relSegments(rel) {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > MAX_REL_LENGTH) return null;
  if (rel.includes('\0') || rel.includes('�')) return null; // NUL, or a name that was not valid UTF-8 upstream
  const parts = rel.replace(/\\/g, '/').split('/').filter((p) => p !== '' && p !== '.');
  if (parts.length === 0 || parts.some((p) => p === '..')) return null;
  return parts;
}

// Only an explicit cloud-sync conflict marker is skipped. A name like "wing 2.svg" or "wing copy.svg" is the artist's own,
// and a Finder duplicate carries identical bytes, so the content hash already dedupes it.
const CONFLICT = /conflicted copy/i;

/**
 * @returns { kind, ext, ok, reason?, segments, stem, ignored? }
 *   ignored: true  -> outside the known subfolders (the contract says: not ours, not logged)
 *   ok: true       -> a supported file of that kind
 *   ok: false      -> skipped, with a reason that goes in the ingest log
 */
export function classify(rel) {
  const segments = relSegments(rel);
  if (!segments) return { kind: null, ok: false, reason: 'unsafe or unreadable name', segments: null, stem: '', ext: '' };
  const top = segments[0].toLowerCase();
  const kind = Object.prototype.hasOwnProperty.call(LOOT_SUBFOLDERS, top) ? LOOT_SUBFOLDERS[top] : null;
  const base = segments[segments.length - 1];
  if (!kind) return { kind: null, ok: false, ignored: true, segments, stem: base, ext: '' };
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : '';
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const out = { kind, ext, ok: false, segments, stem };
  if (segments.length < 2) return { ...out, reason: 'a folder, not a file' }; // "images" itself
  if (base.startsWith('.')) return { ...out, reason: base.toLowerCase().endsWith('.icloud') ? 'iCloud placeholder (not downloaded)' : 'hidden file' };
  if (segments.slice(1, -1).some((p) => p.startsWith('.'))) return { ...out, reason: 'hidden folder' };
  if (base.toLowerCase().endsWith('.icloud')) return { ...out, reason: 'iCloud placeholder (not downloaded)' };
  if (/^(thumbs\.db|desktop\.ini)$/i.test(base)) return { ...out, reason: 'system file' };
  if (CONFLICT.test(stem)) return { ...out, reason: 'sync conflict copy' };
  const spec = EXT[kind][ext];
  if (!spec) return { ...out, reason: ext ? `not a ${kind} file (${ext})` : 'no file extension' };
  return spec.ok ? { ...out, ok: true } : { ...out, reason: spec.reason };
}

/** A stable, readable slug for an id: lower-case a-z0-9 and underscores, at most 32 characters. */
export function slug(stem) {
  const s = String(stem ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32).replace(/_+$/g, '');
  return s || 'item';
}

/** The `user:` id of a loot item: readable stem plus the first six hex of its content hash, so a rename keeps it. */
export function lootId(stem, hash) {
  const h = typeof hash === 'string' ? hash.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 6) : '';
  return `user:loot_${slug(stem)}_${h || '000000'}`;
}
