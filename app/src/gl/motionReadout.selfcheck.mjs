// #1469 — the MOTION readout: the always-alive motion as seven 0..1 readings; pure, read-only, honest when frozen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { motionReadout, LIFE_FULL, WIND_FULL, PALETTE_FULL } from './motionReadout.mjs';
import { publishMotion, readMotion, MOTION_KEYS } from './motionTap.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const LP = { ...DEFAULT_LAYOUT_PARAMS, kinemeBreath: 0.3, kinemeDrift: 0.5, kinemePulse: 0, kinemePattern: 'DRIFT', wind: 1.5, kinemePaletteBreath: 0.12 };
const R = (over = {}) => motionReadout({ layoutParams: LP, beatDrive: null, breathScale: 1, reducedMotion: false, slowRender: false, ...over }, {});

ok('the seven readings are the engine\'s own numbers, each 0..1', () => {
  const r = R({ breathScale: 1.012 });
  assert.deepEqual(Object.keys(r).sort(), [...MOTION_KEYS].sort());
  assert.ok(Math.abs(r.life - 0.012 / LIFE_FULL) < 1e-9);
  assert.equal(r.drift, 0.5); assert.equal(r.breath, 0.3);
  assert.ok(Math.abs(r.wind - 1.5 / WIND_FULL) < 1e-9);
  assert.ok(Math.abs(r.palette - 0.12 / PALETTE_FULL) < 1e-9);
  assert.equal(r.rhythm, 0, 'DRIFT is a driver pattern, not a placement rhythm');
  for (const v of Object.values(r)) assert.ok(v >= 0 && v <= 1);
});

ok('the pattern re-weights what it should: SWELL raises breath and cuts drift; THUMP follows the beat; ORGANIC and CADENCE switch the rhythm on', () => {
  const base = R();
  const swell = R({ layoutParams: { ...LP, kinemePattern: 'SWELL' } });
  assert.ok(swell.breath > base.breath && swell.drift < base.drift);
  const thumpQuiet = R({ layoutParams: { ...LP, kinemePattern: 'THUMP', kinemePulse: 0 }, beatDrive: 0 });
  const thumpHit = R({ layoutParams: { ...LP, kinemePattern: 'THUMP', kinemePulse: 0 }, beatDrive: 1 });
  assert.ok(thumpHit.pulse > thumpQuiet.pulse, 'a beat lifts the pulse');
  for (const p of ['ORGANIC', 'CADENCE']) assert.equal(R({ layoutParams: { ...LP, kinemePattern: p } }).rhythm, 1, p);
});

ok('honest when frozen: paused or shed reads all zeros, and reduced motion drops the palette breath (DS rule 7)', () => {
  const z = R({ slowRender: true, breathScale: 1.05 });
  assert.deepEqual(Object.values(z), [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(R({ reducedMotion: true }).palette, 0);
  assert.ok(R({ reducedMotion: false }).palette > 0);
});

ok('junk never produces NaN or a value out of range', () => {
  const j = motionReadout({ layoutParams: { kinemeBreath: NaN, kinemeDrift: 'x', wind: Infinity, kinemePattern: 'NOPE' }, breathScale: NaN, beatDrive: 'q' }, {});
  for (const v of Object.values(j)) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
  assert.doesNotThrow(() => motionReadout({}, {}));
});

ok('the tap holds the latest frame, in place, and ignores junk', () => {
  publishMotion({ life: 0.4, drift: 0.2, breath: 0.1, pulse: 0.9, wind: 0.5, rhythm: 1, palette: 0.3 });
  assert.equal(readMotion().pulse, 0.9);
  publishMotion({ life: NaN, drift: 'x' });
  assert.equal(readMotion().life, 0); assert.equal(readMotion().drift, 0);
  assert.equal(readMotion(), readMotion(), 'one object, no per-frame allocation');
});

ok('read only, off the store and the bus: the strip emits nothing and writes no state; the loop publishes it once a frame', () => {
  const strip = src('../panels/stimulus/MotionStrip.jsx').replace(/\/\/.*$/gm, '');
  assert.ok(!/\bemit\(|useStore|setState|dispatch|getState/.test(strip), 'no events, no store');
  assert.match(strip, /requestAnimationFrame/);
  assert.match(src('../panels/StimulusPanel.jsx'), /<MeterHero \/>[\s\S]*?<MotionStrip \/>/, 'beside the meter, STIMULI only');
  const loop = src('./liveLoop.mjs');
  assert.match(loop, /publishMotion\(motionReadout\(\{/);
  assert.match(loop, /breathScale: breathScaleSmoothed/);
  const tap = src('./motionTap.mjs').replace(/\/\/.*$/gm, '');
  assert.ok(!/Date\.now|performance\.now|Math\.random|setTimeout|setInterval/.test(tap) && !/state\/store/.test(tap));
});

console.log(`motionReadout.selfcheck: ${n} checks passed`);
