// audioInputConstraints.selfcheck.mjs — raw (unprocessed) audio input (#1052).
import assert from 'node:assert';
import { RAW_AUDIO, audioInputConstraints, processingStillOn } from './audioInputConstraints.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('default device: all three processing switches are off, no deviceId', () => {
  for (const id of ['default', '', undefined, null]) {
    const c = audioInputConstraints(id);
    assert.deepEqual(c, { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  }
});

ok('chosen device: switches off and the exact deviceId is kept', () => {
  const c = audioInputConstraints('usb-fm1');
  assert.equal(c.audio.echoCancellation, false);
  assert.equal(c.audio.noiseSuppression, false);
  assert.equal(c.audio.autoGainControl, false);
  assert.deepEqual(c.audio.deviceId, { exact: 'usb-fm1' });
});

ok('constraints never alias the frozen defaults', () => {
  const c = audioInputConstraints('a');
  c.audio.echoCancellation = true;
  assert.equal(RAW_AUDIO.echoCancellation, false);
  assert.equal(audioInputConstraints('b').audio.echoCancellation, false);
});

ok('processingStillOn names what the browser kept on', () => {
  assert.deepEqual(processingStillOn({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }), []);
  assert.deepEqual(processingStillOn({ echoCancellation: false, noiseSuppression: true, autoGainControl: true }), ['noiseSuppression', 'autoGainControl']);
});

ok('processingStillOn: unreported keys and junk are not "on"', () => {
  assert.deepEqual(processingStillOn({}), []);
  assert.deepEqual(processingStillOn(null), []);
  assert.deepEqual(processingStillOn({ autoGainControl: 'true' }), []);
});

console.log(`audioInputConstraints.selfcheck: ${n} checks passed`);
