// node src/curator/mindConduct.selfcheck.mjs
// #1483 stage 1 — the trio's audio direction, pure half: route edits validate and apply inside the clamps and the cap,
// Davis's rules presets conduct deterministically and wire the mids and treble, LOIS notices a flat show, the artist's
// targets are sovereign, the tier gates boldness, one edit per phrase, and backoff. Nothing is wired live here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateRouteOp,
  applyRouteOp,
  opTargets,
  landingBar,
  phraseOf,
  PRESETS,
  davisRoute,
  BOLD_BAND,
  boldBand,
  BRAKE_AT,
  BRAKE_MAX,
  createFlatness,
  FLUX_HELD,
  NOISE_FLAT,
  createConductor,
  PHRASE_BARS,
  TIER_OPS,
  BACKOFF_REVERTS,
  BACKOFF_BARS,
  ENERGY_LEVELS,
  DAVIS_MAX_ROUTES,
  describeOp,
  ROUTE_OPS,
  flatBias,
  FLAT_BIAS_SWING,
  davisSpectrum,
  SPECTRUM_OPENERS,
  SPECTRUM_PARAMS,
  SPECTRUM_MAP_COUNT,
  spectrumTarget,
} from './mindConduct.js';
import { validateReply, wantsStage, neutralReply } from './mindContract.js';
import { rulesReply, LOIS_BURN_BARS } from './mindRules.js';
import { createThinker } from './mindThinker.js';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext, showOf } from './mindContext.js';
import { ROUTE_INPUTS, ROUTE_TARGETS, MAX_ROUTES } from '../gl/audioRoutes.mjs';
import { routeDepthRange } from '../data/audioRoutes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const r = (input, target, depth = 0.3) => ({ input, target, depth });

ok('route edits validate: the four ops, fail-closed, out of range rejected not clamped', () => {
  assert.deepEqual(
    validateRouteOp({ op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3, junk: 1 }),
    { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 },
    'unknown keys dropped',
  );
  assert.deepEqual(validateRouteOp({ op: 'remove', input: 'bass', target: 'render.scale' }), {
    op: 'remove',
    input: 'bass',
    target: 'render.scale',
  });
  assert.deepEqual(validateRouteOp({ op: 'retarget', input: 'bass', from: 'render.scale', to: 'render.glow' }), {
    op: 'retarget',
    input: 'bass',
    from: 'render.scale',
    to: 'render.glow',
  });
  assert.deepEqual(
    validateRouteOp({ op: 'depth', input: 'beat', target: 'render.alpha', depth: -12 }),
    { op: 'depth', input: 'beat', target: 'render.alpha', depth: -12 },
    'depth may be signed, inside the range',
  );
  assert.equal(validateRouteOp(undefined), undefined);
  assert.equal(validateRouteOp(null), null);
  const bad = [
    { op: 'add', input: 'band.nope', target: 'render.glow', depth: 0.3 },
    { op: 'add', input: 'band.mids', target: 'render.nope', depth: 0.3 },
    { op: 'add', input: 'band.mids', target: 'render.glow', depth: 9 },
    { op: 'add', input: 'band.mids', target: 'render.glow', depth: NaN },
    { op: 'add', input: 'band.mids', target: 'render.glow' },
    { op: 'wipe', input: 'band.mids', target: 'render.glow' },
    { op: 'retarget', input: 'bass', from: 'render.glow', to: 'render.glow' },
    'add',
    7,
    [],
    { op: 'add' },
  ];
  for (const b of bad) assert.equal(validateRouteOp(b), false, JSON.stringify(b));
  assert.deepEqual(opTargets({ op: 'retarget', input: 'x', from: 'a', to: 'b' }), ['a', 'b']);
  assert.deepEqual(opTargets({ op: 'add', input: 'x', target: 'c', depth: 0 }), ['c']);
});

ok(
  'edits apply inside the cap and the pairs: add, remove, retarget (to the new ceiling), depth; the table is never mutated',
  () => {
    const t = [r('beat', 'render.alpha', 18), r('bass', 'render.scale', 0.15)];
    const frozen = JSON.stringify(t);
    const a = applyRouteOp(t, { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 });
    assert.equal(a.routes.length, 3);
    assert.deepEqual(a.delta, { op: 'add', before: null, after: r('band.mids', 'render.glow', 0.3) });
    assert.equal(
      applyRouteOp(t, { op: 'add', input: 'beat', target: 'render.alpha', depth: 1 }),
      null,
      'a pair that exists is not added twice',
    );
    const full = Array.from({ length: MAX_ROUTES }, (_, i) =>
      r(ROUTE_INPUTS[i % ROUTE_INPUTS.length], Object.keys(ROUTE_TARGETS)[i % 7], 0.1),
    );
    assert.equal(
      applyRouteOp(full, { op: 'add', input: 'band.air', target: 'render.hue', depth: 1 }),
      null,
      'the 16-route cap holds',
    );
    const d = applyRouteOp(t, { op: 'remove', input: 'bass', target: 'render.scale' });
    assert.deepEqual(d.delta, { op: 'remove', before: r('bass', 'render.scale', 0.15), after: null });
    assert.equal(d.routes.length, 1);
    assert.equal(applyRouteOp(t, { op: 'remove', input: 'air', target: 'render.scale' }), null);
    const rt = applyRouteOp([r('bass', 'render.alpha', 40)], {
      op: 'retarget',
      input: 'bass',
      from: 'render.alpha',
      to: 'render.glow',
    });
    assert.equal(rt.routes[0].target, 'render.glow');
    assert.ok(
      rt.routes[0].depth <= routeDepthRange('render.glow').max,
      'a 40 alpha depth is brought inside the glow ceiling',
    );
    assert.equal(applyRouteOp(t, { op: 'retarget', input: 'beat', from: 'render.alpha', to: 'render.alpha' }), null);
    const dp = applyRouteOp(t, { op: 'depth', input: 'beat', target: 'render.alpha', depth: 30 });
    assert.equal(dp.routes[0].depth, 30);
    assert.equal(dp.delta.before.depth, 18);
    assert.equal(
      applyRouteOp(t, { op: 'depth', input: 'beat', target: 'render.glow', depth: 0.5 }),
      null,
      'a depth edit needs the route',
    );
    assert.equal(JSON.stringify(t), frozen, 'pure');
    assert.equal(applyRouteOp(null, { op: 'add' }), null);
  },
);

