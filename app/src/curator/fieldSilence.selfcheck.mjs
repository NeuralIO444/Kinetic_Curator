// fieldSilence.selfcheck.mjs — FIELD (#1904): the silence law, measured.
// Re-pinned by #1932 (cause: Matt's clarification 2026-11-03 — the silence gate this
// suite's header always said was "Matt's call" is now ruled and built).
//
// Spec law: "Silence is default. A poem appears only when the Director arms
// one." As shipped in #1904 the pick armed on essentially every draw — silence
// 0.0% in every scenario — because the arming decision had no reason to say no.
// #1932 gives it two: the GENRE GATE (the room's dealt look family must be
// type-native — swiss / bauhaus / japanese — or the decision is silence,
// regardless of temperature) and the THRESHOLD (a dealt piece must place at
// least FIELD_POEM_MIN_STAMPS letters, or the deal is silence: a fragment is
// not a poem). This suite drives the REAL pick path (fieldEval's step — the
// exact function director.tick calls — plus a real Director) and measures the
// rates under the gate, then proves the wired consequence end to end: an
// unarmed deal puts ZERO field stamps on the dish; an armed deal's form stands
// on the dish as stamps among the marks (the #1928 plate is retired; the stamp
// path itself is proven in poets/fieldStampPath.selfcheck.mjs).
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

const grid = (pick) => {
  let armed = 0;
  let total = 0;
  for (const intensity of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    for (const slowDebt of [0, 3, 6]) {
      for (let seed = 1; seed <= 40; seed++) {
        total++;
        if (pick({ intensity, slowDebt, rng: makeRng(seed * 131 + intensity * 1000) })) armed++;
      }
    }
  }
  return { armed, total };
};

// ── The pick module, driven directly: where does silence come from? ──────
{
  // #1932 re-pin of the "arming without rejection" pin (the gate it waited for):
  // WITH eligibility affirmed, temperature alone still never silences — the pick
  // arms on every draw, exactly as #1904 measured. WITHOUT it, the gate speaks
  // first and every draw is silence.
  const elig = grid((p) => choosePoet({ ...p, lastRejected: false, typeEligible: true }));
  assert.strictEqual(elig.armed, elig.total, 'eligible room, no rejection: the pick arms on every draw');
  console.log(
    `fieldSilence: pick grid, eligible, without rejection — armed ${elig.armed}/${elig.total} (${((elig.armed / elig.total) * 100).toFixed(1)}%)`,
  );
  const gated = grid((p) => choosePoet({ ...p, lastRejected: false }));
  assert.strictEqual(gated.armed, 0, 'no eligibility affirmed: the gate silences every draw, at any temperature');
  console.log(
    `fieldSilence: pick grid, no eligibility — armed ${gated.armed}/${gated.total} (${((gated.armed / gated.total) * 100).toFixed(1)}%)`,
  );

  // The same gate through the REAL step: a non-type-native family is silence
  // even in a hot room; a type-native family arms.
  let stepGated = 0;
  let stepArmed = 0;
  let stepTotal = 0;
  for (let seed = 1; seed <= 200; seed++) {
    stepTotal++;
    const hot = { intensity: 0.9, verdict: 'FULL BURN', rejected: false };
    if (step({ ...INITIAL_STATE }, { ...hot, lookFamily: 'grunge' }, makeRng(seed)).decision) stepGated++;
    if (step({ ...INITIAL_STATE }, { ...hot, lookFamily: 'japanese' }, makeRng(seed)).decision) stepArmed++;
  }
  assert.strictEqual(stepGated, 0, 'step: a grunge room is silent even at full burn');
  assert.strictEqual(stepArmed, stepTotal, 'step: a japanese room arms at full burn');
  console.log(
    `fieldSilence: step grid (hot room) — grunge armed ${stepGated}/${stepTotal}, japanese armed ${stepArmed}/${stepTotal}`,
  );

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
    if (choosePoet({ intensity: 0.5, slowDebt: 0, rng, lastRejected: true, typeEligible: true })) dampArmed++;
  }
  const dampRate = dampArmed / dampTotal;
  assert.ok(
    dampRate > 0.15 && dampRate < 0.45,
    `after a rejection, the damp arms at its design rate (~30%), measured ${(dampRate * 100).toFixed(1)}%`,
  );
  console.log(
    `fieldSilence: pick grid after rejection (eligible) — armed ${dampArmed}/${dampTotal} (${((dampArmed / dampTotal) * 100).toFixed(1)}%)`,
  );
}

