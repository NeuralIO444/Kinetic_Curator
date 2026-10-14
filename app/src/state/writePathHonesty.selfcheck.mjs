// node src/state/writePathHonesty.selfcheck.mjs
//
// #1550 — write-path honesty. The fix law, pinned so it cannot drift:
//
//   1. ONE roll-ranges table. DICE_RANGES (state/paramUtils.js) is the
//      only table the random doors read: randomizeKey rolls it, Evolve's
//      generateLayoutTargets derives from it (plus the one DECLARED
//      override below), and refineMutate's REFINE_RANGES *is* it —
//      object identity, not a copy. Before #1550 the ranges existed
//      three times and the copies had drifted on five keys (E1a/E1b).
//   2. Every DICE_RANGES entry is a sub-range of the document spec
//      (PARAM_SPEC / RANGE_SPEC in data/layout-modes.js), with exactly
//      ONE declared exception: density proposes to 120 while PARAM_SPEC
//      caps the document at 100 (#272). That overhang is legal only
//      because every write door clamps it at write time — §4 proves
//      the clamping on the real store.
//   3. randomizeKey is honest by construction (the RA2 method of E1a,
//      applied to this door): over 4,000 seeded rolls per key, every
//      raw roll lands inside its declared table range with the table's
//      int/dec shape, and the value that LANDS through the validating
//      door is always inside the document spec.
//   4. The store's random doors land only validated values:
//      randomizeParam (per key, and the density clamp replayed roll
//      for roll), randomizeUnlocked (the whole document), and both
//      Evolve landings in davisSlice.triggerEvolve — the direct spread
//      and the morph targets.
//
// If a future change adds a second table, widens a range past the
// spec, or reopens a raw write door, this suite fails instead of the
// instrument drifting silently.
import assert from 'node:assert';

// localStorage shim BEFORE any store import (davisSlice reads it at
// factory time) — the census pattern.
const lsData = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
  setItem: (k, v) => lsData.set(k, String(v)),
  removeItem: (k) => lsData.delete(k),
};
globalThis.requestAnimationFrame = (fn) => { queueMicrotask(() => fn(performance.now())); return 1; };

const {
  randomizeKey, generateLayoutTargets, DICE_RANGES, EVOLVE_TARGET_OVERRIDES, RANDOMIZABLE_KEYS,
} = await import('./paramUtils.js');
const { REFINE_RANGES } = await import('../curator/refineMutate.js');
const {
  PARAM_SPEC, RANGE_SPEC, RANGE_HARD, validateLayoutParams, normalizeLayoutParams,
} = await import('../data/layout-modes.js');
const { useStore } = await import('./store.js');

// The standard mulberry32 (same algorithm as coverageReport's — the
// determinism law: every stream in this suite is seeded).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inClosed = (x, lo, hi) => typeof x === 'number' && x >= lo && x <= hi;
const leavesOf = (v) => (Array.isArray(v) ? v : [v]);

// A raw roll sits inside its declared DICE_RANGES entry.
function withinDiceRange(key, v) {
  const d = DICE_RANGES[key];
  if (d.pair) {
    return Array.isArray(v) && v.length === 2
      && inClosed(v[0], d.pair[0][0], d.pair[0][1])
      && inClosed(v[1], d.pair[1][0], d.pair[1][1]);
  }
  return inClosed(v, d.lo, d.hi);
}

// A LANDED value sits inside the document spec: PARAM_SPEC for scalars,
// RANGE_HARD for the pair keys (scale in its linked {x, y} shape).
function withinDocSpec(key, v) {
  if (PARAM_SPEC[key]) return inClosed(v, PARAM_SPEC[key].min, PARAM_SPEC[key].max);
  const hard = RANGE_HARD[key];
  if (key === 'scale') {
    return !!v && typeof v === 'object' && !Array.isArray(v)
      && Array.isArray(v.x) && Array.isArray(v.y)
      && [...v.x, ...v.y].every((x) => inClosed(x, hard.min, hard.max));
  }
  return Array.isArray(v) && v.length === 2 && v.every((x) => inClosed(x, hard.min, hard.max));
}

