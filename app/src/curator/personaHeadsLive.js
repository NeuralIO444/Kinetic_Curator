// personaHeadsLive — #2439: the desktop half of the boot bridge. Reads the adapters canonical taste
// (<app data>/adapters/taste.json, the file the A3 nightly owns) ONCE at app start and overlays its persona
// heads onto the loaded taste, in memory — the app's own taste (localStorage) is never rewritten, and the
// store stays the trainer's. Every failure is silent by ruling (Matt, 2026-11-21): not the desktop build, no
// store, an unreadable file, no taste loaded — no notice, no log, no readout entry; the band simply plays on
// rules exactly as it did before the bridge existed. The Queen's head (A6, #2399) rides this same bridge
// when it exists; nothing here surfaces any head anywhere.
import { isTauriRuntime } from '../platform/desktop.mjs';
import { personasOverlayFromStoreText } from './personaHeadsBridge.mjs';
import { getTaste, overlayPersonasSection } from './tasteStore.js';

export const ADAPTERS_DIR = 'adapters';
export const ADAPTERS_TASTE_FILE = 'taste.json';

const short = (e) =>
  String((e && e.message) || e || 'failed')
    .replace(/\s+/g, ' ')
    .slice(0, 160);

/**
 * @param deps { isDesktop, appDataDir, join, readTextFile, getTaste, overlay } — injected by the selfcheck;
 *             absent, the Tauri v1 API is loaded lazily and the real taste store is used.
 * @returns { ok, reason? } — the reason is for tests only; the app never shows it (ruling 2: no trace).
 */
export async function loadPersonaHeadsAtBoot(deps = {}) {
  const isDesktop = deps.isDesktop || isTauriRuntime;
  if (!isDesktop()) return { ok: false, reason: 'desktop only' };
  try {
    const pathApi = deps.appDataDir && deps.join ? null : await import('@tauri-apps/api/path');
    const fsApi = deps.readTextFile ? null : await import('@tauri-apps/api/fs');
    const appDataDir = deps.appDataDir || pathApi.appDataDir;
    const join = deps.join || pathApi.join;
    const readTextFile = deps.readTextFile || fsApi.readTextFile;
    const readTaste = deps.getTaste || getTaste;
    const apply = deps.overlay || overlayPersonasSection;
    const path = await join(await appDataDir(), ADAPTERS_DIR, ADAPTERS_TASTE_FILE);
    const overlay = personasOverlayFromStoreText(await readTextFile(path));
    if (!overlay) return { ok: false, reason: 'the store carries no loadable heads' };
    if (!readTaste()) return { ok: false, reason: 'no taste loaded' };
    return apply(overlay) ? { ok: true } : { ok: false, reason: 'no taste loaded' };
  } catch (e) {
    return { ok: false, reason: short(e) };
  }
}
