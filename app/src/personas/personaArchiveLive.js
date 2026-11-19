// personas/personaArchiveLive.js — Persona Kernel P4 (#2384): the Archive, wired live.
//
// The driver in the megamindEmbedLive idiom: it owns what the pure core (personaArchive.mjs) may
// not touch — the bundled shelf texts (Vite inlines the .md files as raw strings), fetch, the
// embed slot's vector cache, hashing, and the idle scheduler — and hands Mind one method,
// snippetsFor(persona, context), that mindLive calls on the model path only.
//
// Standing laws, inherited from the embeddings slot and the spec:
// - The slot is MEASURED, never assumed: retrieval runs only while the embed driver's own view
//   carries a record that semanticEnabled grades clean. On a machine whose Ollama serves only the
//   House model (no embeddings), no record exists, snippetsFor returns [] forever, and every ask
//   is byte-identical to the pre-Archive instrument — silently, by construction.
// - Embedded at build/idle, never per frame: the shelf is indexed by scheduleArchiveIndexing
//   (requestIdleCallback after the mind boots) or lazily on the first ask that finds a measured
//   slot — never inside a frame, a bar, or a render. The one per-ask embed is the QUERY (a single
//   short text, cache-first by model + text hash, exactly like the slot's own search press).
// - Cache integrity: shelf vectors ride the slot's own cache (EMBED_CACHE_KEY), keyed by model +
//   the SHA-256 of the chunk's embed text — a model swap or an edited shelf can never serve a
//   stale vector.
// - A failure anywhere in here is []: the Archive must never break, delay-fatally, or colour an
//   ask. The rules fallback does not know this file exists.
import {
  EMBED_BATCH,
  EMBED_CACHE_KEY,
  buildEmbedBody,
  cachePut,
  embedCacheKey,
  fetchEmbed,
  parseEmbedCache,
  semanticEnabled,
} from '../curator/megamindEmbed.mjs';
import { ensureEmbedDriver, getEmbedView, sha256Hex } from '../curator/megamindEmbedLive.js';
import { ARCHIVE_FILES, archiveQueryText, buildArchiveCorpus, chunkEmbedText, retrieveSnippets } from './personaArchive.mjs';
import { personaIds } from './registry.mjs';

// The shelves, bundled: Vite resolves this glob at build time to the .md files' raw text. The
// typeof guard keeps the module importable where import.meta.glob does not exist (Node tooling);
// under Vite the call is transformed statically, exactly as written.
const RAW =
  typeof import.meta.glob === 'function'
    ? import.meta.glob('./archive/*/*.md', { query: '?raw', eager: true, import: 'default' })
    : {};

/** The bundled shelf files as [{ persona, file, text }], in registry order then dossier order. */
export function bundledArchiveFiles() {
  const byKey = new Map();
  for (const [path, text] of Object.entries(RAW)) {
    const m = /archive\/([a-z0-9-]+)\/([a-z0-9-]+)\.md$/.exec(path);
    if (m) byKey.set(`${m[1]}/${m[2]}`, { persona: m[1], file: m[2], text: String(text ?? '') });
  }
  const out = [];
  for (const id of personaIds()) for (const file of ARCHIVE_FILES) if (byKey.has(`${id}/${file}`)) out.push(byKey.get(`${id}/${file}`));
  return out;
}

