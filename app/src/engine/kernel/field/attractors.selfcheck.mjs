// node src/engine/kernel/field/attractors.selfcheck.mjs
// #1200 — attractor field + hero marks: determinism, the provable no-op,
// density pooling, hero rule-breaking, and the placement off-state gate.
import assert from 'node:assert';
import {
  createAttractorField,
  sampleDensity,
  withAttractorDensity,
  selectHeroIndices,
  heroTransform,
  makeHeroInfo,
  applyHeroes,
  MAX_HEROES,
  ATTRACTOR_RADIUS_DEFAULT,
  ATTRACTOR_FALLOFF_DEFAULT,
} from './attractors.js';
import { makeConstantField, combineFields } from './index.js';
import { FIELDS } from './registry.js';
import { computeGeometrySoA, applyAttributes } from '../../placement.js';

// --- field determinism ------------------------------------------------------
const f1 = createAttractorField(1234, null, 5);
const f2 = createAttractorField(1234, null, 5);
assert.deepStrictEqual([...f1.points], [...f2.points], 'same seed = same attractors');
const f3 = createAttractorField(9999, null, 5);
assert.notDeepStrictEqual([...f1.points], [...f3.points], 'different seed = different attractors');
assert.strictEqual(f1.kind, 'attractor');
assert.strictEqual(f1.count, 5);
assert.strictEqual(f1.radius, ATTRACTOR_RADIUS_DEFAULT);
assert.strictEqual(f1.falloff, ATTRACTOR_FALLOFF_DEFAULT);

// points land inside the requested bounds
const b = { x: 0.2, y: 0.3, w: 0.4, h: 0.2 };
const fb = createAttractorField(7, b, 50);
for (let k = 0; k < 50; k++) {
  const x = fb.points[k * 2];
  const y = fb.points[k * 2 + 1];
  assert.ok(x >= 0.2 && x <= 0.6 && y >= 0.3 && y <= 0.5, `point ${k} outside bounds`);
}

// every sample stays in 0..1, and the centre of an attractor reads ~1
for (let i = 0; i <= 20; i++) {
  for (let j = 0; j <= 20; j++) {
    const v = f1.sample(i / 20, j / 20);
    assert.ok(v >= 0 && v <= 1, `sample out of range: ${v}`);
  }
}
const c0x = f1.points[0];
const c0y = f1.points[1];
assert.ok(f1.sample(c0x, c0y) > 0.99, 'attractor centre should read ~1');
assert.ok(f1.sample(c0x + f1.radius * 2, c0y) === 0, 'far outside radius reads 0');

// sampleDensity is the named alias over field.sample
assert.strictEqual(sampleDensity(f1, c0x, c0y), f1.sample(c0x, c0y));

// falloff profiles all peak at 1 and decay
for (const falloff of ['smooth', 'linear', 'gaussian']) {
  const ff = createAttractorField(5, null, 1, { falloff, radius: 0.2 });
  const px = ff.points[0];
  const py = ff.points[1];
  assert.ok(Math.abs(ff.sample(px, py) - 1) < 1e-9, `${falloff}: centre reads 1`);
  const mid = ff.sample(px + 0.1, py);
  assert.ok(mid > 0 && mid < 1, `${falloff}: mid-radius reads between 0 and 1`);
}

// --- the provable no-op: zero attractors ------------------------------------
const empty = createAttractorField(1234, null, 0);
assert.strictEqual(empty.count, 0);
for (let i = 0; i <= 10; i++) {
  for (let j = 0; j <= 10; j++) {
    assert.strictEqual(empty.sample(i / 10, j / 10), 1, 'empty field samples exactly 1');
  }
}
const base = makeConstantField(0.7);
const pooled0 = withAttractorDensity(base, empty);
for (let i = 0; i <= 10; i++) {
  for (let j = 0; j <= 10; j++) {
    assert.strictEqual(pooled0.sample(i / 10, j / 10), base.sample(i / 10, j / 10),
      'empty attractor field leaves the base field bit-identical');
  }
}
// and it is still the identity through the generic combinator
const combo = combineFields(base, empty);
assert.strictEqual(combo.sample(0.33, 0.77), 0.7);

// minSpacing is deterministic and respected (when achievable)
const spaced = createAttractorField(11, null, 8, { minSpacing: 0.3 });
const spaced2 = createAttractorField(11, null, 8, { minSpacing: 0.3 });
assert.deepStrictEqual([...spaced.points], [...spaced2.points], 'minSpacing deterministic');

