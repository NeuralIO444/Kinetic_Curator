// node src/data/canon/canonBaselines.selfcheck.mjs
// #2048 (Canon S5) — first baselines as native records: op art, Warhol, Joshua Davis; #2060 adds TDR. Pins:
//   1. four baseline records exist, each a COMPLETE settings record (marks / palette / motion / density /
//      rules) in the instrument's own vocabulary — every value survives the validating door unchanged
//   2. the probe: applying each to the real store, the instrument's state reflects that baseline's marks,
//      palette, motion and density
//   3. the taste path scores a candidate recipe against a baseline, and the four produce distinct readings
//   4. identity is declared once (a baseline anchoring a Canon style reads that style's); names policy holds
import assert from 'node:assert/strict';
import {
  CANON_BASELINES,
  CANON_BASELINE_IDS,
  canonBaseline,
  baselineIdentity,
  baselineRecipe,
  baselineFeel,
  baselineReadings,
  nearestBaseline,
} from './baselines.js';
import { canonStyleRecord, canonStyle, isCanonStyle } from './index.js';
import { baselinePatch } from '../../state/canonBaseline.mjs';
import { useStore } from '../../state/store.js';
import { mkRng } from '../../engine/prng.js';
import { ASSETS } from '../assets/index.js';
import { assetRecords } from '../assetStyle.js';
import { dealableRecords } from '../../state/rollPool.mjs';
import { PALETTES } from '../palettes.js';
import { COMPOSITION_PRESETS } from '../presets.js';
import {
  MODE_IDS,
  BEHAVE_MODES,
  BLEND_MODES,
  PALETTE_SHIFTS,
  DEFAULT_LAYOUT_PARAMS,
  validateLayoutParams,
  normalizeLayoutParams,
} from '../layout-modes.js';
import { MOTION_KEYS } from '../../state/rollScope.mjs';
import { FEATURE_KEYS } from '../../curator/tasteFeatures.js';
import { getPersonaTaste } from '../../curator/personaTastes.js';
import { getRenderProfile } from '../../curator/renderProfiles.js';

const S = () => useStore.getState();
const records = assetRecords(ASSETS);
const categories = new Set(records.map((r) => r.category));

// ── 1. four complete native records ────────────────────────────────────────────────────────────────────────
assert.deepEqual([...CANON_BASELINE_IDS], ['op-art', 'warhol', 'davis', 'tdr']);
for (const b of CANON_BASELINES) {
  assert.ok(Object.isFrozen(b) && Object.isFrozen(b.settings.density.scale), `${b.id}: deep-frozen`);
  assert.equal(canonBaseline(b.id), b);
  const { marks, palette, motion, density, rules } = b.settings;
  assert.deepEqual(
    Object.keys(b.settings),
    ['marks', 'palette', 'motion', 'density', 'rules'],
    `${b.id}: the five parts`,
  );
  // marks — the pool dealer's own vocabulary
  assert.ok(
    marks.categories.length >= 2 && marks.categories.every((c) => categories.has(c)),
    `${b.id}: real categories`,
  );
  assert.ok(marks.styles.every(isCanonStyle), `${b.id}: Canon styles`);
  // palette — a catalogue palette and real modes
  assert.ok(
    PALETTES.some((p) => p.id === palette.id),
    `${b.id}: palette ${palette.id} is in the catalogue`,
  );
  assert.ok(
    PALETTE_SHIFTS.includes(palette.shift) && BLEND_MODES.includes(palette.blend),
    `${b.id}: real palette modes`,
  );
  // motion — exactly the motion axis, nothing missing
  assert.deepEqual(Object.keys(motion).sort(), [...MOTION_KEYS].sort(), `${b.id}: the whole motion axis`);
  assert.ok(BEHAVE_MODES.includes(motion.behave));
  // density + rules — complete
  assert.deepEqual(Object.keys(density), ['count', 'density', 'scale', 'alpha', 'zTiers']);
  assert.deepEqual(Object.keys(rules), [
    'mode',
    'mirror',
    'overlap',
    'bleed',
    'jitter',
    'displacement',
    'rotate',
    'extra',
  ]);
  assert.ok(MODE_IDS.includes(rules.mode), `${b.id}: a real layout mode`);
  assert.ok(typeof b.basis === 'string' && b.basis.length > 40, `${b.id}: says what its numbers were taken from`);

  // every declared value survives the validating door UNCHANGED — nothing clamped, nothing rejected
  const declared = {
    ...rules,
    ...rules.extra,
    ...density,
    ...motion,
    paletteShift: palette.shift,
    blendMode: palette.blend,
  };
  delete declared.extra;
  const { params, rejected } = validateLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, ...declared });
  const mine = Object.keys(declared);
  assert.deepEqual(
    (rejected || []).filter((r) => mine.includes(r.key ?? r)),
    [],
    `${b.id}: nothing rejected`,
  );
  const expected = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, ...declared });
  for (const k of mine) {
    assert.deepEqual(params[k], expected[k], `${b.id}.${k}`);
    if (typeof declared[k] !== 'object') assert.equal(params[k], declared[k], `${b.id}.${k} lands exactly as declared`);
  }
  assert.deepEqual(params.scale, { x: density.scale, y: density.scale }, `${b.id}: scale lands as declared`);
  assert.deepEqual(params.alpha, density.alpha);
  assert.deepEqual(params.rotate, rules.rotate);
  // the recipe is that validated state
  const recipe = baselineRecipe(b);
  for (const k of mine) assert.deepEqual(recipe.layoutParams[k], params[k]);
  assert.equal(recipe.paletteId, palette.id);
  assert.deepEqual(recipe.pairing, { categories: [...marks.categories], styles: [...marks.styles] });
}
assert.equal(canonBaseline('nope'), null);
assert.equal(baselineRecipe('nope'), null);

