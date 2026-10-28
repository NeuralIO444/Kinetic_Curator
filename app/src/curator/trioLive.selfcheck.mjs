// node src/curator/trioLive.selfcheck.mjs
// #1483 stage 1 PR 2 — Davis's conducting, live half, on the real bus: a proposal is gated, held to the phrase boundary,
// applied inside the clamps with his mark and its delta, announced and recorded; the artist's edits are sovereign; a
// take plays without it; and a take records and replays what he did.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emit, on, Events } from '../composition/eventBus.js';
import { startTrio, setConductTap, DIAL_FOR_TARGET, getTrioView, subscribeTrio } from './trioLive.js';
import { createMindRecorder, checkMindRecord, createMindReplay } from './mindRecord.js';
import { sanitizeAudioRoutes, isDefaultRoutes } from '../data/audioRoutes.js';
import { DEFAULT_ROUTES, ROUTE_TARGETS } from '../gl/audioRoutes.mjs';
import { buildContext } from './mindContext.js';
import { rulesReply } from './mindRules.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const ADD = { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 };
/** A fresh trio on a fake store: state { audioRoutes, layoutParams }, a setter that mimics the bus -> store path. */
function rig({ tier = 't3', replaying = false, activity = null, spectrum = undefined } = {}) {
  const st = { audioRoutes: null, layoutParams: { squash: 0, audioAlphaMod: 0.25 } };
  const subs = [];
  const set = (patch) => {
    const prev = { ...st };
    Object.assign(st, patch);
    subs.forEach((f) => f(st, prev));
  };
  const offSet = on(Events.AUDIO_ROUTES_SET, (p) => set({ audioRoutes: sanitizeAudioRoutes(p.routes) }));
  const out = { applied: [], dropped: [], taps: [] };
  const offRoute = on(Events.MIND_ROUTE, (e) => (e.status === 'applied' ? out.applied : out.dropped).push(e));
  setConductTap((e) => out.taps.push(e));
  const ctl = { replaying, tier };
  const trio = startTrio({
    getRoutes: () => st.audioRoutes,
    getTier: () => ctl.tier,
    getBands: () => [0.5, 0.4, 0.3, 0.3, 0.2, 0.2, 0.1],
    getActivity: activity ? () => activity : null,
    ...(spectrum !== undefined ? { getSpectrum: spectrum } : {}),
    isReplaying: () => ctl.replaying,
    subscribe: (f) => {
      subs.push(f);
      return () => {};
    },
  });
  const bar = (b) => emit(Events.CLOCK_BAR, { bar: b });
  const request = (b, route = ADD) =>
    emit(Events.MIND_REQUEST, {
      persona: 'davis',
      bar: b,
      backend: 'rules',
      invented: false,
      reply: { propose: null, route },
    });
  const done = () => {
    trio.stop();
    offSet();
    offRoute();
    setConductTap(null);
  };
  return { st, set, out, trio, ctl, bar, request, done };
}
const audioOn = () => emit(Events.AUDIO_INPUT, { source: 'mic' });

ok('a proposal is held to the phrase boundary, then applied with his mark and announced with its delta', () => {
  const g = rig();
  audioOn();
  g.bar(5);
  g.request(5);
  g.bar(6);
  g.bar(7);
  assert.equal(g.st.audioRoutes, null, 'nothing yet: it lands on the boundary');
  g.bar(8);
  assert.equal(g.out.applied.length, 1);
  const rows = g.st.audioRoutes;
  const mine = rows.find((r) => r.target === 'render.glow' && r.input === 'band.mids');
  assert.ok(mine && mine.by === 'davis' && mine.depth === 0.3, 'his row, tagged');
  assert.equal(rows.length, DEFAULT_ROUTES.length + 1, 'the default table, plus his');
  assert.equal(g.out.applied[0].landBar, 8);
  assert.deepEqual(g.out.applied[0].delta.before, null);
  assert.equal(g.out.taps.length, 1, 'handed to the take recorder');
  assert.equal(isDefaultRoutes(rows), false);
  g.done();
});

