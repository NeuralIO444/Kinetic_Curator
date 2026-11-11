// #1529 MegaMind follow-on — replay recaps + retro-capture summaries, told from the take's log.
// The honest-narration law, pinned mechanically: facts derive from the log alone (every section +
// the input log), the rules recap is complete with no model anywhere, a HOSTILE stub backend that
// tries to insert an event that never happened (and an invented number on a real fact) has both
// claims dropped while its one grounded claim survives, retro summaries are scoped to the
// capture's own frames, timestamps come from the log (bars from the clock section, seconds from
// the frame count), and the muted-during-playback law holds: the driver cannot generate — and
// never asks a model — before the playback holder reports the take ended. No network, no real
// model: a scripted fake Ollama, like the S2/S3 suites.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInputLog } from '../engine/kernel/replay/inputLog.js';
import { packPerformance, unpackPerformance } from '../gl/performanceFile.mjs';
import { setCapabilities } from '../composition/capabilityRegistry.mjs';
import { createClockRecorder } from './clockRecord.js';
import { createMindRecorder } from './mindRecord.js';
import { createBirthRecorder } from './birthRecord.mjs';
import {
  buildRulesRecap,
  checkRecapRecord,
  digestFacts,
  recapClaimsFromText,
  takeFacts,
  validateRecapClaims,
  verifyRecap,
} from './megamindRecap.mjs';
import { createRecapDriver } from './megamindRecapLive.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r));
};

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────
const L = (id) => ({ id, name: id, visible: true });
const buildInputs = (frames, fn) => {
  const log = createInputLog();
  for (let fr = 0; fr < frames; fr++) log.record(fn(fr));
  return log.finish();
};
const baseInput = (over = {}) => ({
  loopTimeMs: 0, // overridden per frame below: the log's loop time is cumulative simulation ms
  paletteId: 'bone',
  seed: 7,
  layers: [L('a')],
  slowRender: false,
  perfTier1: false,
  ...over,
});

/** A deliberate take, 600 frames, with every section the recap reads — built by the real recorders. */
function fixtureTake() {
  let frame = 0;
  const getFrame = () => frame;
  const clockRec = createClockRecorder({ initialBpm: 120, getFrame });
  const mindRec = createMindRecorder({ getFrame, getSystem: () => null });
  const birthRec = createBirthRecorder({ getFrame });
  const decision = (persona, bar, reply) =>
    mindRec.update({ persona, bar, backend: 'rules', seed: 1, invented: false, reply }, false);
  frame = 60;
  decision('lois', 0, { critique: null, state: { id: 'NOD', intensity: 1, decay: 0 }, line: 'the middle holds.' });
  frame = 130;
  decision('davis', 1, { propose: null, state: { id: 'BLOOM', intensity: 1, decay: 0 }, line: 'it breathes now.' });
  frame = 150;
  mindRec.conduct({
    status: 'applied',
    op: { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 },
    delta: { op: 'add', before: null, after: {} },
    bar: 1,
    landBar: 2,
  });
  frame = 180;
  birthRec.update({ press: 3, via: 'kinetic', outcome: 'born', record: { id: 'cr-abcd1234', body: 'moth', seed: 9 } });
  frame = 210;
  decision('davis', 1, { propose: null, state: { id: 'STUCK', intensity: 1, decay: 0 }, line: 'nothing moves.' });
  frame = 240;
  clockRec.set(132);
  frame = 260;
  birthRec.update({ press: 4, via: 'kinetic', outcome: 'stillborn', record: null });
  frame = 300;
  mindRec.conduct({
    status: 'dropped',
    reason: 'owned',
    op: { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 },
    bar: 2,
    landBar: null,
  });
  frame = 330;
  decision('lois', 2, { critique: null, state: { id: 'BURN', intensity: 1, decay: 0 }, line: 'flat for a while.' });
  frame = 400;
  decision('davis', 3, { propose: null, state: { id: 'FLOW', intensity: 1, decay: 0 } });
  return {
    format: 'kc-performance',
    version: 2,
    kernelVersion: 'test',
    frames: 600,
    truncated: false,
    machineKeys: [],
    checkpointEvery: 60,
    checkpoints: [{ frame: 0, hash: '0123456789abcdef' }],
    inputs: buildInputs(600, (fr) =>
      baseInput({
        loopTimeMs: fr * 16.7,
        paletteId: fr >= 120 ? 'ink' : 'bone',
        seed: fr >= 200 ? 42 : 7,
        layers: fr >= 300 ? [L('a'), L('b')] : [L('a')],
        slowRender: fr >= 360 && fr < 480,
        perfTier1: fr >= 500 && fr < 590,
      }),
    ),
    clock: clockRec.finish(),
    mind: mindRec.finish(),
    births: birthRec.finish(),
    formation: { version: 1, runs: [], forms: [[150, 2, 0.5, 0.5, 0]] },
    stress: {
      version: 1,
      initial: null,
      runs: [],
      bands: [
        [90, 'tighten'],
        [420, 'relax'],
      ],
      occupancy: {},
    },
    gestures: {
      version: 1,
      initial: false,
      events: [
        [200, 'freeze', true],
        [350, 'freeze', false],
      ],
    },
  };
}

