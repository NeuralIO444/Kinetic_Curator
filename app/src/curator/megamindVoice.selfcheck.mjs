// #1526 MegaMind S2 — the persona backend adapter: kc-voice/1 over the visitor's local Ollama, the format
// fallback ladder, think stripping, the language pin + CJK check, cadence tiers driving consultation, the
// backend chain (a connected Ollama answers; death returns silently to Apple, then rules), and the §6b
// register surfaces (pacing, crown, narration, drift, Davis reason prose, the docs guide) — all against
// fixture fetches that mirror real Ollama replies. No network, no real model.
import assert from 'node:assert/strict';
import {
  DEEP_MAX_LATE_BARS,
  FORMAT_RUNGS,
  PERSONA_FORMATS,
  adapterError,
  askPersonaReply,
  buildChatBody,
  createCadencePolicy,
  createFormatLadder,
  gradePersonaReply,
  localRecord,
  parseJsonText,
  personaSystem,
  sectionKey,
  stateRoomKey,
} from './megamindVoice.mjs';
import { createMindChain, createOllamaModel } from './megamindVoiceLive.js';
import {
  agreementDiverged,
  buildGuideCorpus,
  citationHeads,
  judgePacingProposal,
  retrieveGuide,
  validateCrownDraft,
  validateDriftReply,
  validateGuideReply,
  validateNarration,
  validatePacingProposal,
  validateReasonLine,
  GUIDE_DECLINE,
} from './megamindSurfaces.mjs';
import { createSurfacesDriver, surfaceRecord } from './megamindSurfacesLive.js';
import { createThinker } from './mindThinker.js';
import { startMind, getMindSystem } from './mindLive.js';
import { createMindRecorder, checkMindRecord } from './mindRecord.js';
import { setCapabilities, getCapabilities } from '../composition/capabilityRegistry.mjs';
import { Events, emit, on, releaseTick, clearPending } from '../composition/eventBus.js';
import { DICE_CROWNS_KEY } from './diceCrowns.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────────────────
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
const CTX = {
  v: 3,
  room: { lois: 'VIBE', davis: 'FLOW' },
  verdict: 'THE ROOM',
  intensity: 'mid',
  audio: 'mic',
  show: { energy: 'mid', silent: false, routes: [], owned: [], flatBars: 0 },
};
/** A scripted Ollama: replies are dequeued per call (string content, or an Error to throw). Bodies recorded. */
const fakeOllama = (script) => {
  const bodies = [];
  const queue = [...script];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    const next = queue.length ? queue.shift() : new Error('unscripted call');
    if (next instanceof Error) throw next;
    return { ok: true, status: 200, json: async () => ({ message: { content: next } }) };
  };
  return { fetchImpl, bodies };
};
const chat = (obj) => JSON.stringify(obj);

await ok('chat bodies: House pins, think only where controllable, the format follows the rung', async () => {
  const schema = buildChatBody(rec(), 'lois', CTX, 'schema');
  assert.deepEqual(schema.format, PERSONA_FORMATS.lois);
  assert.equal(schema.think, false, 'thinking is controllable: sent off');
  assert.equal(schema.keep_alive, '30m');
  assert.equal(schema.options.num_ctx, 16384);
  assert.equal(schema.options.num_predict, 150);
  assert.equal(schema.options.temperature, 0);
  assert.deepEqual(JSON.parse(schema.messages[1].content), CTX, 'the room summary is the user message');
  const json = buildChatBody(rec(), 'davis', CTX, 'json');
  assert.equal(json.format, 'json');
  const prompt = buildChatBody(rec(), 'davis', CTX, 'prompt');
  assert.equal('format' in prompt, false, 'the prompt rung sends no format');
  assert.ok(prompt.messages[0].content.includes('"propose"'), 'the shape text rides in the prompt rung');
  const unreported = buildChatBody(rec({ thinking: 'unreported' }), 'lois', CTX, 'schema');
  assert.equal('think' in unreported, false, 'think:false only where the model reports control');
  for (const p of ['davis', 'lois', 'queen'])
    for (const rung of FORMAT_RUNGS)
      assert.ok(personaSystem(p, rung).includes('Answer in English only'), `${p}/${rung}: the language pin rides`);
});

