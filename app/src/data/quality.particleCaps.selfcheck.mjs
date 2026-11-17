// node src/data/quality.particleCaps.selfcheck.mjs — K3 cap ladder step 1 (#2188): the particle cap rises only under the GPU swarm.
import assert from 'node:assert/strict';
import { QUALITY_PRESETS, FINAL_CAPS, particleCapsFor } from './quality.js';
import { PARAM_SPEC } from './layout-modes.js';

// without the GPU swarm every tier is exactly what it was (same object back: nothing allocated, nothing changed)
for (const caps of [...Object.values(QUALITY_PRESETS), FINAL_CAPS]) {
  assert.equal(particleCapsFor(caps, false), caps);
}
assert.deepEqual(
  [
    QUALITY_PRESETS.high.maxParticles,
    QUALITY_PRESETS.balanced.maxParticles,
    QUALITY_PRESETS.performance.maxParticles,
    FINAL_CAPS.maxParticles,
  ],
  [350, 200, 100, 400],
  'the JS-swarm caps are untouched',
);
// under the GPU swarm: step 1 of the ladder at the top tier, each lower tier keeping its share
const hi = particleCapsFor(QUALITY_PRESETS.high, true);
assert.equal(hi.maxParticles, 1024);
assert.equal(particleCapsFor(QUALITY_PRESETS.balanced, true).maxParticles, 585);
assert.equal(particleCapsFor(QUALITY_PRESETS.performance, true).maxParticles, 293);
assert.equal(particleCapsFor(FINAL_CAPS, true).maxParticles, 1024);
// only the particle cap moves; the raised caps are cached per tier (stable identity frame to frame) and the tier is not mutated
assert.equal(hi.maxCount, QUALITY_PRESETS.high.maxCount);
assert.equal(hi.id, 'high');
assert.equal(particleCapsFor(QUALITY_PRESETS.high, true), hi);
assert.equal(QUALITY_PRESETS.high.maxParticles, 350);
// fail closed: caps without a GPU cap (or a nonsense one) come back unchanged
const bare = { maxParticles: 350 };
assert.equal(particleCapsFor(bare, true), bare);
const low = { maxParticles: 350, maxParticlesGpu: 100 };
assert.equal(particleCapsFor(low, true), low);
assert.equal(particleCapsFor(null, true), null);
// Matt, 2026-11-16: cap only, the range stays 500. So today the raise means a layer runs its full 500 instead of being cut to 350;
// going past 500 is a later, measured decision (the cap is already there for it).
assert.equal(PARAM_SPEC.particleCount.max, 500);
assert.equal(Math.min(PARAM_SPEC.particleCount.max, hi.maxParticles), 500);
console.log('quality.particleCaps.selfcheck: ok — K3 cap ladder step 1 #2188');
