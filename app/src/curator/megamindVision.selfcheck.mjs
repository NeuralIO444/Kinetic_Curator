// #1527 MegaMind S3 — LOIS vision: the fixed verdict schema + KC-1's gates over the readings, the
// render-judging and stage-description asks (image on the user message, House pins, language pinned),
// the capability gates (vision badge + tier B for judging; badge for describing; cloud refused), the
// separate judge ledger (T2 stamps, still-hash binding, never a taste label), and the live driver
// against a fixture Ollama — deliberate presses only, one re-ask on a discarded reply, honest
// no-frame state. No network, no real model, no real canvas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  JUDGE_LEDGER_KEY,
  VISION_JUDGE_ID,
  buildRenderJudgeRequest,
  buildStageDescribeRequest,
  isJudgeLedgerRow,
  parseJudgeLedger,
  sanitizeReadings,
  serializeJudgeRow,
  tasteStamps,
  validateStageDescription,
  validateVisionVerdict,
  visionLedgerRow,
  visionVerdictFromReadings,
} from './megamindVision.mjs';
import {
  createVisionDriver,
  getStageFrameProvider,
  judgeLedgerCount,
  readJudgeLedgerText,
  setStageFrameProvider,
  sha256Hex,
  visionSurfaceOn,
} from './megamindVisionLive.js';
import { consumerById, consumerEnabled, setCapabilities } from '../composition/capabilityRegistry.mjs';
import { isLedgerRow, parseLedger } from './tasteLedger.js';
import { HOUSE_KEEP_ALIVE, HOUSE_NUM_CTX } from './megamindLink.mjs';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────
const rec = (over = {}) => ({
  endpoint: 'http://127.0.0.1:11434',
  model: 'qwen3-vl:8b-instruct',
  tier: 'B',
  badges: ['vision'],
  context: 131072,
  thinking: 'controllable',
  probeMs: 5000,
  probeClean: true,
  at: 1000,
  ...over,
});
const GOOD_READINGS = { presence: 'balanced', contrast: 'strong', exposure: 'even', promise: 'kept' };
const goodReply = JSON.stringify({ ...GOOD_READINGS, line: 'the one with air in it.' });
const descReply = JSON.stringify({
  description: 'A dark field of pale triangles and rings, loosely packed, bright at the centre.',
});

/** A scripted Ollama: replies dequeued per call; bodies recorded. */
const fakeOllama = (script) => {
  const bodies = [];
  const queue = [...script];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    const content = queue.length ? queue.shift() : '';
    if (content instanceof Error) throw content;
    return { ok: true, status: 200, json: async () => ({ message: { content } }) };
  };
  return { fetchImpl, bodies };
};
const memStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
};
const fakePrep = async (bytes, mime) => ({
  base64: 'QUJD',
  width: 100,
  height: 70,
  format: 'png',
  downscaled: false,
  rasterized: mime === 'image/svg+xml',
});
const stillBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
const card = (over = {}) => ({
  key: 'run-x:0:7',
  kind: 'render',
  bytes: stillBytes,
  mime: 'image/png',
  seed: 7,
  runId: 'xpl-1506-240-12',
  record: {
    seed: 7,
    config: { layout: { mode: 'grid', density: 60 }, palette: { id: 'hydra' }, assets: ['a', 'b'] },
    provenance: { source: 'explorer', run: 'xpl-1506-240-12', corner: 'wilderness' },
  },
  fingerprint: 'bake-fp-1',
  expectedSha256: null,
  facts: { layout: 'grid', paletteId: 'hydra', castSize: 2, density: 'high', variant: false },
  ...over,
});

// ── the gates over the readings ──────────────────────────────────────────────────────────────────────
await ok('the verdict is computed by the gates, never taken from the model', () => {
  assert.equal(visionVerdictFromReadings(GOOD_READINGS), 'keep');
  assert.equal(
    visionVerdictFromReadings({ ...GOOD_READINGS, presence: 'sparse', contrast: 'present', promise: 'na' }),
    'keep',
  );
  for (const bad of [
    { presence: 'empty' },
    { presence: 'wall' },
    { contrast: 'flat' },
    { exposure: 'crushed' },
    { exposure: 'blown' },
    { promise: 'broken' },
  ])
    assert.equal(visionVerdictFromReadings({ ...GOOD_READINGS, ...bad }), 'pass', JSON.stringify(bad));
});