// grounded where the instrument already had material
{
  const op = canonBaseline('op-art');
  assert.equal(op.style, 'op');
  assert.deepEqual(
    [...op.settings.marks.categories],
    [...canonStyleRecord('op').pairing],
    'Op Art wears the Canon pairing',
  );
  assert.ok(canonStyle('op').palettes.includes(op.settings.palette.id), 'Op Art’s palette is one its own looks use');
  assert.ok(
    canonStyle('op').motion.layouts.includes(`layout:${op.settings.rules.mode}`),
    'and a layout its own looks use',
  );
  const davis = canonBaseline('davis');
  const profile = getRenderProfile('davis');
  assert.equal(davis.settings.palette.id, profile.paletteId);
  assert.equal(davis.label, getPersonaTaste('davis').alias, 'Davis keeps the persona’s standing alias');
  const inRange = (v, r) => v >= r[0] && v <= r[1];
  const D = {
    ...davis.settings.density,
    ...davis.settings.motion,
    ...davis.settings.rules,
    ...davis.settings.rules.extra,
  };
  for (const k of [
    'count',
    'jitter',
    'density',
    'zTiers',
    'noiseFreq',
    'noiseSpeed',
    'displacement',
    'particleCount',
    'swarmCohesion',
    'gravityWells',
    'damping',
    'wind',
    'flap',
    'breath',
    'lifeDrift',
  ])
    assert.ok(inRange(D[k], profile.biases[k]), `davis.${k}=${D[k]} sits inside the render profile’s range`);
}

// ── 2. the probe: apply each to the real store ──────────────────────────────────────────────────────────────
{
  const pool = dealableRecords(ASSETS, []);
  const byId = new Map(pool.map((r) => [r.id, r]));
  const landed = {};
  for (const b of CANON_BASELINES) {
    const patch = baselinePatch(S(), b, mkRng(2048));
    // store keys only — applying a baseline invents no new state
    for (const k of Object.keys(patch)) assert.ok(k in S(), `${b.id}: ${k} is a real store key`);
    useStore.setState(patch);
    const st = S();
    const { marks, palette, motion, density, rules } = b.settings;
    // palette
    assert.equal(st.paletteId, palette.id, `${b.id}: the palette is up`);
    assert.equal(st.paletteOverrides, null);
    assert.equal(st.layoutParams.paletteShift, palette.shift);
    assert.equal(st.layoutParams.blendMode, palette.blend);
    // motion
    for (const k of MOTION_KEYS) assert.equal(st.layoutParams[k], motion[k], `${b.id}: motion ${k}`);
    // density
    assert.equal(st.layoutParams.count, density.count, `${b.id}: count`);
    assert.equal(st.layoutParams.density, density.density);
    assert.equal(st.layoutParams.zTiers, density.zTiers);
    assert.deepEqual(st.layoutParams.scale.x, density.scale);
    assert.deepEqual(st.layoutParams.alpha, density.alpha);
    // rules
    assert.equal(st.layoutParams.mode, rules.mode, `${b.id}: layout`);
    assert.equal(st.layoutParams.mirror, rules.mirror);
    assert.equal(st.layoutParams.overlap, rules.overlap);
    assert.equal(st.layoutParams.jitter, rules.jitter);
    for (const [k, v] of Object.entries(rules.extra)) assert.equal(st.layoutParams[k], v, `${b.id}: ${k}`);
    // marks — a real pool, every mark from the baseline's pairing
    const on = Object.keys(st.enabledAssets).filter((id) => st.enabledAssets[id]);
    assert.ok(on.length >= 4, `${b.id}: a dealt pool (${on.length} marks)`);
    for (const id of on) {
      const r = byId.get(id);
      assert.ok(r, `${b.id}: ${id} is a dealable library asset`);
      assert.ok(
        marks.categories.includes(r.category),
        `${b.id}: ${id} (${r.category}) is in the baseline’s categories`,
      );
    }
    landed[b.id] = { on, params: st.layoutParams, paletteId: st.paletteId };
  }
  // four different stages
  assert.equal(new Set(Object.values(landed).map((l) => l.paletteId)).size, 4);
  assert.equal(new Set(Object.values(landed).map((l) => l.params.count)).size, 4);
  assert.equal(new Set(Object.values(landed).map((l) => l.on.join())).size, 4);
  // deterministic: same seed, same pool; a lock is a lock; a baseline claims no Look
  const a = baselinePatch(S(), 'warhol', mkRng(7));
  const b2 = baselinePatch(S(), 'warhol', mkRng(7));
  assert.deepEqual(a, b2);
  const before = S().layoutParams.composition;
  assert.equal(
    baselinePatch(S(), 'davis', mkRng(1)).layoutParams.composition,
    before,
    'the standing Look id is not claimed',
  );
  const lockedState = { ...S(), lockedParams: { count: true } };
  assert.equal(
    baselinePatch(lockedState, 'davis', mkRng(1)).layoutParams.count,
    S().layoutParams.count,
    'locked count holds',
  );
  assert.equal(baselinePatch(S(), 'nope', mkRng(1)), null);
}

