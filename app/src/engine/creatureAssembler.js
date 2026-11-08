// engine/creatureAssembler.js — #1849 (slice 1 of #1848): the WetLab assembler.
//
// Matt (2026-10-29): creatures are made of the stage's own design material. The assembler takes a basic asset shape and
// its ATTACH points (engine/assetAttach.js — plain / H the head / L where a limb may grow) and produces a CREATURE
// RECORD: body = the shape, head = the H point, limbs = the L points, plus empty drive slots (drives are #1808's world;
// empty is honest). The record is born inheritable (scope amendment on #1849): it carries a Look reference and a Voice
// reference into the real decks, and a GENOME block — every inheritable parameter as a gene { family, id, value,
// source } across the five families FORM / LOOK / VOICE / MATERIAL / DRIVE — so slice 4's breeding (#1852) never needs a
// record migration.
//
// Data only. No stage reads a record in this slice (no injection — that is #1850): nothing on stage changes.
//
// Pure and deterministic: no clock, no Math.random. The only draws are the Look and Voice deals when the caller names
// none, and they ride the registered 'hierarchy' channel (a creature's parts are placement — the spatial stream the
// creature genome already uses), keyed by the asset and its points, so the same seed + asset + points assemble the
// identical record, byte for byte.
//
// `sanitizeCreatureRecord` is the trust-boundary door (records live in the project document, which can be hand-edited
// or arrive from an older build): a record that is dishonest in any particular — unknown kind, a Look or Voice that does
// not resolve to a real deck, a malformed point or gene — is refused whole, never half-loaded.

import { hashU01 } from './kernel/rng.js';
import { sanitizeAttachPoints, ATTACH_BOX } from './assetAttach.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { creatureTileId } from './creatureTileId.js';
import { creatureTileSvg, buildRig } from './creatureRig.js';
import { VOICE_DECK } from '../data/voiceDeck.js';

export const CREATURE_ASSEMBLY_KIND = 'kc-assembled/1';
/** The gene families, in the record's canonical order (#1849 scope amendment). */
export const GENE_FAMILIES = Object.freeze(['FORM', 'LOOK', 'VOICE', 'MATERIAL', 'DRIVE']);
/** A project keeps at most this many assembled records (the oldest drop off). */
export const MAX_CREATURE_RECORDS = 64;
/** A drive gene's value at birth: the species norm (creatureGenome's drive gain scale, 1 = norm). */
export const DRIVE_NORM = 1;
/** A drive gene's legal range (creatureGenome GENE_RANGES.drive). Outside it, a record is refused, never clamped. */
export const DRIVE_RANGE = Object.freeze({ min: 0.25, max: 2 });
/**
 * The drives a kc-assembled/1 record is BORN with. Frozen here on purpose rather than imported from creatureGenome's
 * DRIVES (a list #1808 owns): if that list grows, records already saved stay valid, and the new drive arrives as an
 * extra gene the door keeps (see sanitizeGenomeBlock's forward-compatibility rule).
 */
export const BIRTH_DRIVES = Object.freeze(['approval', 'crowding', 'strain', 'boredom']);
/** At most this many genes per record (the birth set is 11; room for breeding's additions). */
export const MAX_RECORD_GENES = 64;
/**
 * #2030 — at most this many ancestors in a record's retained ancestry summary. A validation ceiling against
 * pathological documents, in the door's usual spirit: merging summaries adds at most three entries per
 * generation (the parents; deeper ancestors arrive by reference, deduplicated), so the ceiling stands past
 * a hundred generations of wholly novel triads — and the bank itself holds at most MAX_CREATURE_RECORDS
 * records, so real families reuse ancestors long before that. There is NO truncation: a document past the
 * ceiling is refused whole, never half-loaded with its deep lines silently dropped.
 */
export const MAX_ANCESTRY_ENTRIES = 384;

const LOOK_IDS = new Set(COMPOSITION_PRESETS.map((p) => p.id));
const VOICE_IDS = new Set(VOICE_DECK.map((v) => v.id));
const LOOK_ORDER = COMPOSITION_PRESETS.map((p) => p.id);
const VOICE_ORDER = VOICE_DECK.map((v) => v.id);

