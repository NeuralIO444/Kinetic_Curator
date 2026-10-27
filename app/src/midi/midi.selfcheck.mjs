// midi.selfcheck.mjs — #617 MIDI learn, engine half: parse, targets, mapping,
// dispatch, and the engine against a FAKE MIDIAccess for every way Web MIDI can
// fail. (A real controller is verified by hand; everything short of hardware is here.)
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseMidi, bindKey, isBindKey, describeKey } from './message.mjs';
import { MIDI_TARGETS, getMidiTarget } from './targets.mjs';
import { sanitizeMidiMap, bindTarget, unbindTarget, keyFor, canBind, MAX_BINDINGS } from './map.mjs';
import { dispatchMidi, releaseHolds, createMidiEngine } from './engine.mjs';
import { midiStatusView, describeMessage } from './status.mjs';
import { createLearnState, armLearn, cancelLearn, learnMessage, isLearnArmed, learnPrompt, routeLearnMessage } from './learn.mjs';
import { PARAM_SPEC } from '../data/layout-modes.js';
import { PALETTES } from '../data/palettes.js';
import { FLAGSHIP_VOICES } from '../data/voices.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { useStore } from '../state/store.js';
import { Events } from '../composition/eventBus.js';

// ── message ──────────────────────────────────────────────────────────────
assert.deepStrictEqual(parseMidi([0x90, 36, 100]), { type: 'noteon', channel: 1, number: 36, value: 100 });
assert.deepStrictEqual(parseMidi([0x90, 36, 0]), { type: 'noteoff', channel: 1, number: 36, value: 0 }, 'note-on velocity 0 IS a note-off');
assert.deepStrictEqual(parseMidi([0x8f, 60, 64]), { type: 'noteoff', channel: 16, number: 60, value: 64 });
assert.deepStrictEqual(parseMidi([0xb2, 7, 127]), { type: 'cc', channel: 3, number: 7, value: 127 });
for (const junk of [null, undefined, [], [0x90], [0x90, 1], [0xf8], [0xf8, 0, 0], [0xfe, 0, 0], [0xf0, 1, 2], [0xe0, 1, 2], [0xc0, 1, 2], [0x40, 1, 2], [0x90, 128, 1], [0x90, 1, 200], [0x90, -1, 1]]) {
  assert.strictEqual(parseMidi(junk), null, `ignored: ${JSON.stringify(junk)}`);
}
assert.strictEqual(bindKey(parseMidi([0x90, 36, 100])), bindKey(parseMidi([0x80, 36, 0])), 'note on and off share ONE key (a pad is one binding)');
assert.notStrictEqual(bindKey(parseMidi([0x90, 36, 100])), bindKey(parseMidi([0x91, 36, 100])), 'channel-specific');
assert.strictEqual(bindKey({ type: 'cc', channel: 1, number: 7 }), 'cc:1:7');
for (const ok of ['note:1:0', 'note:16:127', 'cc:10:99', 'cc:1:100']) assert.ok(isBindKey(ok), ok);
// #1740: every number 0–127 binds, on notes and CCs, on the first and last channel (108/109/118/119 used to be refused).
for (const kind of ['note', 'cc']) for (const ch of [1, 16]) for (let n = 0; n <= 127; n++) assert.ok(isBindKey(`${kind}:${ch}:${n}`), `${kind}:${ch}:${n}`);
for (const n of [108, 109, 118, 119]) assert.strictEqual(describeKey(`cc:1:${n}`), `CC ${n} · ch 1`, `describeKey ${n}`);
for (const bad of ['note:0:5', 'note:17:5', 'cc:1:128', 'cc:1:05', 'cc:1:00', 'cc:1:0127', 'cc:1:130', 'cc:1:200', 'pad:1:5', '', null, 5, 'note:1:-1', 'note:1:1:1']) assert.ok(!isBindKey(bad), String(bad));
assert.strictEqual(describeKey('note:1:36'), 'note 36 · ch 1');
assert.strictEqual(describeKey('cc:3:7'), 'CC 7 · ch 3');

// ── targets ──────────────────────────────────────────────────────────────
{
  const ids = MIDI_TARGETS.map((t) => t.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'target ids are unique');
  for (const t of MIDI_TARGETS) {
    assert.ok(['trigger', 'hold', 'cc'].includes(t.kind) && typeof t.run === 'function' && t.label, `${t.id} is well-formed`);
    if (t.id.startsWith('param.')) assert.ok(PARAM_SPEC[t.id.slice(6)], `${t.id} points at a real param`);
  }
  for (const want of ['evolve.toggle', 'seed.new', 'favorite.keep', 'accum.swell', 'accum.clear', 'accum.freeze', 'feel.gentle', 'feel.punchy', 'feel.violent', 'param.audioModDepth', 'evolve.interval']) {
    assert.ok(getMidiTarget(want), `${want} is mappable`);
  }
  assert.strictEqual(getMidiTarget('accum.freeze').kind, 'hold', 'FREEZE is momentary: hold a pad, release to thaw');
}

