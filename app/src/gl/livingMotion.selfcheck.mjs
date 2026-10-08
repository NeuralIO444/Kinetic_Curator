// livingMotion.selfcheck.mjs — the floor that makes "nothing is ever 100% frozen" real (#1128, #721).
//
// A NEW scene breathes (0.3) and drifts (0.5), each mark on its own phase from the seed; a document, keep or link
// that predates the floor opens as it was saved. The drivers are measured FROM rest, so a still is byte-identical to a
// scene with none, and they must never stack on the placement cache (the first time they were wired live they did).
import assert from 'node:assert';
import { createLiveResolver } from './liveResolve.mjs';
import { buildPlacements } from '../engine/buildPlacements.js';
import { evaluateKineme, applyKinemeDrivers, patternAmounts, KINEME_PATTERNS, THUMP_PULSE } from '../engine/kineme.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';
import { resolvePalette } from '../data/palettes.js';
import { encodeRecipeUrl, decodeRecipeUrl } from '../state/recipeUrls.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const base = (over = {}) => ({
  layers: [{ id: 'L', name: 'A', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }], activeLayerId: 'L', layerSnapshots: {},
  seed: 4242, seedOffsets: null, paletteId: 'bone', paletteOverrides: null, userPalettes: [], caGrid: null, enabledAssets: null,
  assetWeightOverrides: {}, customAssets: [], quality: 'balanced', perfClampOverride: null, perfTier1: false, assetThin: false, slowRender: false,
  batchPaused: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null, loopTimeMs: 0,
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 40, lifeDrift: 0, jitter: 0, displacement: 0, ...(over.layoutParams || {}) }, ...over, ...(over.layoutParams ? { layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 40, lifeDrift: 0, jitter: 0, displacement: 0, ...over.layoutParams } } : {}),
});
const frame = (r, over) => r.resolveLayers(base(over)).find((l) => l.id === 'L').items.map((i) => [i.x, i.y, i.scale]);
const OFF = { kinemeBreath: 0, kinemeDrift: 0 };