await ok('reply grading: think stripped before parsing, drift voids, shape decides', async () => {
  const clean = gradePersonaReply('lois', chat({ critique: { target: 'glow', delta: 0.1 }, state: 'NOD' }));
  assert.deepEqual(clean.reply, {
    critique: { target: 'glow', delta: 0.1 },
    state: { id: 'NOD', intensity: 1, decay: 0 },
  });
  const leaked = gradePersonaReply('lois', `<think>hmm, the room</think>${chat({ critique: null })}`);
  assert.equal(leaked.thinkLeak, true);
  assert.deepEqual(leaked.reply, { critique: null }, 'stripped, then parsed: the reply stands');
  const wrapped = gradePersonaReply('queen', `here you go: ${chat({ mood: 'lift' })} — done`);
  assert.deepEqual(wrapped.reply, { mood: 'lift', lean: {} }, 'the prompt rung: the object is found inside prose');
  assert.equal(gradePersonaReply('lois', 'not json at all').reply, null);
  assert.equal(
    gradePersonaReply('lois', chat({ critique: { target: 'x', delta: 9 } })).reply,
    null,
    'out of range is malformed',
  );
  const drift = gradePersonaReply('lois', chat({ critique: null, line: '部屋は静かです' }));
  assert.equal(drift.reply, null);
  assert.equal(drift.drift, true, 'CJK anywhere in the reply is drift');
  assert.equal(parseJsonText(''), null);
});

await ok('the ladder: a format failure steps down and retries once; the rung sticks', async () => {
  const ladder = createFormatLadder();
  assert.equal(ladder.rung(), 'schema');
  const fake = fakeOllama([
    'total garbage, no json',
    chat({ critique: null, state: 'VIBE' }),
    chat({ critique: null }),
  ]);
  const reply = await askPersonaReply({
    fetchImpl: fake.fetchImpl,
    record: rec(),
    persona: 'lois',
    context: CTX,
    ladder,
  });
  assert.deepEqual(reply, { critique: null, state: { id: 'VIBE', intensity: 1, decay: 0 } });
  assert.equal(fake.bodies.length, 2);
  assert.deepEqual(fake.bodies[0].format, PERSONA_FORMATS.lois, 'first attempt at the schema rung');
  assert.equal(fake.bodies[1].format, 'json', 'the retry rides the next rung down');
  assert.equal(ladder.rung(), 'json');
  const again = await askPersonaReply({
    fetchImpl: fake.fetchImpl,
    record: rec(),
    persona: 'lois',
    context: CTX,
    ladder,
  });
  assert.deepEqual(again, { critique: null });
  assert.equal(fake.bodies[2].format, 'json', 'a model that needed json-object mode stays there');
});

await ok('the ladder: garbage at every rung is a discarded reply (bad-reply), never a rendered one', async () => {
  const ladder = createFormatLadder();
  ladder.noteFailure();
  ladder.noteFailure();
  assert.equal(ladder.rung(), 'prompt');
  const fake = fakeOllama(['still not json']);
  await assert.rejects(
    () => askPersonaReply({ fetchImpl: fake.fetchImpl, record: rec(), persona: 'davis', context: CTX, ladder }),
    (e) => e.kind === 'bad-reply',
  );
});

await ok('language drift: one retry with the stern line, then the reply is discarded as drift', async () => {
  const ladder = createFormatLadder();
  const fake2 = fakeOllama([
    chat({ critique: null, line: '静かな部屋' }),
    chat({ critique: null, line: 'quiet room' }),
  ]);
  const reply = await askPersonaReply({
    fetchImpl: fake2.fetchImpl,
    record: rec(),
    persona: 'lois',
    context: CTX,
    ladder,
  });
  assert.deepEqual(reply, { critique: null, line: 'quiet room' });
  assert.ok(fake2.bodies[1].messages[0].content.includes('not in English'), 'the retry carries the stern line');
  assert.equal(ladder.rung(), 'schema', 'drift never steps the format ladder');
  const fake3 = fakeOllama([chat({ critique: null, line: '静' }), chat({ critique: null, line: '静' })]);
  await assert.rejects(
    () =>
      askPersonaReply({
        fetchImpl: fake3.fetchImpl,
        record: rec(),
        persona: 'lois',
        context: CTX,
        ladder: createFormatLadder(),
      }),
    (e) => e.kind === 'drift',
  );
});