/** A retro capture: the input log alone, 300 frames — the ring carries no sections. */
function fixtureCapture() {
  return {
    format: 'kc-performance',
    version: 2,
    kernelVersion: 'test',
    frames: 300,
    truncated: false,
    machineKeys: [],
    checkpointEvery: 60,
    checkpoints: [{ frame: 0, hash: '0123456789abcdef' }],
    inputs: buildInputs(300, (fr) =>
      baseInput({
        loopTimeMs: fr * 16.7,
        paletteId: fr >= 100 ? 'ember' : 'bone',
        slowRender: fr >= 60 && fr < 180,
      }),
    ),
  };
}

/** A take whose mind record comes from a recorder that never conducted: a persona spoke, and the finished record carries NO conduct key at all (mindRecord's law: the key is omitted when Davis never conducted). */
function fixtureTakeNoConduct() {
  let frame = 0;
  const getFrame = () => frame;
  const mindRec = createMindRecorder({ getFrame, getSystem: () => null });
  frame = 60;
  mindRec.update(
    {
      persona: 'lois',
      bar: 0,
      backend: 'rules',
      seed: 1,
      invented: false,
      reply: { critique: null, state: { id: 'NOD', intensity: 1, decay: 0 }, line: 'the middle holds.' },
    },
    false,
  );
  frame = 130;
  mindRec.update(
    {
      persona: 'davis',
      bar: 1,
      backend: 'rules',
      seed: 1,
      invented: false,
      reply: { propose: null, state: { id: 'BLOOM', intensity: 1, decay: 0 }, line: 'it breathes now.' },
    },
    false,
  );
  const mind = mindRec.finish();
  return { perf: { ...fixtureCapture(), mind }, mind };
}

const rec = (over = {}) => ({
  endpoint: 'http://127.0.0.1:11434',
  model: 'qwen3-vl:8b-instruct',
  tier: 'C',
  badges: [],
  context: 131072,
  thinking: 'controllable',
  probeMs: 5000,
  probeClean: true,
  at: 1000,
  ...over,
});
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

// ── the facts: the log, read whole ───────────────────────────────────────────────────────────────
const perf = fixtureTake();
const facts = takeFacts(perf);
const byKind = (kind) => facts.filter((x) => x.kind === kind);

await ok('facts derive from every section + the input log, stamped from the log', () => {
  for (const kind of [
    'palette',
    'seed',
    'layers',
    'hold',
    'shed',
    'bpm',
    'keep',
    'bloom',
    'stuck',
    'burn',
    'conduct',
    'conduct-missed',
    'spoken',
    'birth',
    'birth-missed',
    'form',
    'band',
    'gesture',
  ])
    assert.ok(byKind(kind).length >= 1, `a ${kind} fact`);
  const keep = byKind('keep')[0];
  assert.equal(keep.frame, 60);
  assert.equal(keep.bar, 0, 'bar from the clock section');
  assert.ok(keep.text.includes('bar 0 · 0:01'), `keep stamp: ${keep.text}`);
  assert.ok(keep.text.includes('"the middle holds."'), "LOIS's recorded line is quoted, not paraphrased");
  const bloom = byKind('bloom')[0];
  assert.equal(bloom.bar, 1);
  assert.ok(bloom.text.includes('0:02'), `bloom seconds from the frame count: ${bloom.text}`);
  const birth = byKind('birth')[0];
  assert.ok(birth.text.includes('cr-abcd1234') && birth.text.includes('moth'), 'the child is named from its record');
  const hold = byKind('hold')[0];
  assert.equal(hold.frame, 360);
  assert.ok(hold.text.includes('about 2s'), `the hold's length measured from the log: ${hold.text}`);
  const spoken = byKind('spoken')[0];
  assert.ok(spoken.text.includes('5 times') && spoken.text.includes('Davis 3') && spoken.text.includes('LOIS 2'));
});

