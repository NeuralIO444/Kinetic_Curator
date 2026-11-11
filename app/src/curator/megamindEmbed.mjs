// megamindEmbed.mjs — #1528 MegaMind follow-on: the embeddings slot's pure core.
//
// S1 (#1525) proved the link, S2 (#1526) the personas, S3 (#1527) the eyes. This slot is a SECOND
// model in the same Settings machinery: a local embedding model served by the same Ollama, adding a
// meaning-distance axis beside the explorer's feature-distance — semantic search over keeps and the
// asset library, and a semantic novelty component for the miner (E2). Everything here follows the
// standing laws:
//
// - Local is not cloud: the one Ollama origin, no new network surface (the CSP does not change), and
//   a cloud-pointer model is refused as a slot — its vectors would be computed on Ollama's cloud.
// - Probe, never assume: the slot's record is MEASURED by a real /api/embed call (a timed text probe,
//   then an image probe for the stills clause), never by the model's name or its show data. A model
//   whose show data declares `embedding` but that answers with no usable vector is not a slot; a
//   model that declares nothing but measures a clean vector is. The House model (qwen3-vl:8b-instruct)
//   is a vision-language instruct model — nothing here claims it can embed; on a machine with only
//   the House model installed the slot simply stays unprobed and everything degrades silently.
// - Capability honesty: the record is a fail-closed validated shape (the capabilityRegistry law), and
//   the `search.semantic` consumer gate is graded by the registry's own consumerEnabled over the
//   record's capability projection — the badge is earned by the probe, never by S1 detection.
// - Cache integrity: a cached vector is keyed by model identity + the SHA-256 of its source text
//   (and the still's own SHA-256 for stills), so a model swap or an edited caption can never serve
//   a stale vector. The cache is data, validated on read like the ledgers: a corrupt or
//   dimension-lying entry is skipped with a warning, never silently trusted.
// - Heads law (the issue's 2026-10-15 hook): embeddings may reach the XGBoost heads ONLY as a future
//   declared features-version bump + Studio retrain. Nothing here touches FEATURES_VERSION,
//   taste.json, any head, or any training path. Miner novelty and head features are separate
//   consumers of this slot — neither gates the other.
//
// Everything network-shaped takes an injected fetch, like megamindLink, so the selfcheck drives it
// against fixtures that mirror real Ollama replies.
import { fetchShow, isCloudModel } from './megamindLink.mjs';
import { consumerById, consumerEnabled } from '../composition/capabilityRegistry.mjs';

// ── keys, bounds, and the named constants ────────────────────────────────────────────────────────

/** The vector cache's storage key (bundle.js carries its BUNDLE_LEFT_OUT decision: per-machine,
 * recomputable, and a vector from another machine's model would be silently wrong elsewhere). */
export const EMBED_CACHE_KEY = 'kc:megamind:embeddings:v1';
/** The slot choice's storage key (this machine's Ollama inventory — the link key's same reasoning). */
export const EMBED_SLOT_KEY = 'kc:megamind:embed-slot:v1';
export const EMBED_CACHE_FILE = 'embeddings.json';

/** Soft cap on cached vectors; the oldest (by stamp) evict first. A cache is a cache, not a ledger. */
export const EMBED_CACHE_MAX = 512;
/** One /api/embed call carries at most this many inputs (the corpus indexing press batches by it). */
export const EMBED_BATCH = 32;
/** Embed calls are bounded like surface asks: a hung model can never wedge a press. */
export const EMBED_TIMEOUT_MS = 60000;

/**
 * The miner blend (the axis's one weight, named): a candidate's novelty is its feature novelty
 * (primary, deterministic, unchanged) PLUS this weight × its semantic novelty, when — and only
 * when — both sides of the comparison carry vectors from the same slot model. At 0.5 the semantic
 * component can add at most half the feature axis's full range: meaning can break a feature tie
 * and widen a spread, it can never outvote the feature space.
 */
export const SEMANTIC_NOVELTY_WEIGHT = 0.5;

/** The probe text: fixed, meaningful, and KC-1's own vocabulary, so the probe measures a real embed. */
export const EMBED_PROBE_TEXT = 'spiky radial marks around a ring, dense and aggressive';

/** A 1×1 transparent PNG — the image probe's still. The probe measures whether THIS model's embed
 * path accepts an image at all and answers in the same dimensions; it judges nothing. */
