// personas/personaArchive.mjs — Persona Kernel P4 (#2384): the Persona Archive's pure core.
//
// Spec: docs/design/persona-kernel-spec.md §3 (the Archive) + §4b (the dossier). Every persona pulls
// from its own text-only Archive: one folder per persona under personas/archive/<id>/, five shelves
// (backstory, brief, inspiration, canon, rulings), all Markdown, no images, no cloud anything. The
// .md files are the authored source of truth — backstory carries its provenance block, the brief is
// a draft marked UNSIGNED until Matt signs it, inspiration is works and methods in our own words.
//
// This module is the trust boundary the shelves cross to become retrieval: it parses a shelf file
// (front matter + `## ` sections), chunks it into cited snippets, composes the deterministic query
// text for a persona ask, ranks a persona's own chunks by the MegaMind embeddings slot's vectors
// (megamindEmbed.mjs — the slot is measured, never assumed), and fits the top-k inside Mind's
// 4,096-token window. Everything network-shaped stays in personaArchiveLive.js; everything here is
// pure and takes its inputs injected, like the embed core.
//
// The fallback law (the issue's acceptance): when no embeddings model is measured, retrieval
// returns NOTHING and the ask proceeds exactly as it did before the Archive existed —
// withArchiveSnippets returns the context object itself, same reference, when the snippet list is
// empty, so the rules path and the model path both see byte-identical input.
import { nearestNeighbours } from '../curator/megamindEmbed.mjs';

/** The five shelves every persona carries, in dossier order (spec §4b + the issue's file list). */
export const ARCHIVE_FILES = Object.freeze(['backstory', 'brief', 'inspiration', 'canon', 'rulings']);

/** Mind's context window (spec §3): the whole ask — base context plus snippets — must fit inside it. */
export const MIND_TOKEN_WINDOW = 4096;
/** Top-k: at most this many Archive snippets ride one persona ask. */
export const ARCHIVE_MAX_SNIPPETS = 4;
/** One snippet carries at most this many characters of shelf text (truncated at a word boundary). */
export const ARCHIVE_SNIPPET_MAX_CHARS = 600;
/** The token estimator's named constant: characters per token, the conservative prompt-planning rate. */
export const CHARS_PER_TOKEN = 4;

/** Estimate a text's tokens for window planning. An estimate, never a measurement — it only bounds. */
export function estimateTokens(text) {
  return Math.ceil(String(text ?? '').length / CHARS_PER_TOKEN);
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ── parsing: a shelf file becomes provenance + cited chunks ──────────────────────────────────────

const FRONT_KEY = /^([a-z][a-z0-9-]*):\s*(.*)$/;

/**
 * Parse one shelf file's front matter: the block between the leading `---` lines, `key: value`
 * per line. Returns { meta, body } — meta is null when the file carries no front matter block.
 */
export function parseFrontMatter(text) {
  const src = String(text ?? '');
  if (!src.startsWith('---\n')) return { meta: null, body: src };
  const end = src.indexOf('\n---', 3);
  if (end < 0) return { meta: null, body: src };
  const meta = {};
  for (const line of src.slice(4, end).split('\n')) {
    const m = FRONT_KEY.exec(line.trim());
    if (m) meta[m[1]] = m[2].trim();
  }
  return { meta, body: src.slice(end + 4).replace(/^\n+/, '') };
}

/** Truncate shelf text to the snippet cap at a word boundary; a truncated snippet says so with '…'. */
export function truncateSnippet(text, max = ARCHIVE_SNIPPET_MAX_CHARS) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(' ', max - 1);
  return `${s.slice(0, cut > 0 ? cut : max - 1)}…`;
}

/**
 * One shelf file as { persona, file, provenance, unsigned, chunks }:
 * - provenance is the front matter's { source, checked } — null when either is missing (the
 *   selfcheck fails the shelf on that: a backstory without sources is not an Archive entry);
 * - unsigned is the brief's status: true when the file carries the UNSIGNED marker;
 * - chunks are the body's `## ` sections, each { section, text } with text snippet-truncated.
 *   The `# ` title line and the UNSIGNED banner are not chunks — they are the file's frame, not
 *   its content. A body with no `## ` section yields one chunk under the title.
 */
