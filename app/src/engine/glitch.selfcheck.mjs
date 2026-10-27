// node src/engine/glitch.selfcheck.mjs
// Phase 2 S8 — the glitch: render-side corruption over a true skeleton. The band mapping (Tighten corrupts,
// Relax restores), frame determinism, truth invariance (zero corruption is the uncorrupted path, byte for
// byte; the bone hash does not move), the four operators re-derived independently, and the builder wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ASSETS } from '../data/assets/index.js';
import { corruptionAmount, glitchFrame, applyGlitch, glitchItemsHash, GLITCH } from './glitch.js';
import { createCreatureBuilder, MOTH } from './creature.js';
import { getCostTier } from './kernel/costRegistry.mjs';
import { hashU01 } from './kernel/rng.js';
import { TIGHTEN_ABOVE } from '../curator/stress.js';

// 1. The band mapping — ruling 3: at or below the Tighten bar there is NO corruption (Normal and Relax are
//    truth); above it, corruption grows quadratically to full at band 1. No band at all: no corruption.
{
  // The bar is stress.js's, never a local copy: if the band reader's bar ever moves, the glitch
  // moves with it — this guard is what keeps the two from silently diverging (S5's one-place law).
  assert.equal(
    GLITCH.tightenAt,
    TIGHTEN_ABOVE,
    'the glitch corrupts at stress.js’s Tighten bar, imported — not a local literal',
  );
  for (const b of [undefined, NaN, -1, 0, 0.28, 0.5, GLITCH.tightenAt]) {
    assert.equal(corruptionAmount(b), 0, `band ${b} corrupts nothing`);
    assert.equal(
      glitchFrame({ seed: 77, creatureId: 'm0', frameIndex: 3, band: b }),
      null,
      `band ${b} yields no frame`,
    );
  }
  assert.equal(corruptionAmount(1), 1, 'full Tighten is full corruption');
  assert.ok(
    Math.abs(corruptionAmount(0.86) - 0.25) < 1e-12,
    'halfway past the bar is a quarter corruption (quadratic)',
  );
  let prev = 0;
  for (let b = GLITCH.tightenAt; b <= 1.0001; b += 0.02) {
    const a = corruptionAmount(Math.min(1, b));
    assert.ok(a >= prev, 'the amount never falls as the band tightens');
    prev = a;
  }
}

// 2. Frame determinism: a corruption frame is a pure function of (seed, creature, frame, band) — and the
//    frame index is half the key, so the corruption flickers per frame while replaying identically.
{
  const f1 = glitchFrame({ seed: 77, creatureId: 'm0', frameIndex: 12, band: 1 });
  const f2 = glitchFrame({ seed: 77, creatureId: 'm0', frameIndex: 12, band: 1 });
  assert.deepEqual(f2, f1, 'same inputs, same frame of corruption');
  assert.equal(f1.amount, 1);
  assert.ok(Math.abs(f1.seam) <= GLITCH.maxSeamPx, 'seam drift is bounded');
  assert.ok(
    f1.split >= GLITCH.maxSplitPx * 0.4 && f1.split <= GLITCH.maxSplitPx,
    'split is bounded, never vanishing at full corruption',
  );
  const f3 = glitchFrame({ seed: 77, creatureId: 'm0', frameIndex: 13, band: 1 });
  assert.notDeepEqual(
    { seam: f3.seam, split: f3.split },
    { seam: f1.seam, split: f1.split },
    'the next frame corrupts differently',
  );
  const f4 = glitchFrame({ seed: 78, creatureId: 'm0', frameIndex: 12, band: 1 });
  assert.notDeepEqual(
    { seam: f4.seam, split: f4.split },
    { seam: f1.seam, split: f1.split },
    'another seed, another pattern',
  );
  // the 'glitch' channel rides the SPATIAL seed-offset group, like the skeleton's: a spatial re-roll moves it
  assert.notEqual(
    hashU01(77, 'glitch', 5, { spatial: 123, color: 0, asset: 0, noise: 0 }),
    hashU01(77, 'glitch', 5, null),
    'a spatial seed offset re-rolls the corruption draws',
  );
}