ok("describeOp says an edit in the route table's own words, and never throws", () => {
  assert.equal(
    describeOp({ op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 }),
    '+ band.mids > render.glow 0.3',
  );
  assert.equal(describeOp({ op: 'remove', input: 'bass', target: 'render.scale' }), '- bass > render.scale');
  assert.equal(
    describeOp({ op: 'retarget', input: 'bass', from: 'render.scale', to: 'render.glow' }),
    'bass: render.scale > render.glow',
  );
  assert.equal(
    describeOp({ op: 'depth', input: 'beat', target: 'render.alpha', depth: 12.34567 }),
    'beat > render.alpha depth 12.346',
  );
  assert.equal(describeOp(null), '');
  assert.equal(describeOp({ op: 'wipe' }), '');
  assert.equal(describeOp('x'), '');
});

ok('phrases: edits land on the boundary, four bars', () => {
  assert.equal(PHRASE_BARS, 4);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 8].map(landingBar), [0, 4, 4, 4, 4, 8, 8]);
  assert.equal(landingBar(2.5), null);
  assert.equal(phraseOf(7), 1);
  assert.equal(phraseOf(8), 2);
});

ok("Davis's presets: every candidate is a valid add op, and they wire the mids and the treble, never the bass", () => {
  for (const level of ENERGY_LEVELS) {
    assert.ok(PRESETS[level].length >= 3, `${level} has candidates`);
    for (const c of PRESETS[level]) {
      assert.ok(validateRouteOp({ op: 'add', ...c }), `${level}: ${c.input} -> ${c.target} validates`);
      assert.ok(
        ['band.mids', 'band.edge', 'band.pres', 'band.air'].includes(c.input),
        `${c.input}: mid and treble only (the bass already drives the default table)`,
      );
    }
  }
});

ok('davisRoute is deterministic, skips what is wired or owned, and does nothing in silence or a full table', () => {
  const show = { energy: 'mid', bpm: 124, silent: false, routes: [], owned: [], flatBars: 0 };
  const a = davisRoute(show, 12345);
  const b = davisRoute(show, 12345);
  assert.deepEqual(a, b, 'same show, same seed, same edit');
  assert.ok(a && a.op === 'add' && validateRouteOp(a));
  assert.deepEqual(
    new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => JSON.stringify(davisRoute(show, s)))).size > 1,
    true,
    'a different seed may choose another candidate',
  );
  assert.equal(davisRoute({ ...show, silent: true }, 1), null, 'silence: nothing to conduct');
  assert.equal(davisRoute(null, 1), null);
  const wired = { ...show, routes: [r(a.input, a.target, a.depth)] };
  const again = davisRoute(wired, 12345);
  assert.ok(
    !again || !(again.input === a.input && again.target === a.target),
    'a route already wired is not added again',
  );
  assert.ok(
    !davisRoute({ ...show, owned: [a.target] }, 12345) ||
      davisRoute({ ...show, owned: [a.target] }, 12345).target !== a.target,
    'an owned target is not proposed',
  );
  const fullTable = Array.from({ length: MAX_ROUTES }, (_, i) => r('beat', Object.keys(ROUTE_TARGETS)[i % 12], 0.1));
  assert.equal(davisRoute({ ...show, routes: fullTable }, 1), null, 'a full table');
  // every candidate wired or owned: nothing left to do
  const all = ENERGY_LEVELS.flatMap((l) => PRESETS[l]);
  assert.equal(
    davisRoute(
      { ...show, routes: all.map((c) => r(c.input, c.target, c.depth)).slice(0, 15), owned: all.map((c) => c.target) },
      1,
    ),
    null,
  );
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