ok('one edit per phrase: one is held for the boundary, a second waits for the next phrase and is not dropped', () => {
  const g = rig();
  audioOn();
  const other = { op: 'add', input: 'band.air', target: 'color.hue', depth: 10 };
  g.bar(5);
  g.request(5);
  g.request(6, other);
  assert.deepEqual(g.out.dropped, [], 'held for the boundary: the same conducting said again is not a drop');
  g.bar(8);
  assert.equal(g.out.applied.length, 1);
  g.request(8, other); // bar 8 would land at 8, whose phrase has its edit: it waits for 12
  assert.deepEqual(g.out.dropped, [], 'nothing is dropped for the rate');
  g.bar(9);
  g.bar(11);
  assert.equal(g.out.applied.length, 1, 'not before its own phrase boundary');
  g.bar(12);
  assert.equal(g.out.applied.length, 2, 'the next phrase');
  assert.equal(g.out.applied[1].landBar, 12);
  g.done();
});

ok('tier 2 does not ask for an add: no drop rows for what it may not make', () => {
  const g = rig({ tier: 't2' });
  audioOn();
  const mk = (tier) => buildContext({ layers: [], room: {}, audio: 'mic', tier, show: g.trio.showBlock() });
  for (let b = 1; b <= 6; b++) g.bar(b);
  assert.equal(rulesReply('davis', mk('t2'), { seed: 3 }).route, undefined, 'tier 2: no proposal the tier cannot make');
  assert.ok(rulesReply('davis', mk('t3'), { seed: 3 }).route, 'tier 3 does ask');
  g.done();
});

ok('tier gates it: tier 1 and no tier drop the proposal with its reason, and nothing changes', () => {
  for (const tier of ['t1', null]) {
    const g = rig({ tier });
    audioOn();
    g.bar(5);
    g.request(5);
    g.bar(8);
    assert.deepEqual(
      g.out.dropped.map((e) => e.reason),
      ['tier'],
    );
    assert.equal(g.st.audioRoutes, null);
    g.done();
  }
  const g = rig({ tier: 't2' });
  audioOn();
  g.bar(5);
  g.request(5);
  assert.equal(g.out.dropped[0].reason, 'tier', 'tier 2 may only nudge a depth, not add');
  g.done();
});

ok('the artist is sovereign: a route they edit owns its target; a dial they move owns its target', () => {
  const g = rig();
  audioOn();
  // the artist re-sets the glow route's depth in the MATRIX
  g.set({
    audioRoutes: sanitizeAudioRoutes([
      ...DEFAULT_ROUTES.map((r) => ({ ...r })),
      { input: 'band.sub', target: 'render.glow', depth: 0.2 },
    ]),
  });
  assert.deepEqual(g.trio.conductor.owned(), ['render.glow']);
  g.bar(5);
  g.request(5);
  assert.equal(g.out.dropped[0].reason, 'owned');
  // they move a dial: its target is theirs too
  // a recalled hit, a morph or an evolve rewrites many dials at once: that is not the artist moving a dial
  g.set({
    layoutParams: { ...g.st.layoutParams, squash: 0.9, breath: 0.2, kinemeRate: 3, hueRotate: 40, accumulation: true },
  });
  for (const t of ['render.squash', 'render.breath', 'clock.kinemeRate', 'color.hue', 'render.accum'])
    assert.equal(g.trio.conductor.isOwned(t), false, `a rewrite of the layout does not own ${t}`);
  // the slider's own event does
  emit(Events.LAYOUT_PARAM, { key: 'squash', value: 0.4 });
  assert.ok(g.trio.conductor.isOwned('render.squash'), 'squash dial -> render.squash');
  emit(Events.FEEL_APPLY, { id: 'violent' });
  assert.ok(
    g.trio.conductor.isOwned('render.scale') && g.trio.conductor.isOwned('render.alpha'),
    'a FEEL pill owns the audio feel targets',
  );
  emit(Events.LAYOUT_PARAM, { key: 'count', value: 40 });
  assert.equal(g.trio.conductor.isOwned('render.hue'), false, 'a dial that is no route target owns nothing');
  assert.deepEqual(DIAL_FOR_TARGET['render.squash'], ['squash']);
  for (const t of Object.keys(DIAL_FOR_TARGET))
    assert.ok(Object.prototype.hasOwnProperty.call(ROUTE_TARGETS, t), `${t} is a real route target`);
  g.done();
});

