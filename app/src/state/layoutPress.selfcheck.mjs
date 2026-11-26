// node src/state/layoutPress.selfcheck.mjs
//
// #2493 (A15) — a BUILD layout press "applies late": after cycling the layout
// tiles ending in GRID, VORONOI CELLS stayed [pressed]; a solo GRID press
// still showed VORONOI; one observation later GRID was [pressed]. A voice
// mix stood at 50% at the time.
//
// What this pin proves (the mechanism, from the code + a built-app repro):
// the deferral is the designed MIX road, not a dropped or retried write.
// A layout press dispatches synchronously (TeaMatrix onClick → MODE_LOAD →
// LOAD_STUB_MODE → loadStubMode) and opens an auto MIX (2 s authored);
// `layoutParams` — the committed state the chip's aria-pressed derives
// from — is untouched until the driver lands the mix (completion at t=1,
// the #1935 presented-age ceiling at 1.5× while running, or the #806
// held-cut at t=0). The STAGE is not late: resolveLiveRenderState takes
// the target mode for any t>0 (Spine E enum rule), so the new layout
// renders from the first advanced tick while the chip still names the
// committed one. Every press re-opens the dissolve from the committed
// state, so rapid cycling keeps the commit ahead of the performer; the
// final press lands within one authored duration of itself.
//
// The invariant pinned here: pressed state converges to the pressed
// layout within a bounded number of driver frames after the last press —
// healthy engine, the filed 15-tile cycle, a mix standing scrubbed at
// 50%, a mid-mix scrub + resume, and a held engine included. The missing
// piece is a pending indication on the chip; that is a design decision
// (see STAGING-REPORT-2493.md), not something this pin invents.
//
// The driver below replicates useVoiceMixDriver's decision order against
// the REAL store (the #1935 pin's pattern); source pins at the end bind
// the replica and the chip wiring to the shipped code.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { useStore } from './store.js';
import { loopClock } from '../gl/loopClock.js';
import { STUB_VOICES, resolveLiveRenderState } from '../data/voices.js';
import { mixCeilingHit } from '../hooks/useVoiceMixDriver.js';

const S = () => useStore.getState();
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// ── the driver replica (useVoiceMixDriver's decision order, verbatim) ──
let heldTicks = 0;
const HELD_CUT_TICKS = 20;
function driverStep() {
  const s = S();
  const mix = s.voiceMix;
  if (!mix || !mix.auto) {
    heldTicks = 0;
    return 'idle';
  }
  if (!s.running && mix.t <= 0) {
    if (++heldTicks >= HELD_CUT_TICKS) {
      s.commitVoiceMix();
      return 'commit-held-cut';
    }
    return 'held-wait';
  }
  heldTicks = 0;
  const nowMs = loopClock.ms > 0 ? loopClock.ms : mix.startedAt;
  const t = Math.min(1, Math.max(0, nowMs - mix.startedAt) / mix.durationMs);
  if (t >= 1) {
    s.commitVoiceMix();
    return 'commit-complete';
  }
  if (s.running && mixCeilingHit(mix, loopClock.presentedMs)) {
    s.commitVoiceMix();
    return 'commit-ceiling';
  }
  s.advanceVoiceMix(t);
  return 'advance';
}
function present(frames, wallDtMs = 50, simDtMs = 50) {
  const out = [];
  for (let i = 0; i < frames; i++) {
    loopClock.ms += simDtMs;
    loopClock.presentedMs += wallDtMs;
    out.push(driverStep());
  }
  return out;
}
function reset() {
  useStore.setState({ voiceMix: null, running: true, lockedParams: {} });
  heldTicks = 0;
  loopClock.ms = 100000;
  loopClock.presentedMs = 500000;
}
function commitMode(id) {
  reset();
  if (S().layoutParams.mode !== id) {
    S().loadStubMode(id);
    assert.ok(S().voiceMix, `commitMode(${id}): a mix opens`);
    S().commitVoiceMix();
  }
  assert.strictEqual(S().layoutParams.mode, id, `commitMode(${id}) lands`);
  reset();
}

