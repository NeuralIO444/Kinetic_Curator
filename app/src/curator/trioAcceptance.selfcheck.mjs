// node src/curator/trioAcceptance.selfcheck.mjs
// #1483 acceptance, through the real modules (the bus, startTrio, startMind, the rules, the take recorder and its
// replay cursor). Only the store and the model backend are fakes, as in trioLive.selfcheck.mjs / mind.selfcheck.mjs.
//   Box 1: audio on -> the trio is active from the next bar; audio off -> conducting stops and the faces go back to
//          the non-audio drivers (no show block: LOIS reads the room's face instead of burning a flat show).
//   Box 7: replaying the recorded conducting rows reproduces the route table and asks no backend.
import assert from 'node:assert/strict';
import { emit, on, Events } from '../composition/eventBus.js';
import { startTrio, setConductTap, getTrioView } from './trioLive.js';
import { startMind, setMindTap, replayMindFrame, endMindReplay } from './mindLive.js';
import { createMindRecorder, checkMindRecord } from './mindRecord.js';
import { applyRouteOp, DAVIS_TAG } from './mindConduct.js';
import { buildContext } from './mindContext.js';
import { rulesReply } from './mindRules.js';
import { sanitizeAudioRoutes } from '../data/audioRoutes.js';
import { DEFAULT_ROUTES } from '../gl/audioRoutes.mjs';

let n = 0;
let asked = 0;
const spy = { live: 0 };
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

/** A fresh trio on a fake store (the bus -> store path of App), tier t3, the take recorder tapped when given. */
function rig({ rec = null, replaying = false } = {}) {
  const st = { audioRoutes: null };
  const offSet = on(Events.AUDIO_ROUTES_SET, (p) => {
    st.audioRoutes = sanitizeAudioRoutes(p.routes);
  });
  const applied = [];
  const offRoute = on(Events.MIND_ROUTE, (e, m) => {
    if (e.status === 'applied' && (!m || m.cause !== 'replay')) applied.push(e);
  });
  const ctl = { replaying };
  const trio = startTrio({
    getRoutes: () => st.audioRoutes,
    getTier: () => 't3',
    getBands: () => [0.5, 0.4, 0.3, 0.3, 0.2, 0.2, 0.1],
    isReplaying: () => ctl.replaying,
  });
  if (rec) setConductTap((e) => rec.conduct(e));
  return {
    st,
    applied,
    trio,
    bar: (b) => emit(Events.CLOCK_BAR, { bar: b }),
    request: (b, route) =>
      emit(Events.MIND_REQUEST, {
        persona: 'davis',
        bar: b,
        backend: 'rules',
        invented: false,
        reply: { propose: null, route },
      }),
    ctx: (room = {}) => buildContext({ layers: [], room, audio: 'mic', tier: 't3', show: trio.showBlock() }),
    done: () => {
      trio.stop();
      offSet();
      offRoute();
      setConductTap(null);
    },
  };
}
const audioOn = () => emit(Events.AUDIO_INPUT, { source: 'mic' });
const audioOff = () => emit(Events.AUDIO_INPUT, { source: 'none' });

