// #1528 selfcheck — the embeddings slot: the pure core (capability record, probe measurement, cache
// keying, embed texts, vector math), the live driver against a fixture Ollama (slot states, cache
// invalidation, silent degradation), the ACCEPTANCE FIXTURE (recorded fixture keeps whose computed
// neighbours must reproduce the human-judged ordering), and the miner's semantic axis (dual-axis
// report shape + selection identity when embeddings resolve nothing).
//
// The fixture vectors below are a RECORDED SAMPLE standing in for a real embedding model's output:
// three hand-placed clusters (spiky / calm grid / wall) with the human judgment written as data.
// Real-model agreement — pull a real embedding model, probe the slot, search real keeps — is
// Matt's on-device check; this suite pins everything that must hold around the model either way.
//
// Run: node src/curator/megamindEmbed.selfcheck.mjs
import { createHash } from 'node:crypto';
import {
  EMBED_CACHE_FILE,
  EMBED_CACHE_KEY,
  EMBED_SLOT_KEY,
  EMBED_PROBE_IMAGE_B64,
  EMBED_PROBE_TEXT,
  SEMANTIC_NOVELTY_WEIGHT,
  assetEmbedText,
  blendNovelty,
  buildEmbedBody,
  checkCacheEntry,
  checkEmbedRecord,
  embedCacheKey,
  embedCapabilityShape,
  embedErrorCopy,
  fetchEmbed,
  keepEmbedText,
  nearestNeighbours,
  parseEmbedCache,
  parseEmbedReply,
  probeEmbedModel,
  semanticDistance,
  semanticEnabled,
} from './megamindEmbed.mjs';
import { createEmbedDriver, readShelfKeeps } from './megamindEmbedLive.js';
import { formatMinerReport, runMiner, selectFinalists } from './miner.mjs';
import { variantIdFor } from './variants.mjs';
import { ASSETS } from '../data/assets/index.js';

let checks = 0;
const suite = (name, fn) => {
  const before = checks;
  fn();
  console.log(`${name}: ${checks - before}/${checks - before}`);
};
const ok = (cond, msg) => {
  checks++;
  if (!cond) throw new Error(`megamindEmbed check failed: ${msg}`);
};
const eq = (a, b, msg) =>
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const sha = (t) => createHash('sha256').update(t).digest('hex');
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const memStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
};
const stamp = () => 1700000000000;
const now = () => 0;

// ── the fixture Ollama ───────────────────────────────────────────────────────
const vecForText = (text) => {
  const t = String(text).toLowerCase();
  if (t.includes('wall')) return [0.05, 0.12, 0.94];
  if (t.includes('calm') || t.includes('grid')) return [0.08, 0.95, 0.1];
  return [0.96, 0.1, 0.05]; // spiky — also the probe text's landing, and the image probe's
};
const ollamaFixture = ({ models, embedFor }) => {
  const calls = [];
  const impl = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, body });
    if (path === '/api/tags') return jsonRes(200, { models });
    if (path === '/api/show') return jsonRes(200, { capabilities: ['completion'], details: { parameter_size: '8B' } });
    if (path === '/api/embed') {
      const r = embedFor(body);
      if (r && r.status) return jsonRes(r.status, r.json ?? { error: 'this model does not embed' });
      return jsonRes(200, r);
    }
    return jsonRes(404, { error: 'unknown path' });
  };
  impl.calls = calls;
  impl.embedCalls = () => calls.filter((c) => c.path === '/api/embed');
  return impl;
};
const embedOk = (body) => {
  if (body.images) return { embeddings: [vecForText('spiky')] };
  const inputs = Array.isArray(body.input) ? body.input : [body.input];
  return { embeddings: inputs.map(vecForText) };
};
const embedByModel = (body) => (body.model === 'not-embedder' ? { status: 400 } : embedOk(body));

// ── pure core: reply parsing, vector math, blending ─────────────────────────
suite('megamindEmbed core', () => {
  const parsed = parseEmbedReply(
    {
      embeddings: [
        [1, 0],
        [0, 1],
      ],
    },
    2,
  );
  eq(
    parsed && parsed.vectors,
    [
      [1, 0],
      [0, 1],
    ],
    'a clean reply parses to its vectors',
  );
  eq(parsed && parsed.dims, 2, 'a clean reply reports its dimension');
  ok(parseEmbedReply({ embeddings: [[1, 0], [0]] }, 2) === null, 'ragged dims refused');
  ok(parseEmbedReply({ embeddings: [[1, 0]] }, 2) === null, 'a count mismatch refused');
  ok(parseEmbedReply({ embeddings: [[1, 'x']] }, 1) === null, 'a non-numeric component refused');
  ok(parseEmbedReply({ embeddings: [[]] }, 1) === null, 'an empty vector refused');
  ok(parseEmbedReply({}, 1) === null, 'a reply without embeddings refused');
  ok(parseEmbedReply(null, 1) === null, 'a null reply refused');

  eq(semanticDistance([1, 0], [1, 0]), 0, 'identical vectors: distance 0');
  eq(semanticDistance([1, 0], [0, 1]), 0.5, 'orthogonal vectors: distance 1/2');
  eq(semanticDistance([1, 0], [-1, 0]), 1, 'opposite vectors: distance 1');
  ok(Math.abs(semanticDistance([2, 0], [1, 0])) < 1e-9, 'scale does not matter — direction does');
  ok(semanticDistance([1, 0], [1, 0, 0]) === null, 'a dims mismatch is incomparable, never a number');
  ok(semanticDistance([0, 0], [1, 0]) === null, 'a zero vector is incomparable');
  ok(semanticDistance([1, NaN], [1, 0]) === null, 'a non-finite component is incomparable');

  eq(blendNovelty(0.4, null), 0.4, 'no semantic component: the feature novelty is returned untouched');
  eq(blendNovelty(0.4, 0.2), 0.4 + SEMANTIC_NOVELTY_WEIGHT * 0.2, 'the blend is feature + weight × semantic');
  eq(SEMANTIC_NOVELTY_WEIGHT, 0.5, 'the weight is the named constant: semantic can add at most half the feature range');

  const entries = [
    { id: 'a', vector: [1, 0] },
    { id: 'b', vector: [0.9, 0.1] },
    { id: 'c', vector: null },
    { id: 'd', vector: [0, 1] },
  ];
  const nn = nearestNeighbours([1, 0.05], entries);
  eq(
    nn.map((h) => h.id),
    ['a', 'b', 'd'],
    'neighbours rank ascending; a vectorless entry is simply absent',
  );
  ok(
    nn.every((h) => typeof h.distance === 'number'),
    'every hit carries its distance',
  );
  eq(nearestNeighbours(null, entries), [], 'no query vector, no neighbours');
  eq(nearestNeighbours([1], entries), [], 'a dims-incomparable query finds nothing');
});

