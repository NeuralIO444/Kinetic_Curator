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
import { PARAM_SPEC } from '../data/layout-modes.js';
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
for (const bad of ['note:0:5', 'note:17:5', 'cc:1:128', 'cc:1:05', 'pad:1:5', '', null, 5, 'note:1:-1', 'note:1:1:1']) assert.ok(!isBindKey(bad), String(bad));
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

// ── wiring ───────────────────────────────────────────────────────────────
{
  const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const sites = { 'state/projectDocument.js': 3, 'state/slices/globalSlice.js': 1, 'hooks/useProjectPayload.js': 2, 'hooks/useProjectAutosave.js': 1, 'panels/PipelinePanel.jsx': 3, 'panels/pipeline/DataExportRow.jsx': 2 };
  for (const [file, min] of Object.entries(sites)) {
    const n = (src(`../${file}`).match(/midiMap|sanitizeMidiMap/g) || []).length;
    assert.ok(n >= min, `${file} must wire midiMap (found ${n}, expected >= ${min})`);
  }
  assert.ok(/useMidi\(\)/.test(src('../App.jsx')), 'the engine runs from App');
  assert.ok(/if \(!enabled\) return undefined;/.test(src('../hooks/useMidi.js')), 'nothing connects until MIDI is enabled');
  assert.ok(/<MidiSection \/>/.test(src('../panels/DavisPanel.jsx')), 'DAVIS PERFORM hosts the MIDI section');
  assert.ok(/ACCUM_GESTURE[^]*setAccumFrozen/.test(src('../panels/DavisPanel.jsx')), 'the FREEZE button follows a MIDI hold');
}
console.log('midi.selfcheck: OK');
