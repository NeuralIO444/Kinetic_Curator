// kineme.selfcheck.mjs — #781 KINEME Build A: whole-mark motion as a layer.
//
// Assets stay static sources; motion is assigned (assetKineme) and evaluated
// per instance in QUAD_VS. Node: library, sanitizer, phase, the anchored RATE
// clock, project document + store, and the contract (nothing assigned → no
// keys, so every existing hash is unchanged). Browser (real WebGL2): each kind
// measured on a real mark — spin turns and a full period returns exactly,
// rock tilts, pulse breathes, blink vanishes, bob shifts; a still mark is
// untouched by the motion clock.
import assert from 'node:assert';
import {
  KINEMES, KINEME_KINDS, getKineme, sanitizeAssetKineme, kinemePhase, createKinemeClock,
  DEFAULT_ASSET_KINEME,
} from '../data/kinemes.js';
import { PARAM_SPEC, DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { buildSceneContract } from './sceneContract.js';
import { QUAD_VS } from './shaders.mjs';
import { useStore } from '../state/store.js';

// ── library + sanitizer ──────────────────────────────────────────────────
assert.deepStrictEqual(KINEMES.map((k) => k.id), ['spin', 'rock', 'pulse', 'blink', 'bob']);
for (const k of KINEMES) assert.ok(KINEME_KINDS[k.kind] > 0 && k.period > 0, `${k.id} is well-formed`);
assert.strictEqual(getKineme('nope'), undefined);
assert.strictEqual(sanitizeAssetKineme(null), null);
assert.strictEqual(sanitizeAssetKineme([]), null);
assert.strictEqual(sanitizeAssetKineme({ a: 'nope' }), null, 'unknown kineme ids drop; nothing left → null');
assert.deepStrictEqual(sanitizeAssetKineme({ a: 'spin', b: 7, c: 'bob' }), { a: 'spin', c: 'bob' });

// ── phase: deterministic, and copies differ ──────────────────────────────
assert.strictEqual(kinemePhase(3, 'p1-x'), kinemePhase(3, 'p1-x'));
const phases = new Set(Array.from({ length: 20 }, (_, i) => kinemePhase(0, `p${i}-x`)));
assert.ok(phases.size >= 15, 'copies of one asset get different phases');
for (const p of phases) assert.ok(p >= 0 && p < 1);

// ── RATE clock: identity at 1, anchored changes, 0 freezes ───────────────
{
  const c = createKinemeClock();
  for (const t of [0, 0.25, 3.7, 99.9]) assert.strictEqual(c.at(t, 1), t, 'rate 1 is loop time exactly');
  const d = createKinemeClock();
  d.at(2, 1);
  assert.strictEqual(d.at(2, 3), 2, 'a rate change never jumps');
  assert.ok(Math.abs(d.at(3, 3) - 5) < 1e-12, 'then runs 3x');
  assert.ok(Math.abs(d.at(8, 0) - 20) < 1e-12 && Math.abs(d.at(30, 0) - 20) < 1e-12, '0 freezes where it is');
  assert.strictEqual(createKinemeClock().at(1, NaN), 1, 'garbage rate → 1x');
}
assert.deepStrictEqual(PARAM_SPEC.kinemeRate, { min: 0, max: 4 });
assert.strictEqual(DEFAULT_LAYOUT_PARAMS.kinemeRate, 1);

// ── project document: omitted when empty, round-trips when set ───────────
{
  const base = { seed: 7, seedOffsets: {}, paletteId: 'praystation', layoutParams: { ...DEFAULT_LAYOUT_PARAMS }, enabledAssets: {}, quality: 'balanced', autoQuality: true };
  assert.ok(!('assetKineme' in serializeProject({ ...base, assetKineme: {} })), 'motionless piece: no key (byte-identical export)');
  const on = serializeProject({ ...base, assetKineme: { geo_tri_01: 'spin', junk: 'nope' } });
  assert.deepStrictEqual(on.assetKineme, { geo_tri_01: 'spin' });
  const back = parseProject(JSON.parse(JSON.stringify(on)));
  assert.ok(back.ok);
  assert.deepStrictEqual(back.doc.assetKineme, { geo_tri_01: 'spin' });
  assert.deepStrictEqual(parseProject(JSON.parse(JSON.stringify(serializeProject(base)))).doc.assetKineme, {}, 'absent → still');
}

// ── store: defaults out of the box; set, clear, refuse unknown; import merges ─
{
  const S = () => useStore.getState();
  assert.deepStrictEqual(S().assetKineme, { ...DEFAULT_ASSET_KINEME }, 'micro-HUD defaults out of the box (#705)');
  S().setAssetKineme('geo_tri_01', 'rock');
  assert.deepStrictEqual(S().assetKineme, { ...DEFAULT_ASSET_KINEME, geo_tri_01: 'rock' });
  S().setAssetKineme('geo_tri_01', 'nope');
  assert.deepStrictEqual(S().assetKineme, { ...DEFAULT_ASSET_KINEME, geo_tri_01: 'rock' }, 'unknown kineme refused');
  S().setAssetKineme('mic_dotgrid_5', null);
  assert.ok(!('mic_dotgrid_5' in S().assetKineme), 'clearing a default returns the static path');
  assert.strictEqual(S().assetKineme.mic_plus, 'pulse', 'other defaults untouched');
  S().applyProject({ ...parseProject({ seed: 1, assetKineme: { geo_chev_01: 'blink' } }).doc });
  assert.deepStrictEqual(S().assetKineme, { ...DEFAULT_ASSET_KINEME, geo_chev_01: 'blink' }, 'import applies kinemes');
  S().applyProject({ ...parseProject({ seed: 1, assetKineme: { mic_plus: 'rock' } }).doc });
  assert.strictEqual(S().assetKineme.mic_plus, 'rock', 'doc value wins over the default');
  S().applyProject({ ...parseProject({ seed: 1 }).doc });
  assert.deepStrictEqual(S().assetKineme, { ...DEFAULT_ASSET_KINEME }, 'a doc without kinemes → factory defaults');
}

// ── contract ─────────────────────────────────────────────────────────────
const item = (assetId, key, x = 500) => ({ assetId, x, y: 350, scale: 1.4, rotation: 0, color: '#ffffff', accent: '#ffffff', alpha: 100, key, seedOffset: 0 });
const layer = (items) => [{ id: 'L', isFx: false, items }];
const contract = (doc, items) => buildSceneContract({ doc: { seed: 1, ...doc }, resolvedLayers: layer(items) });
{
  const still = contract({}, [item('geo_tri_01', 'a')]);
  assert.ok(!('kinemes' in still) && !('kinemeTime' in still), 'nothing assigned → no keys');
  assert.ok(!('kineme' in still.instances[0]));
  assert.ok(!('kinemes' in contract({ assetKineme: { other: 'spin' } }, [item('geo_tri_01', 'a')])), 'assigned asset not on canvas → no keys');
  const c = contract({ assetKineme: { geo_tri_01: 'spin', geo_chev_01: 'pulse' }, kinemeTime: 1.5 },
    [item('geo_tri_01', 'a'), item('geo_tri_01', 'b'), item('geo_chev_01', 'c'), item('geo_tri_02', 'd')]);
  assert.strictEqual(c.kinemeTime, 1.5);
  assert.deepStrictEqual(c.kinemes, [
    { kind: KINEME_KINDS.spin, period: getKineme('spin').period, amp: 0 },
    { kind: KINEME_KINDS.pulse, period: getKineme('pulse').period, amp: getKineme('pulse').amp },
  ], 'table holds only the kinemes in use, in first-use order');
  assert.deepStrictEqual(c.instances.map((i) => i.kineme), [1, 1, 2, undefined], 'slots shared by asset; unassigned stays still');
  assert.notStrictEqual(c.instances[0].kinemePhase, c.instances[1].kinemePhase, 'copies phase-offset');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c)).kinemes, c.kinemes, 'JSON-safe');
}

