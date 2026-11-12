// #2078 — the footer backend indicator: letters O / A / R (Matt's ruling, 2026-11-10 — simple letters,
// not emoji), the ruled hover tooltips, and the click that opens the MEGAMIND tab (or, when the DEV
// panel is unavailable in a release build, the Settings Dev mode toggle — never a dead click).
//
// What this pins, in order:
//   1. the derivation is pure and exact: three states × two click destinations, string-for-string as
//      ruled on the issue, plus the honest degradations (no status yet; a status carrying no model);
//   2. the click route + the devTabs panel-request channel the Shell and DevPanel honour;
//   3. the indicator's state derives from the adapter's REAL selection — a real Ollama model object
//      over a fixture registry + a real mind chain + the real startMind publish path. Flipping the
//      adapter's world (connect, re-grade, disconnect, latch-kill) flips the published status, and
//      the indicator follows the status. No footer-side mock anywhere in this part;
//   4. the in-flight rule: a connect that has not landed and an ask still in flight change nothing —
//      the glyph moves only when the published selection actually changes;
//   5. the wiring, by source pin (the repo's idiom for JSX surfaces): the footer renders the
//      indicator beside the micro-buttons, the component reads the real gate + the real status,
//      and both tab owners honour the panel request.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backendRoute, indicatorBackend, indicatorFor } from './backendIndicator.mjs';
import { createMindChain, createOllamaModel } from './megamindVoiceLive.js';
import { getMindStatus, startMind } from './mindLive.js';
import { consumeDevTabRequest, onDevPanelRequest, requestDevPanel } from '../panels/devTabs.mjs';
import { getCapabilities, setCapabilities } from '../composition/capabilityRegistry.mjs';
import { Events, clearPending, emit, on, releaseTick } from '../composition/eventBus.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (rel) => readFileSync(join(APP, rel), 'utf8');

// ── fixtures (the S2 suite's shapes) ────────────────────────────────────────────────────────────────
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
const chat = (obj) => JSON.stringify(obj);
const personaReply = (system) =>
  system.includes('You are Davis')
    ? chat({ propose: null, state: 'FLOW' })
    : system.includes('You are LOIS')
      ? chat({ critique: null, state: 'NOD' })
      : chat({ mood: 'lift', lean: { wetness: 0.4 } });
const answeringFetch = async (url, init) => {
  const body = JSON.parse(init.body);
  return {
    ok: true,
    status: 200,
    json: async () => ({ message: { content: personaReply(body.messages[0].content) } }),
  };
};
const appleUpStub = {
  name: 'apple',
  available: () => true,
  info: () => ({ model: 'apple-foundation' }),
  ask: async () => ({ critique: null, line: 'from apple' }),
};
const appleDownStub = {
  name: 'apple',
  available: () => false,
  info: () => null,
  ask: async () => {
    throw new Error('unavailable');
  },
};

// ── 1. the ruled strings ────────────────────────────────────────────────────────────────────────────
await ok('strings: three states, exact ruled tooltips, both click destinations', () => {
  const ollama = { available: true, backend: 'ollama', model: 'qwen3-vl:8b-instruct', tier: 'B' };
  assert.deepEqual(indicatorFor(ollama, true), {
    backend: 'ollama',
    glyph: 'O',
    title: 'Ollama · qwen3-vl:8b-instruct · tier B — click to open the MEGAMIND tab',
  });
  assert.equal(
    indicatorFor(ollama, false).title,
    'Ollama · qwen3-vl:8b-instruct · tier B — click to open the Settings Dev mode toggle',
  );
  assert.deepEqual(indicatorFor({ available: true, backend: 'apple' }, true), {
    backend: 'apple',
    glyph: 'A',
    title: 'Apple Intelligence — click to open the MEGAMIND tab',
  });
  assert.equal(
    indicatorFor({ available: true, backend: 'apple' }, false).title,
    'Apple Intelligence — click to open the Settings Dev mode toggle',
  );
  assert.deepEqual(indicatorFor({ available: false, backend: 'rules' }, true), {
    backend: 'rules',
    glyph: 'R',
    title: 'Rules — no model linked — click to open the MEGAMIND tab',
  });
  assert.equal(
    indicatorFor({ available: false, backend: 'rules' }, false).title,
    'Rules — no model linked — click to open the Settings Dev mode toggle',
  );
});