// --- hero selection ----------------------------------------------------------
const h1 = selectHeroIndices(4242, 1000, 3);
const h2 = selectHeroIndices(4242, 1000, 3);
assert.deepStrictEqual(h1, h2, 'hero selection deterministic per seed');
assert.strictEqual(h1.length, 3);
assert.deepStrictEqual([...h1].sort((a, b) => a - b), h1, 'hero indices sorted');
assert.strictEqual(new Set(h1).size, 3, 'hero indices unique');
for (const idx of h1) assert.ok(idx >= 0 && idx < 1000, 'hero index in range');

// scarcity: capped at MAX_HEROES, never a percentage
const many = selectHeroIndices(4242, 100000, 5000);
assert.ok(many.length <= MAX_HEROES, `heroes capped at ${MAX_HEROES}, got ${many.length}`);
// clamps: more heroes than marks, zero heroes, zero marks
assert.strictEqual(selectHeroIndices(1, 3, 10).length, 3);
assert.strictEqual(selectHeroIndices(1, 100, 0).length, 0);
assert.strictEqual(selectHeroIndices(1, 0, 5).length, 0);
assert.notDeepStrictEqual(
  selectHeroIndices(4242, 1000, 3),
  selectHeroIndices(4243, 1000, 3),
  'different seed = different heroes',
);

// hero transform: larger scale, direction against the field
for (let k = 0; k < 20; k++) {
  const t = heroTransform(4242, k * 37);
  assert.ok(t.scaleMult >= 3 && t.scaleMult < 6, `hero scale ${t.scaleMult} in [3, 6)`);
  assert.ok(Math.abs(t.rotationOffset - Math.PI) <= 0.35 + 1e-9,
    `hero rotation ${t.rotationOffset} within PI ± 0.35`);
}
const ht1 = heroTransform(4242, 9);
const ht2 = heroTransform(4242, 9);
assert.deepStrictEqual(ht1, ht2, 'hero transform deterministic per (seed, index)');

// makeHeroInfo: the off-state no-op
assert.strictEqual(makeHeroInfo(1, 100, 0), null, '0 heroes -> null');
const hi = makeHeroInfo(4242, 1000, 3);
assert.ok(hi && hi.set instanceof Set && hi.set.size === 3);
assert.deepStrictEqual([...hi.set].sort((a, b) => a - b), h1);

// applyHeroes: null = untouched lanes; heroes break scale + rotation
function miniSoA(n, indices) {
  return {
    n,
    index: new Uint32Array(indices),
    scale: new Float64Array(n).fill(2),
    scaleY: new Float64Array(n).fill(2),
    rotation: new Float64Array(n).fill(0.5),
  };
}
const plain = miniSoA(4, [0, 1, 2, 3]);
applyHeroes(plain, null);
assert.deepStrictEqual([...plain.scale], [2, 2, 2, 2], 'null heroes leave lanes untouched');
const heroed = miniSoA(4, [10, 11, 12, 13]);
const heroedInfo = makeHeroInfo(4242, 100, 2);
// rebuild the window around the actual selection so heroes land inside it
const sel = [...heroedInfo.set].sort((a, b) => a - b);
const filler = [];
for (let i = 0; i < 100 && filler.length < 2; i++) {
  if (!heroedInfo.set.has(i)) filler.push(i);
}
const win = miniSoA(4, [sel[0], filler[0], filler[1], sel[1]]);
applyHeroes(win, heroedInfo);
let touched = 0;
for (let k = 0; k < 4; k++) {
  const src = win.index[k];
  if (heroedInfo.set.has(src)) {
    touched++;
    assert.ok(win.scale[k] >= 6 && win.scale[k] < 12, 'hero scale 3-6x');
    assert.ok(win.scaleY[k] === win.scale[k], 'hero Y scale follows');
    assert.ok(Math.abs(win.rotation[k] - 0.5 - Math.PI) <= 0.35 + 1e-9, 'hero rotation breaks');
  } else {
    assert.strictEqual(win.scale[k], 2, 'non-hero untouched');
    assert.strictEqual(win.rotation[k], 0.5, 'non-hero untouched');
  }
}
assert.strictEqual(touched, 2, 'both heroes landed in the window');

// --- registry: the shared-adoption surface ------------------------------------
const decl = FIELDS.get('attractor');
assert.ok(decl, 'attractor registered in the field registry');
const regField = decl.create(1234, { count: 4 });
assert.strictEqual(regField.kind, 'attractor');
assert.strictEqual(regField.count, 4);
const regEmpty = decl.create(1234, {});
assert.strictEqual(regEmpty.sample(0.5, 0.5), 1, 'registry default is the no-op');

