// engine/creatureGenome.js — #1734: a creature's genome, the inheritable structure-gene record.
//
// After Creatures (1996): the genome is a list of GENES that encode structure, not a bag of traits. Each gene carries its
// own permissions — may it MUTATE, be DUPLICATED, be CUT — and a life STAGE at which it switches on, so genes express on
// a schedule (an ornament gene can switch on mid-set). Crossover happens at gene boundaries (creatureGenome.crossover);
// errors are omissions and duplications, so offspring vary in length. The record is deliberately non-brittle: every
// value is clamped on the way in (sanitizeGenome), so any gene can mutate to any value without breaking the creature.
//
// KC-1 mapping (issue #1734): the seeded body record is most of a genome already. Davis's four birth traits become
// TRAIT genes (they still shape the body: genetics change looks), and new genes carry BEHAVIOUR — drive gains for the
// biochemistry (#1735), instincts the newborn rehearses (#1737), a temper that biases its behaviour modes (#1736), and an
// ornament gene that switches on in adulthood. The Spore warning (#1738) is the reason the behaviour genes exist: a
// genome that only changed looks would be costume.
//
// PROTECTED genes never mutate, duplicate or get cut: the body PLAN (the base type never leaves the TE set).
//
// Pure: no clock, no Math.random. Every roll is hashU01 on the 'hierarchy' channel (the spatial stream creatures already
// ride), keyed by the caller's key, so the same parents and seed give the same child, and a take replays it.
//
// BEAST S1 (#1864): measure genes added. 13 Jansen bars relative to a, plus legCount, per-leg phase, scale.
// Measure genes are the explicit exception to the non-brittle rule; mutation uses seeded check-retry (S2 feasibility).
import { hashU01 } from './kernel/rng.js';
import { TRAIT_DEFAULTS, TRAIT_RANGES, normalizeTraits } from './creature.js';
import { MEASURE_RANGES, MEASURE_IDS, JANSEN_RELATIVE } from './jansenMeasures.js';

export const GENOME_VERSION = 1;
/** A genome never holds more genes than this (duplications stop at the cap). */
export const MAX_GENES = 48;

/** Life stages, in resolver frames of a creature's age (about 10 s and 30 s at 60 fps). */
export const STAGES = Object.freeze({ embryo: 0, juvenile: 600, adult: 1800 });
const STAGE_NAMES = Object.freeze(Object.keys(STAGES));

/** The behaviour modes a temper gene biases (and the policy chooses among, #1736). Order is the policy's column order. */
export const MODES = Object.freeze(['hover', 'roam', 'school', 'rest']);
/** The drives a drive gene tunes (the biochemistry's drive slots, #1735). */
export const DRIVES = Object.freeze(['approval', 'crowding', 'strain', 'boredom']);
/** Concept cells an instinct can name (#1736: band 3 x crowd 3 x alignment 2). */
export const CELL_COUNT = 18;

/** Value ranges per gene kind: everything is clamped into these, so a mutation can never break a creature.
 *  measure is the exception (see MEASURE_RANGES). */
