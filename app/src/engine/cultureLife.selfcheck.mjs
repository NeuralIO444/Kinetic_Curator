// node src/engine/cultureLife.selfcheck.mjs
// CULTURE Phase 1, slice K2 (the parent issue 2187) — the DISH LIFE culture as the culture world's soil.
//   1. the culture is born with the world: the Generations core at the shared grid under the pickup
//      rule, seeded from the world seed alone, its field published at the same grid
//   2. rule correctness, hand-computed: a blinker, a block and a lone cell under CULTURE_RULE,
//      stepped by the world's own scheduler with the medium held at zero density (no births)
//   3. step consumption: generations are a pure function of the world step count — floor(step / 15),
//      8 generations/second at the 120 Hz clock — under matched and irregular feeds alike
//   4. determinism on the JS path: the same feed sequence reproduces the culture bit-for-bit
//   5. the fluid coupling: inert at zero density (byte-identical to the uncoupled culture), and
//      exactly the established seam — a bare culture dealt the same births from the same density
//      at the same strength and seed reproduces the world's culture cell-for-cell
//   6. stability + character soak: two sim-minutes of soil — states in range, the colony alive
//      and unsaturated, the published field honest against the state grid
//   7. gate-off inertness: no world stands, so no culture exists anywhere
//   8. simLaw honesty: the culture's backend is a simBackends culture id; JS carries 'js-exact',
//      GPU carries 'decisions-exact', the two kernel doors compose, unknown ids are refused
import assert from 'node:assert/strict';
import {
  CULTURE_LIFE_STEP_DIVISOR,
  CULTURE_LIFE_BACKEND,
  CULTURE_LIFE_GPU_BACKEND,
  CULTURE_LIFE_SEED_DENSITY,
  CULTURE_COUPLING,
  createCultureWorld,
  stepCultureWorld,
  advanceCultureWorld,
  cultureWorldHash,
  cultureWorldSimLaw,
  setCultureLifeBackend,
  setCultureFluidBackend,
  CULTURE_FLUID_GPU_BACKEND,
  cultureLifeField,
  cultureFluidDensity,
  standingCultureWorld,
} from './cultureWorld.mjs';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';
import { createCulture, stepCulture, seedRandom, cultureHash, population, CULTURE_RULE } from './dishLife.mjs';
import { injectFluidBirths } from './dishFluidCouple.mjs';
import { KNOWN_SIM_BACKENDS } from './kernel/simBackends.js';
import { mkRng } from './prng.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const N = STAGE_COLS * STAGE_ROWS;
const bareCulture = (seed) =>
  createCulture({
    cols: STAGE_COLS,
    rows: STAGE_ROWS,
    rule: CULTURE_RULE,
    seed: seedRandom(STAGE_COLS, STAGE_ROWS, seed, CULTURE_LIFE_SEED_DENSITY),
  });

// 1 — the culture is born with the world.
{
  const w = createCultureWorld({ seed: 42 });
  assert.equal(w.life.cols, STAGE_COLS, 'the culture is at the shared stage grid (no resampling)');
  assert.equal(w.life.rows, STAGE_ROWS);
  assert.deepEqual(w.life.rule, CULTURE_RULE, 'the pickup rule the stage runs (B3/S234, 8 states)');
  assert.equal(w.life.gen, 0, 'the culture is born unstepped');
  assert.equal(w.life.mask, null, 'no glass in the world yet');
  assert.equal(w.life.bedrock, null, 'no terrain in the world yet (the dish fields are Phase 3)');
  const pop = population(w.life);
  assert.ok(
    pop.alive > N * 0.25 && pop.alive < N * 0.35,
    `born at the seed density class (alive ${pop.alive} of ${N})`,
  );
  assert.equal(pop.decaying, 0, 'nothing decays at birth');
  const f = cultureLifeField(w);
  assert.equal(f, w.life.field, 'the published face is the core’s own field object');
  assert.equal(f.level.length, N, 'the field is published at the shared grid');
  for (let i = 0; i < N; i++)
    assert.equal(f.level[i], w.life.cur[i] === 1 ? 1 : 0, 'birth field: level 1 exactly on the living');
  const same = createCultureWorld({ seed: 42 });
  assert.equal(cultureHash(same.life), cultureHash(w.life), 'the same world seed seeds the same culture');
  const other = createCultureWorld({ seed: 43 });
  assert.notEqual(cultureHash(other.life), cultureHash(w.life), 'a different world seed seeds a different culture');
  ok('the culture is born with the world: shared grid, pickup rule, seeded from the world seed, field published');
}

