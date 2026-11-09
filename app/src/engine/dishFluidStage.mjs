// dishFluidStage.mjs — FERROFLUID (#1997): the fluid on the resolver's stage. Pure of DOM and clocks.
//
// The resolver is a pure function of the recorded input stream, so the fluid lives HERE, driven only by the
// per-frame stamp the live loop writes on the input — `input.dishFluid = { wakeMs, step, cycleSteps, shed }`,
// with the magnets and dials riding beside it (`input.dishFluidMagnets`, `input.dishFluidDial`). Absent stamp
// = no fluid: the stage drops its state and touches nothing, and a frame without the keys is byte-identical
// to a build without this module.
//
//   TWO INSTANCES, ONE KERNEL — this stage steps the kernel (engine/dishFluid.mjs) at the DISH GRID
//   (96×54) at 1/FLUID_GRID_STEP_DIVISOR of the display rate. That instance is the COUPLING AUTHORITY:
//   its published density is what the culture's births read (engine/dishFluidCouple.mjs), and it is the
//   state a snapshot restores — pure JS over the recorded stream, so the coupling is exact on every
//   device. The DISPLAY field is the same kernel at the shed resolution on the GPU
//   (gl/dishFluidGl.mjs), driven by the plan this stage publishes; per Matt's ruling (2026-11-08) the
//   display is a Davis-side living surface — same stamps, same magnets, same bias inputs, its own
//   resolution. The two instances are siblings, never texel-identical, and nothing in the coupling
//   ever reads the display instance.
//
//   WAKE / CYCLE — the stamp is a cycle clock (the field culture's shape): when wakeMs changes the
//   fluid re-seeds from the seeded stream under the new wake's seed key, magnets first. A stamp BEHIND
//   the stage (a replay seeking back inside the cycle) rebuilds from the cycle seed — the field at
//   step s of a wake is always the same field.
//
//   COUPLING READ — the culture field handed in (ctx.coupleField) is the culture stage's publication
//   from the LAST applied frame (the resolver captures it before either stage applies): one frame
//   behind, held constant across this frame's steps — the dish's standing read discipline. The fluid's
//   own publication (publishedFluid) is read by the culture side on the next frame, the same way.
//
//   SNAPSHOT — { wakeMs, seed, seedKey, gridStep, magnets, dial, state } where state is the grid
//   field itself (both phases, plain arrays). The state rides because the fluid's consumed
//   coupling input (the culture's field) CHANGES during a wake — unlike the culture's terrain,
//   which is static per wake and so replays exactly from its seed marks. A step count plus the
//   last field could not reproduce the field the steps actually consumed, so the field itself
//   is the rider: restore loads it verbatim and the continuation is exact under the standing
//   rule (exact iff the subsequent stamped inputs are the take's own).

import {
  createFluid,
  stepFluid,
  fluidDensity,
  fluidSeedKey,
  sanitizeMagnets,
  sanitizeFluidDial,
  clampFluidRung,
  FLUID_GRID_COLS,
  FLUID_GRID_ROWS,
  FLUID_GRID_STEP_DIVISOR,
  FLUID_RESOLUTIONS,
  FLUID_SHED_RUNGS,
} from './dishFluid.mjs';

