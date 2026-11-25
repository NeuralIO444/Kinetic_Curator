// #2489 — MEGAMIND narration: the discard must never silence the panel, and must never vanish.
//
// Matt's ruling (2026-11-24) pinned mechanically: when the model's telemetry narration fails the
// shape/grounding check twice, (a) the panel falls back to a narration composed deterministically
// from the very facts the model was shown — labeled machine-written in its own text, every number
// in it one of those facts verbatim, so it cannot be ungrounded; (b) each discarded reply goes to
// the discard log with the check it failed (shape vs grounding), inspectable there and NEVER on
// the narration surface; (c) the model is judged against the same facts snapshot it was shown —
// the telemetry tally is live bus traffic and moves while the model thinks, and judging against a
// fresher read discarded compliant replies (the stress-session defect, proven against this tree);
// (d) a model that is down is not a discard: the error stays honest, no fallback, nothing logged.
// No network, no real model: scripted fixture fetches, like the S2/S3 suites.
import assert from 'node:assert/strict';
import { setCapabilities } from '../composition/capabilityRegistry.mjs';
import { Events, emit, clearPending } from '../composition/eventBus.js';
import {
  buildFallbackNarration,
  lineQuotesFacts,
  narrationDiscardReason,
  validateNarration,
} from './megamindSurfaces.mjs';
import { createSurfacesDriver } from './megamindSurfacesLive.js';
import {
  MAX_DISCARD_ENTRIES,
  MAX_DISCARD_REPLY_CHARS,
  clearDiscards,
  readDiscards,
  recordDiscard,
} from './megamindDiscardLog.mjs';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────
const rec = (over = {}) => ({
  endpoint: 'http://127.0.0.1:11434',
  model: 'qwen3-vl:8b-instruct',
  tier: 'A',
  badges: [],
  context: 131072,
  thinking: 'controllable',
  probeMs: 1200,
  probeClean: true,
  at: 1000,
  ...over,
});
const store = new Map();
const storage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const TELEMETRY_FACTS = [
  { label: 'persona decisions', value: 33 },
  { label: 'answered by the linked model', value: 22 },
  { label: 'answered by Apple Intelligence', value: 11 },
  { label: 'answered by the rules', value: 0 },
  { label: 'mean model latency ms', value: 547 },
  { label: 'replies dropped or failed', value: 0 },
];
const chatFetch =
  (content, bodies = []) =>
  async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ message: { content } }) };
  };

await ok('fallback narration: composed from the facts, labeled, grounded, no invented numbers', async () => {
  const line = buildFallbackNarration(TELEMETRY_FACTS);
  assert.ok(line.startsWith('Machine-written'), 'the label is in the line itself');
  assert.equal(lineQuotesFacts(line, TELEMETRY_FACTS), true, 'grounded by construction');
  assert.ok(validateNarration({ line }, TELEMETRY_FACTS), 'the fallback would itself pass the checker');
  const invented = (line.match(/\d+/g) || []).filter((tok) => !TELEMETRY_FACTS.some((f) => String(f.value) === tok));
  assert.deepEqual(invented, [], 'every number in the fallback is one of the facts, verbatim');
  for (const f of TELEMETRY_FACTS) assert.ok(line.includes(`${f.label} ${f.value}`), `carries ${f.label}`);
  assert.equal(buildFallbackNarration([]), null, 'no facts: nothing to compose');
  assert.equal(buildFallbackNarration([{ label: 'x', value: null }]), null, 'no usable facts: nothing to compose');
});

await ok('discard reasons: staged shape vs grounding, agreeing with the validator', async () => {
  const cases = [
    [null, 'shape'],
    ['a string, not an object', 'shape'],
    [{}, 'shape'],
    [{ line: '   ' }, 'shape'],
    [{ line: 'x'.repeat(301) }, 'shape'],
    [{ line: 'the answer is 33, in another tongue: 決定' }, 'shape'],
    [{ line: 'a lively session all round' }, 'grounding'],
  ];
  for (const [raw, stage] of cases) {
    assert.equal(validateNarration(raw, TELEMETRY_FACTS), null, `validator discards (${stage})`);
    const reason = narrationDiscardReason(raw, TELEMETRY_FACTS);
    assert.equal(reason.stage, stage, `reason names the stage (${stage})`);
    assert.ok(reason.detail.length > 0, 'the reason says why, in words');
  }
  const good = { line: 'the personas decided 33 times this session' };
  assert.ok(validateNarration(good, TELEMETRY_FACTS));
  assert.equal(narrationDiscardReason(good, TELEMETRY_FACTS), null, 'a passing reply has no discard reason');
});

