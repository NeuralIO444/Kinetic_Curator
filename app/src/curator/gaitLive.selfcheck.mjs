// node src/curator/gaitLive.selfcheck.mjs
// #2329 (GAIT M3) — the QUEEN's per-phrase pick on the bus, the user lock through the store, the take's GAIT_ASSIGN
// track and its replay. The clock is the real musical clock (composition/clockLive.js observeClock) with the Trio
// running beside it, so "a lock survives a full 32-bar Trio cycle" is checked on the Trio's own bars.
import assert from 'node:assert/strict';
import { Events, emit, on } from '../composition/eventBus.js';
import { observeClock, resetClock } from '../composition/clockLive.js';
import { startGaitPick } from './gaitLive.js';
import { startTrio } from './trioLive.js';
import { OWN_BARS, PHRASE_BARS } from './mindConduct.js';
import {
  createGaitRecorder,
  setGaitTap,
  checkGaitRecord,
  gaitAssignmentsAt,
  replayGaitFrame,
  endGaitReplay,
  GAIT_RECORD_VERSION,
} from './gaitRecord.mjs';
import { createGlobalSlice } from '../state/slices/globalSlice.js';
import { canonGaits } from '../data/canon/gaits.js';
import { ASSETS_CONSTRUCTS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// the store's gait half, as the app has it (the real slice: assignGait / lockGait)
let state = {};
const set = (patch) => {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
};
const get = () => state;
state = { ...createGlobalSlice(set, get) };

const A = ASSETS_CONSTRUCTS.find((a) => a.style === 'swiss').id;
const B = ASSETS_CONSTRUCTS.find((a) => a.style === 'organic').id;
const styleOf = (id) => ASSETS_CONSTRUCTS.find((a) => a.id === id)?.style ?? null;
let replaying = false;
let targets = [A, B];
const stopQueen = startGaitPick({
  getTargets: () => targets,
  styleOf,
  getAssignments: () => state.gaitAssignments,
  assign: (e) => state.assignGait(e),
  isReplaying: () => replaying,
});
const trio = startTrio({
  getRoutes: () => null,
  getTier: () => 't4',
  getBands: () => [0.5, 0.5, 0.5],
});

const heard = [];
const offHeard = on(Events.GAIT_ASSIGN, (p, m) => heard.push({ ...p, cause: m ? m.cause : null }));

// the real clock: 120 bpm, 2 s a bar; one advance per 100 ms of loop time
const BPM = 120;
let loopMs = 0;
let bars = 0;
const offBar = on(Events.CLOCK_BAR, () => bars++);
const runBars = (k) => {
  const until = bars + k;
  while (bars < until) {
    loopMs += 100;
    observeClock(loopMs, BPM);
  }
};
const energy = (level) => emit(Events.AUDIO_ENERGY, { level });
const wears = (t) => state.gaitAssignments[t]?.gaitId ?? null;
resetClock();
observeClock(0, BPM);

ok('no audio heard: the QUEEN picks nothing (every construct rests as its tile)', () => {
  runBars(PHRASE_BARS * 2);
  assert.deepEqual(state.gaitAssignments, {});
  assert.equal(heard.length, 0);
});

ok('high energy: at the next phrase each wearer gets its OWN style’s performing gait, picked by the queen', () => {
  energy('high');
  runBars(PHRASE_BARS);
  assert.equal(wears(A), canonGaits('swiss').performing.id);
  assert.equal(wears(B), canonGaits('organic').performing.id);
  assert.equal(state.gaitAssignments[A].by, 'queen');
  assert.equal(state.gaitAssignments[A].locked, false);
  assert.deepEqual(
    heard.map((h) => h.target),
    [A, B].sort(),
    'one GAIT_ASSIGN per wearer, sorted',
  );
});

ok('once a phrase, not once a bar: a level change mid-phrase waits for the boundary', () => {
  heard.length = 0;
  energy('mid');
  runBars(1);
  // a bar after the boundary we just crossed is not a phrase boundary (we are 1 bar into a phrase)
  assert.equal(wears(A), canonGaits('swiss').performing.id);
  runBars(PHRASE_BARS);
  assert.equal(wears(A), canonGaits('swiss').idle.id, 'mid → idle');
  energy('low');
  runBars(PHRASE_BARS);
  assert.equal(wears(A), canonGaits('swiss').still.id, 'low → still');
  emit(Events.AUDIO_SILENCE_START, { ms: 2100 });
  energy('high');
  runBars(PHRASE_BARS);
  assert.equal(wears(A), canonGaits('swiss').still.id, 'silence → still, whatever the last level');
  emit(Events.AUDIO_SILENCE_END, { ms: 4000 });
  runBars(PHRASE_BARS);
  assert.equal(wears(A), canonGaits('swiss').performing.id);
});

ok('an UNLOCKED user pick is the QUEEN’s to re-pick at the next phrase', () => {
  const r = state.assignGait({ target: A, gaitId: canonGaits('swiss').idle.id, by: 'user', locked: false });
  assert.equal(r.applied, true);
  runBars(PHRASE_BARS);
  assert.equal(state.gaitAssignments[A].by, 'queen');
  assert.equal(wears(A), canonGaits('swiss').performing.id);
});

ok('a LOCK survives a full 32-bar Trio cycle (and more) while the QUEEN keeps picking for everyone else', () => {
  const lockedOn = canonGaits('swiss').idle.id;
  assert.equal(state.assignGait({ target: A, gaitId: lockedOn, by: 'user', locked: true }).applied, true);
  const start = bars;
  const levels = ['low', 'mid', 'high', 'low', 'high', 'mid', 'low', 'high', 'mid', 'high', 'low'];
  for (const lv of levels) {
    energy(lv);
    runBars(PHRASE_BARS);
    assert.equal(wears(A), lockedOn, `still locked at bar ${bars}`);
    assert.equal(state.gaitAssignments[A].locked, true);
  }
  assert.ok(bars - start > OWN_BARS, `ran ${bars - start} bars > the Trio's ${OWN_BARS}-bar cycle`);
  assert.equal(wears(B), canonGaits('organic').still.id, 'the unlocked wearer followed the room (last: low)');
  // a QUEEN (or DAVIS) assignment against the lock is refused, and says so
  assert.deepEqual(state.assignGait({ target: A, gaitId: canonGaits('swiss').performing.id, by: 'davis' }), {
    applied: false,
    reason: 'locked',
  });
  assert.equal(trio.conductor.owned(bars).length, 0, 'the Trio itself owns nothing: the lock is not its ownership');
});

ok('lockGait: locks what it wears; unlock hands it back to the QUEEN at the next phrase', () => {
  state.lockGait(A, false);
  assert.equal(state.gaitAssignments[A].locked, false);
  energy('high');
  runBars(PHRASE_BARS);
  assert.equal(wears(A), canonGaits('swiss').performing.id);
  state.lockGait(A, true);
  assert.equal(state.gaitAssignments[A].locked, true);
  assert.equal(wears(A), canonGaits('swiss').performing.id, 'locked on what it wore');
  // lock with nothing assigned: the style's still
  const C = ASSETS_CONSTRUCTS.find((a) => a.style === 'memphis').id;
  state.lockGait(C, true);
  assert.equal(wears(C), canonGaits('memphis').still.id);
  state.lockGait(A, false);
  state.lockGait(C, false);
});

ok('muted while a take plays: no pick at all', () => {
  replaying = true;
  const before = state.gaitAssignments;
  energy('low');
  runBars(PHRASE_BARS * 2);
  assert.equal(state.gaitAssignments, before, 'the same map: nothing re-picked');
  replaying = false;
});

ok('the take records every landed GAIT_ASSIGN; replay re-publishes them as they were and never re-picks', () => {
  let frame = 0;
  const rec = createGaitRecorder({ getFrame: () => frame });
  setGaitTap((e) => rec.update(e));
  for (const lv of ['high', 'mid', 'low', 'high']) {
    energy(lv);
    frame += 240;
    runBars(PHRASE_BARS);
  }
  state.assignGait({ target: B, gaitId: canonGaits('organic').idle.id, by: 'user', locked: true });
  frame += 10;
  setGaitTap(null);
  const section = rec.finish();
  assert.equal(section.version, GAIT_RECORD_VERSION);
  assert.ok(section.events.length >= 6, `${section.events.length} rows`);
  assert.ok(checkGaitRecord(section));
  assert.equal(checkGaitRecord({ version: 1, events: [[5, A, 'nope', 'queen', 0]] }), null, 'a forged row fails');
  // the standing map at the end equals the live map for every recorded target
  const end = gaitAssignmentsAt(JSON.parse(JSON.stringify(section)), frame);
  for (const t of Object.keys(end)) assert.deepEqual(end[t], state.gaitAssignments[t]);
  // play it back twice: the bus hears the same rows, cause 'replay', and the QUEEN (muted) adds none
  replaying = true;
  const runReplay = () => {
    const got = [];
    const off = on(Events.GAIT_ASSIGN, (p, m) => got.push([p.target, p.gaitId, p.by, p.locked, m && m.cause]));
    endGaitReplay();
    for (let f = 0; f <= frame; f++) {
      replayGaitFrame(f, section);
      if (f % 60 === 0) runBars(1);
    }
    off();
    return got;
  };
  const r1 = runReplay();
  const r2 = runReplay();
  replaying = false;
  assert.deepEqual(r1, r2, 'two replays publish the same assignments');
  assert.equal(r1.length, section.events.length);
  assert.ok(r1.every((e) => e[4] === 'replay'));
  assert.deepEqual(
    r1.map((e) => e.slice(0, 4)),
    section.events.map((r) => [r[1], r[2], r[3], r[4] === 1]),
  );
  // a seek lands on the standing map first
  const seekHeard = [];
  const off = on(Events.GAIT_ASSIGN, (p) => seekHeard.push(p));
  endGaitReplay();
  replayGaitFrame(frame, section, { seeked: true });
  off();
  assert.ok(seekHeard.length >= Object.keys(end).length);
  endGaitReplay();
});

stopQueen();
trio.stop();
offHeard();
offBar();
console.log(`gaitLive.selfcheck: ${n} checks ok`);
