// node src/engine/kernel/sample/gaussian.selfcheck.mjs
// #1194 — Gaussian cluster mixture: bounded, index-stable, grouped with soft falloff, spatial-stream only.
import assert from 'node:assert/strict';
import { mkRng } from '../../prng.js';
import { makeScratchStream } from '../rng.js';
import { computePlacements } from '../../placement.js';
import {
  gaussian, gaussianLobes, clearGaussianCache, reflect,
  GAUSS_MIN_LOBES, GAUSS_MAX_LOBES, GAUSS_MARGIN, GAUSS_SIGMA_FRAC,
} from './gaussian.js';

const W = 1000;
const H = 700;
const ctxFor = (i, seed, extra = {}) => ({ i, count: 400, w: W, h: H, rng: mkRng(i + 1), jitter: 0, seed, seedOffsets: null, ...extra });
const pt = (i, seed, extra) => gaussian(ctxFor(i, seed, extra));

// 1. reflect: identity inside, mirror outside, always in [0, size], exact for huge distances
{
  assert.equal(reflect(30, 100), 30);
  assert.equal(reflect(-30, 100), 30);
  assert.equal(reflect(130, 100), 70);
  assert.equal(reflect(230, 100), 30);
  for (const v of [-1e6, -1, 0, 100, 101, 12345.678, 9e9]) {
    const r = reflect(v, 100);
    assert.ok(r >= 0 && r <= 100, `reflect(${v}) = ${r} in range`);
  }
}

// 2. the lobe table: 2..3 lobes, normalized, centres in the inner region, deterministic, spatial-only
{
  clearGaussianCache();
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const lobes = gaussianLobes(seed, W, H, null);
    assert.ok(lobes.length >= GAUSS_MIN_LOBES && lobes.length <= GAUSS_MAX_LOBES, `seed ${seed}: ${lobes.length} lobes`);
    seen.add(lobes.length);
    let prev = 0;
    for (const l of lobes) {
      assert.ok(l.cum > prev, 'cumulative weights increase');
      prev = l.cum;
      assert.ok(l.cx >= GAUSS_MARGIN * W - 1e-9 && l.cx <= (1 - GAUSS_MARGIN) * W + 1e-9, 'cx in the inner region');
      assert.ok(l.cy >= GAUSS_MARGIN * H - 1e-9 && l.cy <= (1 - GAUSS_MARGIN) * H + 1e-9, 'cy in the inner region');
    }
    assert.equal(lobes[lobes.length - 1].cum, 1);
  }
  assert.ok(seen.has(2) && seen.has(3), 'both lobe counts occur');
  const a = JSON.stringify(gaussianLobes(5, W, H, null));
  clearGaussianCache();
  assert.equal(JSON.stringify(gaussianLobes(5, W, H, null)), a, 'deterministic');
  assert.notEqual(JSON.stringify(gaussianLobes(6, W, H, null)), a, 'seeds differ');
  const off = { spatial: 3, color: 0, asset: 0, noise: 0 };
  assert.notEqual(JSON.stringify(gaussianLobes(5, W, H, off)), a, 're-rolling SPATIAL re-rolls the grouping');
  assert.equal(JSON.stringify(gaussianLobes(5, W, H, { spatial: 0, color: 9, asset: 9, noise: 9 })), a, 'colour/asset/noise offsets do not');
}

// 3. every point is on the plate (never off, never piled on the border), for any seed, jitter and sigma
{
  let onEdge = 0;
  let n = 0;
  for (const seed of [1, 2, 77, 0xabcdef]) {
    for (const extra of [{}, { jitter: 80 }, { gaussianSigma: 0.6 }, { gaussianSigma: 5, jitter: 500 }]) {
      for (let i = 0; i < 300; i++) {
        const p = pt(i, seed, extra);
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'finite');
        assert.ok(p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H, `on the plate (${p.x}, ${p.y})`);
        if (p.x === 0 || p.x === W || p.y === 0 || p.y === H) onEdge += 1;
        n += 1;
      }
    }
  }
  assert.ok(onEdge / n < 0.01, `reflection does not pile points on the border (${onEdge}/${n})`);
}

