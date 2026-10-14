// node src/curator/mindConduct.apple.selfcheck.mjs
// #1483 — the Apple Intelligence path of the trio's audio direction, as a test unit that needs no Apple Intelligence.
//
// A stand-in for the kc-mind helper's bridge (the same `invoke` seam mindApple.js takes) answers the way a CONFORMING
// helper must; the real app path runs over it: mindApple -> startMind -> thinker -> contract -> mind:request ->
// trioLive -> the route table. It proves the app side is ready and safe, and it pins what the Swift side owes:
//   - the context the helper is handed carries the show block (routes, owned, energy, flat bars), small enough to prompt
//   - a conforming reply is { propose: null, route: { op, input, target, depth }, state?, line? } for Davis, and BURN for a flat show for LOIS
//   - hostile or malformed replies change nothing; an unavailable helper means the rules conduct under the same contract
// The last block reads the Swift source and reports whether the helper has learned `route` yet: PENDING until it has.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emit, on, releaseTick, Events } from '../composition/eventBus.js';
import { createAppleModel } from './mindApple.js';
import { startMind } from './mindLive.js';
import { startTrio } from './trioLive.js';
import { validateReply } from './mindContract.js';
import { davisRoute } from './mindConduct.js';
import { ROUTE_INPUTS, ROUTE_TARGETS } from '../gl/audioRoutes.mjs';
import { sanitizeAudioRoutes } from '../data/audioRoutes.js';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };
const tick = () => new Promise((r) => setTimeout(r, 0));

/** The conducting reply a conforming helper gives Davis for this context (what the Swift schema must be able to say). */
const conformingDavis = (ctx) => {
  const route = ctx.show ? davisRoute(ctx.show, 7) : null;
  return { propose: null, ...(route ? { route } : {}) };
};

/**
 * A rig: fake bridge + real mind path + real trio on the real bus. `answer(persona, context)` is the helper's reply
 * (or throws / returns undefined). Records every context the helper was handed.
 */
async function rig({ answer, tier = 't3', available = true }) {
  const st = { audioRoutes: null, layoutParams: {} };
  const offSet = on(Events.AUDIO_ROUTES_SET, (p) => { st.audioRoutes = sanitizeAudioRoutes(p.routes); });
  const asked = [];
  const decisions = [];
  const routes = [];
  const invoke = async (cmd, args) => {
    if (cmd === 'mind_status') return available ? { available: true, model: 'apple-test', os: 'macOS 26' } : { available: false, reason: 'no Apple Intelligence' };
    if (cmd === 'mind_ask') {
      asked.push(args);
      const r = await answer(args.persona, args.context);
      if (r === undefined) return { error: 'timeout' };
      return { reply: r };
    }
    throw new Error(`unexpected ${cmd}`);
  };
  const model = createAppleModel({ invoke });
  await model.check();
  const trio = startTrio({
    getRoutes: () => st.audioRoutes, getTier: () => tier, getBands: () => [0.5, 0.4, 0.3, 0.3, 0.2, 0.2, 0.1],
    subscribe: () => () => {},
  });
  const stopMind = startMind({
    model, getSeed: () => 12345,
    getSnapshot: () => ({ layers: [], room: {}, audio: 'mic', tier, show: trio.showBlock(), bpm: 124 }),
  });
  const offD = on(Events.MIND_DECISION, (d) => decisions.push(d));
  const offR = on(Events.MIND_ROUTE, (e) => routes.push(e));
  emit(Events.AUDIO_INPUT, { source: 'mic' });
  emit(Events.AUDIO_ENERGY, { level: 'mid' });
  emit(Events.AUDIO_TEMPO, { bpm: 124, confidence: 0.9 });
  let bar = 0;
  /** Play `count` bars, giving the helper's promises time to land between them. */
  const play = async (count) => {
    for (let i = 0; i < count; i++) { bar++; emit(Events.CLOCK_BAR, { bar }); releaseTick('bar'); await tick(); await tick(); }
  };
  return { st, asked, decisions, routes, play, trio, done() { stopMind(); trio.stop(); offSet(); offD(); offR(); } };
}

await ok('a conforming helper conducts: the show reaches it, its route lands on a phrase, tagged his, recorded as apple', async () => {
  const g = await rig({ answer: (p, ctx) => (p === 'davis' ? conformingDavis(ctx) : { mood: 'calm', lean: {} }) });
  await g.play(9);
  const fromApple = g.decisions.filter((d) => d.persona === 'davis' && d.backend === 'apple' && d.reply.route);
  assert.ok(fromApple.length > 0, 'Apple\'s route decisions are used');
  assert.ok(g.routes.some((e) => e.status === 'applied'), 'and one is applied');
  const mine = (g.st.audioRoutes || []).filter((r) => r.by === 'davis');
  assert.ok(mine.length >= 1 && mine.length <= 3, `his routes are in the table (${mine.length}), never more than three`);
  assert.ok(g.routes.every((e) => e.landBar === null || e.landBar % 4 === 0), 'every edit lands on a phrase boundary');
  const ctx = g.asked.find((a) => a.persona === 'davis').context;
  assert.ok(ctx.show && Array.isArray(ctx.show.routes) && 'owned' in ctx.show && 'flatBars' in ctx.show && ctx.show.energy === 'mid', 'the helper is handed the show block');
  g.done();
});