await ok('strings: no status yet is rules; a bare status never prints a placeholder', () => {
  assert.equal(indicatorBackend(null), 'rules');
  assert.equal(indicatorFor(null, true).glyph, 'R');
  assert.equal(
    indicatorFor(undefined, false).title,
    'Rules — no model linked — click to open the Settings Dev mode toggle',
  );
  assert.equal(indicatorBackend({ backend: 'demo' }), 'rules', 'a debug demo backend is not a model at the footer');
  const bare = indicatorFor({ available: true, backend: 'ollama' }, true);
  assert.equal(bare.glyph, 'O');
  assert.equal(
    bare.title,
    'Ollama — click to open the MEGAMIND tab',
    'missing model/tier segments are omitted, never "undefined"',
  );
});

// ── 2. the click route + the request channel ────────────────────────────────────────────────────────
await ok('route: MEGAMIND when the panel is reachable, Settings when it is not; the channel carries the tab', () => {
  assert.equal(backendRoute(true), 'megamind');
  assert.equal(backendRoute(false), 'settings');
  const seen = [];
  const off = onDevPanelRequest((id) => seen.push(id));
  requestDevPanel('megamind');
  assert.deepEqual(seen, ['megamind'], 'a panel request notifies its listeners with the tab id');
  assert.equal(consumeDevTabRequest(), 'megamind', 'the same request fills the pending-tab slot DevPanel consumes');
  assert.equal(consumeDevTabRequest(), null, 'the pending tab is consumed once');
  off();
  requestDevPanel('xray');
  assert.deepEqual(seen, ['megamind'], 'an unsubscribed listener hears nothing more');
  consumeDevTabRequest();
});

// ── 3. the real adapter drives the published status ─────────────────────────────────────────────────
await ok(
  'adapter: connect publishes ollama + model + tier; re-grade republishes; disconnect returns to rules',
  async () => {
    clearPending();
    const ollama = createOllamaModel({
      fetchImpl: answeringFetch,
      getRecord: getCapabilities,
      subscribe: () => () => {},
    });
    const chain = createMindChain(appleDownStub, ollama);
    const statuses = [];
    const off = on(Events.MIND_STATUS, (p) => statuses.push(p));
    setCapabilities(rec());
    const stop = startMind({
      model: chain,
      getSnapshot: () => ({ room: { lois: 'VIBE', davis: 'FLOW' } }),
      getSeed: () => 9,
    });
    assert.deepEqual(statuses[0], { available: true, backend: 'ollama', model: 'qwen3-vl:8b-instruct', tier: 'A' });
    assert.deepEqual(getMindStatus(), statuses[0], "a late mount's first read is the same published status");
    assert.deepEqual(indicatorFor(statuses[0], true), {
      backend: 'ollama',
      glyph: 'O',
      title: 'Ollama · qwen3-vl:8b-instruct · tier A — click to open the MEGAMIND tab',
    });
    for (let bar = 1; bar <= 3; bar++) {
      emit(Events.CLOCK_BAR, { bar });
      releaseTick('bar');
      await tick();
      await tick();
    }
    assert.equal(statuses.length, 1, 'a steady backend republishes nothing');
    // re-grade: same model, new measurement, tier B — the tooltip must not go stale
    setCapabilities(rec({ tier: 'B', probeMs: 5000, at: 2000 }));
    emit(Events.CLOCK_BAR, { bar: 4 });
    releaseTick('bar');
    await tick();
    assert.deepEqual(statuses.at(-1), { available: true, backend: 'ollama', model: 'qwen3-vl:8b-instruct', tier: 'B' });
    assert.equal(
      indicatorFor(statuses.at(-1), true).title,
      'Ollama · qwen3-vl:8b-instruct · tier B — click to open the MEGAMIND tab',
    );
    // disconnect: the registry clears, the next bar's status is the rules, the glyph follows
    setCapabilities(null);
    emit(Events.CLOCK_BAR, { bar: 5 });
    releaseTick('bar');
    await tick();
    assert.deepEqual(statuses.at(-1), { available: false, backend: 'rules' });
    assert.equal(indicatorFor(statuses.at(-1), true).glyph, 'R');
    assert.deepEqual(getMindStatus(), { available: false, backend: 'rules' });
    stop();
    off();
    clearPending();
  },
);