await ok('validateVisionVerdict: schema-bound, English-only, discardable', () => {
  const v = validateVisionVerdict({ ...GOOD_READINGS, line: 'holds its air.' });
  assert.equal(v.judge, VISION_JUDGE_ID);
  assert.equal(v.verdict, 'keep');
  assert.deepEqual(v.readings, GOOD_READINGS);
  assert.equal(
    validateVisionVerdict({ ...GOOD_READINGS, presence: 'lots' }),
    null,
    'an off-schema word voids the reply',
  );
  assert.equal(
    validateVisionVerdict({ ...GOOD_READINGS, contrast: undefined }),
    null,
    'a missing reading voids the reply',
  );
  assert.equal(validateVisionVerdict({ ...GOOD_READINGS, line: '中文線' }), null, 'a CJK line is drift — discarded');
  assert.equal(
    validateVisionVerdict({ ...GOOD_READINGS, line: 'x'.repeat(200) }),
    null,
    'an overlong line voids the reply',
  );
  assert.equal(validateVisionVerdict('keep'), null);
  assert.equal(validateVisionVerdict(null), null);
  assert.equal(
    sanitizeReadings({ presence: 'sparse', contrast: 'flat', exposure: 'even', promise: 'na' }).presence,
    'sparse',
  );
});

await ok('validateStageDescription: bounded, English, non-empty', () => {
  assert.equal(validateStageDescription({ description: 'Triangles on black.' }).description, 'Triangles on black.');
  assert.equal(validateStageDescription({ description: '中文描述' }), null);
  assert.equal(validateStageDescription({ description: '   ' }), null);
  assert.equal(validateStageDescription({}), null);
});

// ── the asks ─────────────────────────────────────────────────────────────────────────────────────────
await ok('the judge ask carries the image, the promise facts, and no rules verdict', () => {
  const msgs = buildRenderJudgeRequest({
    facts: { layout: 'grid', paletteId: 'hydra', castSize: 4, density: 'high', variant: false },
    imageBase64: 'QUJD',
  });
  assert.deepEqual(msgs[1].images, ['QUJD'], 'the image rides the user message');
  assert.ok(msgs[0].content.includes('English only'), 'the language is pinned');
  assert.ok(msgs[1].content.includes('density "high"'), 'the promise the readings are judged against is stated');
  assert.ok(!JSON.stringify(msgs).includes('lois-render'), 'the E4 rules verdict is never shown — independent eyes');
  const low = buildRenderJudgeRequest({ facts: { density: 'low' }, imageBase64: 'QUJD' });
  assert.ok(low[1].content.includes('density "low"'));
  const none = buildRenderJudgeRequest({ facts: { density: null }, imageBase64: 'QUJD' });
  assert.ok(none[1].content.includes('promise "na"'), 'no density fact reads as no promise, honestly');
  const variant = buildRenderJudgeRequest({ facts: { variant: true }, imageBase64: 'QUJD' });
  assert.ok(variant[1].content.includes('variant offspring'), 'a variant still is asked as a pre-judgement');
  const desc = buildStageDescribeRequest({ imageBase64: 'QUJD' });
  assert.deepEqual(desc[1].images, ['QUJD']);
  assert.ok(desc[0].content.includes('English only'));
});

// ── the capability gates ─────────────────────────────────────────────────────────────────────────────
await ok('gates: judging needs vision + tier B; describing needs the badge; cloud enables neither', () => {
  assert.equal(consumerEnabled(rec(), consumerById('lois.vision')), true);
  assert.equal(
    consumerEnabled(rec({ tier: 'C', probeMs: 30000, probeClean: false }), consumerById('lois.vision')),
    false,
    'tier C cannot judge renders',
  );
  assert.equal(
    consumerEnabled(rec({ tier: 'C', probeMs: 30000, probeClean: false }), consumerById('stage.describe')),
    true,
    'describing is badge-only',
  );
  assert.equal(consumerEnabled(rec({ badges: [] }), consumerById('stage.describe')), false, 'no badge, no eyes');
  assert.equal(
    visionSurfaceOn('lois.vision', rec({ badges: ['vision', 'cloud'] })),
    false,
    'a cloud record enables nothing here',
  );
  assert.equal(visionSurfaceOn('stage.describe', rec({ badges: ['vision', 'cloud'] })), false);
  assert.equal(visionSurfaceOn('lois.vision', null), false, 'no record — rules state — enables nothing');
});