// ── The shipped eval loop over its scenarios (the offline pick path) ─────
// #1932: the scenarios stand in a type-native room (lookFamily 'swiss' — see
// fieldEval.js), so these rates still measure the temperature behaviour: the
// gate's silence does not appear here because the room is eligible by design.
for (const name of Object.keys(SCENARIOS)) {
  const r = evalLoop(42, 300, name);
  console.log(
    `fieldSilence: evalLoop ${name} — silence ${(r.silenceRate * 100).toFixed(1)}%, armed ${((1 - r.silenceRate) * 100).toFixed(1)}%`,
  );
}

// ── The real Director, live-singleton configuration ─────────────────────
// #1917: the live construction carries NO injected fieldRng — it deals off
// the shipped per-tick seeded stream. #1932 re-pin (cause: the genre gate):
// a Director told NO room deals silence on every tick — silence is the
// default — while the same configuration in a named type-native room arms.
{
  const d = createDirector({ now: () => 1000 });
  let armed = 0;
  const ticks = 24;
  for (let i = 0; i < ticks; i++) {
    const r = d.tick({ feed: loisActivity.snapshot(), nowTs: 1000 + i });
    if (r.poet) armed++;
  }
  console.log(`fieldSilence: live-config Director, no room named — armed ${armed}/${ticks} ticks`);
  assert.strictEqual(armed, 0, 'no room named: the live-config Director is silent (silence is the default)');
}
{
  const d = createDirector({ now: () => 1000 });
  let armed = 0;
  const ticks = 24;
  for (let i = 0; i < ticks; i++) {
    const r = d.tick({ feed: loisActivity.snapshot(), nowTs: 1000 + i, lookFamily: 'swiss' });
    if (r.poet) armed++;
  }
  console.log(`fieldSilence: live-config Director, swiss room — armed ${armed}/${ticks} ticks`);
  assert.ok(armed > 0, 'a named type-native room arms poets at pick time');
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

  // #1932 acceptance, wired: a hot room whose look is NOT type-native deals no
  // poet, forms no form, and the dish carries no poem — and the absence is the
  // design, not a missing feature.
  const { decision: gatedDecision } = step(
    { ...INITIAL_STATE },
    { intensity: 0.8, verdict: 'FULL BURN', rejected: false, lookFamily: 'grunge' },
    makeRng(99),
  );
  assert.strictEqual(gatedDecision, null, 'a non-type-native room deals silence, however hot');
  assert.strictEqual(fieldFormForDeal(gatedDecision, mkRng(5)), null, 'silence forms no form');
  assert.strictEqual(fieldCount(dish(params)), 0, 'the gated room: zero FIELD stamps on the dish');

  // A live decision from the real step function in a type-native room arms the
  // chain end to end — and #1932 puts the form ON the dish: every placed stamp
  // stands among the marks (the plate assertion that stood here is retired
  // with the plate; the stamp path is proven in fieldStampPath).
  const { decision } = step(
    { ...INITIAL_STATE },
    { intensity: 0.8, verdict: 'FULL BURN', rejected: false, lookFamily: 'swiss' },
    makeRng(99),
  );
  assert.ok(decision, 'the hot type-native step deals a poet');
  const form = fieldFormForDeal(decision, mkRng(5));
  assert.ok(form, 'the dealt poet produces a form');
  assert.strictEqual(
    fieldCount(dish({ ...params, fieldForm: form })),
    form.stamps.length,
    'armed: every stamp of the form stands on the dish',
  );
}

console.log('fieldSilence.selfcheck: all assertions passed');
