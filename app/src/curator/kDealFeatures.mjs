// curator/kDealFeatures.mjs — #2551: the K-DEAL feature universes.
//
// The taste head walks recipe features (what a layout is); the persona heads walk decision
// features (what a player did). The stage K deal's ordering heads (#2551, the T2 pattern
// extended to the deal's creature and construct strata) judge an ASSEMBLED RECORD — what a
// dealt creature or construct recipe IS: its hierarchy and composition descriptors. That is a
// third input kind, so it gets its own universes, named and versioned here: one per stratum,
// because a creature's descriptors and a construct's share almost no vocabulary, and a head
// trained on one stratum must never be walked over the other.
//
// This module is the ONE definition: the app walks K-deal heads over exactly the vectors these
// functions build, and the offline trainer (studio side, when Matt's keep/cut labels on dealt
// creatures/constructs have accrued) binds its columns to creatureFeatureNames() /
// constructFeatureNames() and encodes its training rows through these same functions — a
// feature a train row has but a live candidate lacks (or the reverse) would teach the head a
// world that does not exist.
//
// Encoding law (the walker's conventions, shared with the recipe and decision universes):
//   - categoricals live at the top level; an absent one fails every '=' split test,
//   - numerics live in the `num` block under their full name; an absent one walks as 0.
// So any readable subset of a record yields a valid vector, and absence is one consistent fact
// on both sides of the train/walk boundary.
//
// Bump KDEAL_FEATURES_VERSION whenever a name, a meaning or an encoding rule changes: heads
// declare the features they split on, validation binds those names to these universes, and a
// stale head's names falling out of the universe neutralizes the kdeal section rather than
// walking a lie.

/** The K-deal feature-universe version. The trainer stamps it into every kdeal entry it trains. */
export const KDEAL_FEATURES_VERSION = 1;

/** The deal's two strata — the section keys, the scorer keys, one vocabulary end to end. */
export const KDEAL_STRATA = Object.freeze(['creature', 'construct']);

/** Categorical creature features (top level of the vector): what the creature is bound to. */
export const CREATURE_CATEGORICALS = Object.freeze(['body', 'look', 'voice', 'material']);
/** Numeric creature features (the vector's `num` block, by bare key): the skeleton's shape,
 * the drives it was dealt, and the cultivation read it survived. */
export const CREATURE_NUMERICS = Object.freeze([
  'limbs',
  'joints',
  'attach',
  'genes',
  'warnings',
  'cost',
  'costRatio',
  'spanX',
  'spanY',
  'approval',
  'crowding',
  'strain',
  'boredom',
]);

/** Categorical construct features: the Canon style the recipe builds in. */
export const CONSTRUCT_CATEGORICALS = Object.freeze(['style']);
/** Numeric construct features: the assembled record's composition — part counts, vocabulary,
 * attach hierarchy, rotation and scale spread, and how far the parts reach. */
export const CONSTRUCT_NUMERICS = Object.freeze([
  'parts',
  'vocab',
  'points',
  'ownMax',
  'ownKinds',
  'rotKinds',
  'scaleMean',
  'scaleMin',
  'scaleMax',
  'spanX',
  'spanY',
  'spread',
  'repeatShare',
]);

/** The feature names a creature head may declare, in binding order: the categoricals, then
 * `num.<key>` for each numeric. The trainer binds its columns to exactly this universe;
 * anything outside it is a head the app cannot score honestly. */
export function creatureFeatureNames() {
  return [...CREATURE_CATEGORICALS, ...CREATURE_NUMERICS.map((k) => `num.${k}`)];
}

/** The feature names a construct head may declare, in binding order (see creatureFeatureNames). */
export function constructFeatureNames() {
  return [...CONSTRUCT_CATEGORICALS, ...CONSTRUCT_NUMERICS.map((k) => `num.${k}`)];
}

/** The declared universe for one stratum ('creature' | 'construct'); null for any other name. */
export function kDealFeatureNames(stratum) {
  if (stratum === 'creature') return creatureFeatureNames();
  if (stratum === 'construct') return constructFeatureNames();
  return null;
}

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const list = (x) => (Array.isArray(x) ? x : []);
const isPt = (p) => p && typeof p === 'object' && finite(p.x) && finite(p.y);

/** One genome gene's value by family + id (the genome is the record's source of truth). */
function geneValue(record, family, id) {
  for (const g of list(record && record.genome)) {
    if (g && g.family === family && g.id === id) return g.value;
  }
  return undefined;
}