// 2 — rule correctness, hand-computed under CULTURE_RULE (B3/S234, states 8).
{
  const at = (x, y) => y * STAGE_COLS + x;
  const pattern = new Uint8Array(N);
  pattern[at(10, 10)] = pattern[at(11, 10)] = pattern[at(12, 10)] = 1; // a horizontal blinker
  pattern[at(20, 20)] = pattern[at(21, 20)] = pattern[at(20, 21)] = pattern[at(21, 21)] = 1; // a block
  pattern[at(30, 30)] = 1; // a lone cell
  const w = createCultureWorld({ seed: 7 });
  w.life = createCulture({ cols: STAGE_COLS, rows: STAGE_ROWS, rule: CULTURE_RULE, seed: pattern });
  w.fluid.v.fill(0);
  w.fluid.v2.fill(0); // density identically zero: the birth seam is inert, the rule alone speaks
  for (let s = 0; s < CULTURE_LIFE_STEP_DIVISOR - 1; s++) stepCultureWorld(w);
  assert.equal(w.life.gen, 0, 'fourteen world steps run no generation');
  assert.equal(w.life.cur[at(11, 10)], 1, 'the pattern stands untouched before the cadence boundary');
  stepCultureWorld(w);
  assert.equal(w.life.gen, 1, 'the fifteenth world step runs exactly one generation');
  const c = w.life.cur;
  // the blinker rotates: the middle survives on 2, the ends fail survival and DECAY (state 2,
  // the Generations tail — they do not vanish), the cells above and below the middle are born on 3
  assert.equal(c[at(11, 10)], 1, 'blinker middle survives');
  assert.equal(c[at(11, 9)], 1, 'blinker is born above');
  assert.equal(c[at(11, 11)], 1, 'blinker is born below');
  assert.equal(c[at(10, 10)], 2, 'blinker end decays to state 2, not death');
  assert.equal(c[at(12, 10)], 2, 'blinker end decays to state 2, not death');
  assert.equal(c[at(10, 9)], 0, 'a 2-neighbour dead cell is not born (B3 only)');
  // the block is a still life under B3/S234
  for (const i of [at(20, 20), at(21, 20), at(20, 21), at(21, 21)]) assert.equal(c[i], 1, 'block cell survives');
  assert.equal(c[at(19, 20)], 0, 'no birth beside the block (2 neighbours)');
  // the lone cell fails survival on 0 and enters the decay tail
  assert.equal(c[at(30, 30)], 2, 'lone cell decays instead of vanishing');
  for (let s = 0; s < CULTURE_LIFE_STEP_DIVISOR * 6; s++) stepCultureWorld(w);
  assert.equal(w.life.gen, 7, 'seven generations in');
  assert.equal(w.life.cur[at(30, 30)], 0, 'the decay tail runs its course: state 2→7 over six generations, then dead');
  ok('rule correctness: blinker, block and the decay tail, hand-computed under CULTURE_RULE');
}