// A hand fixture in the builder's item shape, around a root at (500, 350), unrotated: local = world - root.
const item = (key, x, y, over = {}) => ({
  x,
  y,
  scale: 1.5,
  scaleY: 1.5,
  rotation: 0,
  alpha: 100,
  assetId: 'org_leaf_02',
  color: '#aa3300',
  accent: '#123456',
  key,
  zTier: 0,
  seedOffset: 0,
  glass: false,
  _creature: true,
  ...over,
});
const FRAME = { cx: 500, cy: 350, rotDeg: 0 };
const fixture = () => [
  item('creature:0:halo:m0', 500, 350, { assetId: 'org_pod_02' }),
  item('creature:0:m0', 500, 350, { assetId: 'org_pod_02' }),
  item('creature:0:m0/wingR', 560, 320),
  item('creature:0:m0/wingL', 440, 320),
  ...Array.from({ length: 10 }, (_, i) =>
    item(`creature:0:m0/wingR/marks#${i}`, 540 + i * 4, 300 + i * 3, {
      assetId: 'geo_diamond_01',
      scale: 0.4,
      scaleY: 0.4,
    }),
  ),
];

// 3. applyGlitch at the unit level: purity, identity at zero, and the operators re-derived from geometry.
{
  const clean = fixture();
  const snapshot = JSON.stringify(clean);
  const gf = glitchFrame({ seed: 77, creatureId: 'm0', frameIndex: 12, band: 1 });
  assert.equal(applyGlitch(clean, FRAME, null), clean, 'a null frame returns the input array itself');
  assert.equal(applyGlitch(clean, FRAME, { ...gf, amount: 0 }), clean, 'a zero amount returns the input array itself');
  const out = applyGlitch(clean, FRAME, gf);
  assert.equal(JSON.stringify(clean), snapshot, 'the input items are never mutated');
  assert.notEqual(out, clean, 'corruption returns a new array');

  const byKey = (arr, k) => arr.find((it) => it.key === k);
  // Strip slip + seam, re-derived: the two wings share a strip (same local Y), so their offset difference is
  // exactly twice the seam — the slip cancels. Offsets run along local X only: local Y never moves.
  const r = byKey(out, 'creature:0:m0/wingR');
  const l = byKey(out, 'creature:0:m0/wingL');
  assert.ok(Math.abs(r.x - 560 - (l.x - 440) - 2 * gf.seam) < 1e-9, 'opposite halves drift by exactly ±seam');
  assert.equal(r.y, 320, 'a slipped item keeps its local Y');
  assert.equal(l.y, 320);
  for (const it of out.filter((x) => !x.key.includes('#g'))) {
    const src = byKey(clean, it.key);
    if (src)
      assert.ok(Math.abs(it.x - src.x) <= GLITCH.maxSlipPx + GLITCH.maxSeamPx + 1e-9, 'no offset exceeds slip + seam');
  }
  // Channel split: each material item (not halo, not marks) carries a blue ghost before it and a red ghost
  // after it, channel-isolated, offset ±split along local X, at reduced alpha.
  const ghosts = out.filter((it) => it.key.includes('#g'));
  assert.equal(ghosts.length, 6, 'body + two wings x two ghosts');
  const gR = byKey(out, 'creature:0:m0/wingR#gR');
  const gB = byKey(out, 'creature:0:m0/wingR#gB');
  assert.equal(gR.color, '#aa0000', 'the red ghost keeps only the red channel');
  assert.equal(gB.color, '#000000', 'the blue ghost keeps only the blue channel (the wing colour has none)');
  assert.equal(gB.accent, '#000056', 'the accent splits too');
  assert.equal(gR.accent, '#120000');
  assert.ok(
    Math.abs(gR.x - r.x - gf.split) < 1e-9 && Math.abs(gB.x - r.x + gf.split) < 1e-9,
    'ghosts sit ±split from the true stamp',
  );
  assert.equal(gR.alpha, Math.round(100 * GLITCH.ghostAlpha), 'ghosts are fainter than the material');
  assert.equal(out.filter((it) => it.key.includes(':halo:')).length, 1, 'the halo grows no ghosts');
  // Hatch sorting: the marks' SET is preserved (nothing created or lost), and across frames the seeded swaps
  // demonstrably re-sort them at least once — while a zero-swap frame (a hair past the bar) keeps the order.
  const markKeys = (arr) => arr.filter((it) => it.key.includes('marks#')).map((it) => it.key);
  assert.deepEqual([...markKeys(out)].sort(), [...markKeys(clean)].sort(), 'hatch sorting loses no marks');
  let resorted = false;
  for (let f = 0; f < 40 && !resorted; f++) {
    const o = applyGlitch(fixture(), FRAME, glitchFrame({ seed: 77, creatureId: 'm0', frameIndex: f, band: 1 }));
    if (JSON.stringify(markKeys(o)) !== JSON.stringify(markKeys(clean))) resorted = true;
  }
  assert.ok(resorted, 'at full corruption the hatch order is re-sorted on some frame');
  const thin = applyGlitch(fixture(), FRAME, glitchFrame({ seed: 77, creatureId: 'm0', frameIndex: 12, band: 0.73 }));
  assert.deepEqual(markKeys(thin), markKeys(clean), 'a hair past the bar: graded swaps round to zero, order untouched');
}