// ── 1. A press opens the road synchronously and commits nothing yet ────
ok('press: mix opens toward the target at once; committed mode (the chip) stays on the old layout', () => {
  commitMode('voronoi-cells');
  S().loadStubMode('grid');
  const mix = S().voiceMix;
  assert.ok(mix, 'a layout press opens a MIX synchronously');
  assert.strictEqual(mix.auto, true, 'the layout mix is auto-advancing');
  assert.strictEqual(mix.durationMs, 2000, `authored dissolve is 2000 ms (got ${mix.durationMs})`);
  assert.strictEqual(mix.to.params.mode, 'grid', `mix target is grid (got ${mix.to.params.mode})`);
  assert.strictEqual(mix.targetName, 'grid');
  assert.strictEqual(
    S().layoutParams.mode,
    'voronoi-cells',
    `at press time the committed mode is still voronoi-cells (got ${S().layoutParams.mode}) — the filed observation`,
  );
});

// ── 2. The stage is not late: the render state takes the target at t>0 ──
ok('stage: render-effective mode is the target from the first advanced tick, the old mode at t=0', () => {
  const at0 = resolveLiveRenderState(S()).layoutParams.mode;
  assert.strictEqual(at0, 'voronoi-cells', `at t=0 the stage still renders voronoi-cells (got ${at0})`);
  S().advanceVoiceMix(0.001);
  const atEps = resolveLiveRenderState(S()).layoutParams.mode;
  assert.strictEqual(atEps, 'grid', `at t=0.001 the stage already renders grid (got ${atEps})`);
  assert.strictEqual(
    S().layoutParams.mode,
    'voronoi-cells',
    'the committed mode — and so the pressed chip — still names voronoi-cells mid-dissolve',
  );
  S().commitVoiceMix();
});

// ── 3. Healthy engine: convergence at exactly the authored duration ────
ok('convergence (healthy): lands at frame 40 of 50 ms (2000 ms), not one frame earlier', () => {
  commitMode('voronoi-cells');
  S().loadStubMode('grid');
  const first39 = present(39);
  assert.deepStrictEqual(first39, Array(39).fill('advance'), 'no landing before the authored duration');
  assert.strictEqual(S().voiceMix.t, 0.975, `frame 39 blend position is 0.975 (got ${S().voiceMix.t})`);
  assert.strictEqual(S().layoutParams.mode, 'voronoi-cells', 'still uncommitted at frame 39');
  const land = present(1);
  assert.strictEqual(land[0], 'commit-complete', `frame 40 lands by completion (got ${land[0]})`);
  assert.strictEqual(S().voiceMix, null, 'mix settled');
  assert.strictEqual(S().layoutParams.mode, 'grid', 'committed mode converged to the pressed layout');
});

ok('the 50% moment: halfway through the dissolve the chip still names the old layout', () => {
  commitMode('voronoi-cells');
  S().loadStubMode('grid');
  present(20);
  assert.strictEqual(S().voiceMix.t, 0.5, `frame 20 blend position is exactly 0.5 (got ${S().voiceMix.t})`);
  assert.strictEqual(
    S().layoutParams.mode,
    'voronoi-cells',
    'with the mix at 50% the committed mode is still voronoi-cells — the stress session’s standing state',
  );
  present(20);
  assert.strictEqual(S().layoutParams.mode, 'grid', 'and it lands when the dissolve completes');
});

// ── 4. The filed cycle: 15 tiles fast, ending GRID ───────────────────────
ok('filed cycle: 15 rapid presses commit nothing mid-cycle; the last press lands within its own duration', () => {
  commitMode('voronoi-cells');
  const order = STUB_VOICES.map((v) => v.id);
  assert.strictEqual(order.length, 15, `15 layout tiles (got ${order.length})`);
  for (const id of [...order, 'grid']) {
    const committedBefore = S().layoutParams.mode;
    S().loadStubMode(id);
    if (id !== committedBefore) {
      assert.ok(S().voiceMix, `press ${id}: a mix stands`);
      assert.strictEqual(
        S().voiceMix.to.params.mode,
        id,
        `press ${id}: the standing mix targets the pressed tile (got ${S().voiceMix.to.params.mode})`,
      );
    }
    present(6); // 300 ms of sim between presses — inside one 2000 ms dissolve
    assert.strictEqual(
      S().layoutParams.mode,
      'voronoi-cells',
      `no commit lands mid-cycle (after press ${id}, committed is ${S().layoutParams.mode})`,
    );
  }
  let frames = 0;
  let outcome = '';
  while (S().voiceMix && frames < 60) {
    outcome = present(1)[0];
    frames++;
  }
  assert.strictEqual(outcome, 'commit-complete', `the final press lands by completion (got ${outcome})`);
  assert.ok(frames <= 40, `converged ${frames} frames after the last press (bound 40 = one authored duration)`);
  assert.strictEqual(S().layoutParams.mode, 'grid', 'pressed state converged to GRID, the last tile pressed');
});

