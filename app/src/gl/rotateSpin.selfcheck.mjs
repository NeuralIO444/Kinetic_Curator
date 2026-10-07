// rotateSpin.selfcheck.mjs — ROTATE spin (#1127): marks turn continuously by default.
//
// `rotateSpin` (rev/s, 0..1) rides each layer's layout. Every mark without a kineme of its own gets an implicit
// SPIN kineme of period 1/rate, at phase 0, so at motion time 0 a still is exactly the static picture it always
// was. A document that predates the field loads as 0 (static); only NEW scenes spin.
import assert from 'node:assert';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC, normalizeLayoutParams } from '../data/layout-modes.js';
import { KINEME_KINDS, SPIN_SPEEDS, SPIN_VARIANTS, spinVariant } from '../data/kinemes.js';
import { parseProject, serializeProject } from '../state/projectDocument.js';
import { buildSceneContract } from './sceneContract.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const item = (assetId, key, x = 500) => ({ assetId, x, y: 350, scale: 1.4, rotation: 0.4, color: '#ffffff', accent: '#ffffff', alpha: 100, key, seedOffset: 0 });
const layer = (items, rotateSpin) => [{ id: 'L', isFx: false, items, layoutParams: rotateSpin === undefined ? {} : { rotateSpin } }];
const contract = (doc, items, rotateSpin) => buildSceneContract({ doc: { seed: 1, ...doc }, resolvedLayers: layer(items, rotateSpin) });

ok('the default is a slow spin; a document that predates the field is static; a given value is kept and clamped', () => {
  assert.equal(DEFAULT_LAYOUT_PARAMS.rotateSpin, 0.05); assert.deepEqual(PARAM_SPEC.rotateSpin, { min: 0, max: 1 });
  assert.equal(normalizeLayoutParams({}).rotateSpin, 0, 'no field in the document = the old static rotation');
  assert.equal(normalizeLayoutParams({ rotate: [-10, 10] }).rotateSpin, 0);
  assert.equal(normalizeLayoutParams({ rotateSpin: 0.3 }).rotateSpin, 0.3);
  assert.equal(normalizeLayoutParams({ rotateSpin: 9 }).rotateSpin, 1); assert.equal(normalizeLayoutParams({ rotateSpin: -2 }).rotateSpin, 0);
  assert.equal(normalizeLayoutParams({ rotateSpin: 'x' }).rotateSpin, DEFAULT_LAYOUT_PARAMS.rotateSpin, 'junk in a present field → the default');
});

ok('a saved project round-trips its spin, and an old project file loads static', () => {
  const base = { seed: 7, seedOffsets: {}, paletteId: 'praystation', layoutParams: { ...DEFAULT_LAYOUT_PARAMS, rotateSpin: 0.2 }, enabledAssets: {}, quality: 'balanced', autoQuality: true };
  assert.equal(parseProject(JSON.parse(JSON.stringify(serializeProject(base)))).doc.layoutParams.rotateSpin, 0.2);
  const old = JSON.parse(JSON.stringify(serializeProject(base))); delete old.layoutParams.rotateSpin;
  assert.equal(parseProject(old).doc.layoutParams.rotateSpin, 0);
});

ok('contract: a spinning layer gives every plain mark a SPIN slot at phase 0; no spin = no keys at all', () => {
  const none = contract({}, [item('geo_tri_01', 'a')], 0);
  assert.ok(!('kinemes' in none) && !('kinemeTime' in none) && !('kineme' in none.instances[0]), 'spin 0 is byte-identical to before');
  assert.ok(!('kinemes' in contract({}, [item('geo_tri_01', 'a')])), 'a layer without the field is still');
  const c = contract({ kinemeTime: 2 }, [item('geo_tri_01', 'a'), item('geo_chev_01', 'b'), item('geo_tri_02', 'c')], 0.25);
  assert.ok(c.kinemes.every((k) => k.kind === KINEME_KINDS.spin));
  assert.deepEqual(c.instances.map((i) => i.kinemePhase), [0, 0, 0]); assert.ok(c.instances.every((i) => i.kineme >= 1 && i.kineme <= c.kinemes.length));
  assert.equal(c.kinemeTime, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(c)).kinemes, c.kinemes);
  for (const k of c.kinemes) assert.ok(SPIN_SPEEDS.some((sp) => Math.abs(k.period - 1 / (0.25 * sp)) < 1e-9), `period ${k.period} is the dial's rate times one of the variant speeds`);
  assert.equal(contract({}, [item('geo_tri_01', 'a')], 7).kinemes[0].period, 1 / SPIN_SPEEDS[spinVariant(0, 'a') % SPIN_SPEEDS.length], 'clamped at 1 rev/s');
});