// --- placement: off state is byte-identical ----------------------------------
const P = { mode: 'random', count: 300, seed: 77, canvasW: 1000, canvasH: 800, jitter: 4, density: 90 };
const offA = computeGeometrySoA({ ...P });
const offB = computeGeometrySoA({ ...P, attractorCount: 0, attractorRadius: 0.2 });
assert.strictEqual(offA.n, offB.n);
for (const lane of ['x', 'y', 't', 'index', 'zTier', 'depth', 'uScale', 'uScaleY', 'uRot', 'uAlpha']) {
  assert.deepStrictEqual([...offA[lane].slice(0, offA.n)], [...offB[lane].slice(0, offB.n)],
    `off-state lane ${lane} byte-identical`);
}
// stage C: heroes=null and heroes=makeHeroInfo(...,0) both leave lanes alone
const sc = { scale: [0.5, 2], rotate: [0, Math.PI], alpha: [0.2, 0.9] };
applyAttributes(offA, { ...sc, heroes: null });
const snapScale = [...offA.scale.slice(0, offA.n)];
const snapRot = [...offA.rotation.slice(0, offA.n)];
applyAttributes(offA, { ...sc, heroes: makeHeroInfo(77, 300, 0) });
assert.deepStrictEqual([...offA.scale.slice(0, offA.n)], snapScale, '0 heroes = untouched');
assert.deepStrictEqual([...offA.rotation.slice(0, offA.n)], snapRot, '0 heroes = untouched');

// --- placement: density pools at attractors -----------------------------------
function meanNearestDist(soa, field) {
  let sum = 0;
  for (let k = 0; k < soa.n; k++) {
    const nx = soa.x[k] / 1000;
    const ny = soa.y[k] / 800;
    let best = Infinity;
    for (let j = 0; j < field.count; j++) {
      const dx = nx - field.points[j * 2];
      const dy = ny - field.points[j * 2 + 1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
    sum += best;
  }
  return sum / soa.n;
}
const noPool = computeGeometrySoA({ ...P, count: 2000, seed: 42 });
const poolField = createAttractorField(42, null, 6, { radius: 0.15 });
const pooled = computeGeometrySoA({ ...P, count: 2000, seed: 42, attractorCount: 6, attractorRadius: 0.15 });
assert.ok(pooled.n > 200, 'pooling keeps a healthy fraction of marks');
const dBase = meanNearestDist(noPool, poolField);
const dPool = meanNearestDist(pooled, poolField);
assert.ok(dPool < dBase * 0.6, `pooled marks sit nearer attractors (${dPool.toFixed(3)} < ${dBase.toFixed(3)})`);

// --- placement: heroes break the field ----------------------------------------
const heroSoa = computeGeometrySoA({ mode: 'random', count: 200, seed: 55, canvasW: 1000, canvasH: 800 });
const heroInfo = makeHeroInfo(55, 200, 3);
const baseScale = [...heroSoa.uScale.slice(0, heroSoa.n)];
const baseRot = [...heroSoa.uRot.slice(0, heroSoa.n)];
applyAttributes(heroSoa, { scale: [1, 2], rotate: [0, 1], alpha: [0, 1], heroes: heroInfo });
let heroRows = 0;
for (let k = 0; k < heroSoa.n; k++) {
  const src = heroSoa.index[k];
  const sBase = (1 + 1 * baseScale[k]) * heroSoa.depth[k];
  const rBase = 0 + 1 * baseRot[k];
  if (heroInfo.set.has(src)) {
    heroRows++;
    const mult = heroSoa.scale[k] / sBase;
    assert.ok(mult >= 3 && mult < 6, `hero row scale mult ${mult} in [3, 6)`);
    const off = heroSoa.rotation[k] - rBase;
    assert.ok(Math.abs(off - Math.PI) <= 0.35 + 1e-9, `hero row rotation offset ${off}`);
  } else {
    assert.ok(Math.abs(heroSoa.scale[k] - sBase) < 1e-12, 'non-hero scale untouched');
    assert.ok(Math.abs(heroSoa.rotation[k] - rBase) < 1e-12, 'non-hero rotation untouched');
  }
}
assert.ok(heroRows > 0, 'hero rows present in the placement');

console.log('attractors.selfcheck: ok');
