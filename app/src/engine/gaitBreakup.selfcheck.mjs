// node src/engine/gaitBreakup.selfcheck.mjs
// #2330 (GAIT M4) — the break-up schedule and fold, pure:
//   1. eases run 0 → 1; ranks follow release.order
//   2. leaf-first releases the leaves before the root; root-first the reverse; together all at once
//   3. continuity: out → back and back → out never jump a piece
//   4. exact rest: a finished rejoin returns the very marks it was given (no offset at all), and the fold forgets it
//   5. every path (retrace / direct / arc) × every scatter goes home; follow-flow moves along the fluid's lean
//   6. no field, or no gait, starts nothing; the snapshot round-trips and a malformed one is refused
//   7. hierarchy: a piece never grows, travels at most SCATTER_FRAC of its tile, and reads quieter while out
import assert from 'node:assert/strict';
import {
  createGaitBreakup,
  easeOf,
  releaseRanks,
  backOffset,
  outOffset,
  checkBreakSnapshot,
  SCATTER_FRAC,
  PIECE_QUIET,
  BREAK_OUT_BEATS,
} from './gaitBreakup.js';
import { FLUID_GRID_COLS, FLUID_GRID_ROWS } from './dishFluid.mjs';
import { GAIT_EASES, GAIT_PATHS, GAIT_SCATTERS } from './gait.js';
import { ATTACH_BOX } from './assetAttach.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const W = 1000;
const H = 700;
const field = (on = true) =>
  on
    ? {
        density: new Float32Array(FLUID_GRID_COLS * FLUID_GRID_ROWS).fill(0.9),
        magnets: [{ x: 0.9, y: 0.5 }],
        pull: 0.7,
        aspectHW: H / W,
        W,
        H,
      }
    : null;
const TILE = { x: 300, y: 350, scale: 0.8 };
// a 5-piece tree: root 0, inner 1 and 2, leaves 3 and 4 (depths 0 1 1 2 2)
const DEPTHS = [0, 1, 1, 2, 2];
const REST = DEPTHS.map((d, k) => ({
  assetId: `p${k}`,
  x: 300 + (k - 2) * 12,
  y: 350 + d * 9,
  rotation: 0,
  scale: 0.2,
}));
const gaitOf = (release, rejoin) => ({ release, rejoin });
const G = gaitOf(
  { order: 'leaf-first', stagger: 0.5, scatter: 'burst' },
  { ease: 'outCubic', beats: 2, path: 'direct' },
);
const BPM = 120;
const secOf = (beat) => (beat * 60) / BPM;

/** Run a fold beat by beat; `on(b)` says whether the field stands at beat b. Returns per-step piece offsets. */
function run(gait, on, beats = 12, step = 1 / 32, fold = createGaitBreakup()) {
  const steps = [];
  for (let b = 0; b <= beats + 1e-9; b += step) {
    const r = fold.pose('w', {
      marks: REST,
      rest: REST,
      depths: DEPTHS,
      tile: TILE,
      field: field(on(b)),
      gait,
      bpm: BPM,
      driverSec: secOf(b),
      seed: 7,
    });
    steps.push({
      b,
      marks: r.marks,
      active: r.active,
      off: r.marks.map((m, k) => Math.hypot(m.x - REST[k].x, m.y - REST[k].y)),
    });
  }
  return { steps, fold };
}
const firstMove = (steps, k) => steps.find((s) => s.off[k] > 0)?.b ?? Infinity;

ok('eases run 0 → 1, and ranks follow the order', () => {
  for (const e of GAIT_EASES) {
    assert.equal(easeOf(e, 0), 0, e);
    assert.ok(Math.abs(easeOf(e, 1) - 1) < 1e-12, e);
  }
  assert.deepEqual(releaseRanks(DEPTHS, 'leaf-first'), [2, 1, 1, 0, 0]);
  assert.deepEqual(releaseRanks(DEPTHS, 'root-first'), [0, 1, 1, 2, 2]);
  assert.deepEqual(releaseRanks(DEPTHS, 'together'), [0, 0, 0, 0, 0]);
});

ok('leaf-first: the leaves release before the inner joints, which release before the root', () => {
  const { steps } = run(G, (b) => b >= 1);
  const t = [0, 1, 2, 3, 4].map((k) => firstMove(steps, k));
  assert.ok(t[3] < t[1] && t[4] < t[2], `leaves ${t[3]},${t[4]} before inner ${t[1]},${t[2]}`);
  assert.ok(t[1] < t[0], 'inner before the root');
  assert.ok(Math.abs(t[0] - t[3] - 2 * 0.5) < 1 / 16, 'two ranks of 0.5 beat stagger apart');
  const rf = run(gaitOf({ ...G.release, order: 'root-first' }, G.rejoin), (b) => b >= 1).steps;
  assert.ok(firstMove(rf, 0) < firstMove(rf, 3), 'root-first: the root goes first');
  const tg = run(gaitOf({ ...G.release, order: 'together' }, G.rejoin), (b) => b >= 1).steps;
  assert.equal(new Set([0, 1, 2, 3, 4].map((k) => firstMove(tg, k))).size, 1, 'together: one frame');
});

ok('continuity: out → back → out → back, no piece ever jumps', () => {
  for (const path of GAIT_PATHS)
    for (const scatter of GAIT_SCATTERS)
      for (const ease of GAIT_EASES) {
        const g = gaitOf({ order: 'leaf-first', stagger: 0.25, scatter }, { ease, beats: 2, path });
        // field on at 0.5, off at 3, back on mid-rejoin at 3.75, off for good at 5.5
        const on = (b) => (b >= 0.5 && b < 3) || (b >= 3.75 && b < 5.5);
        const { steps } = run(g, on, 10, 1 / 64);
        const L = SCATTER_FRAC[scatter] * TILE.scale * ATTACH_BOX;
        for (let i = 1; i < steps.length; i++)
          for (let k = 0; k < REST.length; k++) {
            const a = steps[i - 1].marks[k];
            const c = steps[i].marks[k];
            const jump = Math.hypot(c.x - a.x, c.y - a.y);
            assert.ok(jump < 0.2 * L, `${scatter}/${path}/${ease}: piece ${k} jumped ${jump} at beat ${steps[i].b}`);
          }
      }
});

