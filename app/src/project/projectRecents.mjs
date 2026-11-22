// projectRecents.mjs — #1711: the recent-projects list. Pure logic over a plain array; the caller owns storage
// (projectFolderLive keeps it in browser storage beside `kc:project-folder:last` — this machine's paths, never
// project content, never in a bundle).
//
// Matt's rulings (2026-11-21): most-recent-first, capped at ~8; a folder that is not reachable STAYS listed (the
// caller marks it and offers a remove) — nothing is ever dropped silently. An entry is { name, root, at }: the
// project's name, its folder path, and when it was last opened (ISO, the caller's clock).
export const RECENTS_CAP = 8;

const isEntry = (e) =>
  e !== null &&
  typeof e === 'object' &&
  typeof e.name === 'string' &&
  e.name.length > 0 &&
  typeof e.root === 'string' &&
  e.root.length > 0;

/** Keep only well-formed entries, first (most recent) wins on a duplicate root, capped. */
export function sanitizeRecents(list) {
  const out = [];
  const seen = new Set();
  for (const e of Array.isArray(list) ? list : []) {
    if (!isEntry(e) || seen.has(e.root)) continue;
    seen.add(e.root);
    out.push({ name: e.name, root: e.root, at: typeof e.at === 'string' ? e.at : null });
    if (out.length >= RECENTS_CAP) break;
  }
  return out;
}

/** Stored text (or an already-parsed value) → a clean list. Corrupt storage reads as an empty list, never a throw. */
export function parseRecents(text) {
  if (Array.isArray(text)) return sanitizeRecents(text);
  if (typeof text !== 'string' || text.length === 0) return [];
  try {
    return sanitizeRecents(JSON.parse(text));
  } catch {
    return [];
  }
}

/** A project was opened or created: it becomes the most recent. */
export function touchRecents(list, { name, root }, at) {
  if (!isEntry({ name, root })) return sanitizeRecents(list);
  return sanitizeRecents([{ name, root, at: typeof at === 'string' ? at : null }, ...sanitizeRecents(list)]);
}

/** The performer removes an entry (the folder itself is never touched). */
export function removeRecent(list, root) {
  return sanitizeRecents(list).filter((e) => e.root !== root);
}

/** A rename moves an entry: same place in the list, new name and root. */
export function renameRecent(list, root, { name, root: newRoot }) {
  return sanitizeRecents(list).map((e) => (e.root === root ? { ...e, name, root: newRoot } : e));
}