// ── the judge ledger ─────────────────────────────────────────────────────────────────────────────────
await ok('ledger rows: T2 stamps, still binding, and never a taste label', async () => {
  const verdict = validateVisionVerdict({ ...GOOD_READINGS, line: 'holds.' });
  const sha = await sha256Hex(stillBytes);
  const row = visionLedgerRow({
    verdict,
    kind: 'variant',
    seed: 7,
    run: 'xpl-1',
    record: card().record,
    still: {
      sha256: sha,
      fingerprint: 'bake-fp-1',
      sent: { width: 1000, height: 700, downscaled: false, rasterized: false },
    },
    taste: { version: 3, head: { kind: 'xgboost-trees' } },
    model: 'qwen3-vl:8b-instruct',
    at: 42,
  });
  assert.equal(isJudgeLedgerRow(row), true);
  assert.equal(row.tasteVersion, 3);
  assert.equal(row.headKind, 'xgboost-trees');
  assert.equal(row.still.sha256, sha, 'the row binds the verdict to the exact still bytes');
  assert.equal(row.still.fingerprint, 'bake-fp-1');
  assert.deepEqual(row.recipe, { layoutParams: { mode: 'grid', density: 60 }, paletteId: 'hydra', assets: ['a', 'b'] });
  assert.equal(isLedgerRow(row), false, 'a judge row must fail the taste-ledger schema — it is not a label');
  const parsed = parseLedger(serializeJudgeRow(row), () => {});
  assert.equal(parsed.rows.length, 0, 'the taste parser takes no judge rows');
  assert.equal(parsed.skipped, 1);
  const noTaste = visionLedgerRow({
    verdict,
    kind: 'render',
    record: card().record,
    still: { sha256: sha, fingerprint: null, sent: {} },
    taste: null,
    model: 'm',
    at: 1,
  });
  assert.equal(noTaste.tasteVersion, null, 'no taste loaded reads as null stamps — absent stays absent');
  assert.equal(noTaste.headKind, null);
  assert.deepEqual(tasteStamps(null), { tasteVersion: null, headKind: null });
  assert.equal(
    visionLedgerRow({
      verdict,
      kind: 'render',
      record: card().record,
      still: { sha256: 'not-a-hash', sent: {} },
      taste: null,
      model: 'm',
      at: 1,
    }),
    null,
    'an unbound verdict (no real hash) accrues nothing',
  );
  const rt = parseJudgeLedger(serializeJudgeRow(row) + '{"broken"\n', () => {});
  assert.equal(rt.rows.length, 1);
  assert.equal(rt.skipped, 1, 'a corrupt line is skipped with a warning, never silently');
  const tampered = { ...row, verdict: 'keep', readings: { ...GOOD_READINGS, presence: 'empty' } };
  assert.equal(isJudgeLedgerRow(tampered), false, 'a verdict that disagrees with its own readings is not a judge row');
});

