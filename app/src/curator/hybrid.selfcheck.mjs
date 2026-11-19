// hybrid.selfcheck.mjs — Persona Kernel P5 (#2385): the HYBRID doctrine.
//
// Pins:
//   A  HYBRID joins the doctrine table (GREIMAN's record, callsign HYBRID, mode `greiman`); the four moves; the
//      call names ONE move off the record's own seed; the float is today's mode, kept
//   B  ownership: PATTERN GLYPH and TIDES (a standing HYBRID deals them, one draw either way — the stream aligned),
//      and colour as the fifth principle owner (her record)
//   C  palette gravity moved from the Queen: same numbers (+0.10, beat-confidence bar 0.62 across two attacks, 8
//      keeps), attributed to HYBRID's table section; a user palette lock wins; the Queen carries no M3
//   D  stance: agrees with SWISS GRIT on the grid, pushes back on BLAST — the record's relations; the tuning
//      table's relation numbers stay null (unruled: nothing invented)
//   E  callsign law: the surface names are callsigns; no real name on a surface; no new copy shipped unsigned
//   F  the store: a standing HYBRID arms a deal with her record (no wear/distort, one named move or none),
//      deterministically; off by default (nothing standing = plain)
//   G  the horn strip reads HYBRID's measured moves (wired in RoomCodec, not on a timer)
import assert from 'node:assert';
import fs from 'node:fs';
import { DOCTRINES, DOCTRINE_IDS, doctrineMode, doctrineOfMode, isDoctrine } from './doctrines.mjs';
import {
  HYBRID_MOVES,
  HYBRID_PATTERN_MODES,
  GRAVITY_DRIFT,
  hybridMove,
  hybridAxes,
  hybridPatternMode,
  hybridSignals,
  keptPaletteId,
  paletteDriftTarget,
  paletteGravity,
  beatConfident,
  anyPaletteLock,
} from './hybrid.mjs';
import { getPersona } from '../personas/registry.mjs';
import { TUNING_DEFAULTS, setTuningValue, resetTuning } from '../personas/tuning.mjs';
import { dealPattern, rollPatternLayers } from '../pattern/patternRoll.js';
import { PATTERN_DEAL_MODES } from '../state/patternTrack.js';
import { useStore } from '../state/store.js';
import { resetDirector } from './director.js';
import { fieldFormForDeal } from '../poets/fieldForm.js';
import { mkRng } from '../engine/prng.js';
import * as queenLean from './queenLean.mjs';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('hybrid.selfcheck');
const src = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── A · the doctrine and its four moves ─────────────────────────────────
ok('A1 HYBRID is in the doctrine table: GREIMAN’s record, mode `greiman`, nobody’s else', () => {
  assert.ok(DOCTRINE_IDS.includes('greiman') && isDoctrine('greiman'));
  assert.equal(DOCTRINES.greiman.name, 'HYBRID');
  assert.deepStrictEqual([...DOCTRINES.greiman.modes], ['greiman']);
  assert.equal(doctrineOfMode('greiman'), 'greiman');
  assert.equal(doctrineMode('greiman', 0.7, null), 'greiman');
  assert.equal(doctrineMode('greiman', 0.7, 'greiman'), 'greiman', 'one mode: nothing else to call');
  assert.equal(getPersona('greiman').kind, 'doctrine');
  assert.ok(Object.isFrozen(DOCTRINES.greiman) && Object.isFrozen(DOCTRINES.greiman.modes));
});

ok(
  'A2 four moves: float (today’s mode, no axis), bitmap, planes, spectrum — a call names ONE, off its own seed',
  () => {
    assert.deepStrictEqual([...HYBRID_MOVES], ['float', 'bitmap', 'planes', 'spectrum']);
    const seen = new Map();
    for (let seed = 1; seed <= 400; seed++) {
      const m = hybridMove(seed);
      assert.ok(HYBRID_MOVES.includes(m));
      seen.set(m, (seen.get(m) ?? 0) + 1);
      assert.equal(hybridMove(seed), m, 'a pure function of the seed');
      const axes = hybridAxes(seed);
      assert.deepStrictEqual(axes, m === 'float' ? {} : { [m]: 1 });
    }
    for (const m of HYBRID_MOVES) assert.ok(seen.get(m) > 40, `${m} is played (${seen.get(m)} of 400)`);
    assert.equal(hybridMove(-1), hybridMove(0), 'junk seeds read as 0');
    assert.equal(hybridMove(NaN), hybridMove(0));
  },
);

