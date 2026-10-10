// node src/engine/kernel/sample/growth.nullaudio.selfcheck.mjs
// #1252 — pin null-audio growth reproducibility explicitly.
//
// THE INTENTIONAL SPLIT: `cellsPerTick` varies with `audioEnergy`, changing
// how many sequential-stream draws a tick consumes, so a live-grown form
// depends on audio history. Stills pass `audioEnergy=null` and stay
// deterministic. That split is intentional — do not "fix" the audio
// dependence by threading audio into the bake.
//
// This suite asserts two things:
//   (1) identical growth output at (seed, mode, tick) with `audioEnergy=null`
//       across runs — in-process replays (cache cleared) AND separate
//       processes (the `--digest` child runs below), so the pin covers real
//       run-to-run byte-identical output, not just cache behaviour;
//   (2) a non-null energy CAN diverge from the null run at the same
//       (seed, mode, tick) — the gap is load-bearing, and this assert keeps
//       it from being "fixed" later by someone who only read (1).
//
// This does NOT close #1185: a live-grown form still cannot be reproduced
// in a still. This pin documents and locks the null-audio determinism, not
// parity between live and still.
//
// #1242 (head index): the digest reads survivors through the exported
// `liveCount`/`liveCell` accessors — live cells in draw order, oldest living
// first — so the dequeue change cannot move the null-audio sequence without
// this suite noticing.

import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ensureAggregate,
  liveCount,
  liveCell,
  GrowthHooks,
} from './growth.js';

const { clearGrowth } = GrowthHooks;

/** Full growth output the sampler reads: survivors in draw order + births. */
function digestAggregate(seed, mode, tick, rate, branch, energy) {
  clearGrowth(seed, mode, null);
  const agg = ensureAggregate(seed, mode, tick, {
    growthRate: rate,
    growthBranch: branch,
    audioEnergy: energy,
    seedOffsets: null,
  });
  const n = liveCount(agg);
  const h = createHash('sha256');
  h.update(`mode=${mode};tick=${agg.tick};n=${n};`);
  for (let i = 0; i < n; i++) {
    const c = liveCell(agg, i);
    h.update(`${c.gx},${c.gy},${c.birth};`);
  }
  return h.digest('hex');
}

// --digest mode: print the digest for one configuration and exit. The main
// suite below spawns two of these as separate processes to pin genuine
// run-to-run byte-identical output.
if (process.argv[2] === '--digest') {
  const [, , , mode, seedS, tickS, rateS, branchS, energyS] = process.argv;
  const energy = energyS === 'null' ? null : Number(energyS);
  console.log(digestAggregate(Number(seedS), mode, Number(tickS), Number(rateS), Number(branchS), energy));
  process.exit(0);
}

function childDigest(mode, seed, tick, rate, branch, energy) {
  const r = spawnSync(process.execPath, [
    fileURLToPath(import.meta.url), '--digest',
    mode, String(seed), String(tick), String(rate), String(branch),
    energy === null ? 'null' : String(energy),
  ], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `--digest child failed: ${r.stderr}`);
  return r.stdout.trim();
}

// ── (1) Null-audio reproducibility: same (seed, mode, tick) → same output ─
{
  const REPRO = [
    // [mode, seed, tick, rate, branch] — the deep cases age out, so the head
    // index is active; the shallow cases never touch the bound.
    ['dla', 777, 450, 12, 0.7],
    ['eden', 4242, 400, 12, 0.8],
    ['dla', 1234, 60, 5, 0.8],
    ['eden', 999, 120, 3, 0.5],
  ];
  for (const [mode, seed, tick, rate, branch] of REPRO) {
    const first = digestAggregate(seed, mode, tick, rate, branch, null);
    const replay = digestAggregate(seed, mode, tick, rate, branch, null); // cache cleared
    assert.strictEqual(
      replay, first,
      `${mode}/${seed}@tick${tick}: null-audio output moved between replays`,
    );
  }
}

// ── (1b) Cross-process: byte-identical across real runs ───────────────────
{
  const runA = childDigest('dla', 777, 450, 12, 0.7, null);
  const runB = childDigest('dla', 777, 450, 12, 0.7, null);
  const inProcess = digestAggregate(777, 'dla', 450, 12, 0.7, null);
  assert.strictEqual(runA, runB, 'null-audio digest differs across processes');
  assert.strictEqual(runA, inProcess, 'null-audio digest differs in-process vs child');
  const edenA = childDigest('eden', 4242, 400, 12, 0.8, null);
  const edenB = childDigest('eden', 4242, 400, 12, 0.8, null);
  assert.strictEqual(edenA, edenB, 'eden null-audio digest differs across processes');
}

// ── (2) Audio dependence is real: non-null energy can diverge from null ────
// This assert is the second half of the #1252 contract — it keeps the gap
// from being "fixed" by someone who only read (1). Divergence comes from
// cellsPerTick: rate 5 → null gives 2 cells/tick, energy 1.0 gives 5,
// energy 0.0 gives 1 — different draw counts, different sequences.
{
  const DIVERGE = [
    ['dla', 777, 200, 5, 0.7],
    ['eden', 4242, 200, 5, 0.8],
    ['dla', 1234, 150, 5, 0.8],
  ];
  for (const [mode, seed, tick, rate, branch] of DIVERGE) {
    const nullRun = digestAggregate(seed, mode, tick, rate, branch, null);
    const loud = digestAggregate(seed, mode, tick, rate, branch, 1.0);
    assert.notStrictEqual(
      loud, nullRun,
      `${mode}/${seed}@tick${tick}: energy=1.0 matched the null run — the audio drive gap closed?`,
    );
    const silentZero = digestAggregate(seed, mode, tick, rate, branch, 0.0);
    assert.notStrictEqual(
      silentZero, nullRun,
      `${mode}/${seed}@tick${tick}: energy=0.0 matched the null run — the audio drive gap closed?`,
    );
  }
}

console.log('growth null-audio pin: OK — null runs byte-identical across runs, non-null energy diverges (#1252)');
