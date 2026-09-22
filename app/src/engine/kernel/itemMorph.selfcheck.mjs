import assert from 'node:assert/strict';
import { matchItems, blendItems } from './itemMorph.mjs';

let n = 0, fail = 0;
function ok(name, fn) {
  n++;
  try { fn(); console.log(`  [ok] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

ok('matchItems pairs same-asset items nearest-first', () => {
  const from = [{ assetId: 'a', x: 0, y: 0 }, { assetId: 'a', x: 100, y: 0 }];
  const to = [{ assetId: 'a', x: 5, y: 0 }, { assetId: 'a', x: 95, y: 0 }];
  const { pairs, onlyFrom, onlyTo } = matchItems(from, to);
  assert.equal(pairs.length, 2);
  assert.equal(onlyFrom.length, 0);
  assert.equal(onlyTo.length, 0);
  // nearest-neighbor: (0,0)->(5,0), (100,0)->(95,0), not cross-paired
  const p0 = pairs.find((p) => p[0].x === 0);
  assert.equal(p0[1].x, 5);
});

ok('matchItems never pairs across different assets', () => {
  const from = [{ assetId: 'a', x: 0, y: 0 }];
  const to = [{ assetId: 'b', x: 0, y: 0 }];
  const { pairs, onlyFrom, onlyTo } = matchItems(from, to);
  assert.equal(pairs.length, 0);
  assert.equal(onlyFrom.length, 1);
  assert.equal(onlyTo.length, 1);
});

ok('matchItems handles count mismatch within one asset group', () => {
  const from = [{ assetId: 'a', x: 0, y: 0 }];
  const to = [{ assetId: 'a', x: 0, y: 0 }, { assetId: 'a', x: 50, y: 0 }];
  const { pairs, onlyFrom, onlyTo } = matchItems(from, to);
  assert.equal(pairs.length, 1);
  assert.equal(onlyFrom.length, 0);
  assert.equal(onlyTo.length, 1);
});

ok('blendItems boundary t<=0 returns fromItems by reference', () => {
  const from = [{ assetId: 'a', x: 0, y: 0 }];
  const to = [{ assetId: 'a', x: 10, y: 0 }];
  assert.equal(blendItems(from, to, 0), from);
  assert.equal(blendItems(from, to, -1), from);
});

ok('blendItems boundary t>=1 returns toItems by reference', () => {
  const from = [{ assetId: 'a', x: 0, y: 0 }];
  const to = [{ assetId: 'a', x: 10, y: 0 }];
  assert.equal(blendItems(from, to, 1), to);
  assert.equal(blendItems(from, to, 2), to);
});

ok('blendItems interpolates position/scale/rotation at t=0.5', () => {
  const from = [{ assetId: 'a', x: 0, y: 0, scale: 1, rotation: 0, alpha: 100, color: '#000000', accent: '#ffffff' }];
  const to = [{ assetId: 'a', x: 100, y: 0, scale: 3, rotation: 90, alpha: 100, color: '#ffffff', accent: '#000000' }];
  const [out] = blendItems(from, to, 0.5);
  assert.equal(out.x, 50);
  assert.equal(out.scale, 2);
  assert.equal(out.rotation, 45);
  assert.equal(out.color, '#808080');
});

ok('blendItems fades unmatched target item in, keeps its identity', () => {
  const from = [];
  const to = [{ assetId: 'a', x: 10, y: 0, alpha: 100, key: 'new-1' }];
  const [out] = blendItems(from, to, 0.25);
  assert.equal(out.key, 'new-1');
  assert.equal(out.alpha, 25);
});

ok('blendItems fades unmatched source item out, keeps it on screen mid-transition', () => {
  const from = [{ assetId: 'a', x: 10, y: 0, alpha: 100, key: 'old-1' }];
  const to = [];
  const [out] = blendItems(from, to, 0.25);
  assert.equal(out.key, 'old-1');
  assert.equal(out.alpha, 75);
});

ok('blendItems shortest-path angle interpolation wraps correctly', () => {
  const from = [{ assetId: 'a', x: 0, y: 0, rotation: 350 }];
  const to = [{ assetId: 'a', x: 0, y: 0, rotation: 10 }];
  const [out] = blendItems(from, to, 0.5);
  // 350 -> 370(=10) is the short way: midpoint is 0, not 180.
  assert.equal(((out.rotation % 360) + 360) % 360, 0);
});

console.log(`itemMorph.selfcheck: ${fail === 0 ? 'OK' : 'FAIL'} (${n - fail}/${n})`);
if (fail) process.exit(1);