// #617 — the rest of the spec's list: keep (J), pass (X), phrase reset, and the voice-mix morph as a fader
{
  for (const [id, kind] of [['taste.keep', 'trigger'], ['taste.pass', 'trigger'], ['phrase.reset', 'trigger'], ['voice.mix', 'cc']]) {
    assert.ok(getMidiTarget(id) && getMidiTarget(id).kind === kind, `${id} is a ${kind} target`);
  }
  const log = [];
  const plate = { seed: 9, seedOffsets: {}, layoutParams: {}, enabledAssets: {}, layers: [], activeLayerId: null, layerSnapshots: {}, paletteId: 'praystation' };
  const ctx = { emit: (ev, p) => log.push([ev, p]), Events, getState: () => ({ ...plate, addPass: (rec) => log.push(['addPass', rec]) }) };
  getMidiTarget('taste.keep').run(ctx);
  assert.strictEqual(log[0][0], Events.KEEP_ADD, 'KEEP rides the same bus event as J');
  assert.strictEqual(log[0][1].keep.seed, 9, 'the keep carries the plate');
  getMidiTarget('taste.pass').run(ctx);
  assert.strictEqual(log[1][0], 'addPass', 'PASS lands where X lands (addPass)');
  assert.strictEqual(log[1][1].seed, 9, 'the pass carries the plate');
  getMidiTarget('phrase.reset').run(ctx);
  assert.deepStrictEqual(log[2], [Events.DAVIS_RESET_PHRASE, undefined]);
  getMidiTarget('voice.mix').run(ctx, 0.25);
  assert.deepStrictEqual(log[3], [Events.VOICE_MIX, { t: 0.25 }], 'the fader position is the MIX road position');
}

// ── picker targets + bank switch (#1720) ─────────────────────────────────
{
  // one target per palette, per flagship voice, per user-voice slot, plus the switch
  for (const p of PALETTES) {
    const t = getMidiTarget(`palette.${p.id}`);
    assert.ok(t && t.kind === 'trigger', `palette.${p.id} is a picker target`);
    assert.strictEqual(t.label, `PAL ${p.name}`);
  }
  for (const v of FLAGSHIP_VOICES) assert.ok(getMidiTarget(`voice.${v.id}`), `voice.${v.id} is a picker target`);
  for (let i = 1; i <= 12; i++) assert.ok(getMidiTarget(`voice.my.${i}`), `voice.my.${i} is a picker target`);
  assert.strictEqual(getMidiTarget('voice.my.13'), undefined, 'the shelf holds 12 hand-made voices, no 13th slot');
  assert.ok(getMidiTarget('bank.next') && getMidiTarget('bank.next').kind === 'trigger', 'one bank-switch target');
  assert.strictEqual(MIDI_TARGETS.length, 19 + PALETTES.length + FLAGSHIP_VOICES.length + 12 + 1, 'the registry is the 19 + pickers + slots + switch (#617 added keep, pass, phrase reset, voice mix)');
  // the cap covers a whole registry bound into ONE bank, on legal keys
  assert.strictEqual(MAX_BINDINGS, 128);
  assert.ok(MAX_BINDINGS >= MIDI_TARGETS.length, 'the cap covers every target at once');
  const all = {};
  let note = 0; let cc = 0;
  for (const t of MIDI_TARGETS) all[t.kind === 'cc' ? `cc:1:${cc++}` : `note:1:${note++}`] = t.id;
  assert.strictEqual(Object.keys(sanitizeMidiMap(all)).length, MIDI_TARGETS.length, 'all targets survive one sanitizer pass in a single bank');
}

// ── mapping table ────────────────────────────────────────────────────────
{
  assert.deepStrictEqual(sanitizeMidiMap(null), {});
  assert.deepStrictEqual(sanitizeMidiMap([]), {});
  assert.deepStrictEqual(sanitizeMidiMap('x'), {});
  const m = sanitizeMidiMap({
    'note:1:36': 'evolve.toggle', 'note:1:37': 'nope', 'bad:key': 'seed.new', 'cc:1:7': 'param.audioModDepth',
    'note:1:40': 'param.audioSwell',          // a note cannot drive a knob target
    'cc:1:8': 'evolve.toggle',                 // same target twice: first wins
    'cc:1:9': 'accum.swell',                   // a CC may fire a trigger
  });
  assert.deepStrictEqual(m, { 'note:1:36': 'evolve.toggle', 'cc:1:7': 'param.audioModDepth', 'cc:1:9': 'accum.swell' }, 'junk, dup targets and note→knob dropped');
  assert.ok(canBind('cc:1:1', getMidiTarget('param.lifeDrift')) && !canBind('note:1:1', getMidiTarget('param.lifeDrift')));
  const big = {};
  for (let i = 0; i < 100; i++) big[`cc:1:${i}`] = MIDI_TARGETS[i % MIDI_TARGETS.length].id + (i < MIDI_TARGETS.length ? '' : `#dup${i}`);
  assert.ok(Object.keys(sanitizeMidiMap(big)).length <= MAX_BINDINGS, 'capped');
  // bind moves: one binding per target, one target per key
  let t = bindTarget({}, 'note:1:36', 'evolve.toggle');
  t = bindTarget(t, 'note:1:37', 'evolve.toggle');
  assert.deepStrictEqual(t, { 'note:1:37': 'evolve.toggle' }, 're-learning a target MOVES it');
  t = bindTarget(t, 'note:1:37', 'seed.new');
  assert.deepStrictEqual(t, { 'note:1:37': 'seed.new' }, 'a key holds one target');
  assert.strictEqual(bindTarget(t, 'note:1:5', 'param.audioModDepth'), t, 'a refused bind returns the same map');
  assert.strictEqual(keyFor(t, 'seed.new'), 'note:1:37');
  assert.strictEqual(keyFor(t, 'evolve.toggle'), null);
  assert.deepStrictEqual(unbindTarget(t, 'seed.new'), {});
  const src = { 'note:1:36': 'evolve.toggle' };
  bindTarget(src, 'note:1:40', 'seed.new'); unbindTarget(src, 'evolve.toggle');
  assert.deepStrictEqual(src, { 'note:1:36': 'evolve.toggle' }, 'never mutates its input');
}

