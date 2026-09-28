// node src/state/euclid.selfcheck.mjs — #589 Euclidean phrase clock.
import assert from 'node:assert';
import { euclidPattern, euclidString, euclidHit, EUCLID_MAX_STEPS } from './euclid.js';
import { routeBeat } from './beatArbiter.js';
import { createDavisSlice, PHRASE_CLOCKS } from './slices/davisSlice.js';

// ── THE CANON ───────────────────────────────────────────────────────────────
// Golden vectors. If Bjorklund ever drifts, these catch it — and they are the
// named rhythms exactly, not a rotation of them: the floor((i*k)/n) shortcut
// produces 'x.x.xx.x' for E(5,8), the sixth rotation of the cinquillo, which
// is the same necklace and the wrong groove.
assert.strictEqual(euclidString(3, 8), 'x..x..x.', 'E(3,8) is the tresillo');
assert.strictEqual(euclidString(5, 8), 'x.xx.xx.', 'E(5,8) is the cinquillo');
assert.strictEqual(euclidString(2, 5), 'x.x..', 'E(2,5)');
assert.strictEqual(euclidString(3, 4), 'xxx.', 'E(3,4)');
assert.strictEqual(euclidString(7, 16), 'x..x.x.x..x.x.x.', 'E(7,16)');
assert.strictEqual(euclidString(4, 4), 'xxxx', 'E(n,n) is every step');
assert.strictEqual(euclidString(0, 8), '........', 'E(0,n) is silence');

// Every pattern has exactly k hits in n steps, and they are spread — never
// bunched at one end (the property that makes it Euclidean at all).
for (let n = 1; n <= 16; n++) {
  for (let k = 0; k <= n; k++) {
    const p = euclidPattern(k, n);
    assert.strictEqual(p.length, n, `E(${k},${n}) length`);
    assert.strictEqual(p.filter((v) => v).length, k, `E(${k},${n}) hit count`);
    if (k > 0 && k < n) {
      // Gaps between consecutive hits differ by at most 1 — the definition of
      // "as evenly as possible" for integers.
      const idx = p.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      const gaps = idx.map((v, i) => (i === 0 ? v + n - idx[idx.length - 1] : v - idx[i - 1]));
      assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1,
        `E(${k},${n}) is not evenly spread: gaps ${gaps.join(',')}`);
    }
  }
}

// ── FAIL-CLOSED ─────────────────────────────────────────────────────────────
// k > n has no Euclidean meaning. It degrades to a plain metro (every step),
// deliberately, rather than to silence: a dead clock is indistinguishable from
// a broken instrument mid-set.
assert.strictEqual(euclidString(9, 8), 'xxxxxxxx', 'k>n degrades to every step');
assert.strictEqual(euclidString(99, 4), 'xxxx');
assert.strictEqual(euclidPattern(3, 0).length, 1, 'n<1 clamps to a single step');
assert.strictEqual(euclidPattern(3, 9999).length, EUCLID_MAX_STEPS, 'n is capped');
for (const bad of [NaN, undefined, null, 'x', Infinity, -5]) {
  const p = euclidPattern(bad, bad, bad);
  assert.ok(Array.isArray(p) && p.length >= 1 && p.every((v) => v === 0 || v === 1),
    `hostile input ${bad} must still produce a pattern`);
}

// Rotation turns the figure without changing its content.
for (let r = 0; r < 8; r++) {
  assert.strictEqual(euclidPattern(3, 8, r).filter((v) => v).length, 3, `rotate ${r} keeps the hits`);
}
assert.strictEqual(euclidString(3, 8, 8), euclidString(3, 8, 0), 'rotation wraps');
assert.strictEqual(euclidString(3, 8, -1), euclidString(3, 8, 7), 'negative rotation wraps');
assert.notStrictEqual(euclidString(3, 8, 1), euclidString(3, 8, 0), 'rotation actually moves it');

