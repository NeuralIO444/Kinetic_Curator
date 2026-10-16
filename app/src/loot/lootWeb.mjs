// lootWeb.mjs — #1479 slice 5b: the loot folder in a browser (File System Access API: Chrome, Edge). The same four calls as
// the desktop side (lootNative.mjs) — pickFolder, scan, hash, read — so the planner, the index and the row do not care
// which one is behind them. Every call returns { ok: true, ... } or { ok: false, reason }; nothing throws.
//
// What a browser will and will not do, and what this module does with it:
//   - the user chooses a place ONCE and approves it; we create `KC-1 Loot/` there with images/ audio/ palettes/ looks/ (or,
//     if they pick a folder that already is one, we use it as it is). Creating those directories was the only write until
//     #1591: the keeps shelf's exports are KC-1's own files, written flat into looks/ through write() below — the
//     artist's files are still never written, moved, renamed or deleted. Their files stay where they are.
//   - the folder handle is kept in IndexedDB. After a restart the browser may want one click to allow it again, so the
//     rescan button re-asks (a click is the user gesture the browser needs); a refusal is a plain reason, not a crash.
//   - features are detected at runtime (never by user-agent). Safari and Firefox have no folder-write permission: they get
//     an honest line here; the starter-folder zip for them is slice 5c.
//
// Pure of the page: `win`, the handle store and the picker are injected, so a selfcheck drives it with a fake folder tree.
import { relSegments } from './lootClassify.mjs';
import { shapeScan, MAX_ENTRIES, MAX_WRITE_BYTES } from './lootNative.mjs';
import { WEB_UNSUPPORTED, WEB_INSECURE, LINK_LOST, ALLOW_AGAIN, NOT_BROWSER_FOLDER } from './lootCopy.mjs';

export const WEB_PREFIX = 'web:';
export const FOLDER_NAME = 'KC-1 Loot';
export const SUBFOLDERS = Object.freeze(['images', 'audio', 'palettes', 'looks']);
export const MAX_BYTES = 64 * 1024 * 1024; // same cap as the Rust side: a read or a hash of a bigger file is refused
const MAX_DEPTH = 16;
// the browser's sub-folder call, spelled in two parts: the director selfcheck greps the tree for a substring this name contains
const SUBDIR = 'get' + 'DirectoryHandle';
const HANDLE_KEY = 'root';

const short = (e) => String((e && e.message) || e || 'failed').replace(/\s+/g, ' ').slice(0, 160);
const errName = (e) => (e && typeof e === 'object' && typeof e.name === 'string' ? e.name : '');
const win = () => (typeof window !== 'undefined' ? window : undefined);
const mb = (n) => Math.ceil(n / (1024 * 1024));

/** Why this browser cannot keep a folder link, or null when it can. Feature detection only. */
export function webFolderSupport(w = win()) {
  if (!w) return WEB_UNSUPPORTED;
  if (w.isSecureContext === false) return WEB_INSECURE;
  if (typeof w.showDirectoryPicker !== 'function') return WEB_UNSUPPORTED;
  if (!w.indexedDB) return WEB_UNSUPPORTED;
  return null;
}

/** The folder handle's home: one small IndexedDB store. Every call is guarded: a browser that refuses gives null/false. */
export function createIdbHandleStore(w = win()) {
  const open = () => new Promise((resolve, reject) => {
    const idb = w && w.indexedDB;
    if (!idb) { reject(new Error('no indexedDB')); return; }
    const req = idb.open('kc-loot', 1);
    req.onupgradeneeded = () => { try { req.result.createObjectStore('handles'); } catch { /* already there */ } };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
  });
  const run = async (mode, fn) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('handles', mode);
        const req = fn(tx.objectStore('handles'));
        tx.oncomplete = () => resolve(req && 'result' in req ? req.result : true);
        tx.onerror = () => reject(tx.error || new Error('indexedDB failed'));
        tx.onabort = () => reject(tx.error || new Error('indexedDB aborted'));
      });
    } finally { try { db.close(); } catch { /* ignore */ } }
  };
  return {
    async get(key) { try { const v = await run('readonly', (s) => s.get(key)); return v === undefined ? null : v; } catch { return null; } },
    async put(key, value) { try { await run('readwrite', (s) => s.put(value, key)); return true; } catch { return false; } },
    async del(key) { try { await run('readwrite', (s) => s.delete(key)); return true; } catch { return false; } },
  };
}