// 4. Golden hashes: the corrupted fixture is pinned — same seed + band + frame, the same hash on any device;
//    and the hash moves when the frame does.
const GOLDEN_CORRUPT_HASH = '0e30fa40';
const GOLDEN_CLEAN_HASH = '77d42dc3';
{
  const corrupt = applyGlitch(fixture(), FRAME, glitchFrame({ seed: 77, creatureId: 'm0', frameIndex: 12, band: 1 }));
  assert.equal(glitchItemsHash(corrupt), GOLDEN_CORRUPT_HASH, 'the golden corrupted fixture');
  assert.equal(glitchItemsHash(fixture()), GOLDEN_CLEAN_HASH, 'the golden clean fixture');
  assert.notEqual(glitchItemsHash(corrupt), GOLDEN_CLEAN_HASH, 'corruption moves the hash');
  const next = applyGlitch(fixture(), FRAME, glitchFrame({ seed: 77, creatureId: 'm0', frameIndex: 13, band: 1 }));
  assert.notEqual(glitchItemsHash(next), GOLDEN_CORRUPT_HASH, 'the next frame hashes differently');
}

// 5. The builder wiring, end to end — the S1 fixture (seed 77, one pin, full growth). Census note
//    (publish integration, 2026-10-17): the moth this corrupts is the CURRENT builder moth — 58 items
//    since S3's fan plumage replaced the scatter (the staged pins were taken against the 26-item moth).
//    The plumage carries the hatch class, so the ghost arithmetic is unchanged: 3 material stamps
//    (body + two wing stamps) x 2 ghosts. The corrupted-moth golden below is re-pinned on that cause;
//    the corruption operators and the section-4 fixture goldens are untouched.
{
  const PAL = { bg: '#111111', ink: '#eeeeee', swatches: ['#aa0000', '#222222'] };
  const entry = () => [{ id: 'a', items: [{ x: 1, y: 1, assetId: 'x' }], palette: PAL }];
  const input = (over = {}) => ({
    dishPins: [{ x: 500, y: 350 }],
    dishFormed: [true],
    seed: 77,
    seedOffsets: null,
    loopTimeMs: 0,
    assetAttach: {},
    ...over,
  });
  const grow = (over) => {
    const b = createCreatureBuilder();
    let e;
    for (let i = 0; i < MOTH.growFrames + 1; i++) {
      e = entry();
      b.append(input(over), e, ASSETS);
    }
    return { b, items: e[0].items.filter((it) => it._creature) };
  };

  const clean = grow({});
  assert.equal(
    clean.items.length,
    58,
    'the clean moth is the current builder moth: 58 items (S1’s 26 + S3’s fan plumage)',
  );

  // Below the bar, the gate is transparent: byte-identical items through the glitch path.
  const below = grow({ dishGlitch: [0.5] });
  assert.deepEqual(below.items, clean.items, 'a Normal band corrupts nothing — byte-identical');
  const noBand = grow({ dishGlitch: [undefined] });
  assert.deepEqual(noBand.items, clean.items, 'no band value, no corruption');

  // Full Tighten: the material corrupts; the skeleton does not.
  const hot = grow({ dishGlitch: [1], wantSkeletons: true });
  const cleanSkels = grow({ wantSkeletons: true }).b.lastSkeletons();
  assert.equal(hot.b.lastSkeletons()[0].hash, cleanSkels[0].hash, 'the bone hash is corruption-invariant');
  assert.equal(hot.b.lastSkeletons()[0].hash, '7944cd55', "and still S1's golden bone hash");
  assert.notDeepEqual(hot.items, clean.items, 'full Tighten visibly corrupts');
  assert.equal(hot.items.length, clean.items.length + 6, 'three material stamps x two ghosts, nothing else added');
  for (const it of clean.items)
    assert.ok(
      hot.items.some((h) => h.key === it.key),
      `the true stamp survives: ${it.key}`,
    );
  assert.equal(
    glitchItemsHash(hot.items),
    '651c23c2',
    'the golden corrupted moth (re-pinned at publish: the moth grew S3 plumage since staging; operators unchanged)',
  );

  // Replay: a second builder fed the same input sequence corrupts identically, frame for frame.
  const replay = grow({ dishGlitch: [1] });
  assert.equal(glitchItemsHash(replay.items), glitchItemsHash(hot.items), 'same take, same corruption');

  // Relax restores: a builder that spent its growth at full Tighten and then relaxed emits, on its final
  // frame, exactly the clean moth — the corruption leaves no residue in the items or the builder.
  const b = createCreatureBuilder();
  let e;
  for (let i = 0; i < MOTH.growFrames + 1; i++) {
    e = entry();
    b.append(input({ dishGlitch: [i < 30 ? 1 : 0.2] }), e, ASSETS);
  }
  assert.deepEqual(
    e[0].items.filter((it) => it._creature),
    clean.items,
    'Relax returns the body to byte-exact truth',
  );
}

