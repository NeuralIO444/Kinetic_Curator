// deal/creatureAdapter.mjs — #2232 step 2: the WetLab's deal adapter. Creatures, for the KINETIC and CURATOR engines.
//
// Built on what is there, not beside it: kineticBirths.mjs' scoring, creatureBreed.js' breed and hand mutations,
// the assembler, the cultivate gate and autoAttach.js' AUTO points. Pure: no store, no React, no clock, no Math.random.
// Every draw is a string-keyed hash of (seed, press, scope, attempt) — nothing new is stored to re-derive a hand.
//
// The host (WetLab, step 3) reads its store and hands this adapter plain data in `ctx`:
//   ctx.library      the dealable assets WITH their markup: the library's asset objects whose ids dealableRecords(ASSETS)
//                    keeps ([{ id, svg, … }]) — a body is read from its svg, so the metadata records alone are not enough
//   ctx.assetAttach  the artist's own ATTACH points by asset id (a missing entry means the shape's AUTO points)
//   ctx.bank         the banked creature records (state.creatureRecords); breeding needs BREED_PARENTS of them
//   ctx.lookId / ctx.voiceId   optional: the room's standing Look and Voice (the read gives them a small bias)
// A host applies a pick itself (bankCreature); this file never writes state.
//
// The ladder (spec §3, ruling Q1): OFF founders from the 19 curated 4-shape sets · WEAK from the whole library ·
// MED also breeds from the bank once it holds three · KOZ as MED, with extra hand mutations on every bred child.
// Founders whose shape has no head or no limb point are skipped at OFF and WEAK and allowed at KOZ (ruling Q3).
import { assembleCreature, withCultivation, sanitizeCreatureRecord } from '../engine/creatureAssembler.js';
import { breedCreature, sourceRecord, handEditRecord, BREED_PARENTS } from '../engine/creatureBreed.js';
import { scoreBirthChild } from '../engine/kineticBirths.mjs';
import { attachPointsFor } from '../engine/autoAttach.js';
import { cultivationNote } from '../components/cultivate.model.mjs';
import { CURATED_SETS, scopeDecks } from '../state/kineticScope.mjs';
import { hash32, u01, pickIndex } from './dealKey.mjs';

/** The ladder, narrowest first: the stage's own four ids and labels (ruling Q1). */
export const CREATURE_SCOPES = Object.freeze([
  { id: 'off', label: 'OFF' },
  { id: 'weak', label: 'WEAK' },
  { id: 'med', label: 'MED' },
  { id: 'koz', label: 'KOZ' },
]);
/** Where a bare WetLab press opens: the whole library, no breeding (a quiet first press). */
export const CREATURE_DEFAULT_SCOPE = 'weak';
/** At MED and KOZ, with a bank able to breed, every second attempt is a breed (the rest are founders). */
export const BREED_EVERY = 2;
/** At KOZ, the chance that one hand-mutable gene of a bred child is mutated again: the lively scope's extra heat. */
export const KOZ_EXTRA_MUTATION = 1 / 4;
/** The genes a hand mutation may touch, in the record's canonical order (the skeleton and the MATERIAL stub have no lawful mutation). */
const MUTABLE = Object.freeze([
  { family: 'FORM', id: 'body' },
  { family: 'LOOK', id: 'look' },
  { family: 'VOICE', id: 'voice' },
  { family: 'DRIVE', id: 'approval' },
  { family: 'DRIVE', id: 'crowding' },
  { family: 'DRIVE', id: 'strain' },
  { family: 'DRIVE', id: 'boredom' },
]);

const curatedIdSet = new Set(CURATED_SETS.flat());
const list = (v) => (Array.isArray(v) ? v : []);
const seedOf = (key) => Math.floor(u01(key) * 4294967296) >>> 0;

/** The viewing room of one press: a lookup of the library by id, so the gate can read each body. */
const byId = (library) => new Map(list(library).map((a) => [a && a.id, a]));

/** How many limb points a founder's shape gets from the role rule below. */
export const FOUNDER_LIMBS = 2;

/**
 * A shape's AUTO points carry no roles (every point is plain; H and L come from the artist's hand or a kit), so a
 * founder from AUTO points alone would never have a head or a limb. This is the lab's own HEAD and LIMB gesture
 * (WetLab's toolHead / toolLimb) run over the AUTO set: the topmost plain point becomes H, and the lowest
 * FOUNDER_LIMBS of the rest become L. A set the artist edited (roles already present) is left exactly as it is.
 * Fewer than two points (a bare glyph's one centre point) cannot hold a head and a limb: it stays as it was.
 */