ok('he conducts with a few routes of his own, and a flat show moves one of them rather than piling on', () => {
  const mine = (input, target, depth) => ({ input, target, depth, by: 'davis' });
  const show = {
    energy: 'mid',
    bpm: 124,
    silent: false,
    owned: [],
    flatBars: 0,
    routes: [
      mine('band.mids', 'render.scale', 0.15),
      mine('band.pres', 'render.glow', 0.4),
      mine('band.air', 'color.hue', 20),
    ],
  };
  assert.equal(davisRoute(show, 3), null, 'three of his own: he holds there');
  const flat = davisRoute({ ...show, flatBars: 2 }, 3);
  assert.equal(flat.op, 'retarget', 'flat: one of his is moved');
  assert.equal(flat.input, 'band.mids');
  assert.equal(flat.from, 'render.scale');
  assert.notEqual(flat.to, 'render.scale');
  assert.ok(validateRouteOp(flat), 'and the move validates');
  assert.equal(
    davisRoute({ ...show, flatBars: 2, owned: [flat.to] }, 3)?.to === flat.to,
    false,
    'never onto a target the artist owns',
  );
  assert.equal(davisRoute({ ...show, routes: show.routes.slice(0, 2) }, 3).op, 'add', 'under three: he adds');
  assert.equal(DAVIS_MAX_ROUTES, 3);
});

ok('LOIS: a pinned flat signal is a failed show within a phrase; music and silence are not', () => {
  const f = createFlatness();
  const flat = [0.6, 0.55, 0.5, 0.4, 0.3, 0.3, 0.2];
  const out = Array.from({ length: PHRASE_BARS + 1 }, () => f.push(flat));
  assert.deepEqual(out, [false, false, false, true, true], 'flat once a window has filled with a held signal');
  assert.equal(f.flatBars(), 2);
  const m = createFlatness();
  let any = false;
  for (let i = 0; i < 24; i++)
    any = m.push(flat.map((v, k) => Math.min(1, Math.max(0, v + 0.3 * Math.sin(i * 1.7 + k))))) || any;
  assert.equal(any, false, 'a moving signal is never flat');
  const s = createFlatness();
  let sil = false;
  for (let i = 0; i < 12; i++) sil = s.push([0, 0, 0, 0, 0, 0, 0]) || sil;
  assert.equal(sil, false, 'silence is not a failed show');
  const p = createFlatness();
  let pinned = false;
  for (let i = 0; i < 6; i++)
    pinned = p.push([0.97, 0.99, 1, 0.98, 0.96, 1, 0.99].map((v, k) => v - (i % 2) * 0.01 * k)) || pinned;
  assert.equal(pinned, true, 'pinned at the top is flat even with a little wiggle');
  f.push(null);
  assert.equal(f.flatBars(), 0, 'no audio clears the run');
  assert.equal(createFlatness().push([NaN, 'x', undefined]), false, 'junk is a silent sample, never a throw');
});

ok(
  'stage 2: LOIS judges the spectrum when the phrase carried one — held or a noise wall is flat, a moving one is not',
  () => {
    const lively = [0.6, 0.55, 0.5, 0.4, 0.3, 0.3, 0.2]; // the same levels every bar: the BANDS alone would call it flat
    const run = (spectra, bands = lively) => {
      const f = createFlatness();
      return { out: spectra.map((sp) => f.push(bands, sp)), f };
    };
    const moving = { flux: 0.4, flatness: 0.3 };
    const held = { flux: FLUX_HELD / 2, flatness: 0.3 };
    const noise = { flux: 0.4, flatness: (NOISE_FLAT + 1) / 2 };
    // a moving spectrum overrules held bands: the picture has something to follow
    const m = run(Array(PHRASE_BARS + 1).fill(moving));
    assert.deepEqual(
      m.out,
      Array(PHRASE_BARS + 1).fill(false),
      'a moving spectrum is not flat, whatever the bands say',
    );
    assert.equal(m.f.reading().source, 'spectrum');
    const h = run(Array(PHRASE_BARS + 1).fill(held));
    assert.deepEqual(h.out, [false, false, false, true, true], 'a held spectrum: flat once a phrase has filled');
    assert.equal(h.f.why(), 'held');
    const n = run(Array(PHRASE_BARS).fill(noise));
    assert.equal(n.out[PHRASE_BARS - 1], true, 'a wall of noise for a phrase is flat');
    assert.equal(n.f.why(), 'noise');
    // one bar without a spectrum in the window: that phrase is judged on the bands (stage 1), never on a partial read
    const gap = run([moving, null, moving, moving]);
    assert.equal(gap.f.reading().source, 'bands');
    assert.equal(gap.out[3], true, 'judged on the bands: held levels are flat');
    assert.equal(gap.f.why(), 'still');
    // silence clears both reads
    const s = createFlatness();
    for (let i = 0; i < PHRASE_BARS; i++) s.push(lively, held);
    assert.equal(s.push(null, null), false);
    assert.equal(s.flatBars(), 0);
    assert.equal(s.reading().source, null);
    // quiet is not a failed show, on either read
    assert.deepEqual(
      run(Array(PHRASE_BARS).fill(held), [0, 0.01, 0, 0, 0, 0, 0]).out.at(-1),
      false,
      'too quiet to judge',
    );
    // the keep-rate bias moves the spectrum's "still" bar the same way it moves the bands'
    const tight = createFlatness();
    tight.setBias(1);
    const loose = createFlatness();
    loose.setBias(-1);
    const edge = { flux: FLUX_HELD * 1.2, flatness: 0.3 }; // just above the neutral bar
    for (let i = 0; i < PHRASE_BARS; i++) {
      tight.push(lively, edge);
      loose.push(lively, edge);
    }
    assert.equal(tight.flatBars(), 1, 'passes piling up: a nearly held show is called flat');
    assert.equal(loose.flatBars(), 0, 'keeping: the same show rides');
    assert.ok(
      Math.abs(tight.threshold() - FLUX_HELD * (1 + FLAT_BIAS_SWING)) < 1e-12,
      'the spectrum bar is what she reports',
    );
    // malformed spectra are a missing read, not a crash
    assert.doesNotThrow(() => createFlatness().push(lively, { flux: NaN, flatness: 'x' }));
  },
);

