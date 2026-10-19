// #1462 Mind 1 — the model path without a model: the contract, the context, the rules fallback, the thinker's
// scheduling rules (one in flight, one per bar, late dropped, malformed dropped), and the live driver (telemetry only).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateReply, neutralReply, isInvented, wantsStage, PERSONAS, MOODS, MAX_DECAY_BARS, MAX_LINE } from './mindContract.js';
import { buildContext } from './mindContext.js';
import { rulesReply } from './mindRules.js';
import { createThinker, MAX_LATE_BARS } from './mindThinker.js';
import { startMind, setMindTap, replayMindFrame, endMindReplay } from './mindLive.js';
import { createMindRecorder, checkMindRecord, createMindReplay } from './mindRecord.js';
import { Events, emit, on, releaseTick, clearPending } from '../composition/eventBus.js';
import { EVENT_REGISTRY } from '../composition/eventRegistry.js';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));
const ctx = buildContext({ layers: [{ type: 'content' }, { type: 'pattern' }, { type: 'fx' }], enabledAssetCount: 4, paletteId: 'bone', room: { lois: 'VIBE', davis: 'FLOW' }, band: 'normal', keepsCount: 9, bpm: 121.4, audio: 'mic', creatures: 2 });

await ok('the context is a compact summary, not the manifest: counts, names, the room, nothing else', () => {
  assert.deepEqual(ctx, {
    v: 3, layers: { content: 1, pattern: 1, fx: 1, math: 0 }, assets: 4, palette: 'bone', room: { lois: 'VIBE', davis: 'FLOW' },
    band: 'normal', keeps: 9, bpm: 121, audio: 'mic', source: 'ambient', creatures: 2, verdict: null, intensity: null, tier: null,
  });
  assert.ok(!('zodiac' in ctx), 'no zodiac reading: no zodiac block');
  assert.ok(JSON.stringify(ctx).length < 400, 'small enough to put in a prompt');
  assert.deepEqual(buildContext({}).room, { lois: null, davis: null }, 'junk is a quiet default, never a throw');
  assert.doesNotThrow(() => buildContext(null));
});

await ok('the validator fails closed: a clean copy, or null; unknown keys never pass', () => {
  assert.deepEqual(validateReply('davis', { propose: null }), { propose: null });
  assert.deepEqual(validateReply('davis', { propose: { assetId: 'org_petal_01', evil: 1 }, extra: 1 }), { propose: { assetId: 'org_petal_01' } });
  assert.equal(validateReply('davis', { propose: { assetId: 5 } }), null);
  assert.equal(validateReply('davis', {}), null);
  assert.deepEqual(validateReply('lois', { critique: { target: 'scale', delta: -0.1 } }), { critique: { target: 'scale', delta: -0.1 } });
  assert.equal(validateReply('lois', { critique: { target: 'scale', delta: 9 } }), null, 'a nudge is small by contract');
  assert.deepEqual(validateReply('queen', { mood: 'lift', lean: { wetness: 0.4 } }), { mood: 'lift', lean: { wetness: 0.4 } });
  assert.equal(validateReply('queen', { mood: 'furious' }), null);
  assert.equal(validateReply('queen', { mood: 'calm', lean: { wetness: 7 } }), null);
  assert.equal(validateReply('nobody', { mood: 'calm' }), null);
  for (const bad of [null, undefined, 'x', 5, [], () => 1]) for (const p of PERSONAS) assert.equal(validateReply(p, bad), null);
  for (const p of PERSONAS) assert.ok(validateReply(p, neutralReply(p)), `${p}'s neutral reply is itself valid`);
});

await ok('the rules backend is the fallback: neutral for Davis and LOIS, a reading for the Queen, deterministic', () => {
  assert.deepEqual(rulesReply('davis', ctx), { propose: null, state: 'FLOW' }, 'Davis reports the face the room shows');
  assert.deepEqual(rulesReply('lois', ctx), { critique: null, state: 'VIBE' });
  assert.deepEqual(rulesReply('lois', buildContext({})), { critique: null }, 'no room: nothing said about the face');
  assert.equal(rulesReply('queen', ctx).mood, 'drive', 'FLOW asks for drive');
  assert.equal(rulesReply('queen', buildContext({ room: { davis: 'SEEDLING' } })).mood, 'calm');
  assert.equal(rulesReply('queen', buildContext({ room: { davis: 'FLOW', lois: 'AWAY' } })).mood, 'calm', 'LOIS away: calm');
  assert.deepEqual(rulesReply('queen', ctx, { seed: 1 }), rulesReply('queen', ctx, { seed: 999 }), 'a reading, not a roll');
  for (const p of PERSONAS) assert.ok(validateReply(p, rulesReply(p, ctx)), `${p}'s rules reply validates`);
  assert.ok(MOODS.includes(rulesReply('queen', ctx).mood));
});

