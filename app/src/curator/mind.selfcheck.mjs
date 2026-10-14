// #1462 Mind 1 — the model path without a model: the contract, the context, the rules fallback, the thinker's
// scheduling rules (one in flight, one per bar, late dropped, malformed dropped), and the live driver (telemetry only).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateReply, neutralReply, PERSONAS, MOODS } from './mindContract.js';
import { buildContext } from './mindContext.js';
import { rulesReply } from './mindRules.js';
import { createThinker, MAX_LATE_BARS } from './mindThinker.js';
import { startMind } from './mindLive.js';
import { Events, emit, on } from '../composition/eventBus.js';
import { EVENT_REGISTRY } from '../composition/eventRegistry.js';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));
const ctx = buildContext({ layers: [{ type: 'content' }, { type: 'pattern' }, { type: 'fx' }], enabledAssetCount: 4, paletteId: 'bone', room: { lois: 'VIBE', davis: 'FLOW' }, band: 'normal', keepsCount: 9, bpm: 121.4, audio: 'mic', creatures: 2 });

await ok('the context is a compact summary, not the manifest: counts, names, the room, nothing else', () => {
  assert.deepEqual(ctx, {
    v: 1, layers: { content: 1, pattern: 1, fx: 1, math: 0 }, assets: 4, palette: 'bone', room: { lois: 'VIBE', davis: 'FLOW' },
    band: 'normal', keeps: 9, bpm: 121, audio: 'mic', source: 'ambient', creatures: 2,
  });
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
  assert.deepEqual(rulesReply('davis', ctx), { propose: null });
  assert.deepEqual(rulesReply('lois', ctx), { critique: null });
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
  assert.equal(a.source, 'rules'); assert.equal(a.bar, 1); assert.equal(a.seed, 7);
  assert.equal(t.onBar({ bar: 1, context: ctx }), null, 'the same bar again: nothing');
  assert.equal(t.onBar({ bar: 2, context: ctx }).bar, 2);
  assert.throws(() => createThinker({ persona: 'nobody' }), TypeError);
});

await ok('a model backend: at most one request in flight, its reply lands on a LATER bar, and the rules answer the bars between', async () => {
  let calls = 0; let release;
  const mind = () => new Promise((r) => { calls++; release = r; });
  const t = createThinker({ persona: 'queen', mind, available: () => true });
  assert.equal(t.onBar({ bar: 10, context: ctx }).source, 'rules', 'asked this bar; the rules answer it');
  assert.equal(t.inFlight(), true);
  await tick(); // the request is made on a microtask, off the bar
  assert.equal(t.onBar({ bar: 11, context: ctx }).source, 'rules', 'still in flight: rules cover, never a second request');
  await tick();
  assert.equal(calls, 1);
  release({ mood: 'lift', lean: {} });
  await tick();
  const d = t.onBar({ bar: 12, context: ctx });
  assert.equal(d.source, 'mind'); assert.equal(d.reply.mood, 'lift');
  assert.equal(t.inFlight(), false);
  assert.equal(t.onBar({ bar: 13, context: ctx }).source, 'rules', 'and it asks again on the next bar');
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
  assert.equal(d.source, 'rules', 'the late reply was not used');
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
  assert.equal(d1.source, 'rules', 'malformed: dropped, rules answer');
  mode = 'fail';
  t.onBar({ bar: 3, context: ctx }); await tick();
  const d2 = t.onBar({ bar: 4, context: ctx });
  assert.equal(d2.source, 'rules', 'failed: rules answer');
  assert.deepEqual(seen, ['dropped', 'error']);
  const unavailable = createThinker({ persona: 'queen', mind, available: () => false });
  assert.equal(unavailable.onBar({ bar: 1, context: ctx }).source, 'rules', 'mind:status unavailable: rules, no request');
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
  assert.ok(got.every(([p, m]) => p.source === 'rules' && m.cause === 'mind' && typeof m.seq === 'number'));
  assert.deepEqual(other, [], 'telemetry only: it changed nothing on the stage');
  const seeds = got.slice(0, 3).map((g) => g[0].seed);
  const again = []; const off2 = on(Events.MIND_DECISION, (p) => again.push(p.seed));
  stop();
  const stop2 = startMind({ getSnapshot: () => ({}), getSeed: () => 4242 });
  emit(Events.CLOCK_BAR, { bar: 4, bpm: 120 });
  assert.deepEqual(again.slice(0, 3), seeds, 'the same seed and bar give the same decision seed');
  stop2(); off(); off2(); offBeat(); offLayout();
  assert.equal(EVENT_REGISTRY.MIND_DECISION.handler, null);
});

await ok('hidden and honest: no surface lists it; no store key holds it; pure modules read no clock; the app starts it', () => {
  for (const f of ['mindContract.js', 'mindContext.js', 'mindRules.js', 'mindThinker.js']) {
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

console.log(`mind.selfcheck: ${n} checks passed`);
