// megamindEmbedLive.js — #1528 MegaMind follow-on: the embeddings slot, wired live.
//
// The driver in the megamindLive idiom: it owns what the pure core (megamindEmbed.mjs) may not
// touch — fetch, localStorage (the slot choice + the vector cache), hashing, and the wall clock —
// and publishes a view the MEGAMIND tab renders. NOTHING is probed on page load or driver creation:
// measuring a slot is a user act (the link's law), and every embed call in here answers a deliberate
// press (probe, search, index, export). The driver subscribes to no bus event and fires nothing by
// itself. While no slot is measured, every method degrades silently — empty results, no surface
// changes — and the miner never sees a vector it was not handed.
//
// The cache is this machine's: vectors computed by THIS machine's local model over keep captions /
// asset metadata, keyed by model + source hash (megamindEmbed.mjs), persisted under its own key
// with its own bundle decision (bundle.js: left out — recomputable, and meaningless elsewhere).
import { DEFAULT_ENDPOINT, errorCopy, fetchTags, normalizeEndpoint } from './megamindLink.mjs';
import {
  EMBED_BATCH,
  EMBED_CACHE_FILE,
  EMBED_CACHE_KEY,
  EMBED_SLOT_KEY,
  assetEmbedText,
  buildEmbedBody,
  cachePut,
  checkEmbedRecord,
  embedCacheKey,
  embedErrorCopy,
  fetchEmbed,
  keepEmbedText,
  nearestNeighbours,
  parseEmbedCache,
  probeEmbedModel,
  semanticEnabled,
} from './megamindEmbed.mjs';

/** The shelf keeps' storage key — the collection semantic search reads (state/slices/davisSlice). */
export const SHELF_KEEPS_KEY = 'kc:keeps:v1';

// ── hashing (the vision driver's idiom: SHA-256 of the exact bytes/text, hex) ────────────────────

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const sha256HexText = async (text) => sha256Hex(new TextEncoder().encode(String(text ?? '')));

function bytesToBase64(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

// ── corpus reads (tolerant; absent stays absent) ─────────────────────────────────────────────────

/** The performer's shelf keeps from storage: an array of keep records, or [] when unreadable. */
export function readShelfKeeps(storage) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SHELF_KEEPS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r === 'object') : [];
  } catch {
    return [];
  }
}

const readSlot = (storage) => {
  try {
    const raw = storage ? storage.getItem(EMBED_SLOT_KEY) : null;
    const s = raw ? JSON.parse(raw) : null;
    if (s && typeof s.endpoint === 'string' && typeof s.model === 'string')
      return { endpoint: s.endpoint, model: s.model };
  } catch {
    /* unreadable storage is no storage */
  }
  return null;
};

// ── the driver ───────────────────────────────────────────────────────────────────────────────────

/**
 * @param fetchImpl  fetch (the real one by default; injected by the selfcheck)
 * @param storage    { getItem, setItem, removeItem } (localStorage by default)
 * @param now        () => ms, the probe timer (performance.now by default)
 * @param stamp      () => epoch ms for records + cache entries (Date.now by default)
 * @param hashText   async (text) => sha256 hex (crypto.subtle by default; injected by the selfcheck)
 * @param hashBytes  async (bytes) => sha256 hex
 */