ok('editing his row makes it theirs: the mark clears, and undoing it counts toward his backoff', () => {
  const g = rig();
  audioOn();
  g.bar(5);
  g.request(5);
  g.bar(8);
  const before = g.st.audioRoutes;
  assert.equal(before.find((r) => r.target === 'render.glow' && r.input === 'band.mids').by, 'davis');
  // the artist nudges the depth of his row
  g.set({
    audioRoutes: before.map((r) => (r.input === 'band.mids' && r.target === 'render.glow' ? { ...r, depth: 0.45 } : r)),
  });
  const after = g.st.audioRoutes.find((r) => r.input === 'band.mids' && r.target === 'render.glow');
  assert.equal(after.by, undefined, 'the mark is cleared');
  assert.equal(after.depth, 0.45, 'their value is kept');
  assert.ok(g.trio.conductor.isOwned('render.glow'));
  g.done();
  // three reverts: he backs off
  const h = rig({ tier: 't4' });
  audioOn();
  const mine = [
    { op: 'add', input: 'band.air', target: 'color.hue', depth: 10 },
    { op: 'add', input: 'band.pres', target: 'render.alpha', depth: 5 },
    { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 },
  ];
  mine.forEach((op, i) => {
    const b = 8 * i + 1;
    h.bar(b);
    h.request(b, op);
    h.bar(b + 3); // lands on the boundary
    assert.ok(
      h.st.audioRoutes.some((r) => r.target === op.target && r.by === 'davis'),
      `edit ${i + 1} landed`,
    );
    h.set({ audioRoutes: h.st.audioRoutes.filter((r) => r.target !== op.target) }); // the artist removes it
  });
  h.bar(30);
  h.request(30, { op: 'add', input: 'band.mids', target: 'render.scale', depth: 0.15 });
  assert.equal(h.out.dropped.at(-1).reason, 'cooldown', 'three reverts: he goes quiet');
  h.done();
});

ok('audio off or a take playing: no proposal is applied, and the show block is absent', () => {
  const g = rig();
  g.bar(5);
  g.request(5);
  g.bar(8);
  assert.equal(g.out.applied.length + g.out.dropped.length, 0, 'audio never turned on');
  assert.equal(g.trio.showBlock(), null);
  audioOn();
  assert.ok(g.trio.showBlock() && g.trio.showBlock().routes.length === DEFAULT_ROUTES.length);
  emit(Events.AUDIO_INPUT, { source: 'none' });
  assert.equal(g.trio.showBlock(), null, 'audio off: conducting stops');
  g.done();
  const r = rig({ replaying: true });
  audioOn();
  r.bar(5);
  r.request(5);
  r.bar(8);
  assert.equal(r.out.applied.length, 0);
  assert.equal(r.trio.showBlock(), null, 'a take plays: muted');
  r.done();
});

ok('the show block reports what the audio is doing, and a flat signal counts flat bars', () => {
  const g = rig();
  audioOn();
  emit(Events.AUDIO_ENERGY, { level: 'high' });
  emit(Events.AUDIO_TEMPO, { bpm: 128, confidence: 0.9 });
  for (let i = 0; i < 6; i++) {
    emit(Events.AUDIO_ONSET, { strength: 0.5, band: 'bass' });
    g.bar(i + 1);
  }
  const s = g.trio.showBlock();
  assert.equal(s.energy, 'high');
  assert.equal(s.bpm, 128);
  assert.equal(s.onsets, 1);
  assert.ok(s.flatBars >= 2, `the held bands read flat (${s.flatBars})`);
  emit(Events.AUDIO_SILENCE_START, { ms: 2000 });
  g.bar(7);
  assert.equal(g.trio.showBlock().silent, true);
  g.done();
});