ok('exact rest: a finished rejoin returns the very marks it was given, and the fold forgets the wearer', () => {
  for (const path of GAIT_PATHS)
    for (const scatter of GAIT_SCATTERS) {
      const g = gaitOf({ order: 'leaf-first', stagger: 0.5, scatter }, { ease: 'outBack', beats: 1, path });
      const { steps, fold } = run(g, (b) => b >= 0.5 && b < 4, 8);
      assert.ok(
        steps.some((s) => s.off.some((o) => o > 0.5)),
        `${scatter}/${path}: it broke up`,
      );
      const last = steps[steps.length - 1];
      assert.equal(last.active, false);
      assert.equal(last.marks, REST, `${scatter}/${path}: the same array (no offset at all)`);
      assert.equal(fold.size, 0);
      assert.equal(fold.snapshot(), null);
    }
});

ok('every path leaves from where the piece is; follow-flow moves along the fluid’s lean', () => {
  const v = { x: 1, y: 0 };
  const L = 20;
  for (const path of GAIT_PATHS)
    for (const scatter of GAIT_SCATTERS) {
      const s = { ease: 'inOutCubic', path, scatter };
      const at = backOffset(s, 0, v, L, 0.7, { x: 3, y: -2 });
      const was = outOffset(scatter, 0.7, v, L, { x: 3, y: -2 });
      assert.ok(Math.hypot(at.x - was.x, at.y - was.y) < 1e-9, `${scatter}/${path}: u=0 is where it was`);
      const end = backOffset(s, 1 - 1e-9, v, L, 0.7, { x: 3, y: -2 });
      assert.ok(Math.hypot(end.x, end.y) < 1e-6, `${scatter}/${path}: u→1 is home`);
    }
  // the magnet stands to the right of the tile: a follow-flow piece moves right
  const g = gaitOf({ order: 'together', stagger: 0, scatter: 'follow-flow' }, G.rejoin);
  const { steps } = run(g, (b) => b >= 0, 2);
  const s = steps[steps.length - 1];
  for (let k = 0; k < REST.length; k++) assert.ok(s.marks[k].x > REST[k].x + 1, `piece ${k} follows the flow`);
});

ok('no field, no gait: nothing starts, the marks come back as given', () => {
  const none = run(G, () => false).steps;
  assert.ok(none.every((s) => s.marks === REST && !s.active));
  const noGait = run(null, () => true).steps;
  assert.ok(noGait.every((s) => s.marks === REST && !s.active));
  const noPull = createGaitBreakup();
  const r = noPull.pose('w', {
    marks: REST,
    rest: REST,
    depths: DEPTHS,
    tile: TILE,
    field: { ...field(), pull: 0 },
    gait: G,
    bpm: BPM,
    driverSec: 1,
    seed: 7,
  });
  assert.equal(r.marks, REST, 'PULL 0 is no signal');
});

ok('the fold snapshots mid-break and a restored fold continues identically; junk is refused', () => {
  const on = (b) => b >= 0.5 && b < 3;
  const whole = run(G, on, 6);
  const a = createGaitBreakup();
  const half = run(G, on, 2, 1 / 32, a);
  const snap = JSON.parse(JSON.stringify(a.snapshot()));
  assert.ok(checkBreakSnapshot(snap));
  const b = createGaitBreakup();
  b.restore(snap);
  const rest = [];
  for (let beat = 2 + 1 / 32; beat <= 6 + 1e-9; beat += 1 / 32)
    rest.push(
      b.pose('w', {
        marks: REST,
        rest: REST,
        depths: DEPTHS,
        tile: TILE,
        field: field(on(beat)),
        gait: G,
        bpm: BPM,
        driverSec: secOf(beat),
        seed: 7,
      }).marks,
    );
  const tail = whole.steps.slice(half.steps.length).map((s) => s.marks);
  assert.deepEqual(rest, tail);
  assert.equal(checkBreakSnapshot({ w: { m: 'sideways' } }), false);
  assert.equal(checkBreakSnapshot([]), false);
  const c = createGaitBreakup();
  c.restore({ w: { m: 'out', t0: 'x' } });
  assert.equal(c.size, 0, 'a malformed snapshot restores to nothing');
});

ok('hierarchy: pieces never grow, travel at most SCATTER_FRAC of the tile, read quieter while out', () => {
  for (const scatter of GAIT_SCATTERS) {
    const g = gaitOf({ order: 'together', stagger: 0, scatter }, G.rejoin);
    const { steps } = run(g, (b) => b >= 0, 2 * BREAK_OUT_BEATS);
    const L = SCATTER_FRAC[scatter] * TILE.scale * ATTACH_BOX;
    for (const s of steps)
      for (let k = 0; k < REST.length; k++) {
        assert.equal(s.marks[k].scale, REST[k].scale, 'never grows');
        assert.ok(s.off[k] <= L + 1e-9, `${scatter}: within its scatter`);
        if (s.off[k] > 0) assert.ok(s.marks[k].alphaMul < 1 && s.marks[k].alphaMul >= PIECE_QUIET - 1e-12);
      }
  }
});

console.log(`gaitBreakup.selfcheck: ${n} checks ok`);
