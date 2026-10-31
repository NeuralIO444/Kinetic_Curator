// markov.js — a small MarkovJunior-style grid rewrite engine (#1823).
//
// MarkovJunior (Maxim Gumin, MIT) is a probabilistic rewrite language: a grid of cells,
// a list of rules "pattern → replacement", and a loop that finds a match, rewrites it,
// and repeats — one rule application per step, the choice among matches driven by a
// random stream. The designer authors the way results are made, not the results.
//
// This is KC-1's own JS idiom of that loop, not a port (the reference is C# with
// XML-authored rules). What is kept, faithfully:
//   · rules are small rectangular patterns, matched anywhere on the grid;
//   · a pattern is tried in every dihedral symmetry (4 rotations × reflection),
//     deduped — one written rule covers every direction, as in the reference;
//   · `*` is a wildcard: in an input pattern it matches any state; in an output
//     pattern it keeps the cell;
//   · a program is a sequence of phases; a phase fires its rules one application
//     per step until it reaches its step limit or no rule matches any more
//     ("exhaustion"), then the next phase runs. Exhaustion is what makes the
//     reference's maze idiom work: grow until blocked, then a later phase seals
//     whatever the growth left behind.
//
// Two declared deviations, both forced by KC-1 law:
//   · the random stream is the house seeded PRNG (mkRng): same seed + same program
//     → the same trajectory, step for step (the replay law; the reference is
//     interactive and makes no such promise);
//   · a phase's rules are chosen by WEIGHT among the rules that currently match,
//     not by raw match count. The reference has no rule weights; KC-1 needs a
//     knob (a pattern's MIX) to steer how eagerly one rule fires against another.
//     Weights are part of the program, so a trajectory is still fully seeded.
//
// Cost: the reference's search is unbounded; this engine is not. Every run takes a
// hard step budget and stops at it, mid-growth if necessary — callers declare the
// budget as a named constant and register a cost tier (the governor's law).
//
// Pure: no DOM, no clock, no Math.random. States are small integers; rules are
// authored as strings over a caller-supplied alphabet ({ '.': 0, 'H': 2, ... }).

import { mkRng } from '../prng.js';

/** The wildcard cell, in both input and output patterns. */
export const MARKOV_WILDCARD = '*';

/** Rotate a w×h char grid 90° clockwise → h×w. */
function rot90(g, w, h) {
  const out = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = g[y * w + x];
  return { g: out, w: h, h: w };
}

/** Mirror a w×h char grid left↔right. */
function flipX(g, w, h) {
  const out = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + (w - 1 - x)] = g[y * w + x];
  return { g: out, w, h };
}

const parseRows = (rows, label) => {
  if (!Array.isArray(rows) || !rows.length || rows.some((r) => typeof r !== 'string' || !r.length)) {
    throw new Error(`markov: ${label} must be a non-empty array of strings`);
  }
  const w = rows[0].length;
  if (rows.some((r) => r.length !== w)) throw new Error(`markov: ${label} rows must share one width`);
  return { chars: rows.flatMap((r) => [...r]), w, h: rows.length };
};

/**
 * Compile one rule: input pattern rows → output pattern rows (same dimensions),
 * over `alphabet` ({char: stateInt}); '*' is the wildcard in both. Returns
 * { variants: [{inp, out, w, h}], weight } with states as ints (-1 = wildcard).
 */
