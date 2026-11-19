// personas/personaArchive.selfcheck.mjs — Persona Kernel P4 (#2384): the Persona Archive.
//
// Pins, per behaviour:
//  A. the shelves: every registry persona carries the five Archive files; each parses with a
//     provenance block; every brief is marked UNSIGNED; the corpus builds with zero problems;
//     no image file exists anywhere under archive/ (spec §3: text only).
//  B. parsing: front matter, `## ` chunking with the file's frame excluded, citations, the
//     snippet cap at a word boundary.
//  C. the query: a deterministic composition over the ask's context.
//  D. retrieval with a stub embeddings model (the megamindEmbed fixture idiom): the shelf indexes
//     in batches at idle, a persona ask returns cited snippets from its OWN shelf only, inside
//     Mind's 4,096-token window, and a second ask is cache-served and identical.
//  E. the no-model path: no measured slot → no fetch is ever made, no snippets, ever — the house
//     Ollama (chat-only) case, which is the common case.
//  F. the window: top-k cap, per-snippet cap, whole-snippet fitting against the base context.
//  G. the fallback law: a golden battery over rulesReply (the rules engine this PR does not
//     touch) and a startMind A/B — with the Archive wired but returning nothing, the model is
//     handed the identical contexts and the decisions are identical; with snippets, only the
//     model-bound copy carries them.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { ARCHIVE_FILES, archiveCite, archiveQueryText, buildArchiveCorpus, chunkEmbedText, estimateTokens, fitArchiveSnippets, parseArchiveFile, parseFrontMatter, retrieveSnippets, truncateSnippet, withArchiveSnippets, ARCHIVE_MAX_SNIPPETS, ARCHIVE_SNIPPET_MAX_CHARS, MIND_TOKEN_WINDOW } from './personaArchive.mjs';
import { createArchiveRetriever } from './personaArchiveLive.js';
import { personaIds } from './registry.mjs';
import { EMBED_BATCH, probeEmbedModel, semanticEnabled } from '../curator/megamindEmbed.mjs';
import { buildContext } from '../curator/mindContext.js';
import { rulesReply } from '../curator/mindRules.js';
import { neutralReply } from '../curator/mindContract.js';
import { startMind } from '../curator/mindLive.js';
import { Events, emit, on } from '../composition/eventBus.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const tick = () => new Promise((r) => setTimeout(r, 0));

const ARCHIVE_DIR = new URL('./archive/', import.meta.url);
const walk = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = new URL(`${e.name}${e.isDirectory() ? '/' : ''}`, dir);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push({ name: e.name, url: p });
  }
  return out;
};
const diskFiles = () =>
  personaIds().flatMap((persona) =>
    ARCHIVE_FILES.map((file) => ({
      persona,
      file,
      text: readFileSync(new URL(`./archive/${persona}/${file}.md`, import.meta.url), 'utf8'),
    })),
  );

// ── A. the shelves ───────────────────────────────────────────────────────────────────────────────
await ok('A1: every registry persona carries the five shelf files, all Markdown', () => {
  const onDisk = walk(ARCHIVE_DIR);
  assert.equal(onDisk.length, personaIds().length * ARCHIVE_FILES.length);
  for (const f of onDisk) assert.ok(f.name.endsWith('.md'), `${f.name} is not Markdown`);
  for (const persona of personaIds())
    for (const file of ARCHIVE_FILES)
      assert.ok(readFileSync(new URL(`./archive/${persona}/${file}.md`, import.meta.url), 'utf8').length > 100, `${persona}/${file} is a stub`);
});

await ok('A2: no image files anywhere under archive/ (text only, spec §3)', () => {
  const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|tiff?)$/i;
  for (const f of walk(ARCHIVE_DIR)) assert.ok(!IMAGE.test(f.name), `image file in the Archive: ${f.name}`);
});