// 6. The cost registration: the glitch's declaration is in the registry, tier 0 (structural to the type —
//    exempt from the FX measured-costs sweep by the registry's own contract).
{
  const decl = getCostTier('creature:glitch');
  assert.ok(decl, 'creature:glitch is registered');
  assert.equal(decl.tier, 0, 'tier 0: the corruption is the type itself, never a shed pass');
  assert.equal(decl.memoryBytes, 0, 'no working set');
}

// 7. The determinism guard, in mathRandomGuard's pattern: glitch.js carries none of the banned clocks or
//    unseeded chance in its code (comments stripped first, exactly as the guard strips them).
{
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'glitch.js'), 'utf8');
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const code = noBlock
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n');
  for (const banned of ['Math.random', 'Date.now', 'performance.now']) {
    assert.ok(!code.includes(banned), `glitch.js must not use ${banned} — seeded kernel channels only`);
  }
}

// 8. Cost, printed (sandbox CPU, indicative only — the iPad GPU bar is the harness's on real hardware):
//    the builder's per-frame cost with four creatures at full corruption vs clean, resolver-probe style.
{
  const PAL = { bg: '#111111', ink: '#eeeeee', swatches: ['#aa0000', '#222222'] };
  const entry = () => [{ id: 'a', items: [{ x: 1, y: 1, assetId: 'x' }], palette: PAL }];
  const pins = [
    { x: 300, y: 250 },
    { x: 700, y: 250 },
    { x: 300, y: 500 },
    { x: 700, y: 500 },
  ];
  const input = (over = {}) => ({
    dishPins: pins,
    dishFormed: [true, true, true, true],
    dishLimbs: [2, 2, 2, 2],
    seed: 77,
    seedOffsets: null,
    loopTimeMs: 0,
    assetAttach: {},
    ...over,
  });
  const time = (over) => {
    const b = createCreatureBuilder();
    for (let i = 0; i < 60; i++) b.append(input(over), entry(), ASSETS); // warm: full growth, hind pairs in
    const t0 = performance.now();
    for (let i = 0; i < 240; i++) b.append(input(over), entry(), ASSETS);
    return (performance.now() - t0) / 240;
  };
  const cleanMs = time({});
  const hotMs = time({ dishGlitch: [1, 1, 1, 1] });
  console.log(
    `[cost] builder append x4 creatures: clean ${cleanMs.toFixed(3)} ms/frame, glitch@Tighten ${hotMs.toFixed(3)} ms/frame (sandbox CPU, indicative only)`,
  );
  assert.ok(hotMs < 10, 'corruption stays an order of magnitude inside the frame even on sandbox CPU');
}

console.log(
  'glitch.selfcheck: OK (band mapping, frame determinism, operators, goldens, builder wiring, truth invariance, guard)',
);