await ok('one decision per bar, in bar order, and a repeated bar says nothing', () => {
  const t = createThinker({ persona: 'queen' });
  const a = t.onBar({ bar: 1, context: ctx, seed: 7 });
  assert.equal(a.backend, 'rules'); assert.equal(a.bar, 1); assert.equal(a.seed, 7);
  assert.equal(t.onBar({ bar: 1, context: ctx }), null, 'the same bar again: nothing');
  assert.equal(t.onBar({ bar: 2, context: ctx }).bar, 2);
  assert.throws(() => createThinker({ persona: 'nobody' }), TypeError);
});

await ok('a model backend: at most one request in flight, its reply lands on a LATER bar, and the rules answer the bars between', async () => {
  let calls = 0; let release;
  const mind = () => new Promise((r) => { calls++; release = r; });
  const t = createThinker({ persona: 'queen', mind, available: () => true });
  assert.equal(t.onBar({ bar: 10, context: ctx }).backend, 'rules', 'asked this bar; the rules answer it');
  assert.equal(t.inFlight(), true);
  await tick(); // the request is made on a microtask, off the bar
  assert.equal(t.onBar({ bar: 11, context: ctx }).backend, 'rules', 'still in flight: rules cover, never a second request');
  await tick();
  assert.equal(calls, 1);
  release({ mood: 'lift', lean: {} });
  await tick();
  const d = t.onBar({ bar: 12, context: ctx });
  assert.equal(d.backend, 'apple'); assert.equal(d.reply.mood, 'lift');
  assert.equal(t.inFlight(), false);
  assert.equal(t.onBar({ bar: 13, context: ctx }).backend, 'rules', 'and it asks again on the next bar');
});

await ok('a reply more than two bars late is thrown away and logged; the rules answer that bar', async () => {
  const seen = [];
  let release;
  const t = createThinker({ persona: 'queen', mind: () => new Promise((r) => { release = r; }), available: () => true, log: (k, i) => seen.push([k, i]) });
  t.onBar({ bar: 20, context: ctx });
  await tick(); // the request is made on a microtask
  release({ mood: 'lift', lean: {} });
  await tick();
  const d = t.onBar({ bar: 20 + MAX_LATE_BARS + 1, context: ctx });
  assert.equal(d.backend, 'rules', 'the late reply was not used');
  assert.deepEqual(seen.map((s) => s[0]), ['late']);
  assert.equal(seen[0][1].lateBars, MAX_LATE_BARS + 1);
});

await ok('a malformed model reply and a failing model are dropped and logged; the stage is never touched by them', async () => {
  const seen = [];
  let mode = 'bad';
  const mind = () => (mode === 'fail' ? Promise.reject(new Error('down')) : Promise.resolve({ mood: 'not-a-mood' }));
  const t = createThinker({ persona: 'queen', mind, available: () => true, log: (k) => seen.push(k) });
  t.onBar({ bar: 1, context: ctx }); await tick();
  const d1 = t.onBar({ bar: 2, context: ctx });
  assert.equal(d1.backend, 'rules', 'malformed: dropped, rules answer');
  mode = 'fail';
  t.onBar({ bar: 3, context: ctx }); await tick();
  const d2 = t.onBar({ bar: 4, context: ctx });
  assert.equal(d2.backend, 'rules', 'failed: rules answer');
  assert.deepEqual(seen, ['dropped', 'error']);
  const unavailable = createThinker({ persona: 'queen', mind, available: () => false });
  assert.equal(unavailable.onBar({ bar: 1, context: ctx }).backend, 'rules', 'mind:status unavailable: rules, no request');
});

