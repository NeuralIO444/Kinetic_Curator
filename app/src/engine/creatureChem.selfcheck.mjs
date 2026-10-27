// #1735 — creature biochemistry: drives are chemicals fed by honest emitters, reward/punishment are manufactured only
// from drive change, everything is capped and the signals are short-lived (OHSS), and the body reads the dominant drive.
import assert from 'node:assert/strict';
import { createChem, tickChem, totalDrive, dominantDrive, materialFor, CHEM, CHEM_RATES } from './creatureChem.js';

const run = (chem, n, ev = {}, gains = {}) => {
  const made = [];
  for (let i = 0; i < n; i++) made.push(tickChem(chem, ev, gains));
  return made;
};

// 1. no keeps for a long while: approval climbs and dominates; the body withers
{
  const c = createChem();
  run(c, 200, { band: 'relax', pressure: 0, modeChanged: true });
  assert.equal(dominantDrive(c), 'approval');
  const m = materialFor(c);
  assert.ok(m.bodyScale < 1 && m.dim < 1, 'a starved creature withers');
}

// 2. a keep drops the approval drive and that DROP makes reward; the body blooms
{
  const c = createChem();
  run(c, 200, { band: 'relax', modeChanged: true });
  const before = c[CHEM.approval];
  const made = tickChem(c, { band: 'relax', kept: true });
  assert.ok(c[CHEM.approval] < before * 0.5, 'a keep is an approval-drive dropping');
  assert.ok(made.reward > 0 && made.punishment === 0, 'reward is manufactured by the drop');
  assert.ok(c[CHEM.reward] > 0, 'the reward chemical is in the body');
  const fresh = createChem();
  fresh[CHEM.reward] = c[CHEM.reward];
  assert.ok(materialFor(fresh).bodyScale > 1, 'reward blooms the body');
}

// 3. silence is neutral: a steady world manufactures nothing once the drives settle
{
  const c = createChem();
  c[CHEM.approval] = 0; // hold approval still by keeping each tick, and everything else steady
  for (let i = 0; i < 400; i++) tickChem(c, { band: 'normal', pressure: 0.5, kept: true, modeChanged: true });
  const made = run(c, 20, { band: 'normal', pressure: 0.5, kept: true, modeChanged: true });
  for (const m of made)
    assert.ok(
      m.reward < 0.02 && m.punishment < 0.02,
      `settled world makes ~nothing (${m.reward.toFixed(4)}, ${m.punishment.toFixed(4)})`,
    );
}

// 4. OHSS: capped at 1, and the signals fade fast (a few ticks of nothing and they are near zero)
{
  const c = createChem();
  for (let i = 0; i < 1000; i++)
    tickChem(c, { band: 'tighten', pressure: 1 }, { approval: 2, crowding: 2, strain: 2, boredom: 2 });
  for (let k = 0; k < c.length; k++) assert.ok(c[k] >= 0 && c[k] <= 1, `slot ${k} capped`);
  c[CHEM.reward] = 1;
  run(
    c,
    CHEM_RATES.signalHalfLife * 4,
    { band: 'tighten', pressure: 1 },
    { approval: 0.25, crowding: 2, strain: 2, boredom: 0.25 },
  );
  assert.ok(c[CHEM.reward] < 0.1, `reward is short-lived (${c[CHEM.reward].toFixed(3)})`);
}

// 5. emitters: crowding follows pressure, strain follows the band; genome gains change the animal
{
  const a = createChem();
  const b = createChem();
  run(a, 60, { band: 'tighten', pressure: 0.9, modeChanged: true });
  run(b, 60, { band: 'relax', pressure: 0.1, modeChanged: true });
  assert.ok(a[CHEM.crowding] > b[CHEM.crowding] && a[CHEM.strain] > b[CHEM.strain]);
  const lo = createChem();
  const hi = createChem();
  run(lo, 50, { band: 'relax' }, { approval: 0.5 });
  run(hi, 50, { band: 'relax' }, { approval: 2 });
  assert.ok(hi[CHEM.approval] > lo[CHEM.approval] * 2, 'a high approval gain wants keeps faster');
}

// 6. deterministic, and totalDrive is in 0..1
{
  const a = createChem();
  const b = createChem();
  run(a, 77, { band: 'normal', pressure: 0.3 });
  run(b, 77, { band: 'normal', pressure: 0.3 });
  assert.deepEqual([...a], [...b]);
  assert.ok(totalDrive(a) >= 0 && totalDrive(a) <= 1);
  assert.equal(dominantDrive(createChem()), null, 'a newborn wants nothing yet');
}

console.log('creatureChem.selfcheck: OK (#1735)');