export function parseArchiveFile(persona, file, text) {
  const { meta, body } = parseFrontMatter(text);
  const provenance =
    meta && typeof meta.source === 'string' && meta.source && typeof meta.checked === 'string' && meta.checked
      ? { source: meta.source, checked: meta.checked }
      : null;
  const unsigned = /\bUNSIGNED\b/.test(String(text ?? ''));
  const chunks = [];
  let title = file;
  let section = null;
  let buf = [];
  const flush = () => {
    if (section === null) return;
    const t = truncateSnippet(buf.join('\n'));
    if (t) chunks.push({ section, text: t });
  };
  for (const line of body.split('\n')) {
    if (line.startsWith('# ')) {
      title = line.slice(2).trim() || title;
      continue;
    }
    if (line.startsWith('## ')) {
      flush();
      section = line.slice(3).trim();
      buf = [];
      continue;
    }
    if (section === null) {
      // Preamble blockquotes are the file's frame (the brief's UNSIGNED banner rides one) — never content.
      if (line.trim() && !line.startsWith('>')) {
        section = title;
        buf = [line];
      }
      continue;
    }
    buf.push(line);
  }
  flush();
  return { persona, file, provenance, unsigned, chunks };
}

/** The citation a snippet carries into a persona ask: the shelf it came from, by file and section. */
export function archiveCite(persona, file, section) {
  return `archive/${persona}/${file}.md · ${section}`;
}

/**
 * The whole Archive as one corpus: files are [{ persona, file, text }] (the live driver reads them
 * off disk/bundle; the selfcheck reads them off disk). Returns { chunks, problems } — chunks are
 * flat [{ id, persona, file, section, text, cite }] in input order; problems names every shelf
 * defect (missing file, front matter that disagrees with its path, missing provenance, a brief
 * without its UNSIGNED marker, an empty shelf) as DATA, the registry idiom: the selfcheck asserts
 * the list is empty, so drift fails CI instead of breaking the instrument.
 */
export function buildArchiveCorpus(files, personaIds) {
  const problems = [];
  const chunks = [];
  const seen = new Set();
  const list = Array.isArray(files) ? files : [];
  for (const f of list) {
    if (!isObj(f) || typeof f.persona !== 'string' || typeof f.file !== 'string') continue;
    const key = `${f.persona}/${f.file}`;
    seen.add(key);
    const parsed = parseArchiveFile(f.persona, f.file, f.text);
    const { meta } = parseFrontMatter(f.text);
    if (!meta) problems.push(`${key}: no front matter block`);
    else {
      if (meta.persona !== f.persona) problems.push(`${key}: front matter persona '${meta.persona}' != path`);
      if (meta.file !== f.file) problems.push(`${key}: front matter file '${meta.file}' != path`);
    }
    if (!parsed.provenance) problems.push(`${key}: no provenance (front matter needs source + checked)`);
    if (f.file === 'brief' && !parsed.unsigned) problems.push(`${key}: brief carries no UNSIGNED marker`);
    if (!parsed.chunks.length) problems.push(`${key}: no chunks (empty shelf)`);
    parsed.chunks.forEach((c, i) => {
      chunks.push({
        id: `${key}#${i}`,
        persona: f.persona,
        file: f.file,
        section: c.section,
        text: c.text,
        cite: archiveCite(f.persona, f.file, c.section),
      });
    });
  }
  if (Array.isArray(personaIds)) {
    for (const id of personaIds)
      for (const file of ARCHIVE_FILES) if (!seen.has(`${id}/${file}`)) problems.push(`${id}/${file}: shelf file missing`);
  }
  return { chunks, problems };
}

/** The text one chunk is embedded by: its address first, then its words — the embed core's idiom. */
export function chunkEmbedText(chunk) {
  if (!isObj(chunk)) return '';
  return `${chunk.persona} ${chunk.file} ${chunk.section}. ${chunk.text}`;
}

// ── the query: a deterministic composition over the ask's context ────────────────────────────────

/**
 * The query text for one persona ask, composed from the buildContext() summary the thinker already
 * hands the model — deterministic, so the same room always asks the Archive the same question (and
 * the embed cache can answer it). Only summary fields ride: palette, verdict, intensity, band, the
 * room's two states, tier. Anything absent stays absent.
 */