await ok('A3: the corpus builds clean — provenance everywhere, briefs UNSIGNED, no drift', () => {
  const { chunks, problems } = buildArchiveCorpus(diskFiles(), personaIds());
  assert.deepEqual(problems, []);
  assert.ok(chunks.length >= personaIds().length * ARCHIVE_FILES.length, 'every shelf yields at least one chunk');
  for (const c of chunks) {
    assert.ok(c.cite.startsWith(`archive/${c.persona}/${c.file}.md · `), `citation shape: ${c.cite}`);
    assert.ok(c.text.length <= ARCHIVE_SNIPPET_MAX_CHARS, 'chunk text respects the snippet cap');
  }
});

// ── B. parsing ───────────────────────────────────────────────────────────────────────────────────
await ok('B1: front matter parses; a file without one reports no provenance', () => {
  const { meta } = parseFrontMatter('---\npersona: lois\nfile: backstory\nsource: docs/x.md\nchecked: 2026-11-19\n---\n\n# T\n');
  assert.equal(meta.source, 'docs/x.md');
  assert.equal(parseFrontMatter('# no front matter\n').meta, null);
  const parsed = parseArchiveFile('lois', 'backstory', '# Title\n\n## One\nbody one\n');
  assert.equal(parsed.provenance, null);
});

await ok('B2: chunking splits on ## sections; the title and the UNSIGNED banner are frame, not chunks', () => {
  const text = [
    '---',
    'persona: lois',
    'file: brief',
    'source: s',
    'checked: 2026-11-19',
    '---',
    '',
    '# George Lois — brief',
    '',
    '> **Status: UNSIGNED** — draft.',
    '',
    '## The brief',
    '- one idea',
    '',
    '## Second',
    'more words here',
  ].join('\n');
  const parsed = parseArchiveFile('lois', 'brief', text);
  assert.equal(parsed.unsigned, true);
  assert.deepEqual(parsed.chunks.map((c) => c.section), ['The brief', 'Second']);
  assert.ok(!parsed.chunks.some((c) => c.text.includes('UNSIGNED')), 'the banner never becomes a snippet');
  assert.equal(archiveCite('lois', 'brief', 'The brief'), 'archive/lois/brief.md · The brief');
});

await ok('B3: the snippet cap truncates at a word boundary and says so', () => {
  const long = 'word '.repeat(300).trim();
  const cut = truncateSnippet(long);
  assert.ok(cut.length <= ARCHIVE_SNIPPET_MAX_CHARS);
  assert.ok(cut.endsWith('…'));
  assert.equal(truncateSnippet('short text'), 'short text');
});

// ── C. the query ─────────────────────────────────────────────────────────────────────────────────
const CTX = buildContext({
  layers: [{ type: 'content' }],
  enabledAssetCount: 4,
  paletteId: 'bone',
  room: { lois: 'VIBE', davis: 'FLOW' },
  band: 'normal',
  keepsCount: 9,
  bpm: 120,
  audio: 'mic',
  creatures: 0,
});
await ok('C1: the query text is a deterministic composition over the context summary', () => {
  const q = archiveQueryText('lois', CTX);
  assert.equal(q, archiveQueryText('lois', CTX));
  assert.ok(q.startsWith('persona lois.'));
  assert.ok(q.includes('palette bone'));
  assert.ok(q.includes('cover state VIBE'));
  assert.equal(archiveQueryText('lois', {}), 'persona lois');
});

// ── D. retrieval with a stub embeddings model ────────────────────────────────────────────────
// The fixture embedder (the megamindEmbed.selfcheck idiom): token-bucket pseudo-vectors, so texts
// that share words land near each other — enough to prove ranking, citation and the window.
const DIMS = 24;
const vecForText = (text) => {
  const v = new Array(DIMS).fill(0);
  for (const w of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (!w) continue;
    let h = 0;
    for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
    v[h % DIMS] += 1;
  }
  return v;
};
const jsonRes = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const makeOllama = ({ embedStatus = 200 } = {}) => {
  const calls = [];
  const impl = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, body });
    if (path === '/api/show') return jsonRes(200, { capabilities: ['completion'], details: { parameter_size: '8B' } });
    if (path === '/api/embed') {
      if (embedStatus !== 200) return jsonRes(embedStatus, { error: 'this model does not embed' });
      if (body.images) return jsonRes(200, { embeddings: [vecForText('spiky radial marks')] });
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      return jsonRes(200, { embeddings: inputs.map(vecForText) });
    }
    return jsonRes(404, { error: 'unknown path' });
  };
  impl.calls = calls;
  impl.embedCalls = () => calls.filter((c) => c.path === '/api/embed');
  return impl;
};
const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _map: m };
};
const shaStub = async (text) => {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < String(text).length; i++) {
    h1 ^= String(text).charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + 'ab'.repeat(28)).slice(0, 64);
};

