// rewrite.selfcheck.mjs — PATTERN REWRITE: a grid that grows itself by rewrite rules (#1823).
//
// What the issue asks, as checks:
//   a MarkovJunior-style rewrite loop (pattern → match → rewrite, one application per step,
//   seeded) growing a PATTERN grid instead of dealing a finished one; a HARD per-run rule-
//   application budget; colour from the palette only, by growth order; seed-deterministic
//   (replay law); a cost tier declared at registration.
import assert from 'node:assert';
import {
  assignRewrite,
  rasterRewrite,
  rewriteTrajectory,
  rewriteStateAt,
  rewriteStepAt,
  rewriteRoles,
  rewriteCols,
  rewriteHeadCount,
  rewriteBand,
  rewriteCellAt,
  rewriteTau,
  RW_VOID,
  RW_PATH,
  RW_HEAD,
  REWRITE_MAX_STEPS,
  REWRITE_GROW_S,
  REWRITE_HOLD_S,
  REWRITE_HEADS_MAX,
} from './rewrite.js';
import { createPatternFrames, patternPixels, patternKey } from './patternSource.js';
import { patternGround } from './ground.js';
import { dealPattern } from './patternRoll.js';
import { toRgba } from './engine.js';
import { PATTERN_MODES, PATTERN_DEAL_MODES, defaultPattern, sanitizePattern } from '../state/patternTrack.js';
import { getCostTier } from '../engine/kernel/costRegistry.mjs';
import { PALETTES, resolvePalette } from '../data/palettes.js';
import { mkRng } from '../engine/prng.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const PAL_ID = Object.keys(PALETTES).find((k) => (PALETTES[k].swatches || []).length >= 5) || Object.keys(PALETTES)[0];
const PAL = resolvePalette(PAL_ID, null, []);
const W = 400;
const H = 280;
const block = (over = {}) => sanitizePattern({ ...defaultPattern('REWRITE', 0x1823), ...over });
const ROWS = Math.ceil(H / (W / rewriteCols(10)));

ok('REWRITE is a pattern mode the editor offers, opening at 20 cells across; KIN/CURATOR do not deal it', () => {
  assert.ok(PATTERN_MODES.includes('REWRITE'));
  assert.ok(!PATTERN_DEAL_MODES.includes('REWRITE'), 'hand-picked only, like TIDES');
  assert.deepEqual(PATTERN_DEAL_MODES, ['QUILT', 'GLYPH', 'FIELD'], 'existing seeded deals are unchanged');
  const rng = mkRng(7);
  for (let i = 0; i < 400; i++) assert.notEqual(dealPattern(block(), rng).mode, 'REWRITE');
  const p = block();
  assert.equal(p.density, 10, 'shipped density default (a PATTERN_STOPS stop)');
  assert.equal(p.mix, 0.4, 'shipped mix default (a PATTERN_STOPS stop)');
  assert.equal(rewriteCols(10), 20);
  assert.equal(rewriteCols(4), 8);
  assert.equal(rewriteCols(12), 24);
  assert.equal(sanitizePattern({ mode: 'REWRITE' }).mode, 'REWRITE', 'the sanitizer keeps the mode');
});

ok('cost tier declared at registration: tier 0 (CPU raster, never shed), with a time estimate', () => {
  const d = getCostTier('pattern/rewrite');
  assert.ok(d, 'pattern/rewrite is registered');
  assert.equal(d.tier, 0);
  assert.ok(d.timeMs > 0 && /1823/.test(d.notes));
});