await ok('discard log: bounded ring, bounded reply, copies out, clears', async () => {
  clearDiscards();
  for (let i = 0; i < MAX_DISCARD_ENTRIES + 8; i++) {
    recordDiscard({
      surface: 'narration.telemetry',
      stage: 'grounding',
      reason: 'the line quoted none of the numbers it was given',
      reply: `reply ${i}`,
      facts: TELEMETRY_FACTS,
    });
  }
  const log = readDiscards();
  assert.equal(log.length, MAX_DISCARD_ENTRIES, 'the ring is bounded');
  assert.equal(log[0].reply, 'reply 8', 'the oldest are dropped first');
  assert.ok(
    log.every((e, i) => i === 0 || e.seq > log[i - 1].seq),
    'entries carry a rising sequence (order without a clock read)',
  );
  assert.equal(log[0].at, null, 'no timestamp is invented inside the log');
  const stamped = recordDiscard({ surface: 's', stage: 'shape', reason: 'r', reply: 'x', facts: [], at: 1234 });
  assert.equal(stamped.at, 1234, 'a caller-supplied timestamp is kept as given');
  const bounded = recordDiscard({
    surface: 'narration.census',
    stage: 'shape',
    reason: 'r',
    reply: 'y'.repeat(MAX_DISCARD_REPLY_CHARS + 100),
    facts: [],
  });
  assert.equal(bounded.reply.length, MAX_DISCARD_REPLY_CHARS, 'a logged reply is bounded');
  const copy = readDiscards();
  copy[0].reply = 'tampered';
  assert.notEqual(readDiscards()[0].reply, 'tampered', 'the log cannot be mutated through a read');
  clearDiscards();
  assert.deepEqual(readDiscards(), [], 'clears');
});

await ok('live: an ungrounded model twice — the labeled fallback stands, both replies logged, none shown', async () => {
  clearDiscards();
  setCapabilities(rec());
  const bodies = [];
  const driver = createSurfacesDriver({
    fetchImpl: chatFetch(JSON.stringify({ line: 'a lively session all round, everything humming' }), bodies),
    storage,
  });
  emit(Events.MIND_DECISION, { persona: 'lois', backend: 'ollama' });
  emit(Events.MIND_DECISION, { persona: 'davis', backend: 'ollama' });
  emit(Events.MIND_DECISION, { persona: 'queen', backend: 'rules' });
  emit(Events.MIND_REPLY, { persona: 'lois', backend: 'ollama', latencyMs: 540, reply: {} });
  await driver.narrateTelemetry();
  const v = driver.view();
  assert.equal(bodies.length, 2, 'the model was asked, then re-asked once');
  assert.equal(v.error, null, 'a discard with a fallback is not an error state');
  assert.ok(v.telemetryLine && v.telemetryLine.startsWith('Machine-written'), 'the fallback stands on the panel');
  assert.equal(v.telemetryMachineWritten, true, 'and is flagged machine-written');
  assert.ok(!v.telemetryLine.includes('lively session'), 'the discarded reply is NOT the narration');
  const log = readDiscards();
  assert.equal(log.length, 2, 'both discarded replies are in the event log');
  for (const e of log) {
    assert.equal(e.surface, 'narration.telemetry');
    assert.equal(e.stage, 'grounding', 'each logged with the check it failed');
    assert.ok(e.reply.includes('lively session'), 'what it said stays inspectable');
    assert.ok(e.facts.length > 0, 'and the facts it was judged against');
  }
  assert.deepEqual(
    v.discards.map((d) => d.reply),
    log.map((d) => d.reply),
    'the panel view carries the log',
  );
  driver.stop();
  clearPending();
});

