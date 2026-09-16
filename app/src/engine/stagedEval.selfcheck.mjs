// node src/engine/stagedEval.selfcheck.mjs
//
// Kernel v2 (#108) step 4 — staged eval + dirty flags.
//
// The entire safety argument for the cache is one property: for any sequence
// of calls, a cached buildPlacements must return EXACTLY what an uncached one
// would. Not "visually the same" — the same doubles and the same strings.
// A cache that is only usually right produces frames that are subtly wrong in
// ways nobody can reproduce, which is worse than no cache.
//
// So this walks a long sequence of realistic parameter mutations, driving one
// cached instance and one uncached instance in lockstep, and compares every
// field of every item at every step.

import assert from 'node:assert';
import { buildPlacements } from './buildPlacements.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const ASSETS = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
  { id: 'c', weight: 'light' },
];
const ASSETS_ALT = [
  { id: 'a', weight: 'light' },
  { id: 'd', weight: 'heavy' },
];
const PALETTE = { swatches: ['#111', '#222', '#333', '#444'] };
const PALETTE_ALT = { swatches: ['#f00', '#0f0', '#00f'] };
const CAPS = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };

const BASE = {
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'fibonacci', count: 300 },
  seed: 0x1a4f,
  activeAssets: ASSETS,
  palette: PALETTE,
  caps: CAPS,
  canvasW: 1000,
  canvasH: 700,
};

function assertSameItems(got, want, label) {
  assert.strictEqual(got.items.length, want.items.length, `${label}: item count`);
  assert.strictEqual(got.safeCount, want.safeCount, `${label}: safeCount`);
  for (let i = 0; i < want.items.length; i++) {
    const g = got.items[i];
    const w = want.items[i];
    for (const k of ['x', 'y', 'scale', 'rotation', 'alpha', 'index', 't', 'zTier', 'assetId', 'color', 'accent', 'key']) {
      assert.strictEqual(g[k], w[k], `${label}: item[${i}].${k} — cached ${g[k]} vs uncached ${w[k]}`);
    }
  }
}

// Each step mutates the args the way a real interaction would. The comment on
// each says which stages SHOULD be invalidated; correctness here does not
// depend on that being right, but the hit-rate assertions at the bottom do.
const STEPS = [
  ['initial', (a) => a],
  // Stage C only — this is the every-frame audio/life case.
  ['scale modulated', (a) => ({ ...a, scale: [0.41, 1.63] })],
  ['scale modulated again', (a) => ({ ...a, scale: [0.42, 1.66] })],
  ['alpha modulated', (a) => ({ ...a, alpha: [41, 99] })],
  ['both modulated', (a) => ({ ...a, scale: [0.39, 1.59], alpha: [38, 97] })],
  // Stage D/E — pool and palette edits.
  ['asset pool swap', (a) => ({ ...a, activeAssets: ASSETS_ALT })],
  ['scale after pool swap', (a) => ({ ...a, scale: [0.5, 1.5] })],
  ['palette swap', (a) => ({ ...a, palette: PALETTE_ALT })],
  ['palette strategy', (a) => ({ ...a, layoutParams: { ...a.layoutParams, paletteShift: 'zone' } })],
  // Stage A/B — geometry edits.
  ['count change', (a) => ({ ...a, layoutParams: { ...a.layoutParams, count: 180 } })],
  ['mode change', (a) => ({ ...a, layoutParams: { ...a.layoutParams, mode: 'grid' } })],
  ['jitter', (a) => ({ ...a, layoutParams: { ...a.layoutParams, jitter: 60 } })],
  ['density', (a) => ({ ...a, layoutParams: { ...a.layoutParams, density: 45 } })],
  ['zTiers', (a) => ({ ...a, layoutParams: { ...a.layoutParams, zTiers: 1 } })],
  ['displacement on', (a) => ({ ...a, layoutParams: { ...a.layoutParams, displacement: 40 } })],
  ['noiseFreq', (a) => ({ ...a, layoutParams: { ...a.layoutParams, noiseFreq: 0.02 } })],
  ['noiseSpeed', (a) => ({ ...a, layoutParams: { ...a.layoutParams, noiseSpeed: 1.4 } })],
  ['scale under displacement', (a) => ({ ...a, scale: [0.6, 1.2] })],
  ['bleed', (a) => ({ ...a, layoutParams: { ...a.layoutParams, bleed: true } })],
  ['seed change', (a) => ({ ...a, seed: 0x9e3d })],
  ['canvas resize', (a) => ({ ...a, canvasW: 1400, canvasH: 900 })],
  // Ordering / mirroring paths, which reorder and duplicate the item list.
  ['overlap off (sorts)', (a) => ({ ...a, layoutParams: { ...a.layoutParams, overlap: false } })],
  ['scale while sorted', (a) => ({ ...a, scale: [0.2, 2.0] })],
  ['mirror on', (a) => ({ ...a, layoutParams: { ...a.layoutParams, mirror: true } })],
  ['scale while mirrored', (a) => ({ ...a, scale: [0.45, 1.25] })],
  ['back to plain', (a) => ({
    ...a,
    layoutParams: { ...a.layoutParams, mirror: false, overlap: true, displacement: 0, bleed: false },
  })],
  // Returning to the exact opening state must not resurrect anything stale.
  ['return to initial', () => ({ ...BASE })],
];

const cache = {};
let args = { ...BASE };
for (const [label, mutate] of STEPS) {
  args = mutate(args);
  const cached = buildPlacements({ ...args, cache });
  const fresh = buildPlacements({ ...args });
  assertSameItems(cached, fresh, label);
}