ok(
  'the growth is a real rewrite trajectory: born cells are exactly the path, and all of it hangs off the seeded heads',
  () => {
    for (const seed of [1, 7, 0x1823, 999]) {
      const g = assignRewrite(seed, 10, 0.4, PAL, ROWS);
      const traj = rewriteTrajectory(g);
      assert.ok(traj.finished, `seed ${seed}: the program completes inside the budget`);
      assert.ok(traj.totalSteps <= REWRITE_MAX_STEPS, 'inside the hard budget');
      let path = 0;
      for (let i = 0; i < traj.cells.length; i++) {
        assert.notEqual(traj.cells[i], RW_HEAD, 'no head survives the seal phase');
        if (traj.cells[i] === RW_PATH) {
          path++;
          assert.ok(traj.born[i] > 0, 'every path cell has a birth step');
        } else {
          assert.equal(traj.born[i], -1, 'unborn cells stay unborn');
        }
      }
      assert.ok(
        path > traj.cells.length * 0.25,
        `seed ${seed}: the growth fills a real share (${path}/${traj.cells.length})`,
      );
      // the corridor guarantee of the context rules: growth is one cell wide, so no
      // 2×2 block of path can ever form (a block's last cell would have needed a
      // non-void neighbour the rule forbids).
      for (let y = 0; y < g.rows - 1; y++) {
        for (let x = 0; x < g.cols - 1; x++) {
          const i = y * g.cols + x;
          assert.ok(
            !(
              traj.cells[i] === RW_PATH &&
              traj.cells[i + 1] === RW_PATH &&
              traj.cells[i + g.cols] === RW_PATH &&
              traj.cells[i + g.cols + 1] === RW_PATH
            ),
            `seed ${seed}: no 2×2 path block at ${x},${y} — corridors stay one cell wide`,
          );
        }
      }
      // connectivity: flood from the seeded heads over path cells reaches every path cell —
      // growth only ever extends what already grew (the rules can do nothing else).
      const seen = new Set(g.heads);
      const queue = [...g.heads];
      while (queue.length) {
        const i = queue.pop();
        const x = i % g.cols;
        const y = Math.floor(i / g.cols);
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
          const j = ny * g.cols + nx;
          if (!seen.has(j) && traj.cells[j] === RW_PATH) {
            seen.add(j);
            queue.push(j);
          }
        }
      }
      for (let i = 0; i < traj.cells.length; i++) {
        if (traj.cells[i] === RW_PATH) assert.ok(seen.has(i), `seed ${seed}: path cell ${i} is connected to a head`);
      }
    }
  },
);

ok('growth is monotone and step-addressable: void → head → path, never backwards, at every step', () => {
  const g = assignRewrite(42, 10, 0.55, PAL, ROWS);
  const traj = rewriteTrajectory(g);
  const rank = (s) => (s === RW_PATH ? 2 : s === RW_HEAD ? 1 : 0);
  for (let i = 0; i < traj.cells.length; i++) {
    let prev = 0;
    for (let k = 0; k <= traj.totalSteps; k += 7) {
      const r = rank(rewriteStateAt(traj, i, k));
      assert.ok(r >= prev, `cell ${i} never un-grows (step ${k})`);
      prev = r;
    }
    assert.equal(rewriteStateAt(traj, i, traj.totalSteps), traj.cells[i], 'the last step is the final grid');
    assert.equal(rewriteStateAt(traj, i, 0), g.heads.includes(i) ? RW_HEAD : RW_VOID, 'step 0 is just the seeds');
  }
  // mid-growth, heads are on stage: the picture is the process, not only the result
  const mid = Math.floor(traj.totalSteps / 2);
  let heads = 0;
  for (let i = 0; i < traj.cells.length; i++) if (rewriteStateAt(traj, i, mid) === RW_HEAD) heads++;
  assert.ok(heads >= 1, 'a mid-growth frame shows live heads');
});

ok('the budget binds at the largest size too, and MIX is the branching appetite it claims to be', () => {
  for (const seed of [1, 2, 3]) {
    const g = assignRewrite(seed, 12, 1, PAL, 17);
    const traj = rewriteTrajectory(g);
    assert.ok(
      traj.totalSteps <= REWRITE_MAX_STEPS,
      `density 12 seed ${seed}: ${traj.totalSteps} steps inside the budget`,
    );
  }
  assert.equal(rewriteHeadCount(0), 1);
  assert.equal(rewriteHeadCount(1), REWRITE_HEADS_MAX);
  assert.equal(assignRewrite(5, 10, 0, PAL, ROWS).spawnWeight, 0, 'MIX 0: no budding at all');
  assert.ok(assignRewrite(5, 10, 1, PAL, ROWS).spawnWeight > 0, 'MIX 1: budding is live');
  let low = 0;
  let high = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const count = (mix) => {
      const t = rewriteTrajectory(assignRewrite(seed, 10, mix, PAL, ROWS));
      return t.cells.reduce((a, c) => a + (c === RW_PATH ? 1 : 0), 0);
    };
    low += count(0);
    high += count(1);
  }
  assert.ok(high > low, `bushier MIX grows more maze (${high} vs ${low} path cells over 6 seeds)`);
});

