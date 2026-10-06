// stimuliAuto.selfcheck.mjs — #980 one tap builds a routing that can move.
// node src/gl/stimuliAuto.selfcheck.mjs
import assert from 'node:assert/strict';
import { sanitizeAudioRoutes } from '../data/audioRoutes.js';
import {
  ENERGY_FLOOR, absorbPeaks, autoSetupRoutes, deadRouteIndexes, inputEnergy,
  retuneRoutes, snapshotFromReads, starterMovesScale,
  STARTER_MAX, STARTER_TARGETS,
} from './stimuliAuto.mjs';

const speech = {
  beat: 0.22, level: 0.4, bass: 0.18, mid: 0.55, treble: 0.3,
  bands: { sub: 0.02, bass: 0.2, mud: 0.15, mids: 0.62, edge: 0.4, pres: 0.48, air: 0 },
};

// #980 decision 4: starter targets are scale, alpha, squash, breath, light,
// accum — never color.hue, clock.kinemeRate or glow.
const FAIR = ['render.scale', 'render.alpha', 'render.squash', 'render.breath', 'light.intensity', 'render.accum'];
assert.deepEqual([...STARTER_TARGETS].sort(), [...FAIR].sort(), 'starter targets are exactly the agreed set');

const built = autoSetupRoutes(speech);
assert.equal(built.heard, true);
assert.ok(built.routes.length >= 3 && built.routes.length <= STARTER_MAX, `got ${built.routes.length} routes`);
assert.ok(!built.routes.some((r) => r.input === 'band.air'), 'a dead AIR band is never a starter input');
assert.ok(built.routes.some((r) => r.target === 'render.scale'), 'scale is always in the starter');
assert.ok(built.routes.every((r) => FAIR.includes(r.target)), 'no starter route uses an excluded target');
assert.ok(built.routes.every((r) => Number.isFinite(r.depth) && r.depth > 0), 'every starter depth can move something');
assert.equal(sanitizeAudioRoutes(built.routes) !== null, true, 'starter survives the route sanitizer');
assert.equal(starterMovesScale(built.routes, speech), true, 'speech snapshot moves the canvas');

// Silence is a no-op (#980: "say so plainly, change nothing").
const quiet = autoSetupRoutes({ beat: 0, level: 0, bass: 0, mid: 0, treble: 0, bands: { air: 0 } });
assert.equal(quiet.heard, false);
assert.equal(quiet.routes, null, 'silence builds no table: the panel reports it and changes nothing');
assert.deepEqual(quiet.picked, []);

const one = autoSetupRoutes({ beat: 0.5, level: 0.02, bass: 0, mid: 0, treble: 0, bands: {} });
assert.equal(one.picked.length, 1);
assert.equal(one.routes.length, 3, 'a single hot input still drives three axes');
assert.ok(one.routes.every((r) => r.input === 'beat'), 'one input, three routes');
assert.deepEqual(one.routes.map((r) => r.target), ['render.scale', 'render.alpha', 'render.squash']);

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

// RETUNE with nothing to work with is the same no-op as AUTO (#980).
const idle = retuneRoutes([], { beat: 0, level: 0, bass: 0, mid: 0, treble: 0, bands: {} });
assert.equal(idle.changed, false, 'no signal, no change');
assert.equal(idle.routes, null, 'RETUNE with no signal changes nothing');
assert.equal(idle.note, 'no signal — turn the mic on and play something');

console.log('stimuliAuto.selfcheck: OK');