// ── dispatch ─────────────────────────────────────────────────────────────
const fakeCtx = () => {
  const log = [];
  return { log, emit: (ev, p) => log.push([ev, p]), Events, getState: () => ({ seed: 5, seedOffsets: {}, layoutParams: {}, enabledAssets: {}, paletteId: 'praystation', applyFeel: (id) => log.push(['feel', id]) }) };
};
const fresh = () => ({ prevCc: new Map(), held: new Map() });
const M = (bytes) => parseMidi(bytes);
{
  const ctx = fakeCtx(); const st = fresh();
  const map = { 'note:1:36': 'evolve.toggle', 'note:1:37': 'seed.new', 'cc:1:20': 'accum.swell', 'note:1:38': 'accum.freeze', 'cc:1:21': 'accum.clear', 'cc:1:7': 'param.audioModDepth', 'cc:1:8': 'evolve.interval', 'note:1:39': 'feel.violent', 'note:1:40': 'favorite.keep', 'cc:1:9': 'param.lifeDrift' };
  // trigger via a pad: rising edge only
  assert.strictEqual(dispatchMidi(M([0x90, 36, 100]), map, ctx, st), 'evolve.toggle');
  assert.strictEqual(dispatchMidi(M([0x80, 36, 0]), map, ctx, st), null, 'note-off does nothing');
  assert.deepStrictEqual(ctx.log, [[Events.DAVIS_EVOLVE, { toggle: true }]]);
  dispatchMidi(M([0x90, 37, 90]), map, ctx, st);
  assert.deepStrictEqual(ctx.log[1], [Events.DAVIS_EVOLVE, { bumpSeed: true }]);
  // trigger via CC: fires on the rising edge through 64, not on every tick
  ctx.log.length = 0;
  for (const v of [10, 63, 64, 100, 127, 30, 64]) dispatchMidi(M([0xb0, 20, v]), map, ctx, st);
  assert.strictEqual(ctx.log.length, 2, 'CC trigger: rises through 64 twice → two swells (not one per tick)');
  assert.deepStrictEqual(ctx.log[0], [Events.ACCUM_GESTURE, { action: 'swell' }]);
  // hold: pad down engages, pad up releases; repeated downs don't re-fire
  ctx.log.length = 0;
  dispatchMidi(M([0x90, 38, 100]), map, ctx, st); dispatchMidi(M([0x90, 38, 100]), map, ctx, st);
  assert.strictEqual(ctx.log.length, 1, 'already engaged: no re-fire');
  assert.deepStrictEqual(ctx.log[0], [Events.ACCUM_GESTURE, { action: 'freeze', value: true }]);
  dispatchMidi(M([0x80, 38, 0]), map, ctx, st);
  assert.deepStrictEqual(ctx.log[1], [Events.ACCUM_GESTURE, { action: 'freeze', value: false }]);
  assert.strictEqual(st.held.size, 0);
  // a knob scales into the param's range, both ends exact
  ctx.log.length = 0;
  dispatchMidi(M([0xb0, 7, 0]), map, ctx, st); dispatchMidi(M([0xb0, 7, 127]), map, ctx, st);
  assert.deepStrictEqual(ctx.log.map((l) => l[1].value), [PARAM_SPEC.audioModDepth.min, PARAM_SPEC.audioModDepth.max], 'CC 0 → min, CC 127 → max');
  assert.strictEqual(ctx.log[0][1].key, 'audioModDepth');
  ctx.log.length = 0;
  dispatchMidi(M([0xb0, 8, 0]), map, ctx, st); dispatchMidi(M([0xb0, 8, 127]), map, ctx, st);
  assert.deepStrictEqual(ctx.log.map((l) => l[1].interval), [200, 10000], 'evolve interval spans 200–10000 ms');
  // a knob target ignores notes; unmapped and cross-channel messages do nothing
  ctx.log.length = 0;
  assert.strictEqual(dispatchMidi(M([0x90, 7, 100]), map, ctx, st), null);
  assert.strictEqual(dispatchMidi(M([0xb1, 7, 100]), map, ctx, st), null, 'channel 2 is not channel 1');
  assert.strictEqual(dispatchMidi(M([0x90, 99, 100]), map, ctx, st), null, 'unmapped');
  assert.strictEqual(ctx.log.length, 0);
  // feel + favorite
  dispatchMidi(M([0x90, 39, 100]), map, ctx, st);
  assert.deepStrictEqual(ctx.log[0], ['feel', 'violent']);
  dispatchMidi(M([0x90, 40, 100]), map, ctx, st);
  assert.strictEqual(ctx.log[1][0], Events.DAVIS_FAVORITE);
  assert.strictEqual(ctx.log[1][1].action, 'add');
  // every CC target spans its whole param range
  for (const t of MIDI_TARGETS.filter((x) => x.id.startsWith('param.'))) {
    const c = fakeCtx(); t.run(c, 0); t.run(c, 1);
    const { min, max } = PARAM_SPEC[t.id.slice(6)];
    assert.deepStrictEqual(c.log.map((l) => l[1].value), [min, max], `${t.id} spans ${min}–${max}`);
  }
  // releaseHolds
  const st2 = fresh(); const c2 = fakeCtx();
  dispatchMidi(M([0x90, 38, 100]), map, c2, st2, 'devA');
  releaseHolds(c2, st2, new Set(['devA']));
  assert.strictEqual(st2.held.size, 1, 'a hold whose device is still connected stays');
  releaseHolds(c2, st2, new Set());
  assert.strictEqual(st2.held.size, 0);
  assert.deepStrictEqual(c2.log.at(-1), [Events.ACCUM_GESTURE, { action: 'freeze', value: false }], 'and is released when its device is gone');
}

