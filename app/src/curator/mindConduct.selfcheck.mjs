// node src/curator/mindConduct.selfcheck.mjs
// #1483 stage 1 — the trio's audio direction, pure half: route edits validate and apply inside the clamps and the cap,
// Davis's rules presets conduct deterministically and wire the mids and treble, LOIS notices a flat show, the artist's
// targets are sovereign, the tier gates boldness, one edit per phrase, and backoff. Nothing is wired live here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateRouteOp, applyRouteOp, opTargets, landingBar, phraseOf, PRESETS, davisRoute, createFlatness, createConductor,
  PHRASE_BARS, TIER_OPS, BACKOFF_REVERTS, BACKOFF_BARS, ENERGY_LEVELS,
} from './mindConduct.js';
import { validateReply, wantsStage, neutralReply } from './mindContract.js';
import { rulesReply } from './mindRules.js';
import { buildContext, showOf } from './mindContext.js';
import { ROUTE_INPUTS, ROUTE_TARGETS, MAX_ROUTES } from '../gl/audioRoutes.mjs';
import { routeDepthRange } from '../data/audioRoutes.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const r = (input, target, depth = 0.3) => ({ input, target, depth });

ok('route edits validate: the four ops, fail-closed, out of range rejected not clamped', () => {
  assert.deepEqual(validateRouteOp({ op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3, junk: 1 }), { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 }, 'unknown keys dropped');
  assert.deepEqual(validateRouteOp({ op: 'remove', input: 'bass', target: 'render.scale' }), { op: 'remove', input: 'bass', target: 'render.scale' });
  assert.deepEqual(validateRouteOp({ op: 'retarget', input: 'bass', from: 'render.scale', to: 'render.glow' }), { op: 'retarget', input: 'bass', from: 'render.scale', to: 'render.glow' });
  assert.deepEqual(validateRouteOp({ op: 'depth', input: 'beat', target: 'render.alpha', depth: -12 }), { op: 'depth', input: 'beat', target: 'render.alpha', depth: -12 }, 'depth may be signed, inside the range');
  assert.equal(validateRouteOp(undefined), undefined);
  assert.equal(validateRouteOp(null), null);
  const bad = [
    { op: 'add', input: 'band.nope', target: 'render.glow', depth: 0.3 }, { op: 'add', input: 'band.mids', target: 'render.nope', depth: 0.3 },
    { op: 'add', input: 'band.mids', target: 'render.glow', depth: 9 }, { op: 'add', input: 'band.mids', target: 'render.glow', depth: NaN },
    { op: 'add', input: 'band.mids', target: 'render.glow' }, { op: 'wipe', input: 'band.mids', target: 'render.glow' },
    { op: 'retarget', input: 'bass', from: 'render.glow', to: 'render.glow' }, 'add', 7, [], { op: 'add' },
  ];
  for (const b of bad) assert.equal(validateRouteOp(b), false, JSON.stringify(b));
  assert.deepEqual(opTargets({ op: 'retarget', input: 'x', from: 'a', to: 'b' }), ['a', 'b']);
  assert.deepEqual(opTargets({ op: 'add', input: 'x', target: 'c', depth: 0 }), ['c']);
});

ok('edits apply inside the cap and the pairs: add, remove, retarget (to the new ceiling), depth; the table is never mutated', () => {
  const t = [r('beat', 'render.alpha', 18), r('bass', 'render.scale', 0.15)];
  const frozen = JSON.stringify(t);
  const a = applyRouteOp(t, { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 });
  assert.equal(a.routes.length, 3); assert.deepEqual(a.delta, { op: 'add', before: null, after: r('band.mids', 'render.glow', 0.3) });
  assert.equal(applyRouteOp(t, { op: 'add', input: 'beat', target: 'render.alpha', depth: 1 }), null, 'a pair that exists is not added twice');
  const full = Array.from({ length: MAX_ROUTES }, (_, i) => r(ROUTE_INPUTS[i % ROUTE_INPUTS.length], Object.keys(ROUTE_TARGETS)[i % 7], 0.1));
  assert.equal(applyRouteOp(full, { op: 'add', input: 'band.air', target: 'render.hue', depth: 1 }), null, 'the 16-route cap holds');
  const d = applyRouteOp(t, { op: 'remove', input: 'bass', target: 'render.scale' });
  assert.deepEqual(d.delta, { op: 'remove', before: r('bass', 'render.scale', 0.15), after: null }); assert.equal(d.routes.length, 1);
  assert.equal(applyRouteOp(t, { op: 'remove', input: 'air', target: 'render.scale' }), null);
  const rt = applyRouteOp([r('bass', 'render.alpha', 40)], { op: 'retarget', input: 'bass', from: 'render.alpha', to: 'render.glow' });
  assert.equal(rt.routes[0].target, 'render.glow'); assert.ok(rt.routes[0].depth <= routeDepthRange('render.glow').max, 'a 40 alpha depth is brought inside the glow ceiling');
  assert.equal(applyRouteOp(t, { op: 'retarget', input: 'beat', from: 'render.alpha', to: 'render.alpha' }), null);
  const dp = applyRouteOp(t, { op: 'depth', input: 'beat', target: 'render.alpha', depth: 30 });
  assert.equal(dp.routes[0].depth, 30); assert.equal(dp.delta.before.depth, 18);
  assert.equal(applyRouteOp(t, { op: 'depth', input: 'beat', target: 'render.glow', depth: 0.5 }), null, 'a depth edit needs the route');
  assert.equal(JSON.stringify(t), frozen, 'pure');
  assert.equal(applyRouteOp(null, { op: 'add' }), null);
});

