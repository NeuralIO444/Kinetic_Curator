// node src/state/personaUndo.selfcheck.mjs
// #2095 (Matt's ruling, 2026-11-11): UNDO SKIPS DAVIS. Cmd-Z walks only the artist's own actions; a persona's route or
// marks write never lands on the artist's undo stack. The flag is its own (`skipUndo`), never `continuous`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useStore } from './store.js';
import { emit, Events } from '../composition/eventBus.js';
import { wireEventBus } from '../composition/wireEventBus.js';
import { applyAction } from './applyAction.js';

// the dispatch pipe coalesces per-frame streams on requestAnimationFrame; a microtask stands in for a frame in Node
globalThis.requestAnimationFrame = (fn) => {
  queueMicrotask(() => fn(performance.now()));
  return 1;
};
globalThis.cancelAnimationFrame = () => {};
wireEventBus(applyAction); // the bus is wired once, to the real action applier

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, ''); // layout-blind source pins: whitespace and trailing commas are Prettier's

const ARTIST = [{ input: 'band.mids', target: 'render.glow', depth: 0.3 }];
const DAVIS = [...ARTIST, { input: 'beat', target: 'render.scale', depth: 0.2, by: 'davis' }];
const fresh = () => {
  useStore.setState({ audioRoutes: [], historyUndoStack: [], historyRedoStack: [] });
  return useStore.getState();
};
const st = () => useStore.getState();

ok('an artist route edit pushes one undo entry (the baseline the rest stands on)', () => {
  fresh().setAudioRoutes(ARTIST);
  assert.equal(st().historyUndoStack.length, 1);
});

ok('a skipUndo write changes the table and pushes NO undo entry', () => {
  fresh().setAudioRoutes(DAVIS, false, { skipUndo: true });
  assert.equal(st().audioRoutes.length, 2, 'the route landed');
  assert.equal(st().historyUndoStack.length, 0, 'nothing on the artist stack');
});

ok('a skipUndo write leaves a standing redo stack alone', () => {
  fresh();
  useStore.setState({ historyRedoStack: [{ kind: 'edit', layerId: null, bytes: 1 }] });
  st().setAudioRoutes(DAVIS, false, { skipUndo: true });
  assert.equal(st().historyRedoStack.length, 1);
});

ok('`continuous` is not the flag: a plain continuous:false write still pushes (the old shape is unchanged)', () => {
  fresh().setAudioRoutes(DAVIS, false);
  assert.equal(st().historyUndoStack.length, 1);
});

ok('on the bus: AUDIO_ROUTES_SET { skipUndo: true } reaches the slice; without it the write is the artist hand', () => {
  fresh();
  emit(Events.AUDIO_ROUTES_SET, { routes: ARTIST, continuous: false, skipUndo: true }, { cause: 'persona:davis' });
  assert.equal(st().audioRoutes.length, 1);
  assert.equal(st().historyUndoStack.length, 0);
  fresh();
  emit(Events.AUDIO_ROUTES_SET, { routes: ARTIST, continuous: false });
  assert.equal(st().historyUndoStack.length, 1);
});

ok('PIN: an artist undo after a Davis edit restores the artist previous state, not Davis', () => {
  fresh();
  st().setAudioRoutes(ARTIST); // the artist's action: one undo entry holding the table BEFORE it ([])
  emit(Events.AUDIO_ROUTES_SET, { routes: DAVIS, continuous: false, skipUndo: true }, { cause: 'persona:davis' });
  assert.equal(st().audioRoutes.length, 2);
  st().undo(); // Cmd-Z
  assert.deepEqual(st().audioRoutes, [], 'the artist action was undone, back to the state before it');
  assert.equal(
    st().audioRoutes.some((r) => r.by === 'davis'),
    false,
  );
  assert.equal(st().historyUndoStack.length, 0, 'and there was no Davis step to walk through first');
});

ok('PIN (before the fix this is the bug): Cmd-Z right after a Davis edit does not stop on his move', () => {
  fresh();
  st().setAudioRoutes(ARTIST);
  emit(Events.AUDIO_ROUTES_SET, { routes: DAVIS, continuous: false, skipUndo: true }, { cause: 'persona:davis' });
  const before = JSON.stringify(st().historyUndoStack.map((e) => e.audioRoutes));
  assert.equal(before, JSON.stringify([[]]), 'the only entry is the artist one, holding the table before it');
});

ok(
  'marks: setLayoutParam with skipUndo moves the dial and pushes no entry; without it the artist hand still does',
  () => {
    fresh();
    useStore.setState({ layoutParams: { ...st().layoutParams, spectrumScale: 0 } });
    st().setLayoutParam('spectrumScale', 0.5, { skipUndo: true });
    assert.equal(st().layoutParams.spectrumScale, 0.5);
    assert.equal(st().historyUndoStack.length, 0);
    st().setLayoutParam('spectrumScale', 0.7);
    assert.equal(st().historyUndoStack.length, 1, 'the artist hand is unchanged');
  },
);

ok('wiring pins: the trio writes both its table edits with skipUndo, and App writes the marks with it', () => {
  const trio = flat(src('../curator/trioLive.js'));
  assert.ok(
    trio.includes(
      flat(
        "emit(Events.AUDIO_ROUTES_SET, { routes: res.routes, continuous: false, skipUndo: true }, { cause: 'persona:davis' })",
      ),
    ),
    "Davis's landed route edit",
  );
  assert.ok(
    trio.includes(
      flat("emit(Events.AUDIO_ROUTES_SET, { routes, continuous: false, skipUndo: true }, { cause: 'ownership' })"),
    ),
    "the trio's ownership bookkeeping write (clears his mark on a row the artist edited)",
  );
  const app = flat(src('../App.jsx'));
  assert.ok(
    app.includes(
      flat('setMarkParam: (key, value) => useStore.getState().setLayoutParam(key, value, { skipUndo: true })'),
    ),
    "Davis's marks write",
  );
  const wire = flat(src('../composition/wireEventBus.js'));
  assert.ok(wire.includes('skipUndo:!!p.skipUndo'), 'the bus carries the flag to the action');
});

console.log(`personaUndo selfcheck: ${n} ok`);
