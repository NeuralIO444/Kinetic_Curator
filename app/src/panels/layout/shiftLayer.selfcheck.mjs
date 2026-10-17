// node src/panels/layout/shiftLayer.selfcheck.mjs
//
// #1204 — the shift layer: HEROES behind MOTION, ATTRACTORS (PULL) behind
// WILD (the dice). The engine shipped with #1200 and no panel wrote its
// params; this suite pins the panel half:
//
//   1. Mode↔value maps for both rows (modes are the contract; the stored
//      values they write, and the nearest-mode a stored value shows as).
//   2. The pinned PULL constants, proven against the engine's field: a
//      higher mode reaches strictly farther from an attractor's centre.
//   3. The panel path end-to-end: row writes → layoutParams →
//      buildPlacements. OFF is byte-identical to today's params (no keys
//      at all); heroes transform exactly the seed's chosen indices;
//      attractors pool placement deterministically; OFF restores identity.
//   4. The hand-only law: dice doors, the curator, Davis's evolve targets,
//      the Queen's lean steps and the governor's overlay cannot write
//      heroes / attractorCount / attractorRadius — statically (no machine
//      key table contains them) and dynamically (the real store's doors
//      run and the hand-set triple does not move).
import assert from 'node:assert';
import {
  SHIFT_MODE_IDS,
  HERO_COUNT_BY_MODE,
  ATTRACTOR_COUNT_BY_MODE,
  ATTRACTOR_RADIUS_MULT_BY_MODE,
  ATTRACTOR_RADIUS_DEFAULT,
  MAX_HEROES,
  clampHeroCount,
  heroModeForCount,
  heroesWrite,
  heroesExactWrite,
  attractorRadiusForMode,
  attractorParamsForMode,
  attractorWrites,
  attractorModeForParams,
} from './shiftLayer.mjs';
import {
  createAttractorField,
  withAttractorDensity,
  selectHeroIndices,
} from '../../engine/kernel/field/attractors.js';
import { makeConstantField } from '../../engine/kernel/field/index.js';
import { buildPlacements } from '../../engine/buildPlacements.js';

const SHIFT_KEYS = ['heroes', 'attractorCount', 'attractorRadius'];
const R = ATTRACTOR_RADIUS_DEFAULT;

// ── 1 — mode↔value maps: heroes ─────────────────────────────────────────
assert.deepStrictEqual([...SHIFT_MODE_IDS], ['off', 'low', 'mid', 'high']);
assert.deepStrictEqual({ ...HERO_COUNT_BY_MODE }, { off: 0, low: 1, mid: 3, high: 7 },
  'HEROES modes are 0 · 1 · 3 · 7 (7 = MAX_HEROES, the scarcity cap)');
assert.strictEqual(MAX_HEROES, 7);
for (const id of SHIFT_MODE_IDS) {
  assert.deepStrictEqual(heroesWrite(id), { key: 'heroes', value: HERO_COUNT_BY_MODE[id] });
  assert.strictEqual(heroModeForCount(HERO_COUNT_BY_MODE[id]), id, `hero mode round-trips: ${id}`);
}
// Nearest mode for every writable count (ties resolve to the lower mode).
{
  const expected = ['off', 'low', 'low', 'mid', 'mid', 'mid', 'high', 'high'];
  for (let c = 0; c <= MAX_HEROES; c++) {
    assert.strictEqual(heroModeForCount(c), expected[c], `count ${c} shows as ${expected[c]}`);
  }
}
assert.strictEqual(clampHeroCount(-3), 0);
assert.strictEqual(clampHeroCount(99), MAX_HEROES);
assert.strictEqual(clampHeroCount(2.6), 3);
assert.strictEqual(clampHeroCount(NaN), 0);
assert.deepStrictEqual(heroesExactWrite(5), { key: 'heroes', value: 5 });
assert.deepStrictEqual(heroesExactWrite(42), { key: 'heroes', value: MAX_HEROES });

// ── 1 — mode↔value maps: attractors ─────────────────────────────────────
assert.deepStrictEqual({ ...ATTRACTOR_COUNT_BY_MODE }, { off: 0, low: 1, mid: 2, high: 3 },
  'PULL modes carry 0 · 1 · 2 · 3 attractors');
