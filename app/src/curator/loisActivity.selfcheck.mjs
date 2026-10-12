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
  LOIS_TREND_WINDOW_MS,
  LOIS_UNDO_BURST_MIN,
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

// ===========================================================================
// #1391 — telemetry gap closure (G2–G7, G9–G15). Each block pins ONE signal:
// recorded exactly as named in the telemetry doc, no derived opinions.
// ===========================================================================

// --- G2: ms-since-seed on the favorite RECORD -------------------------------
{
  const fav = captureFavorite(
    { seed: 42, seedOffsets: {}, layoutParams: { composition: 'flow' }, enabledAssets: {} },
    'v01d',
  );
  assert.ok(Number.isInteger(fav.msSinceSeed) && fav.msSinceSeed >= 0, 'the record itself carries msSinceSeed');
  assert.strictEqual(sanitizeFavorite({ seed: 1, msSinceSeed: 4200, config: {} }).msSinceSeed, 4200);
  const legacy = sanitizeFavorite({ seed: 1, config: {} });
  assert.strictEqual('msSinceSeed' in legacy, false, 'legacy keeps gain no invented field');
  assert.strictEqual('msSinceSeed' in sanitizeFavorite({ seed: 1, msSinceSeed: -5, config: {} }), false);
}

// --- G3: recalls are logged events carrying the seed's age (ECHO) -----------
{
  let now = 10_000_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  const keptAt = now - 2 * 24 * 3600 * 1000; // kept two days ago
  emit(Events.DAVIS_FAVORITE, { action: 'recall', favorite: { seed: 7, timestamp: new Date(keptAt).toISOString() } });
  assert.strictEqual(act.snapshot().lastRecall.seedAgeMs, 2 * 24 * 3600 * 1000);
  emit(Events.DAVIS_FAVORITE, { action: 'recall', favorite: { seed: 8, timestamp: '12:34:56' } });
  assert.strictEqual(act.snapshot().lastRecall.seedAgeMs, null, 'legacy stamp: the age is honestly unknown');
  act.stop();
}

// --- G4: the export hook records seed + palette ------------------------------
{
  let now = 10_500_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  emit(Events.EXPORT_SNAPSHOT, { seed: 5, config: { palette: { id: 'hydra' } } });
  const snap = act.snapshot();
  assert.strictEqual(snap.lastExport.seed, 5);
  assert.strictEqual(snap.lastExport.paletteId, 'hydra');
  act.stop();
}

// --- G6: rolls-per-keep — the counter increments, the keep flushes it --------
{
  let now = 11_000_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  act.noteSeed(3, 'flow');
  emit(Events.LAYOUT_CURATE);
  emit(Events.KINETIC_TAP, { kind: 'rules' });
  emit(Events.LAYOUT_CURATE);
  assert.strictEqual(act.snapshot().rollsSinceKeep, 3);
  emit(Events.DAVIS_FAVORITE, { action: 'add', favorite: { seed: 3, config: {} } });
  let snap = act.snapshot();
  assert.strictEqual(snap.lastKeepCost, 3, 'the keep cost three rolls');
  assert.strictEqual(snap.keepCostCount, 1);
  assert.strictEqual(snap.rollsSinceKeep, 0, 'the counter flushes at the keep');
  emit(Events.LAYOUT_CURATE);
  assert.strictEqual(act.snapshot().rollsSinceKeep, 1);
  act.stop();
}

// --- G7: undo bursts register; a tweak inside one is a collision (EDGE) -----
{
  let now = 12_000_000;
  const subs = [];
  const fakeState = {
    seed: 1, layoutParams: { composition: 'flow' },
    historyUndoStack: [{}, {}, {}, {}], historyRedoStack: [], favorites: [], keeps: [],
  };
  const fakeStore = { getState: () => fakeState, subscribe: (fn) => { subs.push(fn); return () => {}; } };
  const fire = () => subs.forEach((fn) => fn(fakeState));
  const act = createLoisActivity({ now: () => now });
  act.start({ store: fakeStore });
  const undo = () => { fakeState.historyUndoStack.pop(); fakeState.historyRedoStack.push({}); now += 500; fire(); };

  undo(); undo();
  assert.strictEqual(act.snapshot().undoBurstSize, LOIS_UNDO_BURST_MIN - 1);
  assert.strictEqual(act.snapshot().undoBurstCount, 0, 'two undos is not yet a burst');
  undo();
  let snap = act.snapshot();
  assert.strictEqual(snap.undoBurstCount, 1);
  assert.strictEqual(snap.lastUndoBurst.size, LOIS_UNDO_BURST_MIN);

  emit(Events.LAYOUT_PARAM, { key: 'density', value: 3 }); // a hand on a control while the burst is hot
  snap = act.snapshot();
  assert.strictEqual(snap.tweakCollisionCount, 1);
  assert.strictEqual(snap.lastTweakCollision.key, 'density');
  assert.strictEqual(snap.lastTweakCollision.undos, LOIS_UNDO_BURST_MIN);

  now += 60 * 1000; // the burst is long cold: a tweak is just a tweak
  emit(Events.LAYOUT_PARAM, { key: 'density', value: 4 });
  snap = act.snapshot();
  assert.strictEqual(snap.tweakCollisionCount, 1);
  assert.strictEqual(snap.tweakCount, 2);
  act.stop();
}