// ── pure core: embed texts (deterministic compositions) ─────────────────────
suite('megamindEmbed texts', () => {
  const burst = ASSETS.find((a) => a.id === 'org_blob_01');
  ok(assetEmbedText(burst).startsWith('asset org_blob_01. category organic'), 'an asset text leads with id + category');
  ok(assetEmbedText(burst).includes('tags '), 'an asset text carries its tags');
  eq(assetEmbedText(null), '', 'no asset, no text');
  eq(assetEmbedText({}), '', 'an asset without an id has no text');

  const byId = new Map(ASSETS.map((a) => [a.id, a]));
  const shelfKeep = {
    seed: 7,
    caption: '  Spiky   radial burst ',
    config: { layout: { mode: 'radial' }, palette: { id: 'ember' }, assets: ['org_blob_01', 'org_blob_01'] },
  };
  const t1 = keepEmbedText(shelfKeep, { assetById: byId });
  ok(t1.startsWith('Spiky radial burst.'), 'the caption leads, whitespace collapsed');
  ok(t1.includes('layout radial.') && t1.includes('palette ember.'), 'layout + palette follow');
  ok(
    t1.indexOf('asset org_blob_01') === t1.lastIndexOf('asset org_blob_01'),
    'a cast member is named once, however often dealt',
  );
  eq(keepEmbedText(shelfKeep, { assetById: byId }), t1, 'the composition is deterministic');
  const ledgerKeep = { recipe: { layoutParams: { mode: 'grid' }, paletteId: 'ink', assets: ['org_leaf_01'] } };
  const t2 = keepEmbedText(ledgerKeep, { assetById: byId });
  ok(t2.includes('layout grid.') && t2.includes('palette ink.'), 'the ledger recipe shape reads the same way');
  eq(keepEmbedText({}, {}), '', 'an empty record embeds nothing');
  eq(keepEmbedText(null), '', 'no record, no text');
  const variantKeep = { recipe: { layoutParams: { mode: 'radial' }, assets: ['dvx-org_blob_01-1f'] } };
  const t3 = keepEmbedText(variantKeep, {
    assetById: byId,
    translateId: (id) => (id === 'dvx-org_blob_01-1f' ? 'org_blob_01' : id),
  });
  ok(t3.includes('asset org_blob_01'), 'a variant id reads at its lead parent when the caller translates it');
});

// ── pure core: capability record law ────────────────────────────────────────
suite('megamindEmbed record law', () => {
  const good = Object.freeze({
    endpoint: 'http://127.0.0.1:11434',
    model: 'embed-fixture',
    dims: 3,
    textProbeMs: 42,
    probeClean: true,
    imageEmbed: false,
    context: null,
    at: 1700000000000,
  });
  eq(checkEmbedRecord(good), good, 'a well-formed record stands');
  ok(semanticEnabled(good) === true, 'a clean probed record enables semantic search');
  ok(semanticEnabled(null) === false, 'no record: semantic search is off (the absent state)');
  ok(
    semanticEnabled({ ...good, probeClean: false }) === false,
    'a probe that answered off-script never enables the slot',
  );
  ok(semanticEnabled({ ...good, dims: 0 }) === false, 'a record with no measured dimension never enables the slot');
  ok(checkEmbedRecord({ ...good, dims: 'three' }) === null, 'a non-numeric dims fails closed');
  ok(checkEmbedRecord({ ...good, imageEmbed: 'yes' }) === null, 'a non-boolean imageEmbed fails closed');
  ok(checkEmbedRecord('embed-fixture') === null, 'a bare string is not a record');
  ok(checkEmbedRecord(null) === null, 'null is not a record');
  const shape = embedCapabilityShape(good);
  ok(
    shape && shape.tier === 'C' && shape.badges.includes('embeddings') && shape.probeMs === 42,
    'the record projects to the registry’s own shape — tier C, the earned badge, the probe’s numbers',
  );
  ok(embedCapabilityShape(null) === null, 'no record, no projection');
  ok(embedCapabilityShape({ ...good, dims: 0 }) === null, 'a malformed record projects nothing');
});

