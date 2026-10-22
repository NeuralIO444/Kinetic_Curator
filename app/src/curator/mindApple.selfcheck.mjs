// #1463 Mind 2 — Apple Intelligence through the desktop helper: the default when available, rules otherwise, silently.
// mind:req / mind:reply / mind:status shapes; the model/system recorded in a take; on-device only; no model UI.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAppleModel, desktopAppleModel, ASK_TIMEOUT_MS } from './mindApple.js';
import { startMind, setMindTap, getMindSystem, contextHash } from './mindLive.js';
import { createMindRecorder, checkMindRecord } from './mindRecord.js';
import { Events, emit, on, releaseTick, clearPending } from '../composition/eventBus.js';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

const fakeInvoke = (status, replyFor) => {
  const calls = [];
  const invoke = async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === 'mind_status') return status;
    if (cmd === 'mind_ask') return replyFor(args);
    throw new Error('unknown command');
  };
  return { invoke, calls };
};

await ok('the capability check: available with model and OS, or unavailable with a reason; never throws', async () => {
  const up = createAppleModel(fakeInvoke({ available: true, model: 'apple-foundation', os: '26.0.1' }, () => ({})));
  assert.equal(up.available(), false, 'unknown until checked: the rules answer');
  assert.deepEqual(await up.check(), { available: true, model: 'apple-foundation', os: '26.0.1' });
  assert.equal(up.available(), true);
  const down = createAppleModel(fakeInvoke({ available: false, reason: 'appleIntelligenceNotEnabled', os: '26.0' }, () => ({})));
  assert.deepEqual(await down.check(), { available: false, reason: 'appleIntelligenceNotEnabled', os: '26.0' });
  const broken = createAppleModel({ invoke: async () => { throw new Error('no helper'); } });
  assert.equal((await broken.check()).available, false);
  assert.equal(await desktopAppleModel(), null, 'not the desktop app (the web, node): no model, rules only');
});

await ok('ask: the reply, or a rejection the rules cover; the app asks for the 300 ms cap; "unavailable" flips it off', async () => {
  assert.ok(ASK_TIMEOUT_MS >= 200 && ASK_TIMEOUT_MS <= 400, 'inside the decided 200-400 ms');
  let mode = 'ok';
  const f = fakeInvoke({ available: true, model: 'apple-foundation' }, () => (mode === 'ok' ? { reply: { critique: null, state: 'NOD' }, ms: 120 } : mode === 'slow' ? { reply: null, error: 'timeout', ms: 300 } : { reply: null, error: 'unavailable' }));
  const m = createAppleModel({ invoke: f.invoke });
  await m.check();
  assert.deepEqual(await m.ask('lois', { v: 2 }, { seed: 5, bar: 3 }), { critique: null, state: 'NOD' });
  assert.deepEqual(f.calls.at(-1), ['mind_ask', { persona: 'lois', context: { v: 2 }, seed: 5, bar: 3, timeoutMs: ASK_TIMEOUT_MS }]);
  mode = 'slow';
  await assert.rejects(() => m.ask('lois', {}, { seed: 1, bar: 4 }), /timeout/);
  assert.equal(m.available(), true, 'a slow bar is not an outage');
  mode = 'down';
  await assert.rejects(() => m.ask('lois', {}, { seed: 1, bar: 5 }));
  assert.equal(m.available(), false, 'the helper said unavailable: rules from now on');
});