export const EMBED_PROBE_IMAGE_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// ── vectors ──────────────────────────────────────────────────────────────────────────────────────

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A usable vector: a non-empty array of finite numbers. Anything else is not a vector. */
export function isVector(v) {
  return Array.isArray(v) && v.length > 0 && v.every((x) => Number.isFinite(x));
}

export function cosineSimilarity(a, b) {
  if (!isVector(a) || !isVector(b) || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Semantic distance, 0..1 beside featureDistance's 0..1: (1 − cosine) / 2, so identical meaning is
 * 0 and opposite meaning is 1. Null when the two vectors cannot be compared (absent, malformed, or
 * different dimensions — vectors from different models are never compared, and a dimension change
 * is a model change).
 */
export function semanticDistance(a, b) {
  const cos = cosineSimilarity(a, b);
  if (cos === null) return null;
  return Math.min(1, Math.max(0, (1 - cos) / 2));
}

/**
 * The blend the miner selects by when the semantic axis is live: feature novelty (the primary,
 * deterministic axis) plus the named weight × semantic novelty. A null semantic novelty — either
 * side carries no vector — returns the feature novelty untouched, which is what makes an
 * embeddings-absent run identical to today's run by construction.
 */
export function blendNovelty(featureNovelty, semanticNoveltyValue) {
  if (!Number.isFinite(featureNovelty)) return featureNovelty;
  if (!Number.isFinite(semanticNoveltyValue)) return featureNovelty;
  return featureNovelty + SEMANTIC_NOVELTY_WEIGHT * semanticNoveltyValue;
}

/**
 * Nearest neighbours of a query vector among entries [{ id, vector }]: ascending semantic distance,
 * ties to the lower entry order (deterministic). Entries without a comparable vector are absent
 * from the result — never ranked by a guess.
 */
export function nearestNeighbours(queryVector, entries, { limit = 8 } = {}) {
  if (!isVector(queryVector) || !Array.isArray(entries)) return [];
  const scored = [];
  entries.forEach((e, i) => {
    if (!e || !isVector(e.vector)) return;
    const d = semanticDistance(queryVector, e.vector);
    if (d === null) return;
    scored.push({ id: e.id, distance: d, similarity: 1 - 2 * d, order: i });
  });
  scored.sort((x, y) => x.distance - y.distance || x.order - y.order);
  return scored.slice(0, Math.max(0, limit)).map(({ order, ...rest }) => rest);
}

// ── embed texts: what gets embedded ──────────────────────────────────────────────────────────────
// Deterministic compositions over data the record already carries — the same text always hashes to
// the same cache key, and an edited caption is a different text (hence a different key, never a
// stale hit). Captions come first when a record carries one (crown paperwork the artist edited);
// the metadata composition always rides, so a captionless keep still has a meaning surface.

const cleanText = (v, max = 240) => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : s ? s.slice(0, max) : null;
};

/** One library asset's embed text: its identity, family, and the metadata the library itself keeps. */
export function assetEmbedText(asset) {
  if (!isObj(asset) || typeof asset.id !== 'string' || !asset.id) return '';
  const parts = [`asset ${asset.id}`];
  if (typeof asset.category === 'string' && asset.category) parts.push(`category ${asset.category}`);
  if (Array.isArray(asset.tags) && asset.tags.length)
    parts.push(`tags ${asset.tags.filter((t) => typeof t === 'string' && t).join(' ')}`);
  if (typeof asset.weight === 'string' && asset.weight) parts.push(`weight ${asset.weight}`);
  if (typeof asset.density === 'string' && asset.density) parts.push(`density ${asset.density}`);
  return parts.join('. ');
}

/**
 * A keep-shaped record's embed text — the #1140 record (config.layout / config.palette.id /
 * config.assets) and the taste-ledger row (recipe.layoutParams / recipe.paletteId / recipe.assets)
 * read tolerantly, the featuresOfKeep idiom. Cast ids resolve to asset metadata through the
 * caller's lookup; a variant id is translated to its lead parent first when the caller hands a
 * translateId (the miner does — a variant stands at its lead's coordinates in feature space, and
 * its meaning text is its lead's too). '' when the record carries nothing embeddable.
 */
export function keepEmbedText(record, { assetById = null, translateId = null } = {}) {
  if (!isObj(record)) return '';
  const parts = [];
  const caption = cleanText(record.caption) ?? cleanText(record.note);
  if (caption) parts.push(caption);
  const layout = isObj(record.config?.layout)
    ? record.config.layout
    : isObj(record.recipe?.layoutParams)
      ? record.recipe.layoutParams
      : null;
  if (layout && typeof layout.mode === 'string' && layout.mode) parts.push(`layout ${layout.mode}`);
  const paletteId =
    typeof record.config?.palette?.id === 'string'
      ? record.config.palette.id
      : typeof record.recipe?.paletteId === 'string'
        ? record.recipe.paletteId
        : null;
  if (paletteId) parts.push(`palette ${paletteId}`);
  const cast = Array.isArray(record.config?.assets)
    ? record.config.assets
    : Array.isArray(record.recipe?.assets)
      ? record.recipe.assets
      : [];
  const ids = [...new Set(cast.filter((x) => typeof x === 'string' && x))].sort();
  if (ids.length) {
    const texts = ids.map((rawId) => {
      const id = translateId ? translateId(rawId) : rawId;
      const asset = assetById ? assetById.get(id) : null;
      return asset ? assetEmbedText(asset) : `asset ${id}`;
    });
    parts.push(`cast ${texts.join('; ')}`);
  }
  return parts.join('. ');
}

// ── the cache: keyed by model + source hash, validated on read ───────────────────────────────────

/**
 * A cache key: the model identity plus the source's hash — the SHA-256 of the exact embed text for
 * text sources, the still's own SHA-256 for stills. A model swap changes the prefix; an edited
 * caption changes the hash; neither can ever serve the other one's vector.
 */
export function embedCacheKey({ model, textHash = null, stillSha256 = null } = {}) {
  if (typeof model !== 'string' || !model) return null;
  if (typeof stillSha256 === 'string' && /^[0-9a-f]{64}$/.test(stillSha256)) return `${model}::img:${stillSha256}`;
  if (typeof textHash === 'string' && /^[0-9a-f]{64}$/.test(textHash)) return `${model}::txt:${textHash}`;
  return null;
}

/** One cache entry as a clean one, or null: the vector must be real and as long as it claims. */
export function checkCacheEntry(raw) {
  if (!isObj(raw) || !isVector(raw.vector)) return null;
  if (!Number.isInteger(raw.dims) || raw.dims !== raw.vector.length) return null;
  return {
    vector: [...raw.vector],
    dims: raw.dims,
    text: typeof raw.text === 'string' ? raw.text : null,
    at: Number.isFinite(raw.at) ? raw.at : 0,
  };
}

/** The cache as a plain validated object { key: entry } from parsed JSON — corrupt entries dropped. */
export function sanitizeEmbedCache(raw, warn = () => {}) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const e = checkCacheEntry(v);
    if (e) out[k] = e;
    else warn(`[embed-cache] entry ${k}: not a usable vector — dropped`);
  }
  return out;
}

