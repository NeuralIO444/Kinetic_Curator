// engine/creatureBreed.js — #1852 (creatures, slice 4 of #1848): WetLab breeding — three-source gene inheritance.
//
// (Not to be confused with curator/creatureBreeding.js — #1738's breeding of moth genomes from keeps. This module
// breeds wet-lab creature RECORDS, kc-assembled/1, engine/creatureAssembler.js.)
//
// Matt's rulings (2026-10-29, #1852 / #1848):
//   - three sources, never two: "taking 3 artists style to get something new" — the KC-1 triad;
//   - a source is a creature record or an asset + Look + Voice assembly — never a whole stage;
//   - mutation is lively, ~1 gene in 8, pinned as a NAMED CONSTANT (MUTATION_RATE) a selfcheck asserts.
//
// The merge law (the anti-mush rule at the DNA level):
//   - DISCRETE genes pick a parent — inherited whole, never averaged: the body shape, the skeleton, the Look, the
//     Voice, the material. The skeleton (head + limbs + joints) is ONE linkage group, inherited together from one
//     parent, the way genes on one chromosome travel together — a head from one parent and four limbs from another
//     would break the four-point body plan, and half a skeleton is mush.
//   - CONTINUOUS genes may blend, inside their legal range only: the drives — a seeded weighting of the three
//     parents' values (a convex blend, so it can never leave the range its parents span).
//   - MUTATION re-rolls ~1 gene in 8 from the seed and is recorded: a discrete gene mutates by re-picking another
//     PARENT's value (so no discrete gene ever holds a value none of the parents held — the acceptance line); a
//     continuous gene re-rolls anywhere inside its legal range.
//   - LINEAGE is data: the child names its three parents, its seed, every mutation, and every gene's source
//     (parent:<id> / cross:<a>~<b>~<c> / mut:<id>), inspectable like every other honest signal.
//
// Deterministic: same trio (in any order) + same seed = the same child, byte for byte. Pure: no clock, no Math.random.

import {
  assembleCreature,
  sanitizeCreatureRecord,
  keptWarningHolds,
  CREATURE_ASSEMBLY_KIND,
  DRIVE_RANGE,
  BIRTH_DRIVES,
  isLookId,
  isVoiceId,
} from './creatureAssembler.js';
import { sanitizeAttachPoints } from './assetAttach.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { RISO_FIELD_LOOK_ID } from './risoField.mjs'; // #2008 — the picker-only Look stays off the dice
import { VOICE_DECK } from '../data/voiceDeck.js';

/** Matt's ruling (2026-10-29): lively mutation, ~1 gene in 8. Named so the suite can assert it (rider to ruling 2). */
export const MUTATION_RATE = 1 / 8;
/** The triad: a child has exactly this many parents. */
export const BREED_PARENTS = 3;

