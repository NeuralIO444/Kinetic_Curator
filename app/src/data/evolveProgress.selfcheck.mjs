// evolveProgress.selfcheck.mjs — #616 DAVIS regroup + EVOLVE progress.
//
//  A. the pure run helpers (start / tick / finish / sec-per-gen).
//  B. the store: EVOLVE on starts a run, each generation counts, off keeps a
//     summary; a manual tick while stopped counts only as a candidate seen;
//     the evolve step itself is unchanged (seed still steps, timestamp set).
//  C. the panel: three labelled sections in order, and EVERY existing control
//     is still there (nothing deleted, no behaviour change beyond grouping).
//  D. #2485: the wait reason — a running EVOLVE whose source cannot fire
//     names why (the truth table), the stress session's own configuration
//     end-to-end through the real store + beat arbiter, and the panel
//     rendering the reason.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { startRun, tickRun, finishRun, secPerGen, evolveWaitReason } from './evolveProgress.js';
import { loopClock } from '../gl/loopClock.js';
import { useStore } from '../state/store.js';
import { routeBeat } from '../state/beatArbiter.js';

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
  useStore.setState({
    evolveMode: false,
    evolveRun: null,
    evolveLast: null,
    evolveSeen: 0,
    evolveTarget: 'seed',
    lastEvolveTs: 0,
  });
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
  S().triggerEvolve();
  S().triggerEvolve();
  S().triggerEvolve();
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
  const at = (s) => {
    const i = panel.indexOf(s);
    assert.ok(i >= 0, `DavisPanel has ${s}`);
    return i;
  };
  assert.ok(
    at('>voices<') < at('>generate<') && at('>generate<') < at('>perform<'),
    'VOICES → GENERATE → PERFORM, in order',
  );
  const generate = panel.slice(at('>generate<'), at('>perform<'));
  for (const s of [
    'DAVIS_EVOLVE, { toggle: true }',
    'saveFavorite',
    'bumpSeed: true',
    'SUB_SEED_STREAMS.map',
    'DAVIS_MUTATE_STREAM, { reset: true }',
    '<EvolveProgress />',
  ]) {
    assert.ok(generate.includes(s), `GENERATE still holds ${s}`);
  }
  const perform = panel.slice(at('>perform<'));
  for (const s of ["ACCUM_GESTURE, { action: 'freeze'", "action: 'clear'", "action: 'swell'", 'davis-phrase-status']) {
    assert.ok(perform.includes(s) || panel.includes(s), `PERFORM still holds ${s}`);
  }
  const voices = panel.slice(at('>voices<'), at('>generate<'));
  assert.ok(
    voices.includes('<VoiceTiles />') && voices.includes('<BehaveReadout'),
    'VOICES holds the tiles and the behave readout',
  );
  assert.ok(/subtitle=\{subtitle\}/.test(panel), 'the header status line is kept');
  // nothing new that controls phrase/MIDI: the panel reports, it does not duplicate PLAY
  assert.ok(!/DAVIS_PHRASE/.test(panel), 'phrase controls stay in PLAY (#248)');
}

