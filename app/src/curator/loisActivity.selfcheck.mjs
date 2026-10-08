// loisActivity.selfcheck.mjs — the LOIS honest feed: every signal recorded
// must be real. Fake clock + real event bus + fake store; no DOM needed.
import assert from 'node:assert';
import { Events, emit } from '../composition/eventBus.js';
import { captureFavorite, sanitizeFavorite } from '../state/slices/davisSlice.js';
import {
  createLoisActivity,
  parseFavoriteTimestamp,
  LOIS_AWAY_MS,
  LOIS_BURN_KEEPS,
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

// --- instrument 1: heartbeat / AWAY ------------------------------------------
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
  assert.strictEqual(snap.burning, false, 'five minutes of nothing is AWAY, never BURN');

  now += 60 * 60 * 1000; // an hour of nothing is still not a hot streak (BURN used to mean this)
  assert.strictEqual(act.snapshot().burning, false);

  act.beat(); // any input resets the clock
  snap = act.snapshot();
  assert.strictEqual(snap.idleMs, 0);
  assert.strictEqual(snap.away, false);
  act.stop();
}

// --- BURN is a hot streak, and keeps are counted from EVERY door (#1126) -------
// F, the star and K dispatch straight to the store and never touch the bus; the store's own lists growing is the
// signal that never misses. The bus star and the store growth are one keep, not two.
{
  let now = 8_000_000;
  const subs = [];
  const fakeState = { seed: 1, layoutParams: { composition: 'flow' }, historyUndoStack: [], historyRedoStack: [], favorites: [], keeps: [] };
  const fakeStore = { getState: () => fakeState, subscribe: (fn) => { subs.push(fn); return () => {}; } };
  const fire = () => subs.forEach((fn) => fn(fakeState));
  const act = createLoisActivity({ now: () => now });
  act.start({ store: fakeStore });
  assert.strictEqual(act.snapshot().frameKept, false);
  const keep = (i) => ({ id: `k${i}`, seed: 1, config: { palette: { id: 'v01d' } } });

  // K: the keeps list grows by one, nothing on the bus
  fakeState.keeps = [keep(1)]; now += 1000; fire();
  let snap = act.snapshot();
  assert.strictEqual(snap.keepsLast5m, 1); assert.strictEqual(snap.frameKept, true, 'NOD while the kept frame is current');
  assert.strictEqual(snap.burning, false);

  // F: favorites AND keeps grow together in one update: one keep
  fakeState.favorites = [keep(2)]; fakeState.keeps = [keep(1), keep(3)]; now += 1000; fire();
  snap = act.snapshot();
  assert.strictEqual(snap.keepsLast5m, 2); assert.strictEqual(snap.favoriteCount, 1);
  assert.strictEqual(snap.burning, false, 'two keeps is not yet a streak');

  // the star over the bus AND the store in the same tick: still one keep
  now += 1000;
  emit(Events.DAVIS_FAVORITE, { action: 'add', favorite: keep(4) });
  fakeState.favorites = [...fakeState.favorites, keep(4)]; fakeState.keeps = [...fakeState.keeps, keep(5)]; fire();
  snap = act.snapshot();
  assert.strictEqual(snap.keepsLast5m, LOIS_BURN_KEEPS); assert.strictEqual(snap.favoriteCount, 2, 'the bus and the store are one favorite');
  assert.strictEqual(snap.burning, true, `${LOIS_BURN_KEEPS} keeps inside the window is a hot streak`);

  // an import lands many entries at once: not a keep
  fakeState.keeps = Array.from({ length: 12 }, (_, i) => keep(100 + i)); now += 1000; fire();
  assert.strictEqual(act.snapshot().keepsLast5m, LOIS_BURN_KEEPS, 'a bundle import is not a hot streak');

  // the streak ends when the window does
  now += 6 * 60 * 1000; assert.strictEqual(act.snapshot().burning, false);
  act.stop();
}

// --- frameKept: NOD holds until the next roll or seed change --------------------
{
  let now = 9_000_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  act.noteSeed(5, 'flow');
  emit(Events.DAVIS_FAVORITE, { action: 'add', favorite: { seed: 5, config: { palette: { id: 'v01d' } } } });
  assert.strictEqual(act.snapshot().frameKept, true);
  now += 10 * 60 * 1000; // minutes pass: still the kept frame (the pill, not the feed, applies AWAY)
  assert.strictEqual(act.snapshot().frameKept, true, 'it holds while the frame is current');
  emit(Events.LAYOUT_CURATE);
  assert.strictEqual(act.snapshot().frameKept, false, 'a roll moves off it');
  emit(Events.DAVIS_FAVORITE, { action: 'add', favorite: { seed: 5, config: {} } }); now += 1000;
  assert.strictEqual(act.snapshot().frameKept, true);
  act.noteSeed(6, 'flow');
  assert.strictEqual(act.snapshot().frameKept, false, 'a new seed does too');
  emit(Events.DAVIS_FAVORITE, { action: 'add', favorite: { seed: 6, config: {} } }); now += 1000;
  act.noteSeed(6, 'rails');
  assert.strictEqual(act.snapshot().frameKept, false, 'and so does a new composition');
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
