// node src/curator/transitions.selfcheck.mjs — #592 Markov transition weights.
import assert from 'node:assert';
import { TRANSITIONS, MARKOV_KEYS, markovPick, hasChain } from './transitions.js';
import { curatorHint } from './curate.js';
import { MODE_IDS, BEHAVE_MODES, PALETTE_SHIFTS } from '../data/layout-modes.js';
import { mkRng } from '../engine/prng.js';

const DOMAINS = { mode: MODE_IDS, behave: BEHAVE_MODES, paletteShift: PALETTE_SHIFTS };

// ── row-stochastic ──────────────────────────────────────────────────────────
assert.deepStrictEqual([...MARKOV_KEYS].sort(), ['behave', 'mode', 'paletteShift']);
for (const key of MARKOV_KEYS) {
  const domain = DOMAINS[key];
  const table = TRANSITIONS[key];
  assert.deepStrictEqual(Object.keys(table).sort(), [...domain].sort(), `${key}: a row per value`);
  for (const [from, row] of Object.entries(table)) {
    const sum = Object.values(row).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-12, `${key}.${from} sums to ${sum}, not 1`);
    assert.deepStrictEqual(Object.keys(row).sort(), [...domain].sort(), `${key}.${from}: every value reachable`);
    for (const [to, p] of Object.entries(row)) {
      assert.ok(p > 0 && p < 1, `${key}.${from}->${to} = ${p} must be a real probability`);
    }
  }
}

// Memory, not just a table: kin must outweigh far, or the chain is uniform
// wearing a costume. (scatter is a family of one — it has no kin, by design.)
{
  const row = TRANSITIONS.mode.grid;
  for (const kin of ['rails', 'abacus', 'stratified']) {
    for (const far of ['swarm', 'ca', 'random']) {
      assert.ok(row[kin] > row[far] * 2, `grid should develop toward ${kin} over ${far}`);
    }
  }
  // A press that changes nothing reads as a dead button.
  assert.ok(row.grid < row.rails, 'staying put must be less likely than developing');
}

// ── THE STATIONARY DISTRIBUTION ─────────────────────────────────────────────
// Rows summing to 1 does not catch a subtly wrong table. Walk the chain for a
// long seeded run and compare visit frequencies against the distribution the
// matrix itself predicts (power iteration). A table that is stochastic but
// wrong lands somewhere else.
for (const key of MARKOV_KEYS) {
  const domain = DOMAINS[key];
  // predicted: power-iterate the transition matrix to its fixed point
  let dist = Object.fromEntries(domain.map((v) => [v, 1 / domain.length]));
  for (let it = 0; it < 4000; it++) {
    const next = Object.fromEntries(domain.map((v) => [v, 0]));
    for (const from of domain) {
      for (const to of domain) next[to] += dist[from] * TRANSITIONS[key][from][to];
    }
    dist = next;
  }
  // observed: an actual seeded walk
  const rng = mkRng(0x5eed + key.length);
  const seen = Object.fromEntries(domain.map((v) => [v, 0]));
  let cur = domain[0];
  const N = 240000;
  for (let i = 0; i < N; i++) {
    cur = markovPick(key, cur, rng).value;
    seen[cur] += 1;
  }
  for (const v of domain) {
    const observed = seen[v] / N;
    assert.ok(Math.abs(observed - dist[v]) < 0.01,
      `${key}: ${v} visited ${(observed * 100).toFixed(2)}%, chain predicts ${(dist[v] * 100).toFixed(2)}%`);
  }
  // …and the walk must actually visit the whole domain.
  for (const v of domain) assert.ok(seen[v] > 0, `${key}: ${v} never visited`);
}

// ── replay ──────────────────────────────────────────────────────────────────
// Same seed, same press: identical picks. This is the invariant the whole
// curator rests on.
{
  const walk = (seed) => {
    const rng = mkRng(seed);
    let cur = 'grid';
    return Array.from({ length: 50 }, () => (cur = markovPick('mode', cur, rng).value));
  };
  assert.deepStrictEqual(walk(99), walk(99), 'same seed replays exactly');
  assert.notDeepStrictEqual(walk(99), walk(100), 'a different seed is a different phrase');
}

// ── fail-open, and it says so ───────────────────────────────────────────────
{
  // Unknown from-state: a project from another build, or a retired value.
  for (const bad of ['nope', '__proto__', '', null, undefined, 7]) {
    const r = markovPick('mode', bad, mkRng(1));
    assert.ok(MODE_IDS.includes(r.value), `unknown from-state ${bad} must still land on a real mode`);
    assert.strictEqual(r.fellBack, true, `unknown from-state ${bad} must report the fallback`);
  }
  // A known from-state never claims a fallback.
  assert.strictEqual(markovPick('mode', 'grid', mkRng(1)).fellBack, false);
  // Unknown KEY is inert rather than throwing.
  assert.strictEqual(markovPick('nosuchkey', 'grid', mkRng(1)).fellBack, true);
  // Hostile rng: a broken stream must not produce undefined.
  for (const badRng of [() => NaN, () => -5, () => 2, () => 1, null, undefined]) {
    const r = markovPick('behave', 'cruise', badRng);
    assert.ok(BEHAVE_MODES.includes(r.value), `hostile rng ${String(badRng)} must still land on a real value`);
  }
  assert.strictEqual(hasChain('mode'), true);
  assert.strictEqual(hasChain('jitter'), false, 'numeric params must keep rolling uniform');
}

// ── the flag reaches the performer ──────────────────────────────────────────
{
  const curator = { status: () => 'active', name: 'persona', personaName: 'Haeckel' };
  assert.ok(!curatorHint(curator).includes('uniform'), 'a working chain says nothing extra');
  assert.ok(curatorHint(curator, { chainFallback: true }).includes('chain: uniform'),
    'a fallen-back chain must be visible in the bar');
  const untrained = { status: () => 'idle', name: 'null' };
  assert.ok(curatorHint(untrained, { chainFallback: true }).includes('chain: uniform'),
    'the flag survives the untrained-curator copy too');
}

console.log('transitions.selfcheck: OK');