await ok('a dead endpoint is kind down — the chain, not the persona, decides what that means', async () => {
  const fake = fakeOllama([new Error('ECONNREFUSED')]);
  await assert.rejects(
    () =>
      askPersonaReply({
        fetchImpl: fake.fetchImpl,
        record: rec(),
        persona: 'lois',
        context: CTX,
        ladder: createFormatLadder(),
      }),
    (e) => e.kind === 'down' && adapterError('down').kind === 'down',
  );
});

await ok('localRecord: measured records speak; cloud pointers and self-contradicting tiers never do', async () => {
  assert.equal(localRecord(rec()).model, 'qwen3-vl:8b-instruct');
  assert.ok(localRecord(rec({ tier: 'B', probeMs: 5000 })), 'tier B with an in-bound probe');
  assert.ok(localRecord(rec({ tier: 'C', probeMs: 20000, probeClean: false })), 'tier C makes no speed claim');
  assert.equal(
    localRecord(rec({ badges: ['cloud'] })),
    null,
    'a cloud badge refuses the record whole (local is not cloud)',
  );
  assert.equal(
    localRecord(rec({ tier: 'A', probeClean: false })),
    null,
    'a tier that outruns its probe enables nothing',
  );
  assert.equal(localRecord(rec({ tier: 'A', probeMs: 9000 })), null);
  assert.equal(localRecord(null), null);
  assert.equal(localRecord({ nonsense: true }), null);
});

await ok('cadence: tier A asks every bar; B phrases + state-room cache; C section changes only', async () => {
  const pol = createCadencePolicy();
  assert.equal(pol.plan(rec(), 'lois', { bar: 3, context: CTX }).act, 'network', 'A: any bar');
  const b = rec({ tier: 'B', probeMs: 5000 });
  assert.equal(pol.plan(b, 'lois', { bar: 5, context: CTX }).act, 'skip', 'B: off the phrase boundary');
  assert.equal(pol.plan(b, 'lois', { bar: 8, context: CTX }).act, 'network', 'B: the boundary asks');
  pol.store('lois', CTX, { critique: null, line: 'held' });
  const serve1 = pol.plan(b, 'lois', { bar: 12, context: CTX });
  assert.equal(serve1.act, 'cache', 'B: the same state-room serves from cache');
  assert.equal(serve1.reply.line, 'held');
  assert.equal(pol.plan(b, 'lois', { bar: 16, context: CTX }).act, 'cache', 'second serve');
  assert.equal(
    pol.plan(b, 'lois', { bar: 20, context: CTX }).act,
    'network',
    'cache exhausted: the model is asked again',
  );
  const moved = { ...CTX, verdict: 'FULL BURN' };
  assert.equal(
    pol.plan(b, 'lois', { bar: 24, context: moved }).act,
    'network',
    'a new state-room never serves a stale cache',
  );
  assert.equal(pol.plan(b, 'davis', { bar: 24, context: CTX }).act, 'network', 'cadence is per persona');
  const c = rec({ tier: 'C', probeMs: 20000, probeClean: false });
  const polC = createCadencePolicy();
  assert.equal(polC.plan(c, 'queen', { bar: 1, context: CTX }).act, 'network', 'C: the first section asks');
  assert.equal(polC.plan(c, 'queen', { bar: 2, context: CTX }).act, 'skip', 'C: the same section is silent');
  assert.equal(polC.plan(c, 'queen', { bar: 3, context: moved }).act, 'network', 'C: a section change re-opens');
  assert.notEqual(stateRoomKey(CTX), stateRoomKey(moved));
  assert.notEqual(sectionKey(CTX), sectionKey(moved));
});

