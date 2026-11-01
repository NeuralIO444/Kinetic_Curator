// fieldSilence.selfcheck.mjs — FIELD (#1904): the silence law, measured.
//
// Spec law: "Silence is default. A poem appears only when the Director arms
// one." This suite drives the REAL pick path (fieldEval's step — the exact
// function director.tick calls — plus a real Director) and measures how
// often a poet is armed. It then proves the wired consequence end to end:
// an unarmed (null) deal puts ZERO field stamps on the dish, through the
// real stamp path; an armed deal puts the form there.
//
// The measured rates are printed, not hidden: as shipped, choosePoet arms
// on essentially every pick (see the report's silence section). The wiring
// obeys the law; whether the DEAL needs a silence gate is Matt's call, and
// the "arming without rejection" pin below is the assertion a future gate
// must re-pin — with its cause named.
import assert from 'node:assert';
import { step, INITIAL_STATE, SCENARIOS, evalLoop } from './fieldEval.js';
import { choosePoet } from './fieldDirector.js';
import { createDirector } from './director.js';
import { loisActivity } from './loisActivity.js';
import { fieldFormForDeal } from '../poets/fieldForm.js';
import { buildPlacements } from '../engine/buildPlacements.js';
import { mkRng } from '../engine/prng.js';

const makeRng = (seed) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

// ── The pick module, driven directly: where does silence come from? ──────
{
  let armed = 0;
  let total = 0;
  for (const intensity of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    for (const slowDebt of [0, 3, 6]) {
      for (let seed = 1; seed <= 40; seed++) {
        total++;
        if (choosePoet({ intensity, slowDebt, rng: makeRng(seed * 131 + intensity * 1000), lastRejected: false })) armed++;
      }
    }
  }
  assert.strictEqual(armed, total, 'without a rejection, the pick arms on every draw (no arming gate exists)');
  console.log(`fieldSilence: pick grid without rejection — armed ${armed}/${total} (${((armed / total) * 100).toFixed(1)}%)`);

  let dampArmed = 0;
  let dampTotal = 0;
  for (let seed = 1; seed <= 400; seed++) {
    dampTotal++;
    // The damp draw must come from a WARM stream: both seeded prngs in this
    // repo deal first draws clustered near zero from small seeds, which
    // would fake a 0% rate. Production streams (the Director's persistent
    // rng, rngForIndex) are warm or hash-decorrelated — measure like them.
    const rng = mkRng(seed * 17 + 5);
    for (let i = 0; i < 8; i++) rng();
    if (choosePoet({ intensity: 0.5, slowDebt: 0, rng, lastRejected: true })) dampArmed++;
  }
  const dampRate = dampArmed / dampTotal;
  assert.ok(dampRate > 0.15 && dampRate < 0.45, `after a rejection, the damp arms at its design rate (~30%), measured ${(dampRate * 100).toFixed(1)}%`);
  console.log(`fieldSilence: pick grid after rejection — armed ${dampArmed}/${dampTotal} (${((dampArmed / dampTotal) * 100).toFixed(1)}%)`);
}

// ── The shipped eval loop over its scenarios (the offline pick path) ─────
for (const name of Object.keys(SCENARIOS)) {
  const r = evalLoop(42, 300, name);
  console.log(
    `fieldSilence: evalLoop ${name} — silence ${(r.silenceRate * 100).toFixed(1)}%, armed ${((1 - r.silenceRate) * 100).toFixed(1)}%`,
  );
}

// ── The real Director, live-singleton configuration (field rng = 0.5) ────
{
  const d = createDirector({ now: () => 1000, fieldRng: () => 0.5 });
  let armed = 0;
  const ticks = 24;
  for (let i = 0; i < ticks; i++) {
    const r = d.tick({ feed: loisActivity.snapshot(), nowTs: 1000 + i });
    if (r.poet) armed++;
  }
  console.log(`fieldSilence: live-config Director — armed ${armed}/${ticks} ticks`);
  assert.ok(armed > 0, 'the live-config Director arms poets at pick time');
}

// ── The wired consequence: unarmed ⇒ zero FIELD stamps on the dish ───────
{
  const params = {
    mode: 'grid',
    composition: 'default',
    count: 40,
    scale: [0.4, 0.8],
    rotate: [0, 45],
    alpha: [60, 100],
    jitter: 10,
    density: 100,
    zTiers: 1,
    bleed: false,
    mirror: false,
    overlap: true,
    displacement: 0,
    noiseFreq: 0.005,
    noiseSpeed: 0.5,
  };
  const caps = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };
  const assets = [
    { id: 'a', weight: 'heavy' },
    { id: 'b', weight: 'medium' },
  ];
  const palette = { swatches: ['#111', '#222', '#333', '#444'] };
  const dish = (layoutParams) =>
    buildPlacements({ layoutParams, seed: 7, activeAssets: assets, palette, caps, canvasW: 1000, canvasH: 700 }).items;
  const fieldCount = (items) => items.filter((it) => String(it.key).startsWith('field-')).length;

  // A null decision is silence: no payload, and the dish carries no field items.
  const silentForm = fieldFormForDeal(null, mkRng(5));
  assert.strictEqual(silentForm, null, 'a null deal produces no form payload');
  assert.strictEqual(fieldCount(dish(params)), 0, 'unarmed room: zero FIELD stamps reach the dish');

  // A live decision from the real step function arms the chain end to end.
  const { decision } = step({ ...INITIAL_STATE }, { intensity: 0.8, verdict: 'FULL BURN', rejected: false }, makeRng(99));
  assert.ok(decision, 'the hot-room step deals a poet');
  const form = fieldFormForDeal(decision, mkRng(5));
  assert.ok(form, 'the dealt poet produces a form');
  assert.strictEqual(fieldCount(dish({ ...params, fieldForm: form })), form.stamps.length, 'armed: every stamp reaches the dish');
}

console.log('fieldSilence.selfcheck: all assertions passed');