/** True when a Look id names a real Look deck entry. */
export const isLookId = (id) => typeof id === 'string' && LOOK_IDS.has(id);
/** True when a Voice id names a real Voice deck entry. */
export const isVoiceId = (id) => typeof id === 'string' && VOICE_IDS.has(id);
/** A Look's display name, or null. */
export const lookName = (id) => COMPOSITION_PRESETS.find((p) => p.id === id)?.name ?? null;
/** A Voice's display name, or null. */
export const voiceName = (id) => {
  const v = VOICE_DECK.find((d) => d.id === id);
  return v ? (v.def?.name ?? v.id) : null;
};

/** FNV-1a of a string: a stable 32-bit key. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The assembly key: what the record is a pure function of (besides the seed). */
const assemblyKey = (assetId, points) => `${assetId}|${points.map((p) => `${p.x},${p.y},${p.role || ''}`).join(';')}`;

const pickFrom = (order, seed, key, salt) =>
  order[Math.floor(hashU01(seed >>> 0, 'hierarchy', (hash32(key) + salt) >>> 0) * order.length) % order.length];

/**
 * Assemble a creature record from a basic asset and its ATTACH points.
 * @param {object} p
 *   assetId: the body asset's id (required).
 *   points:  the asset's attach points as the WetLab shows them (the artist's own, or the shape's AUTO points).
 *   seed:    the deal seed (uint32). Same seed + asset + points → the identical record.
 *   lookId / voiceId: optional references; when absent (or not a real deck entry) they are dealt from the seed.
 * @returns the record, or null when the asset id is missing.
 */
export function assembleCreature({ assetId, points = [], seed = 0, lookId = null, voiceId = null } = {}) {
  if (typeof assetId !== 'string' || !assetId || assetId.length > 120) return null;
  const pts = sanitizeAttachPoints(points);
  const s = seed >>> 0;
  const key = assemblyKey(assetId, pts);
  const head = pts.find((p) => p.role === 'H') || null;
  const limbs = pts.filter((p) => p.role === 'L');
  const joints = pts.filter((p) => !p.role);

  const look = isLookId(lookId) ? lookId : pickFrom(LOOK_ORDER, s, key, 0x1849);
  const voice = isVoiceId(voiceId) ? voiceId : pickFrom(VOICE_ORDER, s, key, 0x1850);
  const lookSource = isLookId(lookId) ? `look:${look}` : 'dealt';
  const voiceSource = isVoiceId(voiceId) ? `voice:${voice}` : 'dealt';
  const assetSource = `asset:${assetId}`;

  const genome = [
    { family: 'FORM', id: 'body', value: assetId, source: assetSource },
    { family: 'FORM', id: 'head', value: head ? { x: head.x, y: head.y } : null, source: assetSource },
    { family: 'FORM', id: 'limbs', value: limbs.map((p) => ({ x: p.x, y: p.y })), source: assetSource },
    { family: 'FORM', id: 'joints', value: joints.map((p) => ({ x: p.x, y: p.y })), source: assetSource },
    { family: 'LOOK', id: 'look', value: look, source: lookSource },
    { family: 'VOICE', id: 'voice', value: voice, source: voiceSource },
    // MATERIAL is stubbed from day one so the genome shape never migrates (proposal 2 on #1848): no material yet.
    { family: 'MATERIAL', id: 'material', value: null, source: 'none' },
    ...BIRTH_DRIVES.map((d) => ({ family: 'DRIVE', id: d, value: DRIVE_NORM, source: 'wild' })),
  ];

  return {
    kind: CREATURE_ASSEMBLY_KIND,
    id: `cr-${hash32(`${s}|${key}|${look}|${voice}`).toString(16).padStart(8, '0')}`,
    seed: s,
    body: assetId,
    head: head ? { x: head.x, y: head.y } : null,
    limbs: limbs.map((p) => ({ x: p.x, y: p.y })),
    joints: joints.map((p) => ({ x: p.x, y: p.y })),
    drives: Object.fromEntries(BIRTH_DRIVES.map((d) => [d, null])), // slots only — drives are #1808's world
    look,
    voice,
    genome,
  };
}

const inBox = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= ATTACH_BOX;
const snap = (n) => Math.round(n * 100) / 100; // the assembler's own precision (assetAttach snaps the same way)
const isPt = (p) => !!p && typeof p === 'object' && inBox(p.x) && inBox(p.y);
const cleanPt = (p) => ({ x: snap(p.x), y: snap(p.y) });
const cleanPts = (list, max) =>
  Array.isArray(list) && list.length <= max && list.every(isPt) ? list.map(cleanPt) : null;