assert.deepStrictEqual({ ...ATTRACTOR_RADIUS_MULT_BY_MODE }, { off: 1, low: 1, mid: 1.5, high: 2 },
  'pinned pull-strength multipliers of the default radius: 1 · 1 · 1.5 · 2');
for (const id of SHIFT_MODE_IDS) {
  const p = attractorParamsForMode(id);
  assert.strictEqual(p.attractorCount, ATTRACTOR_COUNT_BY_MODE[id]);
  assert.strictEqual(p.attractorRadius, R * ATTRACTOR_RADIUS_MULT_BY_MODE[id]);
  assert.strictEqual(attractorModeForParams(p), id, `pull mode round-trips: ${id}`);
  assert.deepStrictEqual(attractorWrites(id), [
    { key: 'attractorCount', value: p.attractorCount },
    { key: 'attractorRadius', value: p.attractorRadius },
  ], 'the PULL row writes exactly the engine pair, count then radius');
}
assert.strictEqual(attractorModeForParams({}), 'off', 'absent params are OFF');
assert.strictEqual(attractorModeForParams({ attractorCount: 0, attractorRadius: 2 * R }), 'off',
  'count 0 is OFF whatever the radius says');
assert.strictEqual(attractorModeForParams({ attractorCount: 2, attractorRadius: R }), 'mid',
  'count dominates: 2 attractors at the LOW radius still show MID');
assert.strictEqual(attractorModeForParams({ attractorCount: 1, attractorRadius: 2 * R }), 'low');
assert.strictEqual(attractorModeForParams({ attractorCount: 3, attractorRadius: 1.2 * R }), 'high');
assert.strictEqual(attractorModeForParams({ attractorCount: 5, attractorRadius: 2 * R }), 'high',
  'an over-mode count from a file shows as the nearest mode, HIGH');

// ── 2 — the pinned constants, proven on the engine's field ──────────────
{
  const seed = 4242;
  // One attractor per mode radius: reach grows strictly with the mode.
  const reach = {};
  for (const id of ['low', 'mid', 'high']) {
    const f = createAttractorField(seed, null, 1, { radius: attractorRadiusForMode(id) });
    const cx = f.points[0];
    const cy = f.points[1];
    assert.ok(f.sample(cx, cy) > 0.99, `${id}: centre reads ~1`);
    reach[id] = f.sample(cx + 0.18, cy);
  }
  assert.strictEqual(reach.low, 0, 'LOW (r = 0.15) does not reach 0.18 from centre');
  assert.ok(reach.mid > 0, 'MID (r = 0.225) reaches 0.18');
  assert.ok(reach.high > reach.mid, 'HIGH (r = 0.30) reaches strictly harder than MID at the same point');

  // The mode fields themselves: counts land, and the seeded spread is
  // stable — the first attractor is the same point at every count (the
  // k-th point is a pure function of the seed), so raising the mode adds
  // points without moving the ones already down.
  const fields = {};
  for (const id of SHIFT_MODE_IDS) {
    const p = attractorParamsForMode(id);
    fields[id] = createAttractorField(seed, null, p.attractorCount, { radius: p.attractorRadius });
    assert.strictEqual(fields[id].count, p.attractorCount);
  }
  assert.strictEqual(fields.low.points[0], fields.high.points[0]);
  assert.strictEqual(fields.low.points[1], fields.high.points[1]);

  // Pooling over a constant base: OFF is the identity on a grid (the
  // field-level no-op), MID pools — never above base, equal at a centre,
  // strictly below somewhere out in the field.
  const base = makeConstantField(0.8);
  const pooledOff = withAttractorDensity(base, fields.off);
  const pooledMid = withAttractorDensity(base, fields.mid);
  let sawBelow = false;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const x = i / 10;
      const y = j / 10;
      assert.strictEqual(pooledOff.sample(x, y), 0.8, 'OFF pooling is the identity');
      const v = pooledMid.sample(x, y);
      assert.ok(v <= 0.8 + 1e-12, 'pooling never raises density');
      if (v < 0.8 - 1e-9) sawBelow = true;
    }
  }
  assert.ok(sawBelow, 'MID pooling actually bends density somewhere');
  assert.ok(Math.abs(pooledMid.sample(fields.mid.points[0], fields.mid.points[1]) - 0.8) < 1e-9,
    'at an attractor centre the pooled density is the base itself');
}

