// node src/curator/davisShift.selfcheck.mjs
// #1356 step 2 — Davis shifts a moth's traits once, at birth: bounded, banded, deterministic, replayable.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHIFT_WIDTH, shiftWidthFor, shiftFor, createShiftTracker, createShiftRecorder } from './davisShift.js';
import { TRAIT_DEFAULTS, TRAIT_RANGES } from '../engine/creature.js';
import { BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN } from './stress.js';
import { observeFormation, getPinTraits, setShiftTap, resetFormation, noteKeep, setRoomProvider } from './formationLive.js';
import { fertilityField, FORM_HOLD_FRAMES } from './formation.js';

const inRange = (t) => Object.keys(TRAIT_RANGES).every((k) => t[k] >= TRAIT_RANGES[k].min && t[k] <= TRAIT_RANGES[k].max);
const roll = (n, over = {}) => Array.from({ length: n }, (_, i) => shiftFor({ seed: 11 + i, pin: { x: 100 + i * 7, y: 200 + i * 3 }, ...over }));

// 1. the band sets the width: RELAX widest, NORMAL default, TIGHTEN narrowest (roadmap table)
{
  assert.ok(SHIFT_WIDTH[BAND_RELAX] > SHIFT_WIDTH[BAND_NORMAL] && SHIFT_WIDTH[BAND_NORMAL] > SHIFT_WIDTH[BAND_TIGHTEN]);
  assert.equal(shiftWidthFor(null), SHIFT_WIDTH[BAND_NORMAL]);
  assert.equal(shiftWidthFor('???'), SHIFT_WIDTH[BAND_NORMAL]);
}

// 2. every shift is inside the hard ranges, and the reach really follows the width
{
  const reach = (w) => {
    const ts = roll(400, { width: w });
    for (const t of ts) assert.ok(inRange(t), JSON.stringify(t));
    return {
      spread: Math.max(...ts.map((t) => Math.abs(t.spread))),
      wing: Math.max(...ts.map((t) => Math.abs(t.wing - 1))),
      swatch: Math.max(...ts.map((t) => t.swatch)),
    };
  };
  const wide = reach(SHIFT_WIDTH[BAND_RELAX]); const mid = reach(SHIFT_WIDTH[BAND_NORMAL]); const narrow = reach(SHIFT_WIDTH[BAND_TIGHTEN]);
  assert.ok(wide.spread > mid.spread && mid.spread > narrow.spread, `spread reach ${wide.spread.toFixed(1)} > ${mid.spread.toFixed(1)} > ${narrow.spread.toFixed(1)}`);
  assert.ok(wide.wing > narrow.wing && wide.swatch >= narrow.swatch);
  assert.ok(wide.spread > TRAIT_RANGES.spread.max * 0.6, 'relaxed shifts use most of the range');
  assert.ok(narrow.spread <= TRAIT_RANGES.spread.max * SHIFT_WIDTH[BAND_TIGHTEN] + 1e-9, 'tight shifts stay inside their narrower share');
  const zero = shiftFor({ seed: 5, pin: { x: 1, y: 1 }, width: 0 });
  assert.equal(zero.spread, 0); assert.equal(zero.wing, 1); assert.equal(zero.body, 1); assert.equal(zero.swatch, 0, 'width 0 is exactly today\'s moth');
  assert.ok(inRange(shiftFor({ seed: 5, pin: null, width: NaN })), 'junk width and pin never break it');
}

