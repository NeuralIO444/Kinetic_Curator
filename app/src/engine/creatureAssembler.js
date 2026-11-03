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
 * dealt / none / wild; breeding (#1852) will add parent:/cross:/mut: — admitted now so its records load in this build.
 */
const SOURCE_RE = /^(?:(?:asset|look|voice|parent|cross|mut):[A-Za-z0-9_:.~-]{1,120}|dealt|none|wild)$/;
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
 * The genome door. The birth genes must lead, in canonical order, with values of the right shape; genes after them are
 * a newer build's (or breeding's) additions and are kept when well-formed. Returns the clean list, or null.
 */
function sanitizeGenomeBlock(raw, rec) {
  if (!Array.isArray(raw) || raw.length > MAX_RECORD_GENES) return null;
  const want = [
    ['FORM', 'body'],
    ['FORM', 'head'],
    ['FORM', 'limbs'],
    ['FORM', 'joints'],
    ['LOOK', 'look'],
    ['VOICE', 'voice'],
    ['MATERIAL', 'material'],
    ...BIRTH_DRIVES.map((d) => ['DRIVE', d]),
  ];
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
  return { ...rec, look: raw.look, voice: raw.voice, genome };
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
 * The overlay entry for a record — an ordinary pool asset. `bodyAsset` is the body's own pool record (library or
 * import). Returns null when the body cannot be drawn (no such asset): no creature tile without a body.
 */
export function creatureTile(record, bodyAsset) {
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
  };
}