ok('A3 measured signals read off the standing record: bake / layers / spectrum, null off HYBRID', () => {
  assert.equal(hybridSignals(null), null);
  assert.equal(hybridSignals({ mode: 'carson', bitmap: 1 }), null);
  assert.deepStrictEqual({ ...hybridSignals({ mode: 'greiman' }) }, { bake: false, layers: false, spectrum: false });
  assert.deepStrictEqual(
    { ...hybridSignals({ mode: 'greiman', bitmap: 1, planes: 1, spectrum: 1 }) },
    { bake: true, layers: true, spectrum: true },
  );
});

// ── B · ownership ───────────────────────────────────────────────────────
ok(
  'B1 she owns PATTERN GLYPH and TIDES: a standing HYBRID deals only those; one draw either way (the stream stays aligned)',
  () => {
    assert.deepStrictEqual([...HYBRID_PATTERN_MODES], ['GLYPH', 'TIDES']);
    assert.deepStrictEqual([...getPersona('greiman').doctrine.owns.patternModes], ['GLYPH', 'TIDES']);
    assert.equal(hybridPatternMode(0), 'GLYPH');
    assert.equal(hybridPatternMode(0.99), 'TIDES');
    assert.equal(hybridPatternMode(NaN), 'GLYPH');
    const counting = (seed) => {
      const r = mkRng(seed);
      const f = () => (f.n++, r());
      f.n = 0;
      return f;
    };
    const modes = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      const spread = Math.imul(seed, 2654435761) >>> 0; // real seeds are spread uint32s; xorshift's first draw barely moves for 1, 2, 3
      const a = counting(spread);
      const b = counting(spread);
      const owned = dealPattern(undefined, a, 'greiman');
      const free = dealPattern(undefined, b);
      modes.add(owned.mode);
      assert.ok(HYBRID_PATTERN_MODES.includes(owned.mode));
      assert.ok(
        PATTERN_DEAL_MODES.includes(free.mode) && free.mode !== 'TIDES',
        'unowned deals are exactly what they were',
      );
      assert.equal(a.n, b.n, 'the same number of draws');
      assert.deepStrictEqual(
        { ...owned, mode: null },
        { ...free, mode: null },
        'only the mode differs when the draw lands the same slot or not — every other draw is the same stream',
      );
    }
    assert.ok(modes.has('GLYPH') && modes.has('TIDES'), 'TIDES is dealt for her (hand-picked only otherwise, #1797)');
  },
);

ok('B2 rollPatternLayers passes the owner; no owner (the default) is byte-identical to the old call', () => {
  const layers = [
    {
      id: 'p1',
      type: 'pattern',
      visible: true,
      pattern: { mode: 'QUILT', seed: 3, density: 8, mix: 0.5, grout: 0, drift: 0 },
    },
  ];
  for (const kind of ['chaos', 'curate']) {
    const plain = rollPatternLayers(layers, kind, mkRng(9));
    assert.deepStrictEqual(rollPatternLayers(layers, kind, mkRng(9), { owner: null }), plain);
    const hy = rollPatternLayers(layers, kind, mkRng(9), { owner: 'greiman' });
    assert.ok(HYBRID_PATTERN_MODES.includes(hy.layers[0].pattern.mode));
  }
  const slice = src('../state/slices/layoutSlice.js');
  assert.equal(
    (slice.match(/owner: state\.poemDoctrine === 'greiman' \? 'greiman' : null/g) ?? []).length,
    2,
    'KIN roll and CURATOR press both pass the standing doctrine',
  );
  for (const kind of ['rules', 'weather']) {
    assert.deepStrictEqual(
      rollPatternLayers(layers, kind, mkRng(4), { owner: 'greiman' }),
      rollPatternLayers(layers, kind, mkRng(4)),
      `${kind} is never HYBRID's deal`,
    );
  }
});

