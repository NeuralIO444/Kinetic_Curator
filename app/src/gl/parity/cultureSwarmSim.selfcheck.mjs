// node src/gl/parity/cultureSwarmSim.selfcheck.mjs — CULTURE Phase 1, slice K3 (the parent issue 2188):
// the culture world's swarm on the GPU kernel (gl/swarmSim.mjs, backend gpu.swarm.v1) against
// the world's own JS reference (engine/cultureSwarm.mjs, js.swarm.v1), over a population dealt
// into a culture world and stepped at the world's own cadence (the JS side advances ONLY
// through the world's scheduler; the kernel runs the world's standing parameters, built here
// from CULTURE_SWARM_PARAMS — independently of the host's mapping, which the host run below
// then cross-checks).
//
// THE LAW (K0 tier for this kernel, gl/swarmSim.mjs's own header): the kernel is judged
// against the JS swarm, not bitwise — float32 vs float64 differ at noise and a swarm is
// chaotic. The bar is ONE-STEP agreement to float noise (max |Δ| < 1e-3 over position and
// velocity — the bar parity/swarmSim.selfcheck set for the same comparison), then bounded
// speed / no NaN / character statistics over a long run. The GPU mirror host
// (gl/cultureSwarmHost.mjs) is held to the same one-step bar from the same birth table.
//
// Contacts: the GPU detector's agreement with its oracle is the shipped slice-2a suite's
// claim (parity/dishContacts.selfcheck); the WORLD predicate's agreement with that oracle
// is engine/cultureSwarm.selfcheck's. Neither is re-proved here.
import { createCultureWorld, stepCultureWorld, CULTURE_SWARM_STEP_DIVISOR } from '../../engine/cultureWorld.mjs';
import { CULTURE_SWARM_PARAMS, CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from '../../engine/cultureSwarm.mjs';
import { hashU01, CH } from '../../engine/kernel/rng.js';
import { openHarnessPage, closeGlDriver } from './glDriver.mjs';

const SEED = 20261122;
const N = 120;
const SWARM_STEPS = 60;

/** The same deterministic deal the engine suite uses: a fixture population from the seeded stream. */
const dealInto = (world, n) => {
  const b = world.bodies;
  for (let i = 0; i < n; i++) {
    const u = (k) => hashU01(world.seed, CH.dyn, i * 16 + k);
    b.alive[i] = 1;
    b.x[i] = 60 + u(0) * (CULTURE_SWARM_WORLD_W - 120);
    b.y[i] = 60 + u(1) * (CULTURE_SWARM_WORLD_H - 120);
    b.vx[i] = (u(2) - 0.5) * 4;
    b.vy[i] = (u(3) - 0.5) * 4;
    b.mass[i] = 0.5 + u(4) * 1.5;
    b.radius[i] = 3 + u(5) * 6;
  }
  b.count = n;
  return world;
};
const take = (b, n) => ({
  x: Array.from(b.x.subarray(0, n)),
  y: Array.from(b.y.subarray(0, n)),
  vx: Array.from(b.vx.subarray(0, n)),
  vy: Array.from(b.vy.subarray(0, n)),
  mass: Array.from(b.mass.subarray(0, n)),
  radius: Array.from(b.radius.subarray(0, n)),
});

// The JS side: a culture world advanced only through its own scheduler.
const w = dealInto(createCultureWorld({ seed: SEED }), N);
const birth = take(w.bodies, N);
let jsStep1 = null;
for (let s = 0; s < SWARM_STEPS * CULTURE_SWARM_STEP_DIVISOR; s++) {
  stepCultureWorld(w);
  if (w.bodies.step === 1 && !jsStep1) jsStep1 = take(w.bodies, N);
}
const jsFinal = take(w.bodies, N);
if (w.bodies.step !== SWARM_STEPS)
  throw new Error(`world cadence: expected ${SWARM_STEPS} swarm steps, got ${w.bodies.step}`);

// The kernel parameters, built here from the world's standing values (the host's own
// mapping is exercised separately below, so the two constructions cross-check).
const P = CULTURE_SWARM_PARAMS;
const kernelParams = {
  dtFrames: 1,
  sepR: P.sepR,
  aliR: P.aliR,
  cohR: P.cohR,
  sepW: P.sepW,
  aliW: P.aliW,
  cohW: P.cohW,
  damping: P.damping,
  maxSpeed: P.maxSpeed,
  attractor: null,
  attractStrength: 0,
  wind: null,
  bounds: 'wrap',
  canvasW: P.w,
  canvasH: P.h,
};

// The lint job's runner skips `playwright install` to stay fast (same as swarmSim.selfcheck.mjs):
// no browser there is a skip, not a failure. The selfcheck-browser job and dev machines run it.
let harness;
try {
  harness = await openHarnessPage('/parity/swarmSim.html');
} catch (e) {
  if (String(e && e.message).includes("Executable doesn't exist")) {
    console.log(
      '  [skip] GPU culture swarm vs the world JS reference: Playwright browser not installed in this environment',
    );
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
const maxDiff = (a, b) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};
const stateDiff = (a, b) => Math.max(maxDiff(a.x, b.x), maxDiff(a.y, b.y), maxDiff(a.vx, b.vx), maxDiff(a.vy, b.vy));
const maxSpeed = (s) => {
  let m = 0;
  for (let i = 0; i < s.x.length; i++) m = Math.max(m, Math.hypot(s.vx[i], s.vy[i]));
  return m;
};
const meanSpeed = (s) => {
  let sum = 0;
  for (let i = 0; i < s.x.length; i++) sum += Math.hypot(s.vx[i], s.vy[i]);
  return sum / s.x.length;
};
const centroid = (s) => {
  let x = 0;
  let y = 0;
  for (let i = 0; i < s.x.length; i++) {
    x += s.x[i];
    y += s.y[i];
  }
  return [x / s.x.length, y / s.x.length];
};
const finite = (s) => [...s.x, ...s.y, ...s.vx, ...s.vy].every(Number.isFinite);

try {
  // The kernel against the world's JS core, from the same birth table.
  const g = await page.evaluate((r) => window.__kcSwarmRun(r), {
    n: N,
    state: birth,
    steps: SWARM_STEPS,
    params: kernelParams,
    sampleAt: [1, SWARM_STEPS],
  });
  const d1 = stateDiff(jsStep1, g.samples[1]);
  check(
    'one step: GPU swarm matches the world JS core to float noise',
    d1 < 1e-3,
    `max |Δ| ${d1.toExponential(2)} (bar 1e-3)`,
  );
  const gpuFinal = g.samples[SWARM_STEPS];
  check('long run: both sides finite', finite(jsFinal) && finite(gpuFinal));
  check(
    'long run: the speed clamp holds on both sides',
    maxSpeed(jsFinal) <= P.maxSpeed + 1e-3 && maxSpeed(gpuFinal) <= P.maxSpeed + 1e-3,
    `JS ${maxSpeed(jsFinal).toFixed(3)}, GPU ${maxSpeed(gpuFinal).toFixed(3)}, clamp ${P.maxSpeed}`,
  );
  const msD = Math.abs(meanSpeed(jsFinal) - meanSpeed(gpuFinal));
  check(
    'long run: character — mean speed agrees',
    msD < 0.5,
    `JS ${meanSpeed(jsFinal).toFixed(3)} vs GPU ${meanSpeed(gpuFinal).toFixed(3)}`,
  );
  const [jx, jy] = centroid(jsFinal);
  const [gx, gy] = centroid(gpuFinal);
  const cd = Math.hypot(jx - gx, jy - gy);
  check(
    'long run: character — the populations stay in the same dish',
    cd < 100,
    `centroid distance ${cd.toFixed(1)} px`,
  );

  // The mirror host: seeded from the same birth table, stepped by the world itself in the page.
  const deal = { x: birth.x, y: birth.y, vx: birth.vx, vy: birth.vy, mass: birth.mass, radius: birth.radius };
  const h1 = await page.evaluate((r) => window.__kcCultureSwarmHostRun(r), {
    seed: SEED,
    deal,
    worldSteps: CULTURE_SWARM_STEP_DIVISOR,
  });
  check(
    'host: stamps gpu.swarm.v1 and lands on the world step',
    h1.backend === 'gpu.swarm.v1' && h1.mirrorStep === 1 && h1.swarmStep === 1,
  );
  const hd1 = h1.mirror ? stateDiff(jsStep1, h1.mirror) : Infinity;
  check(
    'host: one step matches the world JS core to float noise',
    hd1 < 1e-3,
    `max |Δ| ${hd1.toExponential(2)} (bar 1e-3)`,
  );
  const h60 = await page.evaluate((r) => window.__kcCultureSwarmHostRun(r), {
    seed: SEED,
    deal,
    worldSteps: SWARM_STEPS * CULTURE_SWARM_STEP_DIVISOR,
  });
  check(
    'host: a full run stays in lockstep and inside the laws',
    h60.mirrorStep === SWARM_STEPS &&
      h60.mirror !== null &&
      finite(h60.mirror) &&
      maxSpeed(h60.mirror) <= P.maxSpeed + 1e-3,
    `mirror step ${h60.mirrorStep} of ${SWARM_STEPS}`,
  );
} finally {
  await close();
  await closeGlDriver();
}
if (failed) {
  console.log(`cultureSwarmSim.selfcheck: FAIL (${failed} checks)`);
  process.exit(1);
}
console.log('cultureSwarmSim.selfcheck: OK — CULTURE Phase 1 K3, the GPU swarm against the world JS core');
