// node src/gl/parity/cultureFluidSim.selfcheck.mjs — CULTURE Phase 1, slice K1 (the parent issue 2186):
// the culture world's dish fluid on the GPU kernel (gl/fluidSim.mjs, backend gpu.gs.v1) against the
// world's own JS reference (engine/dishFluid.mjs stepFluid, js.gs.v1), seeded from a culture world's
// birth field and stepped at the world's own cadence (the JS side advances through the world's
// scheduler, never by calling the kernel directly).
//
// RE-PINNED IN PHASE 3B — the scenario changed because the LAW changed, and the change is the
// slice's whole point: the world now wires the couplings K1/K2 deliberately left out. The fluid
// step reads (a) the culture's published level — the reverse coupling, at the world's standing
// CULTURE_COUPLING — and (b) the Queen's dealt magnets as the growth bias, each weighted by its
// field strength. The old scenario ("no magnets, no culture field, dial defaults" on BOTH sides)
// would now prove a law the world no longer runs. The new scenario feeds the GPU the world's
// exact inputs, in segments split at the culture's generation boundaries (the level the fluid
// reads changes only there — the one-step-behind read), through the harness's session API.
// The tolerances are NOT re-pinned: float noise < 1e-3 at 60 steps, character at 600, exactly
// the K1 law. Two node-side proofs pin the wiring itself, bit-exact: the world's medium equals
// a bare kernel run fed the recorded segment inputs (so the world wires precisely those inputs),
// and differs from the old bare law (so the coupling is real, not decorative).
//
// THE TOLERANCE LAW (Tier S per K0, spec §5.4): the GPU computes in float32 end to end; the JS
// reference computes in float64 and stores float32. Short runs must agree to float noise — max
// |Δ| < 1e-3 on both phases at 60 steps, the K1 stage-1 precedent for this same kernel pair at
// this same grid. Long runs are chaotic reaction-diffusion: pointwise divergence grows while the
// regime's statistics hold, so 600 steps is judged on character — mean V within 15% — plus both
// fields finite and in [0, 1]. Never bytes: a GPU medium is the recording device's own.
import assert from 'node:assert/strict';
import {
  createCultureWorld,
  stepCultureWorld,
  cultureFluidDensity,
  dealCultureField,
  CULTURE_COUPLING,
  CULTURE_WORLD_ASPECT_HW,
} from '../../engine/cultureWorld.mjs';
import { createFluid, stepFluid, fluidHash, fluidMeanDensity, magnetFieldAt } from '../../engine/dishFluid.mjs';
import { cultureFieldMagnets, CULTURE_FIELD_FLUID_PULL } from '../../engine/cultureFields.mjs';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from '../../engine/cultureSwarm.mjs';
import { openHarnessPage, closeGlDriver } from './glDriver.mjs';

const SEED = 20261122;

/**
 * Advance a world ONLY through its own scheduler until its medium has taken `fluidTarget`
 * steps, capturing the run's exact fluid inputs: the birth field, and per generation segment
 * the fluid steps taken while that generation's published level stood (the level the fluid
 * read — the fluid steps before the generation inside a world step, so a fluid step in a
 * world step that ENDS generation g still read generation g−1's level; the segment keying
 * below records exactly that), plus a snapshot of each generation's published level.
 */
function worldRun(fluidTarget, deal) {
  const w = createCultureWorld({ seed: SEED });
  if (deal) deal(w);
  const birth = { u: Array.from(w.fluid.u), v: Array.from(w.fluid.v) };
  const levelsByGen = new Map([[0, Array.from(w.life.field.level)]]);
  const segments = [];
  let cur = null;
  while (w.fluid.step < fluidTarget) {
    const genBefore = w.life.gen;
    const fluidBefore = w.fluid.step;
    stepCultureWorld(w);
    if (w.life.gen !== genBefore) levelsByGen.set(w.life.gen, Array.from(w.life.field.level));
    const ran = w.fluid.step - fluidBefore;
    if (ran > 0) {
      if (!cur || cur.gen !== genBefore) {
        cur = { gen: genBefore, steps: 0 };
        segments.push(cur);
      }
      cur.steps += ran;
    }
  }
  assert.equal(w.fluid.step, fluidTarget, 'the world cadence lands exactly on the step count');
  return { w, birth, segments, levelsByGen };
}

