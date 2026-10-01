// #607 Tauri stage window. No-op in the browser.
const STAGE_LABEL = 'kc-stage';

export function isTauriRuntime() {
  return typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export async function openStageWindow() {
  if (!isTauriRuntime()) return { ok: false, reason: 'browser' };
  const { WebviewWindow } = await import('@tauri-apps/api/window');
  const existing = WebviewWindow.getByLabel(STAGE_LABEL);
  if (existing) return { ok: true, reused: true };
  const win = new WebviewWindow(STAGE_LABEL, {
    url: '/Kinetic_Curator/?boot=factory&stage=1',
    fullscreen: true,
    decorations: false,
    title: 'KC STAGE',
  });
  return { ok: true, reused: false, label: win.label };
}

export async function closeStageWindow() {
  if (!isTauriRuntime()) return { ok: false, reason: 'browser' };
  const { WebviewWindow } = await import('@tauri-apps/api/window');
  const existing = WebviewWindow.getByLabel(STAGE_LABEL);
  if (!existing) return { ok: true };
  await existing.close();
  return { ok: true };
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