// ── dispatch: pickers and the bank switch (#1720) ────────────────────────
{
  const pickCtx = (over = {}) => {
    const log = [];
    const fake = { userVoices: [], cycles: 0, ...over };
    return {
      log, fake, emit: (ev, p) => log.push([ev, p]), Events,
      getState: () => ({ userVoices: fake.userVoices, cycleMidiBank: () => { fake.cycles++; } }),
    };
  };
  const st = fresh();
  // a bound key picks a palette, through the same event the palette strip emits
  let ctx = pickCtx();
  assert.strictEqual(dispatchMidi(M([0x90, 53, 100]), { 'note:1:53': 'palette.hydra' }, ctx, st), 'palette.hydra');
  assert.deepStrictEqual(ctx.log, [[Events.PALETTE_SET_ID, { id: 'hydra' }]], 'a key picks a palette');
  // a bound key picks a flagship voice, through the same event the tiles emit
  ctx = pickCtx();
  assert.strictEqual(dispatchMidi(M([0x90, 60, 100]), { 'note:1:60': 'voice.swarm' }, ctx, st), 'voice.swarm');
  assert.deepStrictEqual(ctx.log, [[Events.VOICE_LOAD, { id: 'swarm' }]], 'a key picks a voice');
  // a user-voice slot loads the Nth HAND-MADE voice: earned finds are not on the shelf
  ctx = pickCtx({ userVoices: [{ id: 'uv-find', name: 'A FIND', earned: { rolls: 9 } }, { id: 'uv-a', name: 'VOICE 01' }, { id: 'uv-b', name: 'VOICE 02' }] });
  dispatchMidi(M([0x90, 61, 100]), { 'note:1:61': 'voice.my.2' }, ctx, st);
  assert.deepStrictEqual(ctx.log, [[Events.VOICE_LOAD, { id: 'uv-b' }]], 'slot 2 is the second hand-made voice');
  // an empty slot is an honest no-op: the key is bound, nothing loads
  ctx.log.length = 0;
  dispatchMidi(M([0x90, 62, 100]), { 'note:1:62': 'voice.my.3' }, ctx, st);
  assert.strictEqual(ctx.log.length, 0, 'an empty slot fires nothing');
  // the bank switch target flips the bank (the store does the flipping)
  ctx = pickCtx();
  assert.strictEqual(dispatchMidi(M([0x90, 63, 100]), { 'note:1:63': 'bank.next' }, ctx, st), 'bank.next');
  assert.strictEqual(ctx.fake.cycles, 1, 'a key flips the bank');
  // a picker target learns like any trigger: pad or CC
  assert.deepStrictEqual(learnMessage(armLearn(createLearnState(), 'palette.hydra'), M([0x90, 53, 100])), { claimed: true, key: 'note:1:53', targetId: 'palette.hydra', refused: null }, 'a pad learns a palette pick');
}

// ── engine against a fake MIDIAccess ─────────────────────────────────────
const fakeInput = (name) => ({ name, state: 'connected', onmidimessage: null });
const fakeAccess = (inputs) => { const a = { inputs: new Map(inputs.map((i, n) => [`in${n}`, i])), onstatechange: null }; return a; };
const send = (input, bytes) => input.onmidimessage({ data: new Uint8Array(bytes), target: input });
const statuses = [];
const mk = (over) => createMidiEngine({ getMap: () => over.map || {}, ctx: over.ctx || fakeCtx(), onStatus: (s) => statuses.push(s), onMessage: over.onMessage, requestAccess: over.requestAccess });
await (async () => {
  // unsupported
  let e = mk({ requestAccess: null });
  assert.strictEqual((await e.start()).state, 'unsupported');
  assert.match(e.status.error, /not available/);
  // denied
  e = mk({ requestAccess: async () => { throw new Error('User denied'); } });
  const d = await e.start();
  assert.strictEqual(d.state, 'denied'); assert.match(d.error, /refused.*User denied/);
  // no devices → ready → hot-plug → unplug
  const access = fakeAccess([]);
  const ctx = fakeCtx();
  const pad = fakeInput('Test Pad');
  e = mk({ requestAccess: async () => access, map: { 'note:1:38': 'accum.freeze', 'note:1:36': 'evolve.toggle' }, ctx });
  assert.strictEqual((await e.start()).state, 'no-devices');
  access.inputs.set('p', pad); access.onstatechange();
  assert.strictEqual(e.status.state, 'ready'); assert.deepStrictEqual(e.status.inputs, ['Test Pad']);
  send(pad, [0x90, 36, 100]);
  assert.deepStrictEqual(ctx.log.at(-1), [Events.DAVIS_EVOLVE, { toggle: true }], 'a message reaches its mapping');
  send(pad, [0xf8, 0, 0]); send(pad, [0x90, 99, 1]);
  assert.strictEqual(ctx.log.length, 1, 'clock and unmapped notes do nothing');
  // unplug mid-hold: the freeze is RELEASED, the status names the device, no handler left
  send(pad, [0x90, 38, 100]);
  assert.deepStrictEqual(ctx.log.at(-1), [Events.ACCUM_GESTURE, { action: 'freeze', value: true }]);
  pad.state = 'disconnected'; access.onstatechange();
  assert.deepStrictEqual(ctx.log.at(-1), [Events.ACCUM_GESTURE, { action: 'freeze', value: false }], 'unplugging mid-hold releases the freeze');
  assert.strictEqual(e.status.state, 'no-devices');
  assert.match(e.status.error, /unplugged: Test Pad/, 'the status says which device went');
  assert.strictEqual(pad.onmidimessage, null, 'no zombie handler on the dead input');
  // two devices: pulling one only releases ITS hold
  const a = fakeInput('Pad A'); const b = fakeInput('Knobs B');
  const acc2 = fakeAccess([a, b]); const ctx2 = fakeCtx();
  const e2 = mk({ requestAccess: async () => acc2, map: { 'note:1:38': 'accum.freeze' }, ctx: ctx2 });
  await e2.start();
  assert.deepStrictEqual(e2.status.inputs, ['Pad A', 'Knobs B']);
  send(a, [0x90, 38, 100]);
  b.state = 'disconnected'; acc2.onstatechange();
  assert.strictEqual(ctx2.log.length, 1, "another device's unplug does not release A's hold");
  assert.deepStrictEqual(e2.status.inputs, ['Pad A']);
  e2.stop();
  assert.deepStrictEqual(ctx2.log.at(-1), [Events.ACCUM_GESTURE, { action: 'freeze', value: false }], 'stop releases every hold');
  assert.strictEqual(a.onmidimessage, null, 'and detaches every handler');
  assert.strictEqual(e2.status.state, 'off');
  // learn mode claims a message: it must not ALSO fire its mapping
  const c3 = fakeCtx(); const p3 = fakeInput('P'); const claimed = [];
  const e3 = mk({ requestAccess: async () => fakeAccess([p3]), map: { 'note:1:36': 'evolve.toggle' }, ctx: c3, onMessage: (m) => { claimed.push(m); return true; } });
  await e3.start(); send(p3, [0x90, 36, 100]);
  assert.strictEqual(claimed.length, 1); assert.strictEqual(c3.log.length, 0, 'a claimed message never fires a mapping');
  // stop() racing the permission prompt never attaches handlers
  let release; const slow = new Promise((r) => { release = r; });
  const p4 = fakeInput('Late');
  const e4 = mk({ requestAccess: () => slow.then(() => fakeAccess([p4])) });
  const started = e4.start(); e4.stop(); release(); await started;
  assert.strictEqual(p4.onmidimessage, null, 'stopped during the prompt: nothing attaches');
})();