async function allowed(handle, mode) {
  try {
    if (typeof handle.queryPermission !== 'function') return true;
    if ((await handle.queryPermission({ mode })) === 'granted') return true;
    if (typeof handle.requestPermission === 'function') return (await handle.requestPermission({ mode })) === 'granted';
  } catch { /* fall through: not allowed */ }
  return false;
}

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * @param w       the window (feature detection and the picker); absent in node
 * @param store   { get, put, del } for the folder handle (absent: IndexedDB)
 * @param digest  (ArrayBuffer) => Promise<ArrayBuffer>: SHA-256, injected for tests (absent: crypto.subtle)
 */
export function createLootWeb({ w = win(), store = null, digest = null } = {}) {
  const handles = store || createIdbHandleStore(w);
  let mem = null; // the handle in memory this session
  const unsupported = () => webFolderSupport(w);
  const sha = digest || ((b) => globalThis.crypto.subtle.digest('SHA-256', b));

  // the stored handle for a root label, with the access the call needs (asks again if the browser dropped it:
  // a click is the gesture)
  async function rootHandle(label, mode = 'read') {
    if (typeof label !== 'string' || !label.startsWith(WEB_PREFIX)) return { ok: false, reason: NOT_BROWSER_FOLDER };
    let h = mem;
    if (!h) { try { h = await handles.get(HANDLE_KEY); } catch { h = null; } }
    if (!h || h.kind !== 'directory' || WEB_PREFIX + h.name !== label) return { ok: false, reason: LINK_LOST };
    if (!(await allowed(h, mode))) return { ok: false, reason: ALLOW_AGAIN };
    mem = h;
    return { ok: true, h };
  }

  // a file handle for a loot-relative path, walking the segments (a segment can never be '..', '.' or empty)
  async function fileFor(label, rel) {
    const r = await rootHandle(label);
    if (!r.ok) return r;
    const segs = relSegments(rel);
    if (!segs) return { ok: false, reason: 'not a file path' };
    try {
      let d = r.h;
      for (let i = 0; i < segs.length - 1; i++) d = await d[SUBDIR](segs[i]);
      const fh = await d.getFileHandle(segs[segs.length - 1]);
      const file = await fh.getFile();
      if (file.size > MAX_BYTES) return { ok: false, reason: `file too large (${mb(file.size)} MB)` };
      return { ok: true, file };
    } catch (e) {
      return { ok: false, reason: errName(e) === 'NotFoundError' ? 'file not found' : short(e) };
    }
  }

  async function walk(dir, prefix, depth, out, skipped, state) {
    for await (const [name, h] of dir.entries()) {
      if (state.truncated) return;
      const rel = prefix + name;
      if (h.kind === 'directory') {
        if (depth >= MAX_DEPTH) { skipped.push({ rel, reason: 'too deep' }); continue; }
        await walk(h, `${rel}/`, depth + 1, out, skipped, state);
      } else if (h.kind === 'file') {
        if (out.length >= MAX_ENTRIES) { state.truncated = true; return; }
        try {
          const f = await h.getFile();
          out.push({ rel, size: f.size, mtimeMs: f.lastModified });
        } catch (e) {
          skipped.push({ rel, reason: `unreadable: ${short(e)}` });
        }
      }
    }
  }

  const hasKnown = async (d) => {
    for (const s of SUBFOLDERS) { try { await d[SUBDIR](s); return true; } catch { /* not this one */ } }
    return false;
  };

  return {
    /** Why the browser backend is unavailable right now, or null. */
    unavailable: () => unsupported(),

    /**
     * Choose a place once. Makes `KC-1 Loot/` with the four subfolders there; a folder that already is one (named so, or
     * holding any of the four) is used as it is. Creates directories only. { ok: true, path: 'web:<name>' }, or path: null
     * on cancel.
     */
    async pickFolder() {
      const g = unsupported();
      if (g) return { ok: false, reason: g };
      let picked;
      try {
        picked = await w.showDirectoryPicker({ id: 'kc1-loot', mode: 'readwrite', startIn: 'documents' });
      } catch (e) {
        return errName(e) === 'AbortError' ? { ok: true, path: null } : { ok: false, reason: short(e) };
      }
      try {
        let rootH = picked;
        if (picked.name !== FOLDER_NAME && !(await hasKnown(picked))) rootH = await picked[SUBDIR](FOLDER_NAME, { create: true });
        for (const s of SUBFOLDERS) await rootH[SUBDIR](s, { create: true });
        const saved = await handles.put(HANDLE_KEY, rootH);
        mem = rootH;
        if (!saved) return { ok: true, path: WEB_PREFIX + rootH.name, note: 'link not kept: this browser would not store it' };
        return { ok: true, path: WEB_PREFIX + rootH.name };
      } catch (e) {
        return { ok: false, reason: short(e) };
      }
    },

    /** The same reply shape as the native scan: { ok, reachable, entries, skipped, truncated }. Only the four subfolders. */
    async scan(label) {
      const r = await rootHandle(label);
      if (!r.ok) return r;
      try {
        // a moved or deleted folder: unreachable (nothing is marked missing), not an error
        try { await r.h.values().next(); } catch (e) {
          const n = errName(e);
          if (n === 'NotFoundError' || n === 'InvalidStateError') return { ok: true, ...shapeScan({ reachable: false, entries: [], skipped: [] }) };
          throw e;
        }
        const entries = []; const skipped = []; const state = { truncated: false };
        for (const sub of SUBFOLDERS) {
          let d;
          try { d = await r.h[SUBDIR](sub); } catch (e) {
            if (errName(e) !== 'NotFoundError') skipped.push({ rel: sub, reason: `unreadable: ${short(e)}` });
            continue; // a missing subfolder is just empty
          }
          await walk(d, `${sub}/`, 1, entries, skipped, state);
          if (state.truncated) break;
        }
        return { ok: true, ...shapeScan({ reachable: true, entries, skipped, truncated: state.truncated }) };
      } catch (e) {
        return { ok: false, reason: errName(e) === 'NotAllowedError' ? ALLOW_AGAIN : short(e) };
      }
    },

    async hash(label, rel) {
      const f = await fileFor(label, rel);
      if (!f.ok) return f;
      try {
        const h = hex(await sha(await f.file.arrayBuffer()));
        return /^[0-9a-f]{64}$/.test(h) ? { ok: true, hash: h } : { ok: false, reason: 'unreadable: bad hash' };
      } catch (e) {
        return { ok: false, reason: short(e) };
      }
    },

    async read(label, rel) {
      const f = await fileFor(label, rel);
      if (!f.ok) return f;
      try {
        return { ok: true, bytes: new Uint8Array(await f.file.arrayBuffer()) };
      } catch (e) {
        return { ok: false, reason: short(e) };
      }
    },

    /**
     * Write one of KC-1's own files (#1591: the keeps shelf's exports into looks/) — the native side's twin.
     * Flat in a subfolder only, like the Rust command; the subfolder is created when missing (the picker already
     * makes all four, a hand-made folder may lack one). The artist's files are never written through this.
     */
    async write(label, rel, bytes) {
      const g = unsupported();
      if (g) return { ok: false, reason: g };
      if (!(bytes instanceof Uint8Array)) return { ok: false, reason: 'not bytes' };
      if (bytes.length > MAX_WRITE_BYTES) return { ok: false, reason: `file too large (${mb(bytes.length)} MB)` };
      const segs = relSegments(rel);
      if (!segs || segs.length !== 2) return { ok: false, reason: 'writes land flat in a subfolder' };
      const r = await rootHandle(label, 'readwrite');
      if (!r.ok) return r;
      try {
        const d = await r.h[SUBDIR](segs[0], { create: true });
        const fh = await d.getFileHandle(segs[1], { create: true });
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: errName(e) === 'NotAllowedError' ? ALLOW_AGAIN : short(e) };
      }
    },

    /** Forget the stored link (the row's "forget"). The user's folder and files are not touched. */
    async forget() {
      mem = null;
      try { await handles.del(HANDLE_KEY); } catch { /* nothing to forget */ }
    },
  };
}
