// directorSway.selfcheck.mjs — the Director collects what the hidden pull will read (#1139 wiring, PR 2).
// With the gates closed nothing may change: tick() gains/intensity/phase are what they were, and `sway` is exactly zero.
// The open path is exercised ONLY here, by passing the mechanics in as an argument: no live override exists.
import assert from 'node:assert';
import { createDirector, deriveSway, pullKeeps, richnessFrom, directorGains, NEUTRAL_VIEW, SWAY_GATE_OPEN } from './director.js';
import { DIRECTOR_TABLE } from './directorTable.js';
import { swayOpen, swayBiases, MIN_KEEPS, M2_CAP, M2_FLOOR } from './queenLean.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const plain = (i) => ({ id: `k${i}`, seed: i, config: { layout: {}, palette: { id: 'praystation' } } });
const patterned = (i) => ({ ...plain(i), stack: { l: [{ id: 'kc1', type: 'content' }, { id: 'pt1', type: 'pattern' }], a: 'kc1' } });
const keepsOf = (plainN, patternN = 0) => [...Array.from({ length: plainN }, (_, i) => plain(i)), ...Array.from({ length: patternN }, (_, i) => patterned(100 + i))];
const HOT = { bands: { bass: 1, mid: 0, treble: 0.2, rms: 1 }, enabled: true, sourceType: 'device' };

ok('gate closed: for every one of the 20 rooms, 12 keeps and a hot room produce exactly the neutral view', () => {
  assert.equal(SWAY_GATE_OPEN, false);
  let rooms = 0;
  for (const key of Object.keys(DIRECTOR_TABLE)) {
    const [lois, davis] = key.split('×');
    const g = directorGains({ loisCode: lois, davisCode: davis });
    assert.equal(g.swayAllowance, 0, `${key}: the room's allowance is held at zero`);
    assert.deepEqual(deriveSway({ keeps: keepsOf(12), richness: 1, allowance: g.swayAllowance }), NEUTRAL_VIEW, key);
    rooms += 1;
  }
  assert.equal(rooms, 20);
});

ok('gate closed: tick() is what it was (gains, intensity, phase) and its sway is zero, however hot the inputs', () => {
  const a = createDirector({ now: () => 1000 }); const b = createDirector({ now: () => 1000 });
  b.setPullInputs({ keeps: keepsOf(20), ...HOT });
  const feed = { burning: true, rollsLastMinute: 5, keepsLast5m: 3 };
  const ra = a.tick({ feed, audio: 1, nowTs: 1000 }); const rb = b.tick({ feed, audio: 1, nowTs: 1000 });
  assert.deepEqual(rb.gains, ra.gains); assert.equal(rb.intensity, ra.intensity); assert.equal(rb.directorPhase, ra.directorPhase);
  assert.deepEqual(ra.sway, NEUTRAL_VIEW); assert.deepEqual(rb.sway, NEUTRAL_VIEW);
  assert.deepEqual(a.tick({ nowTs: 2000 }).sway, NEUTRAL_VIEW, 'silence: neutral');
});

ok('the live swayBiases is neutral while the gate is closed even if the allowance were not (belt and braces)', () => {
  for (const allowance of [0, 0.4, 0.9, 1]) assert.deepEqual(deriveSway({ keeps: keepsOf(12), richness: 1, allowance }, swayBiases), NEUTRAL_VIEW);
});

ok('open path, test harness only: within MIN_KEEPS it is zero; above it, the temperature delta stays inside [0, 0.15 x allowance]', () => {
  for (const a of [0.1, 0.4, 0.9]) {
    assert.deepEqual(deriveSway({ keeps: keepsOf(MIN_KEEPS - 1), richness: 1, allowance: a }, swayOpen), NEUTRAL_VIEW, '7 keeps + a hot room: provably zero');
    let prev = -1;
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const d = deriveSway({ keeps: keepsOf(MIN_KEEPS), richness: r, allowance: a }, swayOpen).temperatureDelta;
      assert.ok(d >= 0 && d <= (M2_CAP - M2_FLOOR) * a + 1e-12, `delta ${d} at allowance ${a}, richness ${r}`);
      assert.ok(d >= prev - 1e-12, 'monotone in richness'); prev = d;
    }
  }
  assert.equal(deriveSway({ keeps: keepsOf(12), richness: 0, allowance: 0.9 }, swayOpen).temperatureDelta, 0, 'a quiet room: no warming');
});

ok('keeps that carry a PATTERN layer do not teach the pull (Matt, 2026-10-08): 9 of 20 are skipped, and the minimum counts what is left', () => {
  const ledger = keepsOf(11, 9);
  assert.equal(ledger.length, 20); assert.equal(pullKeeps(ledger).length, 11);
  assert.ok(pullKeeps(ledger).every((k) => !k.stack));
  assert.notDeepEqual(deriveSway({ keeps: ledger, richness: 1, allowance: 0.9 }, swayOpen), NEUTRAL_VIEW, '11 plain keeps are enough');
  assert.deepEqual(deriveSway({ keeps: keepsOf(7, 9), richness: 1, allowance: 0.9 }, swayOpen), NEUTRAL_VIEW, '16 keeps but only 7 count');
  assert.strictEqual(pullKeeps(ledger), pullKeeps(ledger), 'memoised on the ledger identity');
});

ok('a pull that throws, or returns junk, is the neutral view: CURATOR is never taken down', () => {
  assert.deepEqual(deriveSway({ keeps: keepsOf(12), richness: 1, allowance: 0.9 }, () => { throw new Error('boom'); }), NEUTRAL_VIEW);
  for (const junk of [null, undefined, {}, { temperature: NaN }, { temperature: 'hot' }]) assert.deepEqual(deriveSway({ keeps: keepsOf(12), richness: 1, allowance: 0.9 }, () => junk), NEUTRAL_VIEW);
  for (const bad of [null, 'x', 42, undefined]) assert.deepEqual(deriveSway({ keeps: bad, richness: NaN, allowance: NaN }, swayOpen), NEUTRAL_VIEW);
});

ok('richness is the spread of the bands times the level; audio off, a file, or junk is an honest zero', () => {
  assert.ok(richnessFrom(HOT) > 0.2);
  assert.equal(richnessFrom({ ...HOT, enabled: false }), 0, 'audio off');
  assert.equal(richnessFrom({ ...HOT, sourceType: 'file' }), 0, 'a file is not a quiet room');
  assert.equal(richnessFrom({ ...HOT, bands: { bass: 0.4, mid: 0.4, treble: 0.4, rms: 1 } }), 0, 'flat spectrum: no richness');
  assert.equal(richnessFrom({ ...HOT, bands: { bass: 1, mid: 0, treble: 0.2, rms: 0 } }), 0, 'silent: no richness');
  for (const bad of [{}, { bands: null, enabled: true }, { bands: { bass: NaN, mid: 'x', treble: undefined, rms: NaN }, enabled: true, sourceType: 'device' }]) {
    const r = richnessFrom(bad); assert.ok(Number.isFinite(r) && r >= 0 && r <= 1);
  }
  assert.ok(richnessFrom({ bands: { bass: 5, mid: -3, treble: 9, rms: 7 }, enabled: true, sourceType: 'device' }) <= 1);
});

console.log(`directorSway.selfcheck: ${n} checks passed`);
