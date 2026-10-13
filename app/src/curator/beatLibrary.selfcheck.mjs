// #1475 — the beat library: valid data, a wide spread, and a fail-closed validator.
import assert from 'node:assert/strict';
import { BEATS, VIBES, LANES, STEPS, sanitizePattern, findBeat, BEAT_VERSION } from './beatLibrary.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('every built-in pattern passes its own validator, unchanged', () => {
  assert.equal(BEAT_VERSION, 'kc-beat/1');
  assert.ok(BEATS.length >= 16, `a library, not a few (${BEATS.length})`);
  for (const b of BEATS) {
    const c = sanitizePattern(b);
    assert.ok(c, b.id);
    assert.deepEqual(c.lanes, b.lanes, `${b.id}: lanes survive`);
    for (const l of LANES) assert.equal(b.lanes[l].length, STEPS, `${b.id}.${l}`);
  }
  assert.equal(new Set(BEATS.map((b) => b.id)).size, BEATS.length, 'unique ids');
});

ok('a wide variety: every mood is served, tempos span slow to fast, and the grids really differ', () => {
  for (const v of VIBES) assert.ok(BEATS.some((b) => b.vibes.includes(v)), `a pattern for ${v}`);
  assert.ok(Math.min(...BEATS.map((b) => b.bpm[0])) <= 70 && Math.max(...BEATS.map((b) => b.bpm[1])) >= 138, 'slow to fast');
  assert.ok(BEATS.some((b) => b.swing >= 0.3), 'a hard shuffle');
  assert.ok(new Set(BEATS.map((b) => b.lanes.kick)).size >= 12, 'distinct kick grids');
  assert.ok(BEATS.some((b) => b.intensity <= 0.3) && BEATS.some((b) => b.intensity >= 0.85), 'quiet and loud');
  const everyOneHits = BEATS.every((b) => LANES.some((l) => /[xo]/.test(b.lanes[l])));
  assert.ok(everyOneHits, 'no pattern is silent');
});

ok('the validator fails closed on anything malformed', () => {
  const good = BEATS[0];
  assert.equal(sanitizePattern(null), null);
  assert.equal(sanitizePattern({ ...good, id: 'Bad Id!' }), null, 'a bad id');
  assert.equal(sanitizePattern({ ...good, lanes: { ...good.lanes, kick: 'x...' } }), null, 'a short lane');
  assert.equal(sanitizePattern({ ...good, lanes: { ...good.lanes, hat: 'z...............' } }), null, 'a bad step character');
  assert.equal(sanitizePattern({ ...good, lanes: { kick: good.lanes.kick } }), null, 'a missing lane');
  assert.equal(sanitizePattern({ ...good, bpm: [200, 100] }), null, 'inverted tempo');
  assert.equal(sanitizePattern({ ...good, bpm: [10, 400] }), null, 'tempo out of range');
  assert.equal(sanitizePattern({ ...good, vibes: ['nonsense'] }), null, 'no valid mood');
  const c = sanitizePattern({ ...good, swing: 9, intensity: -3, bed: 7 });
  assert.deepEqual([c.swing, c.intensity, c.bed], [0.5, 0, 0.2], 'numbers clamp into range');
  assert.equal(findBeat('four-floor').id, 'four-floor');
  assert.equal(findBeat('nope'), null);
});

console.log(`beatLibrary.selfcheck: ${n} checks passed`);
