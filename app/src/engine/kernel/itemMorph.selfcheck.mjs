import assert from 'node:assert/strict';
import { matchItems, blendItems, planMorph } from './itemMorph.mjs';

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

ok('matchItems pairs across different assets spatially (no optical cross-fade dissolve)', () => {
  const from = [{ assetId: 'a', x: 0, y: 0 }];
  const to = [{ assetId: 'b', x: 10, y: 0 }];
  const { pairs, onlyFrom, onlyTo } = matchItems(from, to);
  assert.equal(pairs.length, 1);
  assert.equal(onlyFrom.length, 0);
  assert.equal(onlyTo.length, 0);
  assert.equal(pairs[0][0].assetId, 'a');
  assert.equal(pairs[0][1].assetId, 'b');
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

// ── #419: plan-once — pairing fixed for the transition, endpoints live ──────

ok('#419: blend with a stored plan equals a fresh-plan blend on static targets', () => {
  const from = [
    { assetId: 'a', x: 0, y: 0, scale: 1, rotation: 0, alpha: 100, color: '#000000', accent: '#ffffff' },
    { assetId: 'a', x: 100, y: 0, scale: 1, rotation: 0, alpha: 100, color: '#000000', accent: '#ffffff' },
  ];
  const to = [
    { assetId: 'a', key: 'k1', x: 10, y: 5, scale: 2, rotation: 45, alpha: 100, color: '#ffffff', accent: '#000000' },
    { assetId: 'a', key: 'k2', x: 90, y: 5, scale: 2, rotation: 45, alpha: 100, color: '#ffffff', accent: '#000000' },
  ];
  const plan = planMorph(from, to);
  assert.deepEqual(blendItems(from, to, 0.5, plan), blendItems(from, to, 0.5));
});

ok('#419: stored pairing holds when a target breathes past a nearer rival', () => {
  const from = [{ assetId: 'a', x: 0, y: 0, alpha: 100 }];
  const toStart = [
    { assetId: 'a', key: 'far', x: 100, y: 0, alpha: 100 },
    { assetId: 'a', key: 'farther', x: 200, y: 0, alpha: 100 },
  ];
  const plan = planMorph(from, toStart); // pairs to 'far' — nearest at plan time
  // breathing moves 'farther' to x=10: a per-frame re-match would flip to it
  const toBreath = [
    { assetId: 'a', key: 'far', x: 100, y: 0, alpha: 100 },
    { assetId: 'a', key: 'farther', x: 10, y: 0, alpha: 100 },
  ];
  // #444: emission is raw to-order now, so position no longer encodes
  // pairing — find the PAIRED item instead: a blend holds target alpha
  // (lerp 100..100 = 100), an unmatched fade-in sits at 100*t = 50.
  const stayed = blendItems(from, toBreath, 0.5, plan).find((i) => i.alpha === 100);
  assert.equal(stayed.key, 'far', 'stored plan keeps the original target');
  const flipped = blendItems(from, toBreath, 0.5).find((i) => i.alpha === 100);
  assert.equal(flipped.key, 'farther', 'fresh match would flip — what #419 fixes');
});

ok('#419: endpoints track LIVE targets while the plan is fixed', () => {
  const from = [{ assetId: 'a', x: 0, y: 0, alpha: 100 }];
  const plan = planMorph(from, [{ assetId: 'a', key: 'n', x: 100, y: 0, alpha: 100 }]);
  const moved = [{ assetId: 'a', key: 'n', x: 300, y: 0, alpha: 100 }];
  const [out] = blendItems(from, moved, 0.5, plan);
  assert.equal(out.x, 150, 'aims at the current slot (150), not the start snapshot (50)');
  assert.equal(out.key, 'n');
});

ok('#419: onlyTo fade-in resolves through a stored slot against live targets', () => {
  const from = [{ assetId: 'a', x: 0, y: 0, alpha: 100 }];
  const toStart = [
    { assetId: 'a', key: 'keep', x: 10, y: 0, alpha: 100 },
    { assetId: 'b', key: 'newB', x: 5, y: 0, alpha: 100 },
  ];
  const plan = planMorph(from, toStart);
  const toBreath = [
    { assetId: 'a', key: 'keep', x: 40, y: 0, alpha: 100 },
    { assetId: 'b', key: 'newB', x: 60, y: 0, alpha: 100 },
  ];
  const out = blendItems(from, toBreath, 0.5, plan);
  const kept = out.find((i) => i.key === 'keep');
  const added = out.find((i) => i.key === 'newB');
  assert.equal(kept.x, 20, 'paired slot aims at the live target (lerp 0..40)');
  assert.ok(added, 'unmatched target still fades in via its stored slot');
  assert.ok(Math.abs(added.alpha - 50) < 1e-9, 'alpha = 100 * t');
});

// ── #444: emission order — the blend must land on raw to-order ──────────────
// Draw order is array order (packInstanceData never re-sorts), and the
// completion frame drops the blend and presents raw e.items (liveResolve).
// If the blend emits in asset-group order, that handoff flips stacking in
// ONE frame — the visible z-fight at the end of every chip change. Required
// shape at every interior t: first |to| entries = raw toItems order (matched
// blends keep target identity, unmatched fade in), fade-outs trailing (they
// are ~0 alpha at completion and vanish with the transition).

ok('#444: once settled (t>=0.9) the blend emits raw to-order, fade-outs trailing', () => {
  const from = [
    { assetId: 'a', key: 'fromA', x: 0, y: 0, alpha: 100 },
    { assetId: 'a', key: 'fromA2', x: 40, y: 0, alpha: 100 },
    { assetId: 'c', key: 'fromC', x: 80, y: 0, alpha: 100 },
  ];
  const to = [
    { assetId: 'b', key: 'B1', x: 10, y: 0, alpha: 100 },
    { assetId: 'a', key: 'A1', x: 20, y: 0, alpha: 100 },
    { assetId: 'b', key: 'B2', x: 30, y: 0, alpha: 100 },
  ];
  const plan = planMorph(from, to); // group order [a, c, b] ≠ raw to order [b, a, b]
  const toKeys = to.map((i) => i.key);
  for (const t of [0.9, 0.95, 0.999]) { // settled: draw order == raw to-order
    const out = blendItems(from, to, t, plan);
    assert.deepEqual(out.slice(0, to.length).map((i) => i.key), toKeys,
      `first ${to.length} entries at t=${t} must be raw to-order`);
    for (const o of out.slice(to.length)) {
      assert.ok(!toKeys.includes(o.key),
        `trailing entry ${o.key} at t=${t} must be a fade-out, not a to-item`);
    }
  }
});

// ── draw order is continuous at the START too (chip-click z-fight) ──────────
// Old behavior: t<=0 = from order, t>0 = raw to order -> overlapping items flip
// stacking on the first blend frame. The depth key slides from-rank -> to-rank.
ok('z-fight: matched items keep from draw-order at t->0+ and reach to-order by t=0.9', () => {
  // same asset, from stacks P<Q<R (R on top); to lists them reversed, R<Q<P.
  const from = [
    { assetId: 'a', key: 'P', x: 0, y: 0, alpha: 100 },
    { assetId: 'a', key: 'Q', x: 50, y: 0, alpha: 100 },
    { assetId: 'a', key: 'R', x: 100, y: 0, alpha: 100 },
  ];
  const to = [
    { assetId: 'a', key: 'R2', x: 100, y: 0, alpha: 100 },
    { assetId: 'a', key: 'Q2', x: 50, y: 0, alpha: 100 },
    { assetId: 'a', key: 'P2', x: 0, y: 0, alpha: 100 },
  ];
  const plan = planMorph(from, to); // P->P2, Q->Q2, R->R2 (nearest)
  const order = (t) => blendItems(from, to, t, plan).map((i) => i.key);
  assert.deepEqual(order(0.001), ['P2', 'Q2', 'R2'], 't->0+: same stacking as from (P,Q,R)');
  assert.deepEqual(order(0.9), ['R2', 'Q2', 'P2'], 'settled: raw to-order');
  assert.deepEqual(order(0.999), ['R2', 'Q2', 'P2']);
  // and it never jumps more than the ordering weight allows between adjacent frames
  let prev = order(0.001).join();
  const seen = new Set([prev]);
  for (let t = 0.01; t < 0.9; t += 0.01) seen.add(order(t).join());
  assert.ok(seen.size <= 4, 'order transitions are gradual (a few swaps over the blend), not one flip');
});

ok('z-fight: fade-outs trail once settled (t>=0.9), never among the settled to-items', () => {
  const from = [
    { assetId: 'a', key: 'gone', x: 0, y: 0, alpha: 100 },
    { assetId: 'b', key: 'kept', x: 90, y: 0, alpha: 100 },
    { assetId: 'a', key: 'gone2', x: 5, y: 0, alpha: 100 },
  ];
  const to = [{ assetId: 'b', key: 'kept2', x: 92, y: 0, alpha: 100 }];
  const plan = planMorph(from, to);
  assert.equal(plan.onlyFrom.length, 2, 'two source items have no partner');
  for (const t of [0.9, 0.95, 0.999]) {
    const keys = blendItems(from, to, t, plan).map((i) => i.key);
    assert.equal(keys[0], 'kept2', `to-item first at t=${t}`);
    assert.equal(keys.length, 3);
  }
});

console.log(`itemMorph.selfcheck: ${fail === 0 ? 'OK' : 'FAIL'} (${n - fail}/${n})`);
if (fail) process.exit(1);
