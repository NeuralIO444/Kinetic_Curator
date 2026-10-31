// markov.selfcheck.mjs — the MarkovJunior-style rewrite engine (#1823).
//
// What the engine promises, as checks:
//   one written rule matches in every direction (dihedral symmetries, deduped);
//   a program is phases that run one application per step and end on their step
//   limit or on exhaustion; exhaustion is what lets a later phase seal what
//   growth left behind (the reference's maze idiom); the whole trajectory is a
//   function of the seed (replay law); a run's budget is a HARD stop.
import assert from 'node:assert';
import { compileRule, createRewrite, findMatches, ruleMatches } from './markov.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const A = { '.': 0, P: 1, H: 2, B: 3, C: 4 };
const gridOf = (rows) => ({
  cells: Uint8Array.from(rows.flatMap((r) => [...r].map((c) => A[c]))),
  cols: rows[0].length,
  rows: rows.length,
});
const asRows = (cells, cols, rows) => {
  const inv = Object.fromEntries(Object.entries(A).map(([k, v]) => [v, k]));
  const out = [];
  for (let y = 0; y < rows; y++) out.push([...cells.subarray(y * cols, (y + 1) * cols)].map((s) => inv[s]).join(''));
  return out;
};

ok('one written rule covers every direction: symmetries are generated and deduped', () => {
  const extend = compileRule(['H.'], ['PH'], A);
  assert.equal(extend.variants.length, 4, 'a 1×2 rule has exactly the 4 directional variants');
  const dirs = new Set(extend.variants.map((v) => `${v.w}x${v.h}`));
  assert.deepEqual([...dirs].sort(), ['1x2', '2x1']);
  assert.equal(compileRule(['H'], ['P'], A).variants.length, 1, 'a 1×1 rule has one variant');
  assert.equal(compileRule(['HH'], ['PP'], A).variants.length, 2, 'a symmetric 1×2 dedupes to 2');
  assert.throws(() => compileRule(['HX'], ['PP'], A), /not in the rule alphabet/);
  assert.throws(() => compileRule(['H.'], ['P'], A), /share dimensions/);
});

ok('matching: wildcards match anything, patterns do not wrap off the edge', () => {
  const g = gridOf(['H..', '...', '..H']);
  const extend = compileRule(['H.'], ['PH'], A);
  const matches = ruleMatches(g.cells, g.cols, g.rows, extend);
  // the corner head can only grow left/up: matches exist, none out of bounds
  assert.ok(matches.length >= 2);
  for (const m of matches) {
    assert.ok(m.x + m.variant.w <= g.cols && m.y + m.variant.h <= g.rows);
  }
  const any = compileRule(['*H'], ['**'], A);
  assert.equal(
    findMatches(g.cells, g.cols, g.rows, any.variants[0]).length,
    1,
    'the *H variant finds the left-edge head',
  );
});

ok('the maze idiom: grow to exhaustion, then a later phase seals the leftover head', () => {
  // a 5×1 corridor: extend runs the head to the wall, seal turns it into path.
  const phases = [
    { rules: [compileRule(['H.'], ['PH'], A)], steps: Infinity },
    { rules: [compileRule(['H'], ['P'], A)], steps: Infinity },
  ];
  const run = createRewrite({ cols: 5, rows: 1, phases, initial: gridOf(['H....']).cells, seed: 3 });
  const taken = run.run(100);
  assert.ok(run.done, 'the program completes');
  assert.equal(taken, 5, 'four extends + one seal');
  assert.deepEqual(asRows(run.cells, 5, 1), ['PPPPP']);
});

ok('a phase step limit is honoured before exhaustion, and the next phase still runs', () => {
  const phases = [
    { rules: [compileRule(['H.'], ['PH'], A)], steps: 2 },
    { rules: [compileRule(['H'], ['P'], A)], steps: Infinity },
  ];
  const run = createRewrite({ cols: 6, rows: 1, phases, initial: gridOf(['H.....']).cells, seed: 3 });
  run.run(100);
  assert.ok(run.done);
  assert.deepEqual(asRows(run.cells, 6, 1), ['PPP...'], 'two extends, then the seal fires where the head stopped');
});

ok('replay law: same seed + program = the same trajectory, step for step; the seed steers choices', () => {
  const program = () => [
    {
      rules: [compileRule(['H.'], ['PH'], A), compileRule(['P.'], ['PH'], A, { weight: 0.3 })],
      steps: Infinity,
    },
    { rules: [compileRule(['H'], ['P'], A)], steps: Infinity },
  ];
  const traj = (seed) => {
    const init = new Uint8Array(8 * 8);
    init[3 * 8 + 3] = A.H;
    const run = createRewrite({ cols: 8, rows: 8, phases: program(), initial: init, seed });
    const frames = [];
    while (run.step()) frames.push(run.cells.slice());
    return frames;
  };
  const a = traj(11);
  const b = traj(11);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) assert.deepEqual(a[i], b[i], `frame ${i} is identical`);
  // an open grid fills completely under any seed, so compare whole trajectories:
  // the ORDER cells are born is the seed's fingerprint even when the fill converges.
  const paths = new Set(
    [11, 12, 13, 14, 15].map((s) =>
      traj(s)
        .map((f) => f.join(','))
        .join('|'),
    ),
  );
  assert.ok(paths.size > 1, 'different seeds grow by different paths');
});

ok('the budget is a hard stop: a program that never exhausts halts at the budget, mid-flight', () => {
  // flip-flop rules can fire forever; the run must still stop.
  const phases = [{ rules: [compileRule(['B'], ['C'], A), compileRule(['C'], ['B'], A)], steps: Infinity }];
  const run = createRewrite({ cols: 2, rows: 2, phases, initial: gridOf(['BB', 'BB']).cells, seed: 5 });
  const taken = run.run(50);
  assert.equal(taken, 50, 'exactly the budget, no more');
  assert.ok(!run.done, 'and the program honestly reports itself unfinished');
  assert.equal(run.run(0), 0, 'a zero budget is no steps');
});

ok('rule weights steer choice; a zero-weight rule never fires while a weighted one matches', () => {
  const phases = [
    {
      rules: [compileRule(['B'], ['P'], A, { weight: 0 }), compileRule(['B'], ['C'], A, { weight: 1 })],
      steps: Infinity,
    },
  ];
  const run = createRewrite({ cols: 3, rows: 3, phases, initial: gridOf(['BBB', 'BBB', 'BBB']).cells, seed: 9 });
  run.run(100);
  assert.ok(run.done);
  assert.deepEqual(asRows(run.cells, 3, 3), ['CCC', 'CCC', 'CCC'], 'every cell took the weighted rule');
});

ok("output '*' keeps the cell: a rule can mark a neighbour without touching the anchor", () => {
  const phases = [{ rules: [compileRule(['HB'], ['*C'], A)], steps: Infinity }];
  const run = createRewrite({ cols: 3, rows: 1, phases, initial: gridOf(['HB.']).cells, seed: 1 });
  run.run(10);
  assert.deepEqual(asRows(run.cells, 3, 1), ['HC.'], 'the head survives; its neighbour was rewritten');
});

console.log(`markov.selfcheck: ${n} checks passed`);
