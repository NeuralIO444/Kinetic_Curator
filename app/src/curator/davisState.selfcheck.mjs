// davisState.selfcheck.mjs — Davis's five states, each a measurement of the honest feed (#1126).
import assert from 'node:assert';
import { Events, emit } from '../composition/eventBus.js';
import {
  resolveDavisState, DAVIS_STATES, DAVIS_FLOW_ROLLS, DAVIS_UGLY_PASSES, DAVIS_UGLY_WINDOW_MS, DAVIS_SEEDLING_MS,
  DAVIS_STUCK_MS, DAVIS_STUCK_ROLLS, DAVIS_BLOOM_MS,
} from './davisState.js';
import { createLoisActivity, LOIS_AWAY_MS } from './loisActivity.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const code = (feed) => resolveDavisState(feed)?.code ?? null;

ok('no signal, no state: silence is the default, Davis is never invented into FLOW', () => {
  assert.equal(resolveDavisState(), null); assert.equal(resolveDavisState({}), null); assert.equal(resolveDavisState(null), null);
  assert.deepEqual(Object.keys(DAVIS_STATES), ['BLOOM', 'UGLY', 'STUCK', 'SEEDLING', 'FLOW']);
});

ok('each state fires at its threshold and not one step below', () => {
  assert.equal(code({ rollsLastMinute: DAVIS_FLOW_ROLLS }), 'FLOW'); assert.equal(code({ rollsLastMinute: DAVIS_FLOW_ROLLS - 1 }), null);
  assert.equal(code({ passesLast2m: DAVIS_UGLY_PASSES }), 'UGLY'); assert.equal(code({ passesLast2m: DAVIS_UGLY_PASSES - 1 }), null);
  assert.equal(code({ seedDropped: true, seedAgeMs: DAVIS_SEEDLING_MS - 1 }), 'SEEDLING'); assert.equal(code({ seedDropped: true, seedAgeMs: DAVIS_SEEDLING_MS }), null);
  assert.equal(code({ seedDropped: false, seedAgeMs: 5 }), null, 'a LOADED seed is not a dropped one');
  const stuck = { seedAgeMs: DAVIS_STUCK_MS, rollsSinceSeed: DAVIS_STUCK_ROLLS, keptThisSeed: false };
  assert.equal(code(stuck), 'STUCK'); assert.equal(code({ ...stuck, seedAgeMs: DAVIS_STUCK_MS - 1 }), null);
  assert.equal(code({ ...stuck, rollsSinceSeed: DAVIS_STUCK_ROLLS - 1 }), null); assert.equal(code({ ...stuck, keptThisSeed: true }), null, 'a keep on this seed is not stuck');
  assert.equal(code({ bloomAgeMs: DAVIS_BLOOM_MS - 1 }), 'BLOOM'); assert.equal(code({ bloomAgeMs: DAVIS_BLOOM_MS }), null); assert.equal(code({ bloomAgeMs: null }), null);
});

ok('priority BLOOM > UGLY > STUCK > SEEDLING > FLOW', () => {
  const all = { bloomAgeMs: 1, passesLast2m: 99, seedAgeMs: DAVIS_STUCK_MS, rollsSinceSeed: 99, keptThisSeed: false, seedDropped: true, rollsLastMinute: 99 };
  assert.equal(code(all), 'BLOOM');
  const { bloomAgeMs, ...noBloom } = all; assert.equal(code(noBloom), 'UGLY');
  const { passesLast2m, ...noUgly } = noBloom; assert.equal(code(noUgly), 'STUCK');
  assert.equal(code({ ...noUgly, rollsSinceSeed: 0 }), 'FLOW', 'seedAge is old, so not SEEDLING; rolls at a clip remain');
  assert.equal(code({ seedDropped: true, seedAgeMs: 3, rollsLastMinute: 99 }), 'SEEDLING');
});

// a fake store + clock to drive the real feed
const rig = () => {
  let now = 50_000_000; const subs = [];
  const st = { seed: 1, layoutParams: { composition: 'flow' }, historyUndoStack: [], historyRedoStack: [], favorites: [], keeps: [], lastEvolveTs: null };
  const store = { getState: () => st, subscribe: (fn) => { subs.push(fn); return () => {}; } };
  const act = createLoisActivity({ now: () => now });
  act.start({ store });
  const fire = () => subs.forEach((fn) => fn(st));
  return { act, st, fire, tick: (ms) => { now += ms; }, now: () => now, keepOnce: (i) => { st.keeps = [...st.keeps, { id: `k${i}` }]; fire(); } };
};

ok('PASSES: a roll that replaces a frame nobody kept; a roll off a kept frame is not a pass', () => {
  const r = rig();
  emit(Events.LAYOUT_CURATE); emit(Events.KINETIC_TAP, { kind: 'rules' });
  assert.equal(r.act.snapshot().passesLast2m, 2);
  r.tick(1000); r.keepOnce(1); // keep the frame...
  emit(Events.LAYOUT_CURATE); // ...and roll off it: the kept frame was not passed
  assert.equal(r.act.snapshot().passesLast2m, 2);
  emit(Events.LAYOUT_CURATE); assert.equal(r.act.snapshot().passesLast2m, 3, 'the NEXT roll replaced an unkept frame');
  r.act.stop();
});

