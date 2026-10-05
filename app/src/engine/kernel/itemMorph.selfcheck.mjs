import assert from 'node:assert/strict';
import { matchItems, blendItems, planMorph, nodeWindow, moveFor,
  MOVE_SMEAR, MOVE_BREATH, MOVE_FADE, SMEAR_VEL, SMEAR_TRAVEL, DENSE_COUNT,
  joinMoveFor, leaveMoveFor, JOIN_POP, JOIN_WAVE, LEAVE_FADE, LEAVE_SHRINK } from './itemMorph.mjs';
// The live loop's own easing — liveResolve feeds blendItems morphEase(raw),
// so the #564 contract sweeps below must drive it the same way.
import { morphEase } from '../../gl/paletteMix.mjs';
// #951: the blends below play the plan's hero-first slot schedule, so the
// tests read each node's window from the plan's choreo — the same window
// blendItems actually plays — instead of the seeded nodeWindow.
import { choreoWindow } from './beatChoreo.mjs';

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

// ── #626: joiner/leaver pairing (obvious face / invisible face) ─────────────
// The #564 grow-from-midpoint / shrink-by-midpoint placeholders are gone:
// joiners draw a seeded entrance (pop with overshoot, or fade-up along a
// center-out wavefront); leavers exit quiet (alpha fade or shrink-out) inside
// a borrowed joiner window.

ok('#626: joiner and leaver moves are seeded, index-stable, and split', () => {
  const jm = (s) => Array.from({ length: 64 }, (_, i) => joinMoveFor(i, s));
  const lm = (s) => Array.from({ length: 64 }, (_, i) => leaveMoveFor(i, s));
  assert.deepEqual(jm(7), jm(7), 'same seed replays the same entrances');
  assert.deepEqual(lm(7), lm(7), 'same seed replays the same exits');
  assert.ok(jm(7).includes(JOIN_POP) && jm(7).includes(JOIN_WAVE), 'both entrances appear in the mix');
  assert.ok(lm(7).includes(LEAVE_FADE) && lm(7).includes(LEAVE_SHRINK), 'both quiet exits appear in the mix');
  assert.notDeepEqual(jm(7), jm(8), 'a different seed is a different show');
});

ok('#626: pop joiner punches with overshoot, then settles — alpha full throughout', () => {
  let pi = -1;
  for (let i = 0; i < 64 && pi < 0; i++) if (joinMoveFor(i, 11) === JOIN_POP) pi = i;
  assert.ok(pi >= 0, 'a pop joiner exists at seed 11');
  const to = Array.from({ length: pi + 1 }, (_, k) => ({ assetId: 'a', x: k * 10, y: 0, scale: 2, alpha: 100, key: 'k' + k }));
  const plan = planMorph([], to, 11);
  const at = (t) => blendItems([], to, t, plan).find((o) => o.key === 'k' + pi);
  const { delay, dur } = nodeWindow(pi, 11);
  // just inside its window the punch has barely started (t<=0 returns fromItems by reference, so stay > 0)
  const pre = at(delay > 0.02 ? delay - 0.01 : 0.01);
  assert.ok(pre.scale < 0.5, `starts near zero (got ${pre.scale})`);
  let peak = 0;
  for (let t = 0.01; t <= 1; t += 0.02) peak = Math.max(peak, at(t).scale);
  assert.ok(peak > 2, `punches PAST full size — the overshoot is the arrival (peak ${peak.toFixed(2)})`);
  const late = at(0.999);
  assert.ok(Math.abs(late.scale - 2) < 0.02, `settles exactly at full size (got ${late.scale})`);
  for (let t = 0.01; t <= 1; t += 0.05) assert.equal(at(t).alpha, 100, `pop never touches alpha (t=${t})`);
});