export const GENE_RANGES = Object.freeze({
  drive: Object.freeze({ min: 0.25, max: 2 }), // a drive's gain (how fast it rises): 1 = the species norm
  instinct: Object.freeze({ min: 0, max: 1 }), // how strongly the newborn rehearses its instinct
  temper: Object.freeze({ min: -0.5, max: 0.5 }), // a standing bias added to a mode's score
  ornament: Object.freeze({ min: 0, max: 0.5 }), // extra limb growth target once the gene switches on
  measure: MEASURE_RANGES, // per-id ranges for Jansen bars + legCount + scale + phase
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const KINDS = Object.freeze(['plan', 'trait', 'drive', 'instinct', 'temper', 'ornament', 'measure']);

/** FNV-1a of a string: a stable 32-bit index for the registered channel. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
const roll = (seed, key, salt) => hashU01(seed >>> 0, 'hierarchy', (hash32(key) + salt) >>> 0);

/** One gene, every field present and clamped. */
function gene(kind, id, value, { stage = 'embryo', mutate = true, dup = false, cut = false, cell = 0, mode = 0 } = {}) {
  // values rounded to 4 places: a genome stays a small, readable record (~1.5 KB), and rounding is part of the copy
  const g = { kind, id, value: Math.round(value * 1e4) / 1e4, stage, mutate, dup, cut };
  if (kind === 'instinct') {
    g.cell = cell;
    g.mode = mode;
  } // only an instinct names a situation and a mode
  if (kind === 'plan') g.protected = true;
  return g;
}

/**
 * The wild-type genome for a creature Davis rolled: his four traits as trait genes, plus behaviour genes rolled from
 * the seed around the species norm. `key` names the birth (slot, ordinal, place), so every birth is its own animal.
 * For beasts, call with measure genes added separately (see addJansenMeasures).
 */
export function genomeFromTraits(traits, seed = 0, key = 'wild') {
  const t = normalizeTraits(traits);
  const genes = [gene('plan', 'plan', 0, { mutate: false })];
  for (const k of Object.keys(TRAIT_DEFAULTS)) genes.push(gene('trait', k, t[k]));
  DRIVES.forEach((d, n) => {
    const u = roll(seed, key, 0x6e0d0100 + n);
    genes.push(gene('drive', d, 0.75 + 0.5 * u)); // 0.75..1.25: individuals differ, none extreme
  });
  // Two instincts: a cell (situation) and the mode the species "knows" for it. Instincts may be duplicated or cut
  // (offspring gain or lose them), like Creatures' instinct genes.
  for (let n = 0; n < 2; n++) {
    const cell = Math.floor(roll(seed, key, 0x6e0d0200 + n) * CELL_COUNT) % CELL_COUNT;
    const mode = Math.floor(roll(seed, key, 0x6e0d0300 + n) * MODES.length) % MODES.length;
    genes.push(
      gene('instinct', `instinct${n}`, 0.4 + 0.4 * roll(seed, key, 0x6e0d0400 + n), {
        dup: true,
        cut: true,
        cell,
        mode,
      }),
    );
  }
  MODES.forEach((m, n) => {
    const u = roll(seed, key, 0x6e0d0500 + n);
    genes.push(gene('temper', m, (u - 0.5) * 0.3, { stage: 'juvenile' }));
  });
  genes.push(gene('ornament', 'flare', 0.1 + 0.2 * roll(seed, key, 0x6e0d0600), { stage: 'adult', cut: true }));
  return { v: GENOME_VERSION, genes };
}

/** Add the Jansen measure set (relative to a) plus legCount and scale as measure genes. */
export function addJansenMeasures(genome, measures = JANSEN_RELATIVE, legCount = 12, scale = 1.0) {
  const genes = [...(genome.genes || [])];
  for (const id of MEASURE_IDS) {
    genes.push(gene('measure', id, measures[id] ?? 1.0));
  }
  genes.push(gene('measure', 'legCount', legCount));
  genes.push(gene('measure', 'scale', scale));
  // per-leg phases as measure genes named phase0..phase11 (only as many as legCount)
  for (let i = 0; i < legCount; i++) {
    genes.push(gene('measure', `phase${i}`, i / legCount));
  }
  return sanitizeGenome({ v: GENOME_VERSION, genes });
}

/** Clamp one gene; null when it is not a gene at all (a mutation or a hand-edited file can carry anything). */
function cleanGene(g) {
  if (!g || typeof g !== 'object' || !KINDS.includes(g.kind) || typeof g.id !== 'string' || !g.id || g.id.length > 24)
    return null;
  const stage = STAGE_NAMES.includes(g.stage) ? g.stage : 'embryo';
  const flags = { stage, mutate: g.mutate !== false, dup: g.dup === true, cut: g.cut === true };
  let value = Number.isFinite(g.value) ? g.value : 0;
  if (g.kind === 'plan') return gene('plan', 'plan', 0, { mutate: false });
  if (g.kind === 'trait') {
    if (!(g.id in TRAIT_DEFAULTS)) return null;
    const r = TRAIT_RANGES[g.id];
    value = clamp(g.id === 'swatch' ? Math.round(value) : value, r.min, r.max);
    return gene('trait', g.id, value, flags);
  }
  if (g.kind === 'drive' && !DRIVES.includes(g.id)) return null;
  if (g.kind === 'temper' && !MODES.includes(g.id)) return null;
  if (g.kind === 'measure') {
    const r = MEASURE_RANGES[g.id] || MEASURE_RANGES.phase;
    value = clamp(value, r.min, r.max);
    if (g.id === 'legCount') value = Math.round(value);
    return gene('measure', g.id, value, flags);
  }
  const r = GENE_RANGES[g.kind];
  value = clamp(value, r.min, r.max);
  const cell = Number.isInteger(g.cell) ? clamp(g.cell, 0, CELL_COUNT - 1) : 0;
  const mode = Number.isInteger(g.mode) ? clamp(g.mode, 0, MODES.length - 1) : 0;
  return gene(g.kind, g.id, value, { ...flags, cell, mode });
}

/**
 * Any genome-shaped thing → a valid genome, or null when it carries no body plan. Unknown genes are dropped, values
 * clamped, the gene count capped, and a missing trait gene reads as the species default — so a mutated or hand-edited
 * genome always yields a creature (the non-brittle rule). Measure genes are clamped to their ranges.
 */
export function sanitizeGenome(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.genes)) return null;
  const genes = [];
  for (const g of raw.genes) {
    if (genes.length >= MAX_GENES) break;
    const c = cleanGene(g);
    if (c) genes.push(c);
  }
  const plans = genes.filter((g) => g.kind === 'plan');
  if (plans.length !== 1 || genes[0].kind !== 'plan') return null; // the body plan leads, exactly once
  return { v: GENOME_VERSION, genes };
}