await ok('adapter: killing the model mid-session flips the published status to the Apple that answers', async () => {
  clearPending();
  const queue = [chat({ critique: null, line: 'from ollama' }), new Error('dead'), new Error('dead')];
  const fetchImpl = async () => {
    const next = queue.length ? queue.shift() : new Error('unscripted call');
    if (next instanceof Error) throw next;
    return { ok: true, status: 200, json: async () => ({ message: { content: next } }) };
  };
  const recordA = rec();
  const ollama = createOllamaModel({ fetchImpl, getRecord: () => recordA, subscribe: () => () => {} });
  const chain = createMindChain(appleUpStub, ollama);
  const statuses = [];
  const off = on(Events.MIND_STATUS, (p) => statuses.push(p));
  const stop = startMind({
    model: chain,
    getSnapshot: () => ({ room: { lois: 'VIBE', davis: 'FLOW' } }),
    getSeed: () => 9,
  });
  assert.equal(indicatorFor(statuses[0], true).glyph, 'O', 'the linked model answers at boot');
  const first = await chain.ask('lois', CTX, { bar: 1 });
  assert.equal(first.backend, 'ollama');
  const second = await chain.ask('lois', CTX, { bar: 2 });
  assert.equal(second.backend, 'apple', 'a failed ask falls through in the same breath');
  assert.equal(chain.info().backend, 'ollama', 'one failure is not death — and the status has not moved');
  const third = await chain.ask('lois', CTX, { bar: 3 });
  assert.equal(third.backend, 'apple');
  assert.equal(chain.info().backend, 'apple', 'the latch has flipped the selection itself');
  emit(Events.CLOCK_BAR, { bar: 4 });
  releaseTick('bar');
  await tick();
  assert.deepEqual(statuses.at(-1), { available: true, backend: 'apple', model: 'apple-foundation' });
  assert.deepEqual(indicatorFor(statuses.at(-1), true), {
    backend: 'apple',
    glyph: 'A',
    title: 'Apple Intelligence — click to open the MEGAMIND tab',
  });
  stop();
  off();
  clearPending();
});