// --- G9: MIDI presence is observed (never driven) ----------------------------
{
  let now = 13_000_000;
  const subs = [];
  const fakeState = {
    seed: 1, layoutParams: { composition: 'flow' }, historyUndoStack: [], historyRedoStack: [],
    favorites: [], keeps: [], midiStatus: { state: 'off', inputs: [] }, midiLast: null,
  };
  const fakeStore = { getState: () => fakeState, subscribe: (fn) => { subs.push(fn); return () => {}; } };
  const fire = () => subs.forEach((fn) => fn(fakeState));
  const act = createLoisActivity({ now: () => now });
  act.start({ store: fakeStore });
  assert.strictEqual(act.snapshot().midiPresent, false);

  fakeState.midiStatus = { state: 'ready', inputs: ['Pad Controller'] };
  fire();
  let snap = act.snapshot();
  assert.strictEqual(snap.midiPresent, true);
  assert.deepStrictEqual(snap.midiInputs, ['Pad Controller']);
  assert.strictEqual(snap.midiLastMsgAgoMs, null, 'connected is not the same as heard from');

  fakeState.midiLast = { type: 'noteon', note: 36 };
  now += 2000; fire();
  assert.strictEqual(act.snapshot().midiLastMsgAgoMs, 0);
  now += 3000;
  assert.strictEqual(act.snapshot().midiLastMsgAgoMs, 3000);

  fakeState.midiStatus = { state: 'no-devices', inputs: [] };
  fire();
  assert.strictEqual(act.snapshot().midiPresent, false);
  act.stop();
}

// --- G10 + G11: session length, roll cadence, keep trend ---------------------
{
  let now = 14_000_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  let snap = act.snapshot();
  assert.strictEqual(snap.sessionStart, 14_000_000);
  assert.strictEqual(snap.sessionLengthMs, 0);
  emit(Events.LAYOUT_CURATE);
  emit(Events.LAYOUT_CURATE);
  assert.deepStrictEqual(act.snapshot().rollCadence, [2]);

  now += LOIS_TREND_WINDOW_MS; // one window later
  emit(Events.LAYOUT_CURATE);
  snap = act.snapshot();
  assert.strictEqual(snap.sessionLengthMs, LOIS_TREND_WINDOW_MS);
  assert.deepStrictEqual(snap.rollCadence, [2, 1], 'rolls bucketed per window since the session started');

  emit(Events.DAVIS_FAVORITE, { action: 'add', favorite: { seed: 1, config: {} } });
  snap = act.snapshot();
  assert.deepStrictEqual(snap.keepTrend, [0, 0, 0, 1], 'one keep, in the live window only');
  now += 2 * LOIS_TREND_WINDOW_MS;
  assert.deepStrictEqual(act.snapshot().keepTrend, [0, 1, 0, 0], 'the keep ages across the windows');
  act.stop();
}

// --- G12: passes cluster per seed (WEED) --------------------------------------
{
  let now = 15_000_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  act.noteSeed(9, 'flow');
  emit(Events.LAYOUT_CURATE); emit(Events.LAYOUT_CURATE); emit(Events.LAYOUT_CURATE);
  let snap = act.snapshot();
  assert.strictEqual(snap.passClusterSeed, 9);
  assert.strictEqual(snap.passClusterLen, 3, 'three consecutive passes on one seed');
  act.noteSeed(10, 'flow');
  emit(Events.LAYOUT_CURATE);
  snap = act.snapshot();
  assert.strictEqual(snap.passClusterSeed, 10);
  assert.strictEqual(snap.passClusterLen, 1, 'a new seed starts a new run');
  emit(Events.DAVIS_FAVORITE, { action: 'add', favorite: { seed: 10, config: {} } });
  assert.strictEqual(act.snapshot().passClusterLen, 0, 'a keep breaks the run');
  act.stop();
}