ok(
  "LOIS's keep-rate read: keeping a lot loosens her flat-show threshold, passes piling up tighten it, little evidence is neutral",
  () => {
    assert.equal(flatBias({}), 0);
    assert.equal(flatBias({ keeps: 3, rolls: 0 }), 0, 'no rolls: nothing to read');
    assert.ok(flatBias({ keeps: 0, rolls: 12 }) > 0.99, 'twelve rolls and no keep: tight');
    assert.ok(flatBias({ keeps: 5, rolls: 12 }) < -0.99, 'a keep for every two or three rolls: loose');
    assert.ok(Math.abs(flatBias({ keeps: 2, rolls: 13 })) < 0.1, 'about her happy rate: neutral');
    assert.ok(Math.abs(flatBias({ keeps: 0, rolls: 2 })) < 0.3, 'two rolls is not enough to lean on: it eases in');
    assert.ok(
      flatBias({ keeps: 9, rolls: 3 }) <= 0 && flatBias({ keeps: 9, rolls: 3 }) >= -1,
      'more keeps than rolls is clamped, not extreme',
    );
    for (const j of [{ keeps: NaN, rolls: 5 }, { keeps: 'x', rolls: 'y' }, { keeps: -3, rolls: 5 }, null])
      assert.ok(Math.abs(flatBias(j || {})) <= 1, 'junk stays inside -1..1');
    // it moves the threshold the flatness reads with, and nothing else
    const wiggle = (d) =>
      Array.from({ length: PHRASE_BARS + 2 }, (_, i) =>
        [0.5, 0.5, 0.5, 0.45, 0.4, 0.4, 0.3].map((v) => v + (i % 2 ? d : -d)),
      ); // every band moves by d: the spread is d
    const run = (d, b) => {
      const f = createFlatness();
      f.setBias(b);
      let out = false;
      for (const row of wiggle(d)) out = f.push(row);
      return out;
    };
    const base = createFlatness().threshold();
    assert.equal(run(0.04, 0), false, 'a lively-ish show is not flat at the neutral threshold');
    assert.equal(run(0.04, 1), true, 'but passes piling up call it flat sooner');
    assert.equal(run(0.018, 0), true, 'a held show is flat at neutral');
    assert.equal(run(0.018, -1), false, 'but while you are keeping she lets it ride');
    const f = createFlatness();
    f.setBias(1);
    assert.ok(Math.abs(f.threshold() - base * (1 + FLAT_BIAS_SWING)) < 1e-12);
    f.setBias(-1);
    assert.ok(Math.abs(f.threshold() - base * (1 - FLAT_BIAS_SWING)) < 1e-12);
    f.setBias(NaN);
    assert.equal(f.threshold(), base, 'junk is neutral');
    f.setBias(9);
    assert.ok(f.threshold() <= base * (1 + FLAT_BIAS_SWING) + 1e-12, 'clamped');
  },
);

ok("sovereignty, tier and rate: the artist's target is owned, tier 1 makes no edits, one edit per phrase", () => {
  const add = { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 };
  const c = createConductor();
  assert.deepEqual(c.consider(add, { bar: 5, tier: 't1' }), { ok: false, reason: 'tier' }, 'tier 1: faces only');
  assert.deepEqual(c.consider(add, { bar: 5, tier: null }), { ok: false, reason: 'tier' }, 'no tier: no edits');
  assert.deepEqual(
    c.consider({ op: 'depth', input: 'bass', target: 'render.scale', depth: 0.1 }, { bar: 5, tier: 't2' }),
    { ok: true, landBar: 8 },
  );
  assert.deepEqual(c.consider(add, { bar: 5, tier: 't2' }), { ok: false, reason: 'tier' }, 'tier 2: depth nudges only');
  assert.deepEqual(c.consider(add, { bar: 5, tier: 't3' }), { ok: true, landBar: 8 });
  assert.deepEqual(
    c.consider({ op: 'remove', input: 'bass', target: 'render.scale' }, { bar: 5, tier: 't3' }),
    { ok: false, reason: 'tier' },
    'remove is tier 4',
  );
  assert.deepEqual(c.consider({ op: 'remove', input: 'bass', target: 'render.scale' }, { bar: 5, tier: 't4' }), {
    ok: true,
    landBar: 8,
  });
  assert.deepEqual(TIER_OPS.t1, []);
  c.touch(['render.glow']);
  assert.deepEqual(
    c.consider(add, { bar: 5, tier: 't4' }),
    { ok: false, reason: 'owned' },
    'the artist touched it: dropped',
  );
  assert.deepEqual(
    c.consider({ op: 'retarget', input: 'bass', from: 'render.scale', to: 'render.glow' }, { bar: 5, tier: 't4' }),
    { ok: false, reason: 'owned' },
    'either end counts',
  );
  assert.deepEqual(c.owned(), ['render.glow']);
  c.touch('render.nope');
  assert.deepEqual(c.owned(), ['render.glow'], 'junk is not owned');
  const other = { op: 'add', input: 'band.air', target: 'render.hue', depth: 10 };
  const k = c.consider(other, { bar: 5, tier: 't4' });
  assert.equal(k.ok, true);
  c.commit(k.landBar);
  assert.deepEqual(
    c.consider({ ...other, input: 'band.pres' }, { bar: 6, tier: 't4' }),
    { ok: true, landBar: 12 },
    'one edit per phrase: bar 6 would land at 8 (taken), so it waits for 12, not dropped',
  );
  assert.deepEqual(
    c.consider({ ...other, input: 'band.pres' }, { bar: 9, tier: 't4' }),
    { ok: true, landBar: 12 },
    'the next phrase is free',
  );
  assert.deepEqual(c.consider(null, { bar: 5, tier: 't4' }), { ok: false, reason: 'malformed' });
  const fresh = createConductor();
  assert.equal(
    fresh.consider(other, { bar: 8, tier: 't4' }).landBar,
    12,
    "a request ON a boundary bar lands on the next one: that bar's tick has already run",
  );
  assert.equal(fresh.consider(other, { bar: 3, tier: 't4' }).landBar, 4, 'one bar before a boundary lands on it');
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
  c.reset();
  assert.deepEqual(c.owned(), []);
});

