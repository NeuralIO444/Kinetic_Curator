// fieldLiveDeal.selfcheck.mjs — FIELD (#1917): the LIVE Director's deal varies.
//
// The defect this pins: the live Director singleton was constructed without
// a fieldRng, so choosePoet ran on the constant fallback () => 0.5 — pool
// index 1, piece index 2, forever. Measured on the pre-fix build through
// this same path: cool → teijo t3 on 60/60 ticks, neutral → rosselli r3,
// hot → gibson w3; Whittier (greenleaf) unreachable, 13 of 16 deck pieces
// dead. The fix deals each tick from a fresh seeded stream keyed by the
// tick index (rngForIndex — the placement path's per-press pattern).
//
// This suite drives the REAL live construction (resetDirector + getDirector,
// no injected rng) through the three intensity bands and asserts the deal
// spreads across poets and pieces, stays inside each band's pool, and
// replays exactly. Mutation property: restoring the constant fallback fails
// nearly every assertion below (one poet per band, one piece per band,
// greenleaf at zero).
//
// #1932 re-pin (cause: the genre gate, Matt's clarification 2026-11-03): a tick
// must now NAME the room's look family, and only a type-native family deals.
// Every drive below names 'swiss' — this suite measures the deal stream in an
// eligible room, as it always did in spirit — and the last block measures the
// gate itself through the live path: the same bands in a grunge room deal
// silence on every tick.
import assert from 'node:assert/strict';
import { createDirector, getDirector, resetDirector } from './director.js';

const T0 = Date.now();
const TICKS = 60;

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

/** Drive the live singleton at a fixed audio level (the band) and tally the deals. */
function runBand(audio, ticks = TICKS) {
  resetDirector();
  const d = getDirector();
  const poets = {};
  const pieces = {};
  let silent = 0;
  for (let i = 0; i < ticks; i++) {
    const r = d.tick({ feed: {}, audio, nowTs: T0 + i * 1000, lookFamily: 'swiss' });
    if (!r.poet) {
      silent++;
      continue;
    }
    poets[r.poet.poetId] = (poets[r.poet.poetId] || 0) + 1;
    pieces[r.poet.pieceId] = (pieces[r.poet.pieceId] || 0) + 1;
  }
  return { poets, pieces, silent };
}

const cool = runBand(0.1);
const neutral = runBand(0.5);
const hot = runBand(0.8);
console.log(
  `fieldLiveDeal: cool poets=${JSON.stringify(cool.poets)} pieces=${Object.keys(cool.pieces).length}; ` +
    `neutral poets=${JSON.stringify(neutral.poets)} pieces=${Object.keys(neutral.pieces).length}; ` +
    `hot poets=${JSON.stringify(hot.poets)} pieces=${Object.keys(hot.pieces).length}`,
);

ok(
  'the tick path arms a poet on every tick in a type-native room (silence needs a rejection; this path never rejects)',
  () => {
    assert.equal(cool.silent + neutral.silent + hot.silent, 0);
  },
);

ok('#1932: the same bands in a non-type-native room deal silence on every tick (the genre gate, live path)', () => {
  resetDirector();
  const d = getDirector();
  let silent = 0;
  for (let i = 0; i < TICKS; i++) {
    const r = d.tick({ feed: {}, audio: [0.1, 0.5, 0.8][i % 3], nowTs: T0 + i * 1000, lookFamily: 'grunge' });
    if (!r.poet) silent++;
  }
  assert.equal(silent, TICKS, 'grunge room: no poet at any temperature');
  resetDirector();
});

ok('cool band deals BOTH cool poets and only cool poets, with a spread of pieces', () => {
  assert.deepEqual(Object.keys(cool.poets).sort(), ['greenleaf', 'teijo']);
  assert.ok(cool.poets.greenleaf >= 10 && cool.poets.teijo >= 10, 'neither cool poet is a rarity');
  assert.ok(Object.keys(cool.pieces).length >= 6, `cool pieces spread (got ${Object.keys(cool.pieces).length})`);
});

ok('neutral band deals ALL FOUR poets, with a spread of pieces', () => {
  assert.deepEqual(Object.keys(neutral.poets).sort(), ['gibson', 'greenleaf', 'rosselli', 'teijo']);
  for (const p of Object.keys(neutral.poets)) assert.ok(neutral.poets[p] >= 5, `${p} appears more than by luck`);
  assert.ok(
    Object.keys(neutral.pieces).length >= 12,
    `neutral pieces spread (got ${Object.keys(neutral.pieces).length})`,
  );
});

ok('hot band deals BOTH hot poets and only hot poets, with a spread of pieces', () => {
  assert.deepEqual(Object.keys(hot.poets).sort(), ['gibson', 'rosselli']);
  assert.ok(hot.poets.gibson >= 10 && hot.poets.rosselli >= 10, 'neither hot poet is a rarity');
  assert.ok(Object.keys(hot.pieces).length >= 6, `hot pieces spread (got ${Object.keys(hot.pieces).length})`);
});

ok('Whittier (greenleaf) is reachable — the headline regression stays dead', () => {
  const greenleafTotal = (cool.poets.greenleaf || 0) + (neutral.poets.greenleaf || 0) + (hot.poets.greenleaf || 0);
  assert.ok(greenleafTotal > 0, 'greenleaf is dealt somewhere across the bands');
  const allPieces = new Set([...Object.keys(cool.pieces), ...Object.keys(neutral.pieces), ...Object.keys(hot.pieces)]);
  assert.ok(allPieces.size >= 14, `the deck is alive: ${allPieces.size}/16 pieces dealt across the bands`);
});

/** One fixed mixed-band script, run against a fresh singleton. */
function runScript() {
  resetDirector();
  const d = getDirector();
  const audios = [0.1, 0.5, 0.8, 0.5];
  const seq = [];
  for (let i = 0; i < 48; i++) {
    const r = d.tick({ feed: {}, audio: audios[i % audios.length], nowTs: T0 + i * 1000, lookFamily: 'swiss' });
    seq.push(r.poet ? `${r.poet.poetId}/${r.poet.pieceId}/${r.poet.layout}` : 'null');
  }
  return seq;
}

ok('a recorded run replays: two fresh live Directors dealt the same script deal identical poems', () => {
  const a = runScript();
  const b = runScript();
  assert.deepEqual(a, b, 'same tick sequence in → same poems out');
  assert.ok(new Set(a).size > 4, 'and the replayed sequence is a deal, not a stuck record');
});

ok('reset() re-deals the same stream from the top', () => {
  const d = createDirector({ now: () => T0 });
  const script = () => {
    const seq = [];
    for (let i = 0; i < 24; i++) {
      const r = d.tick({ feed: {}, audio: 0.5, nowTs: T0 + i * 1000, lookFamily: 'swiss' });
      seq.push(r.poet ? `${r.poet.poetId}/${r.poet.pieceId}` : 'null');
    }
    return seq;
  };
  const first = script();
  d.reset();
  assert.deepEqual(script(), first, 'after reset the same ticks deal the same poems');
});

ok('an injected fieldRng still wins exactly (the test seam the fix must not break)', () => {
  const d = createDirector({ now: () => T0, fieldRng: () => 0.5 });
  const r = d.tick({ feed: {}, audio: 0.1, nowTs: T0, lookFamily: 'swiss' });
  assert.equal(r.poet.poetId, 'teijo', 'constant 0.5 in a cool room still picks pool index 1');
  assert.equal(r.poet.pieceId, 't3', 'constant 0.5 still picks piece index 2');
});

resetDirector();
console.log(`fieldLiveDeal.selfcheck: ${n} checks passed`);
