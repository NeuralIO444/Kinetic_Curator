// node src/engine/kernel/sample/circlepack.selfcheck.mjs
// #1195 — circle packing: no overlaps (asserted end to end), on-plate, largest-first, extreme contrast, re-packs
// with the SCALE slider and with nothing else.
import assert from 'node:assert/strict';
import { computePlacements, geometrySignature } from '../../placement.js';
import { PACK_UNIT_PX, clearCirclePackCache, packDepth, circlePack } from './circlepack.js';

const W = 1000;
const H = 700;
const base = (over = {}) => ({
  mode: 'circlepack', count: 150, seed: 0x1195, jitter: 0, density: 100, zTiers: 1, bleed: false,
  canvasW: W, canvasH: H, scale: [0.4, 0.8], rotate: [0, 0], alpha: [100, 100], ...over,
});

/** The no-overlap assertion, on the FINAL items (scale already through stage C): r = unit * scale. */
function assertPacked(items, w, h, label) {
  const eps = 1e-6;
  for (const p of items) {
    const r = PACK_UNIT_PX * p.scale;
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(r) && r >= 0, `${label}: finite`);
    assert.ok(p.x - r >= -eps && p.x + r <= w + eps && p.y - r >= -eps && p.y + r <= h + eps,
      `${label}: circle ${p.index} on the plate (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, r ${r.toFixed(1)})`);
  }
  for (let a = 0; a < items.length; a++) {
    const A = items[a];
    const ra = PACK_UNIT_PX * A.scale;
    for (let b = a + 1; b < items.length; b++) {
      const B = items[b];
      const d = Math.hypot(A.x - B.x, A.y - B.y);
      assert.ok(d >= ra + PACK_UNIT_PX * B.scale - eps,
        `${label}: circles ${A.index} and ${B.index} overlap by ${(ra + PACK_UNIT_PX * B.scale - d).toFixed(3)}px`);
    }
  }
}

// 1. NO OVERLAPS, across counts, scale ranges and tiers (asserted end to end). The guarantee is "where there is room":
//    when the plate cannot hold the nodes even at their smallest allowed size the packer reports `overflow` instead.
{
  let roomy = 0;
  let crowded = 0;
  for (const count of [30, 120, 400, 800]) {
    for (const scale of [[0.4, 0.8], [0.1, 1.6], [0.6, 0.6]]) {
      for (const zTiers of [1, 4]) {
        clearCirclePackCache();
        const items = computePlacements(base({ count, scale, zTiers }));
        assert.equal(items.length, count, 'every index is placed');
        const set = circlePack({ seed: 0x1195, w: W, h: H, count, lo: Math.min(...scale), hi: Math.max(...scale), tiers: zTiers });
        const label = `count=${count} scale=${scale} tiers=${zTiers}`;
        if (set.overflow === 0) {
          assertPacked(items, W, H, label);
          roomy += 1;
        } else {
          // overflow only where the nodes at their slider minimum cannot physically fit (>= 35% of the plate)
          const need = items.length * Math.PI * (PACK_UNIT_PX * Math.min(...scale)) ** 2 / (W * H);
          assert.ok(need > 0.35, `${label}: overflow ${set.overflow} reported on a plate that is not crowded (${need.toFixed(2)})`);
          crowded += 1;
        }
      }
    }
  }
  assert.ok(roomy >= 12, `most configurations pack with zero overlap (${roomy} roomy, ${crowded} crowded)`);
}

// 2. a crowded plate degrades by SHRINKING fillers first; anything still without room is reported, on the plate
{
  clearCirclePackCache();
  const cw = 300;
  const ch = 200;
  const items = computePlacements(base({ count: 800, scale: [0.9, 1.4], canvasW: cw, canvasH: ch }));
  const set = circlePack({ seed: 0x1195, w: cw, h: ch, count: 800, lo: 0.9, hi: 1.4, tiers: 1 });
  const shrunk = items.filter((p) => p.scale < 0.9 - 1e-9).length;
  assert.ok(shrunk > 0, 'some fillers shrank below the slider minimum to find room');
  for (const p of items) {
    const r = PACK_UNIT_PX * p.scale;
    assert.ok(p.x - r >= -1e-6 && p.x + r <= cw + 1e-6 && p.y - r >= -1e-6 && p.y + r <= ch + 1e-6, 'still on the plate');
  }
  assert.ok(set.overflow > 0, 'an overfull plate says so (overflow is reported, not hidden)');
  // and a plate that is merely full-ish still packs with no overlap
  clearCirclePackCache();
  const ok = computePlacements(base({ count: 120, scale: [0.9, 1.4], canvasW: cw, canvasH: ch }));
  const okSet = circlePack({ seed: 0x1195, w: cw, h: ch, count: 120, lo: 0.9, hi: 1.4, tiers: 1 });
  if (okSet.overflow === 0) assertPacked(ok, cw, ch, 'full-ish 300x200');
}