ok('phrases: edits land on the boundary, four bars', () => {
  assert.equal(PHRASE_BARS, 4);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 8].map(landingBar), [0, 4, 4, 4, 4, 8, 8]);
  assert.equal(landingBar(2.5), null); assert.equal(phraseOf(7), 1); assert.equal(phraseOf(8), 2);
});

ok('Davis\'s presets: every candidate is a valid add op, and they wire the mids and the treble, never the bass', () => {
  for (const level of ENERGY_LEVELS) {
    assert.ok(PRESETS[level].length >= 3, `${level} has candidates`);
    for (const c of PRESETS[level]) {
      assert.ok(validateRouteOp({ op: 'add', ...c }), `${level}: ${c.input} -> ${c.target} validates`);
      assert.ok(['band.mids', 'band.edge', 'band.pres', 'band.air'].includes(c.input), `${c.input}: mid and treble only (the bass already drives the default table)`);
    }
  }
});

ok('davisRoute is deterministic, skips what is wired or owned, and does nothing in silence or a full table', () => {
  const show = { energy: 'mid', bpm: 124, silent: false, routes: [], owned: [], flatBars: 0 };
  const a = davisRoute(show, 12345); const b = davisRoute(show, 12345);
  assert.deepEqual(a, b, 'same show, same seed, same edit');
  assert.ok(a && a.op === 'add' && validateRouteOp(a));
  assert.deepEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => JSON.stringify(davisRoute(show, s)))).size > 1, true, 'a different seed may choose another candidate');
  assert.equal(davisRoute({ ...show, silent: true }, 1), null, 'silence: nothing to conduct');
  assert.equal(davisRoute(null, 1), null);
  const wired = { ...show, routes: [r(a.input, a.target, a.depth)] };
  const again = davisRoute(wired, 12345);
  assert.ok(!again || !(again.input === a.input && again.target === a.target), 'a route already wired is not added again');
  assert.ok(!davisRoute({ ...show, owned: [a.target] }, 12345) || davisRoute({ ...show, owned: [a.target] }, 12345).target !== a.target, 'an owned target is not proposed');
  const fullTable = Array.from({ length: MAX_ROUTES }, (_, i) => r('beat', Object.keys(ROUTE_TARGETS)[i % 12], 0.1));
  assert.equal(davisRoute({ ...show, routes: fullTable }, 1), null, 'a full table');
  // every candidate wired or owned: nothing left to do
  const all = ENERGY_LEVELS.flatMap((l) => PRESETS[l]);
  assert.equal(davisRoute({ ...show, routes: all.map((c) => r(c.input, c.target, c.depth)).slice(0, 15), owned: all.map((c) => c.target) }, 1), null);
});

ok('a flat show re-rolls: Davis moves to the next preset level once a phrase of flat bars has passed', () => {
  const base = { energy: 'low', bpm: 90, silent: false, routes: [], owned: [], flatBars: 0 };
  const first = davisRoute(base, 0);
  const rolled = davisRoute({ ...base, flatBars: PHRASE_BARS }, 0);
  const pool = (l) => PRESETS[l].map((c) => `${c.input}>${c.target}`);
  assert.ok(pool('low').includes(`${first.input}>${first.target}`), 'low energy starts in the low presets');
  assert.ok(pool('mid').includes(`${rolled.input}>${rolled.target}`), 'one flat phrase later it is in the next');
  const rolled2 = davisRoute({ ...base, flatBars: PHRASE_BARS * 2 }, 0);
  assert.ok(pool('high').includes(`${rolled2.input}>${rolled2.target}`));
});