/** Parse cache text (the storage value): bad JSON is an empty cache, said out loud via warn. */
export function parseEmbedCache(text, warn = (m) => console.warn(m)) {
  if (!text) return {};
  try {
    return sanitizeEmbedCache(JSON.parse(text), warn);
  } catch {
    warn('[embed-cache] stored cache is not JSON — starting empty');
    return {};
  }
}

/** Put an entry, evicting the oldest beyond the soft cap. Returns the cache (mutated) for chaining. */
export function cachePut(cache, key, entry) {
  if (!cache || !key) return cache;
  const e = checkCacheEntry(entry);
  if (!e) return cache;
  cache[key] = e;
  const keys = Object.keys(cache);
  if (keys.length > EMBED_CACHE_MAX) {
    keys
      .sort((a, b) => (cache[a].at || 0) - (cache[b].at || 0))
      .slice(0, keys.length - EMBED_CACHE_MAX)
      .forEach((k) => delete cache[k]);
  }
  return cache;
}

// ── the slot record: measured, fail-closed, the capability law ───────────────────────────────────

/**
 * A slot record as a clean frozen copy, or null. What detection MEASURED:
 * { endpoint, model, dims, textProbeMs, probeClean, imageEmbed, context, at }.
 * dims is the text probe's own dimension; imageEmbed is the image probe's own verdict (an image
 * answered in the same dimensions) — never a name's promise, never the show data's claim.
 */
