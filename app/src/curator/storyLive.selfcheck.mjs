// storyLive.selfcheck.mjs — #1560 S3: the story machine's live half, driven through the real bus.
// The book persists beside the engagement scores; replays never re-count history; the backstage view carries
// story state only — the arc has no readout here, and this suite proves the negative.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Events, emit } from '../composition/eventBus.js';
import { startStoryLive, getStoryView, subscribeStory, STORY_STORAGE_KEY } from './storyLive.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const shim = (m = new Map()) => {
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _map: m };
};
const row = (o) => `${JSON.stringify(o)}\n`;
const decision = (persona, reply, bar) => ({ persona, bar, backend: 'rules', seed: 1, invented: false, reply });

ok('the driver folds the live bus into standing, and a replay’s republication counts nothing twice', () => {
  const storage = shim();
  storage.setItem('kc:ledger:passes:v1', row({ seed: 5, recipe: { layoutParams: null, paletteId: null }, timestamp: '2026-01-01', keepContext: null, projectRef: null }));
  storage.setItem('kc:ledger:keeps:v1', row({ seed: 5, recipe: { layoutParams: null, paletteId: 'noir' }, timestamp: '2026-01-02', keepContext: null, projectRef: null }));
  const stop = startStoryLive({ getSeed: () => 42, getTiers: () => ({ davis: 4, lois: 4 }), storage });
  const v0 = getStoryView();
  assert.equal(v0.session, 1);
  assert.ok(v0.patterns.some((p) => p.kind === 'debt'), 'the session-start sift found the ledger debt');
  emit(Events.CLOCK_BAR, { bar: 1 }, { cause: 'mind' });
  emit(Events.MIND_DECISION, decision('davis', { propose: { assetId: 'fern' } }, 1), { cause: 'mind' });
  emit(Events.MIND_DECISION, decision('lois', { critique: { target: 'density', delta: 0.25 } }, 1), { cause: 'mind' });
  const v1 = getStoryView();
  assert.ok(Math.abs(v1.esteem.standing - 1.2) < 1e-9, 'her regard moved by the verdict');
  assert.ok(Math.abs(v1.trust.standing - -0.1) < 1e-9, 'his trust paid the proposal’s small exposure');
  emit(Events.MIND_DECISION, decision('lois', { critique: { target: 'density', delta: 0.25 } }, 1), { cause: 'replay' });
  assert.equal(getStoryView().esteem.standing, v1.esteem.standing, 'a replayed decision is history already counted');
  for (let b = 2; b <= 6; b++) emit(Events.CLOCK_BAR, { bar: b }, { cause: 'mind' });
  const kinds = getStoryView().beats.map((b) => b.kind);
  assert.ok(kinds.includes('callback'), 'the session opened with its callback');
  assert.ok(kinds.includes('note'), 'and the verdict got its bed note on a later bar');
  stop();
  assert.ok(storage._map.has(STORY_STORAGE_KEY), 'the book was saved');
});

ok('a second run on the same storage is a new session: standing carried, mood reset', () => {
  const storage = shim();
  const stop1 = startStoryLive({ getSeed: () => 7, storage });
  emit(Events.MIND_DECISION, decision('lois', { critique: { target: 'hue', delta: 0.25 } }, 1), { cause: 'mind' });
  stop1();
  // a second run comes with a page reload — a fresh storage object over the same backing store
  const stop2 = startStoryLive({ getSeed: () => 7, storage: shim(storage._map) });
  const v = getStoryView();
  assert.equal(v.session, 2);
  assert.ok(Math.abs(v.esteem.standing - 1.2) < 1e-9, 'standing persisted across the runs');
  assert.equal(v.esteem.mood, 0, 'mood did not');
  stop2();
});

ok('a same-page restart continues the session — StrictMode’s second setup begins no second', () => {
  const r2 = (x) => Math.round(x * 100) / 100; // what the encode carries over
  const storage = shim();
  const stop1 = startStoryLive({ getSeed: () => 5, storage });
  emit(Events.MIND_DECISION, decision('lois', { critique: { target: 'hue', delta: 0.25 } }, 1), { cause: 'mind' });
  const seen = getStoryView();
  stop1(); // React's cleanup, immediately followed by its re-setup — same page, same storage object
  const stop2 = startStoryLive({ getSeed: () => 5, storage });
  const v = getStoryView();
  assert.equal(v.session, seen.session, 'the page is one session');
  assert.ok(Math.abs(v.esteem.mood - r2(seen.esteem.mood)) < 1e-9, 'mood continues the session it interrupted');
  assert.ok(Math.abs(v.esteem.standing - r2(seen.esteem.standing)) < 1e-9, 'standing carries within the page too');
  stop2();
});

ok('the backstage view carries story state only — the arc has no readout, anywhere', () => {
  const storage = shim();
  const stop = startStoryLive({ getSeed: () => 1, storage });
  // drive the arc hard: lean shifts across sessions and a verdict flip — none of it may surface
  const lean = (keys, bar) => emit(Events.MIND_DECISION, decision('queen', { mood: 'calm', lean: Object.fromEntries(keys.map((k) => [k, 0.5])) }, bar), { cause: 'mind' });
  lean(['wetness'], 1); lean(['evolve'], 2);
  emit(Events.MIND_DECISION, decision('lois', { critique: { target: 'hue', delta: 0.2 } }, 3), { cause: 'mind' });
  emit(Events.MIND_DECISION, decision('lois', { critique: { target: 'hue', delta: -0.2 } }, 4), { cause: 'mind' });
  const text = JSON.stringify(getStoryView()).toLowerCase();
  assert.ok(!text.includes('suspicion'), 'no meter, no stage, no value');
  assert.ok(!text.includes('queen'), 'and no name for the third — not even backstage (DS rule 10)');
  assert.ok(!text.includes('anomal'), 'nor the evidence bookkeeping');
  stop();
});

ok('wiring: App starts and stops the driver; the dev panel reads its view; subscribers hear changes', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.match(app, /startStoryLive\(/, 'App.jsx starts the story driver');
  assert.match(app, /stopStory\(\)/, 'and stops it in the same cleanup as the feed');
  const panel = readFileSync(new URL('../panels/MindPanel.jsx', import.meta.url), 'utf8');
  assert.match(panel, /getStoryView/, 'the dev panel reads the story view');
  assert.ok(!/queen/i.test(panel), 'the dev panel names no third persona (surface law)');
  const storage = shim();
  let heard = 0;
  const off = subscribeStory(() => { heard++; });
  const stop = startStoryLive({ getSeed: () => 3, storage });
  emit(Events.CLOCK_BAR, { bar: 1 }, { cause: 'mind' });
  assert.ok(heard > 0, 'subscribers are notified on change');
  off(); stop();
});

console.log(`storyLive.selfcheck: ${n} checks passed`);