await ok('the model object: availability is the registry + the latch; asks are stamped envelopes', async () => {
  let record = null;
  const fake = fakeOllama([chat({ critique: null, state: 'NOD' }), new Error('down'), new Error('down')]);
  const model = createOllamaModel({ fetchImpl: fake.fetchImpl, getRecord: () => record, subscribe: () => () => {} });
  assert.equal(model.available(), false, 'no record: not available');
  await assert.rejects(
    () => model.ask('lois', CTX, { bar: 1 }),
    (e) => e.kind === 'down',
  );
  record = rec();
  assert.equal(model.available(), true);
  const env = await model.ask('lois', CTX, { bar: 1 });
  assert.equal(env.backend, 'ollama');
  assert.deepEqual(env.reply, { critique: null, state: { id: 'NOD', intensity: 1, decay: 0 } });
  await assert.rejects(
    () => model.ask('lois', CTX, { bar: 2 }),
    (e) => e.kind === 'down',
  );
  await assert.rejects(
    () => model.ask('lois', CTX, { bar: 3 }),
    (e) => e.kind === 'down',
  );
  assert.equal(model.available(), false, 'two failures running: read as dead');
  record = rec({ at: 2000 });
  assert.equal(model.available(), true, 'a fresh measurement (new record) clears the latch');
  record = rec({ badges: ['vision', 'cloud'], at: 3000 });
  assert.equal(model.available(), false, 'a cloud pointer never answers a persona');
});

await ok('tier C through the model: a same-section ask is a cadence skip, not a failure', async () => {
  const recordC = rec({ tier: 'C', probeMs: 20000, probeClean: false });
  const fake = fakeOllama([chat({ mood: 'calm' })]);
  const model = createOllamaModel({ fetchImpl: fake.fetchImpl, getRecord: () => recordC, subscribe: () => () => {} });
  const env = await model.ask('queen', CTX, { bar: 1 });
  assert.equal(env.backend, 'ollama');
  await assert.rejects(
    () => model.ask('queen', CTX, { bar: 2 }),
    (e) => e.kind === 'cadence',
  );
  assert.equal(model.failures(), 0, 'a skip never counts toward the latch');
  assert.equal(fake.bodies.length, 1, 'the skip never reached the network');
});

await ok('the chain: Ollama answers, its death falls to Apple, its cadence never does', async () => {
  const recordA = rec();
  let appleCalls = 0;
  const appleDown = {
    name: 'apple',
    available: () => false,
    info: () => null,
    ask: async () => {
      appleCalls++;
      throw new Error('unavailable');
    },
  };
  const appleUp = {
    name: 'apple',
    available: () => true,
    info: () => ({ model: 'apple-foundation' }),
    ask: async () => {
      appleCalls++;
      return { critique: null, line: 'from apple' };
    },
  };
  const fake = fakeOllama([chat({ critique: null, line: 'from ollama' }), new Error('dead'), new Error('dead')]);
  const ollama = createOllamaModel({ fetchImpl: fake.fetchImpl, getRecord: () => recordA, subscribe: () => () => {} });
  const chain = createMindChain(appleUp, ollama);
  const env = await chain.ask('lois', CTX, { bar: 1 });
  assert.equal(env.backend, 'ollama', 'a connected Ollama answers');
  const fell = await chain.ask('lois', CTX, { bar: 2 });
  assert.equal(fell.backend, 'apple', 'a failed ask falls through to Apple in the same breath');
  assert.equal(fell.reply.line, 'from apple');
  assert.equal(chain.info().backend, 'ollama', 'one failure is not death: the link still names the model');
  const fell2 = await chain.ask('lois', CTX, { bar: 3 });
  assert.equal(fell2.backend, 'apple');
  assert.deepEqual(
    chain.info(),
    { backend: 'apple', model: 'apple-foundation' },
    'status follows the answering backend once Ollama is latched dead',
  );
  const chainRules = createMindChain(appleDown, ollama);
  await assert.rejects(
    () => chainRules.ask('lois', CTX, { bar: 3 }),
    'with both down the ask rejects: the thinker rules',
  );
  // cadence: a tier-C skip rethrows and Apple is NOT consulted
  appleCalls = 0;
  const recordC = rec({ tier: 'C', probeMs: 20000, probeClean: false });
  const fakeC = fakeOllama([chat({ mood: 'calm' })]);
  const ollamaC = createOllamaModel({
    fetchImpl: fakeC.fetchImpl,
    getRecord: () => recordC,
    subscribe: () => () => {},
  });
  const chainC = createMindChain(appleUp, ollamaC);
  await chainC.ask('queen', CTX, { bar: 1 });
  await assert.rejects(
    () => chainC.ask('queen', CTX, { bar: 2 }),
    (e) => e.kind === 'cadence',
  );
  assert.equal(appleCalls, 0, 'the tier rhythm is the design: Apple does not speak under a tier-C skip');
});