ok('box 1a: before audio the trio is dormant; from the first bar after audio:input it conducts', () => {
  const g = rig();
  g.bar(1);
  assert.equal(g.trio.showBlock(), null, 'audio never on: no show block');
  assert.equal(g.st.audioRoutes, null);
  // Davis asks while audio is still off: nothing is held for him
  assert.equal(rulesReply('davis', g.ctx(), { seed: 5 }).route, undefined, 'no show: no proposal from the rules');
  g.request(1, { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 });
  assert.equal(getTrioView(), null, 'a proposal before audio is ignored: nothing was ever published');
  g.bar(4);
  assert.equal(g.applied.length, 0, 'and nothing lands at the boundary');

  audioOn();
  emit(Events.AUDIO_ENERGY, { level: 'mid' });
  g.bar(5); // the first CLOCK_BAR tick after audio:input
  const show = g.trio.showBlock();
  assert.ok(show, 'the first bar after audio on: a show block exists');
  assert.equal(show.energy, 'mid');
  assert.equal(show.routes.length, DEFAULT_ROUTES.length, 'empty route table: the default table is what he sees');
  assert.equal(getTrioView().on, true);
  // tier t3, empty table, energy set: the real rules propose, and the proposal is held for the next phrase boundary
  const route = rulesReply('davis', g.ctx(), { seed: 7, bar: 5 }).route;
  assert.ok(route && route.op === 'add', 'Davis proposes an add');
  g.request(5, route);
  const pending = getTrioView().pending;
  assert.ok(pending, 'queued');
  assert.equal(pending.landBar, 8, 'for the next phrase boundary');
  assert.equal(g.st.audioRoutes, null, 'not before it');
  g.bar(6);
  g.bar(7);
  assert.equal(g.applied.length, 0);
  g.bar(8);
  assert.equal(g.applied.length, 1, 'applied on the boundary');
  assert.equal(g.applied[0].landBar, 8);
  g.done();
});

ok(
  'box 1b: audio off stops conducting (no show block, no edits across phrases) and the faces go back to the room',
  () => {
    const g = rig();
    audioOn();
    emit(Events.AUDIO_ENERGY, { level: 'mid' });
    for (let b = 1; b <= 6; b++) g.bar(b); // a held signal for a phrase: a flat show
    const withShow = g.ctx({ lois: 'NOD', davis: 'FLOW' });
    assert.ok(withShow.show, 'the context carries the show while audio is on');
    assert.equal(rulesReply('lois', withShow, {}).state, 'BURN', 'audio on: LOIS burns the flat show');
    const route = rulesReply('davis', withShow, { seed: 3, bar: 6 }).route;
    assert.ok(route, 'Davis has a proposal');
    g.request(6, route);
    assert.ok(getTrioView().pending, 'held for the boundary');

    audioOff();
    assert.equal(g.trio.showBlock(), null, 'audio off: showBlock is null');
    assert.equal(getTrioView().on, false);
    assert.equal(getTrioView().pending, null, 'the held proposal is dropped with the show');
    // his own later asks and further phrases change nothing
    g.request(7, route);
    for (let b = 7; b <= 17; b++) g.bar(b); // across the boundaries at 8, 12, 16
    assert.equal(g.applied.length, 0, 'no edit lands after audio off');
    assert.equal(g.st.audioRoutes, null, 'the table is untouched');
    // the faces: with no show block the rules read the room (the non-audio driver), they do not burn on flatBars
    const off = g.ctx({ lois: 'NOD', davis: 'FLOW' });
    assert.equal(off.show ?? null, null, 'no show in the context');
    assert.deepEqual(
      [rulesReply('lois', off, {}).state, rulesReply('davis', off, { seed: 3, bar: 12 }).state],
      ['NOD', 'FLOW'],
      "the faces are the room's again",
    );
    assert.equal(rulesReply('davis', off, { seed: 3, bar: 12 }).route, undefined, 'and Davis proposes nothing');
    g.done();
  },
);