// ── status line ──────────────────────────────────────────────────────────
assert.strictEqual(midiStatusView({ state: 'off', inputs: [], error: '' }, false).tone, 'idle');
assert.match(midiStatusView({ state: 'ready', inputs: ['A', 'B'], error: '' }, true).line, /2 devices: A · B/);
assert.match(midiStatusView({ state: 'ready', inputs: ['A'], error: '' }, true).line, /1 device: A/);
assert.strictEqual(midiStatusView({ state: 'denied', inputs: [], error: 'MIDI access refused' }, true).tone, 'bad');
assert.match(midiStatusView({ state: 'denied', inputs: [], error: 'x' }, true).note, /site settings/, 'a refusal says how to fix it');
assert.strictEqual(midiStatusView({ state: 'no-devices', inputs: [], error: 'unplugged: X' }, true).note, 'unplugged: X');
assert.strictEqual(midiStatusView({ state: 'unsupported', inputs: [], error: 'nope' }, true).tone, 'bad');
assert.strictEqual(describeMessage(M([0x90, 36, 100])), 'note 36 · ch 1 · vel 100');
assert.strictEqual(describeMessage(M([0xb0, 7, 64])), 'CC 7 · ch 1 · val 64');
assert.strictEqual(describeMessage(M([0x80, 36, 0])), 'note 36 · ch 1 · off');

// ── project document + store ─────────────────────────────────────────────
{
  const base = { seed: 7, seedOffsets: {}, paletteId: 'praystation', layoutParams: {}, enabledAssets: {}, quality: 'balanced', autoQuality: true };
  assert.ok(!('midiMap' in serializeProject({ ...base, midiMap: {} })), 'nothing mapped: no key (byte-identical export)');
  assert.ok(!('midiMap' in serializeProject(base)));
  const doc = serializeProject({ ...base, midiMap: { 'note:1:36': 'evolve.toggle', 'junk': 'x' } });
  assert.deepStrictEqual(doc.midiMap, { 'note:1:36': 'evolve.toggle' });
  const wire = JSON.parse(JSON.stringify(doc));
  assert.deepStrictEqual(parseProject(wire).doc.midiMap, { 'note:1:36': 'evolve.toggle' }, 'v1 branch');
  assert.deepStrictEqual(parseProject({ seed: 1, layout: {}, midiMap: { 'cc:1:7': 'param.lifeDrift' } }).doc.midiMap, { 'cc:1:7': 'param.lifeDrift' }, 'legacy branch');
  assert.deepStrictEqual(parseProject({ ...wire, midiMap: 'hostile' }).doc.midiMap, {}, 'hostile → nothing mapped');
  const S = () => useStore.getState();
  S().bindMidi('note:1:36', 'evolve.toggle');
  assert.deepStrictEqual(S().midiMap, { 'note:1:36': 'evolve.toggle' });
  S().bindMidi('note:1:37', 'evolve.toggle');
  assert.deepStrictEqual(S().midiMap, { 'note:1:37': 'evolve.toggle' }, 'relearn moves');
  S().unbindMidi('evolve.toggle');
  assert.deepStrictEqual(S().midiMap, {});
  S().applyProject({ ...parseProject({ version: 1, seed: 1, midiMap: { 'cc:1:7': 'param.lifeDrift' } }).doc });
  assert.deepStrictEqual(S().midiMap, { 'cc:1:7': 'param.lifeDrift' }, 'import applies mappings');
  S().applyProject({ ...parseProject({ version: 1, seed: 1 }).doc });
  assert.deepStrictEqual(S().midiMap, {}, 'a doc without mappings maps nothing');
  assert.strictEqual(S().midiEnabled, false, 'MIDI is off until asked for (nothing connects at boot)');
}

