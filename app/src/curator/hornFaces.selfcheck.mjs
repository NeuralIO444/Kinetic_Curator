// hornFaces.selfcheck.mjs — #2388 (P8): the horn faces read MEASURED state only, never a timer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HORN_IDS,
  HORN_WORDS,
  resolveHornState,
  resolveHorns,
  bandRead,
  hornLabel,
  hornCallsign,
} from './hornFaces.js';
import { hybridSignals } from './hybrid.mjs';
import { blastGeometry, hybridGeometry, gritGeometry, hash01 } from './hornFaceGeometry.js';
import { createBandState, applyTurn } from '../personas/band.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const noComments = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ .*$/gm, '');

// a band view as bandLive publishes it: state folded from turns, log newest first
const viewOf = (turns) => {
  let state = createBandState();
  for (const t of turns) state = applyTurn(state, t);
  return { on: true, ready: true, unruled: 0, state, log: turns.slice().reverse() };
};
const solo = (phrase, by) => ({ kind: 'solo', phrase, by, len: 3, cap: 0.1 });
const trade = (phrase, by, answers, owner = by) => ({ kind: 'trade', phrase, by, answers, owner, len: 3, cap: 0.1 });

ok('three horns in strip order, callsigns from the records, lowercase tile labels', () => {
  assert.deepEqual(HORN_IDS, ['carson', 'greiman', 'ashworth']);
  assert.deepEqual(HORN_IDS.map(hornCallsign), ['BLAST', 'HYBRID', 'SWISS GRIT']);
  assert.deepEqual(HORN_IDS.map(hornLabel), ['blast', 'hybrid', 'swiss grit']);
  assert.deepEqual(
    resolveHorns({}).map((h) => h.callsign),
    ['BLAST', 'HYBRID', 'SWISS GRIT'],
  );
});

ok('no signal, no opinion: every horn rests, whole and clean (default instrument)', () => {
  for (const id of HORN_IDS) {
    const s = resolveHornState(id, {});
    assert.equal(s.code, 'REST');
    assert.equal(s.word, 'LAID OUT');
    assert.equal(s.degree, 0);
    assert.equal(s.layers, 1);
    assert.equal(s.variant, 0);
    assert.deepEqual(s.reasons, []);
    assert.equal(resolveHornState(id).code, 'REST', 'no argument at all');
    assert.equal(
      resolveHornState(id, { band: null, stageMode: 'nonsense', standing: 7, heat: NaN }).code,
      'REST',
      'junk',
    );
  }
  assert.equal(resolveHornState('queen', { stageMode: 'carson' }).code, 'REST', 'only the three horns have faces');
});

ok(
  'BLAST: tears with the KIN heat step while it holds the floor; heat alone never moves it; armed is its doctrine',
  () => {
    assert.equal(resolveHornState('carson', { heat: 3 }).code, 'REST', 'heat with nothing on the floor: whole');
    const t = (heat) => resolveHornState('carson', { stageMode: 'carson', stageSeed: 5, heat });
    assert.deepEqual(
      [0, 1, 2, 3].map((h) => t(h).degree),
      [1, 1, 2, 3],
      'floor + heat step = degree (at least 1)',
    );
    assert.deepEqual(
      [1, 2, 3].map((h) => t(h).word),
      ['TEARING', 'SCATTER', 'BLASTING'],
    );
    assert.equal(resolveHornState('carson', { stageMode: 'shot', heat: 2 }).code, 'ON', 'shot is BLAST too');
    assert.equal(resolveHornState('carson', { stageMode: 'grit', heat: 3 }).code, 'REST', "grit is not BLAST's mode");
    const armed = resolveHornState('carson', { standing: 'carson', heat: 3 });
    assert.equal(armed.code, 'ARMED');
    assert.equal(armed.word, 'ARMED');
    assert.equal(armed.degree, 0, 'armed is not yet tearing');
    assert.equal(armed.armed, true);
    assert.equal(
      resolveHornState('carson', { standing: 'ashworth' }).code,
      'REST',
      "another horn's doctrine is not BLAST's",
    );
  },
);

ok('SWISS GRIT: clean at rest, armed by its doctrine, misregisters and grits only while destroying', () => {
  assert.equal(resolveHornState('ashworth', {}).degree, 0);
  const armed = resolveHornState('ashworth', { standing: 'ashworth' });
  assert.deepEqual([armed.code, armed.degree, armed.word], ['ARMED', 0, 'ARMED']);
  const stage = resolveHornState('ashworth', { stageMode: 'grit', stageSeed: 3 });
  assert.deepEqual([stage.code, stage.degree, stage.word], ['ON', 2, 'GRITTING']);
  const hard = resolveHornState('ashworth', {
    stageMode: 'grit',
    band: { owns: false, phrase: 6, answer: { verdict: 'disagree', move: 'counter', to: 'davis' } },
  });
  assert.equal(hard.degree, 3, 'on the stage AND countering in the band: grittiest');
  assert.equal(resolveHornState('ashworth', { stageMode: 'carson' }).code, 'REST');
  assert.equal(resolveHornState('ashworth', { heat: 3 }).degree, 0, "heat is BLAST's, not the grid's");
});

