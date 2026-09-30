// node src/engine/particles.seekFleeSwarm.selfcheck.mjs
//
// #711 — seek/flee extend to the swarm attractor path.
//
// Before this change the chips' seekGain only reached the attractor force in
// organism (hype) mode: `seekMul` was forced to 1 off-hype, so in swarm mode
// seek / flee / cruise integrated the identical attractor force and the
// chips lied. Now the behave row's seekGain applies in every mode.
//
// This runs the real engine from the same seed with behave seek, cruise and
// flee in swarm mode against a fixed pointer attractor, and asserts:
//   1. the chips act: mean distance to the attractor orders
//      seek < cruise < flee (seek pulls, flee pushes, cruise is the 1x
//      baseline — cruise shares seek's point-wind kernel, so the ONLY
//      difference between the runs is seekMul);
//   2. nothing else moved: cruise and scatter (both point-wind, both
//      seekGain-less) integrate bit-identical swarms through the new path,
//      so every non-seek/flee verb gets exactly the force it always did —
//      no golden moves, no retuned gains;
//   3. the table contract: seek is 1.6, flee is -1.6 (flee is exactly -1 x
//      seek, per #584), every other row resolves to 1.
//
// Same-process comparison only (no recorded hashes): the swarm's output
// depends on Math.sin/cos/atan2, which V8 evaluates differently on x64 vs
// arm64 (see particles.selfcheck.mjs). Comparing runs in one process
// cancels the platform out.

import assert from 'node:assert';
import { ParticleSystem } from './particles.js';
import { resolveBehave, resolveSeekGain, BEHAVE_IDS } from './organisms/behave.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] };
const ATTRACTOR = { x: 750, y: 200 };
const COUNT = 60;
const STEPS = 120;
const SEED = 0x711;

function runSwarm(behave) {
  const sys = new ParticleSystem();
  const lp = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'swarm',
    behave,
    particleCount: COUNT,
    gravityWells: 1.0,
  });
  sys.init(COUNT, 1000, 700, assets, palette, SEED);
  for (let s = 0; s < STEPS; s++) {
    sys.update(lp, assets, palette, SEED, 1_000_000 + s * (1000 / 60), ATTRACTOR);
  }
  return sys.getItems(assets);
}

function meanDistToAttractor(items) {
  let sum = 0;
  for (const it of items) {
    sum += Math.hypot(it.x - ATTRACTOR.x, it.y - ATTRACTOR.y);
  }
  return sum / items.length;
}

// 1 — the chips act in swarm mode.
const seek = runSwarm('seek');
const cruise = runSwarm('cruise');
const flee = runSwarm('flee');
const dSeek = meanDistToAttractor(seek);
const dCruise = meanDistToAttractor(cruise);
const dFlee = meanDistToAttractor(flee);
assert.ok(
  dSeek < dCruise,
  `#711: seek should pull the swarm toward the attractor (seek ${dSeek.toFixed(1)} vs cruise ${dCruise.toFixed(1)})`,
);
assert.ok(
  dCruise < dFlee,
  `#711: flee should push the swarm away from the attractor (cruise ${dCruise.toFixed(1)} vs flee ${dFlee.toFixed(1)})`,
);

// 2 — non-seek/flee verbs are untouched: bit-identical through the new path.
const scatter = runSwarm('scatter');
assert.strictEqual(
  JSON.stringify(scatter),
  JSON.stringify(cruise),
  '#711: cruise vs scatter must integrate bit-identical swarms — the new seekMul path is identity (1) for verbs without a seekGain',
);

// 3 — the table contract: seek 1.6, flee -1.6, everything else 1.
assert.strictEqual(resolveSeekGain(resolveBehave('seek')), 1.6, 'seek gain');
assert.strictEqual(resolveSeekGain(resolveBehave('flee')), -1.6, 'flee gain');
for (const id of BEHAVE_IDS) {
  if (id === 'seek' || id === 'flee') continue;
  assert.strictEqual(
    resolveSeekGain(resolveBehave(id)), 1,
    `#711: behave '${id}' must resolve seekGain 1 (no silent force change)`,
  );
}

console.log(
  `ok — #711 seek/flee reach the swarm attractor ` +
  `(mean dist: seek ${dSeek.toFixed(1)} < cruise ${dCruise.toFixed(1)} < flee ${dFlee.toFixed(1)}), ` +
  'non-seek verbs bit-identical',
);
