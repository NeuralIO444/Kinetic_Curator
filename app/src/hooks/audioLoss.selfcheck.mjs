// audioLoss.selfcheck.mjs — a lost audio input says so (#1053).
import assert from 'node:assert';
import { classifyAudioError, lostLine, audioInputs, selectedInputMissing } from './audioLoss.mjs';
import { createAudioSlice } from '../state/slices/audioSlice.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('a refused permission is "denied"; a missing device is "lost"', () => {
  for (const name of ['NotAllowedError', 'SecurityError', 'PermissionDeniedError']) {
    assert.equal(classifyAudioError({ name }), 'denied', name);
  }
  for (const name of ['NotFoundError', 'OverconstrainedError', 'NotReadableError', 'AbortError']) {
    assert.equal(classifyAudioError({ name }), 'lost', name);
  }
});

ok('unknown errors keep the old behaviour (denied), junk does not throw', () => {
  assert.equal(classifyAudioError({ name: 'WeirdError' }), 'denied');
  assert.equal(classifyAudioError(null), 'denied');
  assert.equal(classifyAudioError(undefined), 'denied');
  assert.equal(classifyAudioError('x'), 'denied');
});

ok('lostLine names the device, or says so plainly when unnamed', () => {
  assert.equal(lostLine('FM-1 USB'), 'input lost: FM-1 USB');
  assert.equal(lostLine('  FM-1  '), 'input lost: FM-1');
  assert.equal(lostLine(''), 'input lost: the audio input');
  assert.equal(lostLine(undefined), 'input lost: the audio input');
});

ok('audioInputs keeps only audio inputs', () => {
  const devs = [{ kind: 'audioinput', deviceId: 'a' }, { kind: 'videoinput', deviceId: 'v' }, { kind: 'audiooutput', deviceId: 'o' }, null];
  assert.deepEqual(audioInputs(devs).map((d) => d.deviceId), ['a']);
  assert.deepEqual(audioInputs(undefined), []);
});

ok('selectedInputMissing: only a chosen device that left the list', () => {
  const list = [{ deviceId: 'a' }, { deviceId: 'b' }];
  assert.equal(selectedInputMissing({ type: 'device', id: 'b' }, list), false);
  assert.equal(selectedInputMissing({ type: 'device', id: 'gone' }, list), true);
  assert.equal(selectedInputMissing({ type: 'device', id: 'default' }, list), false);
  assert.equal(selectedInputMissing({ type: 'file', url: 'blob:x' }, list), false);
  assert.equal(selectedInputMissing({ type: 'device', id: 'gone' }, []), false, 'not enumerated yet is not "gone"');
  assert.equal(selectedInputMissing(null, list), false);
});

// The slice, against a tiny zustand-shaped set().
function makeSlice() {
  let state = {};
  const set = (fn) => { state = { ...state, ...(typeof fn === 'function' ? fn(state) : fn) }; };
  state = createAudioSlice(set);
  return { get: () => state, act: (name, ...a) => state[name](...a) };
}

ok('slice: lost is set with the device name and starts empty', () => {
  const s = makeSlice();
  assert.equal(s.get().audioLost, null);
  s.act('setAudioLost', 'FM-1 USB');
  assert.deepEqual(s.get().audioLost, { name: 'FM-1 USB' });
  s.act('setAudioLost', '');
  assert.deepEqual(s.get().audioLost, { name: '' }, 'unnamed loss is still a loss');
});

ok('slice: switching AUDIO on, or choosing another source, clears it', () => {
  const s = makeSlice();
  s.act('setAudioLost', 'FM-1');
  s.act('setAudioEnabled', true);
  assert.equal(s.get().audioLost, null);
  s.act('setAudioLost', 'FM-1');
  s.act('setAudioSource', { type: 'device', id: 'default' });
  assert.equal(s.get().audioLost, null);
});

ok('slice: switching AUDIO off keeps the notice (that is how a loss shuts it down)', () => {
  const s = makeSlice();
  s.act('setAudioLost', 'FM-1');
  s.act('setAudioEnabled', false);
  assert.deepEqual(s.get().audioLost, { name: 'FM-1' });
});

ok('slice: null clears explicitly', () => {
  const s = makeSlice();
  s.act('setAudioLost', 'FM-1');
  s.act('setAudioLost', null);
  assert.equal(s.get().audioLost, null);
});

console.log(`audioLoss.selfcheck: ${n} checks passed`);
