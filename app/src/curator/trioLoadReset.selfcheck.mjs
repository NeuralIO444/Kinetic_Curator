// node src/curator/trioLoadReset.selfcheck.mjs
// #2095 part 2 (Matt's ruling, 2026-11-11): A PROJECT LOAD IS A FRESH START FOR THE TRIO. It clears ownership, the
// revert count / cooldown, mineMarks, the phrase ledger and any held proposal (announced dropped/stale). It never
// counts as the artist's hand and never as a revert. The load is hooked as an ACTION — applyProject announces
// PROJECT_LOADED before the state lands — never inferred from a diff of the table. This suite runs the REAL store,
// the REAL bus wiring and the REAL applyProject, with a trio conducting against them.
import assert from 'node:assert/strict';
import { useStore } from '../state/store.js';
import { emit, on, Events } from '../composition/eventBus.js';
import { wireEventBus } from '../composition/wireEventBus.js';
import { applyAction } from '../state/applyAction.js';
import { startTrio, getTrioView } from './trioLive.js';
import { SPECTRUM_PARAMS } from './mindConduct.js';

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
const st = () => useStore.getState();
const view = () => getTrioView();

useStore.setState({ audioRoutes: null, historyUndoStack: [], historyRedoStack: [] });

const out = { applied: [], dropped: [] };
on(Events.MIND_ROUTE, (e) => (e.status === 'applied' ? out.applied : out.dropped).push(e));

const trio = startTrio({
  getRoutes: () => st().audioRoutes,
  getTier: () => 't3',
  getBands: () => [0.5, 0.4, 0.3, 0.3, 0.2, 0.2, 0.1],
  isReplaying: () => false,
  subscribe: (fn) => useStore.subscribe(fn),
  // the marks wiring, exactly as App.jsx hands it over
  getMarks: () => {
    const lp = st().layoutParams || {};
    return {
      map: lp.spectrumMap ?? 0,
      scale: lp.spectrumScale ?? 0,
      displace: lp.spectrumDisplace ?? 0,
      colour: lp.spectrumColour ?? 0,
      locked: Object.entries(SPECTRUM_PARAMS)
        .filter(([, key]) => st().lockedParams?.[key])
        .map(([k]) => k),
    };
  },
  setMarkParam: (key, value) => st().setLayoutParam(key, value, { skipUndo: true }),
});

let bar = 0;
const tick = (to) => {
  while (bar < to) {
    bar += 1;
    emit(Events.CLOCK_BAR, { bar });
  }
};
const request = (route) =>
  emit(Events.MIND_REQUEST, {
    persona: 'davis',
    bar,
    backend: 'rules',
    invented: false,
    reply: { propose: null, route },
  });
/** The artist's hand on the table: rewrite one row's depth (the row keeps whatever mark it carries). */
const artistEdit = (input, target, depth) => {
  const rows = (st().audioRoutes || []).map((r) => (r.input === input && r.target === target ? { ...r, depth } : r));
  assert.ok(
    rows.some((r) => r.input === input && r.target === target),
    `artist edit lands on a real row (${input}>${target})`,
  );
  st().setAudioRoutes(rows);
};
const row = (input, target) => (st().audioRoutes || []).find((r) => r.input === input && r.target === target);

emit(Events.AUDIO_INPUT, { source: 'mic' });

// ── before the load: Davis conducts, the artist owns and reverts — the books fill up ─────────────────────────────
const ADD = { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 };
tick(5);
request(ADD);
tick(8);
ok('setup: Davis landed a route edit (phrase 2 committed) and holds the marks dial', () => {
  assert.equal(row('band.mids', 'render.glow')?.by, 'davis');
  request({ op: 'spectrum', key: 'scale', value: 0.42 });
  tick(12);
  assert.deepEqual(view().marksMine, ['scale']);
  assert.equal(st().layoutParams.spectrumScale, 0.42);
});

