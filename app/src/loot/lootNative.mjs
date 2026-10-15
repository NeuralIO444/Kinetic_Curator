// lootNative.mjs — #1479: the thin JS side of the three native commands (src-tauri/src/loot.rs). Every call returns
// { ok: true, ... } or { ok: false, reason }: nothing throws, and the web build gets an honest "desktop only", not a
// dead button. Replies from the native side are treated as untrusted and shaped here.
//
// The Tauri API is imported lazily, inside the call, so this module loads in a browser and in node (the selfchecks).
import { isTauriRuntime, desktopGlobals, DESKTOP_CHECK_CONFIRMED } from '../platform/desktop.mjs';
import { DESKTOP_ONLY, NOT_CONFIRMED } from './lootCopy.mjs';

export const MAX_ENTRIES = 20000;
const MAX_B64 = 90 * 1024 * 1024; // ~64 MB of bytes
const HEX64 = /^[0-9a-f]{64}$/;

const short = (e) => String((e && e.message) || e || 'failed').replace(/\s+/g, ' ').slice(0, 160);
const num = (v) => (Number.isFinite(v) && v >= 0 ? v : null);

/** A scan reply as a clean one. */
export function shapeScan(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const entries = [];
  for (const e of Array.isArray(r.entries) ? r.entries : []) {
    if (entries.length >= MAX_ENTRIES) break;
    if (!e || typeof e.rel !== 'string' || e.rel.length === 0 || e.rel.length > 512) continue;
    const size = num(e.size); const mtimeMs = num(e.mtimeMs);
    if (size === null || mtimeMs === null) continue;
    entries.push({ rel: e.rel, size, mtimeMs });
  }
  const skipped = [];
  for (const s of Array.isArray(r.skipped) ? r.skipped : []) {
    if (skipped.length >= 2000) break;
    if (!s || typeof s.rel !== 'string' || s.rel.length > 512) continue;
    skipped.push({ rel: s.rel, reason: typeof s.reason === 'string' ? s.reason.slice(0, 160) : 'skipped' });
  }
  return { reachable: r.reachable === true, entries, skipped, truncated: r.truncated === true };
}

/**
 * @param invoke    (cmd, args) => Promise: Tauri's invoke, injected so a selfcheck can drive it. Absent: loaded lazily.
 * @param isDesktop () => boolean
 * @param pick      (options) => Promise<string|string[]|null>: the folder dialog, injected for tests (absent: lazy)
 * @param confirmed whether Matt has confirmed the desktop check on the Mac
 */
export function createLootNative({ invoke = null, pick = null, isDesktop = isTauriRuntime, confirmed = DESKTOP_CHECK_CONFIRMED } = {}) {
  const gate = () => {
    if (!isDesktop()) return { ok: false, reason: DESKTOP_ONLY };
    if (!confirmed) return { ok: false, reason: NOT_CONFIRMED };
    return null;
  };
  const call = async (cmd, args) => {
    const g = gate();
    if (g) return g;
    try {
      const inv = invoke || (await import('@tauri-apps/api/tauri')).invoke;
      return { ok: true, value: await inv(cmd, args) };
    } catch (e) {
      return { ok: false, reason: short(e) };
    }
  };
  const validRoot = (root) => typeof root === 'string' && root.length > 0 && root.length <= 1024 && !root.includes('\0');
  return {
    /** Why the native calls are unavailable right now, or null when they are available. */
    unavailable: () => { const g = gate(); return g ? g.reason : null; },
    /** The native folder picker. { ok: true, path } on a pick, { ok: true, path: null } on cancel. */
    async pickFolder() {
      const g = gate();
      if (g) return g;
      try {
        const dlg = pick || (await import('@tauri-apps/api/dialog')).open;
        const r = await dlg({ directory: true, multiple: false, title: 'Point KC-1 at your loot folder' });
        const path = Array.isArray(r) ? r[0] : r;
        return { ok: true, path: typeof path === 'string' && path.length > 0 && path.length <= 1024 && !path.includes('\0') ? path : null };
      } catch (e) {
        return { ok: false, reason: short(e) };
      }
    },
    async scan(root) {
      if (!validRoot(root)) return { ok: false, reason: 'not a folder path' };
      const r = await call('loot_scan', { root });
      return r.ok ? { ok: true, ...shapeScan(r.value) } : r;
    },
    async hash(root, rel) {
      if (!validRoot(root) || typeof rel !== 'string' || !rel) return { ok: false, reason: 'not a file path' };
      const r = await call('loot_hash', { root, rel });
      if (!r.ok) return r;
      return typeof r.value === 'string' && HEX64.test(r.value) ? { ok: true, hash: r.value } : { ok: false, reason: 'unreadable: bad hash' };
    },
    async read(root, rel) {
      if (!validRoot(root) || typeof rel !== 'string' || !rel) return { ok: false, reason: 'not a file path' };
      const r = await call('loot_read', { root, rel });
      if (!r.ok) return r;
      if (typeof r.value !== 'string' || r.value.length > MAX_B64) return { ok: false, reason: 'unreadable: bad reply' };
      try {
        const bin = atob(r.value);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { ok: true, bytes };
      } catch {
        return { ok: false, reason: 'unreadable: bad encoding' };
      }
    },
  };
}

/** What the loot row's disabled line adds: the Tauri globals this window carries, so the check can be confirmed by eye. */
export function seenLine(w) {
  const g = desktopGlobals(w);
  return g.length ? `sees ${g.join(', ')}` : 'sees no desktop globals';
}
