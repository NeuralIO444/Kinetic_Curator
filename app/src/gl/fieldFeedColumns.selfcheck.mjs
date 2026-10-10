// node src/gl/fieldFeedColumns.selfcheck.mjs
// #1307 — byte-identical law for the SoA slice-2 column loops.
//
// Compares the NEW column functions (resolveFieldItems, resolveFeedItems,
// feedLive.pushSourceItems) against golden fixtures captured from the OLD
// object path (toNorm maps + applyField/applyFeed maps + clampHop item map)
// BEFORE the slice landed — see app/src/gl/testdata/fieldfeed-columns.golden.json
// and /tmp/golden-capture.mjs (the capture harness, kept out of the repo).
// The capture harness held VERBATIM copies of the old branch bodies from
// liveResolve.mjs, driven by the real applyField / feedLive.applyTo, over
// seeded deterministic inputs. Any bit-level drift fails here loudly —
// never a silent change (a genuinely intended change ships as a versioned
// behavior flag, not a weakened fixture).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveFieldItems, resolveFeedItems } from './fieldFeedColumns.mjs';
import { createFeedLive } from '../engine/kernel/tracks/feedLive.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, 'testdata', 'fieldfeed-columns.golden.json'), 'utf8'));
const { W, H } = fixture.meta;

// Deterministic PRNG + item builder — duplicated from the capture harness
// (same seeds ⇒ same inputs ⇒ outputs must match the fixture bit-for-bit).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeItems(rand, n, xMax, yMax) {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) {
    arr[i] = {
      x: rand() * xMax,
      y: rand() * yMax,
      scale: 0.5 + rand() * 2,
      alpha: rand() * 100,
      assetId: 'a' + (i % 7),
      index: i,
    };
  }
  return arr;
}
const toNorm = (it) => ({ x: (Number(it.x) || 0) / W, y: (Number(it.y) || 0) / H });

// Case parameters must match the capture harness exactly.
const FIELD_SPECS = {
  'field.attract': [{ strength: 1 }, 48, 64, 11],
  'field.repel': [{ strength: 2, polarity: -1 }, 48, 64, 12],
  'field.repel-string': [{ strength: 1, polarity: 'repel' }, 32, 40, 13],
  'field.strength0': [{ strength: 0 }, 48, 64, 14],
  'field.empty-src': [{ strength: 1 }, 0, 64, 15],
  'field.empty-tgt': [{ strength: 1 }, 48, 0, 16],
  'field.strength-nan': [{ strength: NaN }, 48, 64, 17],
  'field.strength-undefined': [{}, 48, 64, 18],
  'field.strength-clamp': [{ strength: 99 }, 48, 64, 19],
  'field.tiny-canvas-cluster': [{ strength: 3 }, 200, 200, 20],
};
const FEED_SPECS = {
  'feed.history': [{ strength: 1 }, true, 64, 31],
  'feed.no-history': [{ strength: 1 }, false, 64, 32],
  'feed.strength0': [{ strength: 0 }, true, 64, 33],
  'feed.repel': [{ strength: 2, polarity: -1 }, true, 48, 34],
  'feed.empty-tgt': [{ strength: 1 }, true, 0, 35],
};
const patchStrength = (patch) => {
  const n = Number(patch.strength);
  return Number.isFinite(n) ? n : 0.16;
};

let checked = 0;
for (const c of fixture.cases) {
  if (FIELD_SPECS[c.name]) {
    const [patch, nSrc, nTgt, seed] = FIELD_SPECS[c.name];
    const rand = mulberry32(seed);
    const tgt = makeItems(rand, nTgt, W, H);
    const src = makeItems(rand, nSrc, W, H);
    const pullPx = resolveFieldItems(tgt, src,
      { mode: 'field', from: 0, to: 1, strength: patchStrength(patch) }, W, H);
    assert.deepStrictEqual(tgt.map((it) => [it.x, it.y]), c.xy, `${c.name}: item xy drifted`);
    assert.strictEqual(pullPx, c.pullPx, `${c.name}: pullPx drifted`);
    checked++;
  } else if (FEED_SPECS[c.name]) {
    const [patch, withHistory, nTgt, seed] = FEED_SPECS[c.name];
    const feedLive = createFeedLive(W, H);
    const rand = mulberry32(seed);
    const tgt = makeItems(rand, nTgt, W, H);
    let field = null;
    if (withHistory) {
      const srcItems = makeItems(rand, 40, W, H);
      feedLive.pushSource(0, srcItems.map(toNorm));
      feedLive.commit();
      field = feedLive.delay.field(0);
    }
    const amt = patchStrength(patch) * 0.05;
    const pullPx = resolveFeedItems(tgt, field,
      { mode: 'feed', from: 0, to: 1, strength: amt }, W, H);
    assert.deepStrictEqual(tgt.map((it) => [it.x, it.y]), c.xy, `${c.name}: item xy drifted`);
    assert.strictEqual(pullPx, c.pullPx, `${c.name}: pullPx drifted`);
    checked++;
  } else if (c.name === 'pushSource.raster') {
    const feedLive = createFeedLive(W, H);
    const rand = mulberry32(41);
    const items = makeItems(rand, 96, W, H);
    feedLive.pushSourceItems(2, items, W, H);
    const buf = feedLive.delay.stageBuffer(2);
    assert.strictEqual(feedLive.w, c.w, 'raster width drifted');
    assert.strictEqual(feedLive.h, c.h, 'raster height drifted');
    assert.deepStrictEqual(Array.from(buf), c.luma, 'pushSourceItems raster drifted');
    checked++;
  } else {
    assert.fail(`unknown fixture case: ${c.name}`);
  }
}
assert.strictEqual(checked, fixture.cases.length, 'not every fixture case ran');

console.log('gl/fieldFeedColumns.selfcheck: OK (#1307)', { cases: checked });