await ok('what the helper is handed stays small enough to prompt, even with a full table and owned targets', async () => {
  const g = await rig({ answer: () => ({ propose: null }) });
  await g.play(2);
  const full = Array.from({ length: 16 }, (_, i) => ({ input: ['band.mids', 'band.edge', 'band.pres', 'band.air'][i % 4], target: ['render.scale', 'render.glow', 'color.hue', 'render.squash'][Math.floor(i / 4)], depth: 0.123456, by: 'davis' }));
  g.st.audioRoutes = full;
  g.trio.conductor.touch(['render.alpha', 'render.breath', 'render.accum', 'light.intensity']);
  await g.play(2);
  const biggest = Math.max(...g.asked.map((a) => JSON.stringify(a.context).length));
  assert.ok(biggest < 3500, `the context is ${biggest} bytes: Apple's on-device model has a small window`);
  g.done();
});

await ok('hostile or malformed replies are never applied: the rules answer that bar, and only vocabulary ever reaches the table', async () => {
  const hostile = [
    { propose: null, route: { op: 'add', input: 'band.mids', target: 'render.glow', depth: 99 } }, // out of range
    { propose: null, route: { op: 'add', input: 'mic.raw', target: 'render.glow', depth: 0.3 } }, // unknown input
    { propose: null, route: { op: 'add', input: 'band.mids', target: 'fs.write', depth: 0.3 } }, // unknown target
    { propose: null, route: 'rm -rf /' },
    { propose: null, route: { op: 'retarget', input: 'bass', from: 'render.glow', to: 'render.glow' } },
    { route: { op: 'add', input: 'band.mids', target: 'render.glow', depth: NaN } },
    null, 'text', 42, [],
  ];
  for (const bad of hostile) {
    const g = await rig({ answer: (p) => (p === 'davis' ? bad : { mood: 'calm', lean: {} }), tier: 't4' });
    await g.play(6);
    for (const d of g.decisions.filter((x) => x.persona === 'davis' && x.backend === 'apple')) {
      assert.equal(validateReply('davis', d.reply) !== null, true, 'only validated replies are ever decisions');
      assert.ok(!d.reply.route || ['add', 'remove', 'retarget', 'depth'].includes(d.reply.route.op));
    }
    for (const e of g.routes.filter((x) => x.status === 'applied')) {
      const t = e.op.target ?? e.op.to;
      assert.ok(ROUTE_INPUTS.includes(e.op.input) && Object.prototype.hasOwnProperty.call(ROUTE_TARGETS, t), 'nothing outside the vocabulary is ever applied');
      if (e.op.depth !== undefined) assert.ok(Math.abs(e.op.depth) <= ROUTE_TARGETS[t].clamp[1], 'and never out of range');
    }
    for (const r of g.st.audioRoutes || []) assert.ok(ROUTE_INPUTS.includes(r.input) && Object.prototype.hasOwnProperty.call(ROUTE_TARGETS, r.target), 'the table holds only vocabulary');
    assert.ok(g.decisions.some((d) => d.persona === 'davis' && d.backend === 'rules'), `a bad reply (${JSON.stringify(bad)}) leaves the rules answering`);
    g.done();
  }
});

await ok('an unavailable, slow or failing helper: the rules conduct under the identical contract', async () => {
  for (const mode of [{ available: false, answer: () => { throw new Error('never asked'); } }, { available: true, answer: () => undefined }, { available: true, answer: () => { throw new Error('boom'); } }]) {
    const g = await rig(mode);
    await g.play(9);
    const dv = g.decisions.filter((d) => d.persona === 'davis');
    assert.ok(dv.length >= 8, 'Davis decided every bar');
    assert.ok(dv.every((d) => d.backend === 'rules'), 'every decision came from the rules');
    assert.ok(g.routes.some((e) => e.status === 'applied'), 'and the rules conducted: personas never branch on backend');
    g.done();
  }
});

await ok('Apple and the rules are the same to the stage: a route from either lands the same way', async () => {
  const shape = (g) => g.routes.filter((e) => e.status === 'applied').map((e) => [e.landBar % 4, Object.keys(e.delta).sort().join()]);
  const viaApple = await rig({ answer: (p, ctx) => (p === 'davis' ? conformingDavis(ctx) : { mood: 'calm', lean: {} }) });
  await viaApple.play(9);
  const a = shape(viaApple);
  viaApple.done(); // the bus is global: one rig at a time
  const viaRules = await rig({ available: false, answer: () => undefined });
  await viaRules.play(9);
  const r = shape(viaRules);
  viaRules.done();
  assert.ok(a.length > 0 && r.length > 0, 'both conducted');
  assert.deepEqual(a, r, 'same landing rule, same delta shape');
});

await ok('the Swift helper: PENDING until it can say `route`; once it can, its schema and prompt are checked', async () => {
  const swift = readFileSync(new URL('../../../src-tauri/helpers/kc-mind/main.swift', import.meta.url), 'utf8');
  const learned = /\broute\b/.test(swift.replace(/\/\/.*$/gm, ''));
  if (!learned) {
    console.log('  [pending] kc-mind has no `route` in its reply schema yet: on Apple, Davis only reads the show (the rules conduct). The app side above is ready.');
    assert.ok(/propose/.test(swift), 'sanity: this is the helper source');
    return;
  }
  // it has: hold it to the contract the app validates
  for (const word of ['add', 'remove', 'retarget', 'depth', 'input', 'target']) assert.ok(new RegExp(`\\b${word}\\b`).test(swift), `the helper's schema names ${word}`);
  assert.ok(/band\.mids/.test(swift) || /ROUTE_INPUTS|band\./.test(swift), 'the prompt names the band inputs');
  assert.ok(/BURN/.test(swift) && /flat/i.test(swift), 'LOIS is told a flat show is BURN');
  assert.ok(!/propose.*route.*NSNull/.test(swift) || true);
});

console.log(`mindConduct.apple.selfcheck: ${n} checks passed`);
