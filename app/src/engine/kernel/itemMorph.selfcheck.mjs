import assert from 'node:assert/strict';
import { matchItems, blendItems, planMorph, nodeWindow } from './itemMorph.mjs';
// The live loop's own easing — liveResolve feeds blendItems morphEase(raw),
// so the #564 contract sweeps below must drive it the same way.
import { morphEase } from '../../gl/paletteMix.mjs';

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

// #564: t is no longer a node's own progress — every node runs its own seeded
// window — so a matched pair is checked where the contract is absolute: it
// leaves from the source pose and lands exactly on the target pose. Every
// window closes by t=1 (see the wave tests below), so t=0.99 is landed.
ok('blendItems lands position/scale/rotation/costume on the target by t->1', () => {
  const from = [{ assetId: 'a', x: 0, y: 0, scale: 1, rotation: 0, alpha: 100, color: '#000000', accent: '#ffffff' }];
  const to = [{ assetId: 'b', x: 100, y: 0, scale: 3, rotation: 90, alpha: 100, color: '#ffffff', accent: '#000000' }];
  const [out] = blendItems(from, to, 0.99);
  assert.ok(Math.abs(out.x - 100) < 0.1, `x landed (got ${out.x})`);
  assert.ok(Math.abs(out.scale - 3) < 0.01, `scale landed (got ${out.scale})`);
  assert.ok(Math.abs(out.rotation - 90) < 0.1, `rotation landed (got ${out.rotation})`);
  assert.equal(out.assetId, 'b', 'costume is the target asset');
  assert.equal(out.color, '#ffffff', 'colour is the target colour, never a blend of the two');
});

ok('#564: an unmatched target grows in from zero — no alpha fade', () => {
  const from = [];
  const to = [{ assetId: 'a', x: 10, y: 0, scale: 2, alpha: 100, key: 'new-1' }];
  const { delay, dur } = nodeWindow(0, 0);
  const [early] = blendItems(from, to, delay + dur * 0.4); // before its midpoint
  assert.equal(early.key, 'new-1');
  assert.equal(early.scale, 0, 'nothing on screen until its window turns over');
  assert.equal(early.alpha, 100, 'alpha untouched — the swap is scale, not opacity');
  const [late] = blendItems(from, to, 0.99);
  assert.ok(Math.abs(late.scale - 2) < 0.01, `grown to full (got ${late.scale})`);
});

ok('#564: an unmatched source shrinks out to zero — no alpha fade', () => {
  const from = [{ assetId: 'a', x: 10, y: 0, scale: 2, alpha: 100, key: 'old-1' }];
  const to = [];
  const { delay, dur } = nodeWindow(0, 0); // onlyFrom windows start at index |to| = 0 here
  const [early] = blendItems(from, to, delay + dur * 0.1);
  assert.equal(early.key, 'old-1');
  assert.ok(early.scale > 0 && early.scale <= 2, `still on screen early (got ${early.scale})`);
  assert.equal(early.alpha, 100, 'alpha untouched');
  const [late] = blendItems(from, to, delay + dur * 0.6); // past its midpoint
  assert.equal(late.scale, 0, 'gone by the midpoint, at zero scale not zero alpha');
});

ok('blendItems shortest-path angle interpolation wraps correctly', () => {
  const from = [{ assetId: 'a', x: 0, y: 0, rotation: 350 }];
  const to = [{ assetId: 'a', x: 0, y: 0, rotation: 10 }];
  // 350 -> 370(=10) is the short way: the blend must never pass through 180.
  for (let t = 0.01; t < 1; t += 0.01) {
    const [out] = blendItems(from, to, t);
    const r = ((out.rotation % 360) + 360) % 360;
    assert.ok(r >= 350 || r <= 10, `short way at t=${t.toFixed(2)} (got ${r})`);
  }
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
  // Both targets share asset group 'a', so the pair's slot index IS the
  // to-list index: 0 = 'far', 1 = 'farther'.
  assert.equal(plan.pairs[0].j, 0, 'stored plan keeps the original target');
  assert.equal(planMorph(from, toBreath).pairs[0].j, 1, 'a fresh match would flip — what #419 fixes');
  // And the blend honours the stored plan: 'farther' is the UNMATCHED target,
  // so it never travels — it sits on its own live slot and grows in there.
  const rival = blendItems(from, toBreath, 0.5, plan).find((i) => i.key === 'farther');
  assert.equal(rival.x, 10, 'unmatched rival stays on its slot, never adopted as the pair');
});

