// node src/curator/trailStats.selfcheck.mjs
// #1807 — the ACCUM buffer statistics as a show signal: the summary shaping (absence stays
// absence, honest numbers unclamped), the sampler's staleness log, and the pressure
// governor's law — actuating only when enabled, and in a scripted blowout pulling the
// optics scale down BEFORE saturation pressure crosses the deep line.
import assert from 'node:assert/strict';
import { trailSummary, createTrailSampler, STALE_MAX_FRAMES } from './trailStats.js';
import { createPressureGovernor, pressureScale, PRESSURE_WARN, PRESSURE_DEEP, SCALE_FLOOR } from './statsGovernor.mjs';

// --- the summary -------------------------------------------------------------
assert.equal(trailSummary(null), null, 'absent is null, never zeros');
assert.equal(trailSummary(undefined), null);
assert.equal(trailSummary({}), null);
assert.equal(trailSummary({ energy: 0.5, channels: [0.5, 0.5], saturation: 0.1 }), null, 'channels must be a triple');
assert.equal(trailSummary({ energy: NaN, channels: [0, 0, 0], saturation: 0 }), null, 'NaN is no reading');
assert.equal(trailSummary({ energy: 0.5, channels: [0.5, 0.5, 0.5], saturation: 'x' }), null);

const sum = trailSummary({
  frame: 45,
  energy: 1.8123456,
  channels: [2.1234567, 0.9876543, 0.1111111],
  saturation: 0.3333333,
});
assert.equal(sum.energy, 1.812, 'energy is rounded for speech but NOT clamped: HDR light says so');
assert.deepEqual(sum.channels, [2.123, 0.988, 0.111], 'channel means ride unclamped too');
assert.equal(sum.saturation, 0.333, 'saturation is a fraction');
assert.equal(trailSummary({ energy: 0, channels: [0, 0, 0], saturation: 1.7 }).saturation, 1, 'a fraction clamps at 1');
assert.equal(sum.frame, undefined, 'the stamp is backstage data — the persona block carries the numbers only');

// --- the sampler ---------------------------------------------------------------
const snap = (stats, frame) => ({ stats, frame });
const fresh = createTrailSampler(() =>
  snap({ frame: 45, energy: 0.4, channels: [0.5, 0.4, 0.3], saturation: 0.1 }, 50),
);
assert.deepEqual(
  fresh.sample(),
  { energy: 0.4, channels: [0.5, 0.4, 0.3], saturation: 0.1 },
  'a fresh reading shapes through',
);
assert.deepEqual(fresh.staleLog(), [], 'a fresh consumption logs nothing');

const stale = createTrailSampler(() =>
  snap({ frame: 45, energy: 0.4, channels: [0.5, 0.4, 0.3], saturation: 0.1 }, 45 + STALE_MAX_FRAMES + 15),
);
assert.ok(stale.sample(), 'a stale reading is still returned — flagged, not dressed up or dropped');
assert.equal(stale.staleLog().length, 1, 'a consumption past the staleness bound is logged');
assert.equal(stale.staleLog()[0].age, STALE_MAX_FRAMES + 15);
assert.equal(stale.staleLog()[0].stamp, 45);

assert.equal(createTrailSampler(() => null).sample(), null, 'no session: no summary');
assert.equal(createTrailSampler(() => snap(null, 10)).sample(), null, 'session live, first beat pending: no summary');
assert.equal(
  createTrailSampler(() => {
    throw new Error('wire down');
  }).sample(),
  null,
  'a throwing wire reads as absence',
);

// --- the governor's law ----------------------------------------------------------
assert.equal(pressureScale(0), 1);
assert.equal(pressureScale(PRESSURE_WARN), 1, 'the pull-down starts AT the warn line, not before');
assert.equal(pressureScale(PRESSURE_DEEP), SCALE_FLOOR, 'fully in at the deep line');
assert.ok(Math.abs(pressureScale(0.4) - 0.625) < 1e-9, 'linear between the lines');
assert.equal(pressureScale(2), SCALE_FLOOR, 'garbage pressure clamps, never explodes the scale');
assert.equal(pressureScale(NaN), 1, 'no reading, no shed');

// A scripted blowout, enabled: pressure climbs 0.10 -> 0.65, then recovers.
const gov = createPressureGovernor({ enabled: true });
const series = [0.1, 0.35, 0.45, 0.65, 0.2];
series.forEach((p, i) =>
  gov.observe({ frame: (i + 1) * 15, energy: 1, channels: [1, 1, 1], saturation: p }, (i + 1) * 15),
);
const rep = gov.report();
assert.equal(rep.observations, 5);
assert.equal(rep.sheds.length, 3, 'three downward moves: at 0.35, 0.45 and 0.65');
assert.ok(
  rep.sheds[2].saturation < PRESSURE_DEEP && rep.sheds[2].scale < 1,
  'the scale was already down before pressure crossed 0.50',
);
assert.equal(rep.scale, 1, 'recovery is the same law read backwards');
gov.observe({ frame: 90, energy: 2, channels: [2, 2, 2], saturation: 0.45 }, 90);
assert.ok(gov.report().scale < 1 && gov.report().scale > SCALE_FLOOR, 'mid pressure, mid scale');

// The same blowout, disabled (the v1 shipping default): data-only, forever.
const off = createPressureGovernor();
series.forEach((p, i) =>
  off.observe({ frame: (i + 1) * 15, energy: 1, channels: [1, 1, 1], saturation: p }, (i + 1) * 15),
);
const offRep = off.report();
assert.equal(offRep.enabled, false);
assert.equal(offRep.scale, 1, 'a disabled governor never actuates, at any pressure');
assert.deepEqual(offRep.sheds, [], 'and records no sheds — its report is an observation, not a claim of action');
assert.equal(offRep.observations, 5, 'but it did observe every reading');
assert.equal(offRep.saturation, 0.2, 'and reports the latest pressure honestly');

// Staleness: an old reading consumed late is logged; a re-offered sample is not a new observation.
const g2 = createPressureGovernor({ enabled: true });
g2.observe({ frame: 15, energy: 1, channels: [1, 1, 1], saturation: 0.1 }, 15 + STALE_MAX_FRAMES + 30);
assert.equal(g2.report().stale.length, 1, 'consumption of a too-old reading is logged');
g2.observe({ frame: 15, energy: 1, channels: [1, 1, 1], saturation: 0.9 }, 15);
assert.equal(g2.report().observations, 1, 'the same stamp twice is one observation');
assert.equal(g2.report().scale, 1, 'a re-offered stamp cannot move the scale');
assert.doesNotThrow(() => g2.observe(null, 10));
assert.doesNotThrow(() => g2.observe({}, 10));

console.log(
  'trailStats.selfcheck: ok (summary shaping + absence, sampler staleness log, governor law: shed before 0.50 when enabled, never actuates when disabled)',
);
