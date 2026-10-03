// Pipeline face copy (#630, #646–#653). Pure so the panel stays a thin shell.

const RECENT_KEY = 'kc-recent-projects';
const RECENT_CAP = 5;

export function importConfirmMessage(fileName, seed) {
  const name = fileName || 'project';
  const seedPart = Number.isFinite(seed) ? ` (seed ${seed >>> 0})` : '';
  return `Import "${name}"${seedPart} and replace the current piece?`;
}

export function loadedMessage(fileName, doc, sanitized = 0) {
  const name = fileName || 'project';
  const layers = Array.isArray(doc?.layers) ? doc.layers.length : 0;
  const seed = Number.isFinite(doc?.seed) ? doc.seed >>> 0 : null;
  const palette = typeof doc?.paletteId === 'string' && doc.paletteId ? doc.paletteId : null;
  const title = typeof doc?.title === 'string' && doc.title.trim() ? doc.title.trim() : null;
  let msg = title ? `Loaded ${title} (${name})` : `Loaded ${name}`;
  if (seed !== null) msg += ` · seed ${seed}`;
  msg += ` · ${layers} track${layers === 1 ? '' : 's'}`;
  if (palette) msg += ` · ${palette}`;
  const n = Math.max(0, Math.floor(Number(sanitized) || 0));
  if (n > 0) msg += ` · ${n} field${n === 1 ? '' : 's'} sanitized`;
  return msg;
}

export function exportSavedMessage(filename) {
  return `Saved ${filename}`;
}

const TITLE_VERSIONS_KEY = 'kc-title-versions';

export function titleSlug(title) {
  const t = typeof title === 'string' ? title.trim() : '';
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function readTitleVersions(store = globalThis.localStorage) {
  if (!store) return {};
  try {
    const raw = JSON.parse(store.getItem(TITLE_VERSIONS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/** #651 — version counter persisted per title slug, increments on each export. */
export function nextTitleVersion(slug, store = globalThis.localStorage) {
  if (!slug || !store) return 1;
  const versions = readTitleVersions(store);
  const next = (Number(versions[slug]) || 0) + 1;
  versions[slug] = next;
  try {
    store.setItem(TITLE_VERSIONS_KEY, JSON.stringify(versions));
  } catch { /* storage full or blocked — version still returned */ }
  return next;
}

export function exportFilename(doc, version) {
  const slug = titleSlug(doc?.title);
  const seedHex = (doc?.seed >>> 0).toString(16);
  if (slug) {
    const v = Number(version) || 1;
    return `${slug}-v${v}-${seedHex}.project.json`;
  }
  return `kinetic-curator-${seedHex}.project.json`;
}

/** #651 — filename for an export: bumps the per-title version counter. */
export function nextExportFilename(doc, store = globalThis.localStorage) {
  const slug = titleSlug(doc?.title);
  if (!slug) return exportFilename(doc);
  return exportFilename(doc, nextTitleVersion(slug, store));
}

export function missingPaletteMessage(doc, userPalettes) {
  const id = doc?.paletteId;
  if (typeof id !== 'string' || !id.startsWith('user:')) return null;
  const have = (userPalettes || []).some((p) => p && (`user:${p.id}` === id || p.id === id));
  return have ? null : `Missing palette ${id}`;
}

export function rememberRecent(name, store = globalThis.localStorage) {
  if (!name || !store) return [];
  const prev = readRecent(store).filter((n) => n !== name);
  const next = [name, ...prev].slice(0, RECENT_CAP);
  store.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

export function readRecent(store = globalThis.localStorage) {
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((n) => typeof n === 'string').slice(0, RECENT_CAP) : [];
  } catch {
    return [];
  }
}

export function dirtyMessage(exported, live) {
  if (!exported) return null;
  return exported === live ? null : 'Export is behind the live piece';
}

export function shouldExportOnKey(ev) {
  // E is Evolve. Export is X, and only when you are not typing.
  if (!ev || ev.key !== 'x' || ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey || ev.repeat) return false;
  const tag = ev.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target?.isContentEditable) return false;
  return true;
}