ok('B3 colour is hers: the fifth principle owner beside rhythm, contrast, negative space and hierarchy', () => {
  const g = getPersona('greiman');
  assert.equal(g.doctrine.owns.principle, 'colour');
  assert.match(g.principle, /^colour/);
  const principles = ['lois', 'davis', 'queen', 'taste', 'greiman'].map((id) => getPersona(id).principle);
  assert.equal(principles.filter(Boolean).length, 5);
  assert.ok(/negative space/.test(getPersona('lois').principle) && /hierarchy/.test(getPersona('taste').principle));
});

// ── C · palette gravity moved ───────────────────────────────────────────
const keep = (id) => ({ config: { palette: { id } } });
const eight = [
  ...Array(5)
    .fill(0)
    .map(() => keep('tidepool')),
  keep('ember'),
  keep('ember'),
  keep('slate'),
];

ok(
  'C1 same numbers, same caps: +0.10 mix, beat-confidence 0.62 across two attacks, relaxes (consumer-side), 8 keeps',
  () => {
    assert.equal(GRAVITY_DRIFT, 0.1);
    assert.equal(GRAVITY_DRIFT, TUNING_DEFAULTS.personas.greiman.knobs.gravity.drift);
    assert.equal(keptPaletteId(eight), 'tidepool', 'mode of the kept palettes');
    assert.equal(keptPaletteId([]), null);
    assert.deepStrictEqual(paletteDriftTarget(eight, true), { paletteId: 'tidepool', weight: 0.1 });
    assert.equal(paletteDriftTarget(eight, false), null, 'no confidence → no drift');
    assert.equal(paletteDriftTarget([], true), null, 'no kept palette → no drift');
    assert.equal(beatConfident([0.7, 0.8]), true);
    assert.equal(beatConfident([0.7]), false, 'needs two');
    assert.equal(beatConfident([0.9, 0.5]), false, 'both must clear');
    assert.equal(beatConfident([0.62, 0.62]), true, 'the bar is 0.62');
    assert.equal(beatConfident([0.61, 0.9]), false);
    assert.equal(beatConfident(null), false);
    assert.equal(
      queenLean.beatConfidentFromPeaks([0.7, 0.8]),
      beatConfident([0.7, 0.8]),
      'the Queen’s timing gate and HYBRID’s agree',
    );
    assert.equal(queenLean.BEAT_CONFIDENCE, TUNING_DEFAULTS.personas.queen.knobs.beatConfidence);
    const peaks = { attackPeaks: [0.9, 0.9] };
    assert.deepStrictEqual(paletteGravity(eight, peaks), { paletteId: 'tidepool', weight: 0.1 });
    assert.equal(paletteGravity(eight.slice(0, 7), peaks), null, 'under the 8-keep floor: identity');
    assert.equal(paletteGravity(eight, { attackPeaks: [0.9] }), null);
    assert.equal(paletteGravity(eight, null), null);
  },
);

ok('C2 a user palette lock always wins over her', () => {
  const peaks = { attackPeaks: [0.9, 0.9] };
  assert.equal(anyPaletteLock({}), false);
  assert.equal(anyPaletteLock({ 0: false }), false);
  assert.equal(anyPaletteLock({ 2: true }), true);
  assert.equal(paletteGravity(eight, peaks, { 2: true }), null, 'one locked swatch silences her');
  assert.deepStrictEqual(paletteGravity(eight, peaks, { 2: false }), { paletteId: 'tidepool', weight: 0.1 });
  assert.deepStrictEqual(paletteGravity(eight, peaks, {}), { paletteId: 'tidepool', weight: 0.1 });
});