// euclidHit indexes the pattern, and keeps indexing it past the end.
{
  const p = euclidPattern(5, 8);
  for (let s = 0; s < 40; s++) {
    assert.strictEqual(euclidHit(s, 5, 8), p[s % 8] === 1, `step ${s} must follow the figure`);
  }
  assert.strictEqual(euclidHit(-1, 5, 8), p[7] === 1, 'a negative step wraps, never reads undefined');
}

// ── THE TRANSIENT ───────────────────────────────────────────────────────────
// "Switches are immediate" is a claim about transients, so test the transient:
// a clock-source switch must not double-fire the bar or drop a hit.
{
  // Only ONE source may answer a mic attack. METRO and EUCLID run their own
  // interval, so if either also answered audio the bar would advance twice.
  const base = {
    phraseEnabled: true, audioEnabled: true, evolveMode: false,
    slowRender: false, batchPaused: false, beatRoute: 'both',
  };
  assert.strictEqual(routeBeat({ ...base, phraseClock: 'audio' }).tickPhrase, true, 'AUDIO answers the mic');
  assert.strictEqual(routeBeat({ ...base, phraseClock: 'metro' }).tickPhrase, false, 'METRO must not also answer the mic');
  assert.strictEqual(routeBeat({ ...base, phraseClock: 'euclid' }).tickPhrase, false, 'EUCLID must not also answer the mic');

  // A switch changes the SOURCE and nothing else: the bar position, the origin
  // seed and the wrap generation all survive it, so no hit is dropped and none
  // is replayed.
  let state;
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  state = createDavisSlice(set, () => state);
  state.setPhraseClock('euclid');
  state = { ...state, phraseBeat: 3, phraseWrapGen: 2, phraseOriginSeed: 777 };
  const before = { beat: state.phraseBeat, gen: state.phraseWrapGen, origin: state.phraseOriginSeed };
  state.setPhraseClock('metro');
  state.setPhraseClock('euclid');
  assert.strictEqual(state.phraseClock, 'euclid', 'the switch lands');
  assert.deepStrictEqual(
    { beat: state.phraseBeat, gen: state.phraseWrapGen, origin: state.phraseOriginSeed },
    before,
    'switching clock source must not advance or rewind the bar',
  );
}

// ── THE STORE ───────────────────────────────────────────────────────────────
{
  let state;
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  state = createDavisSlice(set, () => state);
  assert.deepStrictEqual(PHRASE_CLOCKS, ['audio', 'metro', 'euclid']);
  for (const c of PHRASE_CLOCKS) { state.setPhraseClock(c); assert.strictEqual(state.phraseClock, c); }
  for (const bad of ['nope', null, undefined, 7, '__proto__']) {
    state.setPhraseClock(bad);
    assert.strictEqual(state.phraseClock, 'audio', `a bogus clock (${bad}) falls back to audio`);
  }
  // beats can never exceed steps, whichever order they are set in.
  state.setEuclid({ steps: 8, beats: 5 });
  assert.strictEqual(state.euclidBeats, 5);
  state.setEuclid({ beats: 99 });
  assert.strictEqual(state.euclidBeats, 8, 'beats clamp to steps');
  state.setEuclid({ steps: 4 });
  assert.ok(state.euclidBeats <= 4, 'shrinking steps must not strand beats above it');
  state.setEuclid({ rotate: 99 });
  assert.ok(state.euclidRotate < state.euclidSteps, 'rotate stays inside the figure');
  state.setEuclid({ steps: 9999 });
  assert.ok(state.euclidSteps <= EUCLID_MAX_STEPS, 'steps capped');
  for (const bad of [NaN, 'x', null]) {
    state.setEuclid({ beats: bad, steps: bad, rotate: bad });
    assert.ok(Number.isFinite(state.euclidBeats) && Number.isFinite(state.euclidSteps) && Number.isFinite(state.euclidRotate),
      'hostile store input stays finite');
  }
}

console.log('euclid.selfcheck: OK');