const inDriveRange = (v) => typeof v === 'number' && Number.isFinite(v) && v >= DRIVE_RANGE.min && v <= DRIVE_RANGE.max;

/**
 * A gene's source, by grammar: where its value came from. The birth sources are asset:<id> / look:<id> / voice:<id> /
 * dealt / none / wild; breeding (#1852) adds parent:/cross:/mut:; the Genome Timeline's hand edits (#1870) add
 * hand: — hand:mut (a hand mutation), hand:look:<id> / hand:voice:<id> (replaced from the family's deck),
 * hand:asset:<id> (replaced from that shape: the body itself, or its own ATTACH points for a skeleton gene),
 * hand:donor:<recordId> (replaced from that record's corresponding gene). A hand source is the ONLY source a
 * post-birth edit may claim: mut:/parent: carry lineage semantics (below) that a hand act must not borrow.
 */
const SOURCE_RE = /^(?:(?:asset|look|voice|parent|cross|mut|hand):[A-Za-z0-9_:.~-]{1,120}|dealt|none|wild)$/;
const FAMILY_RE = /^[A-Z]{2,16}$/;
const GENE_ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;

/**
 * A gene this build does not know (forward compatibility): kept verbatim when it is well-formed — a family and id of
 * the right grammar, a source of the right grammar, and a small JSON-safe value. A newer build's additions survive an
 * older build's load AND its next save, so no record is ever silently erased by an upgrade or a downgrade.
 */
function cleanExtraGene(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
  if (typeof g.family !== 'string' || !FAMILY_RE.test(g.family)) return null;
  if (typeof g.id !== 'string' || !GENE_ID_RE.test(g.id)) return null;
  if (typeof g.source !== 'string' || !SOURCE_RE.test(g.source)) return null;
  let text;
  try {
    text = JSON.stringify(g.value ?? null);
  } catch {
    return null;
  }
  if (typeof text !== 'string' || text.length > 1024) return null;
  return { family: g.family, id: g.id, value: JSON.parse(text), source: g.source };
}

/**
 * The birth block: the genes every genome leads with, in canonical order — the skeleton and the named references,
 * then the birth drives. The genome door holds a live genome to it; the ancestry door (#2030) holds every retained
 * summary entry to the same block, because an entry IS a genome as it stood at a birth.
 */
const BIRTH_BLOCK = [
  ['FORM', 'body'],
  ['FORM', 'head'],
  ['FORM', 'limbs'],
  ['FORM', 'joints'],
  ['LOOK', 'look'],
  ['VOICE', 'voice'],
  ['MATERIAL', 'material'],
  ...BIRTH_DRIVES.map((d) => ['DRIVE', d]),
];

/**
 * The genome door. The birth genes must lead, in canonical order, with values of the right shape; genes after them are
 * a newer build's (or breeding's) additions and are kept when well-formed. Returns the clean list, or null.
 */
function sanitizeGenomeBlock(raw, rec) {
  if (!Array.isArray(raw) || raw.length > MAX_RECORD_GENES) return null;
  const want = BIRTH_BLOCK;
  if (raw.length < want.length) return null;
  const out = [];
  const seen = new Set();
  for (let i = 0; i < want.length; i++) {
    const g = raw[i];
    const [family, id] = want[i];
    if (!g || typeof g !== 'object' || g.family !== family || g.id !== id) return null;
    if (typeof g.source !== 'string' || !SOURCE_RE.test(g.source)) return null;
    let value;
    if (id === 'body') value = g.value === rec.body ? g.value : undefined;
    else if (id === 'head') value = g.value === null ? null : isPt(g.value) ? cleanPt(g.value) : undefined;
    else if (id === 'limbs' || id === 'joints') value = cleanPts(g.value, 4) ?? undefined;
    else if (id === 'look') value = isLookId(g.value) ? g.value : undefined;
    else if (id === 'voice') value = isVoiceId(g.value) ? g.value : undefined;
    else if (id === 'material') value = g.value === null || typeof g.value === 'string' ? g.value : undefined;
    else value = inDriveRange(g.value) ? g.value : undefined;
    if (value === undefined) return null;
    out.push({ family, id, value, source: g.source });
    seen.add(`${family}.${id}`);
  }
  for (let i = want.length; i < raw.length; i++) {
    const g = cleanExtraGene(raw[i]);
    if (!g) return null;
    const k = `${g.family}.${g.id}`;
    if (seen.has(k)) return null; // a gene is one gene: no second copy of a birth gene or an addition
    seen.add(k);
    out.push(g);
  }
  return out;
}