ok('colour is growth order: the first-born cells wear the ramp foot, the last-born its top; palette only', () => {
  const { ground, ramp } = rewriteRoles(PAL);
  assert.ok(ramp.length >= 3, 'the test palette gives a real ramp');
  const g = assignRewrite(0x1823, 10, 0.4, PAL, ROWS);
  const traj = rewriteTrajectory(g);
  let first = -1;
  let last = -1;
  for (let i = 0; i < traj.born.length; i++) {
    if (traj.born[i] === -1) continue;
    if (first === -1 || traj.born[i] < traj.born[first]) first = i;
    if (last === -1 || traj.born[i] > traj.born[last]) last = i;
  }
  assert.ok(first !== -1 && last !== -1, 'the growth has born cells at both ends of time');
  assert.equal(rewriteBand(traj, first, ramp.length), 0, 'the oldest growth is the darkest');
  assert.equal(
    rewriteBand(traj, last, ramp.length),
    ramp.length - 1,
    'the youngest growth (the sealed dead ends) is the lightest',
  );
  const allowed = new Set([ground, ...ramp].map(toRgba));
  for (const t of [0, 1.3, 4]) {
    const px = patternPixels(block({ drift: 0.8 }), PAL, W, H, t);
    for (let i = 0; i < px.length; i++) assert.ok(allowed.has(px[i]), `pixel ${i} at t=${t} is off-palette`);
  }
  const thin = { swatches: ['#000000', '#ff2200'], bg: '#000000', ink: '#ffffff' };
  assert.ok(rewriteRoles(thin).ramp.length >= 1);
  patternPixels(block(), thin, 64, 48, 0);
});

ok('replay law: same seed + params + t = identical pixels; another seed differs; DRIFT 0 is one still frame', () => {
  const a = patternPixels(block({ drift: 0.5 }), PAL, W, H, 2.25);
  assert.deepEqual(a, patternPixels(block({ drift: 0.5 }), PAL, W, H, 2.25));
  assert.notDeepEqual(a, patternPixels(block({ drift: 0.5, seed: 0xabc }), PAL, W, H, 2.25));
  const s0 = patternPixels(block({ drift: 0 }), PAL, W, H, 0);
  assert.deepEqual(s0, patternPixels(block({ drift: 0 }), PAL, W, H, 9.5), 'DRIFT 0 ignores the clock');
  assert.equal(patternKey(block(), PAL, W, H, 0), patternKey(block(), PAL, W, H, 99), 'and caches as a still');
  // mid-growth is not the finished maze; the finished maze is what DRIFT 0 draws
  const mid = patternPixels(block({ drift: 1 }), PAL, W, H, 1.5);
  assert.notDeepEqual(mid, s0, 'half-grown differs from grown');
  // the regrowth cycle: one full cycle later the same frame returns
  const cyc = REWRITE_GROW_S + REWRITE_HOLD_S;
  assert.deepEqual(
    patternPixels(block({ drift: 1 }), PAL, W, H, 1.5),
    patternPixels(block({ drift: 1 }), PAL, W, H, 1.5 + cyc),
    'growth + hold later, the same step shows again',
  );
  // kin / movers are element motion; REWRITE has no separate elements, so they change nothing
  assert.deepEqual(
    patternPixels(block({ drift: 0.5, kin: 'SPIN', movers: 1 }), PAL, W, H, 1),
    patternPixels(block({ drift: 0.5, kin: 'OFF', movers: 0 }), PAL, W, H, 1),
  );
  assert.equal(rewriteTau(0, 50), 0);
  assert.equal(rewriteTau(0.5, 4), 2);
});