// ── 4. the in-flight rule ───────────────────────────────────────────────────────────────────────────
await ok('in-flight: a connect that has not landed changes nothing; neither does an ask still in flight', async () => {
  clearPending();
  // (i) the connect: the registry publishes a record only when detection completes. Until then the
  // chain still names the rules — and even after the record lands, the published status (and so the
  // glyph) moves only when the thinker next publishes, never on the intent to connect.
  let current = null;
  const ollama = createOllamaModel({
    fetchImpl: answeringFetch,
    getRecord: () => current,
    subscribe: () => () => {},
  });
  const chain = createMindChain(appleDownStub, ollama);
  const statuses = [];
  const off = on(Events.MIND_STATUS, (p) => statuses.push(p));
  const stop = startMind({
    model: chain,
    getSnapshot: () => ({ room: { lois: 'VIBE', davis: 'FLOW' } }),
    getSeed: () => 9,
  });
  assert.deepEqual(statuses[0], { available: false, backend: 'rules' });
  const connectLands = (async () => {
    await tick();
    current = rec(); // the handshake completes here — not a tick earlier
  })();
  assert.equal(chain.info().backend, 'rules', 'while the connect is in flight, the rules are still the selection');
  assert.equal(indicatorFor(getMindStatus(), true).glyph, 'R');
  await connectLands;
  assert.equal(chain.info().backend, 'ollama', 'the landed record is the selection');
  assert.equal(statuses.length, 1, 'but nothing has published yet: the glyph has not moved');
  assert.equal(
    indicatorFor(getMindStatus(), true).glyph,
    'R',
    'the indicator follows the published status, not the intent',
  );
  emit(Events.CLOCK_BAR, { bar: 1 });
  releaseTick('bar');
  await tick();
  assert.equal(
    indicatorFor(statuses.at(-1), true).glyph,
    'O',
    'the next publish moves the glyph — when the backend actually changed',
  );
  stop();
  off();
  clearPending();

  // (ii) the ask: a fetch still in flight has not failed yet; the selection is unmoved until it settles.
  let resolveFetch;
  const pendingFetch = () =>
    new Promise((res) => {
      resolveFetch = res;
    });
  const model = createOllamaModel({ fetchImpl: pendingFetch, getRecord: () => rec(), subscribe: () => () => {} });
  const chain2 = createMindChain(appleUpStub, model);
  const inFlight = chain2.ask('lois', CTX, { bar: 1 });
  await tick();
  assert.equal(model.failures(), 0, 'an in-flight ask has not failed');
  assert.equal(chain2.info().backend, 'ollama', 'the glyph stays on the backend that is actually answering');
  resolveFetch({ ok: false, status: 500, json: async () => ({}) });
  await inFlight.catch(() => {});
  await tick();
  assert.equal(model.failures(), 1, 'the failure counts only once the ask settles');
});

// ── 5. the wiring ───────────────────────────────────────────────────────────────────────────────────
await ok('wiring: footer placement, the real gate + status in the component, both tab owners honour requests', () => {
  const app = src('src/App.jsx');
  const indicatorAt = app.indexOf('<BackendIndicator');
  assert.ok(indicatorAt > -1, 'App.jsx renders the backend indicator in the footer');
  assert.ok(
    indicatorAt < app.indexOf('title="Settings'),
    'the indicator sits beside the ≡ / ? micro-buttons, before Settings',
  );
  assert.ok(app.includes("setHelpTab('settings')"), 'the Settings route reuses the ≡ button\u2019s own handler shape');
  const comp = src('src/components/BackendIndicator.jsx');
  assert.ok(comp.includes('on(Events.MIND_STATUS'), 'the component subscribes to the published mind status');
  assert.ok(comp.includes('getMindStatus()'), "the component's first read is the last published status");
  assert.ok(comp.includes('devPanelAvailable()'), 'the click gate is the #2077 runtime gate itself, not a local guess');
  assert.ok(comp.includes("requestDevPanel('megamind')"), 'the panel route asks for the DEV panel at the MEGAMIND tab');
  assert.ok(comp.includes('backendRoute('), 'the destination is decided by the pinned route function');
  assert.ok(comp.includes('micro-btn'), 'the indicator wears the neighbouring micro-button dress');
  assert.ok(!/emoji|🦙|🍎/i.test(comp), 'no emoji: the glyph ruling is letters only');
  const shell = src('src/composition/Shell.jsx');
  assert.ok(shell.includes('onDevPanelRequest'), 'the Shell subscribes to panel requests');
  assert.ok(shell.includes("setActiveTab('dev')"), 'the Shell still owns the panel selection');
  const devPanel = src('src/panels/DevPanel.jsx');
  assert.ok(devPanel.includes('onDevPanelRequest'), 'a mounted DevPanel switches tabs on a panel request');
  assert.ok(devPanel.includes('consumeDevTabRequest()'), 'DevPanel consumes the pending tab the request sets');
});

console.log(`backendIndicator.selfcheck: ${n} checks passed`);