ok('corollary: pressing the committed tile mid-mix is a no-op — it cannot cancel the in-flight change', () => {
  commitMode('voronoi-cells');
  S().loadStubMode('grid');
  present(10);
  S().loadStubMode('voronoi-cells'); // the tile that still reads [pressed]
  assert.ok(S().voiceMix, 'the in-flight mix survives a press of the committed tile');
  assert.strictEqual(
    S().voiceMix.to.params.mode,
    'grid',
    `the mix still targets grid (got ${S().voiceMix.to.params.mode}) — going back takes a press after the landing, or the MixBar ✕`,
  );
  present(30);
  assert.strictEqual(S().layoutParams.mode, 'grid', 'grid lands anyway');
});

// ── 5. A voice mix at 50%: the scrub hold, and a press through it ───────
ok('scrub hold: a mix scrubbed to 50% never lands on its own (the performer’s hand holds it)', () => {
  commitMode('grid');
  S().loadStubMode('rails');
  S().setVoiceMixT(0.5);
  assert.strictEqual(S().voiceMix.auto, false, 'scrubbing pauses the auto-advance');
  assert.strictEqual(S().voiceMix.t, 0.5, `the mix stands at 0.5 (got ${S().voiceMix.t})`);
  const outcomes = present(200);
  assert.deepStrictEqual(outcomes, Array(200).fill('idle'), 'the driver never touches a scrubbed mix');
  assert.strictEqual(S().layoutParams.mode, 'grid', 'after 200 frames the scrubbed target (rails) has not landed');
  assert.strictEqual(S().voiceMix.t, 0.5, 'the mix still stands at 50% — B19’s observation, lawful under a scrub');
});

ok('a layout press is never held by a standing scrubbed mix: it replaces it and lands', () => {
  // State continues from the previous group: rails mix scrubbed at 0.5.
  assert.ok(S().voiceMix && S().voiceMix.auto === false, 'precondition: the scrubbed mix stands');
  S().loadStubMode('fibonacci');
  const mix = S().voiceMix;
  assert.strictEqual(mix.auto, true, 'the press opens a fresh auto mix');
  assert.strictEqual(mix.to.params.mode, 'fibonacci', `the fresh mix targets fibonacci (got ${mix.to.params.mode})`);
  const outcomes = present(40);
  assert.strictEqual(outcomes[39], 'commit-complete', 'the press lands at its authored duration');
  assert.strictEqual(S().layoutParams.mode, 'fibonacci', 'committed mode converged through the scrub hold');
});

ok('scrub mid-mix + resume: the hold lasts exactly until the resume, then lands inside the remaining duration', () => {
  commitMode('grid');
  S().loadStubMode('orbit');
  present(20);
  assert.strictEqual(S().voiceMix.t, 0.5, `mid-mix at 0.5 (got ${S().voiceMix.t})`);
  S().setVoiceMixT(0.45);
  assert.strictEqual(S().voiceMix.auto, false, 'the scrub pauses the layout’s own mix');
  present(100);
  assert.strictEqual(S().layoutParams.mode, 'grid', 'held: orbit has not landed after 100 frames under the scrub');
  assert.strictEqual(S().voiceMix.t, 0.45, `position held at 0.45 (got ${S().voiceMix.t})`);
  S().resumeVoiceMix();
  let frames = 0;
  let outcome = '';
  while (S().voiceMix && frames < 40) {
    outcome = present(1)[0];
    frames++;
  }
  assert.strictEqual(outcome, 'commit-complete', `resume lands by completion (got ${outcome})`);
  assert.ok(frames <= 23, `landed ${frames} frames after resume (bound 23: remaining 0.55 × 40, +1)`);
  assert.strictEqual(S().layoutParams.mode, 'orbit', 'committed mode converged after the resume');
});