/**
 * Validate one record (document data). Returns a normalized copy carrying only the known fields, or null when the
 * record is absent or dishonest in any particular. The Look and Voice must resolve to the real decks.
 */
export function sanitizeCreatureRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.kind !== CREATURE_ASSEMBLY_KIND) return null;
  if (typeof raw.id !== 'string' || !/^cr-[0-9a-f]{8}$/.test(raw.id)) return null;
  if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff) return null;
  if (typeof raw.body !== 'string' || !raw.body || raw.body.length > 120) return null;
  if (!isLookId(raw.look) || !isVoiceId(raw.voice)) return null;
  const head = raw.head === null ? null : isPt(raw.head) ? cleanPt(raw.head) : undefined;
  if (head === undefined) return null;
  const limbs = cleanPts(raw.limbs, 4);
  const joints = cleanPts(raw.joints, 4);
  if (!limbs || !joints || limbs.length + joints.length + (head ? 1 : 0) > 4) return null;
  if (!raw.drives || typeof raw.drives !== 'object' || Array.isArray(raw.drives)) return null;
  // Drive slots: every birth drive is present; a slot is empty (null) or a gain in range. A slot this build does not
  // know (a newer drive) is kept when it is well-formed, so a newer project's drives survive this build's save.
  const drives = {};
  for (const d of BIRTH_DRIVES) {
    const v = raw.drives[d];
    if (v !== null && !inDriveRange(v)) return null;
    drives[d] = v;
  }
  for (const [d, v] of Object.entries(raw.drives)) {
    if (d in drives) continue;
    if (!GENE_ID_RE.test(d) || Object.keys(drives).length >= 16) return null;
    if (v !== null && !inDriveRange(v)) return null;
    drives[d] = v;
  }
  const rec = { kind: CREATURE_ASSEMBLY_KIND, id: raw.id, seed: raw.seed, body: raw.body, head, limbs, joints, drives };
  const genome = sanitizeGenomeBlock(raw.genome, rec);
  if (!genome) return null;
  // The record's own fields and its genome must agree: a gene is the source of truth it claims to be.
  const gene = (id) => genome.find((g) => g.id === id).value;
  if (gene('look') !== raw.look || gene('voice') !== raw.voice) return null;
  if (JSON.stringify(gene('head')) !== JSON.stringify(head)) return null;
  if (JSON.stringify(gene('limbs')) !== JSON.stringify(limbs)) return null;
  if (JSON.stringify(gene('joints')) !== JSON.stringify(joints)) return null;
  // #1852 — a bred child's lineage: its three parents, its seed, every mutation. Kept only when it is whole and honest;
  // a record with a malformed lineage is refused (a child that lies about its parents is not loaded half-true).
  if (raw.lineage === undefined || raw.lineage === null) {
    // #2030 — ancestry without a birth is a lie by shape: only a bred child retains ancestors.
    if (raw.ancestry !== undefined && raw.ancestry !== null) return null;
    return { ...rec, look: raw.look, voice: raw.voice, genome };
  }
  const lineage = sanitizeLineage(raw.lineage);
  if (!lineage || !lineageAgrees(lineage, { ...rec, genome })) return null;
  const out = { ...rec, look: raw.look, voice: raw.voice, genome, lineage };
  // #2030 — the retained ancestry rides a bred record (the Lineage Tree renders from it alone). A record bred
  // before summaries existed carries lineage and no ancestry: legal, and the tree shows its parents as stubs.
  if (raw.ancestry === undefined || raw.ancestry === null) return out;
  const ancestry = sanitizeAncestry(raw.ancestry, lineage, raw.id, genome);
  if (!ancestry) return null;
  return { ...out, ancestry };
}

/**
 * #1852 — a lineage and its genome must tell the same story: the seed is the record's; the child is not its own parent;
 * every gene came from the three (parent:/cross: over exactly them) or from a mutation; every mut: gene has exactly
 * one lineage entry and every entry its mut: gene (a reroll's value IS its gene's); and a bred child's drive slots
 * are its drive genes. #1870 — a hand: gene postdates the birth and owes no birth source; a mutation entry for it
 * is superseded by the hand act but still accounted (no orphan entries). A child whose lineage disagrees with its
 * genes is refused whole.
 */