ok(
  'the contract carries the route; the rules conduct only with a show, only at a tier that may edit; LOIS burns a flat one',
  () => {
    const rep = validateReply('davis', {
      propose: null,
      route: { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 },
    });
    assert.deepEqual(rep.route, { op: 'add', input: 'band.mids', target: 'render.glow', depth: 0.3 });
    assert.equal(
      validateReply('davis', {
        propose: null,
        route: { op: 'add', input: 'band.mids', target: 'render.glow', depth: 9 },
      }),
      null,
      'out of range drops the whole reply',
    );
    assert.equal(validateReply('davis', { propose: null, route: 'rm -rf' }), null);
    assert.equal(
      validateReply('davis', { propose: null, route: null }).route,
      undefined,
      'an explicit no-edit is just no edit',
    );
    assert.equal(
      validateReply('lois', { critique: null, route: { op: 'add' } }).route,
      undefined,
      "only Davis conducts: LOIS's extra keys are dropped",
    );
    assert.equal(wantsStage('davis', rep, {}), true);
    assert.equal(wantsStage('davis', { propose: null }, {}), false);

    const show = {
      energy: 'mid',
      bpm: 120,
      confidence: 0.8,
      onsets: 4,
      silent: false,
      sinceBars: 8,
      flatBars: 0,
      routes: [],
      owned: [],
    };
    const base = { layers: [], room: {}, audio: 'mic' };
    const ctx = (extra) => buildContext({ ...base, ...extra });
    assert.equal(ctx({ show, tier: 't3' }).show.energy, 'mid');
    assert.equal(ctx({ show, audio: 'none' }).show, undefined, 'audio off: no show block');
    assert.equal(ctx({}).show, undefined, 'and an absent block changes nothing else');
    assert.deepEqual(
      rulesReply('davis', ctx({}), { seed: 1 }),
      { ...neutralReply('davis') },
      'no show: exactly as neutral as before',
    );
    assert.equal(
      rulesReply('davis', ctx({ show, tier: 't1' }), { seed: 1 }).route,
      undefined,
      'tier 1 does not propose',
    );
    assert.equal(rulesReply('davis', ctx({ show }), { seed: 1 }).route, undefined, 'no tier does not propose');
    const t3 = rulesReply('davis', ctx({ show, tier: 't3' }), { seed: 1 });
    assert.ok(t3.route && validateReply('davis', t3), 'tier 3: a valid proposal');
    assert.deepEqual(t3, rulesReply('davis', ctx({ show, tier: 't3' }), { seed: 1 }), 'deterministic');
    assert.notEqual(
      rulesReply('lois', ctx({ show: { ...show, flatBars: 4 } }), {}).state,
      'BURN',
      'one phrase: patience',
    );
    assert.equal(rulesReply('lois', ctx({ show: { ...show, flatBars: LOIS_BURN_BARS } }), {}).state, 'BURN');
    assert.equal(
      rulesReply('lois', ctx({ show: { ...show, flatBars: LOIS_BURN_BARS, silent: true } }), {}).state,
      undefined,
      'silence is not flat',
    );
    assert.equal(rulesReply('lois', ctx({ show }), {}).state, undefined);
    assert.equal(
      showOf({ routes: Array.from({ length: 40 }, () => r('beat', 'render.glow', 0.5)) }).routes.length,
      16,
      'bounded',
    );
    assert.equal(showOf(null), null);
    assert.ok(!('spectrum' in showOf({})), 'absent spectrum: no key');
    assert.ok(!('spectrum' in showOf({ spectrum: 'loud' })), 'a string is not a spectrum');
    assert.ok(!('spectrum' in showOf({ spectrum: { centroid: NaN, flux: 0.1, flatness: 0.2 } })), 'NaN field: no key');
    assert.deepEqual(showOf({ spectrum: { centroid: 1.5, flux: -1, flatness: 0.123456 } }).spectrum, {
      centroid: 1,
      flux: 0,
      flatness: 0.123,
    });
  },
);