// ── the driver: judging ──────────────────────────────────────────────────────────────────────────────
await ok('driver: creation asks nothing; a press judges, validates, accrues', async () => {
  setCapabilities(rec());
  const { fetchImpl, bodies } = fakeOllama([goodReply]);
  const storage = memStorage();
  const driver = createVisionDriver({
    fetchImpl,
    storage,
    prepareImage: fakePrep,
    hashBytes: sha256Hex,
    stamp: () => 99,
  });
  assert.equal(bodies.length, 0, 'creating the driver fires nothing');
  const item = card({ expectedSha256: await sha256Hex(stillBytes) });
  await driver.judgeStills([item]);
  const v = driver.view().verdicts[item.key];
  assert.equal(v.verdict, 'keep');
  assert.equal(v.kind, 'render');
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].messages[1].images, ['QUJD'], 'the surface chat carried the image');
  assert.equal(bodies[0].options.num_ctx, HOUSE_NUM_CTX, 'House num_ctx pin');
  assert.equal(bodies[0].keep_alive, HOUSE_KEEP_ALIVE, 'House keep_alive pin');
  assert.equal(bodies[0].options.temperature, 0, 'verdicts at temperature 0');
  assert.equal(bodies[0].think, false, 'think off where the model allows it');
  assert.equal(judgeLedgerCount(storage), 1, 'the verdict accrued in the judge ledger');
  const rows = parseJudgeLedger(readJudgeLedgerText(storage), () => {}).rows;
  assert.equal(rows[0].tasteVersion, null, 'no taste in this fixture — stamps honestly null');
  assert.equal(rows[0].model, 'qwen3-vl:8b-instruct');
  assert.equal(driver.view().judging, null, 'the press is over');
  setCapabilities(null);
});

await ok('driver: variant cards accrue as E5 pre-judgements', async () => {
  setCapabilities(rec());
  const { fetchImpl } = fakeOllama([goodReply]);
  const storage = memStorage();
  const driver = createVisionDriver({ fetchImpl, storage, prepareImage: fakePrep, hashBytes: sha256Hex });
  const item = card({ kind: 'variant', facts: { ...card().facts, variant: true } });
  await driver.judgeStills([item]);
  const rows = parseJudgeLedger(readJudgeLedgerText(storage), () => {}).rows;
  assert.equal(rows[0].kind, 'variant');
  setCapabilities(null);
});

await ok('driver: discarded replies re-ask once, then the card carries the failure — nothing accrues', async () => {
  setCapabilities(rec());
  const { fetchImpl, bodies } = fakeOllama(['not json at all', '{"presence":"lots"}', goodReply]);
  const storage = memStorage();
  const driver = createVisionDriver({ fetchImpl, storage, prepareImage: fakePrep, hashBytes: sha256Hex });
  const a = card({ key: 'a' });
  const b = card({ key: 'b' });
  await driver.judgeStills([a]);
  assert.equal(driver.view().verdicts.a, undefined, 'two bad replies: no verdict is rendered');
  assert.ok(driver.view().cardErrors.a.includes('discarded'));
  assert.equal(judgeLedgerCount(storage), 0, 'a discarded reply accrues nothing');
  await driver.judgeStills([b]);
  assert.equal(driver.view().verdicts.b.verdict, 'keep', 'a bad reply then a good one (the re-ask) lands');
  assert.equal(bodies.length, 3);
  setCapabilities(null);
});

await ok('driver: a still that fails the run hash check is refused before any ask', async () => {
  setCapabilities(rec());
  const { fetchImpl, bodies } = fakeOllama([goodReply]);
  const driver = createVisionDriver({ fetchImpl, storage: memStorage(), prepareImage: fakePrep, hashBytes: sha256Hex });
  const item = card({ expectedSha256: 'f'.repeat(64) });
  await driver.judgeStills([item]);
  assert.equal(bodies.length, 0, 'the model was never asked');
  assert.ok(driver.view().cardErrors[item.key].includes('does not match the hash'));
  setCapabilities(null);
});

await ok('driver: no record, a cloud record, and a tier-C record all refuse judging', async () => {
  const { fetchImpl, bodies } = fakeOllama([goodReply, goodReply, goodReply]);
  const driver = createVisionDriver({ fetchImpl, storage: memStorage(), prepareImage: fakePrep, hashBytes: sha256Hex });
  setCapabilities(null);
  await driver.judgeStills([card({ key: 'none' })]);
  setCapabilities(rec({ badges: ['vision', 'cloud'] }));
  await driver.judgeStills([card({ key: 'cloud' })]);
  setCapabilities(rec({ tier: 'C', probeMs: 30000, probeClean: false }));
  await driver.judgeStills([card({ key: 'tierc' })]);
  assert.equal(bodies.length, 0, 'nothing was asked in any refused state');
  for (const k of ['none', 'cloud', 'tierc']) assert.ok(driver.view().cardErrors[k], `${k} carries its refusal`);
  setCapabilities(null);
});