const ollama = makeOllama();
const probe = await probeEmbedModel(ollama, 'http://127.0.0.1:11434', 'embed-stub', { now: () => 0, stamp: () => 1700000000000 });
assert.ok(probe.ok, 'the stub slot probes clean');
assert.ok(semanticEnabled(probe.record), 'the stub record enables semantic retrieval');

const retriever = createArchiveRetriever({
  fetchImpl: ollama,
  getRecord: () => probe.record,
  storage: memStorage(),
  hashText: shaStub,
  files: diskFiles(),
});

await ok('D1: indexing embeds every chunk, in batches of at most EMBED_BATCH, only when invoked', async () => {
  const before = ollama.embedCalls().length;
  const { chunks } = buildArchiveCorpus(diskFiles(), personaIds());
  const { indexed } = await retriever.indexAtIdle();
  assert.equal(indexed, chunks.length);
  const calls = ollama.embedCalls().slice(before);
  assert.ok(calls.length >= Math.ceil(chunks.length / EMBED_BATCH), 'batched, not one call per chunk');
  for (const c of calls) {
    const inputs = Array.isArray(c.body.input) ? c.body.input : [c.body.input];
    assert.ok(inputs.length <= EMBED_BATCH, 'no batch exceeds EMBED_BATCH');
  }
});

await ok('D2: a persona ask returns cited snippets from its OWN shelf, inside the window', async () => {
  const snippets = await retriever.snippetsFor('lois', CTX);
  assert.ok(snippets.length >= 1 && snippets.length <= ARCHIVE_MAX_SNIPPETS);
  for (const s of snippets) {
    assert.ok(s.cite.startsWith('archive/lois/'), `own shelf only: ${s.cite}`);
    assert.ok(typeof s.text === 'string' && s.text.length > 0);
  }
  const spent = estimateTokens(JSON.stringify(CTX)) + snippets.reduce((a, s) => a + estimateTokens(s.text) + estimateTokens(s.cite), 0);
  assert.ok(spent <= MIND_TOKEN_WINDOW, `the ask fits the window (${spent} <= ${MIND_TOKEN_WINDOW})`);
  const davis = await retriever.snippetsFor('davis', CTX);
  assert.ok(davis.length >= 1 && davis.every((s) => s.cite.startsWith('archive/davis/')), 'davis pulls from the davis shelf only');
});

await ok('D3: a repeat ask is cache-served and identical (determinism)', async () => {
  const embedCallsBefore = ollama.embedCalls().length;
  const again = await retriever.snippetsFor('lois', CTX);
  const first = await retriever.snippetsFor('lois', CTX);
  assert.deepEqual(again, first);
  assert.equal(ollama.embedCalls().length, embedCallsBefore, 'no new embed call — the cache answered');
});

// ── E. the no-model path ─────────────────────────────────────────────────────────────────────────
await ok('E1: no measured slot → no fetch, no snippets, no indexing (the house-model case)', async () => {
  const quiet = makeOllama();
  const r = createArchiveRetriever({ fetchImpl: quiet, getRecord: () => null, storage: memStorage(), hashText: shaStub, files: diskFiles() });
  assert.deepEqual(await r.indexAtIdle(), { indexed: 0 });
  assert.deepEqual(await r.snippetsFor('lois', CTX), []);
  assert.equal(quiet.calls.length, 0, 'not one network call was made');
});