ok('box 7: replaying the recorded conducting rows reproduces the route table and calls no backend', () => {
  // live: two of Davis's edits land across two phrases; the take recorder is handed every outcome
  let frame = 0;
  const rec = createMindRecorder({ getFrame: () => frame });
  const g = rig({ rec });
  audioOn();
  emit(Events.AUDIO_ENERGY, { level: 'mid' });
  const at = (b) => {
    frame = b * 10;
    g.bar(b);
  };
  for (let b = 1; b <= 4; b++) at(b);
  g.request(4, rulesReply('davis', g.ctx(), { seed: 7, bar: 4 }).route);
  for (let b = 5; b <= 8; b++) at(b);
  const second = { op: 'add', input: 'band.air', target: 'color.hue', depth: 10 };
  g.request(8, second);
  for (let b = 9; b <= 12; b++) at(b);
  assert.equal(g.applied.length, 2, 'two edits landed live');
  const live = g.st.audioRoutes;
  assert.equal(live.length, DEFAULT_ROUTES.length + 2);
  assert.equal(live.filter((r) => r.by === DAVIS_TAG).length, 2);
  g.done();
  const record = rec.finish();
  assert.ok(checkMindRecord(record), 'the record checks');
  assert.equal(record.conduct.length, 2, 'both outcomes were recorded');

  // replay: a model backend that must never be asked, the real mind driver muted, and a fresh store that rebuilds the
  // table from the replayed mind:route rows (the same applyRouteOp the live landing used)
  const model = {
    name: 'apple',
    available: () => true,
    ask: () => {
      asked++;
      return Promise.resolve(null);
    },
  };
  const backendTraffic = [];
  const offs = [Events.MIND_REQ, Events.MIND_REPLY].map((ev) => on(ev, () => backendTraffic.push(ev)));
  const mindDecisions = [];
  offs.push(on(Events.MIND_DECISION, (d, m) => m.cause !== 'replay' && mindDecisions.push(d)));
  const stopMind = startMind({
    model,
    getSnapshot: () => ({ room: { lois: 'NOD', davis: 'FLOW' } }),
    getSeed: () => 77,
    isReplaying: () => true,
  });
  const fresh = { routes: null };
  const replayed = [];
  offs.push(
    on(Events.MIND_ROUTE, (e, m) => {
      if (m.cause !== 'replay' || e.status !== 'applied') return;
      replayed.push(e);
      const res = applyRouteOp(fresh.routes || DEFAULT_ROUTES, e.op, DAVIS_TAG);
      assert.ok(res, 'the replayed op applies to the fresh table');
      assert.deepEqual(res.delta, e.delta, 'and makes the delta the take recorded');
      fresh.routes = res.routes;
    }),
  );
  const replayTrio = rig({ replaying: true }); // a trio in a replaying session conducts nothing of its own
  audioOn();
  for (let f = 0; f <= 130; f += 10) {
    replayMindFrame(f, record, { seeked: f === 0 });
    emit(Events.CLOCK_BAR, { bar: f / 10 }); // the bars keep coming; every persona is muted
  }
  assert.equal(replayTrio.applied.length, 0);
  assert.equal(replayTrio.st.audioRoutes, null, 'the replaying trio edits nothing');
  replayTrio.done();
  endMindReplay();
  stopMind();
  offs.forEach((f) => f());

  assert.equal(replayed.length, 2, 'both rows were re-published');
  assert.deepEqual(sanitizeAudioRoutes(fresh.routes), live, 'the replayed route table deep-equals the live one');
  assert.equal(asked, 0, 'the model backend was never asked');
  assert.deepEqual(backendTraffic, [], 'no model request or reply during replay');
  assert.deepEqual(mindDecisions, [], 'the rules backend published no decision during replay');
  // the spies are live: the same driver, not muted, does reach both backends
  const live2 = [];
  const off2 = on(Events.MIND_DECISION, (d, m) => m.cause === 'mind' && live2.push(d.backend));
  setMindTap(null);
  const stop2 = startMind({ model, getSnapshot: () => ({ room: { lois: 'NOD', davis: 'FLOW' } }), getSeed: () => 77 });
  emit(Events.CLOCK_BAR, { bar: 1 });
  stop2();
  off2();
  assert.ok(live2.includes('rules'), 'unmuted, the rules backend answers (the decision tap works)');
  spy.live = asked;
});
await new Promise((r) => setTimeout(r, 0));
assert.ok(spy.live > 0 || asked > 0, 'unmuted, the model backend is asked (the ask spy works)');

console.log('trioAcceptance.selfcheck: ok (#1483 boxes 1 and 7)');