/** FNV-1a: a stable 32-bit key (the assembler's own hash shape). */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
const u01 = (str) => hash32(str) / 4294967296;
const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * A breeding source made legal (ruling 3): a banked creature record, or an asset + Look + Voice assembly — the asset
 * with its ATTACH points, wearing a Look and a Voice the artist chose. An assembly becomes a record the same way the
 * assembler builds one (it is never banked by being a parent). Anything else — a stage, a half-record — is refused.
 *
 * @param {{kind:'creature', record:object} | {kind:'assembly', assetId:string, points:Array, lookId:string,
 *   voiceId:string}} src
 * @param {number} seed the project seed (an assembly's own id is a function of it, like ASSEMBLE)
 * @returns {object|null} a clean record, or null
 */
export function sourceRecord(src, seed = 0) {
  if (!src || typeof src !== 'object') return null;
  if (src.kind === 'creature') return sanitizeCreatureRecord(src.record);
  if (src.kind === 'assembly') {
    // the Look and Voice are the artist's choice here, not a deal: a missing or unknown one refuses the source
    const rec = assembleCreature({
      assetId: src.assetId,
      points: src.points,
      seed,
      lookId: src.lookId,
      voiceId: src.voiceId,
    });
    if (!rec || rec.look !== src.lookId || rec.voice !== src.voiceId) return null;
    return sanitizeCreatureRecord(rec);
  }
  return null;
}

/** The genes, in the record's canonical order, and how each is inherited. */
const LAW = Object.freeze([
  { family: 'FORM', id: 'body', kind: 'discrete' },
  { family: 'FORM', id: 'head', kind: 'skeleton' },
  { family: 'FORM', id: 'limbs', kind: 'skeleton' },
  { family: 'FORM', id: 'joints', kind: 'skeleton' },
  { family: 'LOOK', id: 'look', kind: 'discrete' },
  { family: 'VOICE', id: 'voice', kind: 'discrete' },
  { family: 'MATERIAL', id: 'material', kind: 'discrete' },
  ...BIRTH_DRIVES.map((d) => ({ family: 'DRIVE', id: d, kind: 'continuous' })),
]);
/** The inheritance law, as data a suite (and a backstage readout) can read. */
export const BREED_LAW = LAW;

const geneOf = (rec, id) => rec.genome.find((g) => g.id === id).value;
// A child carries the BREED_LAW genes only: a gene this build does not know (a newer build's addition kept by the
// door) is not inherited — add it to LAW, with its kind, when it should pass down.

/**
 * Breed a child from three parents.
 *
 * @param {Array<object>} parents three clean records (sourceRecord's output); order does not matter
 * @param {number} seed the project seed
 * @returns {object|null} the child record (kc-assembled/1, passing sanitizeCreatureRecord), or null when the trio is
 *   not three distinct, clean records
 */
export function breedCreature(parents, seed = 0) {
  if (!Array.isArray(parents) || parents.length !== BREED_PARENTS) return null;
  const clean = parents.map((p) => sanitizeCreatureRecord(p));
  if (clean.some((p) => !p)) return null;
  // order-free: the trio is sorted by id, so (A, B, C) and (C, A, B) are one pairing
  const trio = clean.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (new Set(trio.map((p) => p.id)).size !== BREED_PARENTS) return null; // three different parents
  const s = seed >>> 0;
  const key = `${s}|${trio.map((p) => p.id).join('|')}`;
  const pick = (salt) => trio[Math.floor(u01(`${key}|${salt}`) * BREED_PARENTS) % BREED_PARENTS];
  // another parent whose value differs (a swap to the same value is no mutation at all); null when none does
  const other = (salt, not, valueOf) => {
    const rest = trio.filter((p) => p !== not && valueOf(p) !== valueOf(not));
    return rest.length ? rest[Math.floor(u01(`${key}|${salt}`) * rest.length) % rest.length] : null;
  };
  const skelOf = (p) => JSON.stringify(['head', 'limbs', 'joints'].map((id) => geneOf(p, id)));
  const genome = [];
  const mutations = [];
  // the skeleton linkage group travels together — and mutates together, as one gene, by re-picking another parent
  let skeleton = pick('skeleton');
  let skeletonSource = `parent:${skeleton.id}`;
  const skelTo = u01(`${key}|mut?|skeleton`) < MUTATION_RATE ? other('mut|skeleton', skeleton, skelOf) : null;
  if (skelTo) {
    const to = skelTo;
    mutations.push({ gene: 'FORM.skeleton', kind: 'swap', from: skeleton.id, to: to.id });
    skeleton = to;
    skeletonSource = `mut:${to.id}`;
  }
  for (const law of LAW) {
    const mutates = law.kind !== 'skeleton' && u01(`${key}|mut?|${law.id}`) < MUTATION_RATE;
    let value;
    let source;
    if (law.kind === 'continuous') {
      if (mutates) {
        const v = r3(DRIVE_RANGE.min + u01(`${key}|mut|${law.id}`) * (DRIVE_RANGE.max - DRIVE_RANGE.min));
        mutations.push({ gene: `${law.family}.${law.id}`, kind: 'reroll', value: v });
        value = v;
        source = `mut:${law.id}`;
      } else {
        // a convex blend of the three: seeded weights that sum to 1, so the value stays inside the parents' span
        const w = trio.map((p) => 0.2 + u01(`${key}|w|${law.id}|${p.id}`));
        const sum = w.reduce((a, b) => a + b, 0);
        value = r3(trio.reduce((acc, p, i) => acc + (geneOf(p, law.id) * w[i]) / sum, 0));
        value = Math.min(DRIVE_RANGE.max, Math.max(DRIVE_RANGE.min, value));
        source = `cross:${trio.map((p) => p.id).join('~')}`;
      }
    } else {
      let from = law.kind === 'skeleton' ? skeleton : pick(law.id);
      if (law.kind === 'skeleton') source = skeletonSource;
      else if (mutates && other(`mut|${law.id}`, from, (p) => JSON.stringify(geneOf(p, law.id)))) {
        // a discrete mutation re-picks ANOTHER parent's (different) value — never a value none of them held; where
        // every parent holds the same value there is nothing to mutate to, and nothing is recorded
        const to = other(`mut|${law.id}`, from, (p) => JSON.stringify(geneOf(p, law.id)));
        mutations.push({ gene: `${law.family}.${law.id}`, kind: 'swap', from: from.id, to: to.id });
        from = to;
        source = `mut:${from.id}`;
      } else source = `parent:${from.id}`;
      value = JSON.parse(JSON.stringify(geneOf(from, law.id)));
    }
    genome.push({ family: law.family, id: law.id, value, source });
  }
  const gene = (id) => genome.find((g) => g.id === id).value;
  // #2030 — the retained ancestry, written HERE, at the birth, and never recomputed afterwards. Each parent
  // contributes a compact summary — its identity, its genes exactly as they stand at this birth, and its own
  // parents' ids — and deeper ancestors arrive by merging the parents' own summaries, deduplicated by id.
  // The merge is what keeps the record's growth LINEAR in generations (at most three new entries per birth)
  // where a naive copy of three full trees would grow as 3^generations. FROZEN AT BIRTH is the point of the
  // field: a parent hand-edited later does not rewrite this child's retained ancestors — the summary is what
  // the family looked like when this creature was born, and the Lineage Tree reads it, never the live bank.
  const ancestry = trio.map((p) => ({
    id: p.id,
    genes: JSON.parse(JSON.stringify(p.genome)),
    parents: p.lineage ? [...p.lineage.parents] : [],
  }));
  const seenAncestors = new Set(ancestry.map((e) => e.id));
  for (const p of trio)
    for (const e of p.ancestry || []) {
      if (seenAncestors.has(e.id)) continue;
      seenAncestors.add(e.id);
      ancestry.push(JSON.parse(JSON.stringify(e)));
    }
  const child = {
    kind: CREATURE_ASSEMBLY_KIND,
    id: `cr-${hash32(`breed|${key}`).toString(16).padStart(8, '0')}`,
    seed: s,
    body: gene('body'),
    head: gene('head'),
    limbs: gene('limbs'),
    joints: gene('joints'),
    drives: Object.fromEntries(BIRTH_DRIVES.map((d) => [d, gene(d)])),
    look: gene('look'),
    voice: gene('voice'),
    genome,
    lineage: { parents: trio.map((p) => p.id), seed: s, mutations },
    ancestry,
  };
  return sanitizeCreatureRecord(child);
}

// ── #1870 (Genome Timeline): hand edits — the performer's hand on ONE gene of a banked record ─────────────────────
//
// Matt's rulings (2026-11-07, #1870): edits are IN PLACE (no fork, no child record, no generation bump) and the
// edited gene's source is rewritten to record the hand act (the hand: vocabulary in creatureAssembler.js). The hand
// works under the SAME laws as the birth machinery in this module — it is not a second mutator:
//
//   - MUTATE applies this module's mutation laws to one gene: a continuous (DRIVE) gene re-rolls anywhere inside
//     its legal range (the reroll formula below, verbatim); a discrete gene re-picks a DIFFERENT holder of its
//     family's value space — the deck for LOOK / VOICE, the asset pool for the body — the way a breeding swap
//     re-picks another parent's different value. Two families of genes have no lawful single-gene mutation here
//     and REFUSE (never clamp, never invent): the skeleton (head / limbs / joints travel as ONE linkage group —
//     a single-gene mutation would break the group; the skeleton changes whole, by replace, or by breeding) and
//     MATERIAL (a stub with no legal value space yet).
//   - REPLACE takes a value from a legal source only — the same sources assembly and breeding draw from: the
//     family's deck (LOOK / VOICE), the asset pool (the body), the body shape's own ATTACH points (a skeleton
//     gene, derived exactly as assembleCreature derives it), or the corresponding gene of another banked record
//     (a donor). A whole stage is never a source (the standing breeding-sources ruling) — no origin kind names
//     one, so the refusal is by shape, not by check.
//   - The write is whole-record: the candidate goes back through sanitizeCreatureRecord (the one door) and an
//     edit the door refuses changes nothing. Record id, gene order and lineage are never touched; a bred
//     record's lineage stays (a hand gene postdates the birth — the door's lineage law accounts for it).

// #2008 — the mutation dice never deal the picker-only Riso field Look:
// it enters a record only when the performer picks it. The catalogue
// appends it last, so filtering restores the pre-wiring order exactly.
const LOOK_ORDER = COMPOSITION_PRESETS.map((p) => p.id).filter((id) => id !== RISO_FIELD_LOOK_ID);
const VOICE_ORDER = VOICE_DECK.map((v) => v.id);
const SKELETON_IDS = new Set(['head', 'limbs', 'joints']);
const copy = (v) => JSON.parse(JSON.stringify(v));
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The value a hand mutation would give one gene, under this module's mutation laws — or null when the gene has
 * no lawful mutation (the skeleton linkage group, the MATERIAL stub, a family this build does not mutate, or a
 * value space holding nothing different). Seeded from the record, so the same record + gene + seed always
 * mutates the same way; a DRIVE candidate equal to the current value is re-drawn (a mutation that changes
 * nothing is no mutation), and after a bounded walk of draws the gene refuses rather than repeats.
 */
export function handMutateValue(record, gene, seed = 0, legalBodies = []) {
  if (!record || !gene || typeof gene !== 'object') return null;
  const key = `hand|${record.id}|${gene.family}.${gene.id}|${seed >>> 0}`;
  if (gene.family === 'DRIVE') {
    for (let n = 0; n < 8; n++) {
      const v = r3(DRIVE_RANGE.min + u01(`${key}|${n}`) * (DRIVE_RANGE.max - DRIVE_RANGE.min));
      if (v !== gene.value) return v;
    }
    return null;
  }
  if (gene.family === 'LOOK' || gene.family === 'VOICE') {
    const deck = gene.family === 'LOOK' ? LOOK_ORDER : VOICE_ORDER;
    const rest = deck.filter((id) => id !== gene.value);
    return rest.length ? rest[Math.floor(u01(key) * rest.length) % rest.length] : null;
  }
  if (gene.family === 'FORM' && gene.id === 'body') {
    const rest = (legalBodies || []).filter((id) => typeof id === 'string' && id && id !== gene.value);
    return rest.length ? rest[Math.floor(u01(key) * rest.length) % rest.length] : null;
  }
  return null;
}

/**
 * Apply one hand edit to a banked record, in place.
 *
 * @param {object} record a clean creature record (it is re-sanitized here; a dirty record refuses)
 * @param {{action:'mutate', family:string, id:string} |
 *         {action:'replace', family:string, id:string,
 *          origin:{kind:'deck', value:string} | {kind:'pool', value:string} |
 *                  {kind:'asset'} | {kind:'donor', donorId:string}}} edit
 * @param {{seed?:number, legalBodies?:string[], donors?:object[], bodyAttachPoints?:Array}} [env]
 *   seed: the project seed (mutation draws); legalBodies: the asset ids a body gene may name (the pool);
 *   donors: the other banked records; bodyAttachPoints: the body shape's ATTACH points (for a skeleton replace)
 * @returns {{record:object, refusal:null} | {record:null, refusal:string}} exactly one of the two is non-null;
 *   refusal is one of 'no-record' | 'no-gene' | 'no-mutation' | 'illegal-source' | 'illegal-value' | 'door'
 */
export function handEditRecord(record, edit, env = {}) {
  const rec = sanitizeCreatureRecord(record);
  if (!rec) return { record: null, refusal: 'no-record' };
  if (!edit || typeof edit !== 'object') return { record: null, refusal: 'illegal-source' };
  const gene = rec.genome.find((g) => g.family === edit.family && g.id === edit.id);
  if (!gene) return { record: null, refusal: 'no-gene' };
  let value;
  let source;
  if (edit.action === 'mutate') {
    value = handMutateValue(rec, gene, env.seed ?? 0, env.legalBodies ?? []);
    if (value === null) return { record: null, refusal: 'no-mutation' };
    source = 'hand:mut';
  } else if (edit.action === 'replace') {
    const origin = edit.origin;
    if (!origin || typeof origin !== 'object') return { record: null, refusal: 'illegal-source' };
    if (origin.kind === 'deck') {
      if (gene.family === 'LOOK' && isLookId(origin.value)) {
        value = origin.value;
        source = `hand:look:${value}`;
      } else if (gene.family === 'VOICE' && isVoiceId(origin.value)) {
        value = origin.value;
        source = `hand:voice:${value}`;
      } else return { record: null, refusal: 'illegal-source' };
    } else if (origin.kind === 'pool') {
      if (gene.family !== 'FORM' || gene.id !== 'body') return { record: null, refusal: 'illegal-source' };
      if (!(env.legalBodies ?? []).includes(origin.value)) return { record: null, refusal: 'illegal-value' };
      value = origin.value;
      source = `hand:asset:${value}`;
    } else if (origin.kind === 'asset') {
      if (gene.family !== 'FORM' || !SKELETON_IDS.has(gene.id) || !Array.isArray(env.bodyAttachPoints))
        return { record: null, refusal: 'illegal-source' };
      // the shape's own points, derived exactly as assembleCreature derives a skeleton from ATTACH points
      const pts = sanitizeAttachPoints(env.bodyAttachPoints);
      const head = pts.find((p) => p.role === 'H') || null;
      if (gene.id === 'head') value = head ? { x: head.x, y: head.y } : null;
      else if (gene.id === 'limbs') value = pts.filter((p) => p.role === 'L').map((p) => ({ x: p.x, y: p.y }));
      else value = pts.filter((p) => !p.role).map((p) => ({ x: p.x, y: p.y }));
      source = `hand:asset:${rec.body}`;
    } else if (origin.kind === 'donor') {
      const donor = (env.donors ?? []).map((d) => sanitizeCreatureRecord(d)).find((d) => d && d.id === origin.donorId);
      if (!donor || donor.id === rec.id) return { record: null, refusal: 'illegal-source' };
      const dg = donor.genome.find((g) => g.family === gene.family && g.id === gene.id);
      if (!dg) return { record: null, refusal: 'illegal-source' };
      value = copy(dg.value);
      // a body taken from a donor still has to be a shape the pool holds — the donor's body is not a loophole
      if (gene.family === 'FORM' && gene.id === 'body' && !(env.legalBodies ?? []).includes(value))
        return { record: null, refusal: 'illegal-value' };
      source = `hand:donor:${donor.id}`;
    } else return { record: null, refusal: 'illegal-source' };
  } else return { record: null, refusal: 'illegal-source' };
  if (sameValue(value, gene.value) && edit.action === 'replace' && source === gene.source)
    return { record: null, refusal: 'illegal-value' }; // a replace that changes nothing at all is refused
  const genome = rec.genome.map((g) => (g === gene ? { family: g.family, id: g.id, value: copy(value), source } : g));
  const candidate = { ...rec, genome };
  // the record's own fields mirror their genes — the door holds them to agreement, so the hand moves both
  if (gene.family === 'LOOK' && gene.id === 'look') candidate.look = value;
  else if (gene.family === 'VOICE' && gene.id === 'voice') candidate.voice = value;
  else if (gene.family === 'FORM' && gene.id === 'body') candidate.body = value;
  else if (gene.family === 'FORM' && gene.id === 'head') candidate.head = copy(value);
  else if (gene.family === 'FORM' && gene.id === 'limbs') candidate.limbs = copy(value);
  else if (gene.family === 'FORM' && gene.id === 'joints') candidate.joints = copy(value);
  // a bred record's drive slots ARE its drive genes (the door's lineage law) — keep them in step. An unbred
  // record's slots stay in their birth shape (slots are the integrator's world, not the genome's).
  else if (gene.family === 'DRIVE' && rec.lineage) candidate.drives = { ...rec.drives, [gene.id]: value };
  // #1871 — a kept warning rides the record only while it still holds: an edit that resolves the warned
  // condition (a skeleton replace that gives the creature a head; a body replace off the expensive shape)
  // retires the warning it resolved. Nothing vanishes silently — the resolving act is itself recorded in the
  // edited gene's hand: source, and the door would refuse the stale claim if it stayed. Entries the edit
  // does not touch ride on, as they were.
  if (Array.isArray(candidate.kept)) {
    const still = candidate.kept.filter((e) => keptWarningHolds(e, candidate));
    if (still.length) candidate.kept = still;
    else delete candidate.kept;
  }
  // #1872 — a cultivation note describes the creature exactly as it stood when it was dry-run; any hand
  // edit makes a different creature of it, so the note retires with the edit rather than riding along as a
  // stale read (or refusing the edit at the door when the resolved skeleton contradicts it). Nothing
  // vanishes silently — the edited gene's hand: source records the act that retired it, and the performer
  // cultivates the edited animal again if they want its note.
  if (candidate.cultivated) delete candidate.cultivated;
  const clean = sanitizeCreatureRecord(candidate);
  if (!clean) return { record: null, refusal: 'door' };
  return { record: clean, refusal: null };
}
