// node src/state/sessionOnly.selfcheck.mjs
//
// #1641 — the shared "not saved" mechanism: six small persist
// surfaces report a storage refusal through sessionOnly.mjs, the
// flag latches for the session, and the store mirrors it beside
// persistStatus for MasterBar. Pinned here: one surface's
// transition (the experimental switch), the taste import's session
// contract under refusal, the store's boot-path mirror (a note
// latched before the store exists still lands), and the latch's
// listener semantics. The other four surfaces pin their own
// transitions in their own suites (same one-line catch).
import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {
    throw new Error('storage blocked');
  },
  removeItem: () => {
    throw new Error('storage blocked');
  },
};

const { noteSessionOnly, sessionOnlyNoted, onSessionOnly } = await import('./sessionOnly.mjs');
const { setExperimental } = await import('../curator/tasteGate.js');
const { importTaste, clearTaste } = await import('../curator/tasteStore.js');
const { FEATURES_VERSION } = await import('../curator/recipeFeatures.js');

let checks = 0;
const ok = (name) => {
  checks += 1;
  console.log(`  [ok] ${name}`);
};

// ── a refused persist latches the flag, and the value still applies ──
{
  assert.equal(sessionOnlyNoted(), false, 'nothing noted yet');
  assert.equal(setExperimental(true), true, 'the switch still holds for the session');
  assert.equal(sessionOnlyNoted(), true, 'the refusal is on the shared flag');
  ok('a refused persist latches the session-only flag');
}

// ── the taste import keeps its session contract under refusal ──
{
  const taste = {
    kind: 'kc-taste',
    version: 1,
    featuresVersion: FEATURES_VERSION,
    model: 'm',
    dims: 1152,
    probe: { weights: new Array(1152).fill(0.001), bias: 0 },
    labels: { likes: 42, passes: 180 },
    trainedAt: '2026-09-30T00:00:00Z',
    head: { terms: { 'scale=large': 1.5 }, num: { count: -2 }, bias: 0.1, fidelity: 0.71, fitOn: 222 },
  };
  const r = importTaste(taste);
  assert.equal(r.ok, true, 'the session still curates with the imported taste');
  clearTaste(); // the refused remove is caught and noted, never thrown
  ok('the taste import/clear keep their contracts when storage refuses');
}

// ── the store mirrors a note latched before it existed ──
{
  const { useStore } = await import('./store.js');
  assert.equal(
    useStore.getState().tuningSessionOnly,
    true,
    "MasterBar's flag is set — the subscription fires for a latched note",
  );
  ok('the store mirrors the latch beside persistStatus');
}

// ── the latch fires its listeners once ──
{
  let calls = 0;
  onSessionOnly(() => {
    calls += 1;
  });
  assert.equal(calls, 1, 'a late subscriber hears the latch immediately');
  noteSessionOnly();
  assert.equal(calls, 1, 'and never twice');
  ok('listeners fire once, late subscribers included');
}

console.log(`sessionOnly.selfcheck: ${checks} checks passed`);