// ── pure core: the probe measures, never assumes ────────────────────────────
{
  let probeChecks = 0;
  const pok = (cond, msg) => {
    checks++;
    probeChecks++;
    if (!cond) throw new Error(`megamindEmbed probe check failed: ${msg}`);
  };
  const run = async () => {
    // embedding-ready: a timed text probe + an image probe that answers in the same dims.
    const fx = ollamaFixture({ models: [{ name: 'embed-fixture' }], embedFor: embedOk });
    const p1 = await probeEmbedModel(fx, 'http://127.0.0.1:11434', 'embed-fixture', { now, stamp });
    pok(p1.record && p1.record.dims === 3, 'a model that answers an embed probe measures ready');
    pok(p1.record.imageEmbed === true, 'an image probe answered in the same dims measures image embedding');
    pok(p1.record.probeClean === true && p1.record.model === 'embed-fixture', 'the record names its model');
    const probeCall = fx.embedCalls().find((c) => c.body.input === EMBED_PROBE_TEXT);
    pok(!!probeCall, 'the text probe embeds the probe text');
    pok(
      fx.embedCalls().some((c) => Array.isArray(c.body.images) && c.body.images[0] === EMBED_PROBE_IMAGE_B64),
      'the image probe sends the measured 1×1 still',
    );

    // present-not-embedding: the server answers the embed call with a refusal.
    const fx2 = ollamaFixture({ models: [{ name: 'not-embedder' }], embedFor: () => ({ status: 400 }) });
    const p2 = await probeEmbedModel(fx2, 'http://127.0.0.1:11434', 'not-embedder', { now, stamp });
    pok(!p2.ok && p2.gate === 'not-embedding', 'a model that refuses embeds measures not-embedding, no record');
    pok(embedErrorCopy('not-embedding').title.length > 0, 'the not-embedding gate has plain-words copy');

    // an answer that is off-script (200, garbage) is also not-embedding — measured, not assumed.
    const fx3 = ollamaFixture({ models: [{ name: 'weird' }], embedFor: () => ({ embeddings: [['a', 'b']] }) });
    const p3 = await probeEmbedModel(fx3, 'http://127.0.0.1:11434', 'weird', { now, stamp });
    pok(!p3.ok && p3.gate === 'not-embedding', 'a garbage embed reply measures not-embedding');

    // a text-only model: text probe answers, image probe refuses → imageEmbed measured false.
    const fx4 = ollamaFixture({
      models: [{ name: 'text-only' }],
      embedFor: (body) => (body.images ? { status: 400 } : embedOk(body)),
    });
    const p4 = await probeEmbedModel(fx4, 'http://127.0.0.1:11434', 'text-only', { now, stamp });
    pok(p4.record && p4.record.imageEmbed === false, 'an image refusal measures text-only — the slot still stands');

    // an image probe answering in DIFFERENT dimensions than the text probe: the record stands
    // on its text measurement, with stills support measured false — the text dims are no promise
    // about the image path, and the disagreement costs the slot nothing it measured honestly.
    const fxDims = ollamaFixture({
      models: [{ name: 'dims-differ' }],
      embedFor: (body) => (body.images ? { embeddings: [[0.5, 0.5]] } : embedOk(body)),
    });
    const pDims = await probeEmbedModel(fxDims, 'http://127.0.0.1:11434', 'dims-differ', { now, stamp });
    pok(
      pDims.record && pDims.record.dims === 3,
      'image dims differing from text: the record stands on the text measurement',
    );
    pok(pDims.record.imageEmbed === false, 'image dims differing from text: stills support is measured false');

    // a cloud pointer is refused before any fetch.
    const fx5 = ollamaFixture({ models: [], embedFor: embedOk });
    const p5 = await probeEmbedModel(fx5, 'http://127.0.0.1:11434', 'qwen3:cloud', { now, stamp });
    pok(!p5.ok && p5.gate === 'cloud', 'a cloud pointer is refused whole');
    pok(fx5.calls.length === 0, 'the cloud refusal happens before any network call');

    // a gone model keeps S1's gate; a dead server keeps unreachable.
    const fx6 = async () => jsonRes(404, { error: 'model not found' });
    const p6 = await probeEmbedModel(fx6, 'http://127.0.0.1:11434', 'ghost', { now, stamp });
    pok(!p6.ok && p6.gate === 'model-gone', 'a 404 on show reads model-gone, as S1 taught');
    const fx7 = async () => {
      throw new Error('connrefused');
    };
    const p7 = await probeEmbedModel(fx7, 'http://127.0.0.1:11434', 'embed-fixture', { now, stamp });
    pok(!p7.ok && p7.gate === 'unreachable', 'a dead server reads unreachable');

    // fetchEmbed resolves its gates (it never throws them).
    const body = buildEmbedBody('m', { input: ['x'] });
    const g1 = await fetchEmbed(async () => jsonRes(400, {}), 'http://127.0.0.1:11434', body);
    pok(g1.ok === false && g1.gate === 'not-embedding', 'fetchEmbed: an embed refusal gates not-embedding');
    const g2 = await fetchEmbed(async () => jsonRes(503, {}), 'http://127.0.0.1:11434', body);
    pok(g2.ok === false && g2.gate === 'http', 'fetchEmbed: another HTTP failure gates http');
    const g3 = await fetchEmbed(
      async () => {
        throw new Error('down');
      },
      'http://127.0.0.1:11434',
      body,
    );
    pok(g3.ok === false && g3.gate === 'unreachable', 'fetchEmbed: a throw gates unreachable');
    const g4 = await fetchEmbed(async () => jsonRes(200, { embeddings: [[0.5, 0.5]] }), 'http://127.0.0.1:11434', body);
    pok(g4.ok === true && g4.dims === 2 && g4.vectors.length === 1, 'fetchEmbed: a clean reply resolves its vectors');
    console.log(`megamindEmbed probe: ${probeChecks}/${probeChecks}`);
  };
  await run();
}

// ── pure core: cache keying + integrity ─────────────────────────────────────
suite('megamindEmbed cache law', () => {
  const h = 'a'.repeat(64);
  eq(
    embedCacheKey({ model: 'embed-fixture', textHash: h }),
    `embed-fixture::txt:${h}`,
    'a text key is model + kind + text hash',
  );
  eq(
    embedCacheKey({ model: 'embed-fixture', stillSha256: h }),
    `embed-fixture::img:${h}`,
    'a still key is model + kind + still hash',
  );
  ok(embedCacheKey({ model: 'embed-fixture', textHash: 'not-a-hash' }) === null, 'a malformed hash makes no key');
  ok(embedCacheKey({ model: '', textHash: h }) === null, 'no model, no key');
  ok(embedCacheKey({ model: 'embed-fixture' }) === null, 'no hash, no key');
  eq(
    embedCacheKey({ model: 'embed-fixture', textHash: sha('alpha') }),
    embedCacheKey({ model: 'embed-fixture', textHash: sha('alpha') }),
    'the same text keys the same',
  );
  ok(
    embedCacheKey({ model: 'embed-fixture', textHash: sha('alpha') }) !==
      embedCacheKey({ model: 'embed-fixture', textHash: sha('alpha ') }),
    'an edited text keys differently — never a stale serve',
  );
  ok(
    embedCacheKey({ model: 'embed-a', textHash: sha('alpha') }) !==
      embedCacheKey({ model: 'embed-b', textHash: sha('alpha') }),
    'a model swap keys differently — never a cross-model serve',
  );

  const entry = { vector: [0.1, 0.2, 0.3], dims: 3, text: 'alpha', at: 5 };
  eq(checkCacheEntry(entry), entry, 'a well-formed entry stands');
  ok(checkCacheEntry({ ...entry, dims: 5 }) === null, 'an entry whose dims lie about its vector is refused');
  ok(checkCacheEntry({ vector: [0.1], dims: 1 }) !== null, 'a short but honest entry stands');
  ok(checkCacheEntry({ vector: 'nope', dims: 1 }) === null, 'a non-vector entry is refused');
  const warnings = [];
  const entries = parseEmbedCache(
    JSON.stringify({ ['m::txt:' + h]: entry, ['m::txt:' + 'b'.repeat(64)]: { vector: [1], dims: 9 }, junk: 42 }),
    (m) => warnings.push(m),
  );
  eq(Object.keys(entries).length, 1, 'a corrupt cache entry is skipped, the good one kept');
  eq(warnings.length, 2, 'each skipped entry is reported as a warning, never silently trusted');
  eq(
    parseEmbedCache('not json', () => {}),
    {},
    'an unparseable cache reads empty',
  );
  eq(EMBED_CACHE_FILE, 'embeddings.json', 'the export file the run tool reads');
});