/**
 * What a genome expresses at an age (frames): only genes whose stage has been reached act. The first gene of a kind+id
 * wins for traits / drives / tempers (a duplicate is spare, as in Creatures); every switched-on instinct is listed.
 * Measure genes are collected into out.measures.
 */
export function expressGenome(genome, ageFrames = 0) {
  const out = {
    traits: { ...TRAIT_DEFAULTS },
    drives: Object.fromEntries(DRIVES.map((d) => [d, 1])),
    temper: MODES.map(() => 0),
    instincts: [],
    flare: 0,
    measures: {},
  };
  const g = genome && Array.isArray(genome.genes) ? genome.genes : [];
  const age = Number.isFinite(ageFrames) ? ageFrames : 0;
  const seen = new Set();
  for (const x of g) {
    if ((STAGES[x.stage] ?? 0) > age) continue; // not switched on yet
    const k = `${x.kind}:${x.id}`;
    if (x.kind === 'instinct') {
      out.instincts.push({ cell: x.cell, mode: x.mode, strength: x.value });
      continue;
    }
    if (seen.has(k)) continue;
    seen.add(k);
    if (x.kind === 'trait') out.traits[x.id] = x.value;
    else if (x.kind === 'drive') out.drives[x.id] = x.value;
    else if (x.kind === 'temper') out.temper[MODES.indexOf(x.id)] = x.value;
    else if (x.kind === 'ornament') out.flare = x.value;
    else if (x.kind === 'measure') out.measures[x.id] = x.value;
  }
  out.traits = normalizeTraits(out.traits);
  return out;
}

/** The birth traits a genome gives (its embryo-stage trait genes): what Davis's channel stamps on the input. */
export function traitsOf(genome) {
  return expressGenome(genome, 0).traits;
}

/** Per-gene error rates at a mutation (named, tunable). */
export const MUTATION = Object.freeze({ point: 0.12, dup: 0.04, cut: 0.04, pointSpan: 0.15 });