// ── the driver: stage description ────────────────────────────────────────────────────────────────────
await ok('describe: no provider and an empty provider are the honest no-frame state', async () => {
  setCapabilities(rec());
  const { fetchImpl, bodies } = fakeOllama([descReply]);
  const driver = createVisionDriver({ fetchImpl, storage: memStorage(), prepareImage: fakePrep, hashBytes: sha256Hex });
  setStageFrameProvider(null);
  await driver.describeStage();
  assert.ok(driver.view().describeError.includes('no frame'));
  setStageFrameProvider(async () => null);
  await driver.describeStage();
  assert.ok(driver.view().describeError.includes('no frame'));
  assert.equal(bodies.length, 0, 'no frame means the model was never asked');
  setCapabilities(null);
});

await ok('describe: a frame lands a description bound to the frame hash; tier C + badge suffices', async () => {
  setCapabilities(rec({ tier: 'C', probeMs: 30000, probeClean: false }));
  const { fetchImpl, bodies } = fakeOllama([descReply]);
  const driver = createVisionDriver({
    fetchImpl,
    storage: memStorage(),
    prepareImage: fakePrep,
    hashBytes: sha256Hex,
    stamp: () => 7,
  });
  setStageFrameProvider(async () => ({ bytes: stillBytes, mime: 'image/png' }));
  await driver.describeStage();
  const d = driver.view().description;
  assert.ok(d.text.includes('dark field'));
  assert.equal(d.frameSha256, await sha256Hex(stillBytes), 'the description binds to the exact frame bytes');
  assert.deepEqual(bodies[0].messages[1].images, ['QUJD']);
  setStageFrameProvider(null);
  setCapabilities(null);
});

await ok('describe: a CJK description is discarded, twice, and never shown', async () => {
  setCapabilities(rec());
  const { fetchImpl } = fakeOllama([JSON.stringify({ description: '中文' }), JSON.stringify({ description: '中文' })]);
  const driver = createVisionDriver({ fetchImpl, storage: memStorage(), prepareImage: fakePrep, hashBytes: sha256Hex });
  setStageFrameProvider(async () => ({ bytes: stillBytes, mime: 'image/png' }));
  await driver.describeStage();
  assert.equal(driver.view().description, null);
  assert.ok(driver.view().describeError.includes('discarded'));
  setStageFrameProvider(null);
  setCapabilities(null);
});

await ok('the frame-provider seam registers and clears', () => {
  const fn = async () => null;
  setStageFrameProvider(fn);
  assert.equal(getStageFrameProvider(), fn);
  setStageFrameProvider(null);
  assert.equal(getStageFrameProvider(), null);
});

// ── the wiring pins (this stage's own surfaces, against silent removal) ──────────────────────────────
await ok('wiring: tray, panel, App seam, and the bundle decision are in the shipped source', () => {
  const tray = readFileSync(new URL('../panels/davis/CandidateTray.jsx', import.meta.url), 'utf8');
  assert.ok(tray.includes('judge stills'), 'the tray carries the deliberate judge press');
  assert.ok(tray.includes('judge ledger'), 'the tray makes the judge ledger inspectable');
  assert.ok(tray.includes('megamindVisionLive'), 'the tray drives the vision driver');
  const panel = readFileSync(new URL('../panels/MegaMindPanel.jsx', import.meta.url), 'utf8');
  assert.ok(panel.includes('describe the stage'), 'the MEGAMIND tab carries stage description');
  assert.ok(panel.includes('speak it'), 'speaking is its own deliberate press');
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes('setStageFrameProvider'), 'App registers the frame provider');
  assert.ok(app.includes('downloadFile: false'), 'the provider wraps the capture path without downloading');
  const bundle = readFileSync(new URL('../state/bundle.js', import.meta.url), 'utf8');
  assert.ok(bundle.includes(`'${JUDGE_LEDGER_KEY}'`), 'the judge ledger key carries its bundle decision');
});

console.log(`megamindVision.selfcheck: ${n} checks passed`);