// ── stage 2: Davis re-tunes the spectrum marks ──────────────────────────────────────────────────────────────────────
const MARKS_OFF = { map: 0, scale: 0, displace: 0, colour: 0 };
const MARKS_ON = { map: 1, scale: 0.3, displace: 0, colour: 0 };
const FULL = Array.from({ length: MAX_ROUTES }, () => r('bass', 'render.scale'));
const sshow = (extra = {}) => ({
  energy: 'mid',
  silent: false,
  routes: [],
  owned: [],
  flatBars: 0,
  marks: MARKS_OFF,
  ...extra,
});

ok('spectrum ops validate: key in SPECTRUM_PARAMS, map an integer 0..3, amounts 0..1, a real number', () => {
  assert.deepEqual(validateRouteOp({ op: 'spectrum', key: 'map', value: 2 }), { op: 'spectrum', key: 'map', value: 2 });
  assert.deepEqual(validateRouteOp({ op: 'spectrum', key: 'map', value: 0 }), { op: 'spectrum', key: 'map', value: 0 });
  assert.deepEqual(validateRouteOp({ op: 'spectrum', key: 'map', value: 3 }), { op: 'spectrum', key: 'map', value: 3 });
  for (const key of ['scale', 'displace', 'colour']) {
    assert.deepEqual(validateRouteOp({ op: 'spectrum', key, value: 0.5 }), { op: 'spectrum', key, value: 0.5 });
    assert.deepEqual(validateRouteOp({ op: 'spectrum', key, value: 0 }), { op: 'spectrum', key, value: 0 });
    assert.deepEqual(validateRouteOp({ op: 'spectrum', key, value: 1 }), { op: 'spectrum', key, value: 1 });
  }
  assert.equal(validateRouteOp({ op: 'spectrum', key: 'scale', value: 0.12345 }).value, 0.123, 'rounded to 3 places');
  const bad = [
    { op: 'spectrum', key: 'hue', value: 0.5 },
    { op: 'spectrum', key: 'toString', value: 0.5 },
    { op: 'spectrum', value: 0.5 },
    { op: 'spectrum', key: 'map', value: 4 },
    { op: 'spectrum', key: 'map', value: -1 },
    { op: 'spectrum', key: 'map', value: 1.5 },
    { op: 'spectrum', key: 'scale', value: 1.2 },
    { op: 'spectrum', key: 'scale', value: -0.1 },
    { op: 'spectrum', key: 'scale', value: NaN },
    { op: 'spectrum', key: 'scale', value: Infinity },
    { op: 'spectrum', key: 'scale' },
    { op: 'spectrum', key: 'scale', value: null },
    { op: 'spectrum', key: 'scale', value: '0.5' },
    { op: 'spectrum', key: 'map', value: true },
  ];
  for (const b of bad) assert.equal(validateRouteOp(b), false, JSON.stringify(b));
  assert.deepEqual(opTargets({ op: 'spectrum', key: 'colour', value: 0.2 }), ['spectrum.colour']);
  assert.deepEqual(Object.keys(SPECTRUM_PARAMS), ['map', 'scale', 'displace', 'colour']);
  assert.equal(describeOp({ op: 'spectrum', key: 'map', value: 2 }), 'marks listen by POSITION');
});

ok('the tier gates the spectrum op: t1 and t2 refuse it, t3 and t4 allow it', () => {
  assert.ok(ROUTE_OPS.includes('spectrum'));
  for (const t of ['t1', 't2']) assert.ok(!TIER_OPS[t].includes('spectrum'), t);
  for (const t of ['t3', 't4']) assert.ok(TIER_OPS[t].includes('spectrum'), t);
  const op = { op: 'spectrum', key: 'scale', value: 0.3 };
  const c = createConductor();
  assert.deepEqual(c.consider(op, { bar: 5, tier: 't2' }), { ok: false, reason: 'tier' });
  assert.deepEqual(c.consider(op, { bar: 5, tier: 't3' }), { ok: true, landBar: 8 });
  assert.equal(c.consider(op, { bar: 5, tier: 't4' }).ok, true);
});

ok('a marks dial the artist moves is owned: the conductor drops a spectrum op on it, and only on it', () => {
  const c = createConductor();
  c.touch(spectrumTarget('scale'));
  assert.deepEqual(c.owned(), ['spectrum.scale']);
  assert.deepEqual(c.consider({ op: 'spectrum', key: 'scale', value: 0.3 }, { bar: 5, tier: 't3' }), {
    ok: false,
    reason: 'owned',
  });
  assert.equal(c.consider({ op: 'spectrum', key: 'colour', value: 0.3 }, { bar: 5, tier: 't3' }).ok, true);
  c.touch('spectrum.nope');
  assert.deepEqual(c.owned(), ['spectrum.scale'], 'an unknown dial is not ownable');
});

ok('davisSpectrum: marks off -> the opener for the energy, unless that dial is owned', () => {
  for (const level of ['low', 'mid', 'high']) {
    const op = davisSpectrum(sshow({ energy: level }), 7);
    assert.deepEqual(op, { op: 'spectrum', ...SPECTRUM_OPENERS[level] }, level);
    assert.ok(validateRouteOp(op), 'the opener is itself a valid op');
  }
  assert.deepEqual(davisSpectrum(sshow({ energy: 'weird' }), 1), { op: 'spectrum', ...SPECTRUM_OPENERS.mid });
  const own = spectrumTarget(SPECTRUM_OPENERS.high.key);
  assert.equal(davisSpectrum(sshow({ energy: 'high', owned: [own] }), 1), null, 'owned opener dial: nothing');
  assert.notEqual(davisSpectrum(sshow({ energy: 'high', owned: [spectrumTarget('map')] }), 1), null);
});

