// #607 Tauri stage window (STAGE Phase B). No-op in the browser — every
// entry point returns an honest {ok:false, reason} instead of throwing.
import { normalizeMonitors } from './stageDisplays.mjs';
import { makeCloseMessage, STAGE_CONTROL_CHANNEL } from './stageChannel.mjs';

const STAGE_LABEL = 'kc-stage';

export function isTauriRuntime() {
  return typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

/**
 * Enumerate displays via Tauri. In the browser there is no honest way to
 * enumerate displays, so this says so instead of guessing.
 * @returns {Promise<{ok:boolean, reason?:string, displays:Array}>}
 */
export async function listStageDisplays() {
  if (!isTauriRuntime()) {
    return { ok: false, reason: 'browser — display enumeration needs the desktop (Tauri) app', displays: [] };
  }
  try {
    const { availableMonitors } = await import('@tauri-apps/api/window');
    const raw = await availableMonitors();
    return { ok: true, displays: normalizeMonitors(raw) };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e), displays: [] };
  }
}

/**
 * Open the stage window fullscreen on a specific display. The window is
 * positioned onto the display first, then fullscreened — fullscreen lands
 * on the monitor containing the window.
 * @returns {Promise<{ok:boolean, reason?:string, reused?:boolean}>}
 */
export async function openStageWindow(display) {
  if (!isTauriRuntime()) return { ok: false, reason: 'browser' };
  const { WebviewWindow } = await import('@tauri-apps/api/window');
  const existing = WebviewWindow.getByLabel(STAGE_LABEL);
  if (existing) {
    try { await existing.setFocus(); } catch { /* best-effort */ }
    return { ok: true, reused: true };
  }
  const opts = {
    url: '/Kinetic_Curator/?boot=factory&stage=1',
    fullscreen: false,
    decorations: false,
    title: 'KC STAGE',
    skipTaskbar: true,
  };
  if (display && Number.isFinite(display.x) && Number.isFinite(display.y)) {
    opts.x = display.x;
    opts.y = display.y;
  }
  const win = new WebviewWindow(STAGE_LABEL, opts);
  try {
    await win.setFullscreen(true);
  } catch (e) {
    // The window exists but is not fullscreen — loud, not silent: the
    // caller surfaces this and the stage still shows the signal windowed.
    return { ok: true, reused: false, label: win.label, fullscreenFailed: String((e && e.message) || e) };
  }
  return { ok: true, reused: false, label: win.label };
}

export async function closeStageWindow() {
  if (!isTauriRuntime()) return { ok: false, reason: 'browser' };
  try {
    // Tell the stage to close itself first (it splashes CLOSED); the
    // window close below is the backstop.
    try {
      const bc = new BroadcastChannel(STAGE_CONTROL_CHANNEL);
      bc.postMessage(makeCloseMessage());
      bc.close();
    } catch { /* channel unavailable — fall through to window close */ }
    const { WebviewWindow } = await import('@tauri-apps/api/window');
    const existing = WebviewWindow.getByLabel(STAGE_LABEL);
    if (!existing) return { ok: true };
    await existing.close();
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
  return { ok: true };
}

/**
 * Watch the staging display while the stage is up. Polls the enumeration:
 * if the selected display vanishes (unplugged), onGone fires — the caller
 * closes the stage and fails OUT LOUD. If the user closed the stage window
 * directly, onWindowClosed fires so the mode chip stops lying.
 * @returns {() => void} stop function
 */
export function watchStageDisplay({ getDisplayId, onGone, onWindowClosed, intervalMs = 2000 } = {}) {
  let stopped = false;
  let timer = 0;
  const tick = async () => {
    if (stopped) return;
    try {
      const { WebviewWindow, availableMonitors } = await import('@tauri-apps/api/window');
      const id = getDisplayId ? getDisplayId() : null;
      if (id) {
        const raw = await availableMonitors();
        const displays = normalizeMonitors(raw);
        if (!displays.some((d) => d.id === id)) {
          stopped = true;
          if (onGone) onGone(id);
          return;
        }
      }
      if (!WebviewWindow.getByLabel(STAGE_LABEL)) {
        stopped = true;
        if (onWindowClosed) onWindowClosed();
        return;
      }
    } catch { /* transient Tauri hiccup — keep watching, never fail silently into a stop */ }
    if (!stopped) timer = setTimeout(tick, Math.max(500, intervalMs));
  };
  timer = setTimeout(tick, Math.max(500, intervalMs));
  return () => { stopped = true; clearTimeout(timer); };
}

export async function syphonStatus() {
  if (!isTauriRuntime()) return { available: false, reason: 'Syphon is Mac / Tauri only' };
  try {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return await invoke('syphon_status');
  } catch (e) {
    return { available: false, reason: String(e?.message || e) };
  }
}
