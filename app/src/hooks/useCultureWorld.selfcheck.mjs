// node src/hooks/useCultureWorld.selfcheck.mjs
// CULTURE Phase 5, slice A — the dish gate, pinned. Citizens immigrate through the shell's gate
// (hooks/useCultureWorld.js): QA found that mutating its `if (!on)` to `if (false)` survived every
// suite. This suite pins it from both ends:
//   1. gate OFF (the store default, and every non-`true` value) → no world, no cast, no frame
//      request, nothing standing — and a world left standing by an earlier ON is cleared
//   2. gate ON → a fresh world, cast at birth (the first citizens), standing, fed from the host's
//      frame clock in fixed steps; the cleanup cancels the frame and clears only its own world
//   3. a new take (seed) is a new world, cast fresh — no standing zoo carried across
//   4. the hook hands runCultureShell exactly the store's gate (`cultureDish === true`) and seed
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCultureShell } from './useCultureWorld.js';
import { standingCultureWorld, setStandingCultureWorld, createCultureWorld } from '../engine/cultureWorld.mjs';
import { useStore } from '../state/store.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
/** A fake frame host: records requests and cancels; `frame(t)` runs the pending callback at time t. */
function host() {
  const h = { requests: 0, cancels: [], pending: null, id: 0, worlds: [] };
  h.requestAnimationFrame = (f) => {
    h.requests++;
    h.pending = f;
    return ++h.id;
  };
  h.cancelAnimationFrame = (id) => h.cancels.push(id);
  h.onWorld = (w) => h.worlds.push(w);
  h.frame = (t) => {
    const f = h.pending;
    h.pending = null;
    f(t);
  };
  return h;
}

// 1 — gate OFF.
{
  assert.equal(useStore.getState().cultureDish, false, 'the store defaults the gate off');
  for (const off of [false, undefined, null, 0, 1, 'true', {}]) {
    const h = host();
    const stale = createCultureWorld({ seed: 1 });
    setStandingCultureWorld(stale);
    const cleanup = runCultureShell(off, 7, h);
    assert.equal(cleanup, undefined, `gate ${JSON.stringify(off)}: no effect to clean up`);
    assert.equal(h.requests, 0, `gate ${JSON.stringify(off)}: no frame requested`);
    assert.deepEqual(h.worlds, [null], 'no world handed to the shell');
    assert.equal(standingCultureWorld(), null, 'nothing standing: an earlier world is cleared');
    assert.equal(stale.citizens.cast, 0, 'nothing cast');
  }
  ok('gate OFF: no world, no cast, no frame request, nothing standing — for every value but exactly true');
}

// 2 — gate ON.
{
  const h = host();
  const cleanup = runCultureShell(true, 7, h);
  assert.equal(typeof cleanup, 'function');
  const w = standingCultureWorld();
  assert.ok(w, 'a world stands');
  assert.deepEqual(h.worlds, [w]);
  assert.equal(w.seed, 7);
  assert.equal(w.citizens.cast, 1, 'cast at birth — the Lab’s door');
  assert.ok(w.citizens.list.length >= 2, 'the first citizens live in the dish');
  assert.ok(
    w.citizens.list.every((c) => c.plan === 'dish'),
    'the first citizen is the dish creature',
  );
  assert.equal(h.requests, 1, 'one frame requested');
  h.frame(1000);
  assert.equal(w.step, 0, 'the first frame only sets the clock');
  h.frame(1000 + 50);
  assert.equal(w.step, 6, '50 ms = 6 whole 120 Hz steps');
  assert.equal(h.requests, 3);
  const after = createCultureWorld({ seed: 99 });
  cleanup();
  assert.deepEqual(h.cancels, [3], 'the pending frame cancelled');
  assert.equal(standingCultureWorld(), null, 'its own world cleared');
  assert.deepEqual(h.worlds, [w, null]);
  // A newer world already standing is left alone by an older cleanup.
  const h2 = host();
  const c2 = runCultureShell(true, 8, h2);
  setStandingCultureWorld(after);
  c2();
  assert.equal(standingCultureWorld(), after, 'an older cleanup never clears a newer world');
  setStandingCultureWorld(null);
  ok('gate ON: a fresh world cast at birth, standing, stepped in fixed steps from the frame clock; cleanup is its own');
}

// 3 — a new take is a new world.
{
  const h = host();
  const c1 = runCultureShell(true, 7, h);
  const w1 = standingCultureWorld();
  c1();
  const c2 = runCultureShell(true, 7, h);
  const w2 = standingCultureWorld();
  assert.notEqual(w2, w1, 'a fresh world');
  assert.notEqual(w2.citizens, w1.citizens, 'no standing zoo carried across');
  assert.equal(w2.citizens.cast, 1);
  c2();
  ok('a new take is a new world, cast fresh');
}

// 4 — the hook hands the shell exactly the store's gate.
{
  const src = readFileSync(new URL('./useCultureWorld.js', import.meta.url), 'utf8');
  assert.match(
    src,
    /const on = useStore\(\(s\) => s\.cultureDish === true\);/,
    'the gate is read strictly from the store',
  );
  assert.match(src, /const seed = useStore\(\(s\) => s\.seed\);/);
  assert.match(src, /runCultureShell\(on, seed, \{/, 'and handed to the shell untouched');
  assert.match(src, /\[on, seed\]/, 'the effect re-runs on the gate and the take');
  assert.equal((src.match(/runCultureShell\(/g) || []).length, 2, 'one definition, one call');
  ok("the hook hands runCultureShell the store's own gate and seed");
}

console.log(`useCultureWorld.selfcheck: ${checks}/4 groups OK`);