ok(
  'davisSpectrum: marks on and the show not flat -> nothing; flat -> the next map, never the current or an owned one',
  () => {
    assert.equal(davisSpectrum(sshow({ marks: MARKS_ON }), 3), null, 'working marks are left alone');
    const flat = sshow({ marks: MARKS_ON, flatBars: 4 });
    for (let seed = 0; seed < 12; seed++) {
      const op = davisSpectrum(flat, seed);
      assert.equal(op.op, 'spectrum');
      assert.equal(op.key, 'map');
      assert.ok(validateRouteOp(op), `seed ${seed}: valid`);
      assert.notEqual(op.value, MARKS_ON.map, `seed ${seed}: not the map already listening`);
      assert.ok(Number.isInteger(op.value) && op.value >= 0 && op.value < SPECTRUM_MAP_COUNT);
    }
    assert.equal(
      new Set([0, 1, 2, 3].map((s) => davisSpectrum(flat, s).value)).size > 1,
      true,
      'the seed picks among the other maps',
    );
    assert.equal(davisSpectrum({ ...flat, owned: [spectrumTarget('map')] }, 1), null, 'owned map: nothing');
    const wrap = davisSpectrum(sshow({ marks: { ...MARKS_ON, map: 3 }, flatBars: 8 }), 0);
    assert.notEqual(wrap.value, 3, 'wraps past the end');
  },
);

ok('davisSpectrum: silent, no marks block, or a bad one -> null; deterministic for the same seed', () => {
  assert.equal(davisSpectrum(sshow({ silent: true }), 1), null);
  assert.equal(davisSpectrum(null, 1), null);
  const { marks: _m, ...none } = sshow();
  assert.equal(davisSpectrum(none, 1), null, 'no marks reported: nothing to tune');
  assert.equal(davisSpectrum(sshow({ marks: 'on' }), 1), null);
  const flat = sshow({ marks: MARKS_ON, flatBars: 4 });
  assert.deepEqual(davisSpectrum(flat, 99), davisSpectrum(flat, 99));
  assert.deepEqual(davisSpectrum(sshow(), 5), davisSpectrum(sshow(), 5));
});

ok('mindRules davis: the marks are asked only when davisRoute has nothing and the tier allows `spectrum`', () => {
  const ctx = (tier, show) => ({ tier, show });
  // the route table has a move: stage 1 conducting is unchanged
  const open = sshow();
  assert.ok(davisRoute(open, 4), 'precondition: an empty table has a move');
  assert.equal(rulesReply('davis', ctx('t3', open), { seed: 4 }).route.op, davisRoute(open, 4).op);
  // a full table: davisRoute is null, so t3/t4 fall back to the marks
  const full = sshow({ routes: FULL });
  assert.equal(davisRoute(full, 4), null, 'precondition: a full table has no route move');
  for (const t of ['t3', 't4'])
    assert.deepEqual(rulesReply('davis', ctx(t, full), { seed: 4 }).route, davisSpectrum(full, 4), t);
  assert.equal(rulesReply('davis', ctx('t3', full), { seed: 4 }).route.op, 'spectrum');
  // t2 may nudge a depth, not touch the marks; t1 and no tier make no edits
  for (const t of ['t2', 't1', null])
    assert.equal(rulesReply('davis', ctx(t, full), { seed: 4 }).route, undefined, String(t));
  // nothing for the marks either (working marks, not flat): no route key
  assert.equal(rulesReply('davis', ctx('t3', sshow({ routes: FULL, marks: MARKS_ON })), { seed: 4 }).route, undefined);
  // the reply still validates as a whole
  assert.ok(validateReply('davis', rulesReply('davis', ctx('t3', full), { seed: 4 })));
});

ok('the show block carries the marks, clamped; absent or malformed marks add no key', () => {
  assert.deepEqual(showOf({ marks: { map: 2.2, scale: 1.5, displace: -1, colour: 0.12345 } }).marks, {
    map: 2,
    scale: 1,
    displace: 0,
    colour: 0.123,
  });
  assert.ok(!('marks' in showOf({})), 'absent');
  assert.ok(!('marks' in showOf({ marks: 'on' })), 'a string is not marks');
  assert.ok(!('marks' in showOf({ marks: { map: 1, scale: NaN, displace: 0, colour: 0 } })), 'NaN field: no key');
});