ok('setup: the artist owns a target by hand, and two reverts of Davis stand below the backoff line', () => {
  artistEdit('beat', 'render.alpha', 12); // a default row, by hand: render.alpha is the artist's now
  tick(13); // the view republishes on the bar
  assert.ok(view().owned.includes('render.alpha'), 'the hand owns what it touched');
  artistEdit('band.mids', 'render.glow', 0.55); // undoing Davis's row: revert 1 (his mark is cleared by the bookkeeping)
  assert.equal(row('band.mids', 'render.glow')?.by, undefined);
  request({ op: 'add', input: 'band.pres', target: 'render.scale', depth: 0.21 });
  tick(16);
  assert.equal(row('band.pres', 'render.scale')?.by, 'davis');
  artistEdit('band.pres', 'render.scale', 0.24); // revert 2
  tick(17);
  assert.equal(view().cooling, false, 'two reverts: no cool-down yet (the backoff line is three)');
});

const HELD = { op: 'add', input: 'band.edge', target: 'render.breath', depth: 0.03 }; // a target no hand has touched
ok('setup: a proposal is held for the phrase boundary when the load arrives', () => {
  request(HELD); // at bar 17, lands at bar 20
  assert.ok(view().pending, 'held, not yet landed');
});

// ── the load ─────────────────────────────────────────────────────────────────────────────────────────────────────
const DOC = {
  seed: 7,
  layoutParams: {},
  audioRoutes: [
    { input: 'level', target: 'render.glow', depth: 0.15, by: 'davis' }, // his mark, saved with the project
    { input: 'beat', target: 'render.scale', depth: 0.3 },
  ],
};
st().applyProject(DOC);

ok('the held proposal is announced dropped/stale, and never lands', () => {
  const drop = out.dropped.find((e) => e.op && e.op.input === 'band.edge' && e.op.target === 'render.breath');
  assert.ok(drop, 'a dropped outcome for the held proposal');
  assert.equal(drop.reason, 'stale');
  assert.equal(view().pending, null);
  tick(21); // past its landBar (20)
  assert.ok(!out.applied.some((e) => e.op && e.op.input === 'band.edge'), 'the held edit never applied after the load');
});

ok('the books are wiped: ownership, mineMarks, cool-down — and the loaded table kept his mark', () => {
  assert.deepEqual(view().owned, [], 'no ownership survives a load');
  assert.deepEqual(view().marksMine, [], 'no marks survive a load');
  assert.equal(view().cooling, false, 'the load did not count as the third revert: no cool-down');
  assert.equal(
    row('level', 'render.glow')?.by,
    'davis',
    "the loaded row's mark is the document's: no bookkeeping strip",
  );
  assert.equal(view().mine, 1, 'the view counts the loaded row as his, on a fresh set of books');
});

ok('the phrase ledger is wiped: a phrase committed before the load is free again', () => {
  // phrase 2 (landBar 8) had its edit before the load; with the ledger intact, consider() would push this to bar 12
  const v = trio.conductor.consider(ADD, { bar: 5, tier: 't3' });
  assert.equal(v.ok, true);
  assert.equal(v.landBar, 8);
});

// ── after the load: the count restarted, and the artist's hand still reads ───────────────────────────────────────
ok('the revert count restarted at zero: two fresh reverts do not cool down, the third does', () => {
  artistEdit('level', 'render.glow', 0.6); // revert 1 since the load (of the loaded project's own Davis row)
  tick(22);
  assert.ok(view().owned.includes('render.glow'), "the artist's hand still reads after a load");
  assert.equal(view().cooling, false);
  request({ op: 'add', input: 'band.mids', target: 'render.scale', depth: 0.21 });
  tick(24);
  assert.equal(row('band.mids', 'render.scale')?.by, 'davis');
  artistEdit('band.mids', 'render.scale', 0.24); // revert 2 since the load
  tick(25);
  assert.equal(view().cooling, false, 'two since the load: still no cool-down — the pre-load reverts are gone');
  request({ op: 'add', input: 'band.mids', target: 'render.alpha', depth: 9 });
  tick(28);
  assert.equal(row('band.mids', 'render.alpha')?.by, 'davis');
  artistEdit('band.mids', 'render.alpha', 12); // revert 3 since the load
  tick(29);
  assert.equal(view().cooling, true, 'the third revert since the load starts the cool-down, as ruled');
});

trio.stop();
console.log(`trioLoadReset.selfcheck: ${n} checks passed`);
