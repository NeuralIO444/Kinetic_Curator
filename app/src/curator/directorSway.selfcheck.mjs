// directorSway.selfcheck.mjs — the Director collects what the hidden pull will read (#1139 wiring, PR 2).
// The sway gate opened on 2026-10-08 (Matt: rank + temperature). The CLOSED behaviour stays proven by injecting a closed pull
// (NEUTRAL_SWAY) and by the floors that are still absolute: under MIN_KEEPS and at zero allowance the view is exactly zero.
// The live path is checked against its bounds. No live override exists anywhere.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createDirector, deriveSway, applySway, pullKeeps, richnessFrom, directorGains, NEUTRAL_VIEW, SWAY_GATE_OPEN, RELAX_TEMP } from './director.js';
import { DIRECTOR_TABLE } from './directorTable.js';
import { swayOpen, swayBiases, MIN_KEEPS, M2_CAP, M2_FLOOR, NEUTRAL_SWAY } from './queenLean.mjs';
import { TEMP_CAP } from './effectiveTemp.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const plain = (i) => ({ id: `k${i}`, seed: i, config: { layout: {}, palette: { id: 'praystation' } } });
const patterned = (i) => ({ ...plain(i), stack: { l: [{ id: 'kc1', type: 'content' }, { id: 'pt1', type: 'pattern' }], a: 'kc1' } });
const keepsOf = (plainN, patternN = 0) => [...Array.from({ length: plainN }, (_, i) => plain(i)), ...Array.from({ length: patternN }, (_, i) => patterned(100 + i))];
const HOT = { bands: { bass: 1, mid: 0, treble: 0.2, rms: 1 }, enabled: true, sourceType: 'device' };

ok('sway gate open: every one of the 20 rooms carries its table allowance, and a CLOSED pull is exactly the neutral view in all of them', () => {
  assert.equal(SWAY_GATE_OPEN, true);
  let rooms = 0;
  for (const [key, row] of Object.entries(DIRECTOR_TABLE)) {
    const [lois, davis] = key.split('\u00d7');
    const g = directorGains({ loisCode: lois, davisCode: davis });
    assert.equal(g.swayAllowance, row.sway_allowance, `${key}: the room's allowance is live`);
    assert.deepEqual(deriveSway({ keeps: keepsOf(12), richness: 1, allowance: g.swayAllowance }, () => NEUTRAL_SWAY), NEUTRAL_VIEW, `${key}: a closed pull is neutral`);
    assert.deepEqual(deriveSway({ keeps: keepsOf(12), richness: 1, allowance: 0 }), NEUTRAL_VIEW, `${key}: zero allowance is neutral`);
    rooms += 1;
  }
  assert.equal(rooms, 20);
});

ok('tick() under the open gate: gains stay in the room\'s own bounds; below MIN_KEEPS it is exactly what it was; the pull only ever warms', () => {
  const feed = { burning: true, rollsLastMinute: 5, keepsLast5m: 3 };
  const a = createDirector({ now: () => 1000 }); const few = createDirector({ now: () => 1000 }); const many = createDirector({ now: () => 1000 });
  few.setPullInputs({ keeps: keepsOf(MIN_KEEPS - 1), ...HOT }); many.setPullInputs({ keeps: keepsOf(20), ...HOT });
  const ra = a.tick({ feed, audio: 1, nowTs: 1000 }); const rf = few.tick({ feed, audio: 1, nowTs: 1000 }); const rm = many.tick({ feed, audio: 1, nowTs: 1000 });
  assert.deepEqual(rf.gains, ra.gains); assert.deepEqual(rf.sway, NEUTRAL_VIEW, '7 keeps + a hot room: untouched');
  assert.equal(rm.intensity, ra.intensity); assert.equal(rm.directorPhase, ra.directorPhase);
  assert.ok(rm.gains.temperature >= ra.gains.temperature - 1e-12 && rm.gains.temperature <= TEMP_CAP + 1e-12, `temperature ${ra.gains.temperature} -> ${rm.gains.temperature}`);
  assert.deepEqual({ ...rm.gains, temperature: 0 }, { ...ra.gains, temperature: 0 }, 'only the temperature moves');
  assert.deepEqual(a.tick({ nowTs: 2000 }).sway, NEUTRAL_VIEW, 'silence: neutral');
});