ok('LOIS: a pinned flat signal is a failed show within a phrase; music and silence are not', () => {
  const f = createFlatness();
  const flat = [0.6, 0.55, 0.5, 0.4, 0.3, 0.3, 0.2];
  const out = Array.from({ length: PHRASE_BARS + 1 }, () => f.push(flat));
  assert.deepEqual(out, [false, false, false, true, true], 'flat once a window has filled with a held signal');
  assert.equal(f.flatBars(), 2);
  const m = createFlatness();
  let any = false;
  for (let i = 0; i < 24; i++) any = m.push(flat.map((v, k) => Math.min(1, Math.max(0, v + 0.3 * Math.sin(i * 1.7 + k))))) || any;
  assert.equal(any, false, 'a moving signal is never flat');
  const s = createFlatness();
  let sil = false; for (let i = 0; i < 12; i++) sil = s.push([0, 0, 0, 0, 0, 0, 0]) || sil;
  assert.equal(sil, false, 'silence is not a failed show');
  const p = createFlatness();
  let pinned = false; for (let i = 0; i < 6; i++) pinned = p.push([0.97, 0.99, 1, 0.98, 0.96, 1, 0.99].map((v, k) => v - (i % 2) * 0.01 * k)) || pinned;
  assert.equal(pinned, true, 'pinned at the top is flat even with a little wiggle');
  f.push(null); assert.equal(f.flatBars(), 0, 'no audio clears the run');
  assert.equal(createFlatness().push([NaN, 'x', undefined]), false, 'junk is a silent sample, never a throw');
});

ok('sovereignty, tier and rate: the artist\'s target is owned, tier 1 makes no edits, one edit per phrase', () => {
  const add = { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 };
  const c = createConductor();
  assert.deepEqual(c.consider(add, { bar: 5, tier: 't1' }), { ok: false, reason: 'tier' }, 'tier 1: faces only');
  assert.deepEqual(c.consider(add, { bar: 5, tier: null }), { ok: false, reason: 'tier' }, 'no tier: no edits');
  assert.deepEqual(c.consider({ op: 'depth', input: 'bass', target: 'render.scale', depth: 0.1 }, { bar: 5, tier: 't2' }), { ok: true, landBar: 8 });
  assert.deepEqual(c.consider(add, { bar: 5, tier: 't2' }), { ok: false, reason: 'tier' }, 'tier 2: depth nudges only');
  assert.deepEqual(c.consider(add, { bar: 5, tier: 't3' }), { ok: true, landBar: 8 });
  assert.deepEqual(c.consider({ op: 'remove', input: 'bass', target: 'render.scale' }, { bar: 5, tier: 't3' }), { ok: false, reason: 'tier' }, 'remove is tier 4');
  assert.deepEqual(c.consider({ op: 'remove', input: 'bass', target: 'render.scale' }, { bar: 5, tier: 't4' }), { ok: true, landBar: 8 });
  assert.deepEqual(TIER_OPS.t1, []);
  c.touch(['render.glow']);
  assert.deepEqual(c.consider(add, { bar: 5, tier: 't4' }), { ok: false, reason: 'owned' }, 'the artist touched it: dropped');
  assert.deepEqual(c.consider({ op: 'retarget', input: 'bass', from: 'render.scale', to: 'render.glow' }, { bar: 5, tier: 't4' }), { ok: false, reason: 'owned' }, 'either end counts');
  assert.deepEqual(c.owned(), ['render.glow']);
  c.touch('render.nope'); assert.deepEqual(c.owned(), ['render.glow'], 'junk is not owned');
  const other = { op: 'add', input: 'band.air', target: 'render.hue', depth: 10 };
  const k = c.consider(other, { bar: 5, tier: 't4' }); assert.equal(k.ok, true);
  c.commit(k.landBar);
  assert.deepEqual(c.consider({ ...other, input: 'band.pres' }, { bar: 6, tier: 't4' }), { ok: false, reason: 'rate' }, 'one edit per phrase: bar 6 lands at 8, taken');
  assert.deepEqual(c.consider({ ...other, input: 'band.pres' }, { bar: 9, tier: 't4' }), { ok: true, landBar: 12 }, 'the next phrase is free');
  assert.deepEqual(c.consider(null, { bar: 5, tier: 't4' }), { ok: false, reason: 'malformed' });
});