await ok('E2: a chat-only model (the probe refuses it) leaves retrieval off, silently', async () => {
  const chatOnly = makeOllama({ embedStatus: 400 });
  const refused = await probeEmbedModel(chatOnly, 'http://127.0.0.1:11434', 'qwen3-vl:8b-instruct', { now: () => 0, stamp: () => 1 });
  assert.equal(refused.ok, false);
  const r = createArchiveRetriever({ fetchImpl: chatOnly, getRecord: () => null, storage: memStorage(), hashText: shaStub, files: diskFiles() });
  assert.deepEqual(await r.snippetsFor('lois', CTX), []);
});

// ── F. the window ────────────────────────────────────────────────────────────────────────────────
await ok('F1: fitting is whole-snippet, top-k capped, and the base context spends first', () => {
  const big = 'x'.repeat(ARCHIVE_SNIPPET_MAX_CHARS);
  const ranked = Array.from({ length: 8 }, (_, i) => ({
    chunk: { persona: 'lois', file: 'backstory', section: `S${i}`, text: big, cite: `archive/lois/backstory.md · S${i}` },
    distance: i / 10,
  }));
  const fitted = fitArchiveSnippets(ranked, {});
  assert.ok(fitted.length <= ARCHIVE_MAX_SNIPPETS);
  assert.ok(fitted.length >= 1);
  const total = fitted.reduce((a, s) => a + estimateTokens(s.text) + estimateTokens(s.cite), estimateTokens('{}'));
  assert.ok(total <= MIND_TOKEN_WINDOW);
  // a base context that already fills the window leaves room for nothing
  const stuffed = { blob: 'y'.repeat(MIND_TOKEN_WINDOW * 4) };
  assert.deepEqual(fitArchiveSnippets(ranked, stuffed), []);
});

await ok('F2: retrieveSnippets never returns another persona\u2019s chunks', () => {
  const chunks = [
    { persona: 'lois', file: 'brief', section: 'The brief', text: 'one idea cut', cite: archiveCite('lois', 'brief', 'The brief'), vector: vecForText('persona lois') },
    { persona: 'davis', file: 'brief', section: 'The brief', text: 'roll again', cite: archiveCite('davis', 'brief', 'The brief'), vector: vecForText('persona lois') },
  ];
  const out = retrieveSnippets({ chunks, persona: 'lois', queryVector: vecForText('persona lois'), baseContext: {} });
  assert.equal(out.length, 1);
  assert.ok(out[0].cite.startsWith('archive/lois/'));
});

await ok('F3: withArchiveSnippets is the identity on empty, a cited copy otherwise', () => {
  const ctx = { v: 3 };
  assert.equal(withArchiveSnippets(ctx, []), ctx, 'same reference — byte-identical by construction');
  assert.equal(withArchiveSnippets(ctx, null), ctx);
  const enriched = withArchiveSnippets(ctx, [{ cite: 'archive/lois/brief.md · The brief', text: 'one idea' }]);
  assert.notEqual(enriched, ctx);
  assert.deepEqual(enriched.archive, [{ cite: 'archive/lois/brief.md · The brief', text: 'one idea' }]);
  assert.equal(ctx.archive, undefined, 'the original context is never mutated');
});