// 4. index-stable: point i does not depend on the count, the call order, or the scratch stream
{
  const a = [];
  for (let i = 0; i < 50; i++) a.push(pt(i, 9));
  for (let i = 49; i >= 0; i--) {
    const q = gaussian({ ...ctxFor(i, 9), count: 5000 });
    assert.deepEqual(q, a[i], `point ${i} is order- and count-independent`);
  }
  const scratch = makeScratchStream();
  for (let i = 0; i < 50; i++) {
    assert.deepEqual(gaussian({ ...ctxFor(i, 9), scratch }), a[i], `scratch stream == rngForIndex at ${i}`);
  }
}

// 5. it really groups, with soft falloff: much nearer the lobe centres than uniform scatter, yet spread over lobes
{
  const seed = 31;
  const lobes = gaussianLobes(seed, W, H, null);
  const nearest = (x, y) => Math.min(...lobes.map((l) => Math.hypot(x - l.cx, y - l.cy)));
  let gaussMean = 0;
  let uniMean = 0;
  const N = 2000;
  const rng = mkRng(99);
  const hits = new Array(lobes.length).fill(0);
  for (let i = 0; i < N; i++) {
    const p = pt(i, seed);
    gaussMean += nearest(p.x, p.y);
    uniMean += nearest(rng() * W, rng() * H);
    let k = 0;
    let best = Infinity;
    lobes.forEach((l, li) => { const d = Math.hypot(p.x - l.cx, p.y - l.cy); if (d < best) { best = d; k = li; } });
    hits[k] += 1;
  }
  assert.ok(gaussMean / N < 0.55 * (uniMean / N), `clustered: ${(gaussMean / N).toFixed(0)}px vs uniform ${(uniMean / N).toFixed(0)}px`);
  assert.ok(hits.every((h) => h > N * 0.08), `every lobe holds a group: ${hits.join('/')}`);
  // soft falloff: a dense core and a sparse edge, not a ring or a hard disc
  const sigma = GAUSS_SIGMA_FRAC * Math.min(W, H);
  let core = 0;
  let shell = 0;
  for (let i = 0; i < N; i++) {
    const p = pt(i, seed);
    const d = nearest(p.x, p.y);
    if (d < sigma) core += 1;
    else if (d < 2 * sigma) shell += 1;
  }
  // density, not count: the shell [sigma, 2sigma] has 3x the core's area
  assert.ok(core > shell / 3, `core density (${core}) beats the next shell's (${(shell / 3).toFixed(0)} per core-area)`);
  assert.ok(core > N * 0.25, 'a real core: a quarter of the points sit within one sigma of a centre');
  assert.ok(shell > 0, 'the edge feathers rather than stops');
}

// 6. the sigma control widens the spread
{
  const spread = (sigma) => {
    let s = 0;
    const lobes = gaussianLobes(12, W, H, null);
    for (let i = 0; i < 600; i++) {
      const p = pt(i, 12, { gaussianSigma: sigma });
      s += Math.min(...lobes.map((l) => Math.hypot(p.x - l.cx, p.y - l.cy)));
    }
    return s / 600;
  };
  assert.ok(spread(0.25) > 1.8 * spread(0.08), 'a larger sigma spreads the groups');
}

// 7. orchestrator: mode 'gaussian' places count finite, on-plate, deterministic points
{
  const run = () => computePlacements({
    mode: 'gaussian', count: 120, seed: 0x1194, scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
    jitter: 12, density: 100, zTiers: 1, bleed: false, canvasW: W, canvasH: H,
  });
  const a = run();
  assert.equal(a.length, 120);
  for (const p of a) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H);
  assert.deepEqual(run().map((p) => [p.x, p.y]), a.map((p) => [p.x, p.y]), 'same seed, same scene');
  const b = computePlacements({
    mode: 'gaussian', count: 120, seed: 0x1195, scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
    jitter: 12, density: 100, zTiers: 1, bleed: false, canvasW: W, canvasH: H,
  });
  assert.notDeepEqual(b.map((p) => [p.x, p.y]), a.map((p) => [p.x, p.y]), 'a different seed re-deals');
}

console.log('gaussian.selfcheck: ok (#1194)');