// ── ACCEPTANCE FIXTURE: recorded keeps, human-judged neighbours ─────────────
// Recorded sample (see the header): vectors are a real-model stand-in; the JUDGED orderings are
// the human judgment this build's acceptance names. Computed neighbours must agree.
suite('megamindEmbed acceptance fixture', () => {
  const FIXTURE = [
    { id: 'spiky-1', vector: [0.96, 0.1, 0.05] },
    { id: 'spiky-2', vector: [0.92, 0.18, 0.02] },
    { id: 'spiky-3', vector: [0.88, 0.05, 0.22] },
    { id: 'calm-1', vector: [0.08, 0.95, 0.1] },
    { id: 'calm-2', vector: [0.15, 0.9, 0.05] },
    { id: 'wall-1', vector: [0.05, 0.12, 0.94] },
  ];
  const JUDGED = {
    'spiky-1': ['spiky-2', 'spiky-3'], // the two nearest, in order
    query: ['spiky-1', 'spiky-2'], // "find the spiky ones" from a fresh query vector
  };
  const fixtureKeep = FIXTURE[0];
  const others = FIXTURE.filter((e) => e.id !== fixtureKeep.id);
  const computed = nearestNeighbours(fixtureKeep.vector, others);
  eq(
    computed.slice(0, 2).map((h) => h.id),
    JUDGED['spiky-1'],
    'the fixture keep’s computed neighbours agree with the human-judged order (top 2, exact)',
  );
  const rankedIds = computed.map((h) => h.id);
  ok(
    rankedIds.indexOf('spiky-3') < rankedIds.indexOf('calm-1') &&
      rankedIds.indexOf('spiky-3') < rankedIds.indexOf('calm-2') &&
      rankedIds.indexOf('spiky-3') < rankedIds.indexOf('wall-1'),
    'every spiky keep ranks before any calm or wall keep',
  );
  const spikyQuery = [0.97, 0.05, 0.02];
  eq(
    nearestNeighbours(spikyQuery, FIXTURE)
      .slice(0, 2)
      .map((h) => h.id),
    JUDGED.query,
    'a spiky query finds the spiky keeps first, in the judged order',
  );
  for (const e of FIXTURE.filter((x) => x.id.startsWith('spiky'))) {
    const top = nearestNeighbours(
      e.vector,
      FIXTURE.filter((x) => x.id !== e.id),
    )[0];
    ok(top.id.startsWith('spiky'), `cluster coherence: ${e.id}’s nearest neighbour is a spiky keep (${top.id})`);
  }
});