ok('end to end: the context carries the show, the rules conduct, LOIS burns the flat show', () => {
  const g = rig({ tier: 't3' });
  audioOn();
  emit(Events.AUDIO_ENERGY, { level: 'mid' });
  for (let i = 1; i <= 6; i++) g.bar(i);
  const ctx = buildContext({ layers: [], room: {}, audio: 'mic', tier: 't3', show: g.trio.showBlock() });
  const dv = rulesReply('davis', ctx, { seed: 7, bar: 6 });
  assert.ok(dv.route && dv.route.op === 'add', 'Davis proposes');
  assert.equal(rulesReply('lois', ctx, {}).state, 'BURN', 'six bars of a held signal: a failed show');
  g.request(6, dv.route);
  g.bar(8);
  assert.equal(g.out.applied.length, 1);
  g.done();
});

ok('the take records what he did and replays it; a take without conducting is unchanged', () => {
  const rec = createMindRecorder({ getFrame: () => 120 });
  rec.conduct({
    status: 'applied',
    op: ADD,
    delta: { op: 'add', before: null, after: { ...ADD, by: 'davis' } },
    bar: 5,
    landBar: 8,
  });
  rec.conduct({ status: 'dropped', reason: 'owned', op: ADD, bar: 9, landBar: null });
  rec.conduct({ status: 'weird', op: ADD });
  rec.conduct({ status: 'applied', op: { op: 'add', input: 'nope' } });
  const rec2 = rec.finish();
  assert.equal(rec2.conduct.length, 2, 'bad entries are not recorded');
  assert.ok(checkMindRecord(rec2), 'and the record passes its check');
  assert.equal(
    checkMindRecord({ ...rec2, conduct: [[1, 'applied', null, 1, 8, { op: 'add' }, null]] }),
    null,
    'a malformed conducting row fails the whole record',
  );
  const cur = createMindReplay(rec2);
  assert.deepEqual(cur.conductStep(119), []);
  const [a, d] = cur.conductStep(120);
  assert.equal(a.status, 'applied');
  assert.equal(a.landBar, 8);
  assert.equal(d.reason, 'owned');
  cur.seek(0);
  assert.equal(cur.conductStep(200).length, 2, 'a seek re-arms the cursor');
  const plain = createMindRecorder({ getFrame: () => 1 }).finish();
  assert.equal('conduct' in plain, false, 'no conducting: the section is exactly what it was');
});

ok("LOIS's keep-rate moves the threshold she calls a show flat at, and the dev view says so", () => {
  const read = (activity) => {
    const g = rig({ activity });
    audioOn();
    g.bar(1);
    const v = getTrioView();
    g.done();
    return v;
  };
  const neutral = read(null);
  assert.equal(neutral.bias, 0);
  assert.ok(Math.abs(neutral.flatBelow - 0.03) < 1e-9, 'no activity read: the base threshold');
  const passing = read({ keeps: 0, rolls: 12 });
  assert.ok(passing.bias > 0.99 && passing.flatBelow > neutral.flatBelow, 'passes pile up: she calls it flat sooner');
  const keeping = read({ keeps: 5, rolls: 12 });
  assert.ok(keeping.bias < -0.99 && keeping.flatBelow < neutral.flatBelow, 'you are keeping: she lets it ride');
  const broken = rig({ activity: null });
  broken.done();
});

