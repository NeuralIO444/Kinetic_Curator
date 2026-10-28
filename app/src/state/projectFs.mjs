// projectFs.mjs — #1709: the one interface a project folder is reached through, and the in-memory backend the session
// logic is proven on. The loot folder's pattern (lootNative.mjs): every call returns { ok: true, ... } or
// { ok: false, reason }; nothing throws. A backend is injected, so the same session code runs on Tauri (Rust), and later
// on the browser's File System Access API, and here on memory with faults on demand.
//
// The interface (all async):
//   pickParent()                          → { ok, path | null }  where a new project folder will be made (null: cancel)
//   pickProject()                         → { ok, path | null }  an existing project folder (null: cancel)
//   listNames(dir)                        → { ok, names: [{ name, dir }] }  one level, for collisions
//   makeFolder(parent, name)              → { ok, path }   refuses when `name` already exists (never merges into one)
//   reachable(root)                       → { ok, reachable }  is the project folder there right now?
//   list(root, relDir)                    → { ok, names: [{ name, dir }] }
//   read(root, rel)                       → { ok, text }
//   write(root, rel, text, { create })    → { ok }   atomic (whole file or nothing); `create` refuses an existing file
//   makeSubfolder(root, relDir)           → { ok }   idempotent inside the project
//   renameFolder(root, newName)           → { ok, path }   renames the project folder in its parent; refuses an existing name
// Every failure that means "the folder is not there" carries `unreachable: true` — that is the signal pause-and-protect
// (Matt, #1567) acts on. `rel` is always inside the project: no '..', no leading '/', no empty segment.

/** A relative path inside a project: segments of non-empty names, no '.', '..', backslash or NUL. */
export function isInsideRel(rel) {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 512) return false;
  if (rel.startsWith('/') || rel.includes('\\') || rel.includes('\0')) return false;
  return rel.split('/').every((s) => s.length > 0 && s !== '.' && s !== '..');
}

const join = (a, b) => (a.endsWith('/') ? a + b : `${a}/${b}`);
const parentOf = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
const baseOf = (p) => p.slice(p.lastIndexOf('/') + 1);
const isName = (s) => typeof s === 'string' && s.length > 0 && !s.includes('/') && s !== '.' && s !== '..';

/**
 * The in-memory backend. Paths are absolute POSIX strings ('/Users/m/Projects'). Faults:
 *   detach(path)    — the folder (and everything under it) is gone, as if moved or unmounted; attach(path) brings it back
 *   failWrites(n, reason)  — the next n writes fail (disk full, permission) without touching the file
 *   picks           — queue the answers pickParent / pickProject give
 * Introspection for the selfchecks: files() (a copy: path → text), writes (every write attempt, in order).
 */
