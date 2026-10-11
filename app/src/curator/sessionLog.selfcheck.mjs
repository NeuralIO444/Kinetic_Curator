// node src/curator/sessionLog.selfcheck.mjs
// #1314 (B): the session log records inputs honestly and never claims to be a replayable performance.
import assert from 'node:assert/strict';
import {
  createSessionLog, layoutChanges, initSessionLog, snapshotSessionLog, sessionLogFilename,
  SESSION_LOG_FORMAT, AUDIO_OFF, MAX_EVENTS,
} from './sessionLog.js';

// 1. the file says what it is
{
  const log = createSessionLog({ seed: 0xabc, layoutParams: { mode: 'grid', count: 100 }, paletteId: 'p1' });
  log.tick();
  const out = log.finish();
  assert.equal(out.format, SESSION_LOG_FORMAT);
  assert.equal(out.replayable, false, 'a session log is never presented as replayable');
  assert.match(out.note, /does not reproduce the picture/);
  assert.deepEqual(out.start, { seed: 0xabc, layoutParams: { mode: 'grid', count: 100 }, paletteId: 'p1' });
  assert.equal(out.frames, 1);
  assert.doesNotThrow(() => JSON.stringify(out), 'JSON-safe');
}

// 2. audio: quantized to 1/100, only on change, off is OFF (not zero), deltas are frame gaps
{
  const log = createSessionLog({ seed: 1 });
  const seq = [null, null, 0.5, 0.504, 0.5, 0.51, 0, null];
  for (const e of seq) { log.audio(e); log.tick(); }
  const { audio } = log.finish();
  assert.deepEqual(audio, [[0, AUDIO_OFF], [2, 50], [3, 51], [1, 0], [1, AUDIO_OFF]], 'changes only, frame deltas');
  assert.equal(createSessionLog({ seed: 1 }).audio(7), 100, 'clamped');
}

// 3. changes are diffed, deep-compared, and cloned (later mutation cannot rewrite the log)
{
  const a = { mode: 'grid', scale: [0.5, 1.5], count: 10 };
  const b = { ...a, scale: [0.5, 1.5], count: 11 };
  assert.deepEqual(layoutChanges(a, b), [['count', 11]], 'equal arrays are not a change');
  assert.deepEqual(layoutChanges(a, a), []);
  const log = createSessionLog({ seed: 1, layoutParams: a });
  const v = [1, 2];
  log.param('scale', v);
  v.push(3);
  a.mode = 'orbit';
  const out = log.finish();
  assert.deepEqual(out.params[0][2], [1, 2]);
  assert.equal(out.start.layoutParams.mode, 'grid');
}

// 4. a long session stops honestly instead of growing without bound
{
  const log = createSessionLog({ seed: 1 });
  for (let i = 0; i < MAX_EVENTS + 50; i++) log.param('k', i);
  const out = log.finish();
  assert.equal(out.params.length, MAX_EVENTS);
  assert.equal(out.truncated, true, 'says it was cut');
}

// 5. the live wiring: store changes + the animation clock, only while running
{
  let listener = null;
  let state = { seed: 7, layoutParams: { mode: 'grid', count: 5 }, paletteId: null, running: true };
  let cb = null;
  let audio = null;
  const stop = initSessionLog({
    subscribe: (l) => { listener = l; return () => { listener = null; }; },
    getState: () => state,
    getAudio: () => audio,
    raf: (f) => { cb = f; return 1; },
    caf: () => { cb = null; },
  });
  const frame = () => { const f = cb; f(); };
  frame(); frame();
  audio = 0.8; frame();
  const prev = state;
  state = { ...state, seed: 9, layoutParams: { ...state.layoutParams, count: 6 } };
  listener(state, prev);
  state = { ...state, running: false };
  frame(); frame(); // paused: nothing recorded
  state = { ...state, running: true };
  frame();
  const out = snapshotSessionLog();
  assert.equal(out.frames, 4, 'only running frames count');
  assert.deepEqual(out.seeds, [[3, 9]]);
  assert.deepEqual(out.params, [[3, 'count', 6]]);
  assert.deepEqual(out.audio, [[0, AUDIO_OFF], [2, 80]]);
  assert.equal(sessionLogFilename(out), 'kc-session-7-4f.json', 'name is seed + frames, never a time');
  stop();
  assert.equal(snapshotSessionLog(), null, 'stopped');
}

console.log('sessionLog.selfcheck: ok');