ok('ground sampler (#1183) agrees with the pixels: at() is the colour painted at the cell centre', () => {
  const p = block({ drift: 0 });
  const ground = patternGround(p, PAL, W, H);
  const frames = createPatternFrames();
  const f = frames.frame(p, PAL, W, H, 0);
  const cell = W / rewriteCols(p.density);
  const g = assignRewrite(p.seed, p.density, p.mix, PAL, ROWS);
  const traj = rewriteTrajectory(g);
  let checked = 0;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const x = (c + 0.5) * cell;
      const y = (r + 0.5) * cell;
      if (y >= H) continue;
      const px = f.pixels[Math.floor(y) * W + Math.floor(x)];
      const roles = ground.roles(x, y, 0);
      assert.ok(roles.map(toRgba).includes(px), `cell ${c},${r}: the centre pixel is one of its role colours`);
      assert.equal(roles[0], ground.at(x, y, 0).toLowerCase(), 'roles lead with the main colour');
      const i = r * g.cols + c;
      if (traj.cells[i] === RW_PATH) {
        assert.equal(px, g.rgba[rewriteBand(traj, i, g.ramp.length)], `cell ${c},${r}: painted in its age band`);
        checked++;
      }
    }
  }
  assert.ok(checked > 40, `age bands verified at ${checked} cell centres`);
  const cl = ground.cell(cell * 2.25, cell * 1.5, 0);
  assert.ok(Math.abs(cl.u - 0.25) < 1e-9 && Math.abs(cl.v - 0.5) < 1e-9 && Math.abs(cl.size - cell) < 1e-9);
  // a growing ground follows the growth: early on, a late-born cell still reads as ground
  const late = (() => {
    let best = -1;
    let bi = -1;
    for (let i = 0; i < traj.born.length; i++) if (traj.born[i] > best) ((best = traj.born[i]), (bi = i));
    return bi;
  })();
  const lx = ((late % g.cols) + 0.5) * cell;
  const ly = (Math.floor(late / g.cols) + 0.5) * cell;
  const growing = patternGround(block({ drift: 1 }), PAL, W, H);
  assert.equal(growing.at(lx, ly, 0.05), g.ground, 'before its birth step, the latest cell is still ground');
});

ok('the step clock: DRIFT 0 is finished; mid-cycle is mid-growth; the hold shows the finished maze', () => {
  const g = assignRewrite(3, 10, 0.4, PAL, ROWS);
  const traj = rewriteTrajectory(g);
  assert.equal(rewriteStepAt(g, 0, 123), traj.totalSteps);
  assert.equal(rewriteStepAt(g, 1, 0), 0);
  const midK = rewriteStepAt(g, 1, REWRITE_GROW_S / 2);
  assert.ok(
    midK > 0 && midK < traj.totalSteps,
    `half-way through the growth window: step ${midK} of ${traj.totalSteps}`,
  );
  assert.equal(rewriteStepAt(g, 1, REWRITE_GROW_S + 1), traj.totalSteps, 'the hold shows the finished growth');
  const cellAt = rewriteCellAt(g, W, 5, 5, 0, 0);
  assert.ok(cellAt.side > 0 && cellAt.u >= 0 && cellAt.u < 1);
});

ok('cost: the one-off growth and a moving frame stay inside the declaration (median of 30)', () => {
  const t0 = performance.now();
  rewriteTrajectory(assignRewrite(0x1823, 10, 0.4, PAL, ROWS));
  const buildMs = performance.now() - t0;
  const p = block({ drift: 0.8 });
  const frames = createPatternFrames();
  frames.frame(p, PAL, 1000, 700, 0); // build the plan once, like the live loop does
  const ms = [];
  for (let i = 1; i <= 30; i++) {
    const s = performance.now();
    frames.frame(p, PAL, 1000, 700, i / 60);
    ms.push(performance.now() - s);
  }
  ms.sort((a, b) => a - b);
  const med = ms[15];
  const declared = getCostTier('pattern/rewrite').timeMs;
  console.log(
    `      growth build: ${buildMs.toFixed(2)} ms one-off · moving frame 1000×700: median ${med.toFixed(2)} ms (declared ${declared} ms)`,
  );
  assert.ok(med < declared * 4, `median ${med.toFixed(2)} ms is far over the ${declared} ms declaration`);
});

console.log(`rewrite.selfcheck: ${n} checks passed`);
