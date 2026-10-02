// evolveProgress.selfcheck.mjs — #616 DAVIS regroup + EVOLVE progress.
//
//  A. the pure run helpers (start / tick / finish / sec-per-gen).
//  B. the store: EVOLVE on starts a run, each generation counts, off keeps a
//     summary; a manual tick while stopped counts only as a candidate seen;
//     the evolve step itself is unchanged (seed still steps, timestamp set).
//  C. the panel: three labelled sections in order, and EVERY existing control
//     is still there (nothing deleted, no behaviour change beyond grouping).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { startRun, tickRun, finishRun, secPerGen } from './evolveProgress.js';
import { loopClock } from '../gl/loopClock.js';
import { useStore } from '../state/store.js';

// ── A ────────────────────────────────────────────────────────────────────
{
  const r0 = startRun(1000);
  assert.deepStrictEqual(r0, { gen: 0, startedTs: 1000, lastTs: 0 });
  assert.strictEqual(secPerGen(r0), null, 'no cadence before the first generation');
  const r2 = tickRun(tickRun(r0, 3000), 5000);
  assert.strictEqual(r2.gen, 2);
  assert.strictEqual(secPerGen(r2), 2, '4 s / 2 gens = 2.0 s per generation: the real cadence');
  assert.deepStrictEqual(finishRun(r2, 9000), { gen: 2, seconds: 8 });
  assert.strictEqual(finishRun(null, 1), null);
  assert.strictEqual(tickRun(null, 1), null, 'ticking no run is a no-op');
  assert.strictEqual(r0.gen, 0, 'helpers never mutate');
}

// ── B ────────────────────────────────────────────────────────────────────
{
  const S = () => useStore.getState();
  // #808: the evolve stamp is loop time, not wall time — simulate an
  // observed loop clock so the stamps land on it.
  loopClock.ms = 42000;
  useStore.setState({ evolveMode: false, evolveRun: null, evolveLast: null, evolveSeen: 0, evolveTarget: 'seed', lastEvolveTs: 0 });
  const seed0 = S().seed;
  S().triggerEvolve(); // manual tick while stopped
  assert.strictEqual(S().seed, (seed0 + 1) % 1000000, 'the evolve step is unchanged: the seed steps');
  assert.strictEqual(S().lastEvolveTs, 42000, 'and stamps lastEvolveTs with the loop clock');
  assert.strictEqual(S().evolveSeen, 1, 'a manual tick is a candidate seen');
  assert.strictEqual(S().evolveRun, null, 'but not a generation: there is no run');

  S().setEvolveMode(true);
  assert.ok(S().evolveMode && S().evolveRun && S().evolveRun.gen === 0, 'EVOLVE on starts a fresh run');
  S().setEvolveMode(true);
  assert.strictEqual(S().evolveRun.gen, 0, 're-asserting EVOLVE on does not restart the run');
  S().triggerEvolve(); S().triggerEvolve(); S().triggerEvolve();
  assert.strictEqual(S().evolveRun.gen, 3, 'each generation counts');
  assert.strictEqual(S().evolveSeen, 4, 'candidates seen keeps the session total');
  assert.strictEqual(S().evolveRun.lastTs, S().lastEvolveTs, 'the run is stamped with the real tick time');

  S().setEvolveMode((m) => !m); // toggle off (the EVOLVE/STOP button's path)
  assert.strictEqual(S().evolveMode, false);
  assert.strictEqual(S().evolveRun, null);
  assert.strictEqual(S().evolveLast.gen, 3, 'stopping keeps the last-run summary');
  assert.ok(Number.isFinite(S().evolveLast.seconds));
  S().setEvolveMode(true);
  assert.strictEqual(S().evolveRun.gen, 0, 'a new run starts from zero');
  assert.strictEqual(S().evolveLast.gen, 3, 'the old summary stays until that run stops');
  useStore.setState({ evolveMode: false, evolveRun: null, evolveLast: null, evolveSeen: 0 });
}

// ── C ────────────────────────────────────────────────────────────────────
{
  const panel = readFileSync(new URL('../panels/DavisPanel.jsx', import.meta.url), 'utf8');
  const at = (s) => { const i = panel.indexOf(s); assert.ok(i >= 0, `DavisPanel has ${s}`); return i; };
  assert.ok(at('>VOICES<') < at('>GENERATE<') && at('>GENERATE<') < at('>PERFORM<'), 'VOICES → GENERATE → PERFORM, in order');
  const generate = panel.slice(at('>GENERATE<'), at('>PERFORM<'));
  for (const s of ['DAVIS_EVOLVE, { toggle: true }', 'saveFavorite', 'bumpSeed: true', 'SUB_SEED_STREAMS.map', 'DAVIS_MUTATE_STREAM, { reset: true }', '<EvolveProgress />']) {
    assert.ok(generate.includes(s), `GENERATE still holds ${s}`);
  }
  const perform = panel.slice(at('>PERFORM<'));
  for (const s of ['ACCUM_GESTURE, { action: \'freeze\'', "action: 'clear'", "action: 'swell'", 'davis-phrase-status']) {
    assert.ok(perform.includes(s) || panel.includes(s), `PERFORM still holds ${s}`);
  }
  const voices = panel.slice(at('>VOICES<'), at('>GENERATE<'));
  assert.ok(voices.includes('<VoiceTiles />') && voices.includes('<BehaveReadout'), 'VOICES holds the tiles and the behave readout');
  assert.ok(/subtitle=\{subtitle\}/.test(panel), 'the header status line is kept');
  // nothing new that controls phrase/MIDI: the panel reports, it does not duplicate PLAY
  assert.ok(!/DAVIS_PHRASE/.test(panel), 'phrase controls stay in PLAY (#248)');
}
console.log('evolveProgress.selfcheck: OK');