export function checkEmbedRecord(raw) {
  if (!isObj(raw)) return null;
  const endpoint = typeof raw.endpoint === 'string' && raw.endpoint ? raw.endpoint : null;
  const model = typeof raw.model === 'string' && raw.model ? raw.model : null;
  if (!endpoint || !model) return null;
  if (!Number.isInteger(raw.dims) || raw.dims <= 0) return null;
  if (!(raw.textProbeMs === null || (Number.isFinite(raw.textProbeMs) && raw.textProbeMs >= 0))) return null;
  if (typeof raw.probeClean !== 'boolean' || typeof raw.imageEmbed !== 'boolean') return null;
  if (!(raw.context === null || (Number.isInteger(raw.context) && raw.context > 0))) return null;
  if (!Number.isFinite(raw.at)) return null;
  return Object.freeze({
    endpoint,
    model,
    dims: raw.dims,
    textProbeMs: raw.textProbeMs,
    probeClean: raw.probeClean,
    imageEmbed: raw.imageEmbed,
    context: raw.context,
    at: raw.at,
  });
}

/**
 * The record's capability projection — the registry's own shape, so the registry's own law grades
 * it: tier C (the slot makes no cadence claim; search is an offline-cadence consumer), the
 * `embeddings` badge the probe earned, the probe's own numbers as the measurement backing.
 */
export function embedCapabilityShape(record) {
  const rec = checkEmbedRecord(record);
  if (!rec) return null;
  return {
    endpoint: rec.endpoint,
    model: rec.model,
    tier: 'C',
    badges: ['embeddings'],
    context: rec.context,
    thinking: 'unreported',
    probeMs: rec.textProbeMs,
    probeClean: rec.probeClean,
    at: rec.at,
  };
}

/** Is semantic search enabled by this slot record? Graded by consumerEnabled, never by a name. */
export function semanticEnabled(record) {
  const shape = embedCapabilityShape(record);
  if (!shape || !shape.probeClean) return false;
  return consumerEnabled(shape, consumerById('search.semantic'));
}

// ── /api/embed: bodies, replies, the probe ───────────────────────────────────────────────────────

/** One /api/embed body. keep_alive rides the House pin, like every MegaMind call. */
export function buildEmbedBody(model, { input = null, images = null } = {}) {
  return {
    model,
    ...(input !== null ? { input } : {}),
    ...(Array.isArray(images) && images.length ? { images } : {}),
    keep_alive: '30m',
  };
}

/**
 * An /api/embed reply as { vectors, dims }, or null: embeddings must be an array of usable vectors,
 * one per input, all the same dimension. Anything else — an error shape, a ragged reply, a
 * dimension that changes mid-batch — is not an embedding answer.
 */
export function parseEmbedReply(data, expectedCount = null) {
  if (!isObj(data) || !Array.isArray(data.embeddings) || !data.embeddings.length) return null;
  if (expectedCount !== null && data.embeddings.length !== expectedCount) return null;
  let dims = null;
  for (const v of data.embeddings) {
    if (!isVector(v)) return null;
    if (dims === null) dims = v.length;
    else if (v.length !== dims) return null;
  }
  return { vectors: data.embeddings.map((v) => [...v]), dims };
}

const isAbort = (e) => !!e && (e.name === 'AbortError' || e.code === 20);

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  let ctl = null;
  let timer = null;
  try {
    if (typeof AbortController !== 'undefined') {
      ctl = new AbortController();
      timer = setTimeout(() => ctl.abort(), timeoutMs);
    }
    return await fetchImpl(url, { ...init, ...(ctl ? { signal: ctl.signal } : {}) });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * One embed call against the visitor's Ollama. Resolves { ok, vectors, dims } or
 * { ok: false, gate } — gates in the link's vocabulary: 'unreachable' (nothing answered),
 * 'http' (an error that isn't about embedding), 'not-embedding' (the model answered but not as
 * an embedding model: an HTTP 400/404 on this endpoint, or a 200 with no usable vector).
 */
export async function fetchEmbed(fetchImpl, endpoint, body, { timeoutMs = EMBED_TIMEOUT_MS } = {}) {
  let res;
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      `${endpoint}/api/embed`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      timeoutMs,
    );
  } catch (e) {
    return { ok: false, gate: 'unreachable', timedOut: isAbort(e) };
  }
  if (!res || typeof res.status !== 'number') return { ok: false, gate: 'bad-reply' };
  if (!res.ok) {
    return res.status === 400 || res.status === 404
      ? { ok: false, gate: 'not-embedding', status: res.status }
      : { ok: false, gate: 'http', status: res.status };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    return { ok: false, gate: 'bad-reply', status: res.status };
  }
  const expected = Array.isArray(body.input) ? body.input.length : 1;
  const parsed = parseEmbedReply(data, expected);
  return parsed ? { ok: true, ...parsed } : { ok: false, gate: 'not-embedding', status: res.status };
}

