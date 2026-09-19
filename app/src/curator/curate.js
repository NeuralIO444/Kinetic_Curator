// ─── The Curator — taste-guided selection over randomized candidates ────────
// The CURATOR button rolls CURATE_CANDIDATES full scenes over the unlocked
// params and keeps the one the curator engine ranks highest.
//
// Engine contract: a curator implements pick(candidates) -> index, and
// status() -> 'active' | 'untrained'. Scorers plug in at getActiveCurator()
// below, highest priority first:
//
//   1. MLX curator (studio/curator.py + docs/MLX_CURATOR_RUNBOOK.md) — ranks
//      by embedding similarity to kept renders once the Mac Studio runbook
//      has produced a taste artifact. NOT TRAINED YET: mlxCurator() returns
//      null until that run happens, and nothing here pretends otherwise.
//   2. Persona curator (taste.js) — interim taste: measures 15 real visual
//      features per candidate and scores them against the active persona's
//      distilled Loves/Avoids. Honest about being a stand-in, not a model.
//   3. Null curator — declines; the caller falls back to a uniform dice roll
//      and the UI says "curator untrained" instead of pretending the pick
//      was tasted. Never fake curation.

import { personaCurator } from './taste.js';

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
 * MLX-backed curator. Returns null until the Mac Studio runbook produces a
 * taste artifact — when it does, return an engine here implementing the
 * same { name, status(), pick() } contract and it takes priority over the
 * persona scorer automatically.
 */
function mlxCurator() {
  return null;
}

/**
 * Resolve the active curator engine. Single attach point for scorers —
 * MLX first when trained, persona interim while it isn't, null (honest
 * dice roll) when nothing is scoring.
 */
export function getActiveCurator() {
  return mlxCurator() ?? personaCurator() ?? nullCurator();
}

/**
 * Pick one candidate. Returns { index, curated } — curated is false when the
 * engine declined (or misbehaved) and the pick fell back to a uniform roll.
 *
 * Render profiles (renderProfiles.js): before scoring, the active persona
 * dreams each candidate in its own visual language via shapeCandidates().
 * Shaping happens IN PLACE on this array: layoutSlice.js is a protected
 * lane and reads candidates[index] after we return, so the shaped objects
 * must be the ones in this array. A profile bug never breaks the button —
 * shaping failure falls back to the unshaped candidates.
 */
export function pickCurated(candidates, curator) {
  const n = candidates.length;
  if (n === 0) return { index: -1, curated: false };
  if (curator && typeof curator.shapeCandidates === 'function') {
    try {
      curator.shapeCandidates(candidates);
    } catch {
      /* fall through to the unshaped candidates */
    }
  }
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

/** UI hint copy for the curator's state. Honest about who tasted the pick. */
export function curatorHint(curator) {
  if (curator.status() !== 'active') return 'curator untrained · dice roll';
  if (curator.personaName) return `persona pick: ${curator.personaName}`;
  if (curator.name === 'mlx') return 'curated pick · mlx';
  return 'curated pick';
}