function lineageAgrees(lineage, rec) {
  if (lineage.seed !== rec.seed || lineage.parents.includes(rec.id)) return false;
  const parents = new Set(lineage.parents);
  const trio = [...lineage.parents].sort().join('~');
  const SKELETON = new Set(['head', 'limbs', 'joints']);
  const geneName = (g) => (g.family === 'FORM' && SKELETON.has(g.id) ? 'FORM.skeleton' : `${g.family}.${g.id}`);
  const byGene = new Map();
  for (const m of lineage.mutations) {
    if (byGene.has(m.gene)) return false; // one mutation per gene
    byGene.set(m.gene, m);
  }
  const mutated = new Set();
  for (const g of rec.genome) {
    const at = g.source.indexOf(':');
    const kind = at > 0 ? g.source.slice(0, at) : g.source;
    const rest = at > 0 ? g.source.slice(at + 1) : '';
    const m = byGene.get(geneName(g));
    if (kind === 'hand') {
      // #1870 — a hand-edited gene postdates the birth: its value is the performer's, not the breeding draw's,
      // so no birth source is owed for it. If the birth did record a mutation entry for this gene, the hand act
      // supersedes it — the entry is accounted, not orphaned (the final size check below still has to pass).
      // A hand gene stays a first-class fact: a drive slot still has to agree with its drive gene.
      if (m) mutated.add(m.gene);
    } else if (kind === 'parent') {
      if (!parents.has(rest) || m) return false;
    } else if (kind === 'cross') {
      if (g.family !== 'DRIVE' || rest.split('~').sort().join('~') !== trio || m) return false;
    } else if (kind === 'mut') {
      if (!m) return false;
      if (m.kind === 'swap' && (m.to !== rest || g.family === 'DRIVE')) return false;
      if (m.kind === 'reroll' && (g.family !== 'DRIVE' || rest !== g.id || m.value !== g.value)) return false;
      mutated.add(m.gene);
    } else return false;
    if (g.family === 'DRIVE' && rec.drives[g.id] !== g.value) return false;
  }
  return mutated.size === byGene.size; // no mutation entry without its gene
}

const RECORD_ID_RE = /^cr-[0-9a-f]{8}$/;
const MUT_GENE_RE = /^[A-Z]{2,16}\.[a-z][a-z0-9_-]{0,31}$/;
/** #1852 — the lineage door: exactly three distinct parent ids, the breeding seed, and a short list of mutations. */
function sanitizeLineage(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const parents = raw.parents;
  if (
    !Array.isArray(parents) ||
    parents.length !== 3 ||
    !parents.every((p) => typeof p === 'string' && RECORD_ID_RE.test(p))
  )
    return null;
  if (new Set(parents).size !== 3) return null;
  if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff) return null;
  if (!Array.isArray(raw.mutations) || raw.mutations.length > MAX_RECORD_GENES) return null;
  const mutations = [];
  for (const m of raw.mutations) {
    if (!m || typeof m !== 'object' || typeof m.gene !== 'string' || !MUT_GENE_RE.test(m.gene)) return null;
    if (m.kind === 'swap') {
      if (!parents.includes(m.from) || !parents.includes(m.to) || m.from === m.to) return null;
      mutations.push({ gene: m.gene, kind: 'swap', from: m.from, to: m.to });
    } else if (m.kind === 'reroll') {
      if (!inDriveRange(m.value)) return null;
      mutations.push({ gene: m.gene, kind: 'reroll', value: m.value });
    } else return null;
  }
  return { parents: [...parents], seed: raw.seed, mutations };
}

/**
 * #2030 — one gene inside an ancestry summary: the ancestor's gene as it stood at the child's birth. The birth
 * genes carry their value shapes (a Look must resolve, a drive must be in range, points must be in the box —
 * the summary may not smuggle what the genome door would refuse); a gene this build does not know is kept
 * verbatim when well-formed, the genome's own forward-compatibility rule.
 */