await ok('window scoping: facts outside the window are never derived', () => {
  const win = takeFacts(perf, { from: 100, to: 300 });
  assert.ok(win.length > 0);
  assert.ok(
    win.every((x) => x.frame >= 100 && x.frame < 300),
    'every fact inside the window',
  );
  assert.ok(!win.some((x) => x.kind === 'keep'), 'the bar-0 keep is outside and absent');
  assert.ok(!win.some((x) => x.kind === 'burn'), 'the late burn is outside and absent');
  assert.ok(
    win.some((x) => x.kind === 'birth'),
    'the birth inside the window is present',
  );
  const winSpoken = win.find((x) => x.kind === 'spoken');
  assert.ok(
    winSpoken && winSpoken.text.includes('2 times') && winSpoken.text.includes('Davis 2'),
    `aggregates count the window only: ${winSpoken && winSpoken.text}`,
  );
});

await ok('digest: bounded, chronological, and the record reader round-trips it', () => {
  const { facts: digest } = digestFacts(perf, 'replay');
  assert.equal(digest[0].kind, 'span');
  assert.ok(digest.length <= 25);
  const frames = digest.slice(1).map((x) => x.frame);
  assert.deepEqual(
    frames,
    [...frames].sort((a, b) => a - b),
    'chronological after the span',
  );
});

// ── the rules recap: complete with no model anywhere ─────────────────────────────────────────────
await ok('rules recap: complete, honest, deterministic — and it passes its own claim-walk', () => {
  setCapabilities(null);
  const recap = buildRulesRecap(perf, { kind: 'replay' });
  assert.equal(recap.backend, 'rules');
  assert.equal(recap.model, null);
  assert.ok(
    recap.lines.some((l) => l.persona === 'davis'),
    'Davis writes',
  );
  assert.ok(
    recap.lines.some((l) => l.persona === 'lois'),
    'LOIS writes',
  );
  assert.deepEqual(verifyRecap(recap), [], 'the claim-walk finds no violation');
  // Every line in the shipped record cites a fact that re-derivation from the log reproduces.
  const derived = new Map(takeFacts(perf).map((x) => [x.text, x]));
  for (const line of recap.lines)
    for (const id of line.cites) {
      const fact = recap.facts.find((x) => x.id === id);
      assert.ok(fact, `cite ${id} resolves inside the record`);
      if (!['span', 'more', 'quiet'].includes(fact.kind))
        assert.ok(derived.has(fact.text), `fact "${fact.text}" re-derives from the log`);
    }
  assert.deepEqual(buildRulesRecap(perf, { kind: 'replay' }), recap, 'same take, same record');
  const clean = checkRecapRecord(JSON.parse(JSON.stringify(recap)));
  assert.ok(clean && clean.lines.length === recap.lines.length, 'the fail-closed reader accepts it');
});

await ok('mind record with no conduct key: recap builds complete, no throw', () => {
  const { perf: noConductPerf, mind } = fixtureTakeNoConduct();
  assert.deepEqual(
    Object.keys(mind).sort(),
    ['decisions', 'version'],
    'the recorder omits conduct entirely when Davis never conducted',
  );
  assert.ok(!('conduct' in mind), 'no conduct key at all');
  let recap;
  assert.doesNotThrow(() => {
    recap = buildRulesRecap(noConductPerf, { kind: 'replay' });
  }, 'buildRulesRecap must not throw on a mind record with no conduct key');
  assert.ok(recap, 'a complete recap is returned');
  assert.ok(
    recap.facts.some((x) => x.kind === 'keep'),
    "LOIS's spoken verdict is still retold",
  );
  assert.ok(
    recap.facts.some((x) => x.kind === 'bloom'),
    "Davis's spoken verdict is still retold",
  );
  assert.ok(
    !recap.facts.some((x) => x.kind === 'conduct' || x.kind === 'conduct-missed'),
    'no conduct facts are invented from an absent key',
  );
  assert.ok(
    recap.lines.some((l) => l.persona === 'lois'),
    'LOIS writes',
  );
  assert.ok(
    recap.lines.some((l) => l.persona === 'davis'),
    'Davis writes',
  );
  assert.deepEqual(verifyRecap(recap), [], 'the claim-walk finds no violation');
  const clean = checkRecapRecord(JSON.parse(JSON.stringify(recap)));
  assert.ok(clean && clean.lines.length === recap.lines.length, 'the fail-closed reader accepts it');
});

