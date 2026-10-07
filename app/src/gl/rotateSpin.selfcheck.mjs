// rotateSpin.selfcheck.mjs — ROTATE spin (#1127): marks turn continuously by default.
//
// `rotateSpin` (rev/s, 0..1) rides each layer's layout. Every mark without a kineme of its own gets an implicit
// SPIN kineme of period 1/rate, at phase 0, so at motion time 0 a still is exactly the static picture it always
// was. A document that predates the field loads as 0 (static); only NEW scenes spin.
import assert from 'node:assert';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC, normalizeLayoutParams } from '../data/layout-modes.js';
import { KINEME_KINDS } from '../data/kinemes.js';
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

ok('contract: a spinning layer gives every plain mark one shared SPIN slot at phase 0; no spin = no keys at all', () => {
  const none = contract({}, [item('geo_tri_01', 'a')], 0);
  assert.ok(!('kinemes' in none) && !('kinemeTime' in none) && !('kineme' in none.instances[0]), 'spin 0 is byte-identical to before');
  assert.ok(!('kinemes' in contract({}, [item('geo_tri_01', 'a')])), 'a layer without the field is still');
  const c = contract({ kinemeTime: 2 }, [item('geo_tri_01', 'a'), item('geo_chev_01', 'b'), item('geo_tri_02', 'c')], 0.25);
  assert.deepEqual(c.kinemes, [{ kind: KINEME_KINDS.spin, period: 4, amp: 0 }], '0.25 rev/s = a 4 s period');
  assert.deepEqual(c.instances.map((i) => i.kineme), [1, 1, 1]); assert.deepEqual(c.instances.map((i) => i.kinemePhase), [0, 0, 0]);
  assert.equal(c.kinemeTime, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(c)).kinemes, c.kinemes);
  assert.equal(contract({}, [item('geo_tri_01', 'a')], 7).kinemes[0].period, 1, 'clamped at 1 rev/s');
});

ok('an asset with its own kineme keeps it; the spin only takes the rest; the table stays within its 16 slots', () => {
  const c = contract({ assetKineme: { geo_chev_01: 'pulse' } }, [item('geo_tri_01', 'a'), item('geo_chev_01', 'b')], 0.1);
  assert.deepEqual(c.instances.map((i) => i.kineme), [1, 2], 'slots in first-use order: the spin, then the pulse asset');
  assert.deepEqual(c.kinemes.map((k) => k.kind), [KINEME_KINDS.spin, KINEME_KINDS.pulse]);
  const bySlot = c.instances.map((i) => c.kinemes[i.kineme - 1].kind);
  assert.deepEqual(bySlot, [KINEME_KINDS.spin, KINEME_KINDS.pulse]);
  assert.notEqual(c.instances[1].kinemePhase, 0, 'its own kineme keeps its per-copy phase');
  const two = buildSceneContract({ doc: { seed: 1 }, resolvedLayers: [{ id: 'A', isFx: false, items: [item('geo_tri_01', 'a')], layoutParams: { rotateSpin: 0.1 } }, { id: 'B', isFx: false, items: [item('geo_tri_01', 'b')], layoutParams: { rotateSpin: 0.5 } }] });
  assert.deepEqual(two.kinemes.map((k) => k.period), [10, 2], 'each layer spins at its own rate');
});

// ── GPU: at motion time 0 the picture is untouched; later it has turned ─────────
async function gpu() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const shot = async (spin, t) => (await renderViaGL(contract({ kinemeTime: t }, [item('geo_tri_01', 'solo')], spin), { width: 400, height: 280, bg: '#000000' })).pixels;
  const same = (a, b) => Buffer.compare(a, b) === 0;
  try {
    const still = await shot(0, 0);
    assert.ok(same(still, await shot(0.05, 0)), 'spin on, time 0: the very same pixels as spin off');
    assert.ok(!same(still, await shot(0.05, 5)), 'spin on, 5 s later: the mark has turned');
    assert.ok(same(await shot(0.25, 0), await shot(0.25, 4)), 'one period later it is back in the same pose');
    assert.ok(same(still, await shot(0, 5)), 'spin off never moves');
    n++; console.log('  [ok] gpu: t=0 identical, later turned, one period returns, off stays put');
  } finally { await closeGlDriver(); }
}
try { await gpu(); } catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) console.log('  SKIP gpu checks: headless Chromium not installed');
  else throw e;
}
console.log(`rotateSpin.selfcheck: ${n} checks passed`);