function sanitizeSummaryGene(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
  if (typeof g.family !== 'string' || !FAMILY_RE.test(g.family)) return null;
  if (typeof g.id !== 'string' || !GENE_ID_RE.test(g.id)) return null;
  if (typeof g.source !== 'string' || !SOURCE_RE.test(g.source)) return null;
  let value;
  if (g.family === 'FORM' && g.id === 'body')
    value = typeof g.value === 'string' && g.value && g.value.length <= 120 ? g.value : undefined;
  else if (g.family === 'FORM' && g.id === 'head')
    value = g.value === null ? null : isPt(g.value) ? cleanPt(g.value) : undefined;
  else if (g.family === 'FORM' && (g.id === 'limbs' || g.id === 'joints')) value = cleanPts(g.value, 4) ?? undefined;
  else if (g.family === 'LOOK' && g.id === 'look') value = isLookId(g.value) ? g.value : undefined;
  else if (g.family === 'VOICE' && g.id === 'voice') value = isVoiceId(g.value) ? g.value : undefined;
  else if (g.family === 'MATERIAL' && g.id === 'material')
    value = g.value === null || typeof g.value === 'string' ? g.value : undefined;
  else if (g.family === 'DRIVE') value = inDriveRange(g.value) ? g.value : undefined;
  else return cleanExtraGene(g);
  if (value === undefined) return null;
  return { family: g.family, id: g.id, value, source: g.source };
}

/**
 * #2030 — the ancestry door. The summary is a flat list, breadth-first: the record's three parents first (in
 * lineage order), then deeper ancestors merged from the parents' own summaries, deduplicated by id. Each
 * entry is an ancestor's identity, its genes at the child's birth, and its own parents' ids. An entry's
 * parents may name ids with NO entry — the frontier: an ancestor bred before summaries existed names parents
 * that were never retained; the tree renders those as stubs rather than inventing them. What the door holds:
 * the first three entries ARE the lineage parents; ids are unique and never the record's own; a founder's
 * entry has no parents, a bred one exactly three; the parent graph among entries is acyclic — ancestry only
 * ever points backwards; every entry's genes lead with the birth block, the genome door's own core set; and
 * the retained values AGREE with the record's other tellings of the same birth (ancestryAgrees, below) — a
 * value validated only in isolation could be rewritten in range and pass, which is tampering the summary
 * exists to make visible. Tampered ancestry refuses the record whole, like any other field.
 */
function sanitizeAncestry(raw, lineage, selfId, genome) {
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > MAX_ANCESTRY_ENTRIES) return null;
  const entries = [];
  const byId = new Map();
  for (const e of raw) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
    if (typeof e.id !== 'string' || !RECORD_ID_RE.test(e.id) || e.id === selfId || byId.has(e.id)) return null;
    if (!Array.isArray(e.parents) || (e.parents.length !== 0 && e.parents.length !== 3)) return null;
    if (!e.parents.every((p) => typeof p === 'string' && RECORD_ID_RE.test(p) && p !== e.id)) return null;
    if (new Set(e.parents).size !== e.parents.length) return null;
    if (!Array.isArray(e.genes) || e.genes.length === 0 || e.genes.length > MAX_RECORD_GENES) return null;
    const genes = [];
    const seenGenes = new Set();
    for (const g of e.genes) {
      const clean = sanitizeSummaryGene(g);
      if (!clean) return null;
      const k = `${clean.family}.${clean.id}`;
      if (seenGenes.has(k)) return null; // a gene is one gene, in a summary as in a genome
      seenGenes.add(k);
      genes.push(clean);
    }
    // core-set parity with the genome door: an entry is a genome as it stood, so it leads with the birth
    // block, whole and in order — an entry missing a birth gene, or holding another gene in its place, is
    // not a genome this door would have let live
    if (genes.length < BIRTH_BLOCK.length) return null;
    for (let i = 0; i < BIRTH_BLOCK.length; i++)
      if (genes[i].family !== BIRTH_BLOCK[i][0] || genes[i].id !== BIRTH_BLOCK[i][1]) return null;
    const entry = { id: e.id, genes, parents: [...e.parents] };
    entries.push(entry);
    byId.set(entry.id, entry);
  }
  // the head of the list is the birth itself: the three parents, in the lineage's order
  for (let i = 0; i < 3; i++) if (entries[i].id !== lineage.parents[i]) return null;
  // acyclic among entries (frontier ids have no entry and end their walk there)
  const mark = new Map(); // id -> 1 walking, 2 done
  const walk = (id) => {
    const e = byId.get(id);
    if (!e) return true;
    const m = mark.get(id) || 0;
    if (m === 1) return false;
    if (m === 2) return true;
    mark.set(id, 1);
    for (const p of e.parents) if (!walk(p)) return false;
    mark.set(id, 2);
    return true;
  };
  for (const e of entries) if (!walk(e.id)) return null;
  if (!ancestryAgrees(entries, byId, lineage, genome)) return null;
  return entries;
}