ok('#626: wave joiner fades up center-out — the middle arrives before the edge', () => {
  const to = [-200, -100, 0, 100, 200].map((x, k) => ({ assetId: 'a', x, y: 0, scale: 1, alpha: 100, key: 'w' + k }));
  let seed = -1;
  for (let s = 0; s < 500 && seed < 0; s++) {
    if (joinMoveFor(2, s) === JOIN_WAVE && joinMoveFor(0, s) === JOIN_WAVE) seed = s;
  }
  assert.ok(seed >= 0, 'found a seed with center+edge wave joiners');
  const plan = planMorph([], to, seed);
  const out = (t) => blendItems([], to, t, plan);
  const alpha = (t, k) => out(t).find((o) => o.key === 'w' + k).alpha;
  assert.ok(alpha(0.25, 2) > alpha(0.25, 0),
    `center leads the wavefront (${alpha(0.25, 2).toFixed(1)} vs edge ${alpha(0.25, 0).toFixed(1)})`);
  assert.ok(Math.abs(alpha(0.999, 2) - 100) < 0.5, 'center lands at full alpha');
  assert.ok(Math.abs(alpha(0.999, 0) - 100) < 0.5, 'edge lands at full alpha');
  for (let t = 0.01; t <= 1; t += 0.1) {
    assert.equal(out(t).find((o) => o.key === 'w2').scale, 1, `wave never touches scale (t=${t})`);
  }
});

ok('#626: leaver exits are quiet — fade touches only alpha, shrink only scale', () => {
  const from = [
    { assetId: 'a', x: 0, y: 0, scale: 3, alpha: 100, key: 'L0' },
    { assetId: 'a', x: 50, y: 0, scale: 3, alpha: 100, key: 'L1' },
  ];
  let seed = -1;
  for (let s = 0; s < 500 && seed < 0; s++) {
    if (leaveMoveFor(0, s) === LEAVE_FADE && leaveMoveFor(1, s) === LEAVE_SHRINK) seed = s;
  }
  assert.ok(seed >= 0, 'found a seed with one fade and one shrink leaver');
  const plan = planMorph(from, [], seed);
  const at = (t, k) => blendItems(from, [], t, plan).find((o) => o.key === k);
  for (let t = 0; t < 1; t += 0.05) {
    const f = at(t, 'L0');
    assert.equal(f.scale, 3, `fade never touches scale (t=${t.toFixed(2)})`);
    assert.ok(f.alpha <= 100 && f.alpha >= 0, `fade alpha stays in range (t=${t.toFixed(2)})`);
    const s = at(t, 'L1');
    assert.equal(s.alpha, 100, `shrink never touches alpha (t=${t.toFixed(2)})`);
    assert.ok(s.scale <= 3 && s.scale >= 0, `shrink scale stays in range (t=${t.toFixed(2)})`);
  }
  const w0 = nodeWindow(0, seed), w1 = nodeWindow(1, seed);
  assert.equal(at(w0.delay + w0.dur * 0.6, 'L0').alpha, 0, 'fade completes past its midpoint');
  assert.equal(at(w1.delay + w1.dur * 0.6, 'L1').scale, 0, 'shrink completes past its midpoint');
});

