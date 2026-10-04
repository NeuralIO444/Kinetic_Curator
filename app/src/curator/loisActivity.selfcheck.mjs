// loisActivity.selfcheck.mjs — the LOIS honest feed: every signal recorded
// must be real. Fake clock + real event bus + fake store; no DOM needed.
import assert from 'node:assert';
import { Events, emit } from '../composition/eventBus.js';
import { captureFavorite, sanitizeFavorite } from '../state/slices/davisSlice.js';
import {
  createLoisActivity,
  parseFavoriteTimestamp,
  LOIS_AWAY_MS,
  LOIS_BURN_MS,
} from './loisActivity.js';

// --- timestamp honesty -------------------------------------------------
{
  const iso = '2026-10-04T18:00:00.000Z';
  assert.strictEqual(parseFavoriteTimestamp(iso), Date.parse(iso));
  // legacy time-of-day stamps carry no date: honestly unusable for timing
  assert.strictEqual(parseFavoriteTimestamp('12:34:56'), null);
  assert.strictEqual(parseFavoriteTimestamp(''), null);
  assert.strictEqual(parseFavoriteTimestamp(null), null);
  assert.strictEqual(parseFavoriteTimestamp('not-a-time'), null);
}

// captureFavorite stamps full epoch ISO now (was HH:MM:SS); legacy keeps
// still round-trip through the sanitizer untouched.
{
  const fav = captureFavorite(
    { seed: 42, seedOffsets: {}, layoutParams: { composition: 'flow' }, enabledAssets: {} },
    'v01d',
  );
  assert.ok(parseFavoriteTimestamp(fav.timestamp) !== null, 'new stamp must carry a date');
  const legacy = sanitizeFavorite({ seed: 1, timestamp: '12:34:56', config: {} });
  assert.strictEqual(legacy.timestamp, '12:34:56');
  assert.strictEqual(parseFavoriteTimestamp(legacy.timestamp), null);
}

// --- instruments 2+3: favorite add / recall ------------------------------
{
  let now = 1_000_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  act.noteSeed(7, 'flow'); // seed set at t=1,000,000

  now += 9_000; // favorited nine seconds after the seed rendered: conviction
  emit(Events.DAVIS_FAVORITE, {
    action: 'add',
    favorite: { seed: 7, config: { palette: { id: 'v01d' } } },
  });
  let snap = act.snapshot();
  assert.strictEqual(snap.favoriteCount, 1);
  assert.strictEqual(snap.lastFavorite.msSinceSeed, 9_000);
  assert.strictEqual(snap.lastFavorite.seed, 7);
  assert.strictEqual(snap.lastFavorite.paletteId, 'v01d');
  assert.strictEqual(snap.keepsLast5m, 1);

  emit(Events.DAVIS_FAVORITE, { action: 'recall', favorite: { seed: 7 } });
  snap = act.snapshot();
  assert.strictEqual(snap.recallCount, 1);
  act.stop();
}

// --- instrument 4: export hook ------------------------------------------
{
  let now = 2_000_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  emit(Events.EXPORT_SNAPSHOT, {
    seed: 99,
    config: { palette: { id: 'hydra' } },
  });
  const snap = act.snapshot();
  assert.strictEqual(snap.exportCount, 1);
  act.stop();
}

// --- instrument 5: dwell windows -----------------------------------------
{
  let now = 3_000_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  act.noteSeed(1, 'flow');
  now += 12_000; // lingered twelve seconds, no action
  act.noteSeed(2, 'flow'); // seed change closes the window
  let snap = act.snapshot();
  assert.strictEqual(snap.lastDwellMs, 12_000);
  assert.strictEqual(snap.dwellMs, 0); // new window just opened
  // composition-only change closes the window but does NOT move seedSetAt
  now += 5_000;
  act.noteSeed(2, 'rails');
  snap = act.snapshot();
  assert.strictEqual(snap.lastDwellMs, 5_000);
  act.stop();
}

// --- instrument 6: rolls-per-keep ----------------------------------------
{
  let now = 4_000_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  emit(Events.LAYOUT_CURATE);
  emit(Events.KINETIC_TAP, { kind: 'rules' });
  emit(Events.KINETIC_TAP, { kind: 'weather' });
  const snap = act.snapshot();
  assert.strictEqual(snap.rollsLast5m, 3);
  assert.strictEqual(snap.keepsLast5m, 0); // three rolls, nothing kept
  act.stop();
}

// --- instrument 7: undo bursts (passive store observation) ----------------
// Undo pops exactly one entry AND pushes it onto the redo stack; an import
// clears both stacks (#639) — so only (undo -1, redo not down) counts.
{
  let now = 5_000_000;
  const subs = [];
  const fakeState = {
    seed: 1,
    layoutParams: { composition: 'flow' },
    historyUndoStack: [{}, {}, {}],
    historyRedoStack: [],
  };
  const fakeStore = {
    getState: () => fakeState,
    subscribe: (fn) => {
      subs.push(fn);
      return () => {};
    },
  };
  const fire = () => subs.forEach((fn) => fn(fakeState));
  const act = createLoisActivity({ now: () => now });
  act.start({ store: fakeStore });

  fakeState.historyUndoStack = [{}, {}]; // one undo: undo -1, redo +1
  fakeState.historyRedoStack = [{}];
  now += 1_000;
  fire();
  assert.strictEqual(act.snapshot().undosLast10s, 1);

  fakeState.historyUndoStack = [{}]; // another undo
  fakeState.historyRedoStack = [{}, {}];
  now += 1_000;
  fire();
  assert.strictEqual(act.snapshot().undosLast10s, 2);

  fakeState.historyUndoStack = []; // import cleared both stacks: NOT an undo
  fakeState.historyRedoStack = [];
  now += 1_000;
  fire();
  assert.strictEqual(act.snapshot().undosLast10s, 2);

  fakeState.historyUndoStack = [{}, {}, {}]; // push: growth is not an undo
  fire();
  assert.strictEqual(act.snapshot().undosLast10s, 2);
  act.stop();
}

// --- instrument 1: heartbeat / AWAY / BURN --------------------------------
{
  let now = 6_000_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  let snap = act.snapshot();
  assert.strictEqual(snap.away, false);
  assert.strictEqual(snap.burning, false);

  now += LOIS_AWAY_MS + 1;
  snap = act.snapshot();
  assert.strictEqual(snap.away, true);
  assert.strictEqual(snap.burning, false);

  now += LOIS_BURN_MS; // fifteen more minutes of nothing
  assert.strictEqual(act.snapshot().burning, true);

  act.beat(); // any input resets the clock
  snap = act.snapshot();
  assert.strictEqual(snap.idleMs, 0);
  assert.strictEqual(snap.away, false);
  act.stop();
}

// --- stop() detaches everything -------------------------------------------
{
  let now = 7_000_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  act.stop();
  emit(Events.LAYOUT_CURATE);
  emit(Events.KINETIC_TAP, { kind: 'rules' });
  const snap = act.snapshot();
  assert.strictEqual(snap.rollsLast5m, 0);
}

console.log('ok loisActivity: 7 instruments record real signals only');
