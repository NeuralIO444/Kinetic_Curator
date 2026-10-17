// lootSession.mjs — #1479 slice 5c: the loot folder for a browser with no folder-handle API (Safari, Firefox). The
// browser's own folder chooser (an <input webkitdirectory>) hands over the files for THIS VISIT only: nothing is kept,
// no link survives a reload, so the next visit asks again. Same four calls as lootNative/lootWeb, so the planner, the
// index and the row do not care. Nothing is ever written.
//
// Pure of the page: the window, the input and the digest are injected, so a selfcheck drives it with fake files.
import { relSegments } from './lootClassify.mjs';
import { shapeScan, MAX_ENTRIES } from './lootNative.mjs';
import { WEB_UNSUPPORTED, SESSION_GONE } from './lootCopy.mjs';
import { SUBFOLDERS, MAX_BYTES } from './lootWeb.mjs';

export const SESSION_PREFIX = 'session:';
const mb = (n) => Math.ceil(n / (1024 * 1024));
const win = () => (typeof window !== 'undefined' ? window : undefined);
const short = (e) => String((e && e.message) || e || 'failed').replace(/\s+/g, ' ').slice(0, 160);

/** Why this browser cannot choose a folder at all, or null. Feature detection only. */
export function sessionFolderSupport(w = win()) {
  try {
    const d = w && w.document;
    if (!d || typeof d.createElement !== 'function') return WEB_UNSUPPORTED;
    return 'webkitdirectory' in d.createElement('input') ? null : WEB_UNSUPPORTED;
  } catch { return WEB_UNSUPPORTED; }
}

/** The loot-relative path of a chosen file, or null when it is outside the four subfolders (at most one wrapper folder). */
export function lootRelOf(webkitRelativePath) {
  const segs = relSegments(webkitRelativePath);
  if (!segs) return null;
  const at = segs.findIndex((s) => SUBFOLDERS.includes(s.toLowerCase()));
  if (at < 0 || at > 1 || at === segs.length - 1) return null;
  return segs.slice(at).join('/');
}

export function createLootSession({ w = win(), makeInput = null, digest = null } = {}) {
  let name = null;
  let files = new Map(); // rel -> File, this visit only
  const sha = digest || ((b) => globalThis.crypto.subtle.digest('SHA-256', b));
  const input = makeInput || (() => {
    const i = w.document.createElement('input');
    i.type = 'file'; i.webkitdirectory = true; i.multiple = true;
    return i;
  });

  const hold = (label) => {
    if (typeof label !== 'string' || !label.startsWith(SESSION_PREFIX) || label !== SESSION_PREFIX + name) return { ok: false, reason: SESSION_GONE };
    return null;
  };
  const fileFor = (label, rel) => {
    const gone = hold(label);
    if (gone) return gone;
    const f = typeof rel === 'string' ? files.get(rel) : null;
    if (!f) return { ok: false, reason: 'file not found' };
    if (f.size > MAX_BYTES) return { ok: false, reason: `file too large (${mb(f.size)} MB)` };
    return { ok: true, file: f };
  };

  return {
    unavailable: () => sessionFolderSupport(w),
    /** The browser's folder chooser. { ok: true, path } on a pick, { ok: true, path: null } on cancel. */
    pickFolder() {
      const why = sessionFolderSupport(w);
      if (why) return Promise.resolve({ ok: false, reason: why });
      return new Promise((resolve) => {
        let i;
        try { i = input(); } catch (e) { resolve({ ok: false, reason: short(e) }); return; }
        i.addEventListener('cancel', () => resolve({ ok: true, path: null }));
        i.addEventListener('change', () => {
          try {
            const list = Array.from(i.files || []);
            const next = new Map();
            let top = null;
            for (const f of list) {
              const wrp = typeof f.webkitRelativePath === 'string' ? f.webkitRelativePath : '';
              if (top === null && wrp) top = wrp.split('/')[0];
              const rel = lootRelOf(wrp);
              if (rel && next.size < MAX_ENTRIES) next.set(rel, f);
            }
            if (list.length === 0 || !top) { resolve({ ok: true, path: null }); return; }
            files = next; name = top.slice(0, 120);
            resolve({ ok: true, path: SESSION_PREFIX + name });
          } catch (e) {
            resolve({ ok: false, reason: short(e) });
          }
        });
        try { i.click(); } catch (e) { resolve({ ok: false, reason: short(e) }); }
      });
    },
    async scan(label) {
      const gone = hold(label);
      if (gone) return gone;
      const entries = [...files.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([rel, f]) => ({ rel, size: f.size, mtimeMs: f.lastModified }));
      return { ok: true, ...shapeScan({ reachable: true, entries, skipped: [], truncated: files.size >= MAX_ENTRIES }) };
    },
    async hash(label, rel) {
      const r = fileFor(label, rel);
      if (!r.ok) return r;
      try {
        const d = new Uint8Array(await sha(await r.file.arrayBuffer()));
        return { ok: true, hash: Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('') };
      } catch (e) { return { ok: false, reason: `unreadable: ${short(e)}` }; }
    },
    async read(label, rel) {
      const r = fileFor(label, rel);
      if (!r.ok) return r;
      try { return { ok: true, bytes: new Uint8Array(await r.file.arrayBuffer()) }; } catch (e) { return { ok: false, reason: `unreadable: ${short(e)}` }; }
    },
    /** Drop the files held for this visit (the folder itself is not touched). */
    forget() { name = null; files = new Map(); },
  };
}