/** The bare JS kernel fed a run's recorded inputs segment by segment — the wiring reference. */
function jsReference(run, opts) {
  const f = createFluid({ cols: run.w.fluid.cols, rows: run.w.fluid.rows, seedKey: 0 });
  f.u.set(run.birth.u);
  f.v.set(run.birth.v);
  for (const seg of run.segments) {
    const culture = {
      cols: run.w.life.cols,
      rows: run.w.life.rows,
      level: Float32Array.from(run.levelsByGen.get(seg.gen)),
    };
    for (let i = 0; i < seg.steps; i++) stepFluid(f, { ...opts, culture });
  }
  return f;
}

/** The GPU mirror fed the same recorded inputs through the harness's segmented session. */
async function gpuReference(page, run, opts) {
  const id = await page.evaluate((p) => window.__kcFluidSessionOpen(p), {
    cols: run.w.fluid.cols,
    rows: run.w.fluid.rows,
    u: run.birth.u,
    v: run.birth.v,
  });
  for (const seg of run.segments) {
    await page.evaluate((p) => window.__kcFluidSessionStep(p.id, p), {
      id,
      steps: seg.steps,
      opts,
      culture: {
        level: run.levelsByGen.get(seg.gen),
        cw: run.w.life.cols,
        ch: run.w.life.rows,
      },
    });
  }
  return page.evaluate((p) => window.__kcFluidSessionRead(p), id);
}

const stats = (a, b) => {
  let maxd = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    maxd = Math.max(maxd, d);
    sum += d;
  }
  return { max: maxd, mean: sum / a.length };
};
const inLaw = (arr) => arr.every((v) => Number.isFinite(v) && v >= 0 && v <= 1);

// — Node-side wiring proofs (no browser needed): the world's medium IS the kernel fed the
// recorded inputs, and is NOT the old bare law. —
{
  const run = worldRun(60);
  const opts = {
    magnets: [],
    pull: CULTURE_FIELD_FLUID_PULL,
    couple: CULTURE_COUPLING,
    aspectHW: CULTURE_WORLD_ASPECT_HW,
  };
  const ref = jsReference(run, opts);
  assert.equal(
    fluidHash(ref),
    fluidHash(run.w.fluid),
    'the world’s medium is bit-identical to the bare kernel fed its recorded segment inputs — the wiring is exact',
  );
  const bare = createFluid({ cols: run.w.fluid.cols, rows: run.w.fluid.rows, seedKey: 0 });
  bare.u.set(run.birth.u);
  bare.v.set(run.birth.v);
  for (let i = 0; i < 60; i++) stepFluid(bare);
  assert.notEqual(
    fluidHash(bare),
    fluidHash(run.w.fluid),
    'and it departs from the old bare law — the reverse coupling is really wired, not decorative',
  );
  console.log('  [ok] wiring: world medium == kernel fed the recorded inputs (bit-exact); != the bare law');
}

// The magnet growth bias, node-side: a world with one dealt magnet masses its dark phase
// toward the magnet, against the same-seed world with none.
{
  const plain = worldRun(60);
  const mag = worldRun(60, (w) => dealCultureField(w, { kind: 'magnet', x: 700, y: 400 }));
  assert.notEqual(fluidHash(mag.w.fluid), fluidHash(plain.w.fluid), 'a dealt magnet moves the medium');
  const massNear = (world) => {
    const d = cultureFluidDensity(world);
    let t = 0;
    for (let y = 0; y < world.fluid.rows; y++)
      for (let x = 0; x < world.fluid.cols; x++) {
        const mf = magnetFieldAt(
          [{ x: 700 / CULTURE_SWARM_WORLD_W, y: 400 / CULTURE_SWARM_WORLD_H }],
          (x + 0.5) / world.fluid.cols,
          (y + 0.5) / world.fluid.rows,
          CULTURE_WORLD_ASPECT_HW,
        );
        t += d[y * world.fluid.cols + x] * mf;
      }
    return t;
  };
  const a = massNear(plain.w);
  const b = massNear(mag.w);
  assert.ok(
    b > a,
    `the dark phase masses toward the dealt magnet (weighted density ${a.toFixed(2)} → ${b.toFixed(2)})`,
  );
  console.log(
    `  [ok] growth bias: magnet-weighted density ${a.toFixed(2)} (no magnet) → ${b.toFixed(2)} (dealt magnet)`,
  );
}

