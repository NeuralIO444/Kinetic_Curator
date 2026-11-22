// projectLock.mjs — #1711 (PR-2): the project ownership lock. Pure: text in, text out, staleness arithmetic.
//
// The lock lives at .kc/lock.json inside the project folder: { kind, v, projectId, owner, at, released }.
// `owner` is the owning window's instance id; `at` is its last heartbeat (ISO, the owner's clock). The first window
// to open a project claims it and holds autosave; a second window opens read-only. A claim is taken over only when
// the lock is released or its heartbeat has been silent for LOCK_STALE_MS — and a takeover is always said plainly
// (the session reports it; the row and the boot notice show it). Nothing here deletes: a close RELEASES the lock by
// writing it back with `released: true` (the fs layer's standing law is that nothing deletes a file).
export const LOCK_DIR = '.kc';
export const LOCK_FILE = '.kc/lock.json';
/** Heartbeat silence after which a lock may be taken over (Matt's ruling, 2026-11-21: ~30 s, a named constant). */
export const LOCK_STALE_MS = 30_000;
export const LOCK_KIND = 'kc-project-lock';
export const LOCK_VERSION = 1;

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** A lock text. `released: true` marks a clean close: the next opener claims at once, no staleness wait. */
export function writeLock({ projectId, owner, at, released = false }) {
  if (typeof projectId !== 'string' || !projectId) throw new Error('writeLock: projectId required');
  if (typeof owner !== 'string' || !owner) throw new Error('writeLock: owner required');
  if (typeof at !== 'string') throw new Error('writeLock: at must be an ISO string (the caller owns the clock)');
  return `${JSON.stringify({ kind: LOCK_KIND, v: LOCK_VERSION, projectId, owner, at, released: !!released }, null, 2)}\n`;
}

/** Read a lock. Never throws; a corrupt or foreign file reads as no lock (claimable, never a crash). */
export function readLock(text) {
  let raw;
  try {
    raw = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return { ok: false };
  }
  if (!isObj(raw) || raw.kind !== LOCK_KIND) return { ok: false };
  if (typeof raw.owner !== 'string' || !raw.owner || typeof raw.at !== 'string') return { ok: false };
  return {
    ok: true,
    lock: {
      projectId: typeof raw.projectId === 'string' ? raw.projectId : null,
      owner: raw.owner,
      at: raw.at,
      released: raw.released === true,
    },
  };
}

/** Silent for longer than the stale window (an unreadable heartbeat counts as silent since forever). */
export function lockIsStale(lock, nowIso, staleMs = LOCK_STALE_MS) {
  const at = Date.parse(lock && lock.at);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(at) || !Number.isFinite(nowMs)) return true;
  return nowMs - at > staleMs;
}

/** The lock is held by another window, live: not released, not ours, heartbeat still fresh. */
export function lockHeldByOther(lock, instanceId, nowIso) {
  return !!lock && !lock.released && lock.owner !== instanceId && !lockIsStale(lock, nowIso);
}