// 3 — step consumption: generations eat world steps at the divisor cadence, and no other way.
{
  assert.equal(CULTURE_LIFE_STEP_DIVISOR, 15, '120 Hz world, 8 generations/second — the kernel tempo the issue states');
  const w = createCultureWorld({ seed: 5 });
  for (let s = 0; s < CULTURE_LIFE_STEP_DIVISOR - 1; s++) stepCultureWorld(w);
  assert.equal(w.life.gen, 0, 'no generation before the boundary');
  stepCultureWorld(w);
  assert.equal(w.life.gen, 1, 'one generation at the boundary');
  const w2 = createCultureWorld({ seed: 5 });
  for (let i = 0; i < 60; i++) advanceCultureWorld(w2, 1 / 60);
  assert.equal(w2.step, 120, 'sixty 60 Hz frames run 120 world steps');
  assert.equal(w2.life.gen, 8, 'one sim-second of world steps runs exactly 8 generations');
  assert.equal(w2.fluid.step, 60, 'the fluid cadence is undisturbed by the culture’s');
  // Under an irregular feed the invariant is exact at every point of the feed.
  const rng = mkRng(0x5011);
  const w3 = createCultureWorld({ seed: 5 });
  for (let i = 0; i < 600; i++) {
    advanceCultureWorld(w3, 0.001 + rng() * 0.049);
    assert.equal(
      w3.life.gen,
      Math.floor(w3.step / CULTURE_LIFE_STEP_DIVISOR),
      'generations == floor(world steps / divisor) at every point of the feed',
    );
  }
  const w4 = createCultureWorld({ seed: 5 });
  stepCultureWorld(w4); // step 1: off-cadence for both kernels
  const h = cultureHash(w4.life);
  stepCultureWorld(w4); // step 2: the fluid steps, the culture must not
  assert.equal(cultureHash(w4.life), h, 'a fluid-cadence world step leaves the culture untouched');
  ok('step consumption: floor(world.step / divisor) at every instant, matched or irregular feeds');
}

// 4 — determinism on the JS path: identical feeds reproduce the culture (and the world) bit-for-bit.
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
  assert.ok(a.life.gen > 100, 'the soak actually grew the culture');
  assert.equal(cultureHash(a.life), cultureHash(b.life), 'the culture reproduces bit-for-bit');
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'and so does the world that carries it');
  ok('determinism: identical feeds reproduce the culture bit-for-bit');
}

// 5 — the fluid coupling: the established birth seam, exactly.
{
  const GENS = 40;
  // (a) inert at zero density: a world whose medium never rises is the uncoupled culture, cell-for-cell.
  const z = createCultureWorld({ seed: 42 });
  z.fluid.v.fill(0);
  z.fluid.v2.fill(0);
  const unc = bareCulture(42);
  for (let s = 0; s < CULTURE_LIFE_STEP_DIVISOR * GENS; s++) stepCultureWorld(z);
  for (let g = 0; g < GENS; g++) stepCulture(unc);
  assert.ok(
    z.life.cur.every((v, i) => v === unc.cur[i]),
    'zero density = the uncoupled culture, byte-for-byte',
  );
  // (b) the lockstep reference: a bare culture dealt the seam by hand — the density the world
  // published at each generation boundary, the world's strength, the world's seed — lands
  // cell-for-cell on the world's own culture. The seam call, its order and its dial are the claim.
  const w = createCultureWorld({ seed: 42 });
  const ref = bareCulture(42);
  for (let g = 0; g < GENS; g++) {
    for (let s = 0; s < CULTURE_LIFE_STEP_DIVISOR; s++) stepCultureWorld(w);
    injectFluidBirths(ref, cultureFluidDensity(w), CULTURE_COUPLING, w.seed);
    stepCulture(ref);
    assert.ok(
      ref.cur.every((v, i) => v === w.life.cur[i]),
      `the hand-dealt reference matches the world at generation ${g + 1}`,
    );
  }
  // (c) the witness: the coupling is not decorative — the coupled culture departs from the
  // uncoupled one, because the medium (born inoculated at V 0.85, far over the birth floor)
  // deals births from the first generation.
  let diff = 0;
  for (let i = 0; i < N; i++) if (unc.cur[i] !== w.life.cur[i]) diff++;
  assert.ok(diff > 100, `the coupled culture departs from the uncoupled one (${diff} cells differ)`);
  ok('fluid coupling: inert at zero density; the seam dealt by hand reproduces the world cell-for-cell');
}

