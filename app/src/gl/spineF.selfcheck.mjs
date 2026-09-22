// spineF.selfcheck.mjs — Spine F verification (ENGINE_PLAN §3 F / NOISE_AND_LAYERS.md)
//
// 1. One shared world noise owned by resolver; domain offset per track.
// 2. Default flock / murmuration / mold / swarm = curl2 (divergence-free). Point wind for scatter / HYPE.
// 3. Live placement nt offset pass (geometry cache preserved; stills remain seed-pinned).
// 4. Organism vx/vy on _organismItems drives MOD coupling from HYPE tracks.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNoise } from '../engine/noise.js';
import { ParticleSystem } from '../engine/particles.js';
import { createLiveResolver } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const ASSETS = [{ id: 'a' }, { id: 'b' }];
const PALETTE = { id: 'bone', swatches: ['#111111', '#555555', '#999999', '#ffffff'], bg: '#000000' };

function baseInput(overrides = {}) {
  return {
    layers: [{ id: 'lyr-1', name: 'KC-1', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'lyr-1',
    seed: 12345,
    seedOffsets: null,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
    caGrid: null,
    enabledAssets: null,
    assetWeightOverrides: null,
    customAssets: null,
    quality: 'balanced',
    slowRender: false,
    scaleMul: 1,
    alphaBoost: 0,
    effectiveScale: null,
    effectiveAlpha: null,
    motionSmoothing: true,
    phraseWrapGen: 0,
    attractor: null,
    dtSec: 1 / 60,
    loopTimeMs: 1000,
    ...overrides,
  };
}

test('Spine F: curl2 provides divergence-free wind field', () => {
  const noise = createNoise(444);
  const delta = 0.25;
  let maxDiv = 0;

  // Test across a grid of points
  for (let x = 10; x <= 50; x += 10) {
    for (let y = 10; y <= 50; y += 10) {
      const z = 1.5;
      const cPlusX = noise.curl2(x + delta, y, z, delta);
      const cMinusX = noise.curl2(x - delta, y, z, delta);
      const cPlusY = noise.curl2(x, y + delta, z, delta);
      const cMinusY = noise.curl2(x, y - delta, z, delta);

      // dvx/dx + dvy/dy
      const dvx_dx = (cPlusX.x - cMinusX.x) / (2 * delta);
      const dvy_dy = (cPlusY.y - cMinusY.y) / (2 * delta);
      const divergence = Math.abs(dvx_dx + dvy_dy);
      if (divergence > maxDiv) maxDiv = divergence;
    }
  }

  // Mixed partials cancel identically: divergence of curl is identically 0
  assert.ok(maxDiv < 1e-9, `curl2 divergence must be numerically 0, got ${maxDiv}`);
});

test('Spine F: two swarm tracks share world noise with domain offset', () => {
  const r = createLiveResolver();
  const input = baseInput({
    layers: [
      { id: 'lyr-1', name: 'Swarm 1', visible: true },
      { id: 'lyr-2', name: 'Swarm 2', visible: true },
    ],
    activeLayerId: 'lyr-1',
    seed: 9876,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 20 },
    layerSnapshots: {
      'lyr-2': {
        seed: 9876,
        seedOffsets: { noise: 2 },
        paletteId: 'bone',
        layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 20 },
      },
    },
    loopTimeMs: 500,
  });

  const out = r.resolveLayers(input);
  assert.equal(out.length, 2);
  const s1 = out[0].items;
  const s2 = out[1].items;
  assert.equal(s1.length, 20);
  assert.equal(s2.length, 20);

  // Both systems ran and have non-zero velocities
  assert.ok(s1.some((it) => Math.abs(it.vx || 0) > 0 || Math.abs(it.vy || 0) > 0));
  assert.ok(s2.some((it) => Math.abs(it.vx || 0) > 0 || Math.abs(it.vy || 0) > 0));
  r.dispose();
});

test('Spine F: organism items include real vx and vy', () => {
  const ps = new ParticleSystem();
  ps.init(20, 1000, 700, ASSETS, PALETTE, 42);
  const lp = {
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'hype',
    behave: 'flock',
    particleCount: 20,
    body: 3,
    symmetry: 'bilateral',
  };

  // Run a step so particles accelerate and develop non-zero velocities
  ps.update(lp, ASSETS, PALETTE, 42, 100, null, null, 1 / 60);

  const items = ps.getItems(ASSETS);
  assert.ok(items.length > 0);

  // Every single item (bodies and wings) must carry vx and vy
  for (const it of items) {
    assert.ok(typeof it.vx === 'number', 'item must have number vx');
    assert.ok(typeof it.vy === 'number', 'item must have number vy');
    assert.ok(Number.isFinite(it.vx) && Number.isFinite(it.vy), 'vx and vy must be finite');
  }

  // At least some particles must have developed non-zero speed
  const moving = items.some((it) => Math.hypot(it.vx, it.vy) > 0.001);
  assert.ok(moving, 'organism items must have non-zero velocities after physics update');
});

