// ─── The Curator — taste-guided selection over randomized candidates ────────
// The CURATOR button rolls CURATE_CANDIDATES full scenes over the unlocked
// params and keeps the one the curator engine ranks highest.
//
// Engine contract: a curator implements pick(candidates) -> index, and
// status() -> 'active' | 'untrained'. Scorers plug in at getActiveCurator()
// below, highest priority first:
//
//   1. MLX curator (studio/curator.py + docs/MLX_CURATOR_RUNBOOK.md §4) — a
//      linear head distilled from the embedding probe trained on kept renders,
//      scoring recipe features (curator/tasteHead.js). Null until a taste.json
//      is imported and its head is faithful (fidelity ≥ 0.3).
//   2. Persona curator (taste.js) — interim taste: measures 15 real visual
//      features per candidate and scores them against the active persona's
//      distilled Loves/Avoids. Honest about being a stand-in, not a model.
//   3. Null curator — declines; the caller falls back to a uniform dice roll
//      and the UI says "curator untrained" instead of pretending the pick
//      was tasted. Never fake curation.

import { personaCurator } from './taste.js';
import { makeMlxCurator, getDavisCitation } from './tasteHead.js';
import { getTaste } from './tasteStore.js';
import { experimentalOn } from './tasteGate.js';
import { getLoisVerdict } from './loisRank.js';
import { duelPick } from './readDuel.mjs'; // #1627 S3 — the duel (rides this loop, gated by S2's proof)

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
 * MLX-backed curator (#762). Active once a taste.json from the Mac Studio
 * runbook is imported (Pipeline → IMPORT TASTE) and its distilled head is
 * faithful enough; otherwise null, and the persona scorer takes over.
 */
function mlxCurator() {
  return makeMlxCurator(getTaste(), { experimental: experimentalOn() });
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
// #1627 S3 — the last duel this loop ran, for the hint. Set only by a
// pick that carried measured reads + a Queen anchor; a pick without
// them clears it, so the hint can never quote a stale judgment.
let lastDuel = null;
export function getLastDuel() {
  return lastDuel;
}

export function pickCurated(candidates, curator, rng = null, { refine = false, reads = null, anchor = null, temperature } = {}) {
  // Audit fix 3f — no Math.random default (the 3a contract): a
  // missing/non-function rng rolls 0, so the fallback deals candidate 0
  // and the persona machinery receives the zero stream. Production
  // (layoutSlice's CURATE press) passes the seeded CH.curate stream.
  const draw = typeof rng === 'function' ? rng : () => 0;
  const n = candidates.length;
  if (n === 0) return { index: -1, curated: false };
  // #1144: in REFINE the candidates are local mutations of what landed. The persona's render profile re-rolls the
  // biased keys from its own ranges and would undo that, so refine is not re-dreamed (the live values already carry
  // the persona's earlier look); the pick itself is still taste-weighted.
  if (!refine && curator && typeof curator.shapeCandidates === 'function') {
    try {
      curator.shapeCandidates(candidates, draw);
    } catch {
      /* fall through to the unshaped candidates */
    }
  }
  let idx;
  try {
    idx = curator.pick(candidates, draw);
  } catch {
    idx = -1;
  }
  if (!Number.isInteger(idx) || idx < 0 || idx >= n) {
    lastDuel = null;
    return { index: Math.floor(draw() * n), curated: false };
  }
  // #1627 S3 — the duel, ridden on this same draft → gate → tilt loop:
  // Davis has picked (the draft); when the caller supplies MEASURED
  // reads (S2's meter) and the Queen's anchor, LOIS gates the pick and
  // tilts it to the anchor when it sits outside the temperature's
  // tolerance. No reads or no anchor → no duel, and the return is
  // exactly yesterday's { index, curated } — the duel never fakes a
  // judgment it did not measure.
  if (reads && anchor) {
    const duel = duelPick({ reads, anchor, davisIndex: idx, temperature });
    lastDuel = duel.dueled ? duel : null;
    if (duel.dueled && duel.index !== idx) {
      return { index: duel.index, curated: true, duel };
    }
    if (duel.dueled) return { index: idx, curated: true, duel };
  } else {
    lastDuel = null;
  }
  return { index: idx, curated: true };
}

/**
 * UI hint copy for the curator's state. Honest about who tasted the pick —
 * and, since #592, about whether the sequence had any memory behind it. A
 * chain that silently fell back to a uniform roll would make the "the button
 * deals phrases" story unverifiable in performance, so it is said out loud.
 */
export function curatorHint(curator, { chainFallback = false } = {}) {
  const chain = chainFallback ? ' · chain: uniform' : '';
  // #1627 S3 — a duel that ran is said out loud (honest signals): the
  // tilt and LOIS's demand ride the hint; no duel, no line.
  const duelLine = lastDuel ? ` · duel: ${lastDuel.tilted ? `tilted — ${lastDuel.fromLine ?? lastDuel.line}` : lastDuel.line}` : '';
  if (curator.status() !== 'active') return `curator untrained · dice roll${duelLine}${chain}`;
  if (curator.heuristic) {
    const line = getLoisVerdict() || 'Walk in. Show me something.';
    return `heuristic pick: LOIS · ${line}${duelLine}${chain}`;
  }
  if (curator.personaName) return `persona pick: ${curator.personaName}${duelLine}${chain}`;
  if (curator.name === 'mlx') {
    // T3: a tree head's last pick is quoted — Davis cites the splits that
    // won it. No citation (linear head, or no pick yet) = the line as it was.
    const cite = getDavisCitation();
    return `curated pick · mlx${curator.experimental ? ' · experimental' : ''}${cite ? ` — ${cite}` : ''}${duelLine}${chain}`;
  }
  return `curated pick${duelLine}${chain}`;
}
