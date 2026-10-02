// #814 — contacts bake on JS, wasm refuses.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ParticleSystem } from '../../particles.js';
import { bakeParticles, BAKE_TIME_ORIGIN, BAKE_DT_MS, contactsBakePolicy } from './index.js';
import { wasmBakeEligible } from './swarmWasm.mjs';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../../../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'], bg: '#000' };
const seed = 0x51f0;
const count = 36;
const steps = 10;

function lp(extra = {}) {
  return normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'swarm',
    particleCount: count,
    contactRadius: 18,
    contactMode: 'bounce',
    contactRepel: 1.2,
    ...extra,
  });
}

test('#814 policy: contacts force JS', () => {
  const p = contactsBakePolicy(lp());
  assert.equal(p.contacts, true);
  assert.equal(p.engine, 'js');
  assert.equal(wasmBakeEligible({ layoutParams: lp(), count }).ok, false);
  assert.equal(wasmBakeEligible({ layoutParams: lp(), count }).reason, 'contacts');
});

test('#814 engine wasm + contacts throws', () => {
  assert.throws(
    () => bakeParticles({
      seed, count, layoutParams: lp(), activeAssets: assets, palette,
      canvasW: 1000, canvasH: 700, steps: 2, engine: 'wasm',
    }),
    /cannot bake this config \(contacts\)/,
  );
});

test('#814 JS bake with contacts matches live ticks', () => {
  const layoutParams = lp();
  const baked = bakeParticles({
    seed, count, layoutParams, activeAssets: assets, palette,
    canvasW: 1000, canvasH: 700, steps, dt: BAKE_DT_MS, engine: 'js',
  });
  const sys = new ParticleSystem();
  sys.init(count, 1000, 700, assets, palette, seed);
  for (let s = 0; s < steps; s++) {
    sys.update(layoutParams, assets, palette, seed, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
  }
  const live = sys.getItems(assets);
  assert.equal(baked.length, live.length);
  for (let i = 0; i < live.length; i++) {
    assert.ok(Object.is(baked[i].x, live[i].x), `x[${i}]`);
    assert.ok(Object.is(baked[i].y, live[i].y), `y[${i}]`);
  }
});