/**
 * #2030 — the breeder's crossed-drive blend (engine/creatureBreed.js), re-derived at the door: a crossed
 * drive is a seeded convex weighting of the three parents' values for that drive — weights drawn from the
 * breeding key, the weighted mean rounded to the breeder's precision and clamped to the legal range. The
 * door holds everything the blend consumed: the seed and the parents (the lineage's, in the breeder's
 * id-sorted order) and, in the head entries, the parents' values exactly as they stood at the birth. So a
 * crossed gene in the record's own genome is exactly re-derivable, and a head value rewritten after the
 * fact breaks the blend it fed. creatureBreed's formula, verbatim — the suite's bred families pin the two
 * together across seeds, so a breeder change that forgets this mirror fails loudly, never silently.
 */
function crossedDriveValue(seed, parentIds, driveId, valueOf) {
  const key = `${seed >>> 0}|${parentIds.join('|')}`;
  const w = parentIds.map((id) => 0.2 + hash32(`${key}|w|${driveId}|${id}`) / 4294967296);
  const sum = w.reduce((a, b) => a + b, 0);
  const v = Math.round(parentIds.reduce((acc, id, i) => acc + (valueOf(id) * w[i]) / sum, 0) * 1000) / 1000;
  return Math.min(DRIVE_RANGE.max, Math.max(DRIVE_RANGE.min, v));
}

/**
 * #2030 — agreement, in lineageAgrees' spirit: the summary's retained values must tell the same story as
 * every other part of the record that re-states them. A gene's source says where its value came from, and
 * breeding's law (engine/creatureBreed.js) makes two of those claims checkable against retained entries:
 * a parent: gene holds its named parent's value whole, and a mut: gene on a discrete gene (or the skeleton)
 * is a swap — its value is the named parent's value, re-picked. So wherever the named parent stands retained
 * as an entry, the entry must hold that gene, deep-equal; missing or unequal refuses. A hand: gene is the
 * performer's own act and evidences nothing about its parents; crossed genes inside entries blend from a
 * birth whose seed no entry retains, so they are not re-derivable there; a named parent with no entry is
 * the frontier, and there is nothing to check against. At the head one more telling exists: the record's
 * own crossed drives consumed the head entries' drive values under the lineage's seed, so those values are
 * held to the blend (crossedDriveValue, above).
 */
function ancestryAgrees(entries, byId, lineage, genome) {
  const geneIn = (entry, family, id) =>
    entry ? entry.genes.find((g) => g.family === family && g.id === id) : undefined;
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // a gene against the retained entry of the parent its source names, where that parent is one of this
  // birth's three and stands retained; true when the gene makes no such claim, or the claim cannot be read
  const agreesWithParent = (parents, g) => {
    const at = g.source.indexOf(':');
    const kind = at > 0 ? g.source.slice(0, at) : g.source;
    const rest = at > 0 ? g.source.slice(at + 1) : '';
    // a DRIVE mut: is a reroll and names the gene itself; every other mut: is a swap and names the holder
    const holder = kind === 'parent' || (kind === 'mut' && g.family !== 'DRIVE') ? rest : null;
    if (!holder || !parents.includes(holder)) return true;
    const entry = byId.get(holder);
    if (!entry) return true; // the frontier: the parent is named but was never retained — nothing to check against
    const held = geneIn(entry, g.family, g.id);
    return !!held && eq(held.value, g.value);
  };
  // summary-internal: every entry's genes against the entries of its own parents
  for (const e of entries) for (const g of e.genes) if (!agreesWithParent(e.parents, g)) return false;
  // the head: the record's own genome against its three parents' entries — inherited and swapped genes by
  // the same reading, crossed drives by the blend they were dealt from
  const trio = [...lineage.parents].sort();
  for (const g of genome) {
    if (g.family === 'DRIVE' && g.source.startsWith('cross:')) {
      const inputs = trio.map((id) => geneIn(byId.get(id), 'DRIVE', g.id));
      if (inputs.every(Boolean)) {
        const expected = crossedDriveValue(lineage.seed, trio, g.id, (id) => geneIn(byId.get(id), 'DRIVE', g.id).value);
        if (expected !== g.value) return false;
      }
    } else if (!agreesWithParent(lineage.parents, g)) return false;
  }
  return true;
}

