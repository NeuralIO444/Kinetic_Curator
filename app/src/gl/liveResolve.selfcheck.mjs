/**
 * liveResolve.selfcheck.mjs — node selfcheck for the browser layer resolver (#224).
 *
 * Pins liveResolve.resolveLayers() against the resolveLayers() shape from
 * studio/render.mjs: content layers resolve to GL-renderable items
 * (assetId-bearing), FX layers pass through as markers, snapshots drive
 * non-active layers, and swarm modes advance real particle physics.
 *
 * Run: node --test src/gl/liveResolve.selfcheck.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveResolver } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';
import { createNoise } from '../engine/noise.js';

function baseInput(over = {}) {
  return {
    layers: [
      { id: 'lyr-a', name: 'A', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
      { id: 'lyr-fx', name: 'FX', visible: true, type: 'fx', layerBlendMode: 'normal', layerOpacity: 1 },
    ],
    activeLayerId: 'lyr-a',
    layerSnapshots: {},
    seed: 1234,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 40 },
    caGrid: null,
    enabledAssets: null,
    assetWeightOverrides: {},
    customAssets: [],
    quality: 'balanced',
    lockedParams: {},
    batchPaused: false,
    focusSwap: false,
    loopTimeMs: 0,
    perfClampOverride: null,
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    scaleMul: 1,
    alphaBoost: 0,
    effectiveScale: [0.5, 1.5],
    effectiveAlpha: [20, 100],
    phraseWrapGen: 0,
    attractor: null,
    ...over,
  };
}

test('content layers resolve to assetId-bearing items; fx layers are markers', () => {
  const r = createLiveResolver();
  const out = r.resolveLayers(baseInput());
  const content = out.find((l) => l.id === 'lyr-a');
  assert.ok(content && !content.isFx);
  assert.ok(Array.isArray(content.items) && content.items.length > 0);
  for (const it of content.items) {
    assert.ok(typeof it.assetId === 'string' && it.assetId.length > 0, 'item has assetId');
    assert.ok(typeof it.x === 'number' && typeof it.y === 'number');
  }
  const fx = out.find((l) => l.id === 'lyr-fx');
  assert.ok(fx && fx.isFx === true);
  assert.ok(!('items' in fx) || fx.items === undefined);
  r.dispose();
});

test('non-active layers resolve from their snapshots', () => {
  const r = createLiveResolver();
  const input = baseInput({
    layers: [
      { id: 'lyr-a', name: 'A', visible: true },
      { id: 'lyr-b', name: 'B', visible: true },
    ],
    activeLayerId: 'lyr-a',
    layerSnapshots: {
      'lyr-b': {
        seed: 999,
        paletteId: 'bone',
        paletteOverrides: null,
        layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 12 },
        caGrid: null,
        enabledAssets: null,
      },
    },
  });
  const out = r.resolveLayers(input);
  const b = out.find((l) => l.id === 'lyr-b');
  assert.equal(b.layoutParams.mode, 'grid');
  assert.ok(b.items.length > 0);
  r.dispose();
});

test('live swarm modes advance real particle physics', () => {
  const r = createLiveResolver();
  const input = baseInput({
    layers: [{ id: 'lyr-s', name: 'S', visible: true }],
    activeLayerId: 'lyr-s',
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 24 },
  });
  const a = r.resolveLayers(input);
  const b = r.resolveLayers(input);
  const pa = a[0].items.map((i) => i.x);
  const pb = b[0].items.map((i) => i.x);
  assert.equal(pa.length, pb.length);
  assert.ok(pa.length > 0);
  // Physics advanced between resolves (positions moved).
  assert.ok(pa.some((x, i) => Math.abs(x - pb[i]) > 1e-9), 'swarm moved between frames');
  for (const it of b[0].items) assert.ok(it.assetId, 'swarm item has assetId');
  r.dispose();
});

test('perfTier1 sheds mirror on every visible layer', () => {
  const r = createLiveResolver();
  const input = baseInput({
    layers: [{ id: 'lyr-a', name: 'A', visible: true }],
    perfTier1: true,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 40, mirror: true },
  });
  const out = r.resolveLayers(input);
  assert.equal(out[0].layoutParams.mirror, false);
  r.dispose();
});

test('known asset ids resolve (pool sanity)', () => {
  assert.ok(ASSETS.length > 0);
  assert.ok(ASSETS.every((a) => typeof a.id === 'string'));
});

test('#269: null layers are skipped, not thrown', () => {
  const r = createLiveResolver();
  const out = r.resolveLayers(baseInput({
    layers: [null, { id: 'lyr-a', name: 'A', visible: true }],
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'lyr-a');
  assert.ok(out[0].items.length > 0);
  r.dispose();
});

test('#269: rotate:null degrades to zero rotation', () => {
  const r = createLiveResolver();
  const out = r.resolveLayers(baseInput({
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 40, rotate: null },
  }));
  const content = out.find((l) => l.id === 'lyr-a');
  assert.ok(content.items.length > 0);
  for (const it of content.items) assert.equal(it.rotation, 0);
  r.dispose();
});

test('#269: negative particleCount floors to 0 instead of RangeError', () => {
  const r = createLiveResolver();
  const out = r.resolveLayers(baseInput({
    layers: [{ id: 'lyr-s', name: 'S', visible: true }],
    activeLayerId: 'lyr-s',
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: -50 },
  }));
  assert.equal(out[0].items.length, 0);
  r.dispose();
});

function modInput(patch) {
  return baseInput({
    layers: [
      { id: 'lyr-a', name: 'A', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
      {
        id: 'lyr-b', name: 'B', visible: true, layerBlendMode: 'normal', layerOpacity: 1,
        patch,
      },
    ],
    activeLayerId: 'lyr-a',
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', count: 30, particleCount: 30, behave: 'scatter' },
    layerSnapshots: {
      'lyr-b': {
        seed: 999,
        paletteId: 'bone',
        paletteOverrides: null,
        layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 20 },
        caGrid: null,
        enabledAssets: null,
      },
    },
  });
}

test('#343: MOD patch perturbs the target when the source track has motion', () => {
  // #457 — patch.to is a stable layer id now, not an ordinal into the
  // visible-only content list; 'lyr-a' is this test's source layer.
  const off = createLiveResolver().resolveLayers(modInput(null));
  const on = createLiveResolver().resolveLayers(modInput({ mode: 'mod', to: 'lyr-a', strength: 1 }));
  const bOff = off.find((l) => l.id === 'lyr-b');
  const bOn = on.find((l) => l.id === 'lyr-b');
  assert.equal(bOff.items.length, bOn.items.length, 'MOD does not add/remove items, only perturbs them');
  const changed = bOn.items.some((it, i) => {
    const base = bOff.items[i];
    return base && (it.scale !== base.scale || it.alpha !== base.alpha || it.x !== base.x);
  });
  assert.ok(changed, 'a swarm source with real motion perturbs the MOD target\'s scale/alpha/x');
});

test('#457: patch target resolves by stable layer id, not an ordinal into the visible-only list', () => {
  // decoy, src, target (in that array order): src is the MOD source,
  // target's patch stores src's ID. Pre-#457, patch.to was an ordinal into
  // the VISIBLE-only content list — hiding the decoy (which sits BEFORE
  // src in the stack) shifts every later layer's ordinal down by one, so
  // whatever ordinal used to mean "src" now means a different layer (or
  // the target itself). Resolving by id must be immune to this.
  const layers = (decoyVisible) => [
    { id: 'lyr-decoy', name: 'Decoy', visible: decoyVisible, layerBlendMode: 'normal', layerOpacity: 1 },
    { id: 'lyr-src', name: 'Src', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
    {
      id: 'lyr-target', name: 'Target', visible: true, layerBlendMode: 'normal', layerOpacity: 1,
      patch: { mode: 'mod', to: 'lyr-src', strength: 1 },
    },
  ];
  const mk = (decoyVisible) => baseInput({
    layers: layers(decoyVisible),
    activeLayerId: 'lyr-src',
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', count: 30, particleCount: 30, behave: 'scatter' },
    layerSnapshots: {
      'lyr-decoy': { seed: 111, paletteId: 'bone', paletteOverrides: null, layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 15 }, caGrid: null, enabledAssets: null },
      'lyr-target': { seed: 333, paletteId: 'bone', paletteOverrides: null, layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 20 }, caGrid: null, enabledAssets: null },
    },
  });
  const targetItems = (out) => out.find((l) => l.id === 'lyr-target').items;

  const decoyShown = targetItems(createLiveResolver().resolveLayers(mk(true)));
  const decoyHidden = targetItems(createLiveResolver().resolveLayers(mk(false)));
  assert.deepEqual(decoyHidden, decoyShown, 'hiding an unrelated layer earlier in the stack must not change what the patch targets');
});

test('#343: MOD is a no-op when strength is 0', () => {
  const off = createLiveResolver().resolveLayers(modInput(null));
  const zero = createLiveResolver().resolveLayers(modInput({ mode: 'mod', to: 'lyr-a', strength: 0 }));
  const bOff = off.find((l) => l.id === 'lyr-b');
  const bZero = zero.find((l) => l.id === 'lyr-b');
  for (let i = 0; i < bOff.items.length; i++) {
    assert.equal(bZero.items[i].scale, bOff.items[i].scale);
    assert.equal(bZero.items[i].alpha, bOff.items[i].alpha);
    assert.equal(bZero.items[i].x, bOff.items[i].x);
  }
});

// ── #425: focus swaps are a total non-event ────────────────────────────────
// Two layers with deliberately different bases, depths and locks. setActiveLayer
// guarantees snapshot == top-level for BOTH layers at the swap boundary, so if
// drift/weather are per-layer + swap-invariant, resolve must be per-layer
// identical before and after the click.

const A425 = { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 10, jitter: 40, lifeDrift: 0.4, displacement: 30 };
const B425 = { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 10, jitter: 90, lifeDrift: 0.2 };
const A425_LOCKS = {};
const B425_LOCKS = { jitter: true };

function input425(over = {}) {
  return {
    layers: [
      { id: 'lyr-a', name: 'A', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
      { id: 'lyr-b', name: 'B', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
    ],
    seed: 111,
    seedOffsets: null,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    caGrid: null,
    enabledAssets: null,
    assetWeightOverrides: {},
    customAssets: [],
    quality: 'balanced',
    perfClampOverride: null,
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    batchPaused: false,
    scaleMul: 1,
    alphaBoost: 0,
    effectiveScale: [0.5, 1.5],
    effectiveAlpha: [20, 100],
    phraseWrapGen: 0,
    attractor: null,
    loopTimeMs: 3360, // mid-gesture phase: every sine is off its zero crossing
    ...over,
  };
}

test('#425: per-layer life drift is byte-identical across a focus swap', () => {
  const r = createLiveResolver();
  const snapOf = (params, locks, seed) => ({
    seed, paletteId: 'bone', paletteOverrides: null, layoutParams: params,
    caGrid: null, enabledAssets: null, lockedParams: locks,
  });
  // R1: A active (top-level = A), B from its snapshot.
  const r1 = r.resolveLayers(input425({
    activeLayerId: 'lyr-a', layoutParams: A425, seed: 111, lockedParams: A425_LOCKS,
    layerSnapshots: { 'lyr-b': snapOf(B425, B425_LOCKS, 999) },
    focusSwap: false,
  }));
  // R2: the click — top-level becomes B, A moves to its snapshot.
  const r2 = r.resolveLayers(input425({
    activeLayerId: 'lyr-b', layoutParams: B425, seed: 999, lockedParams: B425_LOCKS,
    layerSnapshots: { 'lyr-a': snapOf(A425, A425_LOCKS, 111) },
    focusSwap: true,
  }));
  const a1 = r1.find((l) => l.id === 'lyr-a');
  const a2 = r2.find((l) => l.id === 'lyr-a');
  const b1 = r1.find((l) => l.id === 'lyr-b');
  const b2 = r2.find((l) => l.id === 'lyr-b');
  for (const k of ['jitter', 'displacement', 'noiseSpeed']) {
    assert.equal(a2.layoutParams[k], a1.layoutParams[k], `A's ${k} must not change on focus swap`);
    assert.equal(b2.layoutParams[k], b1.layoutParams[k], `B's ${k} must not change on focus swap`);
  }
  // Per-layer correctness, not just continuity: B's locked jitter is raw in
  // BOTH frames; A's unlocked jitter drifts from its own 40/0.4 base in both.
  assert.equal(b1.layoutParams.jitter, B425.jitter, 'locked jitter never drifts (pre-swap)');
  assert.equal(b2.layoutParams.jitter, B425.jitter, 'locked jitter never drifts (post-swap)');
  assert.notEqual(a1.layoutParams.jitter, A425.jitter, "A's unlocked jitter drifts");
  assert.notEqual(a1.layoutParams.displacement, A425.displacement, "A's unlocked displacement drifts");
  // And with it, A's world-warped item coords: same weather + same drift →
  // the warp must be identical across the swap (continuity of the render).
  assert.deepEqual(
    a2.items.map((i) => [i.x, i.y]),
    a1.items.map((i) => [i.x, i.y]),
    "A's warped item positions must not move on focus swap",
  );
  r.dispose();
});

test('#425: life drift pauses with batch exports / slowRender / low lifeDrift', () => {
  const base = {
    activeLayerId: 'lyr-a', layoutParams: A425, seed: 111, lockedParams: {},
    layerSnapshots: {},
  };
  const jit = (over) => {
    const r = createLiveResolver();
    const out = r.resolveLayers(input425({ ...base, ...over }));
    const v = out.find((l) => l.id === 'lyr-a').layoutParams.jitter;
    r.dispose();
    return v;
  };
  assert.notEqual(jit({}), A425.jitter, 'control: drift is on by default');
  assert.equal(jit({ batchPaused: true }), A425.jitter, 'batch export pauses drift');
  assert.equal(jit({ slowRender: true }), A425.jitter, 'slowRender pauses drift');
  assert.equal(
    jit({ layoutParams: { ...A425, lifeDrift: 0.01 } }),
    A425.jitter,
    'lifeDrift <= 0.01 turns drift off for that layer',
  );
});

test('#425: focus swap keeps the shared weather; a genuine reseed re-rolls it', () => {
  const r = createLiveResolver();
  const snapA = {
    seed: 111, paletteId: 'bone', paletteOverrides: null,
    layoutParams: { ...A425, lifeDrift: 0 },
    caGrid: null, enabledAssets: null, lockedParams: {},
  };
  const aActive111 = (loopTimeMs = 1000) => r.resolveLayers(input425({
    activeLayerId: 'lyr-a', layoutParams: { ...A425, lifeDrift: 0 }, seed: 111,
    lockedParams: {}, layerSnapshots: {}, focusSwap: false, loopTimeMs,
  }));
  const clickToB = (seed, focusSwap) => r.resolveLayers(input425({
    activeLayerId: 'lyr-b',
    layoutParams: { ...B425, lifeDrift: 0 },
    seed, // the swapped-in layer's different seed
    lockedParams: {},
    layerSnapshots: { 'lyr-a': snapA },
    focusSwap,
    loopTimeMs: 1000, // warp must be live (curDx != baseDx)
  }));
  const coord = (frame) => frame.find((l) => l.id === 'lyr-a').items.map((i) => `${i.x},${i.y}`).join(';');

  // #432 — the warp phase is now accumulated incrementally (real elapsed
  // loopTimeMs since the layer's last resolve), not derived fresh from the
  // absolute loopTimeMs each call. Warm it up with real elapsed time (0ms
  // -> 1000ms) before measuring, so curDx != baseDx below as intended —
  // origin/held/rerolled all then measure at the SAME loopTimeMs (1000,
  // zero further elapsed time), so the warm-started phase stays frozen
  // across them and only the reseed under test can move the reading.
  aActive111(0); // establish the field under seed 111 with A visible
  const origin = coord(aActive111());
  const held = coord(clickToB(222, true)); // click to B: top-level seed 111 → 222
  const rerolled = coord(clickToB(333, false)); // shuffle-class reseed: new seed, focusSwap false
  assert.equal(held, origin, 'focus swap must not reseed the shared weather');
  assert.notEqual(rerolled, held, 'a genuine seed change must re-roll the weather');
  r.dispose();
});

test('#419: chip morph plans once at the click, blends, then lands raw', () => {
  const r = createLiveResolver();
  const mk = (mode, loopTimeMs) => baseInput({
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode, count: 24, lifeDrift: 0 },
    mixSeconds: 0.5,
    loopTimeMs,
  });
  const lyr = (out) => out.find((l) => l.id === 'lyr-a').items;
  const before = lyr(r.resolveLayers(mk('scatter', 0)));      // baseline, sig recorded
  const start = lyr(r.resolveLayers(mk('grid', 1000)));       // chip click: plan built, t=0
  const mid = lyr(r.resolveLayers(mk('grid', 1250)));         // t=0.5, plan in use
  const done = lyr(r.resolveLayers(mk('grid', 1600)));        // past mixSeconds: landed
  const raw = lyr(createLiveResolver().resolveLayers(mk('grid', 1600)));

  assert.deepEqual(start, before, 'first frame after the click still presents the old layout');
  assert.notDeepEqual(mid, raw, 'mid-transition presents a blend, not the raw target layout');
  assert.ok(mid.every((it) => Number.isFinite(it.x) && Number.isFinite(it.y)),
    'planned blend produces finite positions every frame');
  assert.deepEqual(done, raw, 'completed morph presents the raw resolved items');
  r.dispose();
});

test('#427: adopt-on-enter — a chip into a live swarm mode starts from the prior positions, not a fresh seed scatter', () => {
  const r = createLiveResolver();
  // Same asset pool for both modes (a curated voice restricted to these
  // shapes) — the scenario matchItems' nearest-same-asset pairing is meant
  // for. A disjoint pool (e.g. default full asset set vs. murmuration's
  // organism-only subset) has no shared identity to adopt from at all,
  // which is a real but different case from what this test isolates.
  const orgAssets = ASSETS.filter((a) => /^(org_|geo_tri_)/.test(a.id)).map((a) => a.id);
  const enabledAssets = Object.fromEntries(orgAssets.map((id) => [id, true]));
  const mk = (mode, loopTimeMs) => baseInput({
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode, count: 24, particleCount: 24, lifeDrift: 0 },
    enabledAssets,
    mixSeconds: 0, // #419's morph is orthogonal to this — isolate the init-time adopt itself
    loopTimeMs,
  });
  const lyr = (out) => out.find((l) => l.id === 'lyr-a').items;

  const gridItems = lyr(r.resolveLayers(mk('grid', 0)));
  // The mode change alone changes initKey (liveResolve.mjs:swarmItems) even
  // though the seed is untouched — this is the exact #427 trigger.
  const swarmItems = lyr(r.resolveLayers(mk('murmuration', 16)));

  assert.ok(gridItems.length > 0 && swarmItems.length > 0, 'both modes produce items to compare');

  // Nearest-neighbor distance from each grid position to the swarm's
  // landing positions: a matched (same-asset) pair should land within a
  // few px (adopted, then one physics step of drift); an unmatched grid
  // item (its asset ran out of fresh same-asset slots) legitimately keeps
  // whatever fresh scatter distance it lands at. So assert on the matched
  // majority via median, not a mean the unmatched tail would mask.
  const nearestDist = (p, pool) => {
    let best = Infinity;
    for (const q of pool) {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < best) best = d;
    }
    return best;
  };
  const dists = gridItems.map((g) => nearestDist(g, swarmItems)).sort((a, b) => a - b);
  const median = dists[Math.floor(dists.length / 2)];
  assert.ok(
    median < 5,
    `most matched items should adopt within a few px of their prior position, not scatter canvas-wide (median nearest-neighbor dist ${median.toFixed(1)}px)`,
  );
  r.dispose();
});

// ── #442: regression guards for the #432 warp-phase invariants ─────────────
// #432 replaced ntLive = nt0 + loopTimeMs * noiseSpeed (proportional to
// ABSOLUTE session time) with an incrementally accumulated wp.base
// (integral of noiseSpeed over each call's own elapsed real time,
// wp.base += max(0, nowMs - wp.lastMs) * 0.001 * noiseSpeed). Both tests
// below reimplement that exact recurrence independently and assert exact
// equality against it — not a magnitude/tolerance heuristic — so a revert
// to the old formula (or a dropped clamp) fails hard, not flakily.
//
// Both exploit the same trick: a layer's FIRST live-warp resolve always
// has wp.base === 0 (freshly initialized), so ntLive === nt0 and the live
// delta (curDx - baseDx) is exactly zero there — that frame's positions
// ARE the static (pre-warp) reference, with no separate probe needed.

const WARP442_LP = { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 6, lifeDrift: 0, displacement: 40 };
const warp442Items = (out) => out.find((l) => l.id === 'lyr-a').items;
function assertWarpMatches(staticPos, after, { seed, noiseFreq, displacement, ntLive, nt0 }, msg) {
  const noise = createNoise(seed >>> 0);
  for (let i = 0; i < staticPos.length; i++) {
    const p = staticPos[i];
    const curDx = noise.fBm3D(p.x * noiseFreq, p.y * noiseFreq, ntLive, 3) * displacement;
    const curDy = noise.fBm3D(p.x * noiseFreq + 200, p.y * noiseFreq + 200, ntLive + 100, 3) * displacement;
    const baseDx = noise.fBm3D(p.x * noiseFreq, p.y * noiseFreq, nt0, 3) * displacement;
    const baseDy = noise.fBm3D(p.x * noiseFreq + 200, p.y * noiseFreq + 200, nt0 + 100, 3) * displacement;
    assert.ok(Math.abs(after[i].x - (p.x + curDx - baseDx)) < 1e-6, `item ${i} x: ${msg}`);
    assert.ok(Math.abs(after[i].y - (p.y + curDy - baseDy)) < 1e-6, `item ${i} y: ${msg}`);
  }
}

test('#442: warp phase — a mid-stream speed change is continuous (bounded by elapsed real time), not retroactive (bounded by absolute session time)', () => {
  const seed = 4242;
  const r = createLiveResolver();
  const mk = (loopTimeMs, noiseSpeed) => baseInput({ seed, layoutParams: { ...WARP442_LP, noiseSpeed }, loopTimeMs });

  // 600s of real elapsed time at speed 0.5 -- a large absolute session
  // time, exactly the regime where the pre-#432 formula misbehaved.
  warp442Items(r.resolveLayers(mk(0, 0.5)));       // establish wp at t=0
  warp442Items(r.resolveLayers(mk(600_000, 0.5)));
  // +1s at a very different speed (0.5 -> 2.8). Under the fixed formula
  // this adds only 1s * 2.8 to the phase; under the old formula this
  // single frame's speed edit would retroactively rescale the entire
  // 600s-long phase term (a jump of roughly (2.8-0.5)*600 = 1380 units --
  // the fBm decorrelates over ~1 unit, so that's an unrelated random
  // sample, not a continuous step).
  const after = warp442Items(r.resolveLayers(mk(601_000, 2.8)));

  // Static (pre-live-delta) reference, captured at noiseSpeed=2.8
  // specifically: buildPlacements' own geometry stage bakes a
  // noiseSpeed-scaled static displacement too (placement.js's
  // nt = (seed & 0xffff) * 0.02 * noiseSpeed, independent of liveResolve's
  // live warp), so the reference must match `after`'s noiseSpeed -- a
  // fresh resolver's first-ever call still has wp.base = 0 (zero live
  // delta) regardless of which noiseSpeed it's called with.
  const staticPos = warp442Items(createLiveResolver().resolveLayers(mk(0, 2.8)));

  const nt0 = (seed & 0xffff) * 0.02;
  const expectedBase = 600 * 0.5 + 1 * 2.8; // seconds elapsed * speed, per segment
  assertWarpMatches(
    staticPos, after,
    { seed, noiseFreq: WARP442_LP.noiseFreq, displacement: WARP442_LP.displacement, ntLive: nt0 + expectedBase, nt0 },
    'a mid-stream speed change must move the phase by elapsed time x the new speed, not by the whole elapsed session time',
  );
  r.dispose();
});

test('#442: warp phase — a backward loopTimeMs (a rejected/rolled-back frame, #421-style) does not rewind the accumulated phase', () => {
  const seed = 777;
  const r = createLiveResolver();
  const speed = 1;
  const mk = (loopTimeMs) => baseInput({ seed, layoutParams: { ...WARP442_LP, noiseSpeed: speed }, loopTimeMs });

  const staticPos = warp442Items(r.resolveLayers(mk(0)));       // wp.base = 0 -> static ref
  const at1000 = warp442Items(r.resolveLayers(mk(1000)));       // 1s elapsed -> wp.base = 1 * speed

  // #421-style rejected/rolled-back frame: loopTimeMs goes BACKWARD to 500.
  // The pre-#432 formula tied ntLive directly to raw loopTimeMs, so this
  // would have visibly rewound the warp; the max(0, ...) clamp must
  // instead leave the phase exactly where it was -- byte-identical
  // positions, not just "close."
  const at500 = warp442Items(r.resolveLayers(mk(500)));
  assert.deepEqual(at500, at1000, 'a backward loopTimeMs must not rewind the warp phase');

  // Resume forward past the pre-rollback high point (1000). The resolver
  // has no way to recover true wall-clock elapsed time across a rollback
  // -- loopTimeMs is its only clock -- so its own dSec = max(0, nowMs -
  // wp.lastMs) formula necessarily measures elapsed time from wherever
  // loopTimeMs last WAS (500, set by the read above), not from the
  // pre-rollback high point (1000). This is the resolver's actual,
  // verified behavior, not an idealized "straight path" -- asserting
  // against the resolver's own recurrence exactly is what makes this a
  // precise regression guard rather than a guess.
  const DELTA = 300;
  const after = warp442Items(r.resolveLayers(mk(1000 + DELTA)));
  const nt0 = (seed & 0xffff) * 0.02;
  const expectedBase = 1 * speed + ((1000 + DELTA - 500) / 1000) * speed;
  assertWarpMatches(
    staticPos, after,
    { seed, noiseFreq: WARP442_LP.noiseFreq, displacement: WARP442_LP.displacement, ntLive: nt0 + expectedBase, nt0 },
    "resuming forward after a rollback must match the resolver's own clamped-clock formula exactly",
  );
  r.dispose();
});