await ok('checkRecapRecord fails closed', () => {
  assert.equal(checkRecapRecord(null), null);
  assert.equal(checkRecapRecord({}), null);
  const recap = buildRulesRecap(perf, { kind: 'replay' });
  assert.equal(checkRecapRecord({ ...recap, version: 99 }), null);
  const lying = JSON.parse(JSON.stringify(recap));
  lying.lines.push({ persona: 'davis', text: 'a dragon appeared.', cites: ['nope'], src: 'model' });
  assert.equal(checkRecapRecord(lying), null, 'a line citing no real fact voids the record');
});

// ── claim validation: the hostile backend ────────────────────────────────────────────────────────
await ok('validateRecapClaims drops invented events and invented numbers, keeps grounded claims', () => {
  const recap = buildRulesRecap(perf, { kind: 'replay' });
  const bloom = recap.facts.find((x) => x.kind === 'bloom');
  const stuck = recap.facts.find((x) => x.kind === 'stuck');
  const raw = {
    claims: [
      { fact: bloom.id, line: `Davis called a bloom: "it breathes now." — bar ${bloom.bar}, as logged.` },
      { fact: 'f999', line: 'a dragon made of static ate the stage at bar 9.' },
      { fact: stuck.id, line: 'Davis counted 77 moths while the room sat stuck.' },
      { fact: stuck.id, line: 'Davis: nothing moves — the room was stuck, exactly as logged.' },
    ],
  };
  const claims = validateRecapClaims(raw, recap.facts);
  assert.equal(claims.length, 2, 'only the two grounded claims survive');
  assert.ok(!claims.some((c) => c.line.includes('dragon')), 'the invented event is dropped');
  assert.ok(!claims.some((c) => c.line.includes('77')), 'the invented number is dropped');
  assert.equal(recapClaimsFromText('not json at all', recap.facts).length, 0, 'malformed replies survive as nothing');
});

// ── the driver: muted during playback, recaps only after the end ─────────────────────────────────
await ok('muted pin: no recap, no ask, however long playback runs — generation starts at END', async () => {
  setCapabilities(rec());
  const { fetchImpl, bodies } = fakeOllama([]);
  const state = { perf, ended: false, active: true };
  const driver = createRecapDriver({ fetchImpl, playback: () => state });
  for (let i = 0; i < 50; i++) driver.poll();
  await settle();
  assert.equal(perf.recap, undefined, 'nothing is attached mid-playback');
  assert.equal(driver.view().recap, null);
  assert.equal(bodies.length, 0, 'the model is never asked during playback');
  state.ended = true;
  driver.poll();
  assert.ok(perf.recap, 'the rules recap lands the moment the take ends');
  driver.poll();
  assert.equal(driver.view().recap, perf.recap);
});

await ok('driver: a hostile backend cannot smuggle an event into the shipped recap', async () => {
  setCapabilities(rec());
  const recap = buildRulesRecap(perf, { kind: 'replay' });
  const bloom = recap.facts.find((x) => x.kind === 'bloom');
  const stuck = recap.facts.find((x) => x.kind === 'stuck');
  const keep = recap.facts.find((x) => x.kind === 'keep');
  const davisReply = JSON.stringify({
    claims: [
      { fact: bloom.id, line: `Davis called a bloom: "it breathes now." — bar ${bloom.bar}, as logged.` },
      { fact: 'f999', line: 'a dragon made of static ate the stage at bar 9.' },
      { fact: stuck.id, line: 'Davis counted 77 moths while the room sat stuck.' },
    ],
  });
  const loisReply = JSON.stringify({
    claims: [{ fact: keep.id, line: 'LOIS called a keep: "the middle holds." — kept, as logged.' }],
  });
  const { fetchImpl, bodies } = fakeOllama([davisReply, loisReply]);
  const state = { perf, ended: true, active: false };
  delete perf.recap;
  const driver = createRecapDriver({ fetchImpl, playback: () => state });
  driver.poll();
  await settle();
  const shipped = perf.recap;
  assert.ok(shipped, 'a recap shipped');
  assert.equal(shipped.model, 'qwen3-vl:8b-instruct', 'the record stamps the model that enriched it');
  const texts = shipped.lines.map((l) => l.text).join('\n');
  assert.ok(!texts.includes('dragon'), 'the invented event never ships');
  assert.ok(!texts.includes('77 moths'), 'the invented count never ships');
  assert.ok(
    shipped.lines.some((l) => l.src === 'model' && l.text.includes('it breathes now')),
    "Davis's grounded line ships",
  );
  assert.ok(
    shipped.lines.some((l) => l.src === 'model' && l.persona === 'lois'),
    "LOIS's grounded line ships",
  );
  assert.ok(
    shipped.lines.some((l) => l.src === 'rules'),
    'uncovered facts keep their rules lines',
  );
  assert.deepEqual(verifyRecap(shipped), [], 'the shipped record passes the claim-walk');
  assert.equal(bodies.length, 2, 'one ask per persona');
});

