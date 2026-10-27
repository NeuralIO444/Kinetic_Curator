// desktop.mjs — is this the Tauri desktop shell? ONE answer for the whole app.
//
// Three modules each carried their own copy of `window.__TAURI_INTERNALS__ || window.__TAURI__`. Those are the Tauri
// v2 names (and `__TAURI__` exists in v1 only with `withGlobalTauri`, which tauri.conf.json does not set). The shell is
// Tauri 1.8, whose webview carries `__TAURI_IPC__` and `__TAURI_METADATA__` (the @tauri-apps/api invoke is built on the
// first). This asks for all four, so it is a superset of what every caller checked: nothing that reported desktop before
// can stop reporting it.
//
// The loot folder (#1479) additionally waits for DESKTOP_CHECK_CONFIRMED: Matt confirms once on the real Mac (the loot
// row shows which globals it sees), and only then is the flag flipped in its own PR.
export const TAURI_GLOBALS = Object.freeze(['__TAURI_IPC__', '__TAURI_METADATA__', '__TAURI_INTERNALS__', '__TAURI__']);

/**
 * The loot folder's native calls are open on desktop. Confirmed on the real Mac (2026-10-14): the window carries
 * __TAURI_IPC__, __TAURI_METADATA__ and __TAURI__, and scan / hash / read ran end to end through it. Matt's approval of
 * the PR that flipped this is the confirmation.
 */
export const DESKTOP_CHECK_CONFIRMED = true;

const win = () => (typeof window !== 'undefined' ? window : undefined);

/** Which of the Tauri globals this window carries (for the diagnostic line; never throws). */
export function desktopGlobals(w = win()) {
  if (!w || (typeof w !== 'object' && typeof w !== 'function')) return [];
  return TAURI_GLOBALS.filter((k) => {
    try {
      return w[k] !== undefined && w[k] !== null && w[k] !== false;
    } catch {
      return false;
    }
  });
}

/** True in the Tauri desktop shell, false in a browser and in node. */
export function isTauriRuntime(w = win()) {
  return desktopGlobals(w).length > 0;
}