// ── 6. Held engine: the never-started cut, and freeze-holds-dissolve ────
ok('held at t=0: the #806 cut lands the press on the 20th held tick', () => {
  commitMode('grid');
  useStore.setState({ running: false });
  S().loadStubMode('layers');
  assert.strictEqual(S().voiceMix.t, 0, 'the mix opens unstarted while held');
  for (let i = 0; i < 19; i++) assert.strictEqual(driverStep(), 'held-wait', `held tick ${i + 1} waits`);
  assert.strictEqual(driverStep(), 'commit-held-cut', 'the 20th held tick cuts to the target');
  assert.strictEqual(S().layoutParams.mode, 'layers', 'the press landed under the hold');
  useStore.setState({ running: true });
});

ok('held mid-dissolve: the position freezes and the ceiling cannot land it until resume', () => {
  commitMode('grid');
  S().loadStubMode('eden');
  present(10);
  assert.strictEqual(S().voiceMix.t, 0.25, `in flight at 0.25 (got ${S().voiceMix.t})`);
  useStore.setState({ running: false });
  loopClock.presentedMs += 60000; // even a presented clock far past the ceiling…
  for (let i = 0; i < 200; i++)
    assert.strictEqual(driverStep(), 'advance', 'held steps only re-advance to the frozen t');
  assert.strictEqual(S().voiceMix.t, 0.25, 'freeze-holds-dissolve: position unchanged across 200 held steps');
  assert.strictEqual(S().layoutParams.mode, 'grid', 'no landing while held');
  useStore.setState({ running: true });
  assert.strictEqual(driverStep(), 'commit-ceiling', 'on resume the bounded crawl lands it at once');
  assert.strictEqual(S().layoutParams.mode, 'eden', 'committed mode converged after the hold');
});

// ── 7. Source pins: the chip is the committed mode; the press path ships ──
ok('chip wiring: pressed ⟺ committed layoutParams.mode, and the press path is the one driven above', () => {
  const build = read('../panels/BuildPanel.jsx');
  assert.ok(build.includes('mode={layoutParams.mode}'), 'BuildPanel feeds the tiles the committed mode');
  const tiles = read('../panels/layout/CompositionTiles.jsx');
  assert.ok(tiles.includes('value={mode}'), 'CompositionTiles pass the committed mode as the matrix value');
  assert.ok(tiles.includes('emit(Events.MODE_LOAD, { id })'), 'a tile press emits MODE_LOAD');
  const tea = read('../panels/build/te/TeaMatrix.jsx');
  assert.ok(tea.includes('const selected = id === value;'), 'a tile is selected iff its id is the value');
  assert.ok(tea.includes('aria-pressed={selected}'), 'aria-pressed is that selection, nothing else');
  const wire = read('../composition/wireEventBus.js');
  assert.ok(
    wire.includes('on(Events.MODE_LOAD, (p = {}) => dispatch({ type: A.LOAD_STUB_MODE, id: p.id }))'),
    'MODE_LOAD dispatches LOAD_STUB_MODE',
  );
  const slice = read('./slices/layoutSlice.js');
  assert.ok(
    slice.includes('return openParamsMix(state, merged, { name: stub.name });'),
    'loadStubMode opens the MIX road (it does not switch the mode)',
  );
});

// ── 8. Source pins: the shipped driver keeps the replica’s decision order ──
ok('driver wiring: the shipped hook decides in the order this pin drives', () => {
  const driver = read('../hooks/useVoiceMixDriver.js');
  assert.ok(driver.includes('if (!mix || !mix.auto)'), 'the driver skips a scrubbed (non-auto) mix');
  assert.ok(driver.includes('if (!s.running && mix.t <= 0)'), 'the held branch keys on an unstarted mix');
  assert.ok(driver.includes('HELD_CUT_TICKS = 20'), 'the held cut is 20 ticks');
  assert.ok(driver.includes('if (++heldTicks >= HELD_CUT_TICKS) s.commitVoiceMix();'), 'the held cut commits');
  assert.ok(driver.includes('if (t >= 1)'), 'completion is tested before the ceiling');
  assert.ok(
    driver.includes('if (s.running && mixCeilingHit(mix, loopClock.presentedMs))'),
    'the ceiling is gated on running and reads presented time',
  );
  assert.ok(driver.includes('s.advanceVoiceMix(t);'), 'otherwise the driver advances the blend');
});

console.log(`layoutPress.selfcheck: ok (${n} groups)`);
