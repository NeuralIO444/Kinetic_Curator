// #1145 × Mind (2026-10-14) — the Director publishes its room on the bus; the minds read the verdict and intensity band;
// nothing a mind answers ever reaches the Director.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOM_VERDICTS, INTENSITY_BANDS, bandOf, roomPayload, createRoomPublisher } from './directorRoom.js';
import { DIRECTORS_MATRIX } from './directorsMatrix.js';
import { createDirector, directorGains, getDirector, resetDirector } from './director.js';
import { startMindRoom, getMindRoom } from './mindRoom.js';
import { buildContext, CONTEXT_VERSION } from './mindContext.js';
import { startMind } from './mindLive.js';
import { startMindFaces, resetMindFaces } from './mindFace.js';
import { Events, emit, on, clearPending, releaseTick } from '../composition/eventBus.js';
import { EVENT_REGISTRY } from '../composition/eventRegistry.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));
const LOIS = Object.keys(DIRECTORS_MATRIX);
const DAVIS = [...new Set(LOIS.flatMap((l) => Object.keys(DIRECTORS_MATRIX[l])))];

await ok('every room of the matrix resolves to a known verdict; the five verdicts are all there', () => {
  assert.deepEqual([...ROOM_VERDICTS].sort(), ['AGREEMENT', 'DAVIS ALONE', 'FULL BURN', 'THE CLASH', 'THE ROOM']);
  for (const l of LOIS)
    for (const d of DAVIS) {
      const g = directorGains({ loisCode: l, davisCode: d });
      if (!g.room) continue;
      assert.ok(
        ROOM_VERDICTS.includes(roomPayload({ gains: g, intensity: 0.5, directorPhase: 'build' }).verdict),
        `${l} × ${d}`,
      );
    }
});

await ok('the payload is a readout: room, band, relaxing, phase — no gain, temperature, sway or tilt', () => {
  const g = directorGains({ loisCode: 'BURN', davisCode: 'FLOW', phase: 'explore' });
  const p = roomPayload(
    { gains: g, intensity: 0.9, directorPhase: 'peak', sway: { temperatureDelta: 0.1 } },
    'explore',
  );
  assert.deepEqual(p, {
    verdict: 'FULL BURN',
    n: 11,
    lois: 'BURN',
    davis: 'FLOW',
    intensity: 'peak',
    relaxing: false,
    phase: 'explore',
  });
  const text = JSON.stringify(p);
  assert.ok(
    !/temperature|kin|weight|sway|tilt|allowance|budget|relax_seconds/i.test(text),
    'nothing of the gains rides along',
  );
  assert.deepEqual(
    roomPayload({ gains: directorGains({}), intensity: 0.1, directorPhase: 'build' }),
    { verdict: null, n: null, lois: null, davis: null, intensity: 'low', relaxing: false, phase: null },
    'silence',
  );
  assert.equal(bandOf(0.2, 'build'), 'low');
  assert.equal(bandOf(0.5, 'relax'), 'mid');
  assert.equal(bandOf(0.9, 'build'), 'peak');
  assert.equal(bandOf(0.1, 'peak'), 'peak');
  assert.deepEqual(INTENSITY_BANDS, ['low', 'mid', 'peak']);
});

await ok('the publisher sends only changes', () => {
  const sent = [];
  const pub = createRoomPublisher((p) => sent.push(p));
  const g = directorGains({ loisCode: 'VIBE', davisCode: 'FLOW' });
  pub({ gains: g, intensity: 0.5, directorPhase: 'build' }, null);
  pub({ gains: g, intensity: 0.55, directorPhase: 'build' }, null); // same band: no change
  pub({ gains: g, intensity: 0.9, directorPhase: 'build' }, null);
  assert.equal(sent.length, 2);
  const boom = createRoomPublisher(() => {
    throw new Error('x');
  });
  assert.doesNotThrow(() => boom({ gains: g, intensity: 0.5 }, null), 'a bad listener never takes a pick down');
});

