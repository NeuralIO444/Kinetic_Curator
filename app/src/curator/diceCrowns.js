// diceCrowns.js — the crown log: every crowned finalist, persisted.
//
// A crown = { ts, layoutId, assetIds, davisCode }. This is the training data
// the learned compatibility (curator/dice.js affinity) feeds on, and the raw
// material for the Phase C Davis head (which seeds produce keepers).
//
// Storage is localStorage (kc:dice-crowns:v1), capped — the same pattern as
// the favorites/keeps ledger in state/slices/davisSlice.js. A storage backend
// can be injected (the selfcheck uses memory).

export const DICE_CROWNS_KEY = 'kc:dice-crowns:v1';
export const DICE_CROWNS_MAX = 200;

const memStore = new Map();
const memoryBackend = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => void memStore.set(k, v),
};

function backend(storage) {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* fall through */
  }
  return memoryBackend;
}

function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const layoutId = typeof raw.layoutId === 'string' ? raw.layoutId.slice(0, 80) : '';
  const assetIds = Array.isArray(raw.assetIds)
    ? [...new Set(raw.assetIds.filter((x) => typeof x === 'string' && x))].slice(0, 12)
    : [];
  if (!layoutId || !assetIds.length) return null;
  return {
    ts: typeof raw.ts === 'number' ? raw.ts : Date.now(),
    layoutId,
    assetIds,
    davisCode: typeof raw.davisCode === 'string' ? raw.davisCode.slice(0, 24) : null,
  };
}

export function readCrowns(storage) {
  try {
    const raw = backend(storage).getItem(DICE_CROWNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(sanitize).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Record a crown; returns the updated list (newest last, capped). */
export function recordCrown(crown, storage) {
  const entry = sanitize(crown);
  if (!entry) return readCrowns(storage);
  const next = [...readCrowns(storage), entry].slice(-DICE_CROWNS_MAX);
  try {
    backend(storage).setItem(DICE_CROWNS_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[dice] crown log save failed', e);
  }
  return next;
}

/** How many crowns pair these two assets — the learned signal, summarized. */
export function crownPairCount(aId, bId, crowns) {
  let n = 0;
  for (const c of crowns || []) {
    const ids = c.assetIds || [];
    if (ids.includes(aId) && ids.includes(bId)) n++;
  }
  return n;
}