ok(
  'HYBRID: at rest one clean square; spectrum on her stage mode; stacks layers only when she builds on someone',
  () => {
    assert.equal(resolveHornState('greiman', {}).layers, 1);
    const on = resolveHornState('greiman', { stageMode: 'greiman', stageSeed: 3 });
    assert.deepEqual([on.code, on.layers, on.word, on.variant], ['ON', 1, 'SPECTRUM', 3]);
    const built = resolveHornState('greiman', {
      band: { owns: false, phrase: 4, answer: { verdict: 'agree', move: 'build', to: 'ashworth' } },
    });
    assert.deepEqual([built.code, built.layers, built.word, built.variant], ['BUILD', 3, 'BUILDING', 4]);
    const armed = resolveHornState('greiman', { standing: 'greiman' });
    assert.deepEqual(
      [armed.code, armed.word, armed.armed],
      ['ARMED', 'ARMED', true],
      'a standing HYBRID is armed (P5, #2385)',
    );
    assert.equal(resolveHornState('greiman', { standing: 'carson' }).code, 'REST');
  },
);

ok(
  'HYBRID measured moves (#2385): bake / layers / spectrum read off the stage record, change the picture, never the words',
  () => {
    const sig = (raygun) => hybridSignals(raygun);
    assert.equal(sig({ mode: 'carson', bitmap: 1 }), null, 'only a greiman record is HYBRID\u2019s');
    assert.deepEqual({ ...sig({ mode: 'greiman' }) }, { bake: false, layers: false, spectrum: false });
    const base = resolveHornState('greiman', { stageMode: 'greiman', stageSeed: 3 });
    assert.deepEqual([base.bake, base.spectrum, base.layers], [false, false, 1], 'the float names none');
    const bm = resolveHornState('greiman', {
      stageMode: 'greiman',
      stageSeed: 3,
      hybrid: sig({ mode: 'greiman', bitmap: 1 }),
    });
    assert.deepEqual([bm.bake, bm.layers, bm.spectrum, bm.word, bm.code], [true, 1, false, 'SPECTRUM', 'ON']);
    const pl = resolveHornState('greiman', {
      stageMode: 'greiman',
      stageSeed: 3,
      hybrid: sig({ mode: 'greiman', planes: 1 }),
    });
    assert.deepEqual(
      [pl.bake, pl.layers, pl.spectrum, pl.word],
      [false, 3, false, 'SPECTRUM'],
      'planes stack the layers without a band turn',
    );
    const sp = resolveHornState('greiman', {
      stageMode: 'greiman',
      stageSeed: 3,
      hybrid: sig({ mode: 'greiman', spectrum: 1 }),
    });
    assert.deepEqual([sp.bake, sp.layers, sp.spectrum], [false, 1, true]);
    assert.ok(sp.reasons.includes('spectrum') && bm.reasons.includes('bake') && pl.reasons.includes('layers'));
    // a signal with no HYBRID stage under it is not read (the stage is the measurement)
    const off = resolveHornState('greiman', { hybrid: sig({ mode: 'greiman', bitmap: 1 }) });
    assert.deepEqual([off.code, off.bake], ['REST', false]);
    // no new copy: every word is still one of the existing signed-state words
    const words = new Set(Object.values(HORN_WORDS).flat().filter(Boolean));
    for (const s of [base, bm, pl, sp, resolveHornState('greiman', { standing: 'greiman' })])
      assert.ok(words.has(s.word), `${s.word} is an existing state word`);
    // the picture moves with the measurement, and only with it
    const plain = hybridGeometry({ layers: 1, variant: 2 });
    assert.deepEqual(
      hybridGeometry({ layers: 1, variant: 2, bake: false, spectrum: false }),
      plain,
      'no signal: the picture as it was',
    );
    const hues = (g) => g.layers[0].cells.map((c) => c.hue);
    assert.ok(
      hues(hybridGeometry({ layers: 1, variant: 2, bake: true })).every((h) => h % 60 === 0),
      'bake snaps to hard pixel bands',
    );
    assert.notDeepEqual(
      hues(hybridGeometry({ layers: 1, variant: 2, spectrum: true })),
      hues(plain),
      'spectrum stretches the run',
    );
  },
);