ok('the dev view: tier, what he holds, what waits, the last twelve outcomes newest first; null when stopped', () => {
  const g = rig({ tier: 't4' });
  let pings = 0;
  const off = subscribeTrio(() => {
    pings++;
  });
  audioOn();
  let v = getTrioView();
  assert.equal(v.on, true);
  assert.equal(v.tier, 't4');
  assert.deepEqual(v.owned, []);
  assert.equal(v.log.length, 0);
  g.bar(1);
  g.request(1);
  v = getTrioView();
  assert.deepEqual(
    v.pending,
    { desc: '+ band.mids > render.glow 0.3', landBar: 4 },
    'a proposal waiting for its boundary',
  );
  g.bar(4);
  v = getTrioView();
  assert.equal(v.pending, null);
  assert.equal(v.mine, 1);
  assert.equal(v.routes, DEFAULT_ROUTES.length + 1);
  assert.deepEqual(v.log[0], {
    bar: 1,
    landBar: 4,
    status: 'applied',
    reason: null,
    desc: '+ band.mids > render.glow 0.3',
  });
  g.trio.conductor.touch(['render.scale']);
  g.bar(5);
  assert.deepEqual(getTrioView().owned, ['render.scale']);
  for (let i = 0; i < 20; i++) {
    g.request(8 + i, { op: 'add', input: 'band.air', target: 'render.scale', depth: 0.1 });
  }
  v = getTrioView();
  assert.equal(v.log.length, 12, 'capped at twelve');
  assert.equal(v.log[0].status, 'dropped');
  assert.equal(v.log[0].reason, 'owned', 'newest first');
  assert.ok(pings > 5, 'subscribers hear about it');
  g.done();
  assert.equal(getTrioView(), null, 'stopped: nothing to show');
  off();
});

ok(
  'wired: App starts the trio and tells the personas the show; the MATRIX marks his rows; the take taps the outcomes',
  () => {
    const app = src('../App.jsx');
    assert.match(app, /const trio = startTrio\(\{/);
    assert.match(app, /show: trio\.showBlock\(\)/);
    assert.match(app, /trio\.stop\(\)/);
    assert.match(app, /getTier: \(\) => presence\.contextFor\('davis'\)\.tier/);
    assert.match(src('../panels/stimulus/ModMatrix.jsx'), /route\.by === 'davis'/);
    assert.match(src('../components/PerformanceButton.jsx'), /setConductTap\(\(e\) => rec\.conduct\(e\)\)/);
    const live = src('./trioLive.js');
    assert.ok(!/Math\.random|Date\.now|performance\.now/.test(live), 'no clock or randomness: bars only');
    // every preset target is one the MATRIX can show
    const matrix = src('../panels/stimulus/ModMatrix.jsx');
    const label = matrix.match(/const TARGET_LABEL = \{[^}]*\}/)[0];
    const conduct = src('./mindConduct.js');
    for (const m of conduct.matchAll(/target: '([a-z.A-Z]+)'/g))
      assert.ok(label.includes(`'${m[1]}'`), `${m[1]} is pickable in the MATRIX`);
  },
);

ok('the show block carries the spectrum summary only while audio is live and not silent', () => {
  const SUM = { centroid: 0.4, flux: 0.2, flatness: 0.7 };
  const g = rig({ spectrum: () => SUM });
  audioOn();
  g.bar(1);
  assert.deepEqual(g.trio.showBlock().spectrum, SUM);
  emit(Events.AUDIO_SILENCE_START, { ms: 2000 });
  g.bar(2);
  assert.ok(!('spectrum' in g.trio.showBlock()), 'silent: no key');
  emit(Events.AUDIO_SILENCE_END, {});
  g.bar(3);
  assert.deepEqual(g.trio.showBlock().spectrum, SUM);
  audioOn(); // a new input resets the show
  assert.ok(!('spectrum' in g.trio.showBlock()), 'reset clears it');
  g.done();
  const n1 = rig({ spectrum: () => null });
  audioOn();
  n1.bar(1);
  assert.ok(!('spectrum' in n1.trio.showBlock()), 'null summary: no key');
  n1.done();
  const n2 = rig();
  audioOn();
  n2.bar(1);
  assert.ok(!('spectrum' in n2.trio.showBlock()), 'omitted getSpectrum: no key');
  n2.done();
  const n3 = rig({
    spectrum: () => {
      throw new Error('boom');
    },
  });
  audioOn();
  n3.bar(1);
  assert.ok(!('spectrum' in n3.trio.showBlock()), 'a throw is null');
  n3.done();
});

console.log(`trioLive.selfcheck: ${n} checks passed`);