// ── banks in the document + the store (#1720) ────────────────────────────
{
  const base = { seed: 7, seedOffsets: {}, paletteId: 'praystation', layoutParams: {}, enabledAssets: {}, quality: 'balanced', autoQuality: true };
  // a single MAIN bank still exports as the legacy midiMap field, byte-shape unchanged
  const oneBank = serializeProject({ ...base, midiBanks: [{ name: 'MAIN', map: { 'note:1:36': 'evolve.toggle' } }], midiActiveBank: 0, midiMap: { 'note:1:36': 'evolve.toggle' } });
  assert.deepStrictEqual(oneBank.midiMap, { 'note:1:36': 'evolve.toggle' }, 'one MAIN bank = the legacy field');
  assert.ok(!('midiBanks' in oneBank) && !('midiActiveBank' in oneBank), 'no bank fields for a one-bank project');
  // a banked project writes the list in full; the legacy field stays out
  const banked = serializeProject({
    ...base,
    midiBanks: [{ name: 'MAIN', map: { 'note:1:36': 'evolve.toggle' } }, { name: 'PAL B', map: { 'note:1:53': 'palette.hydra' } }],
    midiActiveBank: 1, midiMap: { 'note:1:53': 'palette.hydra' },
  });
  assert.deepStrictEqual(banked.midiBanks, [{ name: 'MAIN', map: { 'note:1:36': 'evolve.toggle' } }, { name: 'PAL B', map: { 'note:1:53': 'palette.hydra' } }]);
  assert.strictEqual(banked.midiActiveBank, 1);
  assert.ok(!('midiMap' in banked), 'a banked project does not also write the legacy field');
  // …and survives save + reload through the sanitizer, active bank included
  const back = parseProject(JSON.parse(JSON.stringify(banked))).doc;
  assert.deepStrictEqual(back.midiBanks, banked.midiBanks, 'banks survive the round trip');
  assert.strictEqual(back.midiActiveBank, 1, 'the active bank survives');
  assert.deepStrictEqual(back.midiMap, { 'note:1:53': 'palette.hydra' }, 'the doc midiMap is the ACTIVE bank’s map');
  // when both shapes are present, the bank list wins
  const both = parseProject({ version: 1, seed: 1, midiMap: { 'note:1:36': 'evolve.toggle' }, midiBanks: [{ name: 'MAIN', map: { 'note:1:40': 'seed.new' } }] }).doc;
  assert.deepStrictEqual(both.midiMap, { 'note:1:40': 'seed.new' }, 'midiBanks wins over a stray midiMap');
  // store behaviour: bindings land in the active bank; the mirror follows the bank
  const S = () => useStore.getState();
  S().applyProject({ ...parseProject({ version: 1, seed: 1 }).doc });
  assert.strictEqual(S().midiBanks.length, 1, 'a fresh doc has the one MAIN bank');
  S().bindMidi('note:1:36', 'evolve.toggle');
  assert.deepStrictEqual(S().midiBanks[0].map, { 'note:1:36': 'evolve.toggle' }, 'a bind lands in the active bank');
  S().addMidiBank();
  assert.strictEqual(S().midiBanks.length, 2, 'a bank is added');
  assert.strictEqual(S().midiBanks[1].name, 'BANK 2');
  assert.strictEqual(S().midiActiveBank, 1, '…and landed on');
  assert.deepStrictEqual(S().midiMap, {}, 'the new bank starts empty');
  S().bindMidi('note:1:53', 'palette.hydra');
  assert.deepStrictEqual(S().midiBanks[0].map, { 'note:1:36': 'evolve.toggle' }, 'bank 1 kept its binding');
  // switching banks changes what the same key does (the engine reads the mirror)
  S().switchMidiBank(0);
  assert.deepStrictEqual(S().midiMap, { 'note:1:36': 'evolve.toggle' }, 'bank 1: note 53 does nothing, note 36 evolves');
  S().switchMidiBank(1);
  assert.deepStrictEqual(S().midiMap, { 'note:1:53': 'palette.hydra' }, 'bank 2: note 53 picks a palette');
  S().switchMidiBank(9);
  assert.strictEqual(S().midiActiveBank, 1, 'an out-of-range switch is refused');
  S().cycleMidiBank();
  assert.strictEqual(S().midiActiveBank, 0, 'BANK NEXT wraps to the first bank');
  S().renameMidiBank('PAL B');
  assert.strictEqual(S().midiBanks[0].name, 'PAL B', 'a bank renames');
  S().renameMidiBank('BANK 2');
  assert.strictEqual(S().midiBanks[0].name, 'PAL B', 'a duplicate name is refused');
  S().removeMidiBank();
  assert.strictEqual(S().midiBanks.length, 1, 'the active bank is removed');
  assert.strictEqual(S().midiActiveBank, 0);
  S().removeMidiBank();
  assert.strictEqual(S().midiBanks.length, 1, 'the last bank is never removed');
  // a banked document applies whole: banks, active bank, mirror
  S().applyProject({ ...parseProject(JSON.parse(JSON.stringify(banked))).doc });
  assert.strictEqual(S().midiBanks.length, 2, 'import applies the banks');
  assert.strictEqual(S().midiActiveBank, 1);
  assert.deepStrictEqual(S().midiMap, { 'note:1:53': 'palette.hydra' }, 'import lands on the saved bank');
  S().applyProject({ ...parseProject({ version: 1, seed: 1 }).doc });
}

