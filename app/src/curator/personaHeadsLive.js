// personaHeadsLive — #2439: the desktop half of the boot bridge. Reads the adapters canonical taste
// (<app data>/adapters/taste.json, the file the A3 nightly owns) ONCE at app start and overlays its persona
// heads onto the loaded taste, in memory — the app's own taste (localStorage) is never rewritten, and the
// store stays the trainer's. #2398 (A5): the same read also overlays the store's learned relation offsets
// (the taste's `relations` section) under the same law. Every failure is silent by ruling (Matt, 2026-11-21): not the desktop build, no
// store, an unreadable file, no taste loaded — no notice, no log, no readout entry; the band simply plays on
// rules exactly as it did before the bridge existed. The Queen's head (A6, #2399) rides this same bridge
// when it exists; nothing here surfaces any head anywhere. The horns' voice heads (A7, #2400)
// ride it too, under the same law — they surface nowhere either.
import { isTauriRuntime } from '../platform/desktop.mjs';
import {
  personasOverlayFromStoreText,
  relationsOverlayFromStoreText,
  queenTimingOverlayFromStoreText,
  voiceOverlayFromStoreText,
  headsFingerprint,
  changedHeadEntries,
  launchNoteLine,
} from './personaHeadsBridge.mjs';
import {
  getTaste,
  overlayPersonasSection,
  overlayRelationsSection,
  overlayQueenTimingSection,
  overlayVoiceSection,
} from './tasteStore.js';

export const ADAPTERS_DIR = 'adapters';
export const ADAPTERS_TASTE_FILE = 'taste.json';

// #2397 (A4) — the launch note's home. The note is a DEV-readout line, never a surface of its own:
// it is written here at boot when the loaded heads changed, and it stays until the next head change
// replaces it (no seen/unseen state). The snapshot is the previous boot's overlay, the baseline the
// change is measured against; both live in localStorage beside the taste, and both are best-effort.
export const HEADS_SNAPSHOT_KEY = 'kc:persona-heads:snapshot';
export const LAUNCH_NOTE_KEY = 'kc:persona-heads:launch-note';

const storageOf = (deps) => deps.storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);

/** The current launch note line, or null. Read by the DEV readout (A4); shown nowhere else. */
export function getLaunchNote(deps = {}) {
  try {
    const s = storageOf(deps);
    return (s && s.getItem(LAUNCH_NOTE_KEY)) || null;
  } catch {
    return null;
  }
}

/**
 * After a boot load lands: if the store's heads changed since the last boot, replace the launch
 * note with the new change's line and remember the new baseline. No change → the note stands.
 */
function noteHeadChanges(overlay, deps) {
  try {
    const s = storageOf(deps);
    if (!s) return;
    let prev = null;
    try {
      prev = JSON.parse(s.getItem(HEADS_SNAPSHOT_KEY) || 'null');
    } catch {
      prev = null;
    }
    if (!prev || prev.fingerprint !== headsFingerprint(overlay)) {
      const line = launchNoteLine(changedHeadEntries(prev ? prev.section : null, overlay));
      if (line) s.setItem(LAUNCH_NOTE_KEY, line);
      s.setItem(HEADS_SNAPSHOT_KEY, JSON.stringify({ fingerprint: headsFingerprint(overlay), section: overlay }));
    }
  } catch {
    // the note is a courtesy line in a DEV readout; a storage failure changes nothing else
  }
}

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
    const applyRelations = deps.overlayRelations || overlayRelationsSection;
    const applyQueenTiming = deps.overlayQueenTiming || overlayQueenTimingSection;
    const applyVoice = deps.overlayVoice || overlayVoiceSection;
    const path = await join(await appDataDir(), ADAPTERS_DIR, ADAPTERS_TASTE_FILE);
    const storeText = await readTextFile(path);
    const overlay = personasOverlayFromStoreText(storeText);
    const relOverlay = relationsOverlayFromStoreText(storeText);
    const queenOverlay = queenTimingOverlayFromStoreText(storeText);
    const voiceOverlay = voiceOverlayFromStoreText(storeText);
    if (!overlay && !relOverlay && !queenOverlay && !voiceOverlay)
      return { ok: false, reason: 'the store carries no loadable heads' };
    if (!readTaste()) return { ok: false, reason: 'no taste loaded' };
    let landed = false;
    if (overlay) landed = apply(overlay) || landed;
    if (relOverlay) landed = applyRelations(relOverlay) || landed;
    if (queenOverlay) landed = applyQueenTiming(queenOverlay) || landed;
    if (voiceOverlay) landed = applyVoice(voiceOverlay) || landed;
    if (!landed) return { ok: false, reason: 'no taste loaded' };
    if (overlay) noteHeadChanges(overlay, deps);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: short(e) };
  }
}