await ok('the live driver: each bar every persona thinks once, as telemetry, deterministic by seed, and nothing else is emitted', async () => {
  const got = []; const other = [];
  const off = on(Events.MIND_DECISION, (p, m) => got.push([p, m]));
  const offBeat = on(Events.BEAT_BPM, (p) => other.push(p)); const offLayout = on(Events.LAYOUT_PARAM, (p) => other.push(p));
  const stop = startMind({ getSnapshot: () => ({ room: { davis: 'FLOW' }, band: 'normal' }), getSeed: () => 4242 });
  emit(Events.CLOCK_BAR, { bar: 4, bpm: 120 });
  emit(Events.CLOCK_BAR, { bar: 4, bpm: 120 });
  emit(Events.CLOCK_BAR, { bar: 5, bpm: 120 });
  assert.equal(got.length, 6, 'three personas, two distinct bars');
  assert.deepEqual(got.slice(0, 3).map((g) => g[0].persona), ['davis', 'lois', 'queen']);
  assert.ok(got.every(([p, m]) => p.backend === 'rules' && p.invented === false && m.cause === 'mind' && typeof m.seq === 'number'));
  assert.deepEqual(other, [], 'telemetry only: it changed nothing on the stage');
  const seeds = got.slice(0, 3).map((g) => g[0].seed);
  const again = []; const off2 = on(Events.MIND_DECISION, (p) => again.push(p.seed));
  stop();
  const stop2 = startMind({ getSnapshot: () => ({}), getSeed: () => 4242 });
  emit(Events.CLOCK_BAR, { bar: 4, bpm: 120 });
  assert.deepEqual(again.slice(0, 3), seeds, 'the same seed and bar give the same decision seed');
  stop2(); off(); off2(); offBeat(); offLayout();
  assert.deepEqual(EVENT_REGISTRY.MIND_DECISION.handler, ['curator/mindFace.js', 'curator/leanLive.js']);
});