// ── D ────────────────────────────────────────────────────────────────────
{
  // The truth table. Base facts: a healthy time-source run.
  const base = {
    evolveMode: true,
    evolveSource: 'time',
    beatRoute: 'both',
    audioEnabled: false,
    beatMetro: true,
    slowRender: false,
    batchPaused: false,
    running: true,
    gen: 0,
  };
  const reason = (over) => evolveWaitReason({ ...base, ...over });

  assert.strictEqual(evolveWaitReason(null), null, 'no facts, no claim');
  assert.strictEqual(reason({ evolveMode: false }), null, 'a stopped EVOLVE waits for nothing');
  assert.strictEqual(reason({}), null, 'time source, loop running: fires within one interval');
  assert.strictEqual(reason({ gen: 7 }), null, 'a landed run on a live source stays quiet');

  // Hard holds gate BOTH sources (#107 §4/§5) and are named at any gen.
  assert.match(reason({ slowRender: true }), /governor/, 'cut-6 freeze holds the time driver');
  assert.match(reason({ slowRender: true, evolveSource: 'beat', audioEnabled: true, gen: 3 }), /governor/);
  assert.match(reason({ batchPaused: true }), /batch export/, 'a batch holds the time driver');
  assert.match(reason({ batchPaused: true, evolveSource: 'beat', audioEnabled: true }), /batch export/);

  // Time source, loop stopped: the loop clock cannot advance, so the
  // interval can never elapse — named, not silent.
  assert.match(reason({ running: false }), /loop stopped/, 'a stopped loop starves the time source');

  // Beat source: the route is the hardest blocker — with route PHRASE,
  // beats arrive and EVOLVE still gets none.
  assert.match(reason({ evolveSource: 'beat', beatRoute: 'phrase', audioEnabled: true }), /PHRASE/);
  assert.match(reason({ evolveSource: 'beat', beatRoute: 'phrase', audioEnabled: true, gen: 5 }), /PHRASE/);
  // No input at all (the stress session's state): named at any gen, so a
  // mid-run input loss speaks too.
  assert.match(reason({ evolveSource: 'beat', audioEnabled: false, beatMetro: false }), /no beat input/);
  assert.match(reason({ evolveSource: 'beat', audioEnabled: false, beatMetro: false, gen: 5 }), /no beat input/);
  // Input live, nothing landed yet: the soft wait, only before gen 1.
  assert.strictEqual(reason({ evolveSource: 'beat', audioEnabled: true }), 'waiting for a beat');
  assert.strictEqual(reason({ evolveSource: 'beat', audioEnabled: false, beatMetro: true }), 'waiting for a beat');
  assert.strictEqual(reason({ evolveSource: 'beat', audioEnabled: true, gen: 1 }), null, 'first beat landed: quiet');
  // Route EVOLVE (not just BOTH) still feeds the gate.
  assert.strictEqual(reason({ evolveSource: 'beat', beatRoute: 'evolve', audioEnabled: true }), 'waiting for a beat');
  // Metro-only input on a stopped loop: the metro is gated on the loop
  // running, so no beat can ever arrive — the stopped loop is named at
  // any gen (QA's gap: this state previously read as a soft wait at
  // gen 0 and as silence after the first generation).
  assert.match(reason({ evolveSource: 'beat', audioEnabled: false, beatMetro: true, running: false }), /loop stopped/);
  assert.match(
    reason({ evolveSource: 'beat', audioEnabled: false, beatMetro: true, running: false, gen: 5 }),
    /loop stopped/,
  );
  // The asymmetry: mic input fires while the show is stopped, so a
  // stopped loop is NOT a hold for an audio-fed beat source.
  assert.strictEqual(reason({ evolveSource: 'beat', audioEnabled: true, running: false }), 'waiting for a beat');
  assert.strictEqual(reason({ evolveSource: 'beat', audioEnabled: true, running: false, gen: 5 }), null);
}
{
  // End-to-end through the real store, in the stress session's own
  // configuration: A1's flurry left target ALL + source BEAT; audio off,
  // dial metro off. EVOLVE on: no fire is possible, and now the surface
  // can say so — the facts the panel reads are the store's own.
  const S = () => useStore.getState();
  const facts = () => {
    const s = S();
    return {
      evolveMode: s.evolveMode,
      evolveSource: s.evolveSource,
      beatRoute: s.beatRoute,
      audioEnabled: s.audioEnabled,
      beatMetro: s.beatMetro,
      slowRender: s.slowRender,
      batchPaused: s.batchPaused,
      running: s.running,
      gen: s.evolveRun ? s.evolveRun.gen : 0,
    };
  };
  useStore.setState({
    evolveMode: false,
    evolveRun: null,
    evolveLast: null,
    evolveSeen: 0,
    slowRender: false,
    batchPaused: false,
    running: true,
  });
  S().setEvolveTarget('all');
  S().setEvolveSource('beat');
  S().setBeatRoute('both');
  S().setAudioEnabled(false);
  S().setBeatMetro(false);
  S().setEvolveMode(true);
  assert.strictEqual(S().evolveRun.gen, 0);
  assert.match(evolveWaitReason(facts()), /no beat input/, 'the session stall names itself');

  // Audio on: the input is live — the soft wait until the first beat.
  S().setAudioEnabled(true);
  assert.strictEqual(evolveWaitReason(facts()), 'waiting for a beat');
  // Deliver beats the way App.jsx onBeat does (the arbiter decides; the
  // store fires on its word): the first landed generation ends the wait.
  for (let i = 0; i < 3; i++) {
    const s = S();
    const d = routeBeat(s);
    assert.strictEqual(d.fireEvolve, true, 'the arbiter arms evolve on a live beat');
    if (d.fireEvolve) s.triggerEvolve({ loopTimeMs: loopClock.ms });
  }
  assert.strictEqual(S().evolveRun.gen, 3, 'beats land generations');
  assert.strictEqual(evolveWaitReason(facts()), null, 'a firing run is quiet');

  // The input dies mid-run: the hard hold returns, gen or no gen.
  S().setAudioEnabled(false);
  assert.match(evolveWaitReason(facts()), /no beat input/, 'mid-run input loss is named');

  // The metro takes over as the only input: live while the loop runs,
  // and when the show stops the stopped loop is named — at gen 3, not
  // silence (the metro is gated on the loop running; QA's gap, end to
  // end through the real store).
  S().setBeatMetro(true);
  assert.strictEqual(evolveWaitReason(facts()), null, 'metro live and landed: quiet');
  S().setRunning(false);
  assert.match(evolveWaitReason(facts()), /loop stopped/, 'metro-only on a stopped loop is named at gen 3');
  S().setRunning(true);
  assert.strictEqual(evolveWaitReason(facts()), null, 'RUN restarts the metro path: quiet again');
  S().setBeatMetro(false);

  // Route the beats away: named even with the input live.
  S().setAudioEnabled(true);
  S().setBeatRoute('phrase');
  assert.match(evolveWaitReason(facts()), /PHRASE/, 'a PHRASE route starves the gate, named');
  S().setBeatRoute('both');

  // Time source on a stopped loop, then a governor hold.
  S().setEvolveSource('time');
  assert.strictEqual(evolveWaitReason(facts()), null, 'time source, loop running: quiet');
  S().setRunning(false);
  assert.match(evolveWaitReason(facts()), /loop stopped/);
  S().setRunning(true);
  S().setSlowRender(true, 'cut6');
  assert.match(evolveWaitReason(facts()), /governor/, 'the governor hold outranks the source');
  S().setSlowRender(false);

  S().setEvolveMode(false);
  assert.strictEqual(evolveWaitReason(facts()), null, 'stopped: no wait to name');
  useStore.setState({ evolveMode: false, evolveRun: null, evolveLast: null, evolveSeen: 0 });
}
{
  // The panel renders the reason inside the running readout.
  const progress = readFileSync(new URL('../panels/davis/EvolveProgress.jsx', import.meta.url), 'utf8');
  assert.ok(progress.includes('evolveWaitReason'), 'EvolveProgress reads the wait reason');
  assert.ok(progress.includes('davis-progress-wait'), 'and renders it as the wait line');
}
console.log('evolveProgress.selfcheck: OK');