// ── the live driver: slot states, cache, degradation ────────────────────────
{
  let dChecks = 0;
  const dok = (cond, msg) => {
    checks++;
    dChecks++;
    if (!cond) throw new Error(`megamindEmbed driver check failed: ${msg}`);
  };
  const deq = (a, b, msg) =>
    dok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
  const hashText = async (t) => sha(t);
  const hashBytes = async (b) => createHash('sha256').update(Buffer.from(b)).digest('hex');
  const mkDriver = (fetchImpl, storage) => createEmbedDriver({ fetchImpl, storage, now, stamp, hashText, hashBytes });

  const run = async () => {
    // ABSENT + silent degradation: no slot probed → search is a no-op and nothing is fetched.
    const fxAbsent = ollamaFixture({ models: [{ name: 'embed-fixture' }], embedFor: embedOk });
    const dAbsent = mkDriver(fxAbsent, memStorage());
    dok(dAbsent.view().record === null, 'absent state: no record before any probe');
    const s0 = await dAbsent.searchText('spiky', { keeps: [], assets: [] });
    dok(
      s0 === null && fxAbsent.calls.length === 0,
      'absent state: search returns null and fetches nothing — silently off',
    );
    dok(
      (await dAbsent.embedStill(new Uint8Array([1, 2, 3]))) === null,
      'absent state: a still embed returns null, no fake vector',
    );

    // A saved slot choice is shown as saved, never as measured.
    const dSaved = mkDriver(
      fxAbsent,
      memStorage({ [EMBED_SLOT_KEY]: JSON.stringify({ endpoint: 'http://127.0.0.1:11434', model: 'embed-fixture' }) }),
    );
    dok(
      dSaved.view().saved && dSaved.view().saved.model === 'embed-fixture' && dSaved.view().record === null,
      'a saved choice restores as saved-not-probed — the record waits for a press',
    );

    // PRESENT-NOT-EMBEDDING, then EMBEDDING-READY on the same driver (the panel's real flow).
    const storage = memStorage();
    const fx = ollamaFixture({ models: [{ name: 'not-embedder' }, { name: 'embed-fixture' }], embedFor: embedByModel });
    const d = mkDriver(fx, storage);
    await d.connect('http://127.0.0.1:11434');
    dok(
      d.view().record === null &&
        d.view().error &&
        d.view().error.title.includes('did not answer as an embedding model'),
      'present-not-embedding: the first model refuses, the slot reports it plainly',
    );
    deq(
      d.view().models.map((m) => m.name),
      ['not-embedder', 'embed-fixture'],
      'the slot lists the same Ollama inventory',
    );
    await d.changeModel('embed-fixture');
    dok(
      d.view().record && d.view().record.model === 'embed-fixture' && d.view().record.dims === 3,
      'embedding-ready: the measured record stands',
    );
    dok(d.view().record.imageEmbed === true, 'embedding-ready: the image probe measured true on this fixture');
    dok(semanticEnabled(d.view().record) === true, 'embedding-ready: semantic search is enabled by the record');
    dok(d.view().error === null, 'a clean probe clears the error box');

    // Search over keeps + library, ranked; the cache observed through the public surface:
    // every text is fetched once per model, an edit fetches fresh, a repeat fetches nothing.
    const keepA = {
      seed: 11,
      caption: 'spiky radial burst',
      config: { layout: { mode: 'radial' }, palette: { id: 'ember' }, assets: [] },
    };
    const keepB = {
      seed: 12,
      caption: 'spiky exploding ring',
      config: { layout: { mode: 'swarm' }, palette: { id: 'ember' }, assets: [] },
    };
    const keepC = {
      seed: 13,
      caption: 'calm grid order',
      config: { layout: { mode: 'grid' }, palette: { id: 'ink' }, assets: [] },
    };
    const assetSpiky = { id: 'zz-spike', category: 'marks', tags: ['spiky', 'pointed'], weight: 0.8, density: 0.6 };
    const assetWall = { id: 'zz-block', category: 'fields', tags: ['wall', 'dense'], weight: 0.5, density: 0.9 };
    const corpus = { keeps: [keepC, keepA, keepB], assets: [assetWall, assetSpiky] };
    const embedInputs = (fx) =>
      fx.embedCalls().flatMap((c) => (Array.isArray(c.body.input) ? c.body.input : [c.body.input]));
    const found = await d.searchText('spiky ones', corpus);
    dok(found && found.keeps.length === 3, 'search ranks every embedded keep');
    deq(
      found.keeps.map((h) => h.record.seed),
      [11, 12, 13],
      'search order: the spiky keeps lead, the calm grid trails',
    );
    dok(found.assets[0].asset.id === 'zz-spike', 'search ranks the library too — the spiky asset leads');
    const keepAText = keepEmbedText(keepA, {});
    dok(embedInputs(fx).filter((t) => t === keepAText).length === 1, 'a corpus text is fetched exactly once');
    dok(d.view().cacheCount >= 5, 'the cache count is visible in the view (query + keeps + assets)');
    const callsWarm = fx.embedCalls().length;
    await d.searchText('spiky ones', corpus);
    dok(
      fx.embedCalls().length === callsWarm,
      'an identical repeat search is served entirely from cache — no embed call',
    );
    await d.searchText('spiky ones, edited', corpus);
    dok(
      fx.embedCalls().length === callsWarm + 1,
      'an edited search text fetches fresh (one batched call) — never a stale vector',
    );
    dok(
      embedInputs(fx).filter((t) => t === keepAText).length === 1,
      'the edit re-fetched only itself — the corpus stayed cached',
    );
    const like = await d.moreLikeKeep(keepA, [keepA, keepB, keepC], { assets: [] });
    dok(like && like.keeps[0].record.seed === 12, 'more-like-this: the nearest OTHER keep leads');
    dok(!like.keeps.some((h) => h.record.seed === 11), 'more-like-this never returns the keep itself');

    // A variant-cast keep: the panel embeds its text with the miner's translation (variant →
    // lead parent, from the keep's own provenance — miner.mjs, mirroring featuresOfKeep), so
    // the exported cache key IS the key the miner computes for the same keep, and the vector
    // resolves when the run tool looks it up. The untranslated text's key must NOT travel.
    // The corpus below carries the keep's cast assets — the only lookups its text reads; a
    // full-library press would flood the soft-capped cache and evict the very entry under
    // test (the cap working as designed, not the key law under test).
    const byIdAssets = new Map(ASSETS.map((a) => [a.id, a]));
    const variantRecipe = { parents: ['org_blob_01'], op: 'jitter', seed: 3, params: { amount: 1.5 } };
    const variantKeep = {
      seed: 21,
      caption: 'variant burst child',
      config: {
        layout: { mode: 'radial' },
        palette: { id: 'ember' },
        assets: [variantIdFor(variantRecipe), 'org_petal_01'],
      },
      provenance: { variants: [variantRecipe] },
    };
    const minerRecipes = new Map(variantKeep.provenance.variants.map((r) => [variantIdFor(r), r]));
    const minerText = keepEmbedText(variantKeep, {
      assetById: byIdAssets,
      translateId: (id) => minerRecipes.get(id)?.parents?.[0] ?? id,
    });
    const rawText = keepEmbedText(variantKeep, { assetById: byIdAssets });
    dok(
      minerText !== rawText && minerText.includes('asset org_blob_01'),
      'variant keep setup: the miner’s text names the lead parent, the raw text the variant',
    );
    const vFound = await d.searchText('spiky ones', {
      keeps: [variantKeep],
      assets: [byIdAssets.get('org_blob_01'), byIdAssets.get('org_petal_01')],
    });
    dok(vFound && vFound.keeps.length === 1, 'variant-cast keep: the panel embeds and ranks it');
    const exportedV = d.exportData();
    dok(
      exportedV.vectorsByTextHash[sha(minerText)] !== undefined,
      'variant-cast keep: the panel-exported cache key is the miner’s key for the same keep',
    );
    dok(
      exportedV.vectorsByTextHash[sha(rawText)] === undefined,
      'variant-cast keep: the untranslated text’s key is NOT exported — it would never resolve in the run tool',
    );
    const vRun = runMiner({
      runSeed: 0x1506,
      batchSize: 24,
      finalistCount: 6,
      keeps: [variantKeep],
      embeddings: exportedV,
    });
    dok(
      vRun.report.semantic && vRun.report.semantic.keepsEmbedded === 1,
      'variant-cast keep: handed the panel export, the miner resolves the keep’s vector',
    );

    // A different model over the same machine cache re-fetches: keys are per-model, so no vector
    // is ever served across a swap — and the first model's entries survive for its own return.
    const cacheOnly = memStorage({ [EMBED_CACHE_KEY]: storage._map.get(EMBED_CACHE_KEY) });
    const fxOther = ollamaFixture({ models: [{ name: 'embed-other' }], embedFor: embedOk });
    const dOther = mkDriver(fxOther, cacheOnly);
    await dOther.connect('http://127.0.0.1:11434');
    await dOther.searchText('spiky ones', { keeps: [keepA], assets: [] });
    dok(
      embedInputs(fxOther).filter((t) => t === keepAText).length === 1,
      'the other model fetched the same text for itself — no cross-model serve',
    );
    const callsBack = fx.embedCalls().length;
    await d.searchText('spiky ones', corpus);
    dok(
      fx.embedCalls().length === callsBack,
      'back on the first model, its cache still serves — the swap clobbered nothing',
    );

    // Stills: measured-true slot embeds a still once, keyed by the still's own hash.
    const still = new Uint8Array([9, 8, 7, 6]);
    const sv = await d.embedStill(still);
    dok(sv && sv.length === 3, 'a still embeds when the record measured image support');
    const stillCalls = fx.embedCalls().length;
    await d.embedStill(still);
    dok(fx.embedCalls().length === stillCalls, 'the same still is served from cache — keyed by its hash');
    const exported = d.exportData();
    dok(
      exported && exported.model === 'embed-fixture' && Object.keys(exported.vectorsByTextHash).length >= 3,
      'the export carries the slot model’s text vectors for the run tool',
    );
    dok(
      Object.keys(exported.vectorsByTextHash).every((h) => /^[0-9a-f]{64}$/.test(h)),
      'export keys are bare text hashes (the miner’s lookup shape)',
    );

    // Text-only slot: stills refuse honestly.
    const fxTextOnly = ollamaFixture({
      models: [{ name: 'text-only' }],
      embedFor: (body) => (body.images ? { status: 400 } : embedOk(body)),
    });
    const dText = mkDriver(fxTextOnly, memStorage());
    await dText.connect('http://127.0.0.1:11434');
    dok(dText.view().record && dText.view().record.imageEmbed === false, 'text-only slot: the record says so');
    const imgCalls = fxTextOnly.embedCalls().length;
    dok(
      (await dText.embedStill(still)) === null,
      'text-only slot: a still embed returns null — never faked from a text model',
    );
    dok(fxTextOnly.embedCalls().length === imgCalls, 'text-only slot: no image call is even attempted');

    // Dims that SHIFT after the probe — the model measured a clean 3 at connect, then starts
    // answering in 2: search ranks nothing and says so, a still embed returns null. Nothing
    // throws, and no wrong-shaped vector is ever served as the measured model's own.
    let shiftCalls = 0;
    const fxShift = ollamaFixture({
      models: [{ name: 'embed-shifter' }],
      embedFor: (body) => {
        shiftCalls++;
        if (shiftCalls <= 2) return embedOk(body); // the probe's own text + image calls
        const inputs = body.images ? [''] : Array.isArray(body.input) ? body.input : [body.input];
        return { embeddings: inputs.map(() => [0.5, 0.5]) };
      },
    });
    const dShift = mkDriver(fxShift, memStorage());
    await dShift.connect('http://127.0.0.1:11434');
    dok(
      dShift.view().record && dShift.view().record.dims === 3 && dShift.view().record.imageEmbed === true,
      'shifted dims setup: the probe measured a clean 3-dim slot with stills',
    );
    const shifted = await dShift.searchText('spiky ones', { keeps: [keepA], assets: [] });
    dok(
      shifted === null && dShift.view().search === null,
      'shifted dims: search returns the honest no-vector outcome — nothing ranked, no throw',
    );
    dok(
      dShift.view().message && dShift.view().message.includes('no vector'),
      'shifted dims: the view says plainly that no vector came back',
    );
    dok(
      (await dShift.embedStill(new Uint8Array([5, 4, 3]))) === null,
      'shifted dims: a still embed returns null, never a wrong-shaped vector',
    );

    // Cloud pointer in the slot: refused before any fetch, record cleared.
    const fxCloud = ollamaFixture({
      models: [{ name: 'embed-fixture' }, { name: 'someone:cloud' }],
      embedFor: embedOk,
    });
    const dCloud = mkDriver(fxCloud, memStorage());
    await dCloud.connect('http://127.0.0.1:11434');
    dok(dCloud.view().record !== null, 'cloud flow setup: the local model probed ready first');
    const cloudCalls = fxCloud.calls.length;
    await dCloud.changeModel('someone:cloud');
    dok(
      dCloud.view().error && dCloud.view().error.title.includes('cloud pointer'),
      'a cloud pointer in the slot is refused whole, in plain words',
    );
    dok(fxCloud.calls.length === cloudCalls, 'the slot’s cloud refusal fetches nothing');

    // Corrupt cache entries: skipped with a warning at load, never served.
    const goodText = 'warm cached text';
    const goodKey = embedCacheKey({ model: 'embed-fixture', textHash: sha(goodText) });
    const seeded = memStorage({
      [EMBED_CACHE_KEY]: JSON.stringify({
        [goodKey]: { vector: [0.96, 0.1, 0.05], dims: 3, text: goodText, at: 1 },
        'embed-fixture::txt:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': {
          vector: [1, 0],
          dims: 7,
          text: 'liar',
          at: 1,
        },
      }),
    });
    const fxSeed = ollamaFixture({ models: [{ name: 'embed-fixture' }], embedFor: embedOk });
    const dSeed = mkDriver(fxSeed, seeded);
    await dSeed.connect('http://127.0.0.1:11434');
    dok(dSeed.view().cacheCount === 1, 'the dims-lying entry was dropped at load, not counted, not served');
    const probeCallCount = fxSeed.embedCalls().length;
    const seedFound = await dSeed.searchText(goodText, { keeps: [keepA], assets: [] });
    const postProbeInputs = fxSeed
      .embedCalls()
      .slice(probeCallCount)
      .flatMap((c) => (Array.isArray(c.body.input) ? c.body.input : [c.body.input]));
    dok(seedFound !== null, 'the seeded driver searches');
    dok(!postProbeInputs.includes(goodText), 'a warm honest cache entry serves the query — it is never re-fetched');
    dok(postProbeInputs.includes(keepAText), 'the uncached keep text fetches normally beside it');

    // #2154 (H2): a search superseded mid-flight publishes nothing. The gate parks every embed
    // call; both presses start under the first model, the slot moves to the second model while
    // they are parked, then the gate opens — the stale presses must land nowhere.
    let releaseEmbeds = null;
    const fxBase = ollamaFixture({ models: [{ name: 'embed-a' }, { name: 'embed-b' }], embedFor: embedOk });
    const fxSlow = async (url, init = {}) => {
      if (new URL(url).pathname === '/api/embed' && releaseEmbeds) await releaseEmbeds;
      return fxBase(url, init);
    };
    const dSlow = mkDriver(fxSlow, memStorage());
    await dSlow.connect('http://127.0.0.1:11434');
    dok(
      dSlow.view().record && dSlow.view().record.model === 'embed-a',
      'stale search setup: the first model stands ready',
    );
    let openGate;
    releaseEmbeds = new Promise((r) => (openGate = r));
    const staleSearch = dSlow.searchText('spiky ones', corpus);
    const staleLike = dSlow.moreLikeKeep(keepA, [keepA, keepB, keepC], { assets: [] });
    await new Promise((r) => setTimeout(r, 10)); // both presses are parked on the gate
    const moved = dSlow.changeModel('embed-b'); // the generation moves now, synchronously
    openGate();
    releaseEmbeds = null;
    dok((await moved) === true && dSlow.view().record.model === 'embed-b', 'the slot moved mid-search');
    dok((await staleSearch) === null, 'stale search: the superseded press returns nothing');
    dok((await staleLike) === null, 'stale more-like-this: the superseded press returns nothing');
    dok(dSlow.view().search === null, 'stale results never published into the new model’s view');
    dok(dSlow.view().busy === null, 'the superseded presses leave no busy flag behind');

    // #2154 (H2), the failure note: the gated note in embedTexts is a publish too. The stub
    // refuses any batch carrying the poisoned keep's text, so the parked press's batch FAILS
    // under the gate; the slot moves mid-flight, then the gate opens — the superseded model's
    // "got no vector" note must land nowhere, exactly like its results.
    let releaseFail = null;
    const fxFailBase = ollamaFixture({
      models: [{ name: 'embed-a' }, { name: 'embed-b' }],
      embedFor: (body) => {
        const inputs = body.images ? [] : Array.isArray(body.input) ? body.input : [body.input];
        if (inputs.some((t) => String(t).includes('unembeddable'))) return { status: 400 };
        return embedOk(body);
      },
    });
    const fxFail = async (url, init = {}) => {
      if (new URL(url).pathname === '/api/embed' && releaseFail) await releaseFail;
      return fxFailBase(url, init);
    };
    const dFail = mkDriver(fxFail, memStorage());
    await dFail.connect('http://127.0.0.1:11434');
    dok(
      dFail.view().record && dFail.view().record.model === 'embed-a',
      'stale failure-note setup: the first model stands ready',
    );
    const keepPoison = {
      seed: 14,
      caption: 'unembeddable glyph burst',
      config: { layout: { mode: 'radial' }, palette: { id: 'ember' }, assets: [] },
    };
    let openFailGate;
    releaseFail = new Promise((r) => (openFailGate = r));
    const staleFailSearch = dFail.searchText('spiky ones', { keeps: [keepPoison], assets: [] });
    await new Promise((r) => setTimeout(r, 10)); // the failing press is parked on the gate
    const movedFail = dFail.changeModel('embed-b'); // the generation moves now, synchronously
    openFailGate();
    releaseFail = null;
    dok(
      (await movedFail) === true && dFail.view().record.model === 'embed-b',
      'the slot moved under the failing press',
    );
    dok((await staleFailSearch) === null, 'the superseded failing press returns nothing');
    dok(
      dFail.view().message === null,
      'stale failure note: a superseded press’s "got no vector" never reaches the new model’s view',
    );

    // Shelf keeps read tolerantly.
    deq(readShelfKeeps(memStorage({ 'kc:keeps:v1': JSON.stringify([keepA, keepB]) })).length, 2, 'shelf keeps read');
    deq(readShelfKeeps(memStorage({ 'kc:keeps:v1': 'garbage' })), [], 'a corrupt shelf reads empty, never throws');
    deq(readShelfKeeps(null), [], 'no storage, no keeps');

    console.log(`megamindEmbed driver: ${dChecks}/${dChecks}`);
  };
  await run();
}