// ── 3. taste scores a recipe against the baselines — four distinct readings ────────────────────────────────
{
  for (const b of CANON_BASELINES) {
    assert.deepEqual(Object.keys(baselineFeel(b)), [...FEATURE_KEYS]);
    const r = baselineReadings(baselineRecipe(b).layoutParams);
    assert.equal(r[b.id], 1, `${b.id}: a baseline reads 1 against itself`);
    for (const other of CANON_BASELINE_IDS.filter((id) => id !== b.id))
      assert.ok(r[other] < 0.97, `${b.id} is not ${other}`);
    assert.equal(nearestBaseline(baselineRecipe(b).layoutParams).id, b.id);
  }
  // a candidate recipe: the four readings are distinct, and ordered the way the picture reads
  const checker = COMPOSITION_PRESETS.find((l) => l.id === 'checker-shift').params;
  const r = baselineReadings(checker);
  assert.deepEqual(Object.keys(r), ['op-art', 'warhol', 'davis', 'tdr']);
  assert.equal(new Set(Object.values(r)).size, 4, 'four distinct readings');
  assert.ok(r['op-art'] > r.warhol && r.warhol > r.davis, 'a hard op grid reads Op Art first, Davis last');
  assert.deepEqual(nearestBaseline(checker), { id: 'op-art', reading: r['op-art'] });
  for (const v of Object.values(r)) assert.ok(v > 0 && v <= 1);
  // a dense, deep, windy candidate reads Davis first
  const loud = { ...baselineRecipe('davis').layoutParams, count: 520, zTiers: 8, wind: 1.3 };
  assert.equal(nearestBaseline(loud).id, 'davis');
  // every catalogue Look gets a full reading — nothing throws, nothing is NaN
  for (const l of COMPOSITION_PRESETS)
    for (const v of Object.values(baselineReadings(l.params))) assert.ok(Number.isFinite(v), `${l.id}: finite`);
  assert.ok(Number.isFinite(baselineReadings(null)['op-art']));
}

// ── 4. identity declared once; names policy ─────────────────────────────────────────────────────────────────
{
  assert.equal(canonBaseline('op-art').identity, null, 'Op Art copies no identity…');
  assert.equal(baselineIdentity('op-art'), canonStyleRecord('op').identity, '…it reads the Canon style’s');
  assert.equal(baselineIdentity('warhol').figures[0], 'Andy Warhol');
  assert.equal(baselineIdentity('davis').figures[0], 'Joshua Davis');
  assert.equal(baselineIdentity('tdr').place, 'Sheffield');
  assert.equal(baselineIdentity('tdr').figures[0], 'Ian Anderson');
  assert.equal(canonBaseline('tdr').style, 'techno', 'TDR sits beside the Techno style');
  assert.equal(baselineIdentity('nope'), null);
  for (const b of CANON_BASELINES) {
    const id = baselineIdentity(b);
    for (const k of ['movement', 'period', 'place', 'note']) assert.ok(id[k].length > 3, `${b.id}: identity.${k}`);
    // the surface label never carries a real name
    for (const name of id.figures)
      for (const part of name.split(' '))
        assert.ok(!b.label.toLowerCase().includes(part.toLowerCase()), `${b.id}: ${part} stays off the surface`);
  }
}

console.log(
  'canonBaselines.selfcheck: ok — op-art / warhol / davis / tdr are complete native records; each applies to the stage; taste reads a recipe against all four',
);