export function archiveQueryText(persona, context) {
  const c = isObj(context) ? context : {};
  const parts = [`persona ${persona}`];
  if (typeof c.palette === 'string' && c.palette) parts.push(`palette ${c.palette}`);
  if (typeof c.verdict === 'string' && c.verdict) parts.push(`verdict ${c.verdict}`);
  if (typeof c.intensity === 'string' && c.intensity) parts.push(`intensity ${c.intensity}`);
  if (typeof c.band === 'string' && c.band) parts.push(`band ${c.band}`);
  if (isObj(c.room)) {
    if (typeof c.room.lois === 'string' && c.room.lois) parts.push(`cover state ${c.room.lois}`);
    if (typeof c.room.davis === 'string' && c.room.davis) parts.push(`overlap state ${c.room.davis}`);
  }
  if (typeof c.tier === 'string' && c.tier) parts.push(`tier ${c.tier}`);
  if (Number.isFinite(c.keeps)) parts.push(`keeps ${c.keeps}`);
  return parts.join('. ');
}

// ── ranking + the window: top-k of the persona's OWN shelf, fitted ───────────────────────────────

/**
 * Rank one persona's indexed chunks against a query vector: nearestNeighbours over that persona's
 * chunks only (a persona pulls from its OWN Archive — spec §3), ascending semantic distance,
 * deterministic ties. Chunks without a vector are absent — never ranked by a guess.
 */
export function rankPersonaChunks(queryVector, chunks, persona, { limit = ARCHIVE_MAX_SNIPPETS } = {}) {
  if (!Array.isArray(chunks)) return [];
  const own = [];
  chunks.forEach((chunk, i) => {
    if (chunk && chunk.persona === persona && Array.isArray(chunk.vector)) own.push({ id: i, vector: chunk.vector });
  });
  return nearestNeighbours(queryVector, own, { limit }).map((hit) => ({
    chunk: chunks[hit.id],
    distance: hit.distance,
    similarity: hit.similarity,
  }));
}

/**
 * Fit ranked snippets inside Mind's window: the base context's estimated tokens are spent first;
 * snippets then ride in rank order, whole, while the running estimate stays within the window —
 * a snippet that does not fit is dropped, never cut mid-thought (chunks are pre-truncated at the
 * snippet cap). Returns [{ cite, text }] in rank order.
 */
export function fitArchiveSnippets(ranked, baseContext, { window = MIND_TOKEN_WINDOW, limit = ARCHIVE_MAX_SNIPPETS } = {}) {
  let spent = estimateTokens(JSON.stringify(baseContext ?? {}));
  const out = [];
  for (const hit of Array.isArray(ranked) ? ranked : []) {
    if (out.length >= limit) break;
    const chunk = hit && hit.chunk ? hit.chunk : hit;
    if (!isObj(chunk) || typeof chunk.text !== 'string' || !chunk.text) continue;
    const cost = estimateTokens(chunk.text) + estimateTokens(chunk.cite ?? '');
    if (spent + cost > window) continue;
    spent += cost;
    out.push({ cite: chunk.cite, text: chunk.text });
  }
  return out;
}

/** Retrieve: rank the persona's chunks for this query vector and fit them into the window. */
export function retrieveSnippets({ chunks, persona, queryVector, baseContext, limit = ARCHIVE_MAX_SNIPPETS } = {}) {
  const ranked = rankPersonaChunks(queryVector, chunks, persona, { limit: Math.max(limit, ARCHIVE_MAX_SNIPPETS) });
  return fitArchiveSnippets(ranked, baseContext, { limit });
}

/**
 * The ask-bound context: with snippets, a shallow copy carrying them under `archive` (the model
 * reads the whole context object — megamindVoice stringifies it, the Apple helper receives it);
 * without, THE SAME OBJECT — the no-model path is byte-identical by construction.
 */
export function withArchiveSnippets(context, snippets) {
  if (!Array.isArray(snippets) || !snippets.length) return context;
  return { ...context, archive: snippets.map((s) => ({ cite: s.cite, text: s.text })) };
}