/**
 * Copy errors, Creatures' way: per gene, honouring its flags — a POINT mutation nudges a value by up to pointSpan of
 * its range, a DUP copies the gene (offspring grow longer), a CUT omits it (shorter). Protected genes are copied as
 * they are. The result is re-sanitized, so it is always a valid genome.
 * Measure genes use the same point mutation but are expected to be re-checked for feasibility by the caller (S2).
 */
export function mutateGenome(genome, seed = 0, key = 'mut') {
  const src = sanitizeGenome(genome);
  if (!src) return null;
  const out = [];
  src.genes.forEach((g, n) => {
    if (g.kind === 'plan') {
      out.push({ ...g });
      return;
    } // protected: copied as it is
    const base = (n + 1) * 0x101;
    if (g.cut && roll(seed, key, base + 1) < MUTATION.cut) return; // omitted
    const copy = { ...g };
    if (copy.mutate && roll(seed, key, base + 2) < MUTATION.point) {
      const r =
        copy.kind === 'trait'
          ? TRAIT_RANGES[copy.id]
          : copy.kind === 'measure'
            ? MEASURE_RANGES[copy.id] || MEASURE_RANGES.phase
            : GENE_RANGES[copy.kind];
      const span = (r.max - r.min) * MUTATION.pointSpan;
      copy.value += (roll(seed, key, base + 3) * 2 - 1) * span;
    }
    out.push(copy);
    if (g.dup && roll(seed, key, base + 4) < MUTATION.dup) out.push({ ...copy });
  });
  return sanitizeGenome({ v: GENOME_VERSION, genes: out });
}

/**
 * Sexual crossover at gene boundaries: walk both parents' genes in order, copying from one parent and switching to the
 * other with a probability that grows with the distance since the last switch (linkage: genes close together tend to
 * travel together). Offspring length follows whichever parent is being copied at each point, so it can differ from
 * both. The body plan always comes first and is never crossed out. Then copy errors (mutateGenome).
 */
export function crossover(a, b, seed = 0, key = 'cross') {
  const A = sanitizeGenome(a);
  const B = sanitizeGenome(b);
  if (!A || !B) return A ? mutateGenome(A, seed, key) : B ? mutateGenome(B, seed, key) : null;
  const P = [A.genes, B.genes];
  let from = roll(seed, key, 0x7c0) < 0.5 ? 0 : 1;
  let since = 0;
  const out = [P[0][0]]; // the plan
  const len = Math.max(A.genes.length, B.genes.length);
  for (let n = 1; n < len; n++) {
    since += 1;
    if (roll(seed, key, 0x7c1 + n) < Math.min(0.5, since * 0.08)) {
      from = 1 - from;
      since = 0;
    }
    const g = P[from][n];
    if (g) out.push(g);
  }
  return mutateGenome({ v: GENOME_VERSION, genes: out }, seed, `${key}:m`);
}

/** How alike two genomes are, 0..1 (shared expressed trait/behaviour values): the breeding pool's diversity guard reads it. */
export function genomeSimilarity(a, b) {
  const ea = expressGenome(a, Infinity);
  const eb = expressGenome(b, Infinity);
  const parts = [];
  for (const k of Object.keys(TRAIT_DEFAULTS)) {
    const r = TRAIT_RANGES[k];
    parts.push(1 - Math.abs(ea.traits[k] - eb.traits[k]) / (r.max - r.min));
  }
  for (const d of DRIVES)
    parts.push(1 - Math.abs(ea.drives[d] - eb.drives[d]) / (GENE_RANGES.drive.max - GENE_RANGES.drive.min));
  ea.temper.forEach((v, n) =>
    parts.push(1 - Math.abs(v - eb.temper[n]) / (GENE_RANGES.temper.max - GENE_RANGES.temper.min)),
  );
  // measures contribute to similarity as well
  for (const id of Object.keys(ea.measures)) {
    if (eb.measures[id] != null) {
      const r = MEASURE_RANGES[id] || MEASURE_RANGES.phase;
      parts.push(1 - Math.abs(ea.measures[id] - eb.measures[id]) / (r.max - r.min));
    }
  }
  return parts.reduce((s, v) => s + v, 0) / parts.length;
}