// ── G. the fallback law ──────────────────────────────────────────────────────────────────────────
const GOLDEN = [{"persona":"davis","ci":0,"seed":0,"bar":0,"reply":{"propose":null,"state":"FLOW"}},{"persona":"davis","ci":0,"seed":0,"bar":7,"reply":{"propose":null,"state":"FLOW"}},{"persona":"davis","ci":0,"seed":42,"bar":0,"reply":{"propose":null,"state":"FLOW"}},{"persona":"davis","ci":0,"seed":42,"bar":7,"reply":{"propose":null,"state":"FLOW"}},{"persona":"davis","ci":0,"seed":987654,"bar":0,"reply":{"propose":null,"state":"FLOW"}},{"persona":"davis","ci":0,"seed":987654,"bar":7,"reply":{"propose":null,"state":"FLOW"}},{"persona":"davis","ci":1,"seed":0,"bar":0,"reply":{"propose":null}},{"persona":"davis","ci":1,"seed":0,"bar":7,"reply":{"propose":null}},{"persona":"davis","ci":1,"seed":42,"bar":0,"reply":{"propose":null}},{"persona":"davis","ci":1,"seed":42,"bar":7,"reply":{"propose":null}},{"persona":"davis","ci":1,"seed":987654,"bar":0,"reply":{"propose":null}},{"persona":"davis","ci":1,"seed":987654,"bar":7,"reply":{"propose":null}},{"persona":"davis","ci":2,"seed":0,"bar":0,"reply":{"propose":null}},{"persona":"davis","ci":2,"seed":0,"bar":7,"reply":{"propose":null}},{"persona":"davis","ci":2,"seed":42,"bar":0,"reply":{"propose":null}},{"persona":"davis","ci":2,"seed":42,"bar":7,"reply":{"propose":null}},{"persona":"davis","ci":2,"seed":987654,"bar":0,"reply":{"propose":null}},{"persona":"davis","ci":2,"seed":987654,"bar":7,"reply":{"propose":null}},{"persona":"lois","ci":0,"seed":0,"bar":0,"reply":{"critique":null,"state":"VIBE"}},{"persona":"lois","ci":0,"seed":0,"bar":7,"reply":{"critique":null,"state":"VIBE"}},{"persona":"lois","ci":0,"seed":42,"bar":0,"reply":{"critique":null,"state":"VIBE"}},{"persona":"lois","ci":0,"seed":42,"bar":7,"reply":{"critique":null,"state":"VIBE"}},{"persona":"lois","ci":0,"seed":987654,"bar":0,"reply":{"critique":null,"state":"VIBE"}},{"persona":"lois","ci":0,"seed":987654,"bar":7,"reply":{"critique":null,"state":"VIBE"}},{"persona":"lois","ci":1,"seed":0,"bar":0,"reply":{"critique":null,"state":"BURN"}},{"persona":"lois","ci":1,"seed":0,"bar":7,"reply":{"critique":null,"state":"BURN"}},{"persona":"lois","ci":1,"seed":42,"bar":0,"reply":{"critique":null,"state":"BURN"}},{"persona":"lois","ci":1,"seed":42,"bar":7,"reply":{"critique":null,"state":"BURN"}},{"persona":"lois","ci":1,"seed":987654,"bar":0,"reply":{"critique":null,"state":"BURN"}},{"persona":"lois","ci":1,"seed":987654,"bar":7,"reply":{"critique":null,"state":"BURN"}},{"persona":"lois","ci":2,"seed":0,"bar":0,"reply":{"critique":null}},{"persona":"lois","ci":2,"seed":0,"bar":7,"reply":{"critique":null}},{"persona":"lois","ci":2,"seed":42,"bar":0,"reply":{"critique":null}},{"persona":"lois","ci":2,"seed":42,"bar":7,"reply":{"critique":null}},{"persona":"lois","ci":2,"seed":987654,"bar":0,"reply":{"critique":null}},{"persona":"lois","ci":2,"seed":987654,"bar":7,"reply":{"critique":null}},{"persona":"queen","ci":0,"seed":0,"bar":0,"reply":{"mood":"drive","lean":{}}},{"persona":"queen","ci":0,"seed":0,"bar":7,"reply":{"mood":"drive","lean":{}}},{"persona":"queen","ci":0,"seed":42,"bar":0,"reply":{"mood":"drive","lean":{}}},{"persona":"queen","ci":0,"seed":42,"bar":7,"reply":{"mood":"drive","lean":{}}},{"persona":"queen","ci":0,"seed":987654,"bar":0,"reply":{"mood":"drive","lean":{}}},{"persona":"queen","ci":0,"seed":987654,"bar":7,"reply":{"mood":"drive","lean":{}}},{"persona":"queen","ci":1,"seed":0,"bar":0,"reply":{"mood":"calm","lean":{}}},{"persona":"queen","ci":1,"seed":0,"bar":7,"reply":{"mood":"calm","lean":{}}},{"persona":"queen","ci":1,"seed":42,"bar":0,"reply":{"mood":"calm","lean":{}}},{"persona":"queen","ci":1,"seed":42,"bar":7,"reply":{"mood":"calm","lean":{}}},{"persona":"queen","ci":1,"seed":987654,"bar":0,"reply":{"mood":"calm","lean":{}}},{"persona":"queen","ci":1,"seed":987654,"bar":7,"reply":{"mood":"calm","lean":{}}},{"persona":"queen","ci":2,"seed":0,"bar":0,"reply":{"mood":"calm","lean":{}}},{"persona":"queen","ci":2,"seed":0,"bar":7,"reply":{"mood":"calm","lean":{}}},{"persona":"queen","ci":2,"seed":42,"bar":0,"reply":{"mood":"calm","lean":{}}},{"persona":"queen","ci":2,"seed":42,"bar":7,"reply":{"mood":"calm","lean":{}}},{"persona":"queen","ci":2,"seed":987654,"bar":0,"reply":{"mood":"calm","lean":{}}},{"persona":"queen","ci":2,"seed":987654,"bar":7,"reply":{"mood":"calm","lean":{}}}];
const SNAPS = [
  { layers: [{ type: 'content' }, { type: 'pattern' }, { type: 'fx' }], enabledAssetCount: 4, paletteId: 'bone', room: { lois: 'VIBE', davis: 'FLOW' }, band: 'normal', keepsCount: 9, bpm: 121.4, audio: 'mic', creatures: 2 },
  { layers: [{ type: 'content' }, { type: 'content' }, { type: 'math' }], enabledAssetCount: 40, paletteId: 'dystopia', room: { lois: 'BURN', davis: 'SIFT' }, band: 'peak', keepsCount: 31, bpm: 140, audio: 'file', creatures: 0, director: { verdict: 'THE CLASH', intensity: 'peak' } },
  { layers: [], enabledAssetCount: 0, paletteId: null, room: {}, band: 'low', keepsCount: 0, bpm: null, audio: 'none', creatures: 0 },
];
await ok('G1: the rules fallback battery is byte-identical (golden, computed on the untouched rules engine)', () => {
  assert.equal(GOLDEN.length, 54);
  for (const g of GOLDEN) {
    const reply = rulesReply(g.persona, buildContext(SNAPS[g.ci]), { seed: g.seed, bar: g.bar, heat: 0.35 });
    assert.deepEqual(reply, g.reply, `${g.persona} ci=${g.ci} seed=${g.seed} bar=${g.bar}`);
  }
});

