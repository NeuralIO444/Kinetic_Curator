// wetLabLogic.mjs — #1946 (asset descriptors, slice 5): what the wet lab reads from the descriptors. Pure (no React, no
// store): the shape card, the breed-parent filters, the kit source, and the part preview.
import { assetDescriptor, libraryTraits } from '../data/assetDescriptor.js';
import { assetsWhere } from '../data/assetStyle.js';
import { resolveKit } from '../data/kits.js';
import { ROLES } from '../assets/assetRoles.js';
import { FACETS } from '../data/assetFacets.js';
import { creatureTile } from '../engine/creatureAssembler.js';
import { expandCreatureInstances, davisFitOf } from '../engine/creatureRig.js';
import { sanitizeOverlay } from '../assets/overlay.js';

/** FNV-1a — the house's seedable string hash (no Math.random anywhere). */
const hashStr = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
};

/** A role fit at or above this earns the artist a hint. */
export const HINT_MIN = 0.6;
/** A kit source draws its body by body-fit^k (seeded), among the kit's KIT_BODY_TOP best-body shapes. */
export const KIT_BODY_K = 2;
export const KIT_BODY_TOP = 5;

const HINTS = Object.freeze({
  limb: 'fits as a limb — long and thin; an L point suits it',
  head: 'fits as a head — compact; an H point suits it',
  body: 'fits as a body — a big mass; it carries the limbs',
});

/** The descriptor record of one asset (library traits baked, an import's on its record). */
export function descriptorOf(asset, assetTags = {}) {
  const user = String(asset.id).startsWith('user:');
  return assetDescriptor(
    asset,
    user ? asset.traits || null : libraryTraits(asset.id),
    user ? asset.tagEdits : assetTags[asset.id],
  );
}

/** The shape card: role-fit bars, the effective tags, and a hint when one role clearly fits. Pure. */
export function shapeCard(rec) {
  const d = rec.descriptor;
  const roles = ROLES.map((role) => ({ role, fit: d.roles[role] }));
  const tags = [];
  for (const facet of FACETS) for (const term of d.tags.effective[facet] || []) tags.push({ facet, term });
  for (const term of d.tags.effective.free || []) tags.push({ facet: 'free', term });
  const best = ['limb', 'head', 'body'].reduce((a, b) => (d.roles[b] > d.roles[a] ? b : a), 'limb');
  const hint = d.roles[best] >= HINT_MIN ? { role: best, text: HINTS[best] } : null;
  return { roles, tags, hint };
}

/** Facet filter options for the parent pickers: [{ key: 'subject:plant', facet, term }]. */
export function facetOptions(records) {
  const seen = new Map();
  for (const r of records) {
    for (const facet of FACETS) {
      for (const term of r.descriptor.tags.effective[facet] || [])
        seen.set(`${facet}:${term}`, { key: `${facet}:${term}`, facet, term });
    }
  }
  return [...seen.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/**
 * Banked creatures for the parent pickers, filtered by their BODY's tags and/or a kit. Exactly assetsWhere's answer over
 * the bodies (the same filter the pool panel uses), then the kit's pool.
 *
 * @param {Array} creatures banked creature records ({ id, body })
 * @param {Map<string, object>} bodyRecs body asset id → descriptor record
 * @param {{ facets?: object, kitIds?: Set<string>|null }} filter
 */
export function filterParents(creatures, bodyRecs, { facets = null, kitIds = null } = {}) {
  const hasFacets = facets && Object.keys(facets).length;
  const ids = new Set(assetsWhere([...bodyRecs.values()], hasFacets ? { facets } : {}));
  return creatures.filter((c) => ids.has(c.body) && (!kitIds || kitIds.has(c.body)));
}

/**
 * A kit source: the kit supplies a BODY by role fit, deterministic per seed. The pool is the kit's KIT_BODY_TOP shapes
 * with the highest `body` fit (ties by id); the draw is seeded and weighted by body fit^k, so the body is always one
 * of the kit's best bodies and still varies with the seed. Null for an empty kit.
 * @param {object} kit a kit record
 * @param {number} seed
 * @param {Array} descs descriptor records (kitDescriptors)
 */
export function kitBody(kit, seed, descs) {
  const { ids } = resolveKit(kit, descs);
  if (!ids.length) return null;
  const byId = new Map(descs.map((r) => [r.id, r]));
  const fit = (id) => byId.get(id).descriptor.roles.body;
  const pool = topBodies(ids, fit);
  let best = null;
  let bestK = -1;
  for (const id of pool) {
    const w = Math.max(0.05, fit(id)) ** KIT_BODY_K;
    const k = Math.pow(hashStr(`kit-body|${seed >>> 0}|${kit.id}|${id}`) / 4294967296, 1 / w);
    if (k > bestK) {
      best = id;
      bestK = k;
    }
  }
  return best;
}

/** The kit's best bodies: the KIT_BODY_TOP highest body fits, ties broken by id. */
export function topBodies(ids, fit) {
  return ids
    .slice()
    .sort((a, b) => fit(b) - fit(a) || (a < b ? -1 : 1))
    .slice(0, KIT_BODY_TOP);
}

/**
 * The part preview: which asset Davis would deal onto each bone of this creature on this stage. NO deal logic here — it
 * runs the very function the scene contract runs (expandCreatureInstances, with the contract's fit lookup).
 *
 * @param {object} record a banked creature record
 * @param {object} bodyAsset the record's body asset
 * @param {string[]} stageIds the stage's asset ids
 * @param {{ seed: number, overlay?: Array, pileOnly?: Set<string>|null, davis?: string|null }} opts
 * @returns {Array<{ bone: string, role: string, asset: string }>}
 */
export function previewDeal(
  record,
  bodyAsset,
  stageIds,
  { seed = 0, overlay = [], pileOnly = null, davis = null } = {},
) {
  const [tile] = sanitizeOverlay([creatureTile(record, bodyAsset)]);
  if (!tile || !tile.rig) return [];
  const inst = (asset, key) => ({
    asset,
    key,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    seedOffset: 0,
  });
  const instances = [inst(tile.id, 'preview'), ...stageIds.map((id, i) => inst(id, `s${i}`))];
  const overlayById = new Map([...overlay, tile].map((a) => [a.id, a]));
  const out = expandCreatureInstances(instances, overlayById, {
    seed,
    t: 0,
    frozen: true,
    davis,
    fitOf: davisFitOf(overlayById),
    pileOnly,
  });
  return out
    .filter((i) => i.key.startsWith('preview#'))
    .map((i) => ({
      bone: i.key.slice('preview#'.length),
      role: i.key.endsWith('#h') ? 'head' : 'limb',
      asset: i.asset,
    }));
}
