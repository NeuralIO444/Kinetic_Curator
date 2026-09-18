// ─── The Curator — taste-guided selection over randomized candidates ────────
// The CURATOR button rolls CURATE_CANDIDATES full scenes over the unlocked
// params and keeps the one the curator engine ranks highest.
//
// Engine contract: a curator implements pick(candidates) -> index, and
// status() -> 'active' | 'untrained'. The MLX curator (studio/curator.py +
// docs/MLX_CURATOR_RUNBOOK.md) ranks by embedding similarity to kept renders
// once the Mac Studio runbook has produced a taste artifact; it plugs in at
// getActiveCurator() below.
//
// Today no taste artifact ships with the app, so getActiveCurator() returns
// the null curator: pick() declines (-1), the caller falls back to a uniform
// dice roll, and the UI says "curator untrained" instead of pretending the
// pick was tasted. Never fake curation.

export const CURATE_CANDIDATES = 8;

/** No model on file. Declines every pick; the caller dice-rolls honestly. */
export function nullCurator() {
  return {
    name: 'null',
    status: () => 'untrained',
    pick: () => -1,
  };
}

/**
 * Resolve the active curator engine. Single attach point for the future
 * MLX-backed curator — when a taste artifact ships, return it here.
 */
export function getActiveCurator() {
  return nullCurator();
}

/**
 * Pick one candidate. Returns { index, curated } — curated is false when the
 * engine declined (or misbehaved) and the pick fell back to a uniform roll.
 */
export function pickCurated(candidates, curator) {
  const n = candidates.length;
  if (n === 0) return { index: -1, curated: false };
  let idx;
  try {
    idx = curator.pick(candidates);
  } catch {
    idx = -1;
  }
  if (!Number.isInteger(idx) || idx < 0 || idx >= n) {
    return { index: Math.floor(Math.random() * n), curated: false };
  }
  return { index: idx, curated: true };
}

/** UI hint copy for the curator's state. Honest about the untrained case. */
export function curatorHint(curator) {
  return curator.status() === 'active'
    ? 'curated pick'
    : 'curator untrained · dice roll';
}
