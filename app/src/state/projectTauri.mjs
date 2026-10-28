// projectTauri.mjs — #1709: the desktop backend of projectFs (projectFs.mjs), over the native project commands
// (src-tauri/src/project.rs). The loot folder's shape (lootNative.mjs): nothing throws; the web build gets an honest
// "desktop only"; native replies are untrusted and shaped here. A native message that starts with `unreachable:` becomes
// `{ unreachable: true }` — the signal projectSession pauses and protects on.
//
// The Tauri API is imported lazily, inside the call, so this module loads in a browser and in node (the selfchecks).
import { isTauriRuntime } from '../platform/desktop.mjs';

export const DESKTOP_ONLY = 'Project folders need the desktop app (or Chrome/Edge, coming later).';
const UNREACHABLE = 'unreachable:';
const MAX_TEXT = 32 * 1024 * 1024;

const short = (e) =>
  String((e && e.message) || e || 'failed')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
const validPath = (p) => typeof p === 'string' && p.length > 0 && p.length <= 4096 && !p.includes('\0');
const shapeNames = (v) => {
  const out = [];
  for (const e of Array.isArray(v) ? v : []) {
    if (out.length >= 10000) break;
    if (e && typeof e.name === 'string' && e.name.length > 0 && e.name.length <= 255)
      out.push({ name: e.name, dir: e.dir === true });
  }
  return out;
};

/**
 * @param invoke    (cmd, args) => Promise — Tauri's invoke, injected for the selfcheck (absent: loaded lazily)
 * @param pick      (options) => Promise<string|string[]|null> — the folder dialog (absent: loaded lazily)
 * @param isDesktop () => boolean
 */
export function createTauriProjectFs({ invoke = null, pick = null, isDesktop = isTauriRuntime } = {}) {
  const call = async (cmd, args) => {
    if (!isDesktop()) return { ok: false, reason: DESKTOP_ONLY };
    try {
      const inv = invoke || (await import('@tauri-apps/api/tauri')).invoke;
      return { ok: true, value: await inv(cmd, args) };
    } catch (e) {
      const msg = short(e);
      return msg.startsWith(UNREACHABLE)
        ? {
            ok: false,
            unreachable: true,
            reason: msg.slice(UNREACHABLE.length).trim() || 'the folder is not reachable',
          }
        : {
            ok: false,
            exists: /already exists/.test(msg) || undefined,
            missing: /^no such /.test(msg) || undefined,
            reason: msg,
          };
    }
  };
  const choose = async (title) => {
    if (!isDesktop()) return { ok: false, reason: DESKTOP_ONLY };
    try {
      const dlg = pick || (await import('@tauri-apps/api/dialog')).open;
      const r = await dlg({ directory: true, multiple: false, title });
      const path = Array.isArray(r) ? r[0] : r;
      return { ok: true, path: validPath(path) ? path : null };
    } catch (e) {
      return { ok: false, reason: short(e) };
    }
  };
  const bad = { ok: false, reason: 'not a folder path' };
  const relOk = (rel) => typeof rel === 'string' && rel.length > 0 && rel.length <= 512;

  return {
    unavailable: () => (isDesktop() ? null : DESKTOP_ONLY),
    pickParent: () => choose('Where should the project folder go?'),
    pickProject: () => choose('Open a KC-1 project folder'),
    async listNames(dir) {
      if (!validPath(dir)) return bad;
      const r = await call('project_list_names', { dir });
      return r.ok ? { ok: true, names: shapeNames(r.value) } : r;
    },
    async makeFolder(parent, name) {
      if (!validPath(parent) || typeof name !== 'string' || !name) return bad;
      const r = await call('project_make_folder', { parent, name });
      if (!r.ok) return r;
      return validPath(r.value) ? { ok: true, path: r.value } : { ok: false, reason: 'bad reply' };
    },
    async reachable(root) {
      if (!validPath(root)) return { ok: true, reachable: false };
      const r = await call('project_reachable', { root });
      return r.ok ? { ok: true, reachable: r.value === true } : r;
    },
    async list(root, rel) {
      if (!validPath(root) || !relOk(rel)) return bad;
      const r = await call('project_list', { root, rel });
      return r.ok ? { ok: true, names: shapeNames(r.value) } : r;
    },
    async read(root, rel) {
      if (!validPath(root) || !relOk(rel)) return bad;
      const r = await call('project_read', { root, rel });
      if (!r.ok) return r;
      return typeof r.value === 'string' && r.value.length <= MAX_TEXT
        ? { ok: true, text: r.value }
        : { ok: false, reason: 'bad reply' };
    },
    async write(root, rel, text, { create = false } = {}) {
      if (!validPath(root) || !relOk(rel)) return bad;
      if (typeof text !== 'string') return { ok: false, reason: 'not text' };
      if (text.length > MAX_TEXT) return { ok: false, reason: 'file too large' };
      const r = await call('project_write', { root, rel, text, create: !!create });
      return r.ok ? { ok: true } : r;
    },
    async makeSubfolder(root, rel) {
      if (!validPath(root) || !relOk(rel)) return bad;
      const r = await call('project_make_subfolder', { root, rel });
      return r.ok ? { ok: true } : r;
    },
    async renameFolder(root, newName) {
      if (!validPath(root) || typeof newName !== 'string' || !newName) return bad;
      const r = await call('project_rename_folder', { root, newName });
      if (!r.ok) return r;
      return validPath(r.value) ? { ok: true, path: r.value } : { ok: false, reason: 'bad reply' };
    },
  };
}