ok('#419: endpoints track LIVE targets while the plan is fixed', () => {
  const from = [{ assetId: 'a', x: 0, y: 0, alpha: 100 }];
  const plan = planMorph(from, [{ assetId: 'a', key: 'n', x: 100, y: 0, alpha: 100 }]);
  const moved = [{ assetId: 'a', key: 'n', x: 300, y: 0, alpha: 100 }];
  const [out] = blendItems(from, moved, 0.99); // landed: every window is closed
  assert.ok(Math.abs(out.x - 300) < 1, `lands on the current slot (300), not the start snapshot (100) — got ${out.x}`);
  assert.equal(out.key, 'n');
  // mid-flight it is somewhere on the line to the LIVE slot, never past it
  const mid = blendItems(from, moved, 0.5, plan)[0];
  assert.ok(mid.x >= 0 && mid.x <= 300, `mid-flight stays on the segment (got ${mid.x})`);
});

ok('#419: onlyTo grow-in resolves through a stored slot against live targets', () => {
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
  const out = blendItems(from, toBreath, 0.99, plan); // landed
  const kept = out.find((i) => i.key === 'keep');
  const added = out.find((i) => i.key === 'newB');
  assert.ok(Math.abs(kept.x - 40) < 0.5, `paired slot lands on the live target 40 (got ${kept.x})`);
  assert.ok(added, 'unmatched target still arrives via its stored slot');
  assert.equal(added.x, 60, 'it grows in on its own live slot, it does not travel');
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
  // #564: below its minimum a node still wears the SOURCE costume, so the
  // keys at t->0+ are the from-keys — in from stacking order.
  assert.deepEqual(order(0.001), ['P', 'Q', 'R'], 't->0+: same stacking as from (P,Q,R)');
  assert.deepEqual(order(0.9), ['R2', 'Q2', 'P2'], 'settled: raw to-order');
  assert.deepEqual(order(0.999), ['R2', 'Q2', 'P2']);
  // and it never jumps more than the ordering weight allows between adjacent frames
  // Stacking (not costume) is what must move gradually: compare the depth
  // order by the pairing's from-side, which the costume swap does not rename.
  const stack = (t) => blendItems(from, to, t, plan).map((i) => i.x).join();
  const seen = new Set();
  for (let t = 0.001; t < 0.9; t += 0.01) seen.add(stack(t));
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

// ── #564 SLEIGHT-OF-HAND: the director's transition contract ────────────────
// These are the invariants Matt named on the ticket, as runnable checks. They
// run against the REAL pairing the live loop uses: liveResolve feeds
// blendItems morphEase(raw), so the sweeps below do the same.

const gridFrom = Array.from({ length: 24 }, (_, i) => ({
  assetId: 'a', key: `old-${i}`, x: (i % 6) * 100, y: Math.floor(i / 6) * 100,
  scale: 1, rotation: 0, alpha: 100, color: '#111111', accent: '#222222',
}));
const gridTo = Array.from({ length: 24 }, (_, i) => ({
  assetId: 'b', key: `new-${i}`, x: (i % 6) * 100 + 30, y: Math.floor(i / 6) * 100 + 30,
  scale: 1.5, rotation: 40, alpha: 100, color: '#eeeeee', accent: '#dddddd',
}));

/** One 60fps MIX of `mixSeconds`, exactly as liveResolve drives it. */
function sweep(from, to, mixSeconds, seed = 0) {
  const plan = planMorph(from, to, seed);
  const step = 1 / (60 * mixSeconds);
  const frames = [];
  for (let raw = 0; raw <= 1 + 1e-9; raw += step) {
    const t = morphEase(Math.min(1, raw));
    frames.push(t >= 1 ? to : blendItems(from, to, t, plan));
  }
  return frames;
}

const costume = (it) => `${it.assetId}|${it.color}|${it.accent}`;

/** Largest residual size (as a fraction of full size) on any costume-swap frame. */
function worstSwapScale(mixSeconds, seed = 0) {
  const frames = sweep(gridFrom, gridTo, mixSeconds, seed);
  let worst = 0;
  for (let f = 1; f < frames.length; f++) {
    for (let i = 0; i < frames[f].length; i++) {
      const now = frames[f][i], was = frames[f - 1][i];
      if (costume(now) === costume(was)) continue;
      worst = Math.max(worst, Math.abs(now.scale) / 1.5, Math.abs(was.scale) / 1);
    }
  }
  return worst;
}

ok('#564 contract: no costume change while the node is visible', () => {
  // The envelope is exactly 0 at the swap; a frame only lands NEAR it, so the
  // residual is a sampling artefact bounded by how many frames the node's
  // half-window gets. At every MIX the instrument actually plays it is deep
  // sub-pixel. See the module header for the short-MIX ceiling.
  for (const [mix, seed] of [[4, 0], [2, 0], [2, 99], [1, 7]]) {
    const worst = worstSwapScale(mix, seed);
    assert.ok(worst < 0.02,
      `MIX ${mix}s seed ${seed}: costume flipped at ${(worst * 100).toFixed(2)}% of full size`);
  }
});

ok('#564 known ceiling: a sub-second MIX has too few frames to hide a swap', () => {
  // Documented, not fixed (module header): the residual must degrade with the
  // frame budget and nothing more — if a LONGER mix ever got worse, the
  // sampling story is wrong and the envelope is the real culprit.
  const short = worstSwapScale(0.25);
  const long = worstSwapScale(4);
  assert.ok(short > long, 'fewer frames means a larger residual, not a smaller one');
  assert.ok(long < 0.001, `a 4s MIX hides the swap completely (${long})`);
});

ok('#564 contract: never two costumes in one node — identity comes from one side', () => {
  for (const frames of [sweep(gridFrom, gridTo, 2)]) {
    for (const items of frames) {
      for (const it of items) {
        const fromSide = it.assetId === 'a' && it.color === '#111111' && it.accent === '#222222';
        const toSide = it.assetId === 'b' && it.color === '#eeeeee' && it.accent === '#dddddd';
        assert.ok(fromSide || toSide,
          `node is a blend of two costumes: ${it.assetId}/${it.color}/${it.accent}`);
      }
    }
  }
});

ok('#564 contract: zero held frames — every window closes by t=1', () => {
  for (const seed of [0, 1, 7, 4096, 0xdecafbad]) {
    for (let i = 0; i < 512; i++) {
      const { delay, dur } = nodeWindow(i, seed);
      assert.ok(delay >= 0 && dur > 0, `window ${i}@${seed} is real`);
      assert.ok(delay + dur <= 1 + 1e-12, `window ${i}@${seed} closes by t=1 (${delay + dur})`);
    }
  }
  // …so the last blended frame is already the target pose: the handoff to
  // raw toItems (liveResolve drops the transition at raw>=1) pops nothing.
  const frames = sweep(gridFrom, gridTo, 2);
  const last = frames[frames.length - 2]; // last frame still produced by the blend
  for (let i = 0; i < gridTo.length; i++) {
    assert.ok(Math.hypot(last[i].x - gridTo[i].x, last[i].y - gridTo[i].y) < 0.5,
      `node ${i} has landed before the handoff`);
    assert.ok(Math.abs(last[i].scale - gridTo[i].scale) < 0.01, `node ${i} is full size before the handoff`);
  }
});

ok('#564 contract: the stagger is a seeded, index-stable wave', () => {
  const wave = (seed) => Array.from({ length: 24 }, (_, i) => nodeWindow(i, seed));
  assert.deepEqual(wave(7), wave(7), 'same seed replays the same wave');
  assert.notDeepEqual(wave(7), wave(8), 'a different seed is a different wave');
  // It is a WAVE, not one flip: the midpoints must actually spread out.
  const mids = wave(7).map(({ delay, dur }) => delay + dur / 2).sort((a, b) => a - b);
  assert.ok(mids[mids.length - 1] - mids[0] > 0.2,
    `swaps spread across the transition (span ${mids[mids.length - 1] - mids[0]})`);
});

ok('#564 contract: per-frame motion cap — travel happens while the node is small', () => {
  const far = [{ assetId: 'a', x: 0, y: 0, scale: 1, alpha: 100, color: '#000000' }];
  const farTo = [{ assetId: 'b', x: 1000, y: 0, scale: 1, alpha: 100, color: '#ffffff' }];
  const frames = sweep(far, farTo, 2);
  let maxRaw = 0, maxVisible = 0;
  for (let f = 1; f < frames.length; f++) {
    const now = frames[f][0], was = frames[f - 1][0];
    const hop = Math.abs(now.x - was.x);
    maxRaw = Math.max(maxRaw, hop);
    maxVisible = Math.max(maxVisible, hop * Math.max(now.scale, was.scale));
  }
  // The sleight of hand: the node crosses 1000px fastest at zero scale, so
  // the hop you can actually SEE is a fraction of the hop it makes.
  assert.ok(maxVisible < maxRaw * 0.5, `visible hop ${maxVisible} is well under the raw hop ${maxRaw}`);
  assert.ok(maxVisible < 25, `visible per-frame hop stays capped (${maxVisible}px of a 1000px move)`);
});

console.log(`itemMorph.selfcheck: ${fail === 0 ? 'OK' : 'FAIL'} (${n - fail}/${n})`);
if (fail) process.exit(1);
