// node src/engine/cultureFluid.selfcheck.mjs
// CULTURE Phase 1, slice K1 (the parent issue 2186) — the dish fluid as the culture world's medium.
//   1. the medium is born with the world: the Gray-Scott field at the shared grid, seeded from the
//      world seed alone, its published density at the same grid
//   2. step consumption: the fluid steps only from the world's fixed clock — its step count is a
//      pure function of the world step count, under matched and irregular feeds alike
//   3. determinism on the JS fallback path: the same feed sequence reproduces the world AND the
//      medium bit-for-bit; the cadence boundary is exact (an odd world step moves no fluid)
//   4. stability + character soak: minutes of sim time stay finite, in range, and in the standing
//      coral regime — grown from the inoculation, neither dead nor saturated
//   5. gate-off inertness: no world stands, so no medium exists anywhere; importing this slice's
//      modules creates nothing
//   6. simLaw honesty: the fluid's backend is a simBackends fluid id; a JS backend carries
//      'js-exact', a GPU backend carries 'decisions-exact', and an unknown id is refused — the
//      stamp can never claim exactness for a device-dependent kernel
import assert from 'node:assert/strict';
import {
  CULTURE_FLUID_STEP_DIVISOR,
  CULTURE_FLUID_BACKEND,
  CULTURE_FLUID_GPU_BACKEND,
  createCultureWorld,
  stepCultureWorld,
  advanceCultureWorld,
  cultureWorldHash,
  cultureWorldSimLaw,
  setCultureFluidBackend,
  cultureFluidDensity,
  standingCultureWorld,
} from './cultureWorld.mjs';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';
import { FLUID_GRID_COLS, FLUID_GRID_ROWS, fluidHash, fluidMeanDensity } from './dishFluid.mjs';
import { KNOWN_SIM_BACKENDS, simLawFor } from './kernel/simBackends.js';
import { mkRng } from './prng.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};

// 1 — the medium is born with the world.
{
  assert.equal(FLUID_GRID_COLS, STAGE_COLS, 'the fluid grid IS the shared stage grid (no resampling)');
  assert.equal(FLUID_GRID_ROWS, STAGE_ROWS);
  const w = createCultureWorld({ seed: 42 });
  assert.equal(w.fluid.cols, STAGE_COLS);
  assert.equal(w.fluid.rows, STAGE_ROWS);
  assert.equal(w.fluid.step, 0, 'the medium is born unstepped');
  assert.ok(fluidMeanDensity(w.fluid) > 0.03, 'the inoculation stands at birth: the dish is seeded, not empty');
  for (let i = 0; i < w.fluid.u.length; i++) {
    assert.ok(w.fluid.u[i] >= 0 && w.fluid.u[i] <= 1, 'U in range at birth');
    assert.ok(w.fluid.v[i] >= 0 && w.fluid.v[i] <= 1, 'V in range at birth');
  }
  const d = cultureFluidDensity(w);
  assert.ok(d instanceof Float32Array);
  assert.equal(d.length, STAGE_COLS * STAGE_ROWS, 'the published density is at the shared grid');
  assert.deepEqual([...d], [...w.fluid.v], 'at the native grid the publication is the V phase itself');

  const same = createCultureWorld({ seed: 42 });
  assert.equal(fluidHash(same.fluid), fluidHash(w.fluid), 'the same world seed seeds the same medium');
  const other = createCultureWorld({ seed: 43 });
  assert.notEqual(fluidHash(other.fluid), fluidHash(w.fluid), 'a different world seed seeds a different medium');
  ok('the medium is born with the world: shared grid, seeded from the world seed, density published');
}

// 2 — step consumption: the fluid eats world steps, at the divisor cadence, and no other way.
{
  assert.equal(CULTURE_FLUID_STEP_DIVISOR, 2, '120 Hz world, 60 steps/s medium — the dish grid tempo');
  const w = createCultureWorld({ seed: 5 });
  stepCultureWorld(w);
  assert.equal(w.step, 1);
  assert.equal(w.fluid.step, 0, 'an odd world step moves no fluid');
  stepCultureWorld(w);
  assert.equal(w.fluid.step, 1, 'the second world step steps the medium once');

  const w2 = createCultureWorld({ seed: 5 });
  for (let i = 0; i < 60; i++) advanceCultureWorld(w2, 1 / 60);
  assert.equal(w2.step, 120, 'sixty 60 Hz frames run 120 world steps');
  assert.equal(w2.fluid.step, 60, 'one sim-second of world steps runs exactly 60 fluid steps');

  // Under an irregular feed the invariant is exact, not approximate: fluid steps are a pure
  // function of the world step count, however the time arrived.
  const rng = mkRng(0xf111d);
  const w3 = createCultureWorld({ seed: 5 });
  for (let i = 0; i < 600; i++) {
    advanceCultureWorld(w3, 0.001 + rng() * 0.049);
    assert.equal(
      w3.fluid.step,
      Math.floor(w3.step / CULTURE_FLUID_STEP_DIVISOR),
      'fluid steps == floor(world steps / divisor) at every point of the feed',
    );
  }
  ok('step consumption: floor(world.step / divisor) at every instant, matched or irregular feeds');
}

