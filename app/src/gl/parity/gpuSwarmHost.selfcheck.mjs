// node src/gl/parity/gpuSwarmHost.selfcheck.mjs — K3 wiring (#2188): the GPU swarm SHADOW. Pure half: the flag, the eligibility
// gate, the param mapping. GL half (skips cleanly with no Playwright browser): the shadow over a real ParticleSystem agrees with
// the JS step to float noise, skips what the kernel doesn't cover, and never changes the JS swarm.
import assert from 'node:assert/strict';
import {
  gpuSwarmWanted,
  gpuSwarmLiveWanted,
  swarmIneligibleReason,
  swarmCoreParams,
  takeoverBlocker,
} from '../gpuSwarmHost.mjs';
import { SWARM_CORE_CLOUD, ATTRACTOR_GAIN } from '../swarmSim.mjs';
import { openHarnessPage, closeGlDriver } from './glDriver.mjs';

// ---- pure: the flag (OFF by default; any one of layout param / window flag / URL turns it on)
{
  assert.equal(gpuSwarmWanted({}, null), false);
  assert.equal(gpuSwarmWanted({}, { location: { search: '' } }), false);
  assert.equal(gpuSwarmWanted({ gpuSwarm: true }, null), true, 'the per-Look layout param');
  assert.equal(gpuSwarmWanted({}, { __KC_GPU_SWARM: true }), true, 'the window flag');
  assert.equal(gpuSwarmWanted({}, { location: { search: '?a=1&gpuSwarm=1' } }), true, 'the URL override');
  assert.equal(gpuSwarmWanted({}, { location: { search: '?gpuSwarm=10' } }), false, 'exact value only');
  console.log('  [ok] the flag is off unless asked for');
}

// ---- pure: eligibility — only what the kernel fully covers
{
  const sys = { n: 10 };
  assert.equal(swarmIneligibleReason(sys, { behave: 'cruise' }, {}), null);
  assert.equal(swarmIneligibleReason({ n: 0 }, {}, {}), 'empty');
  assert.equal(swarmIneligibleReason(sys, { behave: 'flock' }, {}), 'behave');
  assert.equal(swarmIneligibleReason(sys, { contactRadius: 8 }, {}), 'contacts');
  // the resolver hands EVERY layer a dishSession and the shared scent field: neither says anything about the layer
  assert.equal(
    swarmIneligibleReason(sys, { dishSession: {}, scentField: {}, mode: 'swarm' }, {}),
    null,
    'a session / scent field alone is not a blocker',
  );
  assert.equal(swarmIneligibleReason(sys, { mode: 'hype' }, {}), 'organism', 'the organism mode is');
  assert.equal(swarmIneligibleReason(sys, { organism: true }, {}), 'organism');
  assert.equal(swarmIneligibleReason(sys, { modSteer: {} }, {}), 'modSteer');
  assert.equal(swarmIneligibleReason(sys, {}, { slowRender: true }), 'slowRender');
  console.log('  [ok] eligibility gate');
}

// ---- pure: the takeover flag, the takeover blockers
{
  assert.equal(gpuSwarmLiveWanted({}, null), false);
  assert.equal(
    gpuSwarmLiveWanted({ gpuSwarm: true }, { __KC_GPU_SWARM: true }),
    false,
    'the shadow flag is NOT the takeover',
  );
  assert.equal(gpuSwarmLiveWanted({ gpuSwarmLive: true }, null), true);
  assert.equal(gpuSwarmLiveWanted({}, { __KC_GPU_SWARM_LIVE: true }), true);
  assert.equal(gpuSwarmLiveWanted({}, { location: { search: '?gpuSwarmLive=1' } }), true);
  assert.equal(gpuSwarmLiveWanted({}, { location: { search: '?gpuSwarmLive=2' } }), false);
  const live = (extra = {}) => ({ n: 3, alive: [1, 1, 1], ax: [0, 0, 0], ay: [0, 0, 0], ...extra });
  assert.equal(takeoverBlocker(live()), null);
  assert.equal(takeoverBlocker(live({ alive: [1, 0, 1] })), 'dead');
  assert.equal(takeoverBlocker(live({ ay: [0, 0.5, 0] })), 'preforce');
  console.log('  [ok] takeover flag and blockers');
}