// --- G13: the evolve-from-kept flag (GRAFT) -----------------------------------
{
  let now = 16_000_000;
  const subs = [];
  const fakeState = {
    seed: 20, layoutParams: { composition: 'flow' }, historyUndoStack: [], historyRedoStack: [],
    favorites: [], keeps: [], lastEvolveTs: 0,
  };
  const fakeStore = { getState: () => fakeState, subscribe: (fn) => { subs.push(fn); return () => {}; } };
  const fire = () => subs.forEach((fn) => fn(fakeState));
  const act = createLoisActivity({ now: () => now });
  act.start({ store: fakeStore });

  fakeState.seed = 21; fakeState.lastEvolveTs = 111; now += 1000; fire(); // evolve off an unkept seed
  assert.strictEqual(act.snapshot().evolveFromKeptCount, 0);

  fakeState.keeps = [{ id: 'k1', seed: 21, config: {} }]; now += 1000; fire(); // keep the live seed
  fakeState.seed = 22; fakeState.lastEvolveTs = 222; now += 1000; fire(); // evolve off the kept seed
  const snap = act.snapshot();
  assert.strictEqual(snap.evolveFromKeptCount, 1);
  assert.strictEqual(snap.lastEvolveFromKept.seed, 21, 'the flag names the kept seed it evolved from');
  act.stop();
}

// --- G14: cast/palette changes mid-roll only (DROWN) ---------------------------
{
  let now = 17_000_000;
  const subs = [];
  const fakeState = {
    seed: 30, layoutParams: { composition: 'flow' }, historyUndoStack: [], historyRedoStack: [],
    favorites: [], keeps: [], paletteId: 'v01d', enabledAssets: { a: true, b: true },
  };
  const fakeStore = { getState: () => fakeState, subscribe: (fn) => { subs.push(fn); return () => {}; } };
  const fire = () => subs.forEach((fn) => fn(fakeState));
  const act = createLoisActivity({ now: () => now });
  act.start({ store: fakeStore });

  fakeState.paletteId = 'hydra'; fire(); // before any roll: not mid-roll
  assert.strictEqual(act.snapshot().castChangeCount, 0);

  emit(Events.LAYOUT_CURATE); // a rolled frame is live
  fakeState.paletteId = 'v01d'; now += 1000; fire();
  let snap = act.snapshot();
  assert.strictEqual(snap.castChangeCount, 1);
  assert.strictEqual(snap.lastCastChange.kind, 'palette');
  assert.strictEqual(snap.lastCastChange.from, 'hydra');
  assert.strictEqual(snap.lastCastChange.to, 'v01d');
  assert.strictEqual(snap.lastCastChange.seed, 30);

  fakeState.enabledAssets = { a: true, b: false, c: true }; now += 1000; fire();
  snap = act.snapshot();
  assert.strictEqual(snap.castChangeCount, 2);
  assert.strictEqual(snap.lastCastChange.kind, 'assets');
  assert.strictEqual(snap.lastCastChange.size, 2);

  fakeState.keeps = [{ id: 'k1', seed: 30, config: {} }]; fire(); // the frame is kept now
  fakeState.paletteId = 'hydra'; now += 1000; fire();
  assert.strictEqual(act.snapshot().castChangeCount, 2, 'after a keep, a palette change is not mid-roll');
  act.stop();
}

// --- G15: returning to a seed that bloomed (EMBER) ------------------------------
{
  let now = 18_000_000;
  const act = createLoisActivity({ now: () => now });
  act.start();
  act.noteSeed(40, 'flow');
  for (let i = 0; i < 6; i++) { emit(Events.LAYOUT_CURATE); now += 1000; } // a run of passes
  emit(Events.DAVIS_FAVORITE, { action: 'add', favorite: { seed: 40, config: {} } }); // the payoff: seed 40 blooms
  let snap = act.snapshot();
  assert.strictEqual(snap.bloomedSeedCount, 1);
  assert.strictEqual(snap.bloomReturnCount, 0);

  act.noteSeed(41, 'flow'); // wander off
  act.noteSeed(40, 'flow'); // come back to the bloomed seed
  snap = act.snapshot();
  assert.strictEqual(snap.bloomReturnCount, 1);
  assert.strictEqual(snap.lastBloomReturn.seed, 40);

  act.noteSeed(42, 'flow');
  act.noteSeed(41, 'flow'); // seed 41 was only dwelled on — it never bloomed
  assert.strictEqual(act.snapshot().bloomReturnCount, 1);
  act.stop();
}

console.log('ok loisActivity: 7 instruments record real signals only');
console.log('ok loisActivity #1391: G2–G4, G6, G7, G9–G15 gap signals recorded (G5 dwell pinned by the instrument-5 block above)');