const sha256HexText = async (text) => sha256Hex(new TextEncoder().encode(String(text ?? '')));

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The retriever. Injected seams mirror the embed driver's: fetchImpl (the visitor's Ollama),
 * getRecord (the embed slot's measured record — the live default reads the embed driver's view),
 * storage (the slot's vector cache), hashText (SHA-256 hex of a text).
 *
 * @returns { indexAtIdle, snippetsFor, state }
 */
export function createArchiveRetriever({
  fetchImpl = (...a) => globalThis.fetch(...a),
  getRecord = null,
  storage = typeof globalThis !== 'undefined' ? globalThis.localStorage : null,
  hashText = sha256HexText,
  files = null,
} = {}) {
  const corpus = buildArchiveCorpus(files ?? bundledArchiveFiles(), personaIds());
  const chunks = corpus.chunks.map((c) => ({ ...c }));
  let indexedModel = null;
  let indexing = null;

  const record = () => {
    try {
      if (typeof getRecord === 'function') return getRecord();
      ensureEmbedDriver();
      return getEmbedView()?.record ?? null;
    } catch {
      return null;
    }
  };

  const loadCache = () => (storage ? parseEmbedCache(safeGet(storage, EMBED_CACHE_KEY), () => {}) : {});
  const saveCache = (cache) => {
    if (!storage) return;
    try {
      storage.setItem(EMBED_CACHE_KEY, JSON.stringify(cache));
    } catch {
      /* a cache that cannot persist is still a cache for this session */
    }
  };

  /** Embed one batch of texts through the slot; resolves vectors or null (any gate = no vectors). */
  const embedBatch = async (rec, texts) => {
    const r = await fetchEmbed(fetchImpl, rec.endpoint, buildEmbedBody(rec.model, { input: texts }));
    return r && r.ok ? r.vectors : null;
  };

  /**
   * Index the shelf against the measured slot: cache-first per chunk, batched misses through
   * /api/embed. Resolves { indexed } — 0 when no slot is measured (the common case) or a batch
   * failed partway (what did index stays indexed; a later call resumes from the cache).
   */
  const indexAtIdle = () => {
    if (indexing) return indexing;
    indexing = (async () => {
      try {
        const rec = record();
        if (!rec || !semanticEnabled(rec)) return { indexed: 0 };
        if (indexedModel === rec.model && chunks.every((c) => Array.isArray(c.vector))) return { indexed: chunks.length };
        const cache = loadCache();
        let dirty = false;
        const missing = [];
        for (const chunk of chunks) {
          if (indexedModel === rec.model && Array.isArray(chunk.vector)) continue;
          const key = embedCacheKey({ model: rec.model, textHash: await hashText(chunkEmbedText(chunk)) });
          const hit = key ? cache[key] : null;
          if (hit) chunk.vector = hit.vector;
          else missing.push({ chunk, key });
        }
        for (let i = 0; i < missing.length; i += EMBED_BATCH) {
          const batch = missing.slice(i, i + EMBED_BATCH);
          const vectors = await embedBatch(
            rec,
            batch.map((m) => chunkEmbedText(m.chunk)),
          );
          if (!vectors) break;
          batch.forEach((m, j) => {
            m.chunk.vector = vectors[j];
            if (m.key) {
              cachePut(cache, m.key, { vector: vectors[j], dims: vectors[j].length, text: chunkEmbedText(m.chunk), at: Date.now() });
              dirty = true;
            }
          });
        }
        if (dirty) saveCache(cache);
        indexedModel = rec.model;
        return { indexed: chunks.filter((c) => Array.isArray(c.vector)).length };
      } catch {
        return { indexed: 0 };
      } finally {
        indexing = null;
      }
    })();
    return indexing;
  };

  /**
   * Top-k cited snippets of the persona's OWN shelf for one ask, fitted inside Mind's window —
   * or []: no measured slot, an unindexed shelf, a failed query embed, or a window with no room.
   * Never throws.
   */
  const snippetsFor = async (persona, context) => {
    try {
      const rec = record();
      if (!rec || !semanticEnabled(rec)) return [];
      if (indexedModel !== rec.model || !chunks.some((c) => c.persona === persona && Array.isArray(c.vector))) {
        await indexAtIdle();
        if (indexedModel !== rec.model) return [];
      }
      const queryText = archiveQueryText(persona, context);
      const cache = loadCache();
      const key = embedCacheKey({ model: rec.model, textHash: await hashText(queryText) });
      let queryVector = key ? (cache[key]?.vector ?? null) : null;
      if (!queryVector) {
        const vectors = await embedBatch(rec, [queryText]);
        if (!vectors) return [];
        queryVector = vectors[0];
        if (key) {
          cachePut(cache, key, { vector: queryVector, dims: queryVector.length, text: queryText, at: Date.now() });
          saveCache(cache);
        }
      }
      return retrieveSnippets({ chunks, persona, queryVector, baseContext: context });
    } catch {
      return [];
    }
  };

  return {
    indexAtIdle,
    snippetsFor,
    /** The corpus as built (chunks + shelf problems) — the dev surface and the staging probe read it. */
    state: () => ({ problems: corpus.problems, chunks: chunks.length, indexedModel }),
  };
}

let singleton = null;
/** The app's one retriever (created on first use — importing this module indexes nothing). */
export function ensureArchiveRetriever() {
  if (!singleton) singleton = createArchiveRetriever();
  return singleton;
}

/**
 * Schedule the shelf indexing for an idle moment (never a frame, never a bar): requestIdleCallback
 * where the platform offers it, a plain timer otherwise. Fire-and-forget by design — indexing is
 * resumable from the cache and every ask degrades silently until it lands.
 */
export function scheduleArchiveIndexing(retriever = ensureArchiveRetriever()) {
  const run = () => {
    Promise.resolve()
      .then(() => retriever.indexAtIdle())
      .catch(() => {});
  };
  if (typeof globalThis !== 'undefined' && typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(run, { timeout: 5000 });
  } else if (typeof globalThis !== 'undefined' && typeof globalThis.setTimeout === 'function') {
    globalThis.setTimeout(run, 1500);
  }
}
