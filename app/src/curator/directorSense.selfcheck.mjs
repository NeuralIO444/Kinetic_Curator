// directorSense.selfcheck.mjs — #1145: the intensity scalar.
import assert from 'node:assert';
import {
  INTENSITY_PEAK,
  INTENSITY_DECAY_SECONDS,
  ENGAGE_FLOOR,
  intensityFromSignals,
  normalizeKeepPassVelocity,
  normalizePhaseTime,
  createIntensityTracker,
} from './directorSense.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('max-pool: the hottest signal sets the room, not the average', () => {
  assert.equal(intensityFromSignals({ audio: 0.9, keepPass: 0.1, beat: 0.1, phaseTime: 0.1 }), 0.9);
  assert.equal(intensityFromSignals({ audio: 0, keepPass: 0, beat: 0, phaseTime: 0 }), 0);
  assert.equal(intensityFromSignals({}), 0);
});

ok('inputs clamp to 0..1; non-finite reads as 0 (never invent a signal)', () => {
  assert.equal(intensityFromSignals({ audio: 5 }), 1);
  assert.equal(intensityFromSignals({ audio: -2 }), 0);
  assert.equal(intensityFromSignals({ audio: NaN }), 0);
  assert.equal(intensityFromSignals({ audio: 'loud' }), 0);
});

ok('keep/pass velocity: 2 keeps a minute saturates the scale', () => {
  assert.equal(normalizeKeepPassVelocity(0), 0);
  assert.equal(normalizeKeepPassVelocity(2), 1);
  assert.equal(normalizeKeepPassVelocity(10), 1);
  assert.ok(normalizeKeepPassVelocity(1) === 0.5);
});

ok('phase time: five minutes of heat saturates', () => {
  assert.equal(normalizePhaseTime(0), 0);
  assert.equal(normalizePhaseTime(300), 1);
  assert.equal(normalizePhaseTime(3600), 1);
});

ok('tracker rises instantly to a hotter reading', () => {
  let t = 1000;
  const tr = createIntensityTracker({ now: () => t });
  assert.equal(tr.update({ audio: 0.9 }, t), 0.9);
  assert.equal(tr.value, 0.9);
});

ok(`tracker decays toward 0 over ~${INTENSITY_DECAY_SECONDS}s of quiet`, () => {
  let t = 1000;
  const tr = createIntensityTracker({ now: () => t });
  tr.update({ audio: 1 }, t);
  t += 30 * 1000;
  const mid = tr.update({ audio: 0 }, t);
  assert.ok(mid > 0.4 && mid < 0.6, `30s of quiet should halve it, got ${mid}`);
  t += 31 * 1000;
  assert.equal(tr.update({ audio: 0 }, t), 0);
});

ok('tracker NEVER decays while audio/MIDI actively engages', () => {
  let t = 1000;
  const tr = createIntensityTracker({ now: () => t });
  tr.update({ audio: 0.8 }, t);
  t += 120 * 1000; // two full decay windows pass…
  assert.equal(tr.update({ audio: 0.8 }, t), 0.8, 'engaged: frozen, not decayed');
  // …but it can still rise while engaged
  assert.equal(tr.update({ audio: 1 }, t), 1);
});

ok('below the engage floor counts as disengaged (decay resumes)', () => {
  let t = 1000;
  const tr = createIntensityTracker({ now: () => t });
  tr.update({ audio: 0.8 }, t);
  t += 61 * 1000;
  assert.equal(tr.update({ audio: ENGAGE_FLOOR }, t), 0);
});

ok('peak constant is sane', () => {
  assert.ok(INTENSITY_PEAK > 0.5 && INTENSITY_PEAK < 1, `peak at ${INTENSITY_PEAK}`);
});

console.log(`directorSense.selfcheck: ${n} checks passed`);