// ── §1+2 — one table, derived everywhere, inside the spec ──────────
{
  assert.deepStrictEqual(
    Object.keys(DICE_RANGES).sort(), [...RANDOMIZABLE_KEYS].sort(),
    'DICE_RANGES covers exactly the randomizable keys — no more, no fewer',
  );
  assert.strictEqual(REFINE_RANGES, DICE_RANGES, 'REFINE_RANGES is DICE_RANGES (identity, not a mirror)');

  // Every entry a sub-range of the document spec — except the declared
  // density overhang, whose exact shape is pinned so a second overhang
  // (or a wider one) fails here.
  const escapes = [];
  for (const key of RANDOMIZABLE_KEYS) {
    const d = DICE_RANGES[key];
    if (d.pair) {
      const s = RANGE_SPEC[key];
      for (const [lo, hi] of d.pair) {
        assert.ok(lo >= s.min && hi <= s.max, `${key}: pair element [${lo}, ${hi}] inside RANGE_SPEC [${s.min}, ${s.max}]`);
      }
    } else {
      const s = PARAM_SPEC[key];
      assert.ok(d.lo >= s.min, `${key}: table floor ${d.lo} at or above the spec floor ${s.min}`);
      if (d.hi > s.max) escapes.push(key);
    }
  }
  assert.deepStrictEqual(escapes, ['density'], 'density is the ONLY table range that proposes past the document spec');
  assert.strictEqual(DICE_RANGES.density.hi, 120, 'the declared overhang proposes to exactly 120');
  assert.strictEqual(PARAM_SPEC.density.max, 100, 'the document cap is exactly 100 (#272)');

  // The one declared Evolve override: a named, strict sub-range of the
  // shared table, itself inside the document spec. Anything else in
  // the overrides object fails here — a second silent narrowing is
  // exactly the drift #1550 exists to kill.
  assert.deepStrictEqual(Object.keys(EVOLVE_TARGET_OVERRIDES), ['swarmCohesion'],
    'swarmCohesion is the only declared Evolve override');
  const ov = EVOLVE_TARGET_OVERRIDES.swarmCohesion;
  const dc = DICE_RANGES.swarmCohesion;
  assert.ok(ov.lo > dc.lo && ov.hi < dc.hi && ov.dec === dc.dec,
    `the override [${ov.lo}, ${ov.hi}] strictly narrows the dice range [${dc.lo}, ${dc.hi}]`);
  assert.ok(ov.lo >= PARAM_SPEC.swarmCohesion.min && ov.hi <= PARAM_SPEC.swarmCohesion.max,
    'the override itself sits inside the document spec');

  // Derivation, measured: seeded Evolve targets never leave the
  // (override || shared table) range for their key — every key, every
  // draw — and locks still bite.
  const realRandom = Math.random;
  Math.random = mulberry32(0x1550);
  try {
    for (let i = 0; i < 4000; i++) {
      const t = generateLayoutTargets({ lockedParams: {} });
      for (const key of RANDOMIZABLE_KEYS) {
        const range = EVOLVE_TARGET_OVERRIDES[key] || DICE_RANGES[key];
        if (range.pair) {
          assert.ok(Array.isArray(t[key]) && inClosed(t[key][0], range.pair[0][0], range.pair[0][1])
            && inClosed(t[key][1], range.pair[1][0], range.pair[1][1]),
          `draw ${i}: Evolve ${key} target inside its declared range`);
        } else {
          assert.ok(inClosed(t[key], range.lo, range.hi), `draw ${i}: Evolve ${key} target ${t[key]} inside [${range.lo}, ${range.hi}]`);
        }
      }
    }
    const locked = generateLayoutTargets({ lockedParams: { density: true, scale: true } });
    assert.ok(!('density' in locked) && !('scale' in locked), 'locked keys produce no Evolve target');
  } finally {
    Math.random = realRandom;
  }
}

// ── §3 — randomizeKey honest by construction (RA2 on this door) ────
{
  RANDOMIZABLE_KEYS.forEach((key, idx) => {
    const spec = DICE_RANGES[key];
    const rng = mulberry32(0xAA2 ^ (idx * 0x9E37));
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 4000; i++) {
      const roll = randomizeKey(key, rng);
      assert.ok(withinDiceRange(key, roll), `${key} draw ${i}: raw roll ${JSON.stringify(roll)} inside its table range`);
      for (const leaf of leavesOf(roll)) {
        if (spec.int) assert.ok(Number.isInteger(leaf), `${key} draw ${i}: int shape holds (${leaf})`);
        if (spec.dec) assert.strictEqual(leaf, +leaf.toFixed(spec.dec), `${key} draw ${i}: dec-${spec.dec} shape holds (${leaf})`);
        if (leaf < min) min = leaf;
        if (leaf > max) max = leaf;
      }
      const landed = validateLayoutParams({ [key]: roll }).params[key];
      assert.ok(withinDocSpec(key, landed), `${key} draw ${i}: landed value ${JSON.stringify(landed)} inside the document spec`);
      if (key === 'density') {
        assert.strictEqual(landed, Math.min(roll, PARAM_SPEC.density.max),
          `density draw ${i}: a roll of ${roll} lands at exactly ${Math.min(roll, 100)}`);
      }
    }
    // The door actually uses its range (RA2's quartile honesty): the
    // seeded stream reaches both outer quartiles of the declared span.
    const spanLo = spec.pair ? spec.pair[0][0] : spec.lo;
    const spanHi = spec.pair ? spec.pair[1][1] : spec.hi;
    assert.ok(min <= spanLo + 0.25 * (spanHi - spanLo), `${key}: stream reaches the low quartile (min ${min})`);
    assert.ok(max >= spanLo + 0.75 * (spanHi - spanLo), `${key}: stream reaches the high quartile (max ${max})`);
  });
}