await ok(
  'the thinker stamps decisions from the envelope; a rogue stamp is ignored; the take records ollama',
  async () => {
    const thinker = createThinker({
      persona: 'lois',
      backend: 'ollama',
      available: () => true,
      mind: async () => ({ backend: 'ollama', reply: { critique: null, state: 'NOD' } }),
    });
    const askBar = thinker.onBar({ bar: 1, context: CTX, seed: 7 });
    assert.equal(askBar.backend, 'rules', 'the ask bar itself is answered by the rules while the flight is out');
    const d = await tick().then(() => thinker.onBar({ bar: 2, context: CTX, seed: 7 }));
    assert.equal(d.backend, 'ollama');
    assert.deepEqual(d.reply.state, { id: 'NOD', intensity: 1, decay: 0 });
    const rogue = createThinker({
      persona: 'lois',
      backend: 'apple',
      available: () => true,
      mind: async () => ({ backend: 'mallory', reply: { critique: null } }),
    });
    rogue.onBar({ bar: 1, context: CTX, seed: 1 });
    const d2 = await tick().then(() => rogue.onBar({ bar: 2, context: CTX, seed: 1 }));
    assert.equal(d2.backend, 'apple', 'a stamp outside BACKENDS is not honoured');
    const recorder = createMindRecorder({
      getFrame: () => 0,
      getSystem: () => ({ backend: 'ollama', model: 'qwen3-vl:8b-instruct' }),
    });
    recorder.update(d, false);
    const record = recorder.finish();
    assert.ok(checkMindRecord(record), 'a take carrying ollama decisions validates');
    assert.equal(record.systems.ollama.model, 'qwen3-vl:8b-instruct');
  },
);

await ok(
  'startMind over the chain: ollama decisions land, Davis routes as records, death returns to rules silently',
  async () => {
    clearPending();
    const personaReply = (system) =>
      system.includes('You are Davis')
        ? chat({
            propose: null,
            route: { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 },
            state: 'FLOW',
          })
        : system.includes('You are LOIS')
          ? chat({ critique: null, state: 'NOD' })
          : chat({ mood: 'lift', lean: { wetness: 0.4 } });
    const bodies = [];
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ message: { content: personaReply(body.messages[0].content) } }),
      };
    };
    const ollama = createOllamaModel({ fetchImpl, getRecord: getCapabilities, subscribe: () => () => {} });
    const apple = {
      name: 'apple',
      available: () => false,
      info: () => null,
      ask: async () => {
        throw new Error('unavailable');
      },
    };
    const chain = createMindChain(apple, ollama);
    const got = { status: [], decision: [], request: [] };
    const offs = [
      on(Events.MIND_STATUS, (p) => got.status.push(p)),
      on(Events.MIND_DECISION, (p) => got.decision.push(p)),
      on(Events.MIND_REQUEST, (p) => got.request.push(p)),
    ];
    setCapabilities(rec());
    const stop = startMind({
      model: chain,
      getSnapshot: () => ({ room: { lois: 'VIBE', davis: 'FLOW' } }),
      getSeed: () => 9,
    });
    // #2078 re-pin: the status payload carries the record's tier (the footer indicator's ruled tooltip
    // names it); the assertion stays an exact deepEqual, now of the fuller shape.
    assert.deepEqual(got.status[0], {
      available: true,
      backend: 'ollama',
      model: 'qwen3-vl:8b-instruct',
      tier: 'A',
    });
    assert.deepEqual(getMindSystem(), { backend: 'ollama', model: 'qwen3-vl:8b-instruct' });
    for (let bar = 1; bar <= 5; bar++) {
      emit(Events.CLOCK_BAR, { bar });
      releaseTick('bar');
      await tick();
      await tick();
    }
    const fromOllama = got.decision.filter((d) => d.backend === 'ollama');
    assert.deepEqual(
      [...new Set(fromOllama.map((d) => d.persona))].sort(),
      ['davis', 'lois', 'queen'],
      'all three personas answered by the linked model',
    );
    const davisRoute = got.request.find((r) => r.persona === 'davis' && r.reply.route);
    assert.ok(davisRoute, "Davis's conducting proposal rides mind:request as a validated record (#1483)");
    assert.deepEqual(davisRoute.reply.route, { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 });
    // kill the model mid-session: the registry clears (the link's disconnect), and the set continues on rules
    setCapabilities(null);
    for (let bar = 6; bar <= 10; bar++) {
      emit(Events.CLOCK_BAR, { bar });
      releaseTick('bar');
      await tick();
      await tick();
    }
    const settled = got.decision.slice(-3);
    assert.ok(
      settled.length === 3 && settled.every((d) => d.backend === 'rules'),
      'no visible seam: once in-flight replies drain, the rules answer and nothing announces it',
    );
    assert.deepEqual(got.status.at(-1), { available: false, backend: 'rules' });
    assert.equal(getMindSystem(), null);
    stop();
    offs.forEach((off) => off());
    clearPending();
  },
);