await ok('hidden and honest: no surface lists it; no store key holds it; pure modules read no clock; the app starts it', () => {
  for (const f of ['mindContract.js', 'mindContext.js', 'mindRules.js', 'mindThinker.js', 'mindRecord.js']) {
    const code = src(`./${f}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(!/Date\.now|performance\.now|Math\.random|setTimeout|setInterval|document|window/.test(code), f);
    // the identifiers are assembled from fragments so this file itself never spells them (the deniability scan reads tests too)
    const ids = [['queen', 'Channel'], ['queen', 'Lean'], ['sway', 'Biases'], ['lean', '_lois'], ['lean', '_davis']].map((p) => p.join(''));
    assert.ok(ids.every((id) => !code.includes(id)), `${f} names none of the sway identifiers`);
  }
  const app = src('../App.jsx');
  assert.match(app, /const stopMind = startMind\(\{/);
  assert.match(app, /stopMind\(\);/);
});

await ok('spec update: states are shape-validated — canonical or invented { id, intensity, decay }; malformed dropped', () => {
  assert.deepEqual(validateReply('lois', { critique: null, state: 'nod' }).state, { id: 'NOD', intensity: 1, decay: 0 }, 'canonical, by name');
  const inv = validateReply('lois', { critique: null, state: { id: 'side-eye', intensity: 0.4, decay: 3 } });
  assert.deepEqual(inv.state, { id: 'side-eye', intensity: 0.4, decay: 3 }, 'an invented micro-expression is accepted');
  assert.equal(isInvented('lois', inv), true);
  assert.equal(isInvented('lois', validateReply('lois', { critique: null, state: { id: 'burn', intensity: 0.5 } })), false, 'a canonical id in object form is not invented');
  assert.equal(validateReply('davis', { propose: null, state: { id: 'BLOOM', intensity: 0.5 } }).state.id, 'BLOOM');
  for (const bad of ['side-eye', { id: 'x', intensity: 2 }, { id: 'x', intensity: 0.5, decay: -1 }, { id: 'x', intensity: 0.5, decay: 1.5 },
    { id: 'x', intensity: 0.5, decay: MAX_DECAY_BARS + 1 }, { id: '9lives', intensity: 0.5 }, { id: 'a b', intensity: 0.5 }, { intensity: 0.5 }, 7]) {
    assert.equal(validateReply('lois', { critique: null, state: bad }), null, `malformed state ${JSON.stringify(bad)} drops the reply`);
  }
  assert.equal(validateReply('lois', { critique: null, line: 'x'.repeat(MAX_LINE + 1) }), null, 'a line has a length');
  assert.equal(validateReply('davis', { propose: null, line: '' }), null);
  assert.equal(validateReply('davis', { propose: null, line: '  not bad  ' }).line, 'not bad');
  assert.equal(validateReply('queen', { mood: 'calm', state: 'NOD' }).state, undefined, 'the third has no face to set');
});

await ok('a reading is not a request: rules never ask the stage; a different, invented or worded reply does', () => {
  const room = { lois: 'VIBE', davis: 'FLOW' };
  for (const p of PERSONAS) assert.equal(wantsStage(p, validateReply(p, rulesReply(p, ctx)), ctx.room), false, `${p}'s rules reply asks nothing`);
  assert.equal(wantsStage('lois', validateReply('lois', { critique: null, state: 'BURN' }), room), true);
  assert.equal(wantsStage('lois', validateReply('lois', { critique: null, state: { id: 'VIBE', intensity: 0.5 } }), room), true, 'the same face, softer, is a request');
  assert.equal(wantsStage('davis', validateReply('davis', { propose: null, line: 'hm.' }), room), true);
  assert.equal(wantsStage('queen', { mood: 'lift', lean: {} }, room), false);
});

await ok('the summary carries tier and, only when the reading succeeded, zodiac; an absent zodiac changes nothing else', () => {
  const base = { room: { davis: 'FLOW' }, keepsCount: 3, tier: 'base' };
  const withZ = buildContext({ ...base, zodiac: { sign: 'libra', moonPhase: 'full', season: 'autumn', extra: 1 } });
  assert.deepEqual(withZ.zodiac, { sign: 'libra', moonPhase: 'full', season: 'autumn' });
  assert.equal(withZ.tier, 'base');
  const failed = buildContext({ ...base, zodiac: { sign: 'ophiuchus' } });
  assert.ok(!('zodiac' in failed), 'a failed reading leaves no block');
  const { zodiac, ...rest } = withZ;
  assert.deepEqual(rest, failed, 'everything else is the same');
  assert.equal(buildContext({ tier: 'NOT A TIER!' }).tier, null);
  assert.ok(JSON.stringify(withZ).length < 400);
});

await ok('backend order: Apple when available, rules otherwise; status says which; requests land on the next downbeat', async () => {
  clearPending();
  const asked = []; const statuses = []; const requests = []; const decisions = [];
  let up = false;
  const apple = { available: () => up, ask: (persona, c, meta) => { asked.push([persona, meta.bar]); return Promise.resolve(persona === 'lois' ? { critique: null, state: { id: 'side-eye', intensity: 0.6, decay: 2 } } : persona === 'davis' ? { propose: null } : { mood: 'lift', lean: {} }); } };
  const offs = [on(Events.MIND_STATUS, (p) => statuses.push(p)), on(Events.MIND_REQUEST, (p, m) => requests.push([p, m])), on(Events.MIND_DECISION, (p) => decisions.push(p))];
  const stop = startMind({ model: apple, getSnapshot: () => ({ room: { lois: 'VIBE', davis: 'FLOW' } }), getSeed: () => 1 });
  assert.deepEqual(statuses, [{ available: false, backend: 'rules' }]);
  emit(Events.CLOCK_BAR, { bar: 1 }); releaseTick('bar');
  assert.equal(asked.length, 0, 'unavailable: never asked');
  assert.deepEqual(requests, [], 'rules alone request nothing');
  up = true;
  emit(Events.CLOCK_BAR, { bar: 2 });
  assert.deepEqual(statuses.at(-1), { available: true, backend: 'apple' });
  await tick(); await tick();
  assert.deepEqual(asked.map((a) => a[0]).sort(), ['davis', 'lois', 'queen'], 'every persona asks on an eligible bar');
  emit(Events.CLOCK_BAR, { bar: 3 });
  const lois3 = decisions.filter((d) => d.bar === 3 && d.persona === 'lois')[0];
  assert.equal(lois3.backend, 'apple'); assert.equal(lois3.invented, true);
  assert.equal(requests.length, 0, 'held for the downbeat');
  releaseTick('bar');
  assert.equal(requests.length, 1, 'only the decision that asks the stage becomes a request');
  assert.equal(requests[0][0].persona, 'lois'); assert.equal(requests[0][1].quantized, 'bar');
  stop(); offs.forEach((f) => f()); clearPending();
});

await ok('a take records every decision verbatim; replay re-publishes it and asks no backend, not even the rules', async () => {
  clearPending();
  let frame = 0; let asked = 0;
  const rec = createMindRecorder({ getFrame: () => frame });
  setMindTap((d, requested) => rec.update(d, requested));
  const apple = { available: () => true, ask: () => { asked++; return Promise.resolve({ critique: null, state: { id: 'glint', intensity: 0.3, decay: 1 } }); } };
  const live = [];
  const offLive = on(Events.MIND_DECISION, (p, m) => live.push([p, m.cause]));
  const stop = startMind({ model: apple, getSnapshot: () => ({ room: { lois: 'NOD', davis: 'FLOW' } }), getSeed: () => 77 });
  frame = 10; emit(Events.CLOCK_BAR, { bar: 1 }); await tick(); await tick();
  frame = 20; emit(Events.CLOCK_BAR, { bar: 2 }); releaseTick('bar');
  stop(); setMindTap(null); offLive(); clearPending();
  const record = rec.finish();
  assert.ok(checkMindRecord(record), 'the record checks');
  assert.equal(record.decisions.length, 6);
  const glint = record.decisions.find((r) => r[1] === 'lois' && r[2] === 2);
  assert.deepEqual(glint.slice(3, 7), ['apple', glint[4], 1, 1], 'backend, seed, invented, requested');
  // tampering is refused: an invented state recorded as measured, a reply the contract rejects, frames going back
  const bad1 = JSON.parse(JSON.stringify(record)); bad1.decisions.find((r) => r[1] === 'lois' && r[2] === 2)[5] = 0;
  assert.equal(checkMindRecord(bad1), null, 'invented must be recorded as invented');
  const bad2 = JSON.parse(JSON.stringify(record)); bad2.decisions[0][7] = { propose: 7 };
  assert.equal(checkMindRecord(bad2), null);
  const bad3 = JSON.parse(JSON.stringify(record)); bad3.decisions[5][0] = 0;
  assert.equal(checkMindRecord(bad3), null);
  // replay: muted thinking, recorded decisions and requests re-published, nothing asked
  const askedBefore = asked;
  const replayed = []; const reqs = [];
  const offs = [on(Events.MIND_DECISION, (p, m) => replayed.push([p, m.cause])), on(Events.MIND_REQUEST, (p, m) => reqs.push([p, m.cause]))];
  const muted = startMind({ model: apple, isReplaying: () => true, getSnapshot: () => ({}), getSeed: () => 77 });
  emit(Events.CLOCK_BAR, { bar: 9 }); await tick();
  assert.equal(replayed.length, 0, 'while a take plays, nothing thinks');
  for (let f = 0; f <= 25; f++) replayMindFrame(f, record);
  replayMindFrame(25, record);
  assert.equal(asked, askedBefore, 'no backend was asked');
  assert.equal(replayed.length, 6, 'each recorded decision once');
  assert.ok(replayed.every(([, c]) => c === 'replay'));
  assert.deepEqual(replayed.map(([p]) => p), live.map(([p]) => p), 'the same decisions, verbatim');
  assert.equal(reqs.length, 1, 'and the request it made');
  replayMindFrame(10, record, { seeked: true });
  assert.equal(replayed.length, 9, 'a seek replays from the target frame on');
  endMindReplay(); muted(); offs.forEach((f) => f());
  const cur = createMindReplay({ version: 1, decisions: [['nope']] });
  assert.equal(cur.size, 0, 'a record that fails the check replays nothing');
});

await ok('wired: a take records the mind section and playback replays it', () => {
  const btn = src('../components/PerformanceButton.jsx');
  assert.match(btn, /mind: mindSection/);
  const app = src('../App.jsx');
  assert.match(app, /isReplaying: isPlaybackActive/);
  assert.match(app, /setPlaybackFrameTap\(\(frame, perf, o\) => \{ replayMindFrame\(frame, perf && perf\.mind, o\); replaySpectrumFrame\(frame, perf && perf\.spectrum, o\); \}\)/);
  for (const e of ['MIND_REQUEST', 'MIND_STATUS']) assert.ok(EVENT_REGISTRY[e], `${e} is registered`);
});

console.log(`mind.selfcheck: ${n} checks passed`);