// The lint job's runner skips `playwright install` to stay fast (same as fluidSim.selfcheck.mjs):
// no browser there is a skip, not a failure. The selfcheck-browser job and dev machines run it.
let harness;
try {
  harness = await openHarnessPage('/parity/fluidSim.html');
} catch (e) {
  if (String(e && e.message).includes("Executable doesn't exist")) {
    console.log('  [skip] GPU culture fluid vs the world JS reference: Playwright browser not installed');
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
  // Scenario A — the coupled medium, no fields dealt (the standing world law since 3B).
  for (const [label, fluidSteps] of [
    ['60 fluid steps (one sim-second of medium)', 60],
    ['600 fluid steps (ten sim-seconds)', 600],
  ]) {
    const run = worldRun(fluidSteps);
    const opts = {
      magnets: [],
      pull: CULTURE_FIELD_FLUID_PULL,
      flow: 0.5,
      couple: CULTURE_COUPLING,
      aspectHW: CULTURE_WORLD_ASPECT_HW,
    };
    const g = await gpuReference(page, run, opts);
    const du = stats(run.w.fluid.u, g.u);
    const dv = stats(run.w.fluid.v, g.v);
    console.log(
      `      ${label}: |ΔV| max ${dv.max.toExponential(2)} mean ${dv.mean.toExponential(2)} · |ΔU| max ${du.max.toExponential(2)}`,
    );
    check(
      `${label}: both fields finite and in [0, 1]`,
      inLaw(g.u) && inLaw(g.v) && inLaw(run.w.fluid.u) && inLaw(run.w.fluid.v),
    );
    if (fluidSteps <= 60) {
      check(`${label}: GPU agrees with the JS reference to float noise (< 1e-3)`, dv.max < 1e-3 && du.max < 1e-3);
    } else {
      const mj = fluidMeanDensity(run.w.fluid);
      const mg = g.v.reduce((s, x) => s + x, 0) / g.v.length;
      check(
        `${label}: same character (mean V within 15%)`,
        Math.abs(mg - mj) <= 0.15 * Math.max(mj, 1e-6),
        `JS ${mj.toFixed(4)} GPU ${mg.toFixed(4)}`,
      );
    }
  }

  // Scenario B — the growth bias on GPU: one dealt magnet, the world's magnet list and
  // standing pull, short run at the noise bound.
  {
    const run = worldRun(60, (w) => dealCultureField(w, { kind: 'magnet', x: 700, y: 400 }));
    const opts = {
      magnets: cultureFieldMagnets(run.w.fields),
      pull: CULTURE_FIELD_FLUID_PULL,
      flow: 0.5,
      couple: CULTURE_COUPLING,
      aspectHW: CULTURE_WORLD_ASPECT_HW,
    };
    assert.equal(opts.magnets.length, 1, 'the dealt magnet is the bias’s whole list');
    const g = await gpuReference(page, run, opts);
    const du = stats(run.w.fluid.u, g.u);
    const dv = stats(run.w.fluid.v, g.v);
    console.log(
      `      magnet run: |ΔV| max ${dv.max.toExponential(2)} mean ${dv.mean.toExponential(2)} · |ΔU| max ${du.max.toExponential(2)}`,
    );
    check(
      'magnet run: both fields finite and in [0, 1]',
      inLaw(g.u) && inLaw(g.v) && inLaw(run.w.fluid.u) && inLaw(run.w.fluid.v),
    );
    check('magnet run: GPU agrees with the JS reference to float noise (< 1e-3)', dv.max < 1e-3 && du.max < 1e-3);
  }
} finally {
  await close();
  await closeGlDriver();
}
if (failed) {
  console.log(`cultureFluidSim.selfcheck: FAIL (${failed})`);
  process.exit(1);
}
console.log(
  'cultureFluidSim.selfcheck: OK — the world medium on GPU matches its JS reference under the coupled law (float noise short, character long)',
);
