// node src/curator/formation.selfcheck.mjs
// #1355 Phase 3 step 3 — the formation rule (docs/design/wet-lab-plan.md; Matt 2026-10-12: a formed creature stays
// formed until its pin moves, and both conditions must hold for 30 frames). A spore forms when attraction AND
// density clear the band's thresholds, and not otherwise; a take's record replays to the same events.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, ''); // layout-blind source pins (#1684): whitespace and trailing commas are Prettier's, not the code's
import {
  FORM_HOLD_FRAMES, FORM_THRESHOLDS, thresholdsFor, conditionsHold, fertilityField, quantizeSignal,
  createFormationTracker, createFormationRecorder, replayFormation, verifyFormationRecord,
} from './formation.js';
import { observeFormation, getFormationState, resetFormation, setFormationTap } from './formationLive.js';
import { dishPressure, pinPressures, DISH_SATURATE, DISH_RADIUS } from './dishPressure.js';
import { BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN } from './stress.js';

const W = 1000; const H = 700;

// 1. thresholds: easiest in RELAX, hardest in TIGHTEN; no band reads NORMAL; strictly above
{
  const [r, n, t] = [FORM_THRESHOLDS[BAND_RELAX], FORM_THRESHOLDS[BAND_NORMAL], FORM_THRESHOLDS[BAND_TIGHTEN]];
  assert.ok(r.attraction < n.attraction && n.attraction < t.attraction, 'attraction: relax < normal < tighten');
  assert.ok(r.density < n.density && n.density < t.density, 'density: relax < normal < tighten');
  assert.deepEqual(thresholdsFor(null), n);
  assert.deepEqual(thresholdsFor('junk'), n);
  assert.equal(FORM_HOLD_FRAMES, 30);
  assert.equal(conditionsHold(n.attraction, 1, BAND_NORMAL), false, 'sitting on the line waits');
  assert.equal(conditionsHold(1, n.density, BAND_NORMAL), false);
  assert.equal(conditionsHold(1, 1, BAND_NORMAL), true);
  assert.equal(conditionsHold(1, 0, BAND_RELAX), false, 'attraction alone never forms');
  assert.equal(conditionsHold(0, 1, BAND_RELAX), false, 'crowding alone never forms');
  const mid = { a: (r.attraction + n.attraction) / 2, d: (r.density + n.density) / 2 };
  assert.equal(conditionsHold(mid.a, mid.d, BAND_RELAX), true, 'a middling spot forms in RELAX ...');
  assert.equal(conditionsHold(mid.a, mid.d, BAND_NORMAL), false, '... but not in NORMAL');
  assert.equal(conditionsHold(NaN, NaN, BAND_RELAX), false);
}

// 2. fertility: deterministic, 0..1, about 40% of the dish clears NORMAL, rides only the NOISE stream
{
  const f = fertilityField(1234, null, W, H);
  const g = fertilityField(1234, null, W, H);
  let above = 0; let n = 0;
  for (let x = 5; x < W; x += 25) for (let y = 5; y < H; y += 25) {
    const v = f.at(x, y);
    assert.ok(v >= 0 && v <= 1); assert.equal(v, g.at(x, y), 'same seed, same field');
    if (v > FORM_THRESHOLDS[BAND_NORMAL].attraction) above++;
    n++;
  }
  // one seed's map is lumpy; across seeds the share sits near 40%
  let tot = 0; let cnt = 0;
  for (let s = 1; s <= 30; s++) {
    const h = fertilityField(s * 7919, null, W, H);
    for (let x = 10; x < W; x += 50) for (let y = 10; y < H; y += 50) { if (h.at(x, y) > FORM_THRESHOLDS[BAND_NORMAL].attraction) tot++; cnt++; }
  }
  assert.ok(Math.abs(tot / cnt - 0.4) < 0.08, `about 40% of the dish is fertile in NORMAL (${(100 * tot / cnt).toFixed(0)}%)`);
  const diff = (offs) => { let d = 0; for (let x = 5; x < W; x += 50) for (let y = 5; y < H; y += 50) if (fertilityField(1234, offs, W, H).at(x, y) !== f.at(x, y)) d++; return d; };
  assert.ok(diff({ noise: 99 }) > 50, 're-rolling noise moves the fertile patches');
  assert.equal(diff({ spatial: 99, color: 99, asset: 99 }), 0, 'nothing else does');
  void above; void n;
}