// ── learn mode (#617): arm → touch → bound ───────────────────────────────
{
  const s0 = createLearnState();
  assert.strictEqual(isLearnArmed(s0), false, 'starts disarmed');
  const bad = armLearn(s0, 'not.a.target');
  assert.strictEqual(bad, s0, 'an unknown target never arms (same state back)');
  const armedPad = armLearn(s0, 'evolve.toggle');
  assert.strictEqual(s0.armed, null, 'arm does not mutate');
  assert.deepStrictEqual(learnMessage(armedPad, M([0x90, 36, 100])), { claimed: true, key: 'note:1:36', targetId: 'evolve.toggle', refused: null }, 'a pad binds a trigger');
  assert.deepStrictEqual(learnMessage(armedPad, M([0xb0, 20, 127])), { claimed: true, key: 'cc:1:20', targetId: 'evolve.toggle', refused: null }, 'a CC pad binds a trigger too');
  assert.strictEqual(learnMessage(armedPad, M([0x80, 36, 0])).claimed, false, 'a note-OFF is never the gesture (and never claimed, so a pre-held FREEZE pad still releases)');
  assert.strictEqual(learnMessage(armedPad, M([0x90, 36, 0])).claimed, false, 'note-on velocity 0 is a note-off');
  assert.strictEqual(learnMessage(s0, M([0x90, 36, 100])).claimed, false, 'disarmed: nothing is claimed');
  assert.strictEqual(learnMessage(null, M([0x90, 36, 100])).claimed, false);
  assert.strictEqual(learnMessage(armedPad, null).claimed, false);
  const armedKnob = armLearn(s0, 'param.lifeDrift');
  assert.deepStrictEqual(learnMessage(armedKnob, M([0xb0, 7, 64])), { claimed: true, key: 'cc:1:7', targetId: 'param.lifeDrift', refused: null }, 'a knob binds a param');
  const refusedPad = learnMessage(armedKnob, M([0x90, 36, 100]));
  assert.strictEqual(refusedPad.claimed, true, 'a pad aimed at a knob target is claimed…');
  assert.strictEqual(refusedPad.key, null, '…but binds nothing');
  assert.strictEqual(refusedPad.refused, 'wrong-kind', '…and says why');
  assert.strictEqual(isLearnArmed(cancelLearn(armedKnob)), false, 'cancel disarms');
  assert.match(learnPrompt(getMidiTarget('param.lifeDrift')), /knob or fader/, 'a knob target asks for a knob');
  assert.match(learnPrompt(getMidiTarget('evolve.toggle')), /pad or key/, 'a trigger asks for a pad');
  assert.match(learnPrompt(getMidiTarget('param.lifeDrift'), 'wrong-kind'), /can't drive it/, 'a refusal is said in words');
  assert.strictEqual(learnPrompt(null), '');
  // every target in the registry can be armed, and gets a gesture it accepts
  for (const t of MIDI_TARGETS) {
    const r = learnMessage(armLearn(createLearnState(), t.id), M([0xb0, 1, 100]));
    assert.ok(r.claimed && r.key === 'cc:1:1', `a CC can learn ${t.id}`);
  }
}

// ── learn mode through the real store + the real engine (fake MIDIAccess) ──
(async () => {
  const S = () => useStore.getState();
  S().setMidiMap({}); S().cancelMidiLearn();
  assert.deepStrictEqual(S().midiLearn, { armed: null }, 'learn state starts disarmed');
  const ctx = fakeCtx(); const knob = fakeInput('Knobs'); const pad = fakeInput('Pad');
  const engine = createMidiEngine({
    requestAccess: async () => fakeAccess([knob, pad]), getMap: () => S().midiMap, ctx, onStatus: () => {},
    onMessage: (msg) => routeLearnMessage(S(), msg), // exactly what hooks/useMidi.js passes
  });
  await engine.start();
  // a knob: arm, wiggle → bound, and the claimed message did not also drive anything
  S().armMidiLearn('param.lifeDrift');
  assert.strictEqual(S().midiLearn.armed, 'param.lifeDrift');
  send(knob, [0xb0, 7, 64]);
  assert.deepStrictEqual(S().midiMap, { 'cc:1:7': 'param.lifeDrift' }, 'the wiggle bound the knob');
  assert.strictEqual(S().midiLearn.armed, null, 'binding disarms');
  assert.strictEqual(ctx.log.length, 0, 'the claimed wiggle did not also fire the target');
  assert.deepStrictEqual(S().midiLast, { type: 'cc', channel: 1, number: 7, value: 64 }, 'the monitor still saw it');
  // …and the very next movement of that knob drives the param
  send(knob, [0xb0, 7, 127]);
  assert.strictEqual(ctx.log.length, 1, 'the bound knob now drives its target');
  assert.strictEqual(ctx.log[0][0], Events.LAYOUT_PARAM);
  assert.strictEqual(ctx.log[0][1].key, 'lifeDrift');
  assert.strictEqual(ctx.log[0][1].value, PARAM_SPEC.lifeDrift.max, 'full scale at CC 127');
  // a pad: arm a trigger, press → bound; the release does nothing; the next press fires
  ctx.log.length = 0;
  S().armMidiLearn('seed.new');
  send(pad, [0x90, 36, 100]); send(pad, [0x80, 36, 0]);
  assert.deepStrictEqual(S().midiMap, { 'cc:1:7': 'param.lifeDrift', 'note:1:36': 'seed.new' }, 'the press bound the pad');
  assert.strictEqual(ctx.log.length, 0, 'neither the claimed press nor its release fired anything');
  send(pad, [0x90, 36, 100]);
  assert.deepStrictEqual(ctx.log.at(-1), [Events.DAVIS_EVOLVE, { bumpSeed: true }], 'the bound pad fires NEW SEED');
  // a pad aimed at a knob target is refused loudly, learn stays armed, nothing binds
  ctx.log.length = 0;
  S().armMidiLearn('param.audioModDepth');
  send(pad, [0x90, 40, 100]);
  assert.strictEqual(S().midiLearn.armed, 'param.audioModDepth', 'refused: learn stays armed');
  assert.strictEqual(S().midiLearnRefused, 'wrong-kind', 'refused: the UI is told why');
  assert.strictEqual(S().midiMap['note:1:40'], undefined, 'refused: nothing bound');
  assert.strictEqual(ctx.log.length, 0, 'refused: nothing fired');
  send(knob, [0xb0, 8, 10]);
  assert.strictEqual(S().midiMap['cc:1:8'], 'param.audioModDepth', 'then a knob lands');
  assert.strictEqual(S().midiLearnRefused, null, 'the refusal clears once bound');
  // re-learning a bound target MOVES it; learning an occupied key moves the key
  S().armMidiLearn('param.lifeDrift'); send(knob, [0xb0, 9, 1]);
  assert.strictEqual(keyFor(S().midiMap, 'param.lifeDrift'), 'cc:1:9', 're-learn moves the target');
  assert.strictEqual(S().midiMap['cc:1:7'], undefined, '…leaving no ghost on the old key');
  S().armMidiLearn('param.audioScaleMod'); send(knob, [0xb0, 9, 1]);
  assert.strictEqual(S().midiMap['cc:1:9'], 'param.audioScaleMod', 'one target per key: the key moved');
  assert.strictEqual(keyFor(S().midiMap, 'param.lifeDrift'), null, '…and the earlier target lost it');
  // a pad held BEFORE learn was armed still releases its hold while armed
  S().bindMidi('note:1:38', 'accum.freeze');
  ctx.log.length = 0;
  send(pad, [0x90, 38, 100]);
  assert.deepStrictEqual(ctx.log.at(-1), [Events.ACCUM_GESTURE, { action: 'freeze', value: true }]);
  S().armMidiLearn('param.lifeDrift');
  send(pad, [0x80, 38, 0]);
  assert.deepStrictEqual(ctx.log.at(-1), [Events.ACCUM_GESTURE, { action: 'freeze', value: false }], 'arming learn never strands a FREEZE');
  // cancel disarms, and a later gesture is just a gesture again
  S().cancelMidiLearn();
  assert.strictEqual(S().midiLearn.armed, null);
  S().cancelMidiLearn(); // idempotent
  ctx.log.length = 0;
  send(knob, [0xb0, 8, 127]);
  assert.strictEqual(ctx.log.length, 1, 'disarmed: the knob drives its target again');
  // learn state is session state: it never reaches the project file
  S().armMidiLearn('evolve.toggle');
  const base = { seed: 7, seedOffsets: {}, paletteId: 'praystation', layoutParams: {}, enabledAssets: {}, quality: 'balanced', autoQuality: true };
  const doc = serializeProject({ ...base, midiMap: S().midiMap, midiLearn: S().midiLearn });
  assert.ok(!('midiLearn' in doc) && !JSON.stringify(doc).includes('evolve.toggle'), 'the armed target is not saved');
  // MIDI off: a stale armed target must not survive (the hook cancels on cleanup)
  engine.stop(); S().cancelMidiLearn();
  assert.strictEqual(S().midiLearn.armed, null);
  S().setMidiMap({});
  console.log('midi learn (store + engine): OK');
})().catch((e) => { console.error(e); process.exit(1); });

// ── wiring ───────────────────────────────────────────────────────────────
{
  const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const sites = { 'state/projectDocument.js': 3, 'state/slices/globalSlice.js': 1, 'hooks/useProjectPayload.js': 2, 'state/projectWatch.mjs': 1, 'panels/PipelinePanel.jsx': 3, 'panels/pipeline/DataExportRow.jsx': 2 };
  for (const [file, min] of Object.entries(sites)) {
    const n = (src(`../${file}`).match(/midiMap|sanitizeMidiMap/g) || []).length;
    assert.ok(n >= min, `${file} must wire midiMap (found ${n}, expected >= ${min})`);
  }
  assert.ok(/useMidi\(\)/.test(src('../App.jsx')), 'the engine runs from App');
  assert.ok(/if \(!enabled\) return undefined;/.test(src('../hooks/useMidi.js')), 'nothing connects until MIDI is enabled');
  assert.ok(/<MidiSection \/>/.test(src('../panels/DavisPanel.jsx')), 'DAVIS PERFORM hosts the MIDI section');
  assert.ok(/routeLearnMessage\(useStore\.getState\(\), msg\)/.test(src('../hooks/useMidi.js')), 'the engine routes messages through learn');
  assert.ok(/cancelMidiLearn\(\)/.test(src('../hooks/useMidi.js')), 'turning MIDI off disarms learn');
  assert.ok(/armMidiLearn\(t\.id\)/.test(src('../panels/davis/MidiSection.jsx')), 'the section arms learn per target');
  assert.ok(/ACCUM_GESTURE[^]*setAccumFrozen/.test(src('../panels/DavisPanel.jsx')), 'the FREEZE button follows a MIDI hold');
}
console.log('midi.selfcheck: OK');
