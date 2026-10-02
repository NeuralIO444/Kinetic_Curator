// #813 — locked-dt parity: N live JS ticks === bake N steps (JS engine).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ParticleSystem } from '../../particles.js';
import { bakeParticles, BAKE_TIME_ORIGIN, BAKE_DT_MS } from './index.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../../../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'], bg: '#000000' };
const seed = 0x1a4f;
const count = 40;
const steps = 12;
const W = 1000;
const H = 700;

function params() {
  return normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'swarm',
    particleCount: count,
    contactRadius: 0,
  });
}

function liveTicks() {
  const sys = new ParticleSystem();
  const lp = params();
  sys.init(count, W, H, assets, palette, seed);
  for (let s = 0; s < steps; s++) {
    sys.update(lp, assets, palette, seed, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
  }
  return sys.getItems(assets);
}

test('#813 JS bake N steps matches N live ticks at locked dt', () => {
  const baked = bakeParticles({
    seed,
    count,
    layoutParams: params(),
    activeAssets: assets,
    palette,
    canvasW: W,
    canvasH: H,
    steps,
    dt: BAKE_DT_MS,
    attractor: null,
    engine: 'js',
  });
  const live = liveTicks();
  assert.equal(baked.length, live.length);
  for (let i = 0; i < live.length; i++) {
    assert.ok(Object.is(baked[i].x, live[i].x), `item[${i}].x bake ${baked[i].x} live ${live[i].x}`);
    assert.ok(Object.is(baked[i].y, live[i].y), `item[${i}].y bake ${baked[i].y} live ${live[i].y}`);
  }
});