export function createEmbedDriver({
  fetchImpl = (...a) => globalThis.fetch(...a),
  storage = typeof globalThis !== 'undefined' ? globalThis.localStorage : null,
  now = () => performance.now(),
  stamp = () => Date.now(),
  hashText = sha256HexText,
  hashBytes = sha256Hex,
} = {}) {
  let cache = parseEmbedCache(storage ? safeGet(storage, EMBED_CACHE_KEY) : null, () => {});
  const saved0 = readSlot(storage);
  let view = {
    phase: 'idle', // idle | listing | probing | ready | error
    endpoint: saved0 ? saved0.endpoint : DEFAULT_ENDPOINT,
    models: [],
    model: null,
    record: null,
    error: null,
    saved: saved0,
    cacheCount: Object.keys(cache).length,
    busy: null, // 'index' | 'search' while a press is working
    search: null, // { query, keeps: [...], assets: [...] } — ranked results of the last press
    message: null,
  };
  let generation = 0; // a stale async completion must never overwrite a newer user act
  const listeners = new Set();
  const publish = () => {
    for (const fn of listeners) {
      try {
        fn(view);
      } catch {
        /* a listener must not break the slot */
      }
    }
  };
  const set = (patch) => {
    view = { ...view, ...patch };
    publish();
  };
  const fail = (copy) => {
    set({ phase: view.record ? 'ready' : 'error', error: copy });
    return false;
  };
  const persistCache = () => {
    try {
      if (storage) storage.setItem(EMBED_CACHE_KEY, JSON.stringify(cache));
    } catch {
      /* a full/blocked store leaves the session cache in memory — search still works */
    }
    set({ cacheCount: Object.keys(cache).length });
  };
  const saveSlot = (endpoint, model) => {
    try {
      if (storage) storage.setItem(EMBED_SLOT_KEY, JSON.stringify({ endpoint, model }));
    } catch {
      /* private mode: this session only */
    }
    set({ saved: { endpoint, model } });
  };

  /** The probe for one chosen model: show + timed text embed + image embed (megamindEmbed core). */
  async function probe(endpoint, model, gen) {
    set({ phase: 'probing', model, error: null, message: null });
    const out = await probeEmbedModel(fetchImpl, endpoint, model, { now, stamp });
    if (gen !== generation) return false;
    if (!out.ok) return fail(embedErrorCopy(out.gate, { model, status: out.status }));
    const record = checkEmbedRecord(out.record);
    if (!record) return fail(embedErrorCopy('bad-reply', { model }));
    saveSlot(endpoint, model);
    set({ phase: 'ready', record, error: null });
    return true;
  }

  /**
   * Embed texts through the cache: returns an array aligned with `texts` of vectors or nulls.
   * Cache hits never touch the network; misses batch by EMBED_BATCH; a failed batch leaves its
   * texts null (absent, never guessed) and says so in the view — a dev surface is honest.
   */
  async function embedTexts(texts) {
    const rec = view.record;
    if (!rec) return texts.map(() => null);
    const out = new Array(texts.length).fill(null);
    const misses = [];
    for (let i = 0; i < texts.length; i++) {
      const text = typeof texts[i] === 'string' ? texts[i] : '';
      if (!text) continue;
      const key = embedCacheKey({ model: rec.model, textHash: await hashText(text) });
      const hit = key ? cache[key] : null;
      if (hit && hit.dims === rec.dims) out[i] = hit.vector;
      else misses.push({ i, text, key });
    }
    let failed = 0;
    for (let b = 0; b < misses.length; b += EMBED_BATCH) {
      const batch = misses.slice(b, b + EMBED_BATCH);
      const res = await fetchEmbed(
        fetchImpl,
        rec.endpoint,
        buildEmbedBody(rec.model, { input: batch.map((m) => m.text) }),
        {},
      );
      if (!res.ok || res.dims !== rec.dims) {
        failed += batch.length;
        continue;
      }
      batch.forEach((m, j) => {
        out[m.i] = res.vectors[j];
        if (m.key) cachePut(cache, m.key, { vector: res.vectors[j], dims: res.dims, text: m.text, at: stamp() });
      });
    }
    if (misses.length) persistCache();
    if (failed)
      set({
        message: `${failed} text(s) got no vector — the model did not answer for them; they are absent from results, never guessed.`,
      });
    return out;
  }

  const driver = {
    view: () => view,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** List the endpoint's models (names verbatim), then probe the saved/first one — one press. */
    async connect(endpointRaw) {
      const gen = ++generation;
      const endpoint = normalizeEndpoint(endpointRaw ?? view.endpoint);
      if (!endpoint) return fail(errorCopy('bad-endpoint', { endpoint: String(endpointRaw ?? '') }));
      set({ endpoint, phase: 'listing', error: null, models: [], message: null });
      const tags = await fetchTags(fetchImpl, endpoint);
      if (gen !== generation) return false;
      if (!tags.ok) return fail(errorCopy(tags.gate, { endpoint, status: tags.status }));
      if (!tags.models.length) return fail(errorCopy('no-models', { endpoint }));
      set({ models: tags.models });
      const saved = view.saved;
      let model;
      if (saved && saved.endpoint === endpoint && saved.model) {
        if (!tags.models.some((m) => m.name === saved.model)) {
          return fail(embedErrorCopy('model-gone', { model: saved.model }));
        }
        model = saved.model;
      } else {
        model = tags.models[0].name;
      }
      return probe(endpoint, model, gen);
    },
    /** Detection re-runs on every model change — the new model's own probe, then the slot moves. */
    async changeModel(model) {
      if (!view.models.some((m) => m.name === model)) return fail(embedErrorCopy('model-gone', { model }));
      const gen = ++generation;
      return probe(view.endpoint, model, gen);
    },
    /** Re-probe the slotted model (the measurement is a user act; this is its button). */
    async reprobe() {
      if (!view.model) return false;
      const gen = ++generation;
      return probe(view.endpoint, view.model, gen);
    },
    /** Clear the slot choice + record. The cache stays — it is keyed by model and harms nothing. */
    disconnect() {
      generation++;
      try {
        if (storage) storage.removeItem(EMBED_SLOT_KEY);
      } catch {
        /* nothing stored, nothing to clear */
      }
      set({ phase: 'idle', model: null, record: null, error: null, saved: null, search: null, message: null });
    },
    /** Is semantic search live right now? (The registry's law over the slot's measured record.) */
    semanticOn: () => semanticEnabled(view.record),

    /**
     * Embed a still through the slot — ONLY when the probe measured image support for this model
     * (the stills clause). Returns the vector, or null: no slot, no measured image path, or no
     * answer. The cache key binds the still's own SHA-256, computed over the exact bytes.
     */
    async embedStill(bytes) {
      const rec = view.record;
      if (!rec || !rec.imageEmbed) return null;
      const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
      if (!arr.length) return null;
      const sha = await hashBytes(arr);
      const key = embedCacheKey({ model: rec.model, stillSha256: sha });
      const hit = key ? cache[key] : null;
      if (hit && hit.dims === rec.dims) return hit.vector;
      const res = await fetchEmbed(
        fetchImpl,
        rec.endpoint,
        buildEmbedBody(rec.model, { input: '', images: [bytesToBase64(arr)] }),
        {},
      );
      if (!res.ok || res.dims !== rec.dims) return null;
      if (key) {
        cachePut(cache, key, { vector: res.vectors[0], dims: res.dims, text: null, at: stamp() });
        persistCache();
      }
      return res.vectors[0];
    },

    /**
     * Semantic search by text over keeps + the asset library: the query and every uncached corpus
     * text are embedded by the slot (one deliberate press), then ranked by the core. Keeps are the
     * shelf records handed in; assets are library records. Results carry the record/asset beside
     * the distance — the panel renders them, nothing is reordered anywhere else.
     */
    async searchText(query, { keeps = [], assets = [], limit = 8 } = {}) {
      const rec = view.record;
      if (!rec || !semanticEnabled(rec)) {
        set({ search: null, message: 'No embedding slot is measured — probe a model first; search stays off.' });
        return null;
      }
      const q = typeof query === 'string' ? query.trim() : '';
      if (!q) return null;
      set({ busy: 'search', message: null });
      try {
        const assetById = new Map(assets.map((a) => [a.id, a]));
        const keepTexts = keeps.map((k) => keepEmbedText(k, { assetById }));
        const assetTexts = assets.map((a) => assetEmbedText(a));
        const vectors = await embedTexts([q, ...keepTexts, ...assetTexts]);
        const queryVector = vectors[0];
        if (!queryVector) {
          set({ search: null, message: 'The model gave no vector for that search text — nothing ranked.' });
          return null;
        }
        const keepEntries = keeps
          .map((record, i) => ({ id: `keep:${i}`, record, vector: vectors[1 + i] }))
          .filter((e) => e.vector);
        const assetEntries = assets
          .map((asset, i) => ({ id: `asset:${asset.id}`, asset, vector: vectors[1 + keeps.length + i] }))
          .filter((e) => e.vector);
        const keepHits = nearestNeighbours(queryVector, keepEntries, { limit }).map((h) => ({
          ...h,
          record: keepEntries.find((e) => e.id === h.id).record,
        }));
        const assetHits = nearestNeighbours(queryVector, assetEntries, { limit }).map((h) => ({
          ...h,
          asset: assetEntries.find((e) => e.id === h.id).asset,
        }));
        const out = {
          query: q,
          keeps: keepHits,
          assets: assetHits,
          embedded: keepEntries.length + assetEntries.length,
        };
        set({ search: out });
        return out;
      } finally {
        set({ busy: null });
      }
    },

    /**
     * "More like this keep": the keep's own vector against the rest of the corpus (the keep itself
     * is excluded — its nearest neighbour is itself, which is not a result).
     */
    async moreLikeKeep(keep, keeps, { assets = [], limit = 8 } = {}) {
      const rec = view.record;
      if (!rec || !semanticEnabled(rec)) {
        set({ message: 'No embedding slot is measured — probe a model first; neighbours stay off.' });
        return null;
      }
      set({ busy: 'search', message: null });
      try {
        const assetById = new Map(assets.map((a) => [a.id, a]));
        const texts = [keepEmbedText(keep, { assetById }), ...keeps.map((k) => keepEmbedText(k, { assetById }))];
        const vectors = await embedTexts(texts);
        const self = vectors[0];
        if (!self) {
          set({ message: 'The model gave no vector for that keep — no neighbours ranked.' });
          return null;
        }
        const entries = keeps
          .map((record, i) => ({ id: `keep:${i}`, record, vector: vectors[1 + i] }))
          .filter((e) => e.vector && e.record !== keep);
        const hits = nearestNeighbours(self, entries, { limit }).map((h) => ({
          ...h,
          record: entries.find((e) => e.id === h.id).record,
        }));
        const out = { query: 'more like this keep', keeps: hits, assets: [], embedded: entries.length };
        set({ search: out });
        return out;
      } finally {
        set({ busy: null });
      }
    },

    /**
     * The run-tool export: this slot model's cached vectors by source-text hash, with the texts
     * beside them for audit — exactly what `scripts/exploreRun.mjs --embeddings` hands to runMiner.
     * Only the CURRENT slot model's entries travel; other models' cache stays home.
     */
    exportData() {
      const rec = view.record;
      if (!rec) return null;
      const vectorsByTextHash = {};
      const texts = {};
      for (const [key, entry] of Object.entries(cache)) {
        const m = new RegExp(`^${rec.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}::txt:([0-9a-f]{64})$`).exec(key);
        if (!m) continue;
        vectorsByTextHash[m[1]] = entry.vector;
        if (entry.text) texts[m[1]] = entry.text;
      }
      return { model: rec.model, dims: rec.dims, vectorsByTextHash, texts };
    },
    /** Download the export as embeddings.json (the vision driver's ledger-download idiom). */
    downloadExport() {
      const data = driver.exportData();
      if (!data) return false;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = EMBED_CACHE_FILE;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      return true;
    },
  };
  return driver;
}

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

// ── the app-wide singleton (created lazily by the panel; creation probes nothing) ────────────────
let driver = null;
let view = null;
const panelListeners = new Set();

export function ensureEmbedDriver() {
  if (!driver) {
    driver = createEmbedDriver();
    view = driver.view();
    driver.subscribe((v) => {
      view = v;
      for (const fn of panelListeners) {
        try {
          fn();
        } catch {
          /* a listener must not break the slot */
        }
      }
    });
  }
  return driver;
}

export function getEmbedView() {
  return view;
}
export function subscribeEmbed(fn) {
  panelListeners.add(fn);
  return () => panelListeners.delete(fn);
}
