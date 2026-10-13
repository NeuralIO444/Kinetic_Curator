// #1475 — the player: a pattern at a beat position -> band levels and a beat pulse, pure and periodic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BEATS, findBeat } from './beatLibrary.js';
import { playLevels } from './beatPlayer.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const four = findBeat('four-floor');
const BANDS = ['sub', 'bass', 'mud', 'mids', 'edge', 'pres', 'air'];

ok('a kick lands on the low bands and a hat on the high ones, and both fade between hits', () => {
  const hit = playLevels(four, 0, { intensity: 1 }); // beat 0: kick (and bass)
  assert.ok(hit.bands.sub > 0.6 && hit.bands.bass > 0.6, `kick low (${hit.bands.sub}, ${hit.bands.bass})`);
  assert.ok(hit.coarse.beatPulse > 0.5, 'the kick is the beat pulse');
  const later = playLevels(four, 0.45, { intensity: 1 });
  assert.ok(later.bands.sub < hit.bands.sub * 0.5, 'decays between hits');
  const hat = playLevels(four, 0.5, { intensity: 1 }); // step 2: the hat
  assert.ok(hat.bands.air > hat.bands.sub * 0.5 && hat.bands.air > 0.2, `a hat opens the top (${hat.bands.air})`);
});

ok('every level is 0..1 and finite, for every pattern, across several bars', () => {
  for (const b of BEATS) for (let p = 0; p < 16; p += 0.173) {
    const { bands, coarse } = playLevels(b, p, { intensity: 1 });
    for (const k of BANDS) assert.ok(Number.isFinite(bands[k]) && bands[k] >= 0 && bands[k] <= 1, `${b.id} ${k} @${p}`);
    for (const v of Object.values(coarse)) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `${b.id} coarse @${p}`);
  }
});

ok('periodic: the hits repeat every bar and the whole set exactly every four bars (the bed breathes over 16 beats)', () => {
  for (const b of BEATS) for (const p of [0, 0.3, 1.1, 2.9, 3.99]) {
    const u = playLevels(b, p, { intensity: 0.7 }); const v = playLevels(b, p + 16, { intensity: 0.7 });
    for (const k of BANDS) assert.ok(Math.abs(u.bands[k] - v.bands[k]) < 1e-9, `${b.id} ${k} @${p}: the same over 16 beats`);
    const x = playLevels(b, p, { intensity: 0.7 }); const y = playLevels(b, p + 4, { intensity: 0.7 });
    for (const k of BANDS) assert.ok(Math.abs(x.bands[k] - y.bands[k]) <= 0.2 * 0.7 + 1e-9, `${b.id} ${k} @${p}: a bar later differs only by the bed`);
  }
});

ok('intensity scales the whole set and 0 is silence; the bed keeps a gap from being dead', () => {
  const hi = playLevels(four, 0, { intensity: 1 }).bands.sub;
  const lo = playLevels(four, 0, { intensity: 0.4 }).bands.sub;
  assert.ok(lo < hi && lo > 0);
  assert.equal(playLevels(four, 0, { intensity: 0 }).bands.sub, 0);
  const gap = playLevels(findBeat('pulse'), 3.5, { intensity: 1 }); // between the one slow hit and the next bar
  assert.ok(gap.coarse.rms > 0, 'a gap still has its bed');
});

ok('swing delays the odd sixteenths: at an odd step a swung hat has not landed yet, and lands later', () => {
  const e = findBeat('eighths'); // a hat on every step
  const straight = { ...e, swing: 0, lanes: { ...e.lanes, kick: '................', snare: '................', bass: '................' } };
  const swung = { ...straight, swing: 0.4 };
  const atStep1 = 0.25; // beat position of step 1 (odd)
  const dry = playLevels(straight, atStep1, { intensity: 1 }).bands.air;
  const late = playLevels(swung, atStep1, { intensity: 1 }).bands.air;
  assert.ok(late < dry, `a swung hit is behind its straight time (${late} < ${dry})`);
  const landed = playLevels(swung, atStep1 + 0.4 / 4, { intensity: 1 }).bands.air;
  assert.ok(landed > late, 'and it lands 0.4 of a step later');
});

ok('junk beat positions read as the start, never NaN; the module is pure', () => {
  for (const p of [NaN, undefined, null, Infinity]) {
    const l = playLevels(four, p, { intensity: 1 });
    for (const v of Object.values(l.bands)) assert.ok(Number.isFinite(v));
  }
  const src = readFileSync(new URL('./beatPlayer.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/Date\.now|performance\.now|Math\.random|setTimeout|setInterval|document|window/.test(src));
});

console.log(`beatPlayer.selfcheck: ${n} checks passed`);