await ok('live: a shape failure twice — fallback stands, the log names shape', async () => {
  clearDiscards();
  setCapabilities(rec());
  const driver = createSurfacesDriver({ fetchImpl: chatFetch('the model rambled in prose, no json'), storage });
  await driver.narrateTelemetry();
  const v = driver.view();
  assert.ok(v.telemetryLine && v.telemetryLine.startsWith('Machine-written'), 'the fallback stands');
  assert.equal(v.telemetryMachineWritten, true);
  const log = readDiscards();
  assert.equal(log.length, 2);
  assert.ok(
    log.every((e) => e.stage === 'shape'),
    'an unparseable reply fails shape, and the log says so',
  );
  assert.ok(
    log.every((e) => e.reply.includes('rambled in prose')),
    'the raw reply is what is logged',
  );
  driver.stop();
  clearPending();
});

await ok(
  'live: the snapshot law — a compliant reply is judged against the facts it was shown, not fresher ones',
  async () => {
    clearDiscards();
    setCapabilities(rec());
    const fetchImpl = async (url, init) => {
      const user = JSON.parse(init.body).messages[1].content;
      // live traffic lands while the model thinks: the tally's mean moves off the shown value
      emit(Events.MIND_REPLY, { persona: 'davis', backend: 'ollama', latencyMs: 1699, reply: {} });
      const shown = /mean model latency ms: (\d+)/.exec(user)[1];
      const content = JSON.stringify({ line: `the model answered at a mean latency of ${shown} ms` });
      return { ok: true, status: 200, json: async () => ({ message: { content } }) };
    };
    const driver = createSurfacesDriver({ fetchImpl, storage });
    for (let i = 0; i < 22; i++) emit(Events.MIND_DECISION, { persona: 'lois', backend: 'ollama' });
    for (let i = 0; i < 11; i++) emit(Events.MIND_DECISION, { persona: 'davis', backend: 'apple' });
    emit(Events.MIND_REPLY, { persona: 'lois', backend: 'ollama', latencyMs: 547, reply: {} });
    await driver.narrateTelemetry();
    const v = driver.view();
    assert.equal(v.error, null);
    assert.equal(
      v.telemetryLine,
      'the model answered at a mean latency of 547 ms',
      "the model's own line stands — it quoted exactly what it was shown",
    );
    assert.equal(v.telemetryMachineWritten, false, 'no fallback was needed');
    assert.deepEqual(readDiscards(), [], 'nothing was discarded');
    driver.stop();
    clearPending();
  },
);

await ok('live: a down model is not a discard — honest error, no fallback, nothing logged', async () => {
  clearDiscards();
  setCapabilities(rec());
  const driver = createSurfacesDriver({
    fetchImpl: async () => {
      throw new Error('connection refused');
    },
    storage,
  });
  await driver.narrateTelemetry();
  const v = driver.view();
  assert.equal(v.telemetryLine, null, 'no narration is fabricated for a down model');
  assert.ok(v.error && v.error.includes('connection refused'), 'the failure shows honestly');
  assert.deepEqual(readDiscards(), [], 'nothing is logged as a discard');
  driver.stop();
  clearPending();
});

await ok('live: census narration falls back the same way, logged under its own surface', async () => {
  clearDiscards();
  setCapabilities(rec());
  const driver = createSurfacesDriver({
    fetchImpl: chatFetch(JSON.stringify({ line: 'the room kept plenty and passed the rest' })),
    storage,
  });
  await driver.narrateCensus();
  const v = driver.view();
  assert.ok(v.censusLine && v.censusLine.startsWith('Machine-written'), 'the census fallback stands');
  assert.equal(v.censusMachineWritten, true);
  const log = readDiscards();
  assert.equal(log.length, 2);
  assert.ok(
    log.every((e) => e.surface === 'narration.census'),
    'logged under the census surface',
  );
  driver.stop();
  setCapabilities(null);
  clearPending();
});

console.log(`megamindSurfaces.selfcheck: ${n} checks passed`);