// ── shader gate ──────────────────────────────────────────────────────────
assert.match(QUAD_VS, /uniform vec3 u_kineme\[16\];/);
assert.match(QUAD_VS, /if \(a_inst4\.z > 0\.5\) \{/, 'still instances never enter the motion branch');
console.log('kineme node: OK');

// ── GPU: real WebGL2 through the parity driver ───────────────────────────
async function runBrowserTests() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  // One mark, phase pinned to 0 so t alone decides the pose.
  const shot = async (kinemeId, t, asset = 'geo_tri_01') => {
    const c = contract(kinemeId ? { assetKineme: { [asset]: kinemeId }, kinemeTime: t } : {}, [item(asset, 'solo')]);
    if (kinemeId) c.instances[0].kinemePhase = 0;
    return (await renderViaGL(c, { width: 400, height: 280, bg: '#000000' })).pixels;
  };
  const lit = (px) => { let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i - 3] + px[i - 2] + px[i - 1] > 96) n++; return n; };
  const centroidY = (px) => { let s = 0, n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 96) { s += Math.floor(i / 4 / 400); n++; } return s / n; };
  const same = (a, b) => Buffer.compare(a, b) === 0;
  try {
    const rest = await shot(null, 0);
    const P = (id) => getKineme(id).period;
    // spin: quarter turn moves pixels; a full period is the same pose, exactly
    assert.ok(!same(rest, await shot('spin', P('spin') / 4)), 'spin turns the mark');
    assert.ok(same(await shot('spin', 0), await shot('spin', P('spin'))), 'spin: one period later is the same frame');
    // rock: tilts at the quarter
    assert.ok(!same(rest, await shot('rock', P('rock') / 4)), 'rock tilts the mark');
    // pulse: bigger at the quarter (sin 1) than at three quarters (sin -1)
    const [big, small] = [lit(await shot('pulse', P('pulse') / 4)), lit(await shot('pulse', (3 * P('pulse')) / 4))];
    assert.ok(big > small * 1.15, `pulse breathes (${small} → ${big} px)`);
    // blink: visible inside the duty window, gone outside it
    const on = lit(await shot('blink', P('blink') * 0.1));
    const off = lit(await shot('blink', P('blink') * 0.9));
    assert.ok(on > 200 && off === 0, `blink: ${on} px on, ${off} px off`);
    // bob: shifts the mark by ±amp scene units (400px / 1000 units)
    const dy = centroidY(await shot('bob', P('bob') / 4)) - centroidY(rest);
    const want = getKineme('bob').amp * 0.4;
    assert.ok(Math.abs(dy - want) < 1, `bob moves ${dy.toFixed(2)}px (want ≈ ${want.toFixed(2)})`);
    // a still mark ignores the motion clock entirely
    const stillT = buildSceneContract({ doc: { seed: 1, assetKineme: { geo_tri_02: 'spin' }, kinemeTime: 3 }, resolvedLayers: layer([item('geo_tri_01', 'solo')]) });
    assert.ok(same(rest, (await renderViaGL(stillT, { width: 400, height: 280, bg: '#000000' })).pixels), 'still mark: byte-identical');
    // #705: the six mapped micro-HUD ornaments move on the loop; static ones don't.
    // Phase pinned to 0 so t alone decides the pose; t at 10% vs 60% of each
    // kineme's period catches pulse, blink, and rock mid-motion.
    const hudItem = (assetId) => ({ assetId, x: 500, y: 350, scale: 2.5, rotation: 0, color: '#ffffff', accent: '#ff4444', alpha: 100, key: 'solo', seedOffset: 0 });
    const hudShot = async (asset, t) => {
      const c = buildSceneContract({ doc: { seed: 1, assetKineme: { ...DEFAULT_ASSET_KINEME }, kinemeTime: t }, resolvedLayers: layer([hudItem(asset)]) });
      c.instances[0].kinemePhase = 0;
      return (await renderViaGL(c, { width: 400, height: 280, bg: '#000000' })).pixels;
    };
    for (const a of Object.keys(DEFAULT_ASSET_KINEME)) {
      const period = getKineme(DEFAULT_ASSET_KINEME[a]).period;
      assert.ok(!same(await hudShot(a, period * 0.1), await hudShot(a, period * 0.6)), `#705 ${a} moves on the loop`);
    }
    assert.ok(same(await hudShot('mic_bracket_tl', 0), await hudShot('mic_bracket_tl', 0.8)), '#705 static ornament: bit-identical');
    console.log(`kineme GPU: OK — pulse ${small}→${big}px, blink ${on}/${off}px, bob ${dy.toFixed(2)}px`);
  } finally {
    await closeGlDriver();
  }
}
try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser kineme tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}
console.log('kineme.selfcheck: OK');