// 3. largest-first and extreme contrast from the slider range
{
  clearCirclePackCache();
  const items = computePlacements(base({ count: 200, scale: [0.1, 1.6] }));
  const byIndex = [...items].sort((a, b) => a.index - b.index);
  assert.ok(byIndex[0].scale >= Math.max(...items.map((p) => p.scale)) - 1e-9, 'index 0 is the largest anchor');
  const ratio = Math.max(...items.map((p) => p.scale)) / Math.min(...items.map((p) => p.scale));
  assert.ok(ratio >= 6, `scale contrast from the slider: ${ratio.toFixed(1)}x`);
  // heavy tail: many more small fillers than large anchors
  const median = [...items.map((p) => p.scale)].sort((a, b) => a - b)[100];
  assert.ok(median < 0.5 * Math.max(...items.map((p) => p.scale)), 'most nodes are fillers, a few are anchors');
}

// 4. dense: the plate is actually filled, not a few circles in a corner
{
  clearCirclePackCache();
  const items = computePlacements(base({ count: 300, scale: [0.2, 1.0] }));
  const covered = items.reduce((s, p) => s + Math.PI * (PACK_UNIT_PX * p.scale) ** 2, 0) / (W * H);
  assert.ok(covered > 0.2, `coverage ${(covered * 100).toFixed(0)}% of the plate`);
  const quad = [0, 0, 0, 0];
  for (const p of items) quad[(p.x > W / 2 ? 1 : 0) + (p.y > H / 2 ? 2 : 0)] += 1;
  assert.ok(quad.every((q) => q > items.length * 0.1), `spread across the plate: ${quad.join('/')}`);
}

// 5. deterministic; seeds and SPATIAL offset re-deal; the placement is index-stable under density
{
  clearCirclePackCache();
  const a = computePlacements(base());
  clearCirclePackCache();
  const b = computePlacements(base());
  assert.deepEqual(b.map((p) => [p.x, p.y, p.scale]), a.map((p) => [p.x, p.y, p.scale]), 'same seed, same scene');
  const c = computePlacements(base({ seed: 0x1196 }));
  assert.notDeepEqual(c.map((p) => [p.x, p.y]), a.map((p) => [p.x, p.y]), 'a different seed re-deals');
  const d = computePlacements(base({ seedOffsets: { spatial: 5, color: 0, asset: 0, noise: 0 } }));
  assert.notDeepEqual(d.map((p) => [p.x, p.y]), a.map((p) => [p.x, p.y]), 'SPATIAL re-roll re-deals');
  const e = computePlacements(base({ seedOffsets: { spatial: 0, color: 7, asset: 7, noise: 7 } }));
  assert.deepEqual(e.map((p) => [p.x, p.y]), a.map((p) => [p.x, p.y]), 'colour/asset/noise offsets do not move it');
  // thinning by density keeps each surviving circle exactly where it was (and still non-overlapping)
  const thin = computePlacements(base({ density: 60 }));
  assert.ok(thin.length < a.length);
  const at = new Map(a.map((p) => [p.index, [p.x, p.y, p.scale]]));
  for (const p of thin) assert.deepEqual([p.x, p.y, p.scale], at.get(p.index), `circle ${p.index} did not move`);
  assertPacked(thin, W, H, 'density 60');
}

// 6. the SCALE slider re-packs this mode (and ONLY this mode's cache key sees it)
{
  const g = (mode, scale) => geometrySignature({ mode, count: 10, seed: 1, packScale: mode === 'circlepack' ? scale : null, canvasW: W, canvasH: H });
  assert.notDeepEqual(g('circlepack', [0.4, 0.8]), g('circlepack', [0.4, 1.2]), 'circlepack signature follows the base scale');
  assert.deepEqual(g('grid', [0.4, 0.8]), g('grid', [0.4, 1.2]), 'other modes are unaffected');
  clearCirclePackCache();
  const small = computePlacements(base({ scale: [0.4, 0.6] }));
  const large = computePlacements(base({ scale: [0.4, 1.4] }));
  assert.notDeepEqual(small.map((p) => [p.x, p.y]), large.map((p) => [p.x, p.y]), 'a wider SCALE re-packs');
  assertPacked(large, W, H, 'after the SCALE widened');
}

// 7. depth: the z-tier multiplier is part of the packed radius
{
  assert.equal(packDepth(0, 1), 1);
  assert.ok(Math.abs(packDepth(0, 4) - 0.6) < 1e-12 && Math.abs(packDepth(3, 4) - 1.4) < 1e-12);
}

console.log('circlepack.selfcheck: ok (#1195)');
