// #592 — sequencing with memory. The CURATE button deals phrases, not
// unrelated rolls: sparse follows sparse, heat follows heat.
//
// A plain uniform roll has no memory, so three presses are three strangers.
// These are row-stochastic transition tables over the DISCRETE choices
// (mode / behave / paletteShift), conditioned on the value that last landed.
// The arc that produces — surprise, develop, return — is the whole point.
//
// Selection, not interpolation: this picks a value, it does not blend toward
// one, so there is no MIX consequence and enums still cut at t>0.

import { MODE_IDS, BEHAVE_MODES, PALETTE_SHIFTS } from '../data/layout-modes.js';

/**
 * Families, and the affinity between them. Rows are BUILT from this rather
 * than hand-typed: a hand-typed 15x15 mode table is 225 numbers nobody can
 * keep summing to 1, and the first edit that broke it would be silent.
 *
 *   self  — land on the same value again. Deliberately small: a press that
 *           changes nothing reads as a dead button.
 *   kin   — a different value in the same family. The bulk of the mass: this
 *           is "develop", the second press.
 *   far   — another family. The surprise, and the way back out of a corner.
 */
const AFFINITY = { self: 0.06, kin: 0.64, far: 0.30 };

const FAMILIES = {
  mode: {
    ordered: ['grid', 'rails', 'abacus', 'stratified'],
    radial: ['fibonacci', 'radial', 'orbit'],
    live: ['swarm', 'hype', 'murmuration'],
    loose: ['random', 'noise', 'layers', 'flow', 'ca'],
  },
  behave: {
    calm: ['cruise', 'orbit'],
    tight: ['flock', 'mold'],
    loose: ['scatter'],
  },
  paletteShift: {
    whole: ['auto', 'split'],
    banded: ['band', 'zone'],
  },
};

const DOMAINS = { mode: MODE_IDS, behave: BEHAVE_MODES, paletteShift: PALETTE_SHIFTS };

/** family id for one value, or null when the value is not in the spec. */
function familyOf(key, value) {
  const fams = FAMILIES[key] || {};
  for (const [fam, members] of Object.entries(fams)) {
    if (members.includes(value)) return fam;
  }
  return null;
}

/**
 * Build one row: P(to | from) over the whole domain, summing to exactly 1.
 * The mass for a band is split evenly across its members, so a family with
 * more members does not become more likely overall — kin is kin.
 */
function buildRow(key, from) {
  const domain = DOMAINS[key];
  const fromFam = familyOf(key, from);
  const kin = domain.filter((v) => v !== from && familyOf(key, v) === fromFam && fromFam !== null);
  const far = domain.filter((v) => v !== from && familyOf(key, v) !== fromFam);
  const row = {};
  let mass = 0;
  const give = (v, w) => { row[v] = (row[v] || 0) + w; mass += w; };
  give(from, AFFINITY.self);
  for (const v of kin) give(v, AFFINITY.kin / kin.length);
  for (const v of far) give(v, AFFINITY.far / far.length);
  // A family of one has no kin; its kin mass would otherwise vanish and the
  // row would sum to less than 1. Renormalising is what keeps it stochastic
  // whatever the family shapes are.
  for (const v of Object.keys(row)) row[v] /= mass;
  return row;
}

/** The full table for one key: every from-state's row. Built once. */
function buildTable(key) {
  const table = {};
  for (const from of DOMAINS[key]) table[from] = buildRow(key, from);
  return table;
}

export const TRANSITIONS = Object.freeze({
  mode: buildTable('mode'),
  behave: buildTable('behave'),
  paletteShift: buildTable('paletteShift'),
});

export const MARKOV_KEYS = Object.freeze(Object.keys(TRANSITIONS));

/** Does this key have a chain at all? */
export function hasChain(key) {
  return Object.hasOwn(TRANSITIONS, key);
}

/**
 * Draw the next value for `key` given the one that last landed.
 *
 * FAIL-OPEN, and it says so: an unknown from-state (a project from another
 * build, a value retired since) falls back to a uniform roll over the domain
 * rather than refusing or throwing — a dead CURATE button is worse than an
 * unconditioned one. The `fellBack` flag rides out with the value so the
 * panel can be honest that this press had no memory behind it; swallowing it
 * would make the whole "memory" story unverifiable in performance.
 *
 * @returns {{ value: string, fellBack: boolean }}
 */
export function markovPick(key, from, rng) {
  const domain = DOMAINS[key];
  if (!domain) return { value: from, fellBack: true };
  const roll = typeof rng === 'function' ? rng() : Math.random();
  const u = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0;
  const row = Object.hasOwn(TRANSITIONS[key], from) ? TRANSITIONS[key][from] : null;
  if (!row) {
    return { value: domain[Math.min(domain.length - 1, Math.floor(u * domain.length))], fellBack: true };
  }
  let acc = 0;
  for (const v of domain) {
    acc += row[v] || 0;
    if (u < acc) return { value: v, fellBack: false };
  }
  // Float dust at the top of the range: the last value owns it.
  return { value: domain[domain.length - 1], fellBack: false };
}