const P = (x, y) => ({ x, y });
const run = (t, frames, u) => { const ev = []; for (let i = 0; i < frames; i++) ev.push(...t.update(u).events); return ev; };

// 3. the tracker: the hold, the band, staying formed, moving pins, independent pins
{
  const yes = { pins: [P(100, 100)], attraction: [0.9], density: [0.9], band: BAND_NORMAL };
  const no = { ...yes, density: [0.1] };
  let t = createFormationTracker();
  assert.equal(run(t, FORM_HOLD_FRAMES - 1, yes).length, 0, 'not before the hold');
  const ev = run(t, 1, yes);
  assert.deepEqual(ev, [{ type: 'hierarchy-form', pin: 0, x: 100, y: 100 }], 'forms on the 30th consecutive frame');
  assert.equal(run(t, 200, yes).length, 0, 'forms once');
  assert.equal(run(t, 200, no).length, 0);
  assert.equal(t.states()[0].formed, true, 'stays formed when the conditions drop (Matt, 2026-10-12)');

  t = createFormationTracker();
  run(t, FORM_HOLD_FRAMES - 1, yes); run(t, 1, no);
  assert.equal(t.states()[0].hold, 0, 'one frame off resets the hold');
  assert.equal(run(t, FORM_HOLD_FRAMES - 1, yes).length, 0, 'and the count starts over');

  t = createFormationTracker();
  run(t, FORM_HOLD_FRAMES + 5, yes);
  const moved = { ...yes, pins: [P(300, 100)] };
  assert.equal(t.update(moved).states[0].formed, false, 'a moved pin is a new spore');
  assert.equal(run(t, FORM_HOLD_FRAMES, moved).length, 1, 'which can form again');
  assert.deepEqual(t.update({ pins: [], attraction: [], density: [], band: BAND_NORMAL }).states, [], 'removing the pin clears it');

  const middling = { pins: [P(10, 10)], attraction: [0.52], density: [0.33] };
  assert.equal(run(createFormationTracker(), 60, { ...middling, band: BAND_RELAX }).length, 1, 'RELAX: forms');
  assert.equal(run(createFormationTracker(), 60, { ...middling, band: BAND_NORMAL }).length, 0, 'NORMAL: waits');
  assert.equal(run(createFormationTracker(), 60, { ...middling, band: BAND_TIGHTEN }).length, 0, 'TIGHTEN: waits');

  t = createFormationTracker();
  const two = { pins: [P(1, 1), P(2, 2)], attraction: [0.9, 0.9], density: [0.9, 0.1], band: BAND_NORMAL };
  const e2 = run(t, 40, two);
  assert.deepEqual(e2.map((e) => e.pin), [0], 'pins are judged one by one');
}

// 4. the take's record: run-length, verifies, and a tampered record fails
{
  const t = createFormationTracker();
  let frame = 0;
  const rec = createFormationRecorder({ getFrame: () => frame });
  const script = [
    [10, { pins: [P(50, 60)], attraction: [0.9], density: [0.2], band: BAND_NORMAL }],
    [40, { pins: [P(50, 60)], attraction: [0.9], density: [0.5], band: BAND_NORMAL }],
    [5, { pins: [P(50, 60), P(400, 300)], attraction: [0.9, 0.5], density: [0.5, 0.3], band: BAND_NORMAL }],
    [50, { pins: [P(50, 60), P(400, 300)], attraction: [0.9, 0.5], density: [0.5, 0.3], band: BAND_RELAX }],
    [20, { pins: [P(50, 60), P(420, 300)], attraction: [0.9, 0.7], density: [0.5, 0.7], band: BAND_TIGHTEN }],
  ];
  for (const [n, u] of script) for (let i = 0; i < n; i++) { const r = t.update(u); rec.update(u, r.events); frame++; }
  const record = rec.finish();
  assert.equal(record.runs.length, script.length, 'one run per held signal set');
  assert.ok(record.forms.length >= 2, `forms recorded (${record.forms.length})`);
  const v = verifyFormationRecord(JSON.parse(JSON.stringify(record)));
  assert.equal(v.ok, true, 'the recorded forms follow from the recorded signals (it survives JSON)');
  assert.equal(v.forms, record.forms.length);
  assert.deepEqual(replayFormation(record), record.forms.map((f) => [f[1], f[2], f[3], f[4]]), 'the same pins form at the same update');
  const bad = JSON.parse(JSON.stringify(record)); bad.forms[0][1] = 3;
  assert.equal(verifyFormationRecord(bad).ok, false, 'a tampered event is caught');
  const bad2 = JSON.parse(JSON.stringify(record)); bad2.runs[1][3] = [0.1];
  assert.equal(verifyFormationRecord(bad2).ok, false, 'tampered signals are caught (they move WHEN a spore forms)');
  assert.equal(verifyFormationRecord({ version: 99 }).ok, false);
}