// 6 — stability + character soak: two sim-minutes of soil.
{
  const t0 = Date.now();
  const w = createCultureWorld({ seed: 42 });
  for (let i = 0; i < 120 * 60; i++) advanceCultureWorld(w, 1 / 60);
  assert.equal(w.step, 120 * 120, 'two sim-minutes at 120 Hz');
  assert.equal(w.life.gen, 960, 'two sim-minutes at 8 generations/second');
  const states = w.life.rule.states;
  let inRange = true;
  for (let i = 0; i < N; i++) if (!(w.life.cur[i] >= 0 && w.life.cur[i] < states)) inRange = false;
  assert.ok(inRange, 'every cell holds a lawful state (0..states-1) after two sim-minutes');
  const pop = population(w.life);
  assert.ok(pop.alive > 0, 'the colony is alive after two sim-minutes — the soil does not die out');
  assert.ok(pop.alive < N * 0.9, `and not saturated (alive ${pop.alive} of ${N})`);
  const f = cultureLifeField(w);
  assert.equal(f.gen, w.life.gen, 'the published field names the standing generation');
  for (let i = 0; i < N; i++) {
    assert.ok(f.level[i] >= 0 && f.level[i] <= 1, 'level in [0, 1]');
    assert.equal(f.level[i] === 1, w.life.cur[i] === 1, 'level is 1 exactly on the living cells');
  }
  console.log(
    `      (soak: 960 generations in ${Date.now() - t0} ms wall, alive ${pop.alive}, decaying ${pop.decaying})`,
  );
  ok('stability soak: lawful states, a living unsaturated colony, an honest field after two sim-minutes');
}

// 7 — gate-off inertness: the culture exists only inside a world, and no world stands.
{
  assert.equal(standingCultureWorld(), null, 'no standing world in this process: no culture anywhere');
  const w = createCultureWorld({ seed: 1 });
  assert.equal(standingCultureWorld(), null, 'creating a world registers nothing — the shell owns standing');
  assert.ok(w.life, 'the culture is a part of a world instance, never a module-level singleton');
  ok('gate-off inertness: the culture exists only as a created world’s field');
}

// 8 — simLaw honesty at the culture door, composed with the fluid door.
{
  assert.ok(KNOWN_SIM_BACKENDS.culture.includes(CULTURE_LIFE_BACKEND), 'the JS id is in the simBackends vocabulary');
  assert.ok(KNOWN_SIM_BACKENDS.culture.includes(CULTURE_LIFE_GPU_BACKEND), 'the GPU id is in the vocabulary');
  const w = createCultureWorld({ seed: 9 });
  assert.equal(w.lifeBackend, CULTURE_LIFE_BACKEND, 'a world is born on the JS reference core');
  assert.equal(w.simLaw, 'js-exact');
  setCultureLifeBackend(w, CULTURE_LIFE_GPU_BACKEND);
  assert.equal(w.lifeBackend, CULTURE_LIFE_GPU_BACKEND);
  assert.equal(w.simLaw, 'decisions-exact', 'a GPU culture flips the world law in the same motion');
  assert.equal(cultureWorldSimLaw(w), 'decisions-exact', 'a device-dependent kernel is never stamped js-exact');
  setCultureLifeBackend(w, CULTURE_LIFE_BACKEND);
  assert.equal(w.simLaw, 'js-exact', 'handing the soil back to JS restores js-exact');
  setCultureFluidBackend(w, CULTURE_FLUID_GPU_BACKEND);
  assert.equal(w.simLaw, 'decisions-exact', 'either kernel on GPU carries the law');
  setCultureLifeBackend(w, CULTURE_LIFE_GPU_BACKEND);
  assert.equal(w.simLaw, 'decisions-exact', 'both kernels on GPU, the same law');
  setCultureFluidBackend(w, 'js.gs.v1');
  setCultureLifeBackend(w, CULTURE_LIFE_BACKEND);
  assert.equal(w.simLaw, 'js-exact', 'both kernels back on JS restores js-exact');
  assert.throws(() => setCultureLifeBackend(w, 'gpu.life.v99'), /unknown culture backend/, 'an unknown id is refused');
  assert.throws(
    () => setCultureLifeBackend(w, 'js.gs.v1'),
    /unknown culture backend/,
    'another kernel’s id is refused',
  );
  assert.equal(w.lifeBackend, CULTURE_LIFE_BACKEND, 'a refused change leaves the stamp untouched');
  ok('simLaw honesty: js-exact on JS, decisions-exact on GPU, the doors compose, unknown backends refused');
}

console.log(
  `cultureLife.selfcheck: OK (${checks} groups) — CULTURE Phase 1 K2, the DISH LIFE culture as the world's soil`,
);