/** The project's record list: every entry re-validated, de-duplicated by id (first wins), capped (newest kept). */
export function sanitizeCreatureRecords(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const rec = sanitizeCreatureRecord(r);
    if (!rec || seen.has(rec.id)) continue;
    seen.add(rec.id);
    out.push(rec);
  }
  return out.slice(-MAX_CREATURE_RECORDS);
}

// ── #1850 (slice 2 of #1848): the creature as a POOL TILE ──────────────────────────────────────────────────────────
//
// Matt's ruling (2026-11-02): assembled creatures enter stages through the normal asset placement path — "if the
// stage would place an asset there, it can place a creature there" — and the existing moth / dish spawn channel stays
// as it is (retiring it is its own ruling). So an assembled creature materialises as an ordinary pool asset in the
// artist's overlay (customAssets, the same place an imported SVG lives): its tile is pooled, placed, seeded, baked,
// weighted, soloed, pinned still, saved with the project and recorded in takes exactly like any asset, by the same
// code, with no creature branch anywhere. Like the creature citizen it is never DEALT by the library pools (the
// artist turns it on, like any tile): state/rollPool.mjs dealableRecords skips creature tiles.
//
// The tile's drawing is the body alone, in var(--ink) / var(--accent), so the STAGE dresses it. Its head and limbs are
// invisible bones carried as data (`rig`, #1851, engine/creatureRig.js): at contract time each bone gets a part dealt
// from the stage's own shapes and moved by Lois's gait (Matt, 2026-10-29: the stage overrides the creature's own
// Look / Voice; the references stay in the genome for breeding).

export { creatureTileId, isCreatureTileId, recordIdOfTile, isCreatureTile } from './creatureTileId.js';

// #1851: the drawing and the bones live in engine/creatureRig.js. Re-exported here so callers keep one import.
export { TILE_BODY_SCALE, creatureTileSvg, buildRig } from './creatureRig.js';

/**
 * #1947 — the founder a record's skeleton descends from: follow the skeleton's source (the head / limbs / joints genes
 * travel as one linkage group, #1852) parent by parent through the bank until an assembled (unbred) creature. A
 * parent the bank no longer holds ends the walk at that id — the nearest known ancestor. Bounded and cycle-safe.
 */
export function skeletonFounder(record, bank = []) {
  const byId = new Map((bank || []).map((r) => [r && r.id, r]));
  let cur = record;
  const seen = new Set();
  for (let i = 0; i < 64 && cur && !seen.has(cur.id); i++) {
    seen.add(cur.id);
    if (!cur.lineage) return cur.id;
    const src = (cur.genome || []).find((g) => g.id === 'limbs')?.source || '';
    const m = /^(?:parent|mut):(cr-[0-9a-f]{8})$/.exec(src);
    if (!m) return cur.id;
    const next = byId.get(m[1]);
    if (!next) return m[1];
    cur = next;
  }
  return cur ? cur.id : null;
}

/**
 * The overlay entry for a record — an ordinary pool asset. `bodyAsset` is the body's own pool record (library or
 * import). Returns null when the body cannot be drawn (no such asset): no creature tile without a body.
 */
export function creatureTile(record, bodyAsset, kin = null) {
  const svg = creatureTileSvg(record, bodyAsset && bodyAsset.svg);
  if (!svg) return null;
  return {
    id: creatureTileId(record.id),
    category: 'creature',
    weight: bodyAsset.weight || 'medium',
    tags: ['creature', 'wetlab', record.body],
    compound: true,
    source: 'wetlab',
    svg,
    // #1851 — the invisible bones (the head, the limb chains); parts are dealt onto them from the stage
    ...((rig) => (rig ? { rig } : {}))(buildRig(record)),
    // #1947 — a bred creature's family: the founder its skeleton descends from (a founder carries none — it is its own)
    ...(typeof kin === 'string' && kin !== record.id && /^cr-[0-9a-f]{8}$/.test(kin) ? { kin } : {}),
  };
}