// ---- pure: the param mapping
{
  const ctx = { attractor: { x: 3, y: 4 }, canvasW: 1000, canvasH: 700, loopTimeMs: 2000, seedOffsets: { noise: 2 } };
  const p = swarmCoreParams(
    { behave: 'seek', gravityWells: 2, swarmCohesion: 1.1, noiseFreq: 0.01, noiseSpeed: 0.25 },
    ctx,
    { _noiseSeed: 9 },
  );
  assert.equal(p.cohW, 1.1);
  assert.equal(p.attractStrength, 2 * ATTRACTOR_GAIN * 1.6);
  assert.equal(p.damping, SWARM_CORE_CLOUD.damping);
  assert.deepEqual(p.wind, { seed: 9, freq: 0.01, offX: 200, offY: 200, nt: 2000 * 0.25 * 0.001 });
  // takeover: the kernel takes the step's real dt and the world noise's seed (a system on the shared world noise has none of its own)
  const r = swarmCoreParams({}, { ...ctx, dtSec: 1 / 30, noiseSeed: 77 }, { _noiseSeed: null });
  assert.ok(Math.abs(r.dtFrames - 2) < 1e-12 && r.wind.seed === 77);
  assert.equal(swarmCoreParams({}, ctx, { _noiseSeed: 9 }).dtFrames, 1, 'no dtSec = one frame');
  const q = swarmCoreParams({ behave: 'flee' }, { ...ctx, attractor: null }, { _noiseSeed: 9 });
  assert.equal(q.attractStrength, 0);
  assert.equal(swarmCoreParams({ behave: 'flee' }, ctx, { _noiseSeed: 9 }).attractStrength, 1 * ATTRACTOR_GAIN * -1.6);
  console.log('  [ok] param mapping');
}

let harness;
try {
  harness = await openHarnessPage('/parity/swarmSim.html');
} catch (e) {
  if (String(e && e.message).includes("Executable doesn't exist")) {
    console.log('  [skip] GPU swarm shadow: Playwright browser not installed in this environment');
    process.exit(0);
  }
  throw e;
}
const { page, close } = harness;
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  [${cond ? 'ok' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
};
try {
  const r = await page.evaluate(() => window.__kcShadowRun({ n: 200, steps: 30, seed: 0x2188 }));
  check('the shadow ran every frame', r.frames === 30 && r.toks === 30, `${r.frames} frames`);
  check(
    'every step agrees with the JS swarm to float noise',
    r.driftPosMax < 5e-3 && r.driftVelMax < 5e-3,
    `pos ${r.driftPosMax.toExponential(2)}, vel ${r.driftVelMax.toExponential(2)}`,
  );
  check(
    'it measures its own cost',
    Number.isFinite(r.gpuMsAvg) && r.gpuMsAvg > 0,
    `${r.gpuMsAvg.toFixed(2)} ms avg (software GL: not device truth)`,
  );
  // takeover: the GPU's velocities drive the system. Early on it tracks a pure-JS twin to float noise; later the two diverge as any
  // pair of float32/float64 swarms does (a neighbour crossing a force radius flips a whole force term), so the long run is judged
  // by properties, as K0 rules for sim outcomes.
  const t5 = await page.evaluate(() => window.__kcShadowRun({ n: 200, steps: 5, seed: 0x2188, live: true }));
  check('takeover applied the GPU velocities every frame', t5.applied === 5, `${t5.applied}/5`);
  check(
    'takeover tracks the pure-JS twin to float noise over 5 steps',
    t5.drift < 5e-2,
    `max |dpos| ${t5.drift.toExponential(2)} px`,
  );
  const t90 = await page.evaluate(() => window.__kcShadowRun({ n: 200, steps: 90, seed: 0x2188, live: true }));
  check(
    'takeover, 90 steps: applied every frame, finite, speed within the clamp',
    t90.applied === 90 && t90.finite && t90.speedMax <= 8 + 1e-6,
    `${t90.applied}/90, max speed ${t90.speedMax.toFixed(3)}`,
  );
  const c = await page.evaluate(() => window.__kcShadowRun({ n: 100, steps: 5, seed: 7, lp: { contactRadius: 8 } }));
  check('a layer with dish contacts is skipped, not half-simulated', c.frames === 0 && c.skipped.contacts === 5);
} finally {
  await close();
  await closeGlDriver();
}
if (failed) {
  console.error(`gpuSwarmHost.selfcheck: ${failed} FAILED`);
  process.exit(1);
}
console.log('gpuSwarmHost.selfcheck: ok — K3 wiring #2188');