const driveMind = async (archive) => {
  const captured = [];
  const decisions = [];
  const off = on(Events.MIND_DECISION, (d) => decisions.push(d));
  const model = {
    name: 'apple',
    available: () => true,
    info: () => ({ available: true, model: 'stub' }),
    ask: async (persona, context) => {
      captured.push({ persona, context });
      return neutralReply(persona);
    },
  };
  const stop = startMind({
    getSnapshot: () => SNAPS[0],
    getSeed: () => 4242,
    model,
    ...(archive ? { archive } : {}),
  });
  for (let bar = 1; bar <= 4; bar++) {
    emit(Events.CLOCK_BAR, { bar, bpm: 120 });
    await tick();
    await tick();
  }
  stop();
  off();
  return { captured, decisions };
};

await ok('G2: startMind with the Archive wired but empty hands the model identical contexts, identical decisions', async () => {
  const plain = await driveMind(null);
  const wired = await driveMind({ snippetsFor: async () => [] });
  assert.ok(plain.captured.length > 0, 'the model was actually asked');
  assert.deepEqual(wired.captured, plain.captured);
  assert.deepEqual(wired.decisions, plain.decisions);
  for (const c of wired.captured) assert.equal(c.context.archive, undefined);
});

await ok('G3: with snippets, only the model-bound copy carries them — cited, from the persona\u2019s shelf', async () => {
  const snippet = { cite: 'archive/lois/brief.md · The brief', text: 'one idea that lands in a nanosecond' };
  const { captured, decisions } = await driveMind({ snippetsFor: async () => [snippet] });
  assert.ok(captured.length > 0);
  for (const c of captured) assert.deepEqual(c.context.archive, [snippet]);
  assert.ok(decisions.length > 0, 'decisions still land');
});

console.log(`personaArchive.selfcheck: ${n} checks passed`);
