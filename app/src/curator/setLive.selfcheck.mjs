// #1475 — the set end to end: idle + no audio -> a beat chosen by the room plays into the feed the live loop reads; the
// loop blends it with real audio; her mark shows; nothing about it is named on any surface.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSet, choosePattern, HOLD_BARS } from './setLive.js';
import { BEATS } from './beatLibrary.js';
import { IDLE_MS } from './sourceArbiter.mjs';
import { observeClock, resetClock } from '../composition/clockLive.js';
import { getSwayMagnitude, SWAY_VISIBLE_THRESHOLD } from './swayView.mjs';
import { setSourceFeed, readSourceFeed, mixLevels } from '../gl/sourceFeed.mjs';
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, ''); // layout-blind source pins (#1684): whitespace and trailing commas are Prettier's, not the code's
const fre = (re) => new RegExp(re.source.replace(/\\s[*+?]?/g, '').replace(/ /g, ''), re.flags); // the same pin as a layout-blind pattern

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');

const world = { bpm: 120, idle: 0, real: 0, room: { lois: 'VIBE', davis: 'FLOW' }, band: 'normal', seed: 4242 };
const mk = () =>
  createSet({
    getBpm: () => world.bpm,
    getIdleMs: () => world.idle,
    getRealLevel: () => world.real,
    getRoom: () => world.room,
    getBand: () => world.band,
    getSeed: () => world.seed,
  });
const frame = (set, t) => {
  observeClock(t, world.bpm);
  return set.feed(t);
};

ok('ambient while the artist is active; her set plays after a while idle, and the mark shows while it does', () => {
  resetClock();
  const set = mk();
  world.idle = 0;
  world.real = 0;
  assert.equal(frame(set, 0), null, 'ambient: the feed is null and the loop is unchanged');
  let f = null;
  for (let t = 16; t < 6000; t += 16.7) {
    world.idle = IDLE_MS + t;
    f = frame(set, t);
  }
  assert.ok(f && f.mix > 0 && f.mix <= 1, 'the set is in');
  for (const v of Object.values(f.bands)) assert.ok(v >= 0 && v <= 1);
  assert.ok(Object.keys(f.bands).length === 7 && 'beatPulse' in f.coarse);
  assert.ok(getSwayMagnitude() > SWAY_VISIBLE_THRESHOLD, 'her mark is showing');
});

ok('real audio arriving yields it to nothing; the artist acting does too; the mark follows', () => {
  resetClock();
  const set = mk();
  world.idle = IDLE_MS;
  world.real = 0;
  let t = 0;
  for (; t < 8000; t += 16.7) frame(set, t);
  assert.ok(frame(set, t).mix > 0.9);
  world.real = 0.5; // a mic comes up
  for (; t < 16000; t += 16.7) frame(set, t);
  assert.equal(frame(set, t), null, 'only the audio now');
  assert.ok(getSwayMagnitude() <= SWAY_VISIBLE_THRESHOLD, 'her mark is gone');
  world.real = 0;
  world.idle = 0;
  for (; t < 24000; t += 16.7) frame(set, t);
  assert.equal(frame(set, t), null, 'the artist is acting: ambient');
});

ok(
  'the room chooses: each mood gets a pattern that fits it, the tempo fits, and the same dish gives the same pick',
  () => {
    const pick = (davis, bpm, seed = 1, slot = 0) =>
      choosePattern({
        vibes: { FLOW: ['drive'], SEEDLING: ['calm', 'sparse'], BLOOM: ['lift', 'drive'], STUCK: ['shift', 'weird'] }[
          davis
        ],
        bpm,
        seed,
        slot,
      });
    assert.ok(pick('FLOW', 124).vibes.includes('drive'));
    assert.ok(pick('SEEDLING', 74).vibes.some((v) => ['calm', 'sparse'].includes(v)));
    assert.ok(pick('BLOOM', 126).vibes.some((v) => ['lift', 'drive'].includes(v)));
    assert.ok(pick('STUCK', 100).vibes.some((v) => ['shift', 'weird'].includes(v)));
    assert.equal(pick('FLOW', 124, 7, 3).id, pick('FLOW', 124, 7, 3).id, 'deterministic');
    const ids = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((s) => pick('FLOW', 124, 9, s).id));
    assert.ok(ids.size >= 2, 'a different dish or hour can pick differently');
    assert.ok(HOLD_BARS >= 8, 'a pattern is held for a while, not changed every bar');
  },
);

