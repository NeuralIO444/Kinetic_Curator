// #1736 — drive-reduction learning: keeps (via the chemistry) teach which mode in which situation; the OHSS law holds.
import assert from 'node:assert/strict';
import {
  createPolicy,
  chooseMode,
  reinforce,
  cellFor,
  learnedFor,
  POLICY_SIZE,
  POLICY_RATES,
  N_MODES,
} from './creaturePolicy.js';
import { createChem, tickChem, CHEM } from './creatureChem.js';
import { CELL_COUNT, MODES } from './creatureGenome.js';

// 1. cells: band x crowd x facing = 18, each reachable, all in range
{
  const seen = new Set();
  for (const band of ['relax', 'normal', 'tighten'])
    for (const pressure of [0, 0.5, 0.9])
      for (const alignment of [-1, 1]) seen.add(cellFor({ band, pressure, alignment }));
  assert.equal(seen.size, CELL_COUNT);
  for (const c of seen) assert.ok(c >= 0 && c < CELL_COUNT);
  assert.equal(cellFor({}), cellFor({ band: 'normal', pressure: 0, alignment: 0 }));
}

// 2. learning: in one cell, a mode that is followed by reward comes to be chosen there; another cell is untouched
{
  const p = createPolicy();
  const cell = cellFor({ band: 'tighten', pressure: 0.9, alignment: 1 });
  const other = cellFor({ band: 'relax', pressure: 0, alignment: -1 });
  const target = MODES.indexOf('rest');
  for (let t = 0; t < 300; t++) {
    const m = chooseMode(p, cell, { seed: 11, key: 0, tick: t });
    reinforce(p, m === target ? 0.4 : 0, m === target ? 0 : 0.1);
  }
  let rest = 0;
  for (let t = 300; t < 400; t++) if (chooseMode(p, cell, { seed: 11, key: 0, tick: t }) === target) rest++;
  assert.ok(rest >= 80, `rewarded mode wins in its cell (${rest}/100)`);
  assert.ok(learnedFor(p, cell)[target] > 0, 'it reached the long-term weights');
  assert.deepEqual(learnedFor(p, other), [0, 0, 0, 0], 'a cell never visited learned nothing');
}

// 3. OHSS: endless reward never pushes a weight past the cap
{
  const p = createPolicy();
  for (let t = 0; t < 5000; t++) {
    chooseMode(p, t % CELL_COUNT, { seed: 3, key: 1, tick: t });
    reinforce(p, 1, 0);
  }
  for (let i = 0; i < POLICY_SIZE; i++)
    assert.ok(Math.abs(p.stw[i]) <= POLICY_RATES.wCap && Math.abs(p.ltw[i]) <= POLICY_RATES.wCap);
}

// 4. silence is neutral: with no reinforcement, LTW never moves and STW only relaxes toward it
{
  const p = createPolicy();
  for (let i = 0; i < POLICY_SIZE; i++) {
    p.ltw[i] = (i % 3) * 0.1 - 0.1;
    p.stw[i] = 0.5;
  }
  const ltw0 = [...p.ltw];
  for (let t = 0; t < 2000; t++) {
    chooseMode(p, t % CELL_COUNT, { seed: 9, key: 2, tick: t });
    reinforce(p, 0, 0);
  }
  assert.deepEqual([...p.ltw], ltw0, 'long-term weights untouched by silence');
  for (let i = 0; i < POLICY_SIZE; i++)
    assert.ok(Math.abs(p.stw[i] - p.ltw[i]) < 1e-6, 'short-term relaxed onto long-term');
}

// 5. drive-reduction end to end: a creature whose keeps arrive while it rests learns to rest when crowded and tight
{
  const p = createPolicy();
  const chem = createChem();
  const cell = cellFor({ band: 'tighten', pressure: 0.9, alignment: 1 });
  const REST = MODES.indexOf('rest');
  let mode = 0;
  for (let t = 0; t < 1200; t++) {
    mode = chooseMode(p, cell, { seed: 21, key: 4, tick: t });
    const kept = mode === REST && t % 3 === 0; // the artist keeps when the crowded creature rests
    const made = tickChem(chem, { band: 'tighten', pressure: 0.9, kept, modeChanged: true });
    reinforce(p, made.reward, made.punishment);
  }
  const l = learnedFor(p, cell);
  assert.equal(
    l.indexOf(Math.max(...l)),
    REST,
    `it learned to rest in that situation (${l.map((v) => v.toFixed(2)).join(' ')})`,
  );
  assert.ok(chem[CHEM.reward] <= 1);
}

// 6. temper biases the choice before anything is learned; choices are deterministic
{
  const p = createPolicy();
  const temper = MODES.map((_, m) => (m === 1 ? 0.4 : 0));
  let roam = 0;
  for (let t = 0; t < 100; t++) if (chooseMode(p, 0, { seed: 5, key: 3, tick: t, temper }) === 1) roam++;
  assert.ok(roam >= 85, `a roaming temper roams (${roam}/100)`);
  const a = createPolicy();
  const b = createPolicy();
  const seq = (q) => Array.from({ length: 50 }, (_, t) => chooseMode(q, t % 7, { seed: 8, key: 9, tick: t }));
  assert.deepEqual(seq(a), seq(b));
  assert.equal(N_MODES, 4);
}

console.log('creaturePolicy.selfcheck: OK (#1736)');