await ok(
  'the live Director publishes director:room on the bus (cause director); a bare Director publishes nothing',
  () => {
    clearPending();
    resetDirector();
    const got = [];
    const off = on(Events.DIRECTOR_ROOM, (p, m) => got.push([p, m && m.cause]));
    const feed = { keepsLast5m: 0 };
    getDirector().tick({ feed, audio: 0 });
    getDirector().tick({ feed, audio: 0 });
    const bare = createDirector();
    bare.tick({ feed, audio: 0 });
    off();
    resetDirector();
    assert.equal(got.length, 1, 'one publish for an unchanged room');
    assert.equal(got[0][1], 'director');
    assert.deepEqual(Object.keys(got[0][0]).sort(), [
      'davis',
      'intensity',
      'lois',
      'n',
      'phase',
      'relaxing',
      'verdict',
    ]);
  },
);

await ok('the minds hear it: mindRoom follows the bus, and context v3 carries the verdict and the band only', () => {
  const stop = startMindRoom();
  assert.equal(getMindRoom(), null, 'nothing before the first tick');
  emit(Events.DIRECTOR_ROOM, {
    verdict: 'THE CLASH',
    n: 1,
    lois: 'NOD',
    davis: 'FLOW',
    intensity: 'mid',
    relaxing: false,
    phase: null,
  });
  assert.deepEqual(getMindRoom(), { verdict: 'THE CLASH', intensity: 'mid' });
  const ctx = buildContext({ room: { lois: 'NOD', davis: 'FLOW' }, director: getMindRoom() });
  assert.equal(CONTEXT_VERSION, 3);
  assert.equal(ctx.verdict, 'THE CLASH');
  assert.equal(ctx.intensity, 'mid');
  assert.equal(
    buildContext({ director: { verdict: 'MADE UP', intensity: 'mid' } }).verdict,
    null,
    'an unknown verdict is dropped',
  );
  assert.equal(buildContext({ director: { verdict: 'THE ROOM', intensity: 'boiling' } }).intensity, null);
  assert.equal(
    buildContext({ director: { verdict: 'MADE UP', intensity: 'mid' } }).intensity,
    null,
    'no band without a room',
  );
  emit(Events.DIRECTOR_ROOM, { verdict: null, intensity: 'low' });
  assert.equal(getMindRoom(), null, 'silence clears it');
  stop();
});

await ok("no mind moves a gain: wild replies and face overlays leave the Director's output unchanged", async () => {
  clearPending();
  const director = () => createDirector({ now: () => 1000 });
  const feed = { keepsLast5m: 2, rollsLastMinute: 9 };
  const before = director().tick({ feed, audio: 0.4, nowTs: 1000 });
  const wild = {
    available: () => true,
    ask: (p) =>
      Promise.resolve(
        p === 'lois'
          ? {
              critique: { target: 'temp', delta: 0.25 },
              state: { id: 'BURN', intensity: 1, decay: 8 },
              line: 'burn it',
            }
          : p === 'davis'
            ? { propose: { assetId: 'x' }, state: { id: 'BLOOM', intensity: 1, decay: 8 } }
            : { mood: 'weird', lean: { wetness: 1, evolve: 1 } },
      ),
  };
  const stopFaces = startMindFaces();
  const stop = startMind({
    model: wild,
    getSnapshot: () => ({ room: { lois: 'VIBE', davis: 'FLOW' } }),
    getSeed: () => 3,
  });
  for (let b = 0; b < 6; b++) {
    emit(Events.CLOCK_BAR, { bar: b });
    releaseTick('bar');
    await tick();
  }
  stop();
  stopFaces();
  resetMindFaces();
  clearPending();
  const after = director().tick({ feed, audio: 0.4, nowTs: 1000 });
  assert.deepEqual(after.gains, before.gains);
  const dsrc = src('./director.js');
  assert.ok(!/from\s+['"]\.\/mind/.test(dsrc), 'the Director imports no mind module');
});

await ok('wired and registered: the app starts it and feeds it to the snapshot; the helper knows the names', () => {
  assert.deepEqual(EVENT_REGISTRY.DIRECTOR_ROOM.handler, [
    'curator/mindRoom.js',
    'curator/roomFeed.js',
    'curator/storyLive.js',
  ]);
  const app = src('../App.jsx');
  assert.match(app, /const stopRoom = startMindRoom\(\)/);
  assert.match(app, /director: getMindRoom\(\)/);
  assert.match(src('../../../src-tauri/helpers/kc-mind/main.swift'), /"verdict" names the argument/);
  for (const f of ['./directorRoom.js', './mindRoom.js'])
    assert.ok(!/queen/i.test(src(f).replace(/\/\/.*$/gm, '')), `${f} never names her`);
});

console.log(`directorRoom.selfcheck: ${n} checks passed`);