// ── 3 — the panel path: row writes → params → placements ────────────────
const assets = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
  { id: 'c', weight: 'light' },
];
const palette = { swatches: ['#111', '#222', '#333', '#444'] };
const baseParams = {
  mode: 'grid', composition: 'default', count: 40,
  scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
  jitter: 10, density: 100, zTiers: 1, bleed: false, mirror: false,
  overlap: true, displacement: 0, noiseFreq: 0.005, noiseSpeed: 0.5,
};
const caps = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };
const SEED = 0x1a4f;
const place = (layoutParams) => buildPlacements({
  layoutParams, seed: SEED, activeAssets: assets, palette, caps, canvasW: 1000, canvasH: 700,
});
const serialize = (r) => JSON.stringify(r.items.map((it) => [
  it.assetId, it.index, it.x, it.y, it.scale, it.scaleY, it.rotation, it.alpha, it.color,
]));
// Apply row writes to a params object the way the store door does.
const applyWrites = (params, writes) => {
  const next = { ...params };
  for (const w of writes) next[w.key] = w.value;
  return next;
};

const todayRun = place(baseParams); // today's shape: no shift keys at all
const offParams = applyWrites(applyWrites(baseParams, [heroesWrite('off')]), attractorWrites('off'));
assert.strictEqual(serialize(place(offParams)), serialize(todayRun),
  'OFF through the panel path is byte-identical to today (no shift keys)');

// Heroes MID: exactly the seed's three indices transform — scale ×[3,6),
// rotation + (π ± 0.35) — and nothing else about the frame moves.
{
  const midParams = applyWrites(baseParams, [heroesWrite('mid')]);
  assert.strictEqual(midParams.heroes, 3);
  const mid = place(midParams);
  assert.strictEqual(serialize(place(midParams)), serialize(mid), 'heroes replay deterministically');
  const heroIdx = new Set(selectHeroIndices(SEED, 40, 3));
  assert.strictEqual(heroIdx.size, 3);
  let changed = 0;
  for (let i = 0; i < todayRun.items.length; i++) {
    const a = todayRun.items[i];
    const b = mid.items[i];
    assert.strictEqual(b.x, a.x, 'heroes never move placement (stage C only)');
    assert.strictEqual(b.y, a.y);
    if (heroIdx.has(b.index)) {
      changed++;
      const ratio = b.scale / a.scale;
      assert.ok(ratio >= 3 && ratio < 6, `hero scale ratio ${ratio} in [3, 6)`);
      const dRot = b.rotation - a.rotation;
      assert.ok(dRot >= Math.PI - 0.35 && dRot <= Math.PI + 0.35, `hero rotation delta ${dRot} is the half-turn ± 0.35`);
    } else {
      assert.strictEqual(b.scale, a.scale, 'non-hero scale untouched');
      assert.strictEqual(b.rotation, a.rotation, 'non-hero rotation untouched');
    }
  }
  assert.strictEqual(changed, 3, 'exactly the three chosen indices are heroes');
  const backOff = applyWrites(midParams, [heroesWrite('off')]);
  assert.strictEqual(serialize(place(backOff)), serialize(todayRun), 'heroes OFF restores the identical frame');
}

// Attractors HIGH: placement pools (positions change), deterministically;
// OFF restores the identical frame.
{
  const highParams = applyWrites(baseParams, attractorWrites('high'));
  assert.deepStrictEqual(
    { attractorCount: highParams.attractorCount, attractorRadius: highParams.attractorRadius },
    { attractorCount: 3, attractorRadius: 2 * R },
  );
  const high = place(highParams);
  assert.notStrictEqual(serialize(high), serialize(todayRun), 'attractors on = a different frame');
  assert.ok(high.items.some((it, i) => it.x !== todayRun.items[i].x || it.y !== todayRun.items[i].y),
    'attractors move placement positions (density pooling)');
  assert.strictEqual(serialize(place(highParams)), serialize(high), 'attractors replay deterministically');
  const backOff = applyWrites(highParams, attractorWrites('off'));
  assert.strictEqual(serialize(place(backOff)), serialize(todayRun), 'PULL OFF restores the identical frame');
}