ok('#626: a leaver borrows a live joiner\'s window — gone while the joiner peaks', () => {
  const from = [
    { assetId: 'a', x: 0, y: 0, scale: 2, alpha: 100, key: 'F0' },
    { assetId: 'a', x: 100, y: 0, scale: 2, alpha: 100, key: 'F1' },
    { assetId: 'a', x: 200, y: 0, scale: 2, alpha: 100, key: 'F2' },
  ];
  const toPlan = [
    { assetId: 'b', x: 0, y: 0, scale: 2, alpha: 100, key: 'T0' },
    { assetId: 'b', x: 10, y: 0, scale: 2, alpha: 100, key: 'T1' },
  ];
  let seed = -1;
  for (let s = 0; s < 500 && seed < 0; s++) if (joinMoveFor(2, s) === JOIN_POP) seed = s;
  assert.ok(seed >= 0, 'found a seed with a pop joiner at index 2');
  const plan = planMorph(from, toPlan, seed);
  assert.equal(plan.onlyFrom.length, 1, 'one plan-time leaver');
  const leaverKey = plan.onlyFrom[0].key;
  // the live list grows mid-transition (a MIX count step): a new unmatched
  // target appears alongside the plan-time leaver
  const toLive = [...toPlan, { assetId: 'b', x: 20, y: 0, scale: 2, alpha: 100, key: 'T2' }];
  const out = (t) => blendItems(from, toLive, t, plan);
  const w = nodeWindow(2, seed); // the borrowed window (pop joiner at index 2)
  const tMid = w.delay + w.dur * 0.6;
  const gone = out(tMid).find((o) => o.key === leaverKey);
  const goneVal = leaveMoveFor(3, seed) === LEAVE_FADE ? gone.alpha : gone.scale;
  assert.equal(goneVal, 0, 'leaver fully exited inside the borrowed window');
  const joiner = out(tMid).find((o) => o.key === 'T2');
  assert.ok(joiner.scale > 2, `joiner at peak punch while the leaver vanishes (scale ${joiner.scale.toFixed(2)})`);
  const early = out(w.delay + w.dur * 0.1).find((o) => o.key === leaverKey);
  const earlyVal = leaveMoveFor(3, seed) === LEAVE_FADE ? early.alpha : early.scale;
  assert.ok(earlyVal > 0, 'leaver still visible early in the window');
});

ok('#626: mirror doubling rides the joiner path — the doubled half grows in staggered', () => {
  const from = [{ assetId: 'a', x: 100, y: 0, scale: 2, alpha: 100, key: 'orig' }];
  const to = [
    { assetId: 'a', x: 100, y: 0, scale: 2, alpha: 100, key: 'orig' },
    { assetId: 'a', x: 900, y: 0, scale: 2, alpha: 100, key: 'orig-m', _mirrored: true },
  ];
  const plan = planMorph(from, to, 9);
  assert.equal(plan.pairs.length, 1, 'the original matches its slot');
  assert.equal(plan.onlyTo.length, 1, 'the mirrored copy is an unmatched joiner');
  const jm = joinMoveFor(1, 9);
  const early = blendItems(from, to, 0.05, plan).find((o) => o.key === 'orig-m');
  if (jm === JOIN_POP) assert.ok(early.scale < 2, `pop starts small, not full-size (got ${early.scale})`);
  else assert.ok(early.alpha < 100, `wave starts transparent, not full-size (got ${early.alpha})`);
  const late = blendItems(from, to, 0.999, plan).find((o) => o.key === 'orig-m');
  assert.ok(Math.abs(late.scale - 2) < 0.02 && Math.abs(late.alpha - 100) < 0.5, 'doubled node lands full');
});