ok('the live swayBiases is the open computation (above the minimum) and neutral below it', () => {
  const sig = { richness: 1 };
  assert.deepEqual(swayBiases(keepsOf(MIN_KEEPS), sig), swayOpen(keepsOf(MIN_KEEPS), sig));
  assert.deepEqual(swayBiases(keepsOf(MIN_KEEPS - 1), sig), NEUTRAL_SWAY);
});

ok('open path (mechanics injected): within MIN_KEEPS it is zero; above it, the temperature delta stays inside [0, 0.15 x allowance]', () => {
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

// ── PR 3: M2 composed at the pick site (effectiveTemp stays the single base) ──
ok('M2: a neutral view returns the SAME gains object (nothing reallocated, nothing changed) for every room', () => {
  for (const key of Object.keys(DIRECTOR_TABLE)) {
    const [lois, davis] = key.split('×');
    const g = directorGains({ loisCode: lois, davisCode: davis });
    assert.strictEqual(applySway(g, NEUTRAL_VIEW), g, key);
    assert.strictEqual(applySway(g, { temperatureDelta: 0 }), g);
    assert.strictEqual(applySway(g, { temperatureDelta: -0.1 }), g, 'a pull never cools');
    for (const junk of [null, undefined, {}, { temperatureDelta: NaN }, { temperatureDelta: 'hot' }]) assert.strictEqual(applySway(g, junk), g);
  }
});

ok('M2 open path, harness only: for all 20 rooms the pick temperature rises by at most 0.15 x the room allowance, never past 0.55, and nothing else changes', () => {
  const hot = deriveSway; // the open mechanics are passed in, never reachable live
  for (const [key, row] of Object.entries(DIRECTOR_TABLE)) {
    const [lois, davis] = key.split('×');
    const g = directorGains({ loisCode: lois, davisCode: davis });
    const view = hot({ keeps: keepsOf(12), richness: 1, allowance: row.sway_allowance }, swayOpen);
    const w = applySway(g, view);
    assert.ok(w.temperature >= g.temperature - 1e-12 && w.temperature <= TEMP_CAP + 1e-12, `${key}: ${g.temperature} -> ${w.temperature}`);
    assert.ok(w.temperature - g.temperature <= (M2_CAP - M2_FLOOR) * row.sway_allowance + 1e-12, `${key}: delta bound`);
    assert.deepEqual({ ...w, temperature: 0 }, { ...g, temperature: 0 }, `${key}: only the temperature moves`);
  }
  const burn = directorGains({ loisCode: 'BURN', davisCode: 'FLOW' }); // the warmest room: 0.55 already
  assert.equal(applySway(burn, { temperatureDelta: 0.15 }).temperature, TEMP_CAP, 'the cap holds');
});

ok('M2 and the relax machine: the pull is added BEFORE relax clamps, so a relaxing room still cools hard (source order)', () => {
  const src = readFileSync(new URL('./director.js', import.meta.url), 'utf8');
  const tick = src.slice(src.indexOf('function tick('));
  assert.ok(tick.indexOf('applySway(') > -1 && tick.indexOf('applySway(') < tick.indexOf('RELAX_TEMP'), 'applySway runs before the relax clamp');
  assert.ok(RELAX_TEMP <= 0.3);
  assert.match(tick, /temp: \+base\.temperature/, 'the trace logs the room\'s own temperature, never the pull');
});

console.log(`directorSway.selfcheck: ${n} checks passed`);