ok('C3 attributed to HYBRID: her table section carries the knob, and a DEV edit is live', () => {
  try {
    assert.equal(setTuningValue('personas.greiman.knobs.gravity.drift', 0.05).ok, true);
    assert.deepStrictEqual(paletteGravity(eight, { attackPeaks: [0.9, 0.9] }), { paletteId: 'tidepool', weight: 0.05 });
  } finally {
    resetTuning();
  }
  assert.equal(paletteGravity(eight, { attackPeaks: [0.9, 0.9] }).weight, 0.1);
  assert.equal(setTuningValue('personas.queen.knobs.m3.drift', 0.2).ok, false, 'the Queen has no M3 knob to edit');
  resetTuning();
});

ok('C4 the Queen keeps timing only: M3 left queenLean.mjs; her sway has no palette; M1, M2, M4, M5 unchanged', () => {
  for (const gone of ['M3_DRIFT', 'keptPaletteId', 'paletteDriftTarget'])
    assert.ok(!(gone in queenLean), `${gone} moved`);
  assert.ok(!('palette' in queenLean.NEUTRAL_SWAY));
  assert.equal(queenLean.M1_BIAS, 0.06);
  assert.equal(queenLean.M2_CAP, 0.55);
  assert.equal(queenLean.M4_ARM_MS, 40);
  assert.equal(queenLean.M5_GAIN_PEAK, 1.18);
  const code = stripComments(src('./queenLean.mjs'));
  assert.ok(!/palette/i.test(code), 'no palette code left in the Queen’s module');
  const hy = stripComments(src('./hybrid.mjs'));
  assert.ok(
    !new RegExp(['queen' + 'Lean', 'queen' + 'Channel'].join('|')).test(hy),
    'HYBRID imports none of her hidden modules (the deniability graph stays short)',
  );
});

// ── D · stance ──────────────────────────────────────────────────────────
ok('D1 stance: agrees with SWISS GRIT on the grid, pushes back on BLAST; unruled relation numbers stay null', () => {
  const rel = Object.fromEntries(getPersona('greiman').relations.map((r) => [r.to, r.note]));
  assert.match(rel.ashworth, /agrees with SWISS GRIT on the grid/i);
  assert.match(rel.carson, /pushes back on BLAST/i);
  for (const key of ['greiman->ashworth', 'greiman->carson', 'ashworth->greiman', 'carson->greiman'])
    assert.strictEqual(TUNING_DEFAULTS.relations[key], null, `${key} is unruled: null means unruled, never zero`);
  const t = TUNING_DEFAULTS.personas.greiman;
  assert.deepStrictEqual(
    [t.soloLengthPhrases, t.stepCap, t.heat, t.answersFirst, t.odds.agree, t.odds.disagree, t.odds.layOut],
    Array(7).fill(null),
    'no band tuning number was invented',
  );
});