// 5. dish pressure per pin agrees with the existing reading
{
  const items = []; for (let i = 0; i < 30; i++) items.push({ x: 100 + (i % 5), y: 100 + Math.floor(i / 5) }); items.push({ x: 800, y: 600 });
  const entries = [{ items }, { pattern: true }];
  const pins = [P(100, 100), P(800, 600), P(500, 350), { x: NaN, y: 1 }];
  const each = pinPressures(pins, entries, W, H);
  assert.deepEqual(each, [1, 1 / DISH_SATURATE, 0, 0]);
  assert.equal(dishPressure(pins, entries, W, H), Math.max(...each), 'the dish reading is the most crowded pin');
  assert.deepEqual(pinPressures([], entries, W, H), []);
  void DISH_RADIUS;
}

// 6. live: a fertile, crowded pin forms after the hold; a barren one waits; a take records it
{
  const f = fertilityField(1234, null, W, H);
  let fertile = null; let barren = null;
  for (let x = 100; x < 900 && !(fertile && barren); x += 10) for (let y = 100; y < 600; y += 10) {
    const v = f.at(x, y);
    if (!fertile && v > 0.62) fertile = P(x, y);
    if (!barren && v < 0.4) barren = P(x, y);
  }
  assert.ok(fertile && barren, 'fixture: the seed has a fertile and a barren patch');
  const crowd = (p) => Array.from({ length: 20 }, (_, i) => ({ x: p.x + (i % 4), y: p.y + Math.floor(i / 4) }));
  const output = [{ items: [...crowd(fertile), ...crowd(barren)] }];
  const input = { dishPins: [fertile, barren], canvasW: W, canvasH: H, seed: 1234, seedOffsets: null };
  resetFormation();
  const seen = [];
  setFormationTap((u, ev) => seen.push(...ev));
  for (let i = 0; i < FORM_HOLD_FRAMES + 10; i++) observeFormation(input, output, () => BAND_NORMAL);
  setFormationTap(null);
  const st = getFormationState();
  assert.equal(st.states[0].formed, true, 'the fertile, crowded pin formed');
  assert.equal(st.states[1].formed, false, 'the barren pin waits, however crowded');
  assert.equal(st.states[0].attraction, quantizeSignal(f.at(fertile.x, fertile.y)), 'attraction is the fertility at the pin');
  assert.deepEqual(seen.map((e) => e.pin), [0], 'the take tap saw exactly one hierarchy-form');
  resetFormation();
  for (let i = 0; i < FORM_HOLD_FRAMES + 10; i++) observeFormation({ ...input, dishPins: [fertile] }, [{ items: [] }], () => BAND_RELAX);
  assert.equal(getFormationState().states[0].formed, false, 'fertile but empty: waits');
  resetFormation();
  observeFormation({ ...input, dishPins: [] }, output, () => BAND_NORMAL);
  assert.deepEqual(getFormationState().states, [], 'no pins, nothing to judge');
  resetFormation();
}

// 7. wiring: the take carries a `formation` section; the channel is the resolver's now (#1694 slice 1) —
// it observes each resolved frame after the creature appends (dish pressure is counted inside, from the
// frame's own output, before the rule judges), and App's tap no longer feeds it.
{
  const resolve = readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8');
  assert.match(resolve, /dishCreatures\.append[\s\S]*?lastSpawnDecisions = spawnState\.observe\(input, out\);/);
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.ok(!/observeFormation\(input, output\)/.test(app) && !/observeSpawn\(input, output/.test(app), 'the tap channel is retired');
  const btn = readFileSync(new URL('../components/PerformanceButton.jsx', import.meta.url), 'utf8');
  assert.match(flat(btn), /sections:\{stress:stressSection,formation:formationSection(,\w+:\w+)*\}/);
  assert.match(btn, /resetFormation\(\);/, 'a take starts from fresh formation state');
}

console.log('formation.selfcheck: ok (#1355 step 3, the formation rule)');