// Same, but for the empty-pool early return — it bails before touching the
// cache, and must not leave a stale entry that a later call would trust.
{
  const c = {};
  buildPlacements({ ...BASE, cache: c });
  const empty = buildPlacements({ ...BASE, activeAssets: [], cache: c });
  assert.strictEqual(empty.items.length, 0, 'empty pool should yield no items');
  const after = buildPlacements({ ...BASE, cache: c });
  assertSameItems(after, buildPlacements({ ...BASE }), 'after empty-pool bail');
}

// A cache must never be required for correctness: two independent caches and
// no cache at all must agree, and one cache must not be corrupted by being
// driven with interleaved unrelated parameters.
{
  const cA = {};
  const cB = {};
  const alt = { ...BASE, seed: 0x5150, layoutParams: { ...BASE.layoutParams, mode: 'radial' } };
  for (let i = 0; i < 5; i++) {
    buildPlacements({ ...alt, cache: cA });
    const got = buildPlacements({ ...BASE, cache: cB });
    assertSameItems(got, buildPlacements({ ...BASE }), `interleaved pass ${i}`);
  }
}

// Now the actual point of the exercise: prove the cache SKIPS work, not just
// that it stays correct. A correct cache that never hits is a slow no-op, and
// nothing else in this suite would notice.
{
  const c = {};
  let geoRuns = 0;
  let bindRuns = 0;
  // Count stage runs by observing the buffers the cache holds: a stage A
  // re-run replaces cache.soa's contents, a stage D/E re-run replaces the
  // bind arrays. Identity of those arrays is the observable.
  let lastSoa = null;
  let lastKeys = null;
  const tick = (extra) => {
    buildPlacements({ ...BASE, ...extra, cache: c });
    if (c.soa !== lastSoa) { geoRuns++; lastSoa = c.soa; }
    if (c.keys !== lastKeys) { bindRuns++; lastKeys = c.keys; }
  };

  tick({});                                  // cold: both stages run
  for (let f = 1; f <= 60; f++) {
    // 60 frames of pure audio/life modulation — exactly what useCanvasLife
    // produces while the operator touches nothing.
    tick({ scale: [0.4 + f * 0.001, 1.6 + f * 0.001], alpha: [40 + f * 0.01, 100] });
  }
  assert.strictEqual(geoRuns, 1, `geometry re-ran ${geoRuns}x over 60 modulation frames (want 1)`);
  assert.strictEqual(bindRuns, 1, `asset/colour bind re-ran ${bindRuns}x over 60 modulation frames (want 1)`);
  console.log(`  60 modulation frames → geometry ran ${geoRuns}x, bind ran ${bindRuns}x`);
}

// ── Fuzz ────────────────────────────────────────────────────────────────
// The scripted sequence above only covers transitions I thought of. This
// drives one long-lived cache with randomised parameter sets — the shape
// that actually finds stage-invalidation holes, because it hits combinations
// (mirror flipping while density changes, mode changing under displacement,
// canvas resize mid-sequence) that no hand-written list enumerates.
//
// Seeded LCG, not Math.random: a fuzz failure has to be reproducible or it
// is just an intermittent CI failure nobody can act on.
{
  const MODES = [
    'random', 'grid', 'fibonacci', 'radial', 'swarm', 'flow', 'layers',
    'rails', 'orbit', 'abacus', 'stratified', 'noise',
  ];
  let s = 12345;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  const cache = {};
  const ITERS = 4000;
  for (let iter = 0; iter < ITERS; iter++) {
    const args = {
      layoutParams: {
        ...DEFAULT_LAYOUT_PARAMS,
        mode: pick(MODES),
        count: 1 + Math.floor(rnd() * 500),
        jitter: Math.floor(rnd() * 80),
        density: 40 + Math.floor(rnd() * 60),
        zTiers: 1 + Math.floor(rnd() * 6),
        bleed: rnd() < 0.3,
        mirror: rnd() < 0.3,
        overlap: rnd() < 0.7,
        displacement: rnd() < 0.4 ? Math.floor(rnd() * 200) : 0,
        noiseFreq: 0.001 + rnd() * 0.029,
        noiseSpeed: rnd() * 2,
        paletteShift: pick(['auto', 'band', 'zone', 'split']),
      },
      seed: Math.floor(rnd() * 0xffffffff),
      activeAssets: rnd() < 0.5 ? ASSETS : ASSETS_ALT,
      palette: rnd() < 0.5 ? PALETTE : PALETTE_ALT,
      caps: CAPS,
      canvasW: rnd() < 0.5 ? 1000 : 1400,
      canvasH: rnd() < 0.5 ? 700 : 900,
      scale: [0.3 + rnd() * 0.3, 1.2 + rnd() * 0.6],
      alpha: [30 + rnd() * 20, 90 + rnd() * 10],
    };
    assertSameItems(
      buildPlacements({ ...args, cache }),
      buildPlacements({ ...args }),
      `fuzz iter ${iter} (mode=${args.layoutParams.mode} count=${args.layoutParams.count} `
      + `density=${args.layoutParams.density} mirror=${args.layoutParams.mirror} `
      + `overlap=${args.layoutParams.overlap} disp=${args.layoutParams.displacement})`,
    );
  }
  console.log(`  fuzz: ${ITERS}/${ITERS} randomised param sets, cached === uncached`);
}

console.log('stagedEval.selfcheck: OK (#108 step 4 — cached === uncached, and the cache actually hits)');