export function createDishFluidStage() {
  let st = null; // { wakeMs, seed, seedKey, sim, magnets, dial, coupleRef }

  // The coupling publication: ONE stable object, re-pointed on every apply (the publishedField
  // discipline). Inactive whenever no fluid runs, so a consumer can never read a retained frame.
  const publishedFluid = {
    active: false,
    cols: FLUID_GRID_COLS,
    rows: FLUID_GRID_ROWS,
    step: -1,
    wakeMs: null,
    density: null,
  };
  // The display plan: ONE stable object the loop reads after the resolve (getLastDishFluidPlan)
  // to drive the GPU instance. Inactive on the same terms.
  const plan = {
    active: false,
    seedKey: 0,
    wakeMs: null,
    stepTarget: 0,
    stepsAllowed: 0,
    resIndex: 0,
    cols: FLUID_RESOLUTIONS[0].cols,
    rows: FLUID_RESOLUTIONS[0].rows,
    magnets: [],
    dial: { flow: 0.5, pull: 0.7, couple: 0.5 },
    coupleField: null,
    aspectHW: 0.7,
  };

  function clearPublication() {
    publishedFluid.active = false;
    publishedFluid.step = -1;
    publishedFluid.wakeMs = null;
    publishedFluid.density = null;
    plan.active = false;
    plan.stepTarget = 0;
    plan.stepsAllowed = 0;
    plan.coupleField = null;
  }

  function build(wakeMs, seed, magnets) {
    const seedKey = fluidSeedKey(seed, wakeMs);
    st = {
      wakeMs,
      seed,
      seedKey,
      sim: createFluid({ cols: FLUID_GRID_COLS, rows: FLUID_GRID_ROWS, seedKey, magnets }),
      magnets,
      dial: { flow: 0.5, pull: 0.7, couple: 0.5 },
      coupleRef: null,
      lastPublishedStep: -1,
    };
  }

  const stepOpts = (aspectHW) => ({
    magnets: st.magnets,
    pull: st.dial.pull,
    flow: st.dial.flow,
    couple: st.dial.couple,
    culture: st.coupleRef ? { cols: st.coupleRef.cols, rows: st.coupleRef.rows, level: st.coupleRef.level } : null,
    aspectHW,
  });

  /**
   * Apply the frame's stamp. `ctx`: { seed, magnets, dial, coupleField, W, H } — coupleField is the
   * culture stage's publication object ({ active, cols, rows, level }) or null. Returns true while a
   * fluid runs; false (touching nothing, state dropped) when there is no stamp.
   */
  function apply(stamp, ctx = {}) {
    if (!stamp || typeof stamp !== 'object' || !Number.isFinite(stamp.wakeMs)) {
      st = null;
      clearPublication();
      return false;
    }
    const seed = Number.isFinite(Number(ctx.seed)) ? Number(ctx.seed) | 0 : 0;
    const magnets = sanitizeMagnets(ctx.magnets);
    const dial = sanitizeFluidDial(ctx.dial);
    const aspectHW = ctx.W > 0 && ctx.H > 0 ? ctx.H / ctx.W : 0.7;
    const cf = ctx.coupleField && ctx.coupleField.active && ctx.coupleField.level ? ctx.coupleField : null;
    if (!st || st.wakeMs !== stamp.wakeMs || st.seed !== seed) {
      build(stamp.wakeMs, seed, magnets);
    }
    st.magnets = magnets;
    st.dial = dial;
    st.coupleRef = cf ? { cols: cf.cols | 0, rows: cf.rows | 0, level: cf.level, gen: cf.gen | 0 } : null;

    const rung = FLUID_SHED_RUNGS[clampFluidRung(stamp.shed)];
    const target = Math.max(0, Math.floor((Number(stamp.step) || 0) / FLUID_GRID_STEP_DIVISOR));
    if (target < st.sim.step) {
      // a replay seeking back inside the cycle: rebuild from the cycle seed
      build(stamp.wakeMs, seed, magnets);
      st.magnets = magnets;
      st.dial = dial;
      st.coupleRef = cf ? { cols: cf.cols | 0, rows: cf.rows | 0, level: cf.level, gen: cf.gen | 0 } : null;
    }
    const gridBound = rung.steps > 0 ? Math.max(1, Math.round(rung.steps / FLUID_GRID_STEP_DIVISOR)) : 0;
    for (let n = 0; st.sim.step < target && n < gridBound; n++) stepFluid(st.sim, stepOpts(aspectHW));

    if (st.sim.step !== st.lastPublishedStep || !publishedFluid.active) {
      publishedFluid.density = fluidDensity(st.sim);
      st.lastPublishedStep = st.sim.step;
    }
    publishedFluid.active = true;
    publishedFluid.step = st.sim.step;
    publishedFluid.wakeMs = st.wakeMs;

    plan.active = true;
    plan.seedKey = st.seedKey;
    plan.wakeMs = st.wakeMs;
    plan.stepTarget = Math.max(0, Math.floor(Number(stamp.step) || 0));
    plan.stepsAllowed = rung.steps;
    plan.resIndex = rung.res;
    plan.cols = FLUID_RESOLUTIONS[rung.res].cols;
    plan.rows = FLUID_RESOLUTIONS[rung.res].rows;
    plan.magnets = magnets;
    plan.dial = dial;
    plan.coupleField = st.coupleRef
      ? { cols: st.coupleRef.cols, rows: st.coupleRef.rows, level: st.coupleRef.level, gen: st.coupleRef.gen }
      : null;
    plan.aspectHW = aspectHW;
    return true;
  }

  return {
    apply,
    publishedFluid,
    plan,
    reset() {
      st = null;
      clearPublication();
    },
    get active() {
      return !!st;
    },
    /** JSON-safe snapshot while a fluid runs; null otherwise. */
    snapshot() {
      if (!st) return null;
      return {
        wakeMs: st.wakeMs,
        seed: st.seed,
        seedKey: st.seedKey,
        gridStep: st.sim.step,
        magnets: st.magnets.map((m) => ({ ...m })),
        dial: { ...st.dial },
        // the grid field itself (see the header): both phases as plain arrays
        state: { u: Array.from(st.sim.u), v: Array.from(st.sim.v) },
      };
    },
    /** Restore a snapshot(): rebuild the bookkeeping and load the recorded field verbatim. */
    restore(snap) {
      st = null;
      clearPublication();
      if (!snap || typeof snap !== 'object' || !Number.isFinite(snap.wakeMs)) return;
      const magnets = sanitizeMagnets(snap.magnets);
      build(snap.wakeMs, Number.isFinite(Number(snap.seed)) ? Number(snap.seed) | 0 : 0, magnets);
      st.magnets = magnets;
      st.dial = sanitizeFluidDial(snap.dial);
      const n = FLUID_GRID_COLS * FLUID_GRID_ROWS;
      if (
        snap.state &&
        Array.isArray(snap.state.u) &&
        Array.isArray(snap.state.v) &&
        snap.state.u.length === n &&
        snap.state.v.length === n
      ) {
        st.sim.u.set(snap.state.u);
        st.sim.v.set(snap.state.v);
        st.sim.step = Math.max(0, Math.floor(Number(snap.gridStep) || 0));
      }
      publishedFluid.active = true;
      publishedFluid.density = fluidDensity(st.sim);
      publishedFluid.step = st.sim.step;
      publishedFluid.wakeMs = st.wakeMs;
      st.lastPublishedStep = st.sim.step;
      plan.active = true;
      plan.seedKey = st.seedKey;
      plan.wakeMs = st.wakeMs;
      plan.stepTarget = st.sim.step * FLUID_GRID_STEP_DIVISOR;
      plan.stepsAllowed = 0;
      plan.magnets = magnets;
      plan.dial = st.dial;
      plan.coupleField = st.coupleRef
        ? { cols: st.coupleRef.cols, rows: st.coupleRef.rows, level: st.coupleRef.level, gen: st.coupleRef.gen }
        : null;
    },
  };
}