await ok('mind:req / mind:reply / mind:status fire with their shapes; rules answers are reported too; personas never branch', async () => {
  clearPending();
  const f = fakeInvoke({ available: true, model: 'apple-foundation', os: '26.0.1' }, (a) => ({ reply: a.persona === 'queen' ? { mood: 'lift', lean: {} } : a.persona === 'lois' ? { critique: null, state: { id: 'side-eye', intensity: 0.5, decay: 1 } } : { propose: 'junk' }, ms: 90 }));
  const apple = createAppleModel({ invoke: f.invoke });
  await apple.check();
  const got = { req: [], reply: [], status: [], decision: [] };
  const offs = [on(Events.MIND_REQ, (p) => got.req.push(p)), on(Events.MIND_REPLY, (p) => got.reply.push(p)), on(Events.MIND_STATUS, (p) => got.status.push(p)), on(Events.MIND_DECISION, (p) => got.decision.push(p))];
  const stop = startMind({ model: apple, getSnapshot: () => ({ room: { lois: 'VIBE', davis: 'FLOW' } }), getSeed: () => 9 });
  assert.deepEqual(got.status[0], { available: true, backend: 'apple', model: 'apple-foundation' });
  assert.deepEqual(getMindSystem(), { backend: 'apple', model: 'apple-foundation', os: '26.0.1' });
  emit(Events.CLOCK_BAR, { bar: 1 }); releaseTick('bar');
  await tick(); await tick(); await tick();
  assert.equal(got.req.length, 3, 'every persona asks on an eligible bar');
  for (const r of got.req) assert.match(r.contextHash, /^[0-9a-f]{8}$/);
  const appleReplies = got.reply.filter((r) => r.backend === 'apple');
  assert.equal(appleReplies.length, 3);
  assert.ok(appleReplies.every((r) => Number.isFinite(r.latencyMs)));
  assert.equal(appleReplies.find((r) => r.persona === 'davis').reply, null, 'a malformed answer is reported as null');
  assert.equal(appleReplies.find((r) => r.persona === 'davis').error, 'malformed');
  assert.equal(got.reply.filter((r) => r.backend === 'rules').length, 3, 'the bar the model had not answered yet: rules, reported');
  emit(Events.CLOCK_BAR, { bar: 2 }); releaseTick('bar');
  const bar2 = got.decision.filter((d) => d.bar === 2);
  assert.equal(bar2.find((d) => d.persona === 'lois').backend, 'apple');
  assert.equal(bar2.find((d) => d.persona === 'davis').backend, 'rules', 'invalid apple reply: the rules answered that bar');
  assert.equal(contextHash({ a: 1 }), contextHash({ a: 1 }));
  stop(); offs.forEach((o) => o()); clearPending();
  assert.equal(getMindSystem(), null);
});

await ok('a take records the model and system version of every non-rules backend that answered in it', async () => {
  clearPending();
  const apple = createAppleModel(fakeInvoke({ available: true, model: 'apple-foundation', os: '26.0.1' }, () => ({ reply: { mood: 'calm', lean: {} } })));
  await apple.check();
  const rec = createMindRecorder({ getFrame: () => 0, getSystem: getMindSystem });
  setMindTap((d, r) => rec.update(d, r));
  const stop = startMind({ model: apple, getSnapshot: () => ({}), getSeed: () => 1 });
  emit(Events.CLOCK_BAR, { bar: 1 }); await tick(); await tick();
  emit(Events.CLOCK_BAR, { bar: 2 });
  stop(); setMindTap(null); clearPending();
  const record = rec.finish();
  assert.deepEqual(record.systems, { apple: { model: 'apple-foundation', os: '26.0.1' } });
  assert.ok(checkMindRecord(record));
  assert.equal(checkMindRecord({ ...record, systems: { cloud: {} } }), null, 'only known backends');
  assert.equal(checkMindRecord({ ...record, systems: { apple: { model: 7 } } }), null);
  const rulesOnly = createMindRecorder();
  rulesOnly.update({ persona: 'lois', bar: 1, backend: 'rules', seed: 1, invented: false, reply: { critique: null } }, false);
  assert.ok(!('systems' in rulesOnly.finish()), 'a rules-only take names no model');
});

await ok('on-device only, no model UI, roadmap reads "no cloud AI"', () => {
  const swift = read('../../../src-tauri/helpers/kc-mind/main.swift');
  assert.ok(!/URLSession|NWConnection|Network\b|socket|http:\/\/|https:\/\//.test(swift.replace(/\/\/.*$/gm, '')), 'the helper opens no network connection');
  assert.match(swift, /import FoundationModels/);
  const rust = read('../../../src-tauri/src/mind/mod.rs');
  assert.ok(!/TcpStream|TcpListener|UdpSocket|reqwest|hyper/.test(rust), 'the bridge is stdio only');
  assert.match(read('../../../src-tauri/tauri.conf.json'), /"externalBin": \["binaries\/kc-mind"\]/);
  // no picker, wizard, download or endpoint setting: nothing in the UI calls the helper or names a model
  const app = read('../App.jsx');
  assert.match(app, /model: DEBUG_MIND \? demoModel : appleModel/);
  for (const ui of ['../components/PerformanceButton.jsx', '../panels/directors/RoomCodec.jsx', '../components/LoisPill.jsx', '../panels/pipeline/DataExportRow.jsx']) {
    assert.ok(!/mind_status|mind_ask|desktopAppleModel|apple-foundation/.test(read(ui)), `${ui} has no model controls`);
  }
  const roadmap = read('../../../docs/ROADMAP_PETRI_DISH.md');
  assert.match(roadmap, /No cloud AI/);
  assert.ok(!/No live AI inside the app/.test(roadmap));
});

console.log(`mindApple.selfcheck: ${n} checks passed`);