// ── E · callsign law ────────────────────────────────────────────────────
ok('E1 callsigns only: HYBRID on the surface; no real name in the doctrine’s surface strings or the new copy', () => {
  const g = getPersona('greiman');
  assert.equal(g.identity.callsign, 'HYBRID');
  for (const text of [DOCTRINES.greiman.name, DOCTRINES.greiman.title])
    assert.ok(!/greiman|ashworth|carson/i.test(text), text);
  const panel = src('../panels/DavisPanel.jsx');
  assert.ok(/DOCTRINES\[id\]\.name/.test(panel), 'the doctrine row prints the callsign, from the table');
  const hy = stripComments(src('./hybrid.mjs'));
  for (const line of hy.split('\n'))
    if (/['"`]/.test(line)) assert.ok(!/\b(Greiman|April|Ashworth|Carson)\b/.test(line), line);
});

ok('E2 no new surface copy: HYBRID’s state words are the existing ones', () => {
  const faces = src('./hornFaces.js');
  assert.ok(!/BITMAP|PLANES/.test(stripComments(faces)), 'no new state word for the moves');
});

// ── F · the store ───────────────────────────────────────────────────────
const S = () => useStore.getState();
const BASE = S();
const form = fieldFormForDeal({ poetId: 'teijo', pieceId: 't3' }, mkRng(3));
const reset = (extra = {}) => {
  resetDirector();
  useStore.setState({
    seed: 0x1918,
    layoutParams: { ...BASE.layoutParams, composition: 'raster', fieldForm: form },
    lockedParams: {},
    poemDeal: 0,
    raygunTap: 0,
    curatePress: 0,
    poemDoctrine: null,
    historyUndoStack: [],
    historyRedoStack: [],
    ...extra,
  });
};

ok(
  'F1 a standing HYBRID arms a deal: her record, one named move or the float, no wear/distort; replays identically',
  () => {
    const moves = new Set();
    for (let d = 0; d < 40; d++) {
      reset({ poemDoctrine: 'greiman', poemDeal: d });
      S().redealPoem();
      const f = S().layoutParams.fieldForm;
      if (!f?.raygun) continue;
      const r = f.raygun;
      assert.equal(r.mode, 'greiman');
      assert.equal(r.doctrine, 'greiman');
      assert.ok(!('wear' in r) && !('distort' in r));
      const named = ['bitmap', 'planes', 'spectrum'].filter((k) => r[k] === 1);
      assert.ok(named.length <= 1, 'one move per call');
      assert.deepStrictEqual(
        hybridAxes(r.seed),
        named.length ? { [named[0]]: 1 } : {},
        'the move is the record seed’s',
      );
      moves.add(named[0] ?? 'float');
      reset({ poemDoctrine: 'greiman', poemDeal: d });
      S().redealPoem();
      assert.deepStrictEqual(S().layoutParams.fieldForm, f, `deal ${d} replays`);
      assert.equal(S().raygunTap, 0, 'the performer’s tap counter never moves');
    }
    assert.ok(moves.size >= 3, `her moves vary across deals (${[...moves].join(',')})`);
  },
);

ok('F2 off by default: nothing standing, nothing armed; a tap names no HYBRID axis; a call names her move', () => {
  reset();
  S().redealPoem();
  assert.ok(!S().layoutParams.fieldForm?.raygun, 'no doctrine, no treatment');
  reset({ poemDoctrine: 'greiman' });
  let called = 0;
  for (let i = 0; i < 12 && called < 12; i++) {
    reset({ poemDoctrine: 'greiman', raygunTap: i });
    S().callPoemDoctrine();
    const r = S().layoutParams.fieldForm?.raygun;
    if (!r) continue;
    called++;
    assert.equal(r.mode, 'greiman');
    assert.equal(r.doctrine, 'greiman');
    assert.deepStrictEqual(
      hybridAxes(r.seed),
      ['bitmap', 'planes', 'spectrum'].reduce((o, k) => (r[k] === 1 ? { [k]: 1 } : o), {}),
    );
  }
  assert.ok(called > 0, 'the call arms');
  reset();
});

// ── G · the horn strip ──────────────────────────────────────────────────
ok('G1 the strip reads HYBRID’s measured moves from the store (primitive selectors, no timer)', () => {
  const codec = src('../panels/directors/RoomCodec.jsx');
  assert.match(codec, /import \{ hybridSignals \} from '..\/..\/curator\/hybrid\.mjs'/);
  for (const k of ['bitmap', 'planes', 'spectrum']) assert.match(codec, new RegExp(`raygun\\?\\.${k} === 1`));
  assert.match(codec, /hybrid: hybridSignals\(/);
  const geometry = stripComments(src('./hornFaceGeometry.js'));
  assert.ok(
    !/Math\.random|Date\.now|setInterval|setTimeout|requestAnimationFrame/.test(geometry),
    'no timer with an opinion',
  );
  assert.ok(!/not measured yet/i.test(src('./hornFaces.js')), 'the "not measured yet" note is gone');
});

void doctrineMode;
console.log(`hybrid.selfcheck: ${passed} checks passed`);
