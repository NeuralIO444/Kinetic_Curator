// engine/creaturePolicy.js — #1736: learning by drive-reduction. Keeps teach a creature which behaviour mode, in which
// situation, earns them — with no external score.
//
// After Creatures (1996): there is no reward function. Reward and Punishment are chemicals manufactured by drive
// change (engine/creatureChem.js), and they strengthen only the connections that fired just before they arrived:
// SUSCEPTIBILITY is an eligibility trace that rises when a connection conducts and decays after. Short-term weights
// move by susceptibility x reinforcement and relax back toward the long-term weights; long-term weights move toward the
// short-term ones slowly (STW → LTW). Reducing an absent drive teaches nothing.
//
// KC-1 mapping (issue #1736): CONCEPT CELLS are the creature's situation — the band (3) x the crowd at its home (3) x
// whether it faces with or against the field (2) = 18 cells. In each cell it picks one of four behaviour MODES (hover,
// roam, school, rest; creatureGenome.MODES). A keep is an approval-drive dropping → Reward → the cell+mode it was in
// just before gets stronger. The learned weights are the creature's own file, kept separate from taste.json (Davis's
// appearance prior): taste says what looks right, the policy says what this animal has learned to do.
//
// THE OHSS LAW (Creatures 2's One Hour Stupidity Syndrome — reward accumulating until every choice is valid anywhere —
// and Black & White's creature, which went slowly insane because silence read as slightly positive), enforced here:
//   - weights are hard-capped at ±W_CAP;
//   - reinforcement comes ONLY from reward/punishment (which creatureChem manufactures only from drive deltas);
//   - eligibility decays fast, so only recent choices learn;
//   - with no reinforcement, short-term weights relax toward long-term ones and NOTHING else moves (silence is neutral).
//
// Pure: Float64Arrays and seeded hashes. Choices are deterministic (argmax, ties and the small exploration broken by
// hashU01), so a take replays the same decisions.
import { hashU01 } from './kernel/rng.js';
import { MODES, CELL_COUNT } from './creatureGenome.js';

export const N_MODES = MODES.length;
export const POLICY_SIZE = CELL_COUNT * N_MODES;

export const POLICY_RATES = Object.freeze({
  learn: 0.6, // STW += elig x (reward - punishment) x learn
  eligDecay: 0.7, // per decision tick: only the last few choices are eligible
  relax: 0.05, // STW relaxes toward LTW this fast, every tick
  consolidate: 0.02, // LTW moves toward STW this fast, only on a reinforced tick
  wCap: 1, // OHSS: hard cap on every weight
  explore: 0.08, // chance per decision to try another mode (seeded, so a take replays it)
  instinct: 0.5, // how far one rehearsal pass writes an instinct into LTW (scaled by its strength)
});

/** The concept cell for a situation: band x crowd bucket x facing. Unknown band reads normal. */
export function cellFor({ band = 'normal', pressure = 0, alignment = 0 } = {}) {
  const b = band === 'relax' ? 0 : band === 'tighten' ? 2 : 1;
  const p = Number.isFinite(pressure) ? (pressure < 1 / 3 ? 0 : pressure < 2 / 3 ? 1 : 2) : 0;
  const a = Number.isFinite(alignment) && alignment > 0 ? 1 : 0;
  return (b * 3 + p) * 2 + a;
}

export function createPolicy() {
  return {
    stw: new Float64Array(POLICY_SIZE),
    ltw: new Float64Array(POLICY_SIZE),
    elig: new Float64Array(POLICY_SIZE),
  };
}

const clampW = (v) => (v > POLICY_RATES.wCap ? POLICY_RATES.wCap : v < -POLICY_RATES.wCap ? -POLICY_RATES.wCap : v);

/**
 * Choose a mode in a cell: the highest STW + temper (the genome's standing bias per mode), exploration seeded by
 * (seed, key, tick). Marks the choice eligible (and decays every other trace). Returns the mode index.
 */
export function chooseMode(policy, cell, { seed = 0, key = 0, tick = 0, temper = null } = {}) {
  const P = POLICY_RATES;
  for (let i = 0; i < POLICY_SIZE; i++) policy.elig[i] *= P.eligDecay;
  let mode;
  if (hashU01(seed >>> 0, 'hierarchy', ((key * 7919) ^ (tick * 104729) ^ 0x50c1) >>> 0) < P.explore) {
    mode =
      Math.floor(hashU01(seed >>> 0, 'hierarchy', ((key * 7919) ^ (tick * 104729) ^ 0x50c2) >>> 0) * N_MODES) % N_MODES;
  } else {
    let best = -Infinity;
    mode = 0;
    for (let m = 0; m < N_MODES; m++) {
      const t = temper && Number.isFinite(temper[m]) ? temper[m] : 0;
      const tie = hashU01(seed >>> 0, 'hierarchy', ((key * 7919) ^ (m * 31) ^ 0x50c3) >>> 0) * 1e-6; // a fixed per-creature tie-break
      const v = policy.stw[cell * N_MODES + m] + t + tie;
      if (v > best) {
        best = v;
        mode = m;
      }
    }
  }
  policy.elig[cell * N_MODES + mode] = 1;
  return mode;
}

/**
 * Reinforce, once per chemistry tick, from the chemicals creatureChem made: STW moves by eligibility x (reward −
 * punishment), capped; then STW relaxes toward LTW; LTW follows STW only when there was reinforcement. Silence (both
 * zero) changes nothing but the relaxation — never a drift toward "everything is fine".
 */
export function reinforce(policy, reward = 0, punishment = 0) {
  const P = POLICY_RATES;
  const net = (Number.isFinite(reward) ? reward : 0) - (Number.isFinite(punishment) ? punishment : 0);
  const any = net !== 0;
  for (let i = 0; i < POLICY_SIZE; i++) {
    if (any) policy.stw[i] = clampW(policy.stw[i] + policy.elig[i] * net * P.learn);
    policy.stw[i] += (policy.ltw[i] - policy.stw[i]) * P.relax;
    if (any) policy.ltw[i] = clampW(policy.ltw[i] + (policy.stw[i] - policy.ltw[i]) * P.consolidate * Math.abs(net));
  }
}

/** What the creature has learned for a cell, by mode (LTW): the readable side of its education. */
export function learnedFor(policy, cell) {
  return Array.from(policy.ltw.subarray(cell * N_MODES, cell * N_MODES + N_MODES));
}