ok('band reads: this phrase only; an answer lapses when the phrase moves on; the band off reads null', () => {
  assert.equal(bandRead('carson', null), null);
  assert.equal(bandRead('carson', { on: false }), null);
  assert.equal(bandRead('queen', viewOf([])), null, 'only horns');
  const v = viewOf([
    { kind: 'in', phrase: 0, by: 'governor' },
    solo(1, 'davis'),
    trade(
      2,
      'davis',
      [
        { by: 'greiman', verdict: 'agree', move: 'build' },
        { by: 'carson', verdict: 'disagree', move: 'counter' },
        { by: 'lois', verdict: 'layOut', move: 'rest' },
      ],
      'carson',
    ),
  ]);
  const g = bandRead('greiman', v);
  assert.deepEqual(g.answer, { verdict: 'agree', move: 'build', to: 'davis' });
  assert.equal(g.owns, false);
  const c = bandRead('carson', v);
  assert.equal(c.owns, true, 'the counter-mover took the solo');
  assert.equal(c.answer.move, 'counter');
  // the next phrase, no turn: the answers lapse (the view's phrase moves on)
  const later = { ...v, state: { ...v.state, phrase: 3 } };
  assert.equal(bandRead('greiman', later).answer, null);
  // a solo by a horn
  assert.equal(
    bandRead('ashworth', viewOf([{ kind: 'in', phrase: 0, by: 'governor' }, solo(1, 'ashworth')])).owns,
    true,
  );
  // COVER's cut of a horn's solo, and the artist's yield
  const cut = viewOf([solo(1, 'carson'), trade(2, 'carson', [{ by: 'lois', verdict: 'disagree', move: 'cut' }], null)]);
  assert.equal(bandRead('carson', cut).cutByCover, true);
  const yielded = viewOf([
    solo(1, 'greiman'),
    { kind: 'yield', phrase: 2, by: 'artist', why: 'keep', ended: 'greiman' },
  ]);
  assert.equal(bandRead('greiman', yielded).ended, true);
  // and the state it leaves: laid out
  assert.equal(resolveHornState('greiman', { band: bandRead('greiman', yielded) }).code, 'REST');
  assert.equal(resolveHornState('carson', { band: bandRead('carson', cut) }).code, 'REST');
  // a laid-out verdict is rest, not a floor
  const rest = viewOf([solo(1, 'davis'), trade(2, 'davis', [{ by: 'ashworth', verdict: 'layOut', move: 'rest' }])]);
  assert.equal(resolveHornState('ashworth', { band: bandRead('ashworth', rest) }).code, 'REST');
});

ok('geometry: BLAST whole when laid out, torn then scattered by degree; deterministic', () => {
  const rest = blastGeometry({ degree: 0 });
  assert.ok(rest.cells.length > 0);
  assert.ok(
    rest.cells.every((c) => c.rot === 0 && c.o === 1),
    'no rotation, no fade',
  );
  const xs = new Set(rest.cells.map((c) => c.x));
  assert.equal(xs.size, 5, 'five columns: the letter is on its grid');
  const torn = blastGeometry({ degree: 1, variant: 4 });
  assert.notDeepEqual(
    torn.cells.map((c) => c.x),
    rest.cells.map((c) => c.x),
    'rows slip',
  );
  assert.ok(
    torn.cells.every((c) => c.rot === 0),
    'tearing slips rows; it does not yet fly',
  );
  const scat = blastGeometry({ degree: 2, variant: 4 });
  assert.ok(
    scat.cells.some((c) => c.rot !== 0),
    'scattering rotates cells',
  );
  assert.deepEqual(
    blastGeometry({ degree: 3, variant: 9 }),
    blastGeometry({ degree: 3, variant: 9 }),
    'same state, same picture',
  );
  assert.notDeepEqual(
    blastGeometry({ degree: 2, variant: 1 }),
    blastGeometry({ degree: 2, variant: 2 }),
    'the measured variant picks the pattern',
  );
  assert.notDeepEqual(blastGeometry({ degree: 0, armed: true }), rest, 'armed: one cell already loose');
});