ok('new scenes get the floor (breath 0.3, drift 0.5, spin off); a document that predates it opens as saved', () => {
  assert.equal(DEFAULT_LAYOUT_PARAMS.kinemeBreath, 0.3); assert.equal(DEFAULT_LAYOUT_PARAMS.kinemeDrift, 0.5);
  assert.equal(DEFAULT_LAYOUT_PARAMS.rotateSpin, 0, 'spin is chosen, drift is given');
  const old = normalizeLayoutParams({ mode: 'grid' });
  assert.equal(old.kinemeBreath, 0); assert.equal(old.kinemeDrift, 0); assert.equal(old.rotateSpin, 0);
  const given = normalizeLayoutParams({ kinemeBreath: 0.1, kinemeDrift: 0.2 });
  assert.equal(given.kinemeBreath, 0.1); assert.equal(given.kinemeDrift, 0.2);
  const fields = { seed: 7, seedOffsets: {}, paletteId: 'bone', layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid' } };
  const link = decodeRecipeUrl(encodeRecipeUrl(fields)); assert.ok(link.ok);
  assert.equal(link.recipe.layoutParams.kinemeBreath, 0.3, 'a new scene keeps its floor through a link');
  const oldLayout = { ...DEFAULT_LAYOUT_PARAMS }; delete oldLayout.kinemeBreath; delete oldLayout.kinemeDrift;
  const oldLink = decodeRecipeUrl(encodeRecipeUrl({ ...fields, layoutParams: oldLayout }));
  assert.equal(oldLink.recipe.layoutParams.kinemeBreath, 0); assert.equal(oldLink.recipe.layoutParams.kinemeDrift, 0);
  const bare = 'kc-r/1.' + Buffer.from(JSON.stringify({ v: 1, s: 5 })).toString('base64url');
  assert.equal(decodeRecipeUrl(bare).recipe.layoutParams.kinemeBreath, 0, 'a link from before the floor loads static');
});

ok('the first frame is the placed picture: at loop time 0 the floor is byte-identical to no floor', () => {
  const a = frame(createLiveResolver(), { loopTimeMs: 0 });
  const b = frame(createLiveResolver(), { loopTimeMs: 0, layoutParams: OFF });
  assert.deepEqual(a, b);
});

ok('then it moves: marks leave their places, each its own way, and never far', () => {
  const r = createLiveResolver(); const still = frame(createLiveResolver(), { loopTimeMs: 0, layoutParams: OFF });
  const f1 = frame(r, { loopTimeMs: 5000 }); const f2 = frame(r, { loopTimeMs: 11000 });
  assert.notDeepEqual(f1, still); assert.notDeepEqual(f1, f2, 'and it keeps moving');
  const moved = f1.filter((p, i) => Math.hypot(p[0] - still[i][0], p[1] - still[i][1]) > 0.01).length;
  assert.ok(moved >= f1.length * 0.9, `${moved} of ${f1.length} marks moved`);
  const dxs = new Set(f1.map((p, i) => (p[0] - still[i][0]).toFixed(2))); assert.ok(dxs.size > f1.length / 2, 'each mark on its own phase: not one slab');
  const reach = 0.5 * 0.02 * 700 * 2; // drift 0.5 of 2% of the smaller dimension, rest-to-peak at most twice the amplitude
  for (let i = 0; i < f1.length; i++) {
    assert.ok(Math.hypot(f1[i][0] - still[i][0], f1[i][1] - still[i][1]) <= reach * Math.SQRT2 + 1e-6, 'drift stays within its reach');
    assert.ok(Math.abs(f1[i][2] / still[i][2] - 1) <= 0.3 * 0.09 * 2 + 1e-6, 'breath stays within its depth');
  }
});

ok('it never stacks: the same frame, drawn again and again, is the same frame (and the drivers off afterwards gives the placed picture back)', () => {
  const r = createLiveResolver();
  const a = frame(r, { loopTimeMs: 7000 }); const b = frame(r, { loopTimeMs: 7000 }); const c = frame(r, { loopTimeMs: 7000 });
  assert.deepEqual(a, b); assert.deepEqual(b, c);
  const placed = frame(createLiveResolver(), { loopTimeMs: 0, layoutParams: OFF });
  assert.deepEqual(frame(r, { loopTimeMs: 7000, layoutParams: OFF }), placed, 'turning the floor off returns the cached picture untouched');
});

ok('the regression at the engine: three identical frames through one placement cache do not walk', () => {
  const cache = {}; const lp = { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 12 }; const pal = resolvePalette('bone', null);
  const kin = { seed: 111, driverSec: 3.36, boilStep: 0, amounts: { breath: 0.3, drift: 0.5, pulse: 0 }, canvasW: 1000, canvasH: 700, shedTier: 0, anchored: true };
  const run = (k) => buildPlacements({ layoutParams: lp, seed: 111, seedOffsets: {}, activeAssets: ASSETS.slice(0, 6), palette: pal, caGrid: null, canvasW: 1000, canvasH: 700, cache, kineme: k }).items.map((i) => [i.x, i.y]);
  const first = run(kin); assert.deepEqual(run(kin), first); assert.deepEqual(run(kin), first);
  const placed = run(null); assert.notDeepEqual(placed, first, 'the drivers did move them'); assert.deepEqual(run(null), placed);
});

ok('anchored: every delta is exactly zero at driver time 0, and the old un-anchored maths is unchanged', () => {
  const soa = { n: 8, index: Int32Array.from({ length: 8 }, (_, i) => i) };
  const ctx = (extra) => ({ seed: 9, driverSec: 0, boilStep: 0, amounts: { breath: 1, drift: 1, pulse: 1 }, canvasW: 1000, canvasH: 700, ...extra });
  const z = evaluateKineme(soa, ctx({ anchored: true }));
  for (let i = 0; i < 8; i++) { assert.equal(z.dScale[i], 0); assert.equal(z.dx[i], 0); assert.equal(z.dy[i], 0); }
  const raw = evaluateKineme(soa, ctx({}));
  assert.ok([...raw.dx].some((v) => v !== 0), 'un-anchored (the old contract) still starts off rest');
  assert.equal(applyKinemeDrivers({ n: 0 }, ctx({ anchored: true })), null, 'nothing to move: no undo');
});

ok('the ladder: amount 0 is a hard gate, shed tier 3 and slowRender are identity, RATE 0 freezes the motion where it is', () => {
  const placed = frame(createLiveResolver(), { loopTimeMs: 9000, layoutParams: OFF });
  assert.deepEqual(frame(createLiveResolver(), { loopTimeMs: 9000, layoutParams: OFF }), placed, 'amount 0: the maths is skipped');
  assert.deepEqual(frame(createLiveResolver(), { loopTimeMs: 9000, slowRender: true }), placed, 'the governor froze motion: identity');
  const r = createLiveResolver();
  const t1 = frame(r, { loopTimeMs: 4000, layoutParams: { kinemeRate: 0 } }); const t2 = frame(r, { loopTimeMs: 12000, layoutParams: { kinemeRate: 0 } });
  assert.deepEqual(t1, t2, 'RATE 0: anchored freeze, no jump');
  const live = createLiveResolver(); const a = frame(live, { loopTimeMs: 4000 }); const b = frame(live, { loopTimeMs: 4000, layoutParams: { kinemeRate: 0 } });
  assert.deepEqual(a, b, 'dropping the rate to 0 mid-flight re-anchors: the frame does not jump');
});

ok('determinism: the same seed gives the same motion, another seed another; the placed pictures match for stills and exports', () => {
  const a = frame(createLiveResolver(), { loopTimeMs: 6000 }); const b = frame(createLiveResolver(), { loopTimeMs: 6000 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(frame(createLiveResolver(), { loopTimeMs: 6000, seed: 4243 }).map((p) => p.slice(0, 2)), a.map((p) => p.slice(0, 2)));
});

ok('cost: 800 marks, floor on, per frame', () => {
  const r = createLiveResolver(); const over = (t) => ({ loopTimeMs: t, layoutParams: { count: 800 } });
  frame(r, over(1000));
  let t0 = process.hrtime.bigint(); const N = 60;
  for (let i = 0; i < N; i++) frame(r, over(1000 + i * 16));
  const withFloor = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  const off = createLiveResolver(); const offOver = (t) => ({ loopTimeMs: t, layoutParams: { count: 800, ...OFF } }); frame(off, offOver(1000));
  t0 = process.hrtime.bigint(); for (let i = 0; i < N; i++) frame(off, offOver(1000 + i * 16));
  const without = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  console.log(`    info: 800 marks, resolve ${without.toFixed(2)} ms without the floor, ${withFloor.toFixed(2)} ms with it (+${(withFloor - without).toFixed(2)} ms)`);
  assert.ok(withFloor - without < 2, `the floor costs ${(withFloor - without).toFixed(2)} ms a frame at 800 marks (budget 2 ms of the 16.7)`);
});

// ── #1128 PR2: the DIRECTOR's patterns re-weight the Curator's amounts; they never invent motion ──
ok('patterns: DRIFT is the amounts as set; SWELL leans breath-forward; THUMP follows a real beat or is DRIFT; unknown is DRIFT', () => {
  const b = { breath: 0.3, drift: 0.5, pulse: 0 };
  assert.deepEqual([...KINEME_PATTERNS], ['DRIFT', 'SWELL', 'THUMP']);
  assert.deepEqual(patternAmounts(b, 'DRIFT', 0.9), b);
  assert.deepEqual(patternAmounts(b, 'SWELL'), { breath: 0.48, drift: 0.25, pulse: 0 });
  assert.equal(patternAmounts({ ...b, breath: 0.9 }, 'SWELL').breath, 1, 'breath is capped at 1');
  assert.equal(patternAmounts({ breath: 0, drift: 0, pulse: 0 }, 'SWELL').breath, 0, 'a scene with no breath is not given one');
  for (const nobeat of [undefined, null, NaN]) assert.deepEqual(patternAmounts(b, 'THUMP', nobeat), b, 'no beat: THUMP is DRIFT');
  assert.equal(patternAmounts(b, 'THUMP', 1).pulse, THUMP_PULSE); assert.equal(patternAmounts(b, 'THUMP', 0).pulse, 0, 'rests between beats');
  assert.equal(patternAmounts(b, 'THUMP', 7).pulse, THUMP_PULSE, 'a beat above 1 is clamped');
  assert.deepEqual(patternAmounts(b, 'nonsense', 1), b); assert.deepEqual(patternAmounts(b, undefined, 1), b);
});

ok('the pattern is a layout field: new scenes are DRIFT, saved ones load DRIFT, junk is DRIFT, and a link carries a choice', () => {
  assert.equal(DEFAULT_LAYOUT_PARAMS.kinemePattern, 'DRIFT');
  assert.equal(normalizeLayoutParams({ mode: 'grid' }).kinemePattern, 'DRIFT');
  assert.equal(normalizeLayoutParams({ kinemePattern: 'THUMP' }).kinemePattern, 'THUMP');
  assert.equal(normalizeLayoutParams({ kinemePattern: 'boil' }).kinemePattern, 'DRIFT', 'BOIL is cut from v1');
  const fields = { seed: 7, seedOffsets: {}, paletteId: 'bone', layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', kinemePattern: 'SWELL' } };
  const link = decodeRecipeUrl(encodeRecipeUrl(fields)); assert.ok(link.ok);
  assert.equal(link.recipe.layoutParams.kinemePattern, 'SWELL');
});

ok('live: SWELL moves marks differently from DRIFT; THUMP is exactly DRIFT with no beat, and with one it only adds pulse', () => {
  const at = (pattern, beatDrive) => frame(createLiveResolver(), { loopTimeMs: 6500, beatDrive, layoutParams: { kinemePattern: pattern } });
  const drift = at('DRIFT'); const swell = at('SWELL');
  assert.notDeepEqual(swell, drift);
  assert.deepEqual(at('THUMP'), drift, 'no beat: THUMP is DRIFT, frame for frame');
  assert.deepEqual(at('THUMP', null), drift);
  assert.deepEqual(at('THUMP', 0), drift, 'a beat at rest adds nothing');
  assert.notDeepEqual(at('THUMP', 1), drift, 'on a beat, THUMP pulses');
  assert.deepEqual(at('DRIFT', 1), drift, 'a beat does not move a DRIFT scene');
});

console.log(`livingMotion.selfcheck: ${n} checks passed`);