export function founderRoles(points) {
  const pts = list(points).map((p) => ({ ...p }));
  if (pts.some((p) => p && p.role) || pts.length < 2) return pts;
  const order = pts.map((p, i) => i);
  const head = order.slice().sort((a, b) => pts[a].y - pts[b].y || pts[a].x - pts[b].x)[0];
  pts[head].role = 'H';
  order
    .filter((i) => i !== head)
    .sort((a, b) => pts[b].y - pts[a].y || pts[a].x - pts[b].x)
    .slice(0, FOUNDER_LIMBS)
    .forEach((i) => (pts[i].role = 'L'));
  return pts;
}

/** A shape with a head point and at least one limb point (the cultivation read's own warnings, asked early). */
const hasSkeleton = (points) =>
  list(points).some((p) => p && p.role === 'H') && list(points).some((p) => p && p.role === 'L');

/** Stamp a record with its cultivation note, as breedCandidate does. Null when the door refuses either. */
function cultivated(record, assets, seed) {
  const rec = sanitizeCreatureRecord(record);
  if (!rec) return null;
  const note = cultivationNote(rec, assets.get(rec.body) || null, seed);
  return note ? withCultivation(rec, note) : null;
}

/** The fraction of genes (by family.id) that differ between two records. 0 = identical, 1 = nothing shared. */
export function creatureDistance(a, b) {
  const ga = list(a && a.genome);
  const gb = list(b && b.genome);
  if (!ga.length || !gb.length) return 1;
  const other = new Map(gb.map((g) => [`${g.family}.${g.id}`, JSON.stringify(g.value)]));
  let diff = 0;
  for (const g of ga) if (other.get(`${g.family}.${g.id}`) !== JSON.stringify(g.value)) diff++;
  return diff / ga.length;
}

/** One founder: an asset from the scope's pool, its AUTO points, a Look and Voice from the scope's decks. */
function founder(scope, { seed, press, attempt, ctx }, assets) {
  const decks = scopeDecks(scope);
  const library = list(ctx.library);
  const pool = decks.pool === 'sets' ? library.filter((a) => a && curatedIdSet.has(a.id)) : library;
  if (!pool.length) return null;
  const stem = `creature-deal|founder|${seed}|${press}|${scope}|${attempt}`;
  const asset = pool[pickIndex(`${stem}|asset`, pool.length)];
  const points = founderRoles(attachPointsFor(asset, ctx.assetAttach));
  if (scope !== 'koz' && !hasSkeleton(points)) return null; // ruling Q3: only KOZ deals a body with no head or limbs
  const lookId = decks.looks[pickIndex(`${stem}|look`, decks.looks.length)].id;
  const voice = decks.voices[pickIndex(`${stem}|voice`, decks.voices.length)];
  const rec = assembleCreature({
    assetId: asset.id,
    points,
    seed: seedOf(`${stem}|seed`),
    lookId,
    voiceId: voice.id,
  });
  return rec ? cultivated(rec, assets, seed) : null;
}

/** Three distinct bank records, drawn by the stream; null under BREED_PARENTS. */
function triad(bank, stem) {
  if (bank.length < BREED_PARENTS) return null;
  const picked = [];
  for (let i = 0; picked.length < BREED_PARENTS && i < 16; i++) {
    const idx = pickIndex(`${stem}|${i}`, bank.length);
    if (!picked.includes(idx)) picked.push(idx);
  }
  return picked.length === BREED_PARENTS ? picked.map((i) => bank[i]) : null;
}

/**
 * One hand mutation of a record, re-stamped and re-identified. handEditRecord edits a banked record IN PLACE and
 * keeps its id; a deal candidate is a creature of its own, so it takes a fresh id derived from what it now is
 * (the door's `cr-` + 8 hex shape, a pure function of the source id and the edited genome). Null when the gene has
 * no lawful mutation or the door refuses.
 */
function mutated(record, gene, seed, legalBodies, assets, certSeed) {
  const out = handEditRecord(record, { action: 'mutate', family: gene.family, id: gene.id }, { seed, legalBodies });
  if (!out.record) return null;
  const id = `cr-${hash32(`deal-mut|${record.id}|${JSON.stringify(out.record.genome)}`).toString(16).padStart(8, '0')}`;
  return cultivated({ ...out.record, id, cultivated: undefined }, assets, certSeed);
}