// ── retro summaries: the capture's window is the whole world ─────────────────────────────────────
await ok('retro: rules-only summary from an inputs-only capture, honest about the missing record', async () => {
  setCapabilities(null);
  const { fetchImpl, bodies } = fakeOllama([]);
  const driver = createRecapDriver({ fetchImpl, playback: () => null });
  const capture = fixtureCapture();
  const summary = await driver.summarize(capture);
  assert.equal(summary.kind, 'retro');
  assert.equal(summary.backend, 'rules');
  assert.equal(bodies.length, 0, 'no record linked: no ask');
  assert.ok(summary.facts[0].text.startsWith('the captured window of 300 frames'), summary.facts[0].text);
  assert.ok(
    summary.facts.some((x) => x.kind === 'palette' && x.text.includes('ember')),
    'the palette move inside the window',
  );
  assert.ok(
    summary.facts.some((x) => x.kind === 'hold'),
    'the hold inside the window',
  );
  assert.ok(
    summary.facts.some((x) => x.kind === 'no-record'),
    'a capture with no persona record says so instead of inventing voices',
  );
  assert.deepEqual(verifyRecap(summary), []);
});

await ok('retro: the summary rides the capture file and reads back clean', async () => {
  setCapabilities(null);
  const driver = createRecapDriver({
    fetchImpl: async () => {
      throw new Error('no network in the suite');
    },
    playback: () => null,
  });
  const capture = fixtureCapture();
  capture.summary = await driver.summarize(capture);
  const back = await unpackPerformance(await packPerformance(capture));
  const read = checkRecapRecord(back.summary);
  assert.ok(read, 'the attached summary survives the pack/unpack round trip');
  assert.equal(read.kind, 'retro');
  assert.equal(read.lines.length, capture.summary.lines.length);
  // Scoping against a longer take: events past the capture's frames are not in its log, so they
  // cannot be narrated — a palette that only moves at frame 500 never appears.
  const longer = fixtureCapture();
  longer.frames = 600;
  longer.inputs = buildInputs(600, (fr) =>
    baseInput({ loopTimeMs: fr * 16.7, paletteId: fr >= 500 ? 'ghost' : 'bone', slowRender: fr >= 60 && fr < 180 }),
  );
  const longerFacts = takeFacts(longer, { from: 0, to: 300 });
  assert.ok(!longerFacts.some((x) => x.text.includes('ghost')), 'frame-500 events stay outside a 300-frame window');
});

// ── wiring pins ──────────────────────────────────────────────────────────────────────────────────
await ok('wiring: the strip reads records only at END; the retro button attaches before packing', () => {
  const strip = readFileSync(new URL('../components/TakeStrip.jsx', import.meta.url), 'utf8');
  assert.match(strip, /pb\.ended \? checkRecapRecord\(pb\.perf && pb\.perf\.summary\)/);
  assert.match(strip, /ensureRecapDriver\(\)/);
  const btn = readFileSync(new URL('../components/PerformanceButton.jsx', import.meta.url), 'utf8');
  assert.match(btn, /summarizeCaptureTake\(take\.perf\)/);
  assert.match(btn, /take\.perf\.summary = summary/);
  assert.match(btn, /packPerformance\(take\.perf\)/);
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.match(app, /isReplaying: isPlaybackActive/, '#1461 muting seam untouched in App');
});

setCapabilities(null);
console.log(`megamindRecap.selfcheck: ${n} checks passed`);