// ── the miner axis: dual-axis report + identity without vectors ─────────────
{
  let mChecks = 0;
  const mok = (cond, msg) => {
    checks++;
    mChecks++;
    if (!cond) throw new Error(`megamindEmbed miner check failed: ${msg}`);
  };
  const meq = (a, b, msg) =>
    mok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
  const byId = new Map(ASSETS.map((a) => [a.id, a]));

  // The blend, unit-precise: feature-near/semantic-far vs feature-far/semantic-near.
  const F = (over = {}) => ({
    system: 'radial',
    palette: 'ember',
    cast: ['org_blob_01'],
    castCategories: ['organic'],
    num: { count: 100, density: 50 },
    ...over,
  });
  const keepFeatures = [F()];
  const candA = { features: F(), sample: { index: 0 } }; // feature novelty 0, semantic far
  const candB = { features: F({ num: { count: 100.5, density: 50 } }), sample: { index: 1 } }; // feature novelty ε (< 0.25), semantic 0
  const vecOf = new Map([
    [candA, [1, 0]],
    [candB, [0, 1]],
  ]);
  const semantic = { vectorOf: (c) => vecOf.get(c) ?? null, keepVectors: [[0, 1]] };
  const plainPick = selectFinalists([candA, candB], keepFeatures, { finalistCount: 1 }).finalists[0];
  mok(plainPick === candB, 'features alone: the slightly-novel candidate wins (novelty ε beats 0)');
  const blendedPick = selectFinalists([candA, candB], keepFeatures, { finalistCount: 1, semantic }).finalists[0];
  mok(blendedPick === candA, 'with the axis: 0 + 0.5×0.5 beats ε + 0.5×0 — the blend flips the pick by the formula');
  meq(blendedPick.semanticAxes, { feature: 0, semantic: 0.5 }, 'the pick carries both axis components, side by side');
  const noVecPick = selectFinalists([candA, candB], keepFeatures, {
    finalistCount: 1,
    semantic: { vectorOf: () => null, keepVectors: [null] },
  }).finalists[0];
  mok(
    noVecPick === candB && noVecPick.semanticAxes.semantic === null,
    'vectors absent on both sides: the pick is the feature pick, the axis reads null',
  );

  // Full runs: identity when the cache resolves nothing; dual-axis shape when it resolves.
  const KEEPS = [
    {
      seed: 101,
      caption: 'spiky radial burst',
      config: { layout: { mode: 'radial' }, palette: { id: 'ember' }, assets: ['org_blob_01', 'org_petal_01'] },
    },
    {
      seed: 102,
      caption: 'calm grid order',
      config: { layout: { mode: 'grid' }, palette: { id: 'ink' }, assets: ['org_leaf_01', 'org_leaf_02'] },
    },
  ];
  const baseArgs = { runSeed: 0x1506, batchSize: 24, finalistCount: 6, keeps: KEEPS };
  const base = runMiner(baseArgs);
  const baseIdx = base.finalists.map((f) => f.sample.index);
  mok(!('semantic' in base.report), 'the plain run’s report has no semantic key — the E2 report, unchanged');
  mok(!base.runId.includes('-emb'), 'the plain run keeps the E2 run id');

  const offNull = runMiner({ ...baseArgs, embeddings: null });
  meq(
    offNull.finalists.map((f) => f.sample.index),
    baseIdx,
    'embeddings null: identical finalists',
  );
  const offEmpty = runMiner({ ...baseArgs, embeddings: { model: 'embed-fixture', vectorsByTextHash: {} } });
  meq(
    offEmpty.finalists.map((f) => f.sample.index),
    baseIdx,
    'an EMPTY cache: identical finalists (the on-fixture identity proof)',
  );
  mok(
    offEmpty.report.semantic && offEmpty.report.semantic.candidatesEmbedded === 0,
    'an empty cache reports the axis honestly: 0 vectors resolved',
  );
  mok(
    offEmpty.report.semantic.finalists.every((r) => r.semantic === null),
    'an empty cache: every pick’s semantic component is null',
  );
  mok(
    formatMinerReport(offEmpty).includes('SEMANTIC AXIS'),
    'an offered axis prints its section even at zero resolution',
  );
  const offAlien = runMiner({
    ...baseArgs,
    embeddings: { model: 'embed-fixture', vectorsByTextHash: { [sha('a text this run never speaks')]: [1, 0, 0] } },
  });
  meq(
    offAlien.finalists.map((f) => f.sample.index),
    baseIdx,
    'a cache of unrelated texts: identical finalists',
  );
  const offShape = runMiner({ ...baseArgs, embeddings: { model: 'embed-fixture' } });
  meq(
    offShape.finalists.map((f) => f.sample.index),
    baseIdx,
    'a malformed cache hand-in is not an axis at all: identical finalists',
  );
  mok(!('semantic' in offShape.report), 'a malformed cache hand-in leaves no report key');

  // Aligned cache: every baked candidate + keep text gets a vector by its content.
  const vectorsByTextHash = {};
  const put = (text) => {
    if (text) vectorsByTextHash[sha(text)] = vecForText(text);
  };
  for (const c of base.baked) put(keepEmbedText(c.record, { assetById: byId }));
  for (const k of KEEPS) put(keepEmbedText(k, { assetById: byId }));
  const aligned = { model: 'embed-fixture', vectorsByTextHash };
  const on1 = runMiner({ ...baseArgs, embeddings: aligned });
  const on2 = runMiner({ ...baseArgs, embeddings: aligned });
  mok(
    on1.report.semantic && on1.report.semantic.model === 'embed-fixture',
    'aligned cache: the report names the axis’s model',
  );
  mok(on1.report.semantic.weight === SEMANTIC_NOVELTY_WEIGHT, 'aligned cache: the report names the blend weight');
  mok(on1.report.semantic.candidatesEmbedded === base.baked.length, 'aligned cache: every candidate resolved a vector');
  mok(on1.report.semantic.keepsEmbedded === 2, 'aligned cache: both keeps resolved vectors');
  mok(
    typeof on1.report.semantic.spreadSemantic === 'number',
    'aligned cache: the semantic spread is a number beside the feature spread',
  );
  meq(
    on1.report.semantic.finalists.map((r) => r.index),
    on1.finalists.map((f) => f.sample.index),
    'the dual-axis rows are the finalists, in order',
  );
  mok(
    on1.report.semantic.finalists.every((r) => typeof r.feature === 'number'),
    'every finalist row carries its feature component',
  );
  meq(
    on2.finalists.map((f) => f.sample.index),
    on1.finalists.map((f) => f.sample.index),
    'the axis is deterministic: same cache, same picks, twice',
  );
  meq(on2.report.semantic, on1.report.semantic, 'the axis report is deterministic too');
  mok(on1.runId.endsWith('-emb'), 'an embeddings run names the axis in its run id');
  const text = formatMinerReport(on1);
  mok(text.includes('SEMANTIC AXIS (#1528, model embed-fixture)'), 'the printed report shows the semantic axis header');
  mok(text.includes('feature') && text.includes('semantic'), 'the printed report shows both axes side by side');
  mok(
    on1.finalists.every((f) => !f.embedding || (f.embedding.model === 'embed-fixture' && f.embedding.dims === 3)),
    'resolved candidates carry their vector under its model in the run data',
  );
  mok(
    on1.baked.some((c) => c.embedding),
    'the run data carries vectors (candidates.json’s material)',
  );

  console.log(`megamindEmbed miner: ${mChecks}/${mChecks}`);
}

console.log(`megamindEmbed: ${checks}/${checks} checks passed`);