export function createMemoryProjectFs({ folders = ['/'], files = {} } = {}) {
  const dirs = new Set(folders);
  const data = new Map(Object.entries(files));
  for (const p of data.keys()) for (let d = parentOf(p); d !== '/'; d = parentOf(d)) dirs.add(d);
  dirs.add('/');
  const detached = new Set();
  let failing = 0;
  let failReason = 'write failed';
  const picks = { parent: [], project: [] };
  const writes = [];

  const gone = (p) => [...detached].some((d) => p === d || p.startsWith(`${d}/`));
  const isDir = (p) => dirs.has(p) && !gone(p);
  const unreachable = (what) => ({ ok: false, unreachable: true, reason: `${what} is not reachable` });
  const childrenOf = (dir) => {
    const out = new Map();
    const pre = dir === '/' ? '/' : `${dir}/`;
    for (const d of dirs)
      if (d !== dir && d.startsWith(pre) && !d.slice(pre.length).includes('/')) out.set(baseOf(d), true);
    for (const f of data.keys()) if (f.startsWith(pre) && !f.slice(pre.length).includes('/')) out.set(baseOf(f), false);
    return [...out].map(([name, dir]) => ({ name, dir })).sort((a, b) => (a.name < b.name ? -1 : 1));
  };
  const inRoot = (root, rel) => {
    if (!isDir(root)) return { err: unreachable('the project folder') };
    if (!isInsideRel(rel)) return { err: { ok: false, reason: 'not a path inside the project' } };
    return { path: join(root, rel) };
  };

  return {
    // ── faults and introspection (memory only) ──
    detach: (p) => detached.add(p),
    attach: (p) => detached.delete(p),
    failWrites: (n, reason = 'write failed') => {
      failing = n;
      failReason = reason;
    },
    picks,
    writes,
    files: () => Object.fromEntries(data),
    /** Move a folder (as Finder would): every path under it moves too. */
    move(from, to) {
      for (const d of [...dirs])
        if (d === from || d.startsWith(`${from}/`)) {
          dirs.delete(d);
          dirs.add(to + d.slice(from.length));
        }
      for (const [f, t] of [...data])
        if (f.startsWith(`${from}/`)) {
          data.delete(f);
          data.set(to + f.slice(from.length), t);
        }
    },

    // ── the interface ──
    async pickParent() {
      return { ok: true, path: picks.parent.length ? picks.parent.shift() : null };
    },
    async pickProject() {
      return { ok: true, path: picks.project.length ? picks.project.shift() : null };
    },
    async listNames(dir) {
      return isDir(dir) ? { ok: true, names: childrenOf(dir) } : unreachable('that folder');
    },
    async makeFolder(parent, name) {
      if (!isDir(parent)) return unreachable('that folder');
      if (!isName(name)) return { ok: false, reason: 'not a folder name' };
      const path = join(parent, name);
      if (dirs.has(path) || data.has(path)) return { ok: false, exists: true, reason: `${name} already exists` };
      writes.push({ op: 'mkdir', path });
      dirs.add(path);
      return { ok: true, path };
    },
    async reachable(root) {
      return { ok: true, reachable: isDir(root) };
    },
    async list(root, relDir) {
      const r = inRoot(root, relDir);
      if (r.err) return r.err;
      return isDir(r.path)
        ? { ok: true, names: childrenOf(r.path) }
        : { ok: false, missing: true, reason: 'no such folder' };
    },
    async read(root, rel) {
      const r = inRoot(root, rel);
      if (r.err) return r.err;
      return data.has(r.path)
        ? { ok: true, text: data.get(r.path) }
        : { ok: false, missing: true, reason: 'no such file' };
    },
    async write(root, rel, text, { create = false } = {}) {
      const r = inRoot(root, rel);
      writes.push({ op: 'write', path: r.path || `${root}/${rel}`, refused: !!r.err });
      if (r.err) return r.err;
      if (typeof text !== 'string') return { ok: false, reason: 'not text' };
      if (!isDir(parentOf(r.path))) return { ok: false, missing: true, reason: 'no such folder' };
      if (create && data.has(r.path)) return { ok: false, exists: true, reason: `${baseOf(r.path)} already exists` };
      if (failing > 0) {
        failing--;
        return { ok: false, reason: failReason };
      }
      data.set(r.path, text); // whole or nothing: the old text stands until this line
      return { ok: true };
    },
    async makeSubfolder(root, relDir) {
      const r = inRoot(root, relDir);
      if (r.err) return r.err;
      if (data.has(r.path)) return { ok: false, reason: 'a file is in the way' };
      if (!dirs.has(r.path)) {
        writes.push({ op: 'mkdir', path: r.path });
        dirs.add(r.path);
      }
      return { ok: true };
    },
    async renameFolder(root, newName) {
      if (!isDir(root)) return unreachable('the project folder');
      if (!isName(newName)) return { ok: false, reason: 'not a folder name' };
      const to = join(parentOf(root), newName);
      if (dirs.has(to) || data.has(to)) return { ok: false, exists: true, reason: `${newName} already exists` };
      writes.push({ op: 'rename', path: root, to });
      this.move(root, to);
      return { ok: true, path: to };
    },
  };
}
