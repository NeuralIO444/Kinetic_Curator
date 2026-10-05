// stimuliAuto.selfcheck.mjs — #980 one tap builds a routing that can move.
// node src/gl/stimuliAuto.selfcheck.mjs
import assert from 'node:assert/strict';
import { sanitizeAudioRoutes } from '../data/audioRoutes.js';
import {
  ENERGY_FLOOR, absorbPeaks, autoSetupRoutes, deadRouteIndexes, inputEnergy,
  retuneRoutes, snapshotFromReads, starterMovesScale,
} from './stimuliAuto.mjs';

const speech = {
  beat: 0.22, level: 0.4, bass: 0.18, mid: 0.55, treble: 0.3,
  bands: { sub: 0.02, bass: 0.2, mud: 0.15, mids: 0.62, edge: 0.4, pres: 0.48, air: 0 },
};

const built = autoSetupRoutes(speech);
assert.equal(built.heard, true);
assert.ok(built.routes.length >= 3 && built.routes.length <= 4);
assert.ok(!built.routes.some((r) => r.input === 'band.air'), 'a dead AIR band is never a starter input');
assert.ok(built.routes.some((r) => r.target === 'render.scale'), 'scale is always in the starter');
assert.equal(sanitizeAudioRoutes(built.routes) !== null, true, 'starter survives the route sanitizer');
assert.equal(starterMovesScale(built.routes, speech), true, 'speech snapshot moves the canvas');

const quiet = autoSetupRoutes({ beat: 0, level: 0, bass: 0, mid: 0, treble: 0, bands: { air: 0 } });
assert.equal(quiet.heard, false);
assert.ok(quiet.routes.every((r) => !r.input.startsWith('band.')), 'silence arms coarse inputs, not empty bands');
assert.equal(quiet.routes[0].depth > 0, true);

const one = autoSetupRoutes({ beat: 0.5, level: 0.02, bass: 0, mid: 0, treble: 0, bands: {} });
assert.equal(one.picked.length, 1);
assert.equal(one.routes.length, 3, 'a single hot input still drives scale, alpha and glow');
assert.ok(one.routes.every((r) => r.input === 'beat'));

const peaks = absorbPeaks(absorbPeaks(null, { beat: 0.1, bands: { mids: 0.2 } }), { beat: 0.4, bands: { mids: 0.05, pres: 0.3 } });
assert.equal(peaks.beat, 0.4);
assert.equal(peaks.bands.mids, 0.2, 'peaks hold; a quieter frame does not erase');
assert.equal(peaks.bands.pres, 0.3);

const fromReads = snapshotFromReads({ audioBands: { rms: 0.33, bass: 0.1, mid: 0.2, treble: 0 }, beatPulse: 0.5, meter: { air: 0, mids: 0.4 } });
assert.equal(inputEnergy('level', fromReads), 0.33);
assert.equal(inputEnergy('band.mids', fromReads), 0.4);
assert.equal(inputEnergy('band.air', fromReads), 0);

const parked = [
  { input: 'band.air', target: 'render.scale', depth: 0.4 },
  { input: 'beat', target: 'render.alpha', depth: 0 },
  { input: 'mid', target: 'render.glow', depth: 0.5 },
];
assert.deepEqual(deadRouteIndexes(parked, speech), [0, 1]);
const tuned = retuneRoutes(parked, speech);
assert.equal(tuned.changed, true);
assert.equal(tuned.fixed, 2);
assert.notEqual(tuned.routes[0].input, 'band.air');
assert.ok(inputEnergy(tuned.routes[0].input, speech) >= ENERGY_FLOOR);
assert.ok(Math.abs(tuned.routes[1].depth) >= 0.001, 'a mute depth on a live input is raised');
assert.equal(tuned.routes[2].input, 'mid', 'a live route is left alone');
assert.equal(retuneRoutes(tuned.routes, speech).changed, false);

const empty = retuneRoutes([], speech);
assert.equal(empty.changed, true);
assert.ok(empty.routes.length >= 3);

console.log('stimuliAuto.selfcheck: OK');