ok('the stage asks less in TIGHTEN and more in RELAX: the same bar plays quieter', () => {
  resetClock();
  const level = (band) => {
    resetClock();
    world.band = band;
    world.idle = IDLE_MS;
    world.real = 0;
    const s = mk();
    let f = null;
    let t = 0;
    for (; t < 9000; t += 16.7) f = frame(s, t);
    return f.coarse.rms;
  };
  const relax = level('relax');
  const tighten = level('tighten');
  assert.ok(relax > tighten, `relax ${relax} > tighten ${tighten}`);
  world.band = 'normal';
});

ok('the live loop reads one door and blends: nothing playing is null; mixLevels crossfades real and synthetic', () => {
  setSourceFeed(null);
  assert.equal(readSourceFeed(0), null);
  setSourceFeed(() => ({ mix: 0.25, coarse: { rms: 1 }, bands: { sub: 1 } }));
  assert.equal(readSourceFeed(0).mix, 0.25);
  setSourceFeed(() => {
    throw new Error('x');
  });
  assert.equal(readSourceFeed(0), null, 'a broken provider is no source, never a broken frame');
  setSourceFeed(() => ({ mix: 0, coarse: {}, bands: {} }));
  assert.equal(readSourceFeed(0), null, 'mix 0 is not a source');
  setSourceFeed(null);
  assert.deepEqual(mixLevels({ a: 1, b: 0 }, { a: 0, b: 1 }, 0.25, ['a', 'b']), { a: 0.75, b: 0.25 });
  assert.deepEqual(mixLevels(null, { a: 0.8 }, 0.5, ['a']), { a: 0.4 }, 'real audio off reads zeros');
  const loop = readFileSync(join(srcRoot, 'gl/liveLoop.mjs'), 'utf8');
  assert.match(loop, /readSourceFeed\(loopTimeMs\)/);
  assert.match(loop, /const audioOn = audioReal \|\| !!synth;/);
  assert.match(flat(loop), fre(/readBands: synth \? \(\) => mixLevels\(/));
});

ok('hidden: nothing names her, no surface lists the library, no store key holds it, no wall clock', () => {
  const files = [
    'curator/beatLibrary.js',
    'curator/beatPlayer.mjs',
    'curator/sourceArbiter.mjs',
    'curator/setLive.js',
    'gl/sourceFeed.mjs',
  ];
  for (const f of files) {
    const text = readFileSync(join(srcRoot, f), 'utf8');
    assert.ok(!/queen/i.test(text), `${f} does not name her`);
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(
      !/Date\.now|performance\.now|Math\.random|setTimeout|setInterval/.test(code),
      `${f}: no wall clock or chance`,
    );
  }
  // no UI surface imports the library
  const bad = [];
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      const rel = relative(srcRoot, p);
      if (!/\.(jsx|js|mjs)$/.test(rel) || /selfcheck/.test(rel)) continue;
      if (!/^(components|panels|hooks|styles|data)\//.test(rel) && !rel.endsWith('.jsx')) continue;
      if (/beatLibrary|beatPlayer|setLive|sourceArbiter/.test(readFileSync(p, 'utf8'))) bad.push(rel);
    }
  })(srcRoot);
  assert.deepEqual(
    bad.filter((r) => r !== 'App.jsx'),
    [],
    'only the App wires it',
  );
  assert.equal(BEATS.length >= 16, true);
});

console.log(`setLive.selfcheck: ${n} checks passed`);