ok('every mark spins at its OWN speed and direction: a field is not one wheel, about half go each way, and it is stable per seed', () => {
  const items = Array.from({ length: 80 }, (_, i) => item('geo_tri_01', `p${i}-x`, 20 + i * 11));
  const c = contract({}, items, 0.2);
  const per = c.instances.map((i) => c.kinemes[i.kineme - 1]);
  const speeds = new Set(per.map((k) => k.period.toFixed(6))); const rev = per.filter((k) => k.amp < 0).length;
  assert.ok(speeds.size >= 4, `${speeds.size} different periods among 80 marks`);
  assert.ok(rev > 20 && rev < 60, `${rev} of 80 turn the other way`);
  assert.ok(c.kinemes.length <= SPIN_VARIANTS, 'a handful of table slots, never one per mark');
  const again = contract({}, items, 0.2);
  assert.deepEqual(again.instances.map((i) => i.kineme), c.instances.map((i) => i.kineme), 'same marks, same turning');
  const other = contract({}, items.map((it) => ({ ...it, seedOffset: 7 })), 0.2);
  assert.notDeepEqual(other.instances.map((i) => i.kineme), c.instances.map((i) => i.kineme), 'another seed turns differently');
  // the average speed is the dial's rev/s (within the spread of the four speeds)
  const mean = per.reduce((a, k) => a + 1 / k.period, 0) / per.length;
  assert.ok(mean > 0.2 * 0.7 && mean < 0.2 * 1.3, `mean ${mean.toFixed(3)} rev/s around the dial's 0.2`);
});

ok('an asset with its own kineme keeps it; the spin only takes the rest; each layer spins at its own dial', () => {
  const c = contract({ assetKineme: { geo_chev_01: 'pulse' } }, [item('geo_tri_01', 'a'), item('geo_chev_01', 'b')], 0.1);
  assert.equal(c.kinemes[c.instances[0].kineme - 1].kind, KINEME_KINDS.spin);
  assert.equal(c.kinemes[c.instances[1].kineme - 1].kind, KINEME_KINDS.pulse, 'the pulse asset keeps its pulse');
  assert.notEqual(c.instances[1].kinemePhase, 0, 'its own kineme keeps its per-copy phase');
  const two = buildSceneContract({ doc: { seed: 1 }, resolvedLayers: [{ id: 'A', isFx: false, items: [item('geo_tri_01', 'x')], layoutParams: { rotateSpin: 0.1 } }, { id: 'B', isFx: false, items: [item('geo_tri_01', 'x')], layoutParams: { rotateSpin: 0.5 } }] });
  assert.ok(Math.abs(two.kinemes[1].period * 5 - two.kinemes[0].period) < 1e-9, 'the same mark turns 5x faster on the 5x dial');
});

// ── GPU: at motion time 0 the picture is untouched; later it has turned ─────────
async function gpu() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const mark = (spin, t, amp) => { const c = contract({ kinemeTime: t }, [item('geo_tri_01', 'solo')], spin); if (amp !== undefined && c.kinemes) c.kinemes[0].amp = amp; return c; };
  const shot = async (c) => (await renderViaGL(c, { width: 400, height: 280, bg: '#000000' })).pixels;
  const same = (a, b) => Buffer.compare(a, b) === 0;
  try {
    const still = await shot(mark(0, 0));
    assert.ok(same(still, await shot(mark(0.05, 0))), 'spin on, time 0: the very same pixels as spin off');
    assert.ok(!same(still, await shot(mark(0.05, 5))), 'spin on, 5 s later: the mark has turned');
    const P = mark(0.25, 0).kinemes[0].period;
    assert.ok(same(await shot(mark(0.25, 0)), await shot(mark(0.25, P))), 'one period later it is back in the same pose');
    assert.ok(same(still, await shot(mark(0, 5))), 'spin off never moves');
    // a negative amp turns the other way: reversed at t is forward at (period - t), pixel for pixel, and not forward at t
    const t = P / 8;
    const fwd = await shot(mark(0.25, t, 0)); const rev = await shot(mark(0.25, t, -1)); const mirror = await shot(mark(0.25, P - t, 0));
    assert.ok(!same(fwd, rev), 'reversed is not forward');
    assert.ok(same(rev, mirror), 'reversed at t is forward at period - t: the same turn, the other way');
    n++; console.log('  [ok] gpu: t=0 identical, later turned, one period returns, the other direction is the exact mirror in time');
  } finally { await closeGlDriver(); }
}
try { await gpu(); } catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) console.log('  SKIP gpu checks: headless Chromium not installed');
  else throw e;
}
console.log(`rotateSpin.selfcheck: ${n} checks passed`);