ok('#626 contract: every joiner has landed by t->1 — no held frames', () => {
  for (const seed of [0, 1, 7, 4096]) {
    const to = Array.from({ length: 48 }, (_, k) => ({
      assetId: 'a', x: (k % 8) * 100, y: Math.floor(k / 8) * 100, scale: 2, alpha: 100, key: 'j' + k,
    }));
    const plan = planMorph([], to, seed);
    const out = blendItems([], to, 0.999, plan);
    for (const o of out) {
      assert.ok(Math.abs(o.scale - 2) < 0.02, `joiner ${o.key}@${seed} at full scale (got ${o.scale})`);
      assert.ok(Math.abs(o.alpha - 100) < 0.5, `joiner ${o.key}@${seed} at full alpha (got ${o.alpha})`);
    }
  }
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
  return sweepT(from, to, mixSeconds, seed).frames.map((f) => f.items);
}

/** Same sweep, but each frame carries its eased t (for per-node window math). */
function sweepT(from, to, mixSeconds, seed = 0) {
  const plan = planMorph(from, to, seed);
  const step = 1 / (60 * mixSeconds);
  const frames = [];
  for (let raw = 0; raw <= 1 + 1e-9; raw += step) {
    const t = morphEase(Math.min(1, raw));
    frames.push({ t, items: t >= 1 ? to : blendItems(from, to, t, plan) });
  }
  return { plan, frames };
}

const costume = (it) => `${it.assetId}|${it.color}|${it.accent}`;

// ── #623: the move vocabulary's transition contract ─────────────────────────
// #564's "swap at zero scale" is gone. The contract is now: every node swaps
// its costume exactly once, at its own move's lowest-visibility moment
// (u=0.5 — peak stretch, bottom of the breath, bottom of the fade), and no
// move ever takes a node to zero. Same seed replays the same choreography.

const travelerFrom = [{ assetId: 'a', key: 'f0', x: 0, y: 0, scale: 1, rotation: 0, alpha: 100, color: '#111111', accent: '#222222' }];
const travelerTo = [{ assetId: 'b', key: 't0', x: 1000, y: 0, scale: 1, rotation: 0, alpha: 100, color: '#eeeeee', accent: '#dddddd' }];

/** Per-node swap frame + its window progress then. Grid fixtures pair 1:1, so out[i] is node i. */
function swapUs(from, to, mixSeconds, seed) {
  const { plan, frames } = sweepT(from, to, mixSeconds, seed);
  const out = [];
  for (let i = 0; i < to.length; i++) {
    const was = costume(frames[0].items[i]);
    // #951: the window blendItems actually played — the plan's choreo slot.
    const { delay, dur } = choreoWindow(plan.choreo.slots[i], i, seed);
    let found = -1;
    for (let f = 1; f < frames.length; f++) {
      if (costume(frames[f].items[i]) !== was) { found = f; break; }
    }
    assert.ok(found > 0, `node ${i} swaps exactly once`);
    for (let f = found + 1; f < frames.length; f++) {
      assert.equal(costume(frames[f].items[i]), costume(frames[found].items[i]), `node ${i}: one swap only`);
    }
    out.push({ f: found, u: (frames[found].t - delay) / dur, items: frames[found].items });
  }
  return out;
}

ok('#623: move picks are seeded, index-stable, and role-driven', () => {
  const a = [0, 1, 2, 3, 4, 5].map((i) => moveFor(i, 7, 0, false));
  const b = [0, 1, 2, 3, 4, 5].map((i) => moveFor(i, 7, 0, false));
  assert.deepEqual(a, b, 'same seed replays the same choreography');
  const c = [0, 1, 2, 3, 4, 5].map((i) => moveFor(i, 8, 0, false));
  assert.notDeepEqual(a, c, 'a different seed is a different choreography');
  assert.ok(a.includes(MOVE_BREATH) && a.includes(MOVE_FADE), 'sitters split breath/fade, not one move');
  for (let i = 0; i < 8; i++) {
    assert.equal(moveFor(i, 7, SMEAR_TRAVEL + 1, false), MOVE_SMEAR, `traveler ${i} smears`);
    assert.equal(moveFor(i, 7, 0, true), MOVE_FADE, `dense sitter ${i} fades`);
  }
});

ok('#623: every swap lands on its move\'s lowest-visibility moment (u=0.5)', () => {
  for (const [label, from, to] of [['sitters', gridFrom, gridTo], ['travelers', travelerFrom, travelerTo]]) {
    const seed = 7;
    const swaps = swapUs(from, to, 2, seed);
    const dense = to.length >= DENSE_COUNT;
    // widest single-frame window-progress step, for the "first frame at/after
    // the minimum" slop — per node, since #951 gives each its own window
    const { plan, frames } = sweepT(from, to, 2, seed);
    const durs = to.map((_, i) => choreoWindow(plan.choreo.slots[i], i, seed).dur);
    let maxDu = 0;
    for (let f = 1; f < frames.length; f++) {
      const step = frames[f].t - frames[f - 1].t;
      for (const d of durs) maxDu = Math.max(maxDu, step / d);
    }
    for (let i = 0; i < to.length; i++) {
      const { u, items } = swaps[i];
      assert.ok(u >= 0.5 - 1e-9, `${label} node ${i}: never swaps before the minimum (u=${u})`);
      assert.ok(u <= 0.5 + maxDu + 0.02, `${label} node ${i}: swaps promptly at the minimum (u=${u})`);
      // the envelope is AT its minimum on the nearest frame to u=0.5
      const travel = Math.hypot(to[i].x - from[i].x, to[i].y - from[i].y);
      const move = moveFor(i, seed, travel, dense);
      const it = items[i];
      if (move === MOVE_BREATH) {
        assert.ok(it.scale > 0.3 && it.scale < 0.7, `${label} node ${i}: breath bottom ~0.4 (got ${it.scale})`);
        assert.ok(it.alpha > 90, `${label} node ${i}: breath never dims (got ${it.alpha})`);
      } else if (move === MOVE_FADE) {
        assert.ok(it.alpha > 5 && it.alpha < 30, `${label} node ${i}: fade bottom ~15 (got ${it.alpha})`);
        assert.ok(Math.abs(it.scale - 1.25) < 0.2, `${label} node ${i}: fade never scales (got ${it.scale})`);
      } else {
        assert.ok(it.alpha > 55 && it.alpha < 85, `${label} node ${i}: smear dips ~30% (got ${it.alpha})`);
        assert.ok(Math.hypot(it.vx || 0, it.vy || 0) > SMEAR_VEL * 0.5,
          `${label} node ${i}: stretched along travel at the swap`);
      }
    }
  }
});

ok('#623: no move ever hits zero — the uniform shrink wave is gone', () => {
  for (const seed of [7, 99]) {
    for (const items of sweep(gridFrom, gridTo, 2, seed)) {
      for (const it of items) {
        assert.ok(it.scale > 0.2, `scale never near zero (got ${it.scale})`);
        assert.ok(it.alpha > 5, `alpha never near zero (got ${it.alpha})`);
      }
    }
  }
  // smear never touches scale at all; breath never dims
  for (const { items } of sweepT(travelerFrom, travelerTo, 2, 7).frames) {
    assert.ok(Math.abs(items[0].scale - 1) < 0.02, `smear keeps full scale (got ${items[0].scale})`);
  }
});

ok('#623 known ceiling: fewer frames land the swap farther from the minimum', () => {
  // The swap hides by SAMPLING the minimum: a sub-second MIX has too few
  // frames per window to land near u=0.5 — the same ceiling #564 had, now
  // measured per move instead of in residual scale.
  const worst = (mix) => Math.max(...swapUs(gridFrom, gridTo, mix, 7).map((s) => Math.abs(s.u - 0.5)));
  const short = worst(0.25), long = worst(4);
  assert.ok(short > long, `fewer frames = farther from the minimum (${short.toFixed(3)} vs ${long.toFixed(3)})`);
  assert.ok(long < 0.03, `a 4s MIX lands the swap on the minimum (${long.toFixed(4)})`);
});

ok('#623: fast travel happens mid-move, never at rest visibility', () => {
  // A 1000px traveler smears: its fastest hop must land while dimmed and
  // stretched — the eye follows the smear, it never sees a full-size jump.
  const { frames } = sweepT(travelerFrom, travelerTo, 2, 7);
  let maxHop = 0, at = null;
  for (let f = 1; f < frames.length; f++) {
    const hop = Math.abs(frames[f].items[0].x - frames[f - 1].items[0].x);
    if (hop > maxHop) { maxHop = hop; at = frames[f].items[0]; }
  }
  assert.ok(maxHop > 5, `the node actually travels (peak hop ${maxHop.toFixed(1)}px)`);
  assert.ok(at.alpha <= 80, `fastest hop happens while dimmed (alpha ${at.alpha.toFixed(1)})`);
  assert.ok(Math.hypot(at.vx || 0, at.vy || 0) > 1, '...and stretched along its travel');
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

// ── #572: the pairing must stay the SAME pairing, just not O(n^3) ──────────
// Oracle: the pre-#572 nested-loop greedy, verbatim in behaviour (global
// nearest, first in row-major order on a tie, per asset group then a spatial
// cross-asset pass). Fixtures use small integer coords on purpose — dense
// distance ties are where a spatial index quietly diverges.
function oraclePlan(fromItems, toItems) {
  const group = (items) => {
    const g = new Map();
    for (const it of items) {
      const k = it.assetId || it.role || 'default';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(it);
    }
    return g;
  };
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const greedy = (fs, ts, pairs) => {
    while (fs.length && ts.length) {
      let bi = 0, bj = 0, bd = Infinity;
      for (let i = 0; i < fs.length; i++) for (let j = 0; j < ts.length; j++) {
        const d = d2(fs[i], ts[j].item);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
      pairs.push({ f: fs[bi], g: ts[bj].g, j: ts[bj].origIdx });
      fs.splice(bi, 1); ts.splice(bj, 1);
    }
  };
  const fg = group(fromItems), tg = group(toItems);
  const pairs = [], lf = [], lt = [];
  for (const k of new Set([...fg.keys(), ...tg.keys()])) {
    const fs = (fg.get(k) || []).slice();
    const ts = (tg.get(k) || []).map((item, origIdx) => ({ item, origIdx, g: k }));
    greedy(fs, ts, pairs);
    lf.push(...fs); lt.push(...ts);
  }
  greedy(lf, lt, pairs);
  return { pairs, onlyFrom: lf, onlyTo: lt.map((t) => ({ g: t.g, j: t.origIdx })) };
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

ok('#572: planMorph pairs exactly like the old O(n^3) greedy (ties, mixed assets, uneven sides)', () => {
  const rnd = lcg(572);
  for (let trial = 0; trial < 60; trial++) {
    const assets = ['a', 'b', 'c'].slice(0, 1 + Math.floor(rnd() * 3));
    const span = trial % 3 === 0 ? 4 : trial % 3 === 1 ? 40 : 1000; // tiny span = tie storm
    const mk = (cnt) => Array.from({ length: cnt }, () => ({
      assetId: assets[Math.floor(rnd() * assets.length)],
      x: Math.floor(rnd() * span), y: Math.floor(rnd() * span),
    }));
    const from = mk(1 + Math.floor(rnd() * 40)), to = mk(1 + Math.floor(rnd() * 40));
    const want = oraclePlan(from, to);
    const got = planMorph(from, to, 7);
    assert.deepEqual(got.pairs, want.pairs, `pairs, trial ${trial}`);
    assert.deepEqual(got.onlyFrom, want.onlyFrom, `onlyFrom, trial ${trial}`);
    assert.deepEqual(got.onlyTo, want.onlyTo, `onlyTo, trial ${trial}`);
  }
});

ok('#572: planMorph survives empty sides, coincident points and non-finite coords', () => {
  assert.deepEqual(planMorph([], []).pairs, []);
  assert.equal(planMorph([{ assetId: 'a', x: 1, y: 1 }], []).onlyFrom.length, 1);
  assert.equal(planMorph([], [{ assetId: 'a', x: 1, y: 1 }]).onlyTo.length, 1);
  const same = Array.from({ length: 12 }, () => ({ assetId: 'a', x: 5, y: 5 }));
  assert.equal(planMorph(same, same).pairs.length, 12);
  const junk = [{ assetId: 'a', x: NaN, y: 3 }, { assetId: 'a', x: 1, y: Infinity }];
  const p = planMorph(junk, junk);
  assert.equal(p.pairs.length, 2, 'garbage coordinates still terminate with a full pairing');
});

ok('#572: an 800-count plan is one cheap pass, not a mid-set hitch', () => {
  const rnd = lcg(800);
  const mk = () => Array.from({ length: 800 }, () => ({
    assetId: ['a', 'b', 'c', 'd'][Math.floor(rnd() * 4)], x: rnd() * 1920, y: rnd() * 1080,
  }));
  const from = mk(), to = mk();
  planMorph(from, to); // warm
  const t0 = performance.now();
  const plan = planMorph(from, to);
  const ms = performance.now() - t0;
  assert.equal(plan.pairs.length, 800);
  // The old loop is seconds at this size; the budget is one frame with wide slack for CI.
  assert.ok(ms < 100, `800-count plan took ${ms.toFixed(1)}ms`);
});

// ── #951: hero-first, beat-quantized choreography ──────────────────────────
// The largest mark leads on the downbeat; the chorus follows on 16th-note
// slots ordered by distance from the hero. Per-mark color shifts (the
// costume swap at u=0.5) ride the same windows, staggered, never faded.

ok('#951: planMorph carries the hero-first slot schedule', () => {
  const to = [
    { assetId: 'a', x: 0, y: 0, scale: 1 },
    { assetId: 'a', x: 100, y: 0, scale: 9 },
    { assetId: 'a', x: 1000, y: 0, scale: 1 },
  ];
  const plan = planMorph([], to, 5);
  assert.equal(plan.choreo.hero, 1, 'largest mark is the hero');
  assert.equal(plan.choreo.slots[1], 0, 'hero moves on beat 1 (slot 0)');
  assert.ok(plan.choreo.slots[0] >= 1 && plan.choreo.slots[2] >= 1, 'chorus follows');
  assert.ok(plan.choreo.slots[0] <= plan.choreo.slots[2], 'nearer the hero, earlier the slot');
});

ok('#951: the hero is mid-move while the far chorus still waits', () => {
  const mkIt = (x, scale, key) => ({ assetId: 'a', key, x, y: 0, scale, rotation: 0, alpha: 100 });
  const from = [mkIt(-60, 1, 'h'), mkIt(100, 1, 'a'), mkIt(900, 1, 'b')];
  const to = [mkIt(0, 8, 'h'), mkIt(100, 1, 'a'), mkIt(900, 1, 'b')];
  const plan = planMorph(from, to, 5);
  assert.equal(plan.choreo.hero, 0);
  // hero slot 0 (delay 0), far mark b in the last chorus slot (delay 0.375)
  assert.equal(plan.choreo.slots[2], 3);
  const t = 0.2; // hero well into its window; b hasn't started
  const out = blendItems(from, to, t, plan);
  const hero = out.find((o) => o.key === 'h');
  const far = out.find((o) => o.key === 'b');
  assert.ok(hero.x > -60, `hero is traveling (x=${hero.x.toFixed(1)})`);
  assert.equal(far.x, 900, 'far chorus has not started yet');
});

ok('#951: every choreo window still closes by t=1 — the handoff holds no frame', () => {
  for (const seed of [0, 7, 12345]) {
    const to = Array.from({ length: 64 }, (_, i) => ({ x: i * 13 % 500, y: i * 7 % 300, scale: 1 + (i % 5) }));
    const plan = planMorph([], to, seed);
    for (let i = 0; i < to.length; i++) {
      const { delay, dur } = choreoWindow(plan.choreo.slots[i], i, seed);
      assert.ok(delay + dur <= 1 + 1e-9, `node ${i}@${seed} closes by t=1`);
    }
  }
  // …and the blend actually lands: last frame before handoff is the target pose
  const to = Array.from({ length: 24 }, (_, i) => ({ assetId: 'a', key: 'q' + i, x: i * 40, y: 0, scale: 2, alpha: 100 }));
  const from = to.map((o) => ({ ...o, x: o.x + 200 }));
  const plan = planMorph(from, to, 9);
  const last = blendItems(from, to, 0.9999, plan);
  for (let i = 0; i < to.length; i++) {
    assert.ok(Math.abs(last[i].x - to[i].x) < 1, `node ${i} has landed before the handoff`);
  }
});

console.log(`itemMorph.selfcheck: ${fail === 0 ? 'OK' : 'FAIL'} (${n - fail}/${n})`);
if (fail) process.exit(1);