ok('geometry: HYBRID one layer at rest, a translucent stack of three when building; hue moves with the variant', () => {
  const one = hybridGeometry({ layers: 1, variant: 0 });
  assert.equal(one.layers.length, 1);
  assert.equal(one.layers[0].o, 1);
  assert.equal(one.layers[0].cells.length, 36, 'the whole 6x6 bitmap');
  const three = hybridGeometry({ layers: 3, variant: 4 });
  assert.equal(three.layers.length, 3);
  assert.ok(
    three.layers.slice(0, 2).every((l) => l.o < 1),
    'layers behind are translucent',
  );
  assert.equal(three.layers[2].o, 1, 'the front layer is solid');
  const hues = (v) => hybridGeometry({ layers: 1, variant: v }).layers[0].cells.map((c) => c.hue);
  assert.notDeepEqual(hues(0), hues(1), 'the spectrum moves with the measured variant');
  assert.ok(new Set(hues(0)).size > 6, 'a spectrum across the block, not one colour');
});

ok(
  'geometry: SWISS GRIT clean and registered at rest; fill misregisters and speckles with degree; the grid never moves',
  () => {
    const rest = gritGeometry({ degree: 0 });
    assert.equal(rest.speckles.length, 0);
    assert.equal(rest.fill.x, rest.frame.x + 4);
    assert.equal(rest.fill.y, rest.frame.y + 4, 'registered: centred on the cell');
    assert.equal(rest.marks, false);
    const g = (d) => gritGeometry({ degree: d, variant: 3 });
    assert.ok(
      g(1).speckles.length > 0 && g(3).speckles.length > g(1).speckles.length,
      'more grit with more destruction',
    );
    assert.ok(g(3).fill.x !== rest.fill.x || g(3).fill.y !== rest.fill.y, 'the fill slips off the grid');
    assert.deepEqual(g(3).frame, rest.frame, 'the frame never moves');
    assert.deepEqual(g(3).lines, rest.lines, 'nor do the rules');
    assert.equal(gritGeometry({ degree: 0, armed: true }).marks, true, 'armed shows its registration marks');
  },
);

ok('hash is a pure function in [0,1)', () => {
  for (let i = 0; i < 200; i++) {
    const u = hash01(i, i * 7, 3);
    assert.ok(u >= 0 && u < 1);
    assert.equal(u, hash01(i, i * 7, 3));
  }
});

ok('NO TIMERS: the state, geometry and strip modules have no timer, frame loop, clock, random draw or CSS loop', () => {
  const banned =
    /setInterval|setTimeout|requestAnimationFrame|cancelAnimationFrame|Date\.now|performance\.now|Math\.random|@keyframes|animation\s*:|infinite/;
  for (const f of ['./hornFaces.js', './hornFaceGeometry.js', '../panels/directors/HornStrip.jsx']) {
    assert.ok(!banned.test(noComments(src(f))), `${f} has no timer, loop or random draw`);
  }
  // and the horn CSS block: transitions on state change only, no animation
  const css = src('../styles/panels.css');
  const block = css.slice(
    css.indexOf('.room-codec {\n  container-type'),
    css.indexOf('#1560 S2 — the generative dither faces'),
  );
  assert.ok(block.length > 500, 'found the horn CSS block');
  assert.ok(!/animation|@keyframes/.test(block.replace(/\/\*[\s\S]*?\*\//g, '')), 'the horn CSS has no animation');
  assert.match(block, /transition:/, 'a state change eases');
  // the existing faces' rAF loop is not shared with the horns
  assert.ok(
    !/RoomFaces/.test(src('../panels/directors/HornStrip.jsx').replace(/\/\/.*$/gm, '')),
    'the strip does not import the rAF face loop',
  );
});

ok(
  'wiring: the codec reads the horns from the store, the KIN heat step and the band view; the horns have no state of their own',
  () => {
    const codec = src('../panels/directors/RoomCodec.jsx');
    assert.match(codec, /s\.poemDoctrine/);
    assert.match(codec, /layoutParams\?\.fieldForm\?\.raygun\?\.mode/);
    assert.match(codec, /heatStep\(shownHeat\(\)\)/);
    assert.match(codec, /bandRead\(id, bandView\)/);
    assert.match(codec, /subscribeBand/);
    const strip = src('../panels/directors/HornStrip.jsx');
    assert.ok(
      !/useState|useEffect|useRef|useStore/.test(noComments(strip)),
      'the strip is a pure picture of what it is handed',
    );
    assert.ok(HORN_WORDS.REST === 'LAID OUT');
  },
);

ok('no new room-matrix axis: the horns touch neither the matrix nor the room codes (20 rooms, not multiplied)', () => {
  for (const f of ['./hornFaces.js', './hornFaceGeometry.js', './hornLines.mjs', '../panels/directors/HornStrip.jsx']) {
    const t = noComments(src(f));
    assert.ok(!/directorsMatrix|roomFor|roomCodes|DIRECTORS_MATRIX/.test(t), `${f} reads no room`);
  }
});

console.log(`hornFaces.selfcheck: ${n} checks passed`);