ok('pure: no clock, timers or randomness', () => {
  const code = readFileSync(new URL('./mindConduct.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(
    !/Date\.now|performance\.now|Math\.random|setTimeout|setInterval|requestAnimationFrame|\bdocument\b|\bwindow\b/.test(
      code,
    ),
  );
  assert.ok(!/from '\.\.\/composition|from '\.\.\/state/.test(code), 'no bus and no store');
});

ok('#1483 Davis is the wild man: every move in reach at any heat; the heat orders his tries; LOIS brakes him', () => {
  for (const l of ENERGY_LEVELS)
    for (const c of PRESETS[l]) assert.ok(Number.isFinite(c.bold) && c.bold >= 0 && c.bold <= 1, `${c.target}: rated`);
  assert.ok(
    ENERGY_LEVELS.every((l) => PRESETS[l].some((c) => c.bold <= BRAKE_MAX)),
    'every level has a move LOIS lets through on the brake',
  );
  assert.equal(boldBand(0.2, 0), 0);
  assert.equal(boldBand(0.5, 0), 0, 'the band is inclusive at its edge');
  assert.equal(boldBand(0.8, 0), 1);
  assert.equal(boldBand(1, 1), 0);
  assert.equal(boldBand(undefined, 1), 0, 'unrated counts as daring');
  assert.equal(boldBand(0.3, NaN), boldBand(0.3, 0), 'junk heat reads cool');
  assert.ok(BOLD_BAND > 0 && BRAKE_AT > 0 && BRAKE_AT <= 1);
  const all = ENERGY_LEVELS.flatMap((l) => PRESETS[l]);
  const boldOf = (op) => all.find((c) => c.target === (op.op === 'retarget' ? op.to : op.target)).bold;
  const show = (energy, extra = {}) => ({
    energy,
    bpm: 128,
    silent: false,
    routes: [],
    owned: [],
    flatBars: 0,
    ...extra,
  });
  const seeds = Array.from({ length: 24 }, (_, i) => i * 7919 + 3);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (const energy of ENERGY_LEVELS) {
    const cool = seeds.map((s) => davisRoute(show(energy), s, 0));
    const hot = seeds.map((s) => davisRoute(show(energy), s, 1));
    assert.ok(cool.every(Boolean) && hot.every(Boolean), `${energy}: he always has a move`);
    assert.deepEqual(
      seeds.map((s) => davisRoute(show(energy), s)),
      cool,
      'no heat given reads cool',
    );
    assert.deepEqual(
      seeds.map((s) => davisRoute(show(energy), s, 0)),
      cool,
      'deterministic',
    );
    if (energy !== 'low')
      assert.ok(mean(hot.map(boldOf)) > mean(cool.map(boldOf)), `${energy}: hot tries bolder moves first`);
  }
  // the wild man: a daring move stays in reach when it is the only one left, even stone cold
  const highSafe = PRESETS.high.filter((c) => c.bold <= 0.6).map((c) => c.target);
  const leftover = davisRoute(show('high', { owned: highSafe }), 1, 0);
  assert.ok(leftover && boldOf(leftover) > 0.6, 'cool, the safe moves taken: he reaches for a daring one anyway');
  // LOIS's brake: only safe moves, at any heat; nothing safe left -> he holds
  for (const energy of ENERGY_LEVELS)
    for (const s of seeds) {
      const b = davisRoute(show(energy, { brake: true }), s, 1);
      assert.ok(!b || boldOf(b) <= BRAKE_MAX, `${energy}/${s}: braked, a safe move (${b && b.target})`);
    }
  const allSafe = all.filter((c) => c.bold <= BRAKE_MAX).map((c) => c.target);
  assert.equal(davisRoute(show('high', { brake: true, owned: allSafe }), 1, 1), null, 'braked, nothing safe: he holds');
  // the rules read meta.heat; it never enters the context or the record
  const ctx = buildContext({ layers: [], room: {}, audio: 'mic', tier: 't3', show: show('high') });
  assert.ok(!JSON.stringify(ctx).includes('heat'), 'the context a model is told carries no temperature');
  const hotPicks = seeds.map((s) => rulesReply('davis', ctx, { seed: s, bar: 4, heat: 1 }).route);
  const coolPicks = seeds.map((s) => rulesReply('davis', ctx, { seed: s, bar: 4, heat: 0 }).route);
  assert.ok(mean(hotPicks.map(boldOf)) > mean(coolPicks.map(boldOf)), 'meta.heat reaches davisRoute');
  const braked = buildContext({ layers: [], room: {}, audio: 'mic', tier: 't3', show: show('high', { brake: true }) });
  assert.equal(braked.show.brake, true, 'the brake is part of the show (LOIS is not hidden)');
  const t = createThinker({ persona: 'davis', heat: () => 1 });
  const ds = seeds.map((s, i) => t.onBar({ bar: i + 1, context: ctx, seed: s }));
  assert.ok(mean(ds.map((d) => boldOf(d.reply.route))) > mean(coolPicks.map(boldOf)), 'the thinker hands the heat on');
  assert.ok(
    ds.every((d) => !JSON.stringify(d).includes('heat')),
    'a decision (what a take records) carries no temperature',
  );
  const broken = createThinker({
    persona: 'davis',
    heat: () => {
      throw new Error('x');
    },
  });
  assert.deepEqual(
    broken.onBar({ bar: 1, context: ctx, seed: 3 }).reply.route,
    rulesReply('davis', ctx, { seed: 3, bar: 1, heat: 0 }).route,
    'a throwing reader reads cool',
  );
  // deniability: no surface names the temperature's source
  const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const walk = (d) =>
    readdirSync(d).flatMap((e) => (statSync(join(d, e)).isDirectory() ? walk(join(d, e)) : [join(d, e)]));
  for (const dir of ['panels', 'components'])
    for (const f of walk(join(srcRoot, dir)).filter((p) => /\.(jsx?|mjs)$/.test(p) && !p.endsWith('.selfcheck.mjs')))
      assert.ok(!readFileSync(f, 'utf8').includes('conductHeat'), `${f}: no surface reads the conducting temperature`);
});

console.log(`mindConduct.selfcheck: ${n} checks passed`);