/** The width/height of the point set's bounding box (0s for an empty set). */
function spanOf(pts) {
  if (!pts.length) return { spanX: 0, spanY: 0 };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { spanX: maxX - minX, spanY: maxY - minY };
}

/**
 * One dealt creature record → its feature vector, in the walker's shape
 * ({ ...categoricals, num: {...} }). Reads the assembled record only — body, Look and Voice
 * bindings, the MATERIAL gene (the body's Canon style, dealt as a gene), the skeleton's part
 * counts and reach, the DRIVE genes, and the cultivation read (cost against its threshold,
 * warning count). Every field is optional; what is absent stays absent (the encoding law).
 */
export function creatureFeatures(record) {
  const rec = record && typeof record === 'object' ? record : {};
  const out = { num: {} };
  if (typeof rec.body === 'string' && rec.body) out.body = rec.body;
  if (typeof rec.look === 'string' && rec.look) out.look = rec.look;
  if (typeof rec.voice === 'string' && rec.voice) out.voice = rec.voice;
  const material = geneValue(rec, 'MATERIAL', 'material');
  if (typeof material === 'string' && material) out.material = material;
  const limbs = list(rec.limbs).filter(isPt);
  const joints = list(rec.joints).filter(isPt);
  const head = isPt(rec.head) ? rec.head : null;
  out.num.limbs = limbs.length;
  out.num.joints = joints.length;
  out.num.attach = limbs.length + joints.length + (head ? 1 : 0);
  out.num.genes = list(rec.genome).length;
  const pts = [...(head ? [head] : []), ...limbs, ...joints];
  const { spanX, spanY } = spanOf(pts);
  out.num.spanX = spanX;
  out.num.spanY = spanY;
  for (const d of ['approval', 'crowding', 'strain', 'boredom']) {
    const v = geneValue(rec, 'DRIVE', d);
    if (finite(v)) out.num[d] = v;
    else if (rec.drives && finite(rec.drives[d])) out.num[d] = rec.drives[d];
  }
  const cult = rec.cultivated && typeof rec.cultivated === 'object' ? rec.cultivated : null;
  out.num.warnings = cult ? list(cult.warnings).length : 0;
  if (cult && cult.cost && finite(cult.cost.score)) {
    out.num.cost = cult.cost.score;
    if (finite(cult.cost.threshold) && cult.cost.threshold > 0)
      out.num.costRatio = cult.cost.score / cult.cost.threshold;
  }
  return out;
}

/**
 * One assembled construct record → its feature vector. Reads the record the assembler built:
 * the style, the parts (how many, how many distinct shapes they draw from, the attach points
 * they hang from — `own` is the hierarchy: which of the construct's points a part owns), the
 * rotations and scales in play, and the composition's reach (bounding span, mean distance of
 * the parts from their own centroid). Every field is optional; absence stays absence.
 */
export function constructFeatures(record) {
  const rec = record && typeof record === 'object' ? record : {};
  const out = { num: {} };
  if (typeof rec.style === 'string' && rec.style) out.style = rec.style;
  const parts = list(rec.parts).filter((p) => p && typeof p === 'object');
  out.num.parts = parts.length;
  const assets = new Set(parts.map((p) => p.asset).filter((a) => typeof a === 'string'));
  out.num.vocab = assets.size;
  out.num.points = list(rec.points).filter(isPt).length;
  out.num.repeatShare = parts.length ? (parts.length - assets.size) / parts.length : 0;
  const owns = parts.map((p) => p.own).filter((v) => Number.isInteger(v));
  if (owns.length) {
    out.num.ownMax = Math.max(...owns);
    out.num.ownKinds = new Set(owns).size;
  }
  const rots = parts.map((p) => p.r).filter(finite);
  if (rots.length) out.num.rotKinds = new Set(rots).size;
  const scales = parts.map((p) => p.s).filter(finite);
  if (scales.length) {
    out.num.scaleMean = scales.reduce((a, b) => a + b, 0) / scales.length;
    out.num.scaleMin = Math.min(...scales);
    out.num.scaleMax = Math.max(...scales);
  }
  const pts = parts.filter(isPt);
  const { spanX, spanY } = spanOf(pts);
  out.num.spanX = spanX;
  out.num.spanY = spanY;
  if (pts.length) {
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    out.num.spread = pts.reduce((a, p) => a + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length;
  }
  return out;
}

/** The extractor for one stratum; null for any other name. */
export function kDealFeatures(stratum, record) {
  if (stratum === 'creature') return creatureFeatures(record);
  if (stratum === 'construct') return constructFeatures(record);
  return null;
}
