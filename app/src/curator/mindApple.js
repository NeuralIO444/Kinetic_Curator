// mindApple.js — #1463 Mind 2: the Apple Intelligence backend, reached through the desktop app's kc-mind helper.
//
// The default model whenever it is available (Matt, 2026-10-13). On the web, or when the Mac has no Apple
// Intelligence, it reports unavailable and the rules answer, silently: no UI says which backend answered, there is no
// model to pick, download or point at. The helper is on-device only (no cloud AI).
//
// Every reply is a proposal: the thinker validates it against the Mind 1 contract and drops anything malformed.
import { isTauriRuntime } from '../platform/desktop.mjs'; // one desktop check for the whole app

export const ASK_TIMEOUT_MS = 300; // the hard cap the app asks for (the helper bridge clamps to it too)
/**
 * #2154 (H1) — the JS-side backstop on an ask: 10x the helper's own cap, the status path's budget.
 * The native side enforces its 300 ms itself (the bridge sends its cancel and answers "timeout"), so
 * this race can only fire when the native side wedges without answering at all — the one case where
 * the invoke promise would never settle, the thinker's single flight for that persona would stay open
 * forever, and that persona would silently never get an Apple answer again. The race rejects as a
 * timeout, the thinker closes the flight as a failed one, and the rules answer: nothing surfaces.
 */
export const ASK_JS_TIMEOUT_MS = 3000;

export const isDesktop = () => isTauriRuntime();

/**
 * @param invoke (cmd, args) => Promise — Tauri's invoke (injected so selfcheck can drive it)
 * @param jsTimeoutMs the JS-side ask backstop (ASK_JS_TIMEOUT_MS; injected so selfcheck can drive it)
 * @returns the model backend for startMind: { name: 'apple', available(), info(), check(), ask() }
 */
export function createAppleModel({ invoke, jsTimeoutMs = ASK_JS_TIMEOUT_MS }) {
  let info = { available: false, reason: 'not checked yet' };
  const setInfo = (s) => {
    info =
      s && s.available === true
        ? {
            available: true,
            model: typeof s.model === 'string' ? s.model : 'apple',
            os: typeof s.os === 'string' ? s.os : null,
          }
        : {
            available: false,
            reason: s && typeof s.reason === 'string' ? s.reason.slice(0, 200) : 'unavailable',
            os: s && typeof s.os === 'string' ? s.os : null,
          };
    return info;
  };
  return {
    name: 'apple',
    available: () => info.available,
    /** { available, model?, os?, reason? } as of the last check */
    info: () => ({ ...info }),
    /** The capability check: macOS version + Apple Intelligence availability. Never throws. */
    async check() {
      try {
        return setInfo(await invoke('mind_status'));
      } catch (e) {
        return setInfo({ available: false, reason: String(e && e.message ? e.message : e) });
      }
    },
    /** One persona's reply, or a rejection (timeout, error, unavailable): the rules then answer that bar. */
    async ask(persona, context, { seed = 0, bar = 0 } = {}) {
      let timer = null;
      let r;
      try {
        r = await Promise.race([
          invoke('mind_ask', { persona, context, seed: seed >>> 0, bar, timeoutMs: ASK_TIMEOUT_MS }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('timeout')), jsTimeoutMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (r && r.error === 'unavailable') setInfo({ available: false, reason: 'helper reported unavailable' });
      if (!r || r.reply == null) throw new Error((r && r.error) || 'no reply');
      return r.reply;
    },
  };
}

/** The desktop app's model, or null on the web. */
export async function desktopAppleModel() {
  if (!isDesktop()) return null;
  const { invoke } = await import('@tauri-apps/api/tauri');
  const m = createAppleModel({ invoke });
  await m.check();
  return m;
}