// ── 4 — the hand-only law ───────────────────────────────────────────────
// localStorage shim BEFORE the store import (the writePathHonesty pattern).
const lsData = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
  setItem: (k, v) => lsData.set(k, String(v)),
  removeItem: (k) => lsData.delete(k),
};
globalThis.requestAnimationFrame = (fn) => { queueMicrotask(() => fn(performance.now())); return 1; };

const { RANDOMIZABLE_KEYS, MORPHABLE_KEYS, DICE_RANGES, generateLayoutTargets } = await import('../../state/paramUtils.js');
const { MOTION_KEYS } = await import('../../state/rollScope.mjs');
const { leanDialSteps } = await import('../../curator/director.js');
const { useStore } = await import('../../state/store.js');

// Static: no machine key table names a shift param.
for (const key of SHIFT_KEYS) {
  assert.ok(!RANDOMIZABLE_KEYS.includes(key), `dice/randomize table must not contain ${key}`);
  assert.ok(!MORPHABLE_KEYS.includes(key), `morph table must not contain ${key}`);
  assert.ok(!(key in DICE_RANGES), `DICE_RANGES must not contain ${key}`);
  assert.ok(!MOTION_KEYS.includes(key), `roll-scope MOTION_KEYS must not contain ${key}`);
}
// Davis's evolve targets derive from the dice table alone — none land.
{
  const targets = generateLayoutTargets({ lockedParams: {} });
  assert.ok(Object.keys(targets).length > 0, 'evolve targets exist (the door really produces them)');
  for (const key of SHIFT_KEYS) assert.ok(!(key in targets), `evolve targets must not contain ${key}`);
}
// The Queen's lean steps name only her two dials and the pull readout.
{
  const steps = leanDialSteps({ lean: { wetness: 0.9, evolve: 0.9 }, wetness: 0.1, evolveInterval: 9000, keeps: [], allowance: 1 });
  assert.deepStrictEqual(Object.keys(steps).sort(), ['evolveInterval', 'pull', 'wetness'],
    'the Queen steps wetness + evolve only — she cannot crown heroes or pull');
}
// Dynamic: the real store's doors run; the hand-set triple does not move.
{
  const s = () => useStore.getState();
  // The hand writes through the panel path: the rows' own write payloads,
  // landed through the store's validating setter.
  for (const w of [heroesWrite('mid'), ...attractorWrites('mid')]) s().setLayoutParam(w.key, w.value);
  const triple = () => {
    const p = s().layoutParams;
    return [p.heroes, p.attractorCount, p.attractorRadius];
  };
  assert.deepStrictEqual(triple(), [3, 2, 1.5 * R], 'hand writes land');

  const undoBefore = (s().historyUndoStack || []).length;
  s().randomizeUnlocked();
  assert.deepStrictEqual(triple(), [3, 2, 1.5 * R], 'a dice roll leaves the triple untouched');
  assert.ok((s().historyUndoStack || []).length > undoBefore, 'the dice door really ran (an undo step landed)');
  for (let i = 0; i < 2; i++) {
    s().randomizeUnlocked();
    assert.deepStrictEqual(triple(), [3, 2, 1.5 * R], 'repeated dice rolls leave the triple untouched');
  }
  for (let i = 0; i < 3; i++) {
    s().curateUnlocked();
    assert.deepStrictEqual(triple(), [3, 2, 1.5 * R], 'a curator pass leaves the triple untouched');
  }
  // The governor never writes layoutParams at all — its last-resort cut
  // is a render-only overlay over count/mirror.
  const docBefore = JSON.stringify(s().layoutParams);
  s().setPerfClampOverride({ count: 12 });
  assert.strictEqual(JSON.stringify(s().layoutParams), docBefore, 'the governor overlay leaves the document untouched');
  s().setPerfClampOverride(null);
  assert.deepStrictEqual(triple(), [3, 2, 1.5 * R]);
}

console.log('shiftLayer.selfcheck: all assertions passed');