ok('FLOW, UGLY and BLOOM come out of real rolls, passes and keeps; BLOOM holds a minute, then lets go', () => {
  const r = rig();
  for (let i = 0; i < DAVIS_FLOW_ROLLS; i++) { r.tick(5000); emit(Events.KINETIC_TAP, { kind: 'rules' }); }
  assert.equal(code(r.act.snapshot()), 'FLOW');
  for (let i = 0; i < DAVIS_UGLY_PASSES; i++) { r.tick(5000); emit(Events.LAYOUT_CURATE); }
  assert.equal(code(r.act.snapshot()), 'UGLY');
  r.tick(1000); r.keepOnce(1); // the keep after the ugly
  assert.equal(code(r.act.snapshot()), 'BLOOM', 'the payoff');
  r.tick(DAVIS_BLOOM_MS - 2000); assert.equal(code(r.act.snapshot()), 'BLOOM');
  r.tick(3000); assert.notEqual(code(r.act.snapshot()), 'BLOOM', 'a minute, then it lets go');
  r.act.stop();
});

ok('a keep with few passes before it is not a bloom; passes outside the window do not count', () => {
  const r = rig();
  for (let i = 0; i < DAVIS_UGLY_PASSES - 1; i++) { r.tick(2000); emit(Events.LAYOUT_CURATE); }
  r.tick(1000); r.keepOnce(1); assert.equal(r.act.snapshot().bloomAgeMs, null, 'four passes then a keep: no bloom');
  const q = rig();
  for (let i = 0; i < DAVIS_UGLY_PASSES; i++) { q.tick(1000); emit(Events.LAYOUT_CURATE); }
  q.tick(DAVIS_UGLY_WINDOW_MS + 1000); q.keepOnce(1);
  assert.equal(q.act.snapshot().bloomAgeMs, null, 'the passes were two minutes ago: that ugliness is over');
  r.act.stop(); q.act.stop();
});

ok('SEEDLING: a seed dropped in the session; STUCK: one seed, rolled on, nothing kept', () => {
  const r = rig();
  assert.equal(code(r.act.snapshot()), null, 'the seed it opened on was loaded, not dropped');
  r.tick(3000); r.st.seed = 2; r.fire();
  assert.equal(code(r.act.snapshot()), 'SEEDLING');
  r.tick(DAVIS_SEEDLING_MS); assert.notEqual(code(r.act.snapshot()), 'SEEDLING');
  for (let i = 0; i < DAVIS_STUCK_ROLLS; i++) { r.tick(1000); emit(Events.LAYOUT_CURATE); }
  r.tick(DAVIS_STUCK_MS); // two minutes on the same seed, rolled on six times
  assert.equal(r.act.snapshot().rollsSinceSeed, DAVIS_STUCK_ROLLS);
  assert.equal(code({ ...r.act.snapshot(), passesLast2m: 0, rollsLastMinute: 0 }), 'STUCK');
  r.keepOnce(9); assert.equal(r.act.snapshot().keptThisSeed, true);
  r.st.seed = 3; r.fire(); assert.equal(r.act.snapshot().rollsSinceSeed, 0, 'a new seed resets the count');
  r.act.stop();
});

ok('EVOLVE is Davis alone: its fires are rolls and passes, and they never wake LOIS (AWAY holds)', () => {
  const r = rig();
  r.tick(LOIS_AWAY_MS + 1000);
  assert.equal(r.act.snapshot().away, true);
  for (let i = 1; i <= DAVIS_FLOW_ROLLS; i++) { r.tick(4000); r.st.lastEvolveTs = i * 1000; r.fire(); }
  const snap = r.act.snapshot();
  assert.equal(snap.away, true, 'unattended generation does not count as the artist being back');
  assert.equal(snap.evolveCount, DAVIS_FLOW_ROLLS); assert.equal(snap.rollsLastMinute, DAVIS_FLOW_ROLLS);
  assert.equal(code(snap), 'FLOW', 'LOIS away, Davis in FLOW: DAVIS ALONE is now a reachable room');
  r.act.beat(); assert.equal(r.act.snapshot().away, false);
  r.act.stop();
});

ok('the MACHINE is not the artist: a dead-frame re-deal is muted from every ledger', () => {
  const r = rig();
  r.st.historyUndoStack = [{}, {}]; r.fire(); // set a baseline depth
  r.act.machine(() => { r.st.seed = 77; r.st.historyUndoStack = [{}]; r.st.historyRedoStack = [{}]; r.st.keeps = [{ id: 'x' }]; r.fire(); });
  const snap = r.act.snapshot();
  assert.equal(snap.undosLast10s, 0, 'the guard undoing a dead roll is not the artist undoing'); assert.equal(snap.keepsLast5m, 0);
  assert.equal(snap.seedDropped, false, 'and the new seed is not a seed the artist dropped');
  r.st.seed = 78; r.fire(); assert.equal(r.act.snapshot().seedDropped, true, 'but the artist dropping one afterwards is');
  r.act.stop();
});

console.log(`davisState.selfcheck: ${n} checks passed`);