// 3 — determinism on the JS fallback path.
{
  const rng = mkRng(0xc017);
  const feeds = [];
  for (let i = 0; i < 600; i++) feeds.push(0.001 + rng() * 0.049);
  const a = createCultureWorld({ seed: 42 });
  const b = createCultureWorld({ seed: 42 });
  for (const dt of feeds) {
    advanceCultureWorld(a, dt);
    advanceCultureWorld(b, dt);
  }
  assert.ok(a.fluid.step > 100, 'the soak actually stepped the medium');
  assert.equal(fluidHash(a.fluid), fluidHash(b.fluid), 'the medium reproduces bit-for-bit');
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'and so does the world that carries it');

  // The cadence boundary, exactly: from an even world step, ONE more world step changes the
  // world (its clock) but not the medium; the NEXT one moves the medium.
  const c = createCultureWorld({ seed: 42 });
  for (const dt of feeds) advanceCultureWorld(c, dt);
  while (c.step % CULTURE_FLUID_STEP_DIVISOR !== 0) stepCultureWorld(c);
  const hFluid = fluidHash(c.fluid);
  stepCultureWorld(c);
  assert.equal(fluidHash(c.fluid), hFluid, 'an off-cadence world step leaves the medium untouched');
  stepCultureWorld(c);
  assert.notEqual(fluidHash(c.fluid), hFluid, 'the on-cadence step moves it');
  ok('determinism: identical feeds reproduce the medium bit-for-bit; the cadence boundary is exact');
}

// 4 — stability + character soak: two sim-minutes of medium.
{
  const birth = createCultureWorld({ seed: 42 });
  const birthMean = fluidMeanDensity(birth.fluid);
  const t0 = Date.now();
  const w2 = createCultureWorld({ seed: 42 });
  for (let i = 0; i < 120 * 60; i++) advanceCultureWorld(w2, 1 / 60);
  assert.equal(w2.step, 120 * 120, 'two sim-minutes at 120 Hz');
  assert.equal(w2.fluid.step, 120 * 60, 'two sim-minutes at 60 steps/s');
  let finite = true;
  let inRange = true;
  for (let i = 0; i < w2.fluid.u.length; i++) {
    if (!Number.isFinite(w2.fluid.u[i]) || !Number.isFinite(w2.fluid.v[i])) finite = false;
    if (w2.fluid.u[i] < 0 || w2.fluid.u[i] > 1 || w2.fluid.v[i] < 0 || w2.fluid.v[i] > 1) inRange = false;
  }
  assert.ok(finite, 'no NaN or infinity anywhere after two sim-minutes');
  assert.ok(inRange, 'both phases stay in [0, 1] — the integrator does not blow up where the JS law holds');
  const mean = fluidMeanDensity(w2.fluid);
  assert.ok(mean > birthMean, `the medium grew from its inoculation (${birthMean.toFixed(3)} → ${mean.toFixed(3)})`);
  assert.ok(mean > 0.1 && mean < 0.45, `standing coral character: mean V ${mean.toFixed(3)} in the living band`);
  console.log(`      (soak: 7,200 fluid steps in ${Date.now() - t0} ms wall, mean V ${mean.toFixed(4)})`);
  ok('stability soak: finite, in range, standing coral character after two sim-minutes');
}

// 5 — gate-off inertness: the medium exists only inside a world, and no world stands.
{
  assert.equal(standingCultureWorld(), null, 'no standing world in this process: no medium anywhere');
  const w = createCultureWorld({ seed: 1 });
  assert.equal(standingCultureWorld(), null, 'creating a world registers nothing — the shell owns standing');
  assert.ok(w.fluid, 'the medium is a part of a world instance, never a module-level singleton');
  ok('gate-off inertness: the fluid exists only as a created world’s field');
}

// 6 — simLaw honesty.
{
  assert.ok(KNOWN_SIM_BACKENDS.fluid.includes(CULTURE_FLUID_BACKEND), 'the JS id is in the simBackends vocabulary');
  assert.ok(KNOWN_SIM_BACKENDS.fluid.includes(CULTURE_FLUID_GPU_BACKEND), 'the GPU id is in the vocabulary');
  const w = createCultureWorld({ seed: 9 });
  assert.equal(w.fluidBackend, CULTURE_FLUID_BACKEND, 'a world is born on the JS reference kernel');
  assert.equal(w.simLaw, 'js-exact');
  assert.equal(cultureWorldSimLaw(w), 'js-exact', 'the composed law agrees while the fluid runs in JS');
  assert.equal(
    cultureWorldSimLaw(w),
    simLawFor({ fluid: CULTURE_FLUID_BACKEND, culture: 'js.life.v1', swarm: 'js.swarm.v1' }),
    'the composition is simLawFor itself, not a local guess',
  );

  setCultureFluidBackend(w, CULTURE_FLUID_GPU_BACKEND);
  assert.equal(w.fluidBackend, CULTURE_FLUID_GPU_BACKEND);
  assert.equal(w.simLaw, 'decisions-exact', 'a GPU fluid flips the world law in the same motion');
  assert.equal(cultureWorldSimLaw(w), 'decisions-exact', 'a device-dependent kernel is never stamped js-exact');
  setCultureFluidBackend(w, CULTURE_FLUID_BACKEND);
  assert.equal(w.simLaw, 'js-exact', 'handing the medium back to JS restores js-exact');
  assert.throws(() => setCultureFluidBackend(w, 'gpu.gs.v99'), /unknown fluid backend/, 'an unknown id is refused');
  assert.throws(
    () => setCultureFluidBackend(w, 'js.life.v1'),
    /unknown fluid backend/,
    'another kernel’s id is refused',
  );
  assert.equal(w.fluidBackend, CULTURE_FLUID_BACKEND, 'a refused change leaves the stamp untouched');
  ok('simLaw honesty: js-exact on JS, decisions-exact on GPU, unknown backends refused');
}

console.log(`cultureFluid.selfcheck: OK (${checks} groups) — CULTURE Phase 1 K1, the dish fluid as the world's medium`);