ok('backoff: three reverts and the persona goes quiet for a while, then comes back', () => {
  const c = createConductor();
  const op = { op: 'depth', input: 'bass', target: 'render.scale', depth: 0.1 };
  for (let i = 0; i < BACKOFF_REVERTS - 1; i++) c.revert(10);
  assert.equal(c.consider(op, { bar: 10, tier: 't4' }).ok, true, 'two reverts: still conducting');
  c.revert(10);
  assert.deepEqual(c.consider(op, { bar: 11, tier: 't4' }), { ok: false, reason: 'cooldown' });
  assert.equal(c.cooling(10 + BACKOFF_BARS - 1), true);
  assert.equal(c.consider(op, { bar: 10 + BACKOFF_BARS, tier: 't4' }).ok, true, 'and back');
  c.reset(); assert.deepEqual(c.owned(), []);
});

ok('the contract carries the route; the rules conduct only with a show, only at a tier that may edit; LOIS burns a flat one', () => {
  const rep = validateReply('davis', { propose: null, route: { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 } });
  assert.deepEqual(rep.route, { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 });
  assert.equal(validateReply('davis', { propose: null, route: { op: 'add', input: 'band.mids', target: 'render.glow', depth: 9 } }), null, 'out of range drops the whole reply');
  assert.equal(validateReply('davis', { propose: null, route: 'rm -rf' }), null);
  assert.equal(validateReply('davis', { propose: null, route: null }).route, undefined, 'an explicit no-edit is just no edit');
  assert.equal(validateReply('lois', { critique: null, route: { op: 'add' } }).route, undefined, 'only Davis conducts: LOIS\'s extra keys are dropped');
  assert.equal(wantsStage('davis', rep, {}), true);
  assert.equal(wantsStage('davis', { propose: null }, {}), false);

  const show = { energy: 'mid', bpm: 120, confidence: 0.8, onsets: 4, silent: false, sinceBars: 8, flatBars: 0, routes: [], owned: [] };
  const base = { layers: [], room: {}, audio: 'mic' };
  const ctx = (extra) => buildContext({ ...base, ...extra });
  assert.equal(ctx({ show, tier: 't3' }).show.energy, 'mid');
  assert.equal(ctx({ show, audio: 'none' }).show, undefined, 'audio off: no show block');
  assert.equal(ctx({}).show, undefined, 'and an absent block changes nothing else');
  assert.deepEqual(rulesReply('davis', ctx({}), { seed: 1 }), { ...neutralReply('davis') }, 'no show: exactly as neutral as before');
  assert.equal(rulesReply('davis', ctx({ show, tier: 't1' }), { seed: 1 }).route, undefined, 'tier 1 does not propose');
  assert.equal(rulesReply('davis', ctx({ show }), { seed: 1 }).route, undefined, 'no tier does not propose');
  const t3 = rulesReply('davis', ctx({ show, tier: 't3' }), { seed: 1 });
  assert.ok(t3.route && validateReply('davis', t3), 'tier 3: a valid proposal');
  assert.deepEqual(t3, rulesReply('davis', ctx({ show, tier: 't3' }), { seed: 1 }), 'deterministic');
  assert.equal(rulesReply('lois', ctx({ show: { ...show, flatBars: 4 } }), {}).state, 'BURN');
  assert.equal(rulesReply('lois', ctx({ show: { ...show, flatBars: 4, silent: true } }), {}).state, undefined, 'silence is not flat');
  assert.equal(rulesReply('lois', ctx({ show }), {}).state, undefined);
  assert.equal(showOf({ routes: Array.from({ length: 40 }, () => r('beat', 'render.glow', 0.5)) }).routes.length, 16, 'bounded');
  assert.equal(showOf(null), null);
});

ok('pure: no clock, timers or randomness', () => {
  const code = readFileSync(new URL('./mindConduct.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(!/Date\.now|performance\.now|Math\.random|setTimeout|setInterval|requestAnimationFrame|\bdocument\b|\bwindow\b/.test(code));
  assert.ok(!/from '\.\.\/composition|from '\.\.\/state/.test(code), 'no bus and no store');
});

console.log(`mindConduct.selfcheck: ${n} checks passed`);