/**
 * The slot probe — the connect-time measurement, run only on a deliberate press:
 *   1. the model's show data (the link's own fetchShow — a gone model fails with its gate);
 *   2. one timed text embed of the probe text — the vector's dimension IS the measurement;
 *   3. one image embed of the 1×1 probe still — imageEmbed is true only when it answers in the
 *      text probe's own dimensions (the stills clause: image embedding is claimed only where the
 *      linked path measured it, never from a text model).
 * A cloud pointer is refused before any call: the slot is local-only, like everything in MegaMind.
 * Resolves { ok, record } or { ok: false, gate, status? }.
 */
export async function probeEmbedModel(fetchImpl, endpoint, model, { now, stamp, timeoutMs = EMBED_TIMEOUT_MS } = {}) {
  if (isCloudModel(model)) return { ok: false, gate: 'cloud' };
  const nowFn = typeof now === 'function' ? now : () => 0;
  const shown = await fetchShow(fetchImpl, endpoint, model);
  if (!shown.ok) return { ok: false, gate: shown.gate, status: shown.status };
  const t0 = nowFn();
  const text = await fetchEmbed(fetchImpl, endpoint, buildEmbedBody(model, { input: EMBED_PROBE_TEXT }), { timeoutMs });
  const textProbeMs = Math.round(nowFn() - t0);
  if (!text.ok) return { ok: false, gate: text.gate, status: text.status };
  const dims = text.dims;
  let imageEmbed = false;
  const img = await fetchEmbed(
    fetchImpl,
    endpoint,
    buildEmbedBody(model, { input: '', images: [EMBED_PROBE_IMAGE_B64] }),
    { timeoutMs },
  );
  if (img.ok && img.dims === dims) imageEmbed = true;
  const record = checkEmbedRecord({
    endpoint,
    model,
    dims,
    textProbeMs,
    probeClean: true,
    imageEmbed,
    context: shown.show.context,
    at: typeof stamp === 'function' ? stamp() : 0,
  });
  return record ? { ok: true, record } : { ok: false, gate: 'bad-reply' };
}

// ── honest error copy: every gate names itself ───────────────────────────────────────────────────

export function embedErrorCopy(gate, ctx = {}) {
  const { model = null, status = null } = ctx;
  switch (gate) {
    case 'cloud':
      return {
        title: 'That model is a cloud pointer — the embeddings slot is local-only.',
        lines: [
          'Its vectors would be computed on Ollama\u2019s cloud, not on this machine, so the slot refuses it whole — like every MegaMind surface. Pick a model that runs here.',
        ],
      };
    case 'not-embedding':
      return {
        title: model
          ? `${model} did not answer as an embedding model.`
          : 'That model did not answer as an embedding model.',
        lines: [
          'The probe sent one real embed request and got no usable vector back. Some models only chat; an embedding model (for example one whose name carries \u201Cembed\u201D) is what this slot measures. Nothing was stored and no surface changed.',
        ],
      };
    case 'model-gone':
      return {
        title: model
          ? `${model} isn\u2019t in Ollama\u2019s list any more.`
          : 'That model isn\u2019t in Ollama\u2019s list any more.',
        lines: [
          'It may have been renamed, retired or removed. KC-1 never guesses a name — pick from the list Ollama reports now.',
        ],
      };
    case 'unreachable':
      return {
        title: 'Nothing answered at the endpoint.',
        lines: [
          'Ollama may not be running — start it, then press Probe again. The slot changes nothing while it cannot measure.',
        ],
      };
    case 'http':
      return {
        title: `Ollama answered with an error${status ? ` (HTTP ${status})` : ''}.`,
        lines: ['The address answered but the embed request failed. Nothing was stored and no surface changed.'],
      };
    case 'bad-reply':
      return {
        title: 'That endpoint answered in a shape KC-1 can\u2019t read.',
        lines: ['It answered, but not with Ollama\u2019s embedding data. Nothing was stored and no surface changed.'],
      };
    default:
      return {
        title: 'The slot probe failed.',
        lines: ['Nothing was measured and nothing was stored. The miner and search stay exactly as they were.'],
      };
  }
}
