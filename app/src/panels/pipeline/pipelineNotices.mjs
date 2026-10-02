// Pipeline face copy (#630, #646–#653). Pure so the panel stays a thin shell.

const RECENT_KEY = 'kc-recent-projects';
const RECENT_CAP = 5;

export function confirmReplaceMessage() {
  return 'Import replaces the current piece. Continue?';
}

export function loadedMessage(fileName, doc) {
  const name = fileName || 'project';
  const layers = Array.isArray(doc?.layers) ? doc.layers.length : 0;
  const title = typeof doc?.title === 'string' && doc.title.trim() ? doc.title.trim() : null;
  return title
    ? `Loaded ${title} (${name}) · ${layers} track${layers === 1 ? '' : 's'}`
    : `Loaded ${name} · ${layers} track${layers === 1 ? '' : 's'}`;
}

export function exportSavedMessage(filename) {
  return `Saved ${filename}`;
}

export function exportFilename(doc) {
  const title = typeof doc?.title === 'string' ? doc.title.trim() : '';
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  if (slug) return `${slug}.project.json`;
  return `kinetic-curator-${(doc?.seed >>> 0).toString(16)}.project.json`;
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