await ok(
  'surfaces, pure: pacing judged by the room; crown copy under the deadpan law; narration grounded or dropped',
  async () => {
    assert.deepEqual(validatePacingProposal({ move: 'push', line: 'now' }), { move: 'push', line: 'now' });
    assert.equal(validatePacingProposal({ move: 'explode' }), null);
    const room = { verdict: 'THE ROOM', intensity: 'mid', relaxing: false, phase: 'explore' };
    assert.equal(judgePacingProposal({ move: 'push' }, room).ok, true);
    assert.equal(judgePacingProposal({ move: 'push' }, { ...room, relaxing: true }).ok, false, 'no pushing a relax');
    assert.equal(
      judgePacingProposal({ move: 'widen' }, { ...room, intensity: 'peak' }).ok,
      false,
      'no widening at peak',
    );
    assert.equal(
      judgePacingProposal({ move: 'hold' }, { ...room, intensity: 'peak' }).ok,
      true,
      'hold is always inside the room',
    );
    assert.equal(judgePacingProposal({ move: 'hold' }, null).ok, false, 'no room, no judgement');
    const draft = validateCrownDraft({
      note: 'kept for the density',
      caption: 'still water, held',
      lookNames: ['still water'],
    });
    assert.deepEqual(draft.lookNames, ['STILL WATER'], 'names are normalised to the deadpan-uppercase law');
    assert.equal(validateCrownDraft({ note: 'x', caption: 'y'.repeat(81) }), null, 'the caption cap is real');
    assert.equal(validateCrownDraft({ note: 'x', caption: 'ok', lookNames: ['LOUD!'] }), null, 'no exclamation, ever');
    const facts = [
      { label: 'persona decisions', value: 41 },
      { label: 'model share', value: 0.5 },
    ];
    assert.equal(
      validateNarration({ line: 'the personas decided 41 times this session' }, facts).line.length > 0,
      true,
    );
    assert.ok(
      validateNarration({ line: 'the model took 50% of the calls' }, facts),
      'a share may be quoted as a percent',
    );
    assert.equal(validateNarration({ line: 'a lively session all round' }, facts), null, 'no quoted number: discarded');
  },
);

await ok('surfaces, pure: drift honoured only on real divergence; Davis prose grounded in the clause', async () => {
  const diverged = {
    present: true,
    headKind: 'xgb',
    tasteVersion: 3,
    fidelity: 0.9,
    keepsMean: 0.31,
    keepsN: 12,
    passesMean: 0.44,
    passesN: 20,
    auc: 0.41,
    unscored: 2,
  };
  const agreeing = { ...diverged, keepsMean: 0.72, passesMean: 0.3, auc: 0.88 };
  assert.equal(agreementDiverged(diverged), true);
  assert.equal(agreementDiverged(agreeing), false);
  const line = 'keeps averaged 0.31 against passes at 0.44 — the head and the room have parted.';
  assert.equal(
    validateDriftReply({ line, proposeRetrain: true }, diverged).proposeRetrain,
    true,
    'the data diverged: the proposal stands',
  );
  assert.equal(
    validateDriftReply({ line, proposeRetrain: true }, agreeing).proposeRetrain,
    false,
    'the data agrees: the proposal is stripped',
  );
  assert.deepEqual(citationHeads('density under 0.62 · mirrored halves'), ['density', 'mirrored']);
  const clause = 'density under 0.62 · mirrored halves';
  assert.ok(validateReasonLine({ line: 'the density did the talking again' }, clause));
  assert.equal(
    validateReasonLine({ line: 'pure vibes, trust me' }, clause),
    null,
    'no clause word: an invented reason is discarded',
  );
});

