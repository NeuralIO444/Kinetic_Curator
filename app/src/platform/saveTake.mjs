// saveTake.mjs — #1938: a recorded take (.kcperf) has to land on disk in the desktop app.
//
// The browser saves a take with a synthetic <a download> click. The Tauri v1 webview swallows that: no dialog, no file,
// the bytes are generated and thrown away. So on desktop the take is written natively instead — through the file-write
// the shell already allows (tauri.conf.json: fs.writeFile + createDir, scoped to $APPDATA) — into `<appData>/takes/`.
// No dialog (the shell allows only dialog.open) and no Rust: the path is returned so the UI can say where the take went.
//
// The Tauri API is imported lazily, inside the call, so this module loads in a browser and in node (the selfchecks);
// every dependency is injectable for the selfcheck. Never throws: { ok: true, path } or { ok: false, reason }.
import { isTauriRuntime } from './desktop.mjs';

export const TAKES_DIR = 'takes';
/** A take is a small gzip (the take selfchecks pin it well under this); refuse an absurd write rather than hang the shell. */
export const MAX_TAKE_BYTES = 256 * 1024 * 1024;

/** A file name that cannot leave the takes folder: the last path segment, no control characters, `.kcperf` kept. */
export function safeTakeName(name) {
  let n = String(name ?? '')
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  if (!n) n = 'take';
  if (!/\.kcperf$/i.test(n)) n += '.kcperf';
  return n.slice(-120);
}

const short = (e) =>
  String((e && e.message) || e || 'failed')
    .replace(/\s+/g, ' ')
    .slice(0, 160);

/**
 * @param bytes    Uint8Array of the take
 * @param filename the take's file name
 * @param deps     { isDesktop, appDataDir, join, createDir, writeBinaryFile } — injected by the selfcheck; absent, the
 *                 Tauri v1 API is loaded lazily
 */
export async function saveTakeNative(bytes, filename, deps = {}) {
  const isDesktop = deps.isDesktop || isTauriRuntime;
  if (!isDesktop()) return { ok: false, reason: 'desktop only' };
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return { ok: false, reason: 'nothing to save' };
  if (bytes.length > MAX_TAKE_BYTES) return { ok: false, reason: 'take too large' };
  try {
    const pathApi = deps.appDataDir && deps.join ? null : await import('@tauri-apps/api/path');
    const fsApi = deps.createDir && deps.writeBinaryFile ? null : await import('@tauri-apps/api/fs');
    const appDataDir = deps.appDataDir || pathApi.appDataDir;
    const join = deps.join || pathApi.join;
    const createDir = deps.createDir || fsApi.createDir;
    const writeBinaryFile = deps.writeBinaryFile || fsApi.writeBinaryFile;
    const dir = await join(await appDataDir(), TAKES_DIR);
    await createDir(dir, { recursive: true });
    const path = await join(dir, safeTakeName(filename));
    await writeBinaryFile(path, bytes);
    return { ok: true, path };
  } catch (e) {
    return { ok: false, reason: short(e) };
  }
}

/** The browser way: a synthetic <a download> click (the web build; unchanged from before #1938). */
export function downloadInBrowser(bytes, filename, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return false;
  const a = doc.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/gzip' }));
  a.download = filename;
  a.rel = 'noopener';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return true;
}

/**
 * Save a take the right way for where it is running. Returns a one-line note for the UI: '' on a plain browser download,
 * "saved to <path>" on desktop, or why the desktop save failed (the take is then offered the browser way as a last try).
 */
export async function saveTake(bytes, filename, deps = {}) {
  const isDesktop = deps.isDesktop || isTauriRuntime;
  if (!isDesktop()) {
    (deps.download || downloadInBrowser)(bytes, filename);
    return '';
  }
  const r = await saveTakeNative(bytes, filename, deps);
  if (r.ok) return `saved to ${r.path}`;
  (deps.download || downloadInBrowser)(bytes, filename); // never lose a take to a failed native write
  return `could not save the take natively (${r.reason}); tried a download`;
}
