// #1462 follow-on — a face takes a mind:request: blend in at its intensity, hold for its decay (bars), ease back to the
// honest feed. Rules alone never request, so the faces never change on rules; the ?debug=mind demo exercises the path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFaceOverlay, startMindFaces, getMindFaces, subscribeMindFaces, resetMindFaces, loisLook, davisLook, LOIS_EXTRA_FACES, EASE_BARS } from './mindFace.js';
import { demoReply, demoModel } from './mindDemo.js';
import { startMind, setMindTap } from './mindLive.js';
import { createMindRecorder, checkMindRecord } from './mindRecord.js';
import { validateReply } from './mindContract.js';
import { LOIS_FACES } from './loisFace.js';
import { Events, emit, releaseTick, clearPending } from '../composition/eventBus.js';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));
const req = (persona, state, bar, extra = {}) => ({ persona, bar, backend: 'apple', invented: false, reply: { ...(persona === 'lois' ? { critique: null } : { propose: null }), ...(state ? { state } : {}), ...extra } });

await ok('blend in, hold for the decay, ease back: in → hold × decay → out → honest', () => {
  assert.equal(EASE_BARS, 1);
  const o = createFaceOverlay();
  o.request(req('lois', { id: 'side-eye', intensity: 0.7, decay: 2 }, 10), 10);
  const seen = [10, 11, 12, 13, 14].map((b) => { const a = o.at(b); return a && [a.phase, a.weight]; });
  assert.deepEqual(seen, [['in', 0.7], ['hold', 0.7], ['hold', 0.7], ['out', 0], null]);
  assert.equal(o.at(15), null, 'gone: only the honest face remains');
});

await ok('decay 0 holds one bar; a newer request replaces the old one; a line alone leaves the face honest', () => {
  const o = createFaceOverlay();
  o.request(req('lois', { id: 'NOD', intensity: 1, decay: 0 }, 0), 0);
  assert.deepEqual([0, 1, 2, 3].map((b) => o.at(b) && o.at(b).phase), ['in', 'hold', 'out', null]);
  o.request(req('lois', { id: 'a', intensity: 0.5, decay: 3 }, 5), 5);
  o.request(req('lois', { id: 'b', intensity: 0.9, decay: 1 }, 6), 6);
  assert.equal(o.at(6).id, 'b');
  const l = createFaceOverlay();
  l.request(req('davis', null, 3, { line: 'hm.' }), 3);
  assert.deepEqual(l.at(3), { id: null, intensity: 0, invented: false, line: 'hm.', phase: 'in', weight: 0 });
  assert.equal(l.at(4), null);
  assert.equal(createFaceOverlay().request(req('lois', null, 1), 1), false, 'nothing to show: no overlay');
});

await ok('looks: canonical states wear their own face; an invented one wears a stable micro-expression', () => {
  assert.equal(loisLook('BURN').face, LOIS_FACES.BURN.face);
  const a = loisLook('side-eye');
  assert.ok(LOIS_EXTRA_FACES.includes(a.face));
  assert.equal(a.code, 'SIDE-EYE');
  assert.deepEqual(loisLook('side-eye'), a, 'the same invented state, the same face');
  assert.equal(davisLook('UGLY').name, 'SIFT', 'Davis keeps his reading names');
  assert.equal(davisLook('tinkering').code, 'TINKERING');
  assert.equal(loisLook('a-very-long-invented-state').code.length, 12);
});

await ok('live: requests and decisions drive the overlays; subscribers hear changes; reset clears', () => {
  resetMindFaces();
  const stop = startMindFaces();
  let heard = 0; const off = subscribeMindFaces(() => heard++);
  emit(Events.MIND_DECISION, { persona: 'lois', bar: 20, backend: 'apple', reply: { critique: null } });
  emit(Events.MIND_REQUEST, req('lois', { id: 'glint', intensity: 0.8, decay: 1 }, 20));
  assert.equal(getMindFaces().lois.phase, 'in');
  assert.equal(getMindFaces().davis, null);
  emit(Events.MIND_DECISION, { persona: 'lois', bar: 21, backend: 'apple', reply: { critique: null } });
  assert.equal(getMindFaces().lois.phase, 'hold');
  emit(Events.MIND_DECISION, { persona: 'lois', bar: 22, backend: 'apple', reply: { critique: null } });
  assert.equal(getMindFaces().lois.weight, 0, 'easing back');
  emit(Events.MIND_DECISION, { persona: 'lois', bar: 23, backend: 'apple', reply: { critique: null } });
  assert.equal(getMindFaces().lois, null);
  emit(Events.MIND_REQUEST, { persona: 'queen', bar: 23, reply: { mood: 'calm', lean: {} } });
  assert.deepEqual(Object.keys(getMindFaces()), ['lois', 'davis'], 'the third has no face here');
  assert.ok(heard >= 4);
  off(); stop();
});

const runBars = async (model, bars) => {
  clearPending(); resetMindFaces();
  const stopFaces = startMindFaces();
  const stop = startMind({ model, getSnapshot: () => ({ room: { lois: 'VIBE', davis: 'FLOW' } }), getSeed: () => 3 });
  const looks = [];
  for (let b = 0; b < bars; b++) {
    emit(Events.CLOCK_BAR, { bar: b }); releaseTick('bar'); // the clock: bar, then release what waited for it
    const f = getMindFaces();
    looks.push([f.lois && f.lois.id, f.davis && f.davis.id]);
    await tick(); await tick();
  }
  stop(); stopFaces(); clearPending();
  return looks;
};

await ok('rules alone: the faces never change', async () => {
  const looks = await runBars(null, 24);
  assert.ok(looks.every(([l, d]) => l === null && d === null));
});

await ok('the ?debug=mind demo drives the whole path: thinker → request on the downbeat → blend; books say "demo"', async () => {
  for (let b = 0; b < 40; b++) for (const p of ['lois', 'davis', 'queen']) assert.ok(validateReply(p, demoReply(p, b)), 'demo replies are contract-valid');
  let frame = 0; const rec = createMindRecorder({ getFrame: () => frame++ });
  setMindTap((d, r) => rec.update(d, r));
  const looks = await runBars(demoModel, 24);
  setMindTap(null);
  assert.ok(looks.some(([l]) => l), 'LOIS blended a state in');
  assert.ok(looks.some(([, d]) => d), 'Davis blended a state in');
  const record = rec.finish();
  assert.ok(checkMindRecord(record));
  assert.ok(record.decisions.some((r) => r[3] === 'demo'), 'recorded as demo');
  assert.ok(!record.decisions.some((r) => r[3] === 'apple'), 'never passed off as apple');
});

await ok('wired: the faces draw the overlay; the demo is URL-gated; pure modules read no clock', () => {
  const pill = src('../components/LoisPill.jsx');
  assert.match(pill, /useMindFaces\(\)/); assert.match(pill, /loisLook\(mind\.id\)/);
  const duel = src('../panels/directors/DirectorsDuel.jsx');
  assert.match(duel, /loisLook\(mind\.lois\.id\)/); assert.match(duel, /davisLook\(mind\.davis\.id\)/);
  const app = src('../App.jsx');
  assert.match(app, /model: DEBUG_MIND \? demoModel : null/);
  assert.match(app, /const stopFaces = startMindFaces\(\)/);
  assert.match(src('./mindDemo.js'), /get\('debug'\) === 'mind'/);
  const code = src('./mindFace.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(!/Date\.now|performance\.now|Math\.random|setTimeout|setInterval|document|window/.test(code));
});

console.log(`mindFace.selfcheck: ${n} checks passed`);