await ok(
  'the guide: retrieval over the shipped corpus only; a citation to an unshown chunk voids the reply',
  async () => {
    const corpus = buildGuideCorpus();
    assert.ok(corpus.length > 100, 'help topics + lore + about');
    assert.ok(corpus.every((c) => c.id && c.title && c.text));
    const chunks = retrieveGuide('how do audio routes work', corpus);
    assert.ok(
      chunks.length > 0 && chunks.some((c) => c.id.startsWith('help:')),
      'the help corpus answers a help question',
    );
    assert.deepEqual(retrieveGuide('zzzz qqqq', corpus), [], 'no overlap: nothing is retrieved, nothing is asked');
    const good = validateGuideReply({ answer: 'Routes wire bands to targets.', sources: [chunks[0].id] }, chunks);
    assert.deepEqual(good.sources, [chunks[0].id]);
    assert.equal(
      validateGuideReply({ answer: 'Trust me.', sources: ['help:does-not-exist'] }, chunks),
      null,
      'an invented citation voids the answer',
    );
    assert.deepEqual(validateGuideReply({ answer: GUIDE_DECLINE, sources: [] }, chunks), {
      answer: GUIDE_DECLINE,
      sources: [],
    });
  },
);

await ok(
  'surfaces, live: the driver asks, validates and shows — pacing, crown, guide (and its honest decline)',
  async () => {
    clearPending();
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    storage.setItem(
      DICE_CROWNS_KEY,
      JSON.stringify([{ ts: 1, layoutId: 'grid-4', assetIds: ['moth', 'sigil'], davisCode: 'FLOW' }]),
    );
    const bodies = [];
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      const user = body.messages[1].content;
      const content = user.includes('pacing brain')
        ? chat({ move: 'push', line: 'now, while it is warm' })
        : user.includes('just crowned')
          ? chat({ note: 'kept: grid-4, moth and sigil', caption: 'still water, held', lookNames: ['still water'] })
          : chat({});
      // the guide answer cites the first excerpt id its prompt actually showed it
      if (user.includes('visitor guide')) {
        const m = user.match(/\[(help:[a-z0-9-]+)\]/);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: {
              content: chat({
                answer: 'Routes wire a sound band to a stage target; Davis may propose edits.',
                sources: m ? [m[1]] : [],
              }),
            },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ message: { content } }) };
    };
    setCapabilities(rec());
    const driver = createSurfacesDriver({ fetchImpl, storage });
    emit(Events.DIRECTOR_ROOM, {
      verdict: 'THE ROOM',
      n: 3,
      lois: 'VIBE',
      davis: 'FLOW',
      intensity: 'mid',
      relaxing: false,
      phase: 'explore',
    });
    await driver.proposePacing();
    assert.equal(driver.view().pacing.proposal.move, 'push');
    assert.equal(
      driver.view().pacing.judgement.ok,
      true,
      'the pure judge validated the proposal against the standing room',
    );
    await driver.draftCrown();
    assert.equal(driver.view().crownDraft.forLayout, 'grid-4');
    assert.deepEqual(driver.view().crownDraft.lookNames, ['STILL WATER']);
    await driver.askGuide('how do audio routes work');
    assert.ok(driver.view().guide.sources.length === 1 && driver.view().guide.sources[0].startsWith('help:'));
    const callsBefore = bodies.length;
    await driver.askGuide('zzzz qqqq');
    assert.equal(driver.view().guide.answer, GUIDE_DECLINE, 'an unanswerable question declines in the open');
    assert.equal(bodies.length, callsBefore, 'and the model is never asked to invent the answer');
    assert.equal(surfaceRecord('guide.docs', rec({ badges: ['cloud'] })), null, 'cloud enables no surface');
    assert.ok(surfaceRecord('guide.docs', rec()));
    driver.stop();
    setCapabilities(null);
    clearPending();
  },
);

console.log(`megamindVoice.selfcheck: ${n} checks passed`);