// ── §4 — the store doors land only validated values ────────────────
{
  const S = () => useStore.getState();
  const reset = () => S().setLayoutParams(normalizeLayoutParams({}));
  const realRandom = Math.random;
  reset();

  // randomizeParam('density'), replayed roll for roll: the raw stream
  // (same seed, read through randomizeKey) provably rolls past the
  // document cap — and every such roll lands at exactly 100.
  {
    Math.random = mulberry32(0xD1550);
    const landed = [];
    try {
      for (let i = 0; i < 400; i++) {
        S().randomizeParam('density');
        landed.push(S().layoutParams.density);
      }
    } finally {
      Math.random = realRandom;
    }
    const replay = mulberry32(0xD1550);
    let overCap = 0;
    for (let i = 0; i < 400; i++) {
      const raw = randomizeKey('density', replay);
      if (raw > 100) overCap++;
      assert.strictEqual(landed[i], Math.min(raw, 100), `density draw ${i}: roll ${raw} landed ${landed[i]}`);
    }
    assert.ok(overCap > 0, 'the seeded stream must roll past the cap at least once');
  }

  // randomizeParam, every key: whatever the roll, what sits in the
  // document afterwards is inside the spec (pairs in document shape).
  {
    Math.random = mulberry32(0xD00D);
    try {
      for (const key of RANDOMIZABLE_KEYS) {
        for (let i = 0; i < 200; i++) {
          S().randomizeParam(key);
          assert.ok(withinDocSpec(key, S().layoutParams[key]),
            `randomizeParam ${key} draw ${i}: landed ${JSON.stringify(S().layoutParams[key])} inside the document spec`);
        }
      }
    } finally {
      Math.random = realRandom;
    }
  }

  // A non-randomizable key is refused: no write, no undo step, the
  // document object untouched (the old door wrote `undefined` raw).
  {
    const before = S().layoutParams;
    S().randomizeParam('mode');
    S().randomizeParam('notAKey');
    assert.strictEqual(S().layoutParams, before, 'randomizeParam refuses non-randomizable keys without writing');
  }

  // randomizeUnlocked: after one press, the whole document is in spec.
  {
    reset();
    Math.random = mulberry32(0xBADA);
    try {
      S().randomizeUnlocked();
    } finally {
      Math.random = realRandom;
    }
    for (const key of RANDOMIZABLE_KEYS) {
      assert.ok(withinDocSpec(key, S().layoutParams[key]),
        `randomizeUnlocked: ${key} landed ${JSON.stringify(S().layoutParams[key])} inside the document spec`);
    }
  }

  // Both Evolve landings (davisSlice.triggerEvolve), replayed seed for
  // seed against the pure generator on the identical stream: the
  // direct spread lands clamped, and the morph targets are clamped at
  // the door (so the morph's validated per-tick writes interpolate
  // toward an in-spec endpoint). Scale lands in the document's linked
  // {x, y} shape on both paths.
  {
    reset();
    useStore.setState({ evolveTarget: 'layout', morphEvolve: false, lockedParams: {} });
    let overCapTargets = 0;
    for (let seed = 1; seed <= 60; seed++) {
      Math.random = mulberry32(seed);
      const raw = generateLayoutTargets({ lockedParams: {} });
      if (raw.density > 100) overCapTargets++;
      const expectedScale = validateLayoutParams({ scale: raw.scale }).params.scale;

      Math.random = mulberry32(seed);
      try {
        S().triggerEvolve();
      } finally {
        Math.random = realRandom;
      }
      assert.strictEqual(S().layoutParams.density, Math.min(raw.density, 100),
        `seed ${seed}: Evolve direct landing clamps density (raw target ${raw.density})`);
      assert.deepStrictEqual(S().layoutParams.scale, expectedScale,
        `seed ${seed}: Evolve direct landing puts scale in the linked {x, y} shape`);

      useStore.setState({ morphEvolve: true });
      Math.random = mulberry32(seed);
      try {
        S().triggerEvolve();
      } finally {
        Math.random = realRandom;
      }
      const mt = S().morphTo;
      assert.ok(mt, `seed ${seed}: morph targets exist`);
      assert.strictEqual(mt.density, Math.min(raw.density, 100),
        `seed ${seed}: morph target density is clamped at the door (raw ${raw.density})`);
      assert.deepStrictEqual(mt.scale, expectedScale,
        `seed ${seed}: morph target scale is in the linked {x, y} shape`);
      useStore.setState({ morphEvolve: false, morphing: false, morphFrom: null, morphTo: null });
      reset();
    }
    assert.ok(overCapTargets > 0, 'some seeded Evolve draws must roll density past the cap (else the clamp above proves nothing)');
  }
  reset();
}

console.log('writePathHonesty.selfcheck: OK (#1550 — one roll-ranges table derived by every door, density the only declared overhang, every store door lands validated)');
