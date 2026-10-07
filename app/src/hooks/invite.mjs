// invite.mjs — when a button should shimmer (#1103). Pure.
//
// KINETIC and CURATOR carry the same slow sheen as the AUDIO button: it INVITES a press, it does not nag. It
// runs until the button has been used, goes quiet while it is in use, and comes back after a minute of idle.
// (AUDIO's sheen stops when audio is on; these are verbs, so "used" is the press.)

/** A minute without a press and the invitation comes back. */
export const INVITE_IDLE_MS = 60_000;

/**
 * @param {number|null|undefined} lastUsedAt ms timestamp of the last press, or null if never pressed
 * @param {number} now ms timestamp
 */
export const inviteActive = (lastUsedAt, now, idleMs = INVITE_IDLE_MS) =>
  lastUsedAt == null || !Number.isFinite(lastUsedAt) || now - lastUsedAt >= idleMs;

/** A tiny shared store: which buttons were pressed when. `setTimer` is injectable for the selfcheck. */
export function createInvites({ idleMs = INVITE_IDLE_MS, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const last = new Map(); const timers = new Map(); const listeners = new Set();
  const notify = () => listeners.forEach((f) => f());
  return {
    /** The button was pressed: quiet now, back after `idleMs` of no presses. */
    use(key) {
      last.set(key, now());
      clearTimer(timers.get(key));
      timers.set(key, setTimer(() => { timers.delete(key); notify(); }, idleMs));
      notify();
    },
    active: (key) => inviteActive(last.get(key), now(), idleMs),
    subscribe: (f) => { listeners.add(f); return () => listeners.delete(f); },
  };
}