/** One bred child from the bank (at KOZ with extra hand mutations), stamped. Null when the breeder declines. */
function bred(scope, { seed, press, attempt, ctx }, assets) {
  const bank = list(ctx.bank);
  const stem = `creature-deal|breed|${seed}|${press}|${scope}|${attempt}`;
  const parents = triad(bank, `${stem}|triad`);
  if (!parents) return null;
  const records = parents.map((p) => sourceRecord({ kind: 'creature', record: p }, seed));
  if (records.some((r) => !r)) return null;
  let child = breedCreature(records, seed);
  if (!child) return null;
  if (scope === 'koz') {
    const legal = list(ctx.library).map((a) => a.id);
    for (const gene of MUTABLE) {
      if (u01(`${stem}|extra|${gene.family}.${gene.id}`) >= KOZ_EXTRA_MUTATION) continue;
      const next = mutated(child, gene, seedOf(`${stem}|mut|${gene.id}`), legal, assets, seed);
      if (next) child = next;
    }
  }
  return cultivated({ ...child, cultivated: undefined }, assets, seed);
}

/** The adapter the engines take: `kineticEngine.press(creatureAdapter, …)` and `curatorEngine.funnel(…)`. */
export const creatureAdapter = Object.freeze({
  scopes: CREATURE_SCOPES,
  defaultScope: CREATURE_DEFAULT_SCOPE,

  /** The wide deal: founders at every scope, plus breeds at MED and KOZ once the bank holds three. */
  deal(scope, { seed, press, maxDraws, ctx = {} }) {
    const assets = byId(ctx.library);
    const canBreed = (scope === 'med' || scope === 'koz') && list(ctx.bank).length >= BREED_PARENTS;
    const out = [];
    for (let attempt = 0; attempt < maxDraws; attempt++) {
      const args = { seed, press, attempt, ctx };
      const c = canBreed && attempt % BREED_EVERY === 1 ? bred(scope, args, assets) : founder(scope, args, assets);
      if (c) out.push(c);
    }
    return out;
  },

  /**
   * The fine deal: records within `cap` of the subject (a fraction of genes changed). Its own hand mutations
   * (one to as many genes as the cap allows) and, when the bank holds two others, a breed with it.
   */
  near(subject, cap, { seed, press, maxDraws, ctx = {} }) {
    const assets = byId(ctx.library);
    const legal = list(ctx.library).map((a) => a.id);
    const maxGenes = Math.max(1, Math.floor(cap * list(subject && subject.genome).length));
    const others = list(ctx.bank).filter((r) => r && r.id !== subject.id);
    const out = [];
    for (let attempt = 0; attempt < maxDraws; attempt++) {
      const stem = `creature-deal|near|${seed}|${press}|${subject.id}|${attempt}`;
      let c = null;
      if (others.length >= BREED_PARENTS - 1 && attempt % BREED_EVERY === 1) {
        const mates = triad([subject, ...others], `${stem}|triad`);
        const records = mates && mates.map((p) => sourceRecord({ kind: 'creature', record: p }, seed));
        const child = records && !records.some((r) => !r) && breedCreature(records, seed);
        c = child ? cultivated({ ...child, cultivated: undefined }, assets, seed) : null;
      } else {
        c = subject;
        const edits = 1 + (attempt % maxGenes);
        for (let e = 0; e < edits && c; e++) {
          const gene = MUTABLE[pickIndex(`${stem}|gene|${e}`, MUTABLE.length)];
          c = mutated(c, gene, seedOf(`${stem}|mut|${e}`), legal, assets, seed);
        }
      }
      if (c && c.id !== subject.id && creatureDistance(subject, c) <= cap) out.push(c);
    }
    return out;
  },

  /** Hard viability: the cultivate note reads viable. A stillborn dies in the hand, counted. */
  gate(candidate) {
    return !!(candidate && candidate.cultivated && candidate.cultivated.outcome === 'viable');
  },

  /** The measured read: LOIS cost and warnings, Davis novelty, TE completeness (kineticBirths' own), room bias. */
  read(candidate, ctx = {}) {
    return scoreBirthChild(candidate, { lookId: ctx.lookId || null, voiceId: ctx.voiceId || null });
  },

  key(candidate) {
    return candidate && typeof candidate.id === 'string' ? candidate.id : '';
  },
});