test('Spine F: MOD patch coupled to HYPE organism track perturbs target knobs', () => {
  const r = createLiveResolver();
  const makeInput = (patch) => baseInput({
    layers: [
      { id: 'lyr-hype', name: 'Hype Source', visible: true },
      { id: 'lyr-target', name: 'Target', visible: true, patch },
    ],
    activeLayerId: 'lyr-hype',
    seed: 555,
    layoutParams: {
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'hype',
      behave: 'flock',
      particleCount: 30,
      body: 2,
    },
    layerSnapshots: {
      'lyr-target': {
        seed: 555,
        paletteId: 'bone',
        layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 16 },
      },
    },
    loopTimeMs: 200,
  });

  const off = r.resolveLayers(makeInput(null));
  const on = r.resolveLayers(makeInput({ mode: 'mod', to: 0, strength: 1 }));
  const zero = r.resolveLayers(makeInput({ mode: 'mod', to: 0, strength: 0 }));

  const targetOff = off.find((l) => l.id === 'lyr-target');
  const targetOn = on.find((l) => l.id === 'lyr-target');
  const targetZero = zero.find((l) => l.id === 'lyr-target');

  assert.equal(targetOff.items.length, targetOn.items.length);

  // Hype motion actively perturbs the target track
  const perturbed = targetOn.items.some((it, i) => {
    const base = targetOff.items[i];
    return it.scale !== base.scale || it.alpha !== base.alpha || it.x !== base.x;
  });
  assert.ok(perturbed, 'MOD from HYPE source must actively perturb target track');

  // Strength 0 is an exact no-op
  for (let i = 0; i < targetOff.items.length; i++) {
    assert.equal(targetZero.items[i].scale, targetOff.items[i].scale);
    assert.equal(targetZero.items[i].alpha, targetOff.items[i].alpha);
    assert.equal(targetZero.items[i].x, targetOff.items[i].x);
  }
  r.dispose();
});

test('Spine F: live displacement offset breathes with loopTimeMs; slowRender/stills match seed slice', () => {
  const r = createLiveResolver();
  const input0 = baseInput({
    layoutParams: {
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'grid',
      count: 25,
      displacement: 60,
      noiseSpeed: 0.5,
      noiseFreq: 0.005,
      // #425: this test isolates the WARP (loopTimeMs), like every other
      // determinism corpus (parity/sceneContract/phase6) — pin life drift
      // off so placement isn't breathing underneath the comparison.
      lifeDrift: 0,
    },
    loopTimeMs: 0,
    slowRender: false,
  });

  const input1 = baseInput({
    layoutParams: {
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'grid',
      count: 25,
      displacement: 60,
      noiseSpeed: 0.5,
      noiseFreq: 0.005,
      lifeDrift: 0,
    },
    loopTimeMs: 2000,
    slowRender: false,
  });

  const inputSlow = baseInput({
    layoutParams: {
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'grid',
      count: 25,
      displacement: 60,
      noiseSpeed: 0.5,
      noiseFreq: 0.005,
      lifeDrift: 0,
    },
    loopTimeMs: 2000,
    slowRender: true, // Still / paused / offline render mode
  });

  const out0 = r.resolveLayers(input0);
  const out1 = r.resolveLayers(input1);
  const outSlow = r.resolveLayers(inputSlow);

  const items0 = out0[0].items;
  const items1 = out1[0].items;
  const itemsSlow = outSlow[0].items;

  // At loopTimeMs = 0, delta from seed slice is 0, so items0 matches itemsSlow
  for (let i = 0; i < items0.length; i++) {
    assert.ok(Math.abs(items0[i].x - itemsSlow[i].x) < 1e-4, 'loopTime 0 matches seed slice');
    assert.ok(Math.abs(items0[i].y - itemsSlow[i].y) < 1e-4, 'loopTime 0 matches seed slice');
  }

  // At loopTimeMs = 2000, live warp breathes (items have moved smoothly)
  const moved = items1.some((it, i) => Math.abs(it.x - items0[i].x) > 0.01 || Math.abs(it.y - items0[i].y) > 0.01);
  assert.ok(moved, 'live displacement must move with loopTimeMs');

  r.dispose();
});

test('Spine F: mode layers with displacement shows bands slipping at different rates', () => {
  const r = createLiveResolver();
  const input = (loopTimeMs) => baseInput({
    layoutParams: {
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'layers',
      count: 50,
      displacement: 80,
      noiseSpeed: 0.5,
    },
    loopTimeMs,
    slowRender: false,
  });

  const a = r.resolveLayers(input(0))[0].items;
  const b = r.resolveLayers(input(1500))[0].items;

  // Measure motion per band (band = index % 5)
  const bandDeltas = [0, 0, 0, 0, 0];
  const bandCounts = [0, 0, 0, 0, 0];

  for (let i = 0; i < a.length; i++) {
    const band = (a[i].index ?? i) % 5;
    const dist = Math.hypot(b[i].x - a[i].x, b[i].y - a[i].y);
    bandDeltas[band] += dist;
    bandCounts[band]++;
  }

  const avgSpeeds = bandDeltas.map((sum, i) => sum / Math.max(1, bandCounts[i]));

  // Verify that bands slip at different speeds
  const diff = Math.max(...avgSpeeds) - Math.min(...avgSpeeds);
  assert.ok(diff > 0.1, `layers bands must slip at different rates, speed range diff was ${diff}`);
  r.dispose();
});