// 3. deterministic (the same dish, the same moth), and every input matters (seed, place, slot, ordinal, offsets)
{
  const base = { seed: 9, pin: { x: 320, y: 140 }, slot: 0, ordinal: 1, width: 1 };
  assert.deepEqual(shiftFor(base), shiftFor({ ...base }));
  for (const [k, v] of Object.entries({ seed: 10, pin: { x: 321, y: 140 }, slot: 1, ordinal: 2, seedOffsets: { spatial: 3 } })) {
    assert.notDeepEqual(shiftFor({ ...base, [k]: v }), shiftFor(base), `a different ${k} is a different moth`);
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const ts = roll(600, { width: 1 });
  assert.ok(Math.abs(mean(ts.map((t) => t.spread))) < 2.5, 'centred on today\'s moth, not biased one way');
  assert.ok(ts.some((t) => t.swatch === 0) && ts.some((t) => t.swatch >= 2), 'the swatch rank varies');
  const src = readFileSync(new URL('./davisShift.js', import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n');
  assert.ok(!/Math\.random|Date\.now|performance\.now|setTimeout/.test(src), 'no clock, no chance');
}

// 4. ONCE, at birth: the same moth keeps its character; a moved or removed pin is a new birth
{
  const t = createShiftTracker();
  const st = (formed, over = {}) => ({ x: 100, y: 100, formed, ...over });
  const ctx = { seed: 3, band: BAND_NORMAL };
  assert.deepEqual(t.update([st(false)], ctx).traits, [null], 'a spore has no traits');
  const first = t.update([st(true)], ctx);
  assert.equal(first.born.length, 1, 'born on the frame it forms');
  assert.ok(first.traits[0] && inRange(first.traits[0]));
  const again = t.update([st(true)], { ...ctx, band: BAND_RELAX });
  assert.equal(again.born.length, 0, 'the band moving later does not re-shift a living moth');
  assert.deepEqual(again.traits[0], first.traits[0]);
  const moved = t.update([st(true, { x: 400 })], ctx);
  assert.equal(moved.born.length, 1, 'a moved pin is a new moth');
  assert.notDeepEqual(moved.traits[0], first.traits[0]);
  t.update([st(false)], ctx);
  const back = t.update([st(true, { x: 400 })], ctx);
  assert.equal(back.born.length, 1, 'unformed then formed: born again');
  assert.deepEqual(back.born[0].band, BAND_NORMAL); assert.ok(back.born[0].width > 0);
  // the band at birth is what sets the width
  const r = createShiftTracker(); const c = createShiftTracker();
  const wRelax = r.update([st(true)], { seed: 3, band: BAND_RELAX }).born[0].width;
  const wTight = c.update([st(true)], { seed: 3, band: BAND_TIGHTEN }).born[0].width;
  assert.ok(wRelax > wTight);
  // a room's width (LOIS, step 3) scales it further, and cannot widen past the band
  const room = createShiftTracker().update([st(true)], { seed: 3, band: BAND_RELAX, roomWidth: 0.5 }).born[0].width;
  assert.ok(Math.abs(room - wRelax * 0.5) < 1e-3);
  assert.ok(createShiftTracker().update([st(true)], { seed: 3, band: BAND_RELAX, roomWidth: 9 }).born[0].width <= wRelax + 1e-9);
  // independent pins
  const m = createShiftTracker().update([st(true), st(true, { x: 700 }), null], ctx);
  assert.notDeepEqual(m.traits[0], m.traits[1]); assert.equal(m.traits[2], null);
}

// 5. the log: [frame, pin, spread, wing, body, swatch, room, lois, davis], in order
{
  let frame = 0;
  const rec = createShiftRecorder({ getFrame: () => frame });
  frame = 42; rec.update([{ pin: 0, traits: { spread: 7.12345, wing: 1.1, body: 0.9, swatch: 2 } }]);
  frame = 60; rec.update([{ pin: 1, traits: { spread: -2, wing: 1, body: 1, swatch: 0 }, room: { n: 11, lois: 'BURN', davis: 'FLOW' } }]);
  assert.deepEqual(rec.finish(), { version: 2, events: [[42, 0, 7.123, 1.1, 0.9, 2, 0, null, null], [60, 1, -2, 1, 1, 0, 11, 'BURN', 'FLOW']] });
}

// 6. live: a pin the formation rule forms is born with traits through the same tap, once; a fresh take starts clean
{
  resetFormation();
  const f = fertilityField(5, null, 1000, 700);
  let spot = null;
  for (let x = 25; x < 1000 && !spot; x += 25) for (let y = 25; y < 700 && !spot; y += 25) if (f.at(x, y) > 0.7) spot = { x, y };
  assert.ok(spot);
  const crowd = [{ items: Array.from({ length: 30 }, (_, i) => ({ x: spot.x + (i % 4), y: spot.y + (i % 3) })) }];
  const inp = { dishPins: [spot], canvasW: 1000, canvasH: 700, seed: 5, seedOffsets: null };
  const seen = [];
  setShiftTap((b) => seen.push(...b));
  for (let i = 0; i < FORM_HOLD_FRAMES - 1; i++) observeFormation(inp, crowd, () => BAND_NORMAL);
  assert.deepEqual(getPinTraits(), [null], 'still a spore: no traits');
  observeFormation(inp, crowd, () => BAND_NORMAL);
  assert.ok(getPinTraits()[0] && inRange(getPinTraits()[0]), 'formed: born with traits');
  const mine = getPinTraits()[0];
  for (let i = 0; i < 100; i++) observeFormation(inp, crowd, () => BAND_RELAX);
  assert.deepEqual(getPinTraits()[0], mine, 'they never change for the moth\'s life');
  assert.equal(seen.length, 1, 'one davis-shift event');
  setShiftTap(null);
  resetFormation();
  assert.deepEqual(getPinTraits(), [], 'a fresh take starts clean');
}

// 6b. step 5 live: with 8 keeps and a room that gives her a hand, a moth born AFTER a keep leans toward the moths alive at it
{
  const born = (keepsCount, warm) => {
    resetFormation();
    const f = fertilityField(5, null, 1000, 700);
    let spot = null;
    for (let x = 25; x < 1000 && !spot; x += 25) for (let y = 25; y < 700 && !spot; y += 25) if (f.at(x, y) > 0.7) spot = { x, y };
    const crowd = [{ items: Array.from({ length: 30 }, (_, i) => ({ x: spot.x + (i % 4), y: spot.y + (i % 3) })) }];
    const inp = { dishPins: [spot], canvasW: 1000, canvasH: 700, seed: 5, seedOffsets: null };
    const keeps = Array.from({ length: keepsCount }, () => ({ stack: { l: [{ type: 'content' }] } }));
    setRoomProvider(() => ({ width: 1, room: null, allowance: 1, keeps }));
    if (warm) { // a first moth lives and is kept; then the pin moves (a new birth) on the same seed
      for (let i = 0; i < FORM_HOLD_FRAMES; i++) observeFormation(inp, crowd, () => BAND_NORMAL);
      noteKeep();
      const moved = { x: spot.x + 1, y: spot.y };
      const inp2 = { ...inp, dishPins: [moved] };
      const crowd2 = [{ items: crowd[0].items.map((m) => ({ x: m.x + 1, y: m.y })) }];
      for (let i = 0; i < FORM_HOLD_FRAMES; i++) observeFormation(inp2, crowd2, () => BAND_NORMAL);
      return getPinTraits()[0];
    }
    for (let i = 0; i < FORM_HOLD_FRAMES; i++) observeFormation(inp, crowd, () => BAND_NORMAL);
    return getPinTraits()[0];
  };
  const first = born(8, false);
  assert.ok(first, 'a moth is born');
  const warmed = born(8, true);
  const cold = born(3, true); // fewer than 8 keeps: she is identity
  assert.ok(warmed && cold);
  assert.notDeepEqual(warmed, cold, 'with 8 keeps the second moth is nudged; with 3 it is not');
  setRoomProvider(null);
  resetFormation();
}

// 7. wiring: the loop carries the traits (so a take replays the moths), the app supplies them, the take records them
{
  const loop = readFileSync(new URL('../gl/liveLoop.mjs', import.meta.url), 'utf8');
  assert.ok(/dishTraits: spawnDecisions \? spawnDecisions\.dishTraits/.test(loop));
  // #1694 slice 1 — the traits' source moved: the resolver publishes them (no provider registered by App any more)
  assert.ok(/lastSpawnDecisions = spawnState\.observe\(input, out\)/.test(readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8')), 'the resolver publishes the spawn decisions');
  assert.ok(!/setTraitsProvider/.test(readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')), 'the provider channel is retired');
  assert.ok(/davis: davisSection/.test(readFileSync(new URL('../components/PerformanceButton.jsx', import.meta.url), 'utf8')));
}

// step 5 (#1356): a centre nudges the roll, and null is exactly the old roll
{
  const base = { seed: 7, pin: { x: 100, y: 120 }, ordinal: 1, slot: 0, width: 1 };
  assert.deepEqual(shiftFor({ ...base, centre: null }), shiftFor(base), 'no centre = step 2 exactly');
  const warm = { spread: 9, wing: 1.1, body: 1.05, swatch: 0 };
  let up = 0; let n = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const a = shiftFor({ ...base, seed });
    const b = shiftFor({ ...base, seed, centre: warm });
    if (b.spread > a.spread) up++;
    n++;
    for (const k of ['spread', 'wing', 'body']) {
      assert.ok(b[k] >= TRAIT_RANGES[k].min && b[k] <= TRAIT_RANGES[k].max, `${k} stays inside its range`);
    }
    assert.ok(b.swatch >= 0 && b.swatch <= 3 && Number.isInteger(b.swatch));
  }
  assert.ok(up / n > 0.8, `a warm centre leans the spread upward (${up}/${n})`);
  // the tracker reads the centre only at a birth
  const t = createShiftTracker();
  let calls = 0;
  const states = [{ x: 5, y: 5, formed: true }];
  const r1 = t.update(states, { seed: 3, centre: () => { calls++; return warm; } });
  t.update(states, { seed: 3, centre: () => { calls++; return warm; } });
  assert.equal(calls, 1, 'the centre is read once, at the birth');
  assert.ok(r1.traits[0]);
}

console.log('davisShift.selfcheck: ok (#1356 step 2)');
