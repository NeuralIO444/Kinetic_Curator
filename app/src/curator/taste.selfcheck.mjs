// taste.selfcheck.mjs — persona-weighted interim taste scorer.
// Determinism (seeded rng → same pick), honest labeling, no mutation,
// features measured not faked.
import assert from 'node:assert';
import {
  extractFeatures,
  scoreCandidate,
  pickPersona,
  personaCurator,
  setActivePersona,
  getActivePersonaId,
  getActivePersona,
} from './taste.js';
import { getPersonaTaste } from './personaTastes.js';
import { getActiveCurator, curatorHint, pickCurated } from './curate.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ─── feature extraction: hand-computed values ───
{
  const f = extractFeatures({
    count: 315, scale: [0.4, 1.6], rotate: [-90, 90], alpha: [40, 80],
    jitter: 75, displacement: 0, density: 70, zTiers: 5, noiseSpeed: 1.0,
    noiseFreq: 0.008, swarmCohesion: 2.0, gravityWells: 1.5,
    particleCount: 150, damping: 0.94,
  });
  assert.ok(approx(f.markDensity, 0.5), 'markDensity');
  assert.ok(approx(f.markSize, 0.9 / 2.9), 'markSize');
  assert.ok(approx(f.sizeVariety, 1.2 / 2.9), 'sizeVariety');
  assert.ok(approx(f.rotationSpread, 0.5), 'rotationSpread');
  assert.ok(approx(f.opacity, 50 / 90), 'opacity');
  assert.ok(approx(f.opacityVariety, 40 / 90), 'opacityVariety');
  assert.ok(approx(f.disorder, 0.25), 'disorder');
  assert.ok(approx(f.coverage, 0.5), 'coverage');
  assert.ok(approx(f.depth, 4 / 9), 'depth');
  assert.ok(approx(f.flowEnergy, 0.9 / 1.9), 'flowEnergy');
  assert.ok(approx(f.flowWarp, 0.006 / 0.013), 'flowWarp');
  assert.ok(approx(f.swarmDrive, 1.8 / 3.8), 'swarmDrive');
  assert.ok(approx(f.attractors, 1.4 / 2.9), 'attractors');
  assert.ok(approx(f.particles, 0.4), 'particles');
  assert.ok(approx(f.calm, 0.5), 'calm');
}

// missing/garbage keys -> neutral 0.5, never throws, never mutates
{
  for (const bad of [undefined, null, {}, 'nope', 42, { count: NaN }]) {
    const f = extractFeatures(bad);
    for (const v of Object.values(f)) assert.strictEqual(v, 0.5);
  }
  const frozen = Object.freeze({
    count: 100, scale: Object.freeze([0.2, 0.8]),
  });
  extractFeatures(frozen);
  pickPersona([frozen, frozen], 'davis', mulberry32(1)); // frozen input: no mutation
}

// davis prefers dense+ordered over sparse+chaotic (his Loves/Avoids)
{
  const base = {
    scale: [0.4, 1.6], rotate: [-90, 90], alpha: [40, 80], density: 70,
    zTiers: 5, noiseSpeed: 1.0, noiseFreq: 0.008, swarmCohesion: 2.0,
    gravityWells: 1.5, particleCount: 150, damping: 0.94,
  };
  const dense = { ...base, count: 600, density: 120, jitter: 0, displacement: 0 };
  const sparse = { ...base, count: 30, density: 20, jitter: 150, displacement: 150 };
  const w = getPersonaTaste('davis').weights;
  assert.ok(
    scoreCandidate(extractFeatures(dense), w) > scoreCandidate(extractFeatures(sparse), w),
    'davis should score dense+ordered above sparse+chaotic',
  );
  // molnar is the opposite on disorder: tiny flaw ok, chaos rejected
  const wm = getPersonaTaste('molnar').weights;
  assert.ok(wm.disorder < 0, 'molnar avoids disorder');
  const wd = getPersonaTaste('menkman').weights;
  assert.ok(wd.disorder > 0, 'menkman loves rupture/disorder');
}

// ─── pick determinism + argmax + top-3 jitter ───
const cands = Array.from({ length: 8 }, (_, i) => ({
  count: 120 + i * 40,
  scale: [0.3, 1.2 + i * 0.1],
  rotate: [-90, 90],
  alpha: [40, 80],
  jitter: 10 + i * 12,
  displacement: i * 8,
  density: 60 + i * 5,
  zTiers: 3 + (i % 4),
  noiseSpeed: 0.4 + i * 0.15,
  noiseFreq: 0.005,
  swarmCohesion: 1.0,
  gravityWells: 1.0,
  particleCount: 120,
  damping: 0.94,
}));

for (const seed of [1, 7, 42, 1234, 99999]) {
  const a = pickPersona(cands, 'davis', mulberry32(seed));
  const b = pickPersona(cands, 'davis', mulberry32(seed));
  assert.strictEqual(a, b, `seed ${seed} must pick deterministically`);
  assert.ok(a >= 0 && a < cands.length, 'pick in range');
}
assert.deepStrictEqual(pickPersona([], 'davis', mulberry32(1)), -1);
assert.deepStrictEqual(pickPersona(cands, 'bogus-persona', mulberry32(1)), -1);

// rng() === 0 always lands the top-1: argmax behavior preserved
{
  const w = getPersonaTaste('davis').weights;
  const scores = cands.map((c) => scoreCandidate(extractFeatures(c), w));
  const argmax = scores.indexOf(Math.max(...scores));
  assert.strictEqual(pickPersona(cands, 'davis', () => 0), argmax);
}

// every pick lands inside the top-3 by score; jitter actually fires
{
  const w = getPersonaTaste('davis').weights;
  const ranked = cands
    .map((c, i) => [scoreCandidate(extractFeatures(c), w), i])
    .sort((a, b) => b[0] - a[0])
    .slice(0, 3)
    .map(([, i]) => i);
  const seen = new Set();
  for (let s = 0; s < 500; s++) {
    const idx = pickPersona(cands, 'davis', mulberry32(1000 + s));
    assert.ok(ranked.includes(idx), `pick ${idx} must be in top-3 ${ranked}`);
    seen.add(idx);
  }
  assert.ok(seen.size >= 2, 'jitter should vary the pick across seeds');
}

// ─── honest labeling ───
{
  setActivePersona('davis');
  const eng = personaCurator();
  assert.strictEqual(eng.status(), 'active');
  assert.strictEqual(eng.personaName, 'OVERLAP'); // IP caution: surface shows the alias
  assert.strictEqual(curatorHint(eng), 'persona pick: OVERLAP');
  // engine participates in the shared pick path as curated
  const r = pickCurated(cands, eng);
  assert.strictEqual(r.curated, true);
  assert.ok(r.index >= 0 && r.index < cands.length);

  setActivePersona('bogus'); // unknown id -> no persona, honest fallback
  assert.strictEqual(getActivePersonaId(), null);
  assert.strictEqual(getActivePersona(), null);
  const off = personaCurator();
  assert.strictEqual(off.status(), 'untrained');
  assert.strictEqual(curatorHint(off), 'curator untrained · dice roll');
  assert.strictEqual(curatorHint(getActiveCurator()), 'curator untrained · dice roll');

  setActivePersona('davis'); // restore default for the app
  assert.strictEqual(getActivePersonaId(), 'davis');
  assert.strictEqual(getActiveCurator().status(), 'active');
  assert.strictEqual(curatorHint(getActiveCurator()), 'persona pick: OVERLAP');
}

console.log('taste.selfcheck: ok');