export function compileRule(inputRows, outputRows, alphabet, { weight = 1 } = {}) {
  const inp = parseRows(inputRows, 'rule input');
  const outp = parseRows(outputRows, 'rule output');
  if (inp.w !== outp.w || inp.h !== outp.h) throw new Error('markov: rule input and output must share dimensions');
  const toState = (c) => {
    if (c === MARKOV_WILDCARD) return -1;
    const s = alphabet[c];
    if (!Number.isInteger(s)) throw new Error(`markov: '${c}' is not in the rule alphabet`);
    return s;
  };
  // Input and output variants pair up by transform: walk the dihedral sequence
  // once, transforming both patterns together, and dedupe on the INPUT variant
  // (an input seen before under another transform adds no new way to match).
  const pairs = [];
  const seen = new Set();
  let ci = { g: inp.chars.slice(), w: inp.w, h: inp.h };
  let co = { g: outp.chars.slice(), w: outp.w, h: outp.h };
  for (let r = 0; r < 4; r++) {
    const steps = [
      [ci, co],
      [flipX(ci.g, ci.w, ci.h), flipX(co.g, co.w, co.h)],
    ];
    for (const [vi, vo] of steps) {
      const key = `${vi.w}x${vi.h}:${vi.g.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        inp: vi.g.map(toState),
        out: vo.g.map(toState),
        w: vi.w,
        h: vi.h,
      });
    }
    ci = rot90(ci.g, ci.w, ci.h);
    co = rot90(co.g, co.w, co.h);
  }
  return { variants: pairs, weight: Math.max(0, Number(weight) || 0) };
}

/** Every top-left position where `variant` matches `cells` (row-major, cols×rows). */
export function findMatches(cells, cols, rows, variant) {
  const { inp, w, h } = variant;
  const out = [];
  if (w > cols || h > rows) return out;
  for (let y = 0; y + h <= rows; y++) {
    for (let x = 0; x + w <= cols; x++) {
      let hit = true;
      for (let dy = 0; dy < h && hit; dy++) {
        const rowBase = (y + dy) * cols + x;
        const patBase = dy * w;
        for (let dx = 0; dx < w; dx++) {
          const want = inp[patBase + dx];
          if (want !== -1 && cells[rowBase + dx] !== want) {
            hit = false;
            break;
          }
        }
      }
      if (hit) out.push({ x, y });
    }
  }
  return out;
}

/** All matches of a compiled rule (every variant), as [{x, y, variant}]. */
export function ruleMatches(cells, cols, rows, rule) {
  const out = [];
  for (const variant of rule.variants) {
    for (const m of findMatches(cells, cols, rows, variant)) out.push({ ...m, variant });
  }
  return out;
}

/**
 * A rewrite program runner over a cols×rows grid.
 *   phases: [{ rules: [compiledRule...], steps: number }] — steps may be Infinity
 *           ("until exhaustion"). A phase ends when its step count is spent or no
 *           rule in it matches; the program ends when its last phase does.
 *   initial: optional Uint8Array/array of starting states (copied).
 *   seed: the match-choice stream. One stream for the whole run: trajectory =
 *         f(seed, program, initial grid), reproducible step for step.
 * step() applies ONE rule application and returns { phase, changed: [cellIndices] },
 * or null when the program is complete. run(budget) steps until completion or the
 * budget is spent — the budget is a hard stop, never a loop-forever.
 */
export function createRewrite({ cols, rows, phases, initial = null, seed = 1 }) {
  const cells = new Uint8Array(cols * rows);
  if (initial) cells.set(initial.subarray ? initial.subarray(0, cols * rows) : initial.slice(0, cols * rows));
  const rng = mkRng(seed >>> 0);
  const prog = (phases || []).map((p) => ({ rules: p.rules || [], steps: p.steps ?? Infinity, taken: 0 }));
  let phaseIndex = 0;
  let steps = 0;
  let done = prog.length === 0;

  const step = () => {
    while (!done) {
      const phase = prog[phaseIndex];
      if (!phase || phase.taken >= phase.steps) {
        phaseIndex++;
        if (phaseIndex >= prog.length) done = true;
        continue;
      }
      // rules that can fire right now, with their matches
      const live = [];
      let totalW = 0;
      for (const rule of phase.rules) {
        if (!(rule.weight > 0)) continue;
        const matches = ruleMatches(cells, cols, rows, rule);
        if (matches.length) {
          live.push({ rule, matches });
          totalW += rule.weight;
        }
      }
      if (!live.length) {
        phase.taken = phase.steps; // exhausted: fall through to the next phase
        continue;
      }
      let pick = rng() * totalW;
      let chosen = live[live.length - 1];
      for (const entry of live) {
        pick -= entry.rule.weight;
        if (pick < 0) {
          chosen = entry;
          break;
        }
      }
      const m = chosen.matches[Math.floor(rng() * chosen.matches.length)];
      const { out, w, h } = m.variant;
      const changed = [];
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const v = out[dy * w + dx];
          if (v === -1) continue;
          const i = (m.y + dy) * cols + (m.x + dx);
          if (cells[i] !== v) {
            cells[i] = v;
            changed.push(i);
          }
        }
      }
      phase.taken++;
      steps++;
      return { phase: phaseIndex, changed };
    }
    return null;
  };

  return {
    cells,
    cols,
    rows,
    step,
    run(budget = Infinity) {
      const cap = Math.max(0, Math.floor(budget));
      let n = 0;
      while (n < cap && step()) n++;
      return n;
    },
    get steps() {
      return steps;
    },
    get done() {
      return done;
    },
    get phaseIndex() {
      return phaseIndex;
    },
  };
}
