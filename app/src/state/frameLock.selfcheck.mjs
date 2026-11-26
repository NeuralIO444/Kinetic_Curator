// frameLock.selfcheck.mjs — the 30FPS toggle is a dead control (#2498, A21).
//
// The report: bottom bar → 30FPS on. After: the fps readout still showed
// 60.0. "The toggle may gate only the UI life tick, but nothing in the
// readout changes, so the user cannot tell it did anything."
//
// Verdict on this tree (shape (i) — dead control; fix STOPPED for Matt's
// ruling, see STAGING-REPORT-2498.md): the toggle's write path is intact
// end to end — MasterBar's button calls setFrameLock(!frameLock), the
// setter flips store.frameLock, and that is the toggle's TOTAL causal
// reach. No production code reads frameLock outside the button's own
// label and the agent-UI registry's declaration. The one consumer it ever
// had — useCanvasLife's React life tick, gated at FRAME_LOCK_MS in #182 —
// was deleted by spine C (#389) when the GL liveLoop took over the clock;
// the toggle, field, setter, and the registry's "Locks the frame rate to
// 30 fps." promise survived it. There is no rate-cap machinery anywhere
// on this tree for a consumer to have used instead.
//
// The readout is honest about what it measures and structurally cannot
// reflect the toggle: useFpsMeter counts its OWN rAF callbacks over
// >=250 ms windows and publishes fpsFromCount(frames, elapsed) — a pure
// function of a count and a window (group C). Even the designated-writer
// cap spec'd in the staging report would not move this readout until the
// meter counts presented frames; the spec names that second half too.
//
// What this pin holds, so the verdict cannot silently rot:
//   A store      setFrameLock flips exactly one key, frameLock, and
//                nothing else in the store moves (measured by diff).
//   B census     the set of production files under src/ that mention
//                frameLock is EXACTLY the writer set {globalSlice,
//                MasterBar, uiRegistry} — no reader exists. The census
//                is textual on purpose: wiring the cap (a reader appears),
//                removing the toggle (a writer disappears), or even a new
//                comment mentioning the field fails here and forces the
//                #2498 verdict to be revisited in the same change.
//   C readout    fpsFromCount's measured arithmetic + arity: the readout
//                derives only from counted frames over elapsed time; the
//                meter's own source never mentions frameLock.
//   D write path the button and the registry still drive the same
//                setter — the deadness is "no reader", never a broken
//                button; if the write path breaks, that is a NEW defect
//                and this pin says so instead of passing quietly.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useStore } from './store.js';
import { fpsFromCount } from '../hooks/fpsMath.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(SRC, p).split(path.sep).join('/');

// A — the store contract, measured by diffing the whole state surface.
ok('A: setFrameLock flips frameLock and moves no other key', () => {
  const st = useStore.getState();
  assert.equal(st.frameLock, false, `frameLock must default false, measured ${st.frameLock}`);
  st.setFrameLock(true);
  const on = useStore.getState();
  assert.equal(on.frameLock, true, `after setFrameLock(true), frameLock measured ${on.frameLock}`);
  assert.equal(on.fps, st.fps, `fps must not move with the toggle: before ${st.fps}, after ${on.fps}`);
  const before = useStore.getState();
  before.setFrameLock(false);
  const after = useStore.getState();
  assert.equal(after.frameLock, false, `after setFrameLock(false), frameLock measured ${after.frameLock}`);
  const snap = { ...after };
  after.setFrameLock(true);
  const moved = Object.keys(useStore.getState()).filter((k) => !Object.is(snap[k], useStore.getState()[k]));
  assert.deepEqual(
    moved,
    ['frameLock'],
    `setFrameLock(true) must move exactly ['frameLock'], measured moved keys ${JSON.stringify(moved)}`,
  );
  useStore.getState().setFrameLock(false); // leave the store as found
});

// B — the consumer census: exactly the writer set mentions the field.
ok('B: no production reader of frameLock exists (census = writer set only)', () => {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(mjs|js|jsx|ts|tsx)$/.test(name) && !name.includes('.selfcheck.')) {
        if (/\bframeLock\b/.test(readFileSync(p, 'utf8'))) hits.push(rel(p));
      }
    }
  };
  walk(SRC);
  hits.sort();
  const expected = ['agentUi/uiRegistry.mjs', 'components/MasterBar.jsx', 'state/slices/globalSlice.js'];
  assert.deepEqual(
    hits,
    expected,
    `production files mentioning frameLock must be exactly the writer set ${JSON.stringify(expected)}, measured ${JSON.stringify(hits)} — a new mention means the #2498 verdict changed; update STAGING-REPORT-2498.md and this pin together`,
  );
  for (const loopFile of ['gl/liveLoop.mjs', 'gl/liveResolve.mjs', 'engine/particles.js']) {
    assert.ok(
      !hits.includes(loopFile),
      `${loopFile} must not consult frameLock on this tree (the cap is unbuilt), measured census ${JSON.stringify(hits)}`,
    );
  }
});

// C — the readout derives from counted frames over elapsed time, only.
ok('C: fps readout arithmetic is a pure count/window function, toggle-free', () => {
  const cases = [
    [15, 250, 60.0],
    [30, 1000, 30.0],
    [8, 250, 32.0],
    [7, 250, 28.0],
  ];
  for (const [frames, elapsed, want] of cases) {
    const got = fpsFromCount(frames, elapsed);
    assert.equal(got, want, `fpsFromCount(${frames}, ${elapsed}) must be ${want}, measured ${got}`);
  }
  assert.equal(
    fpsFromCount.length,
    2,
    `fpsFromCount must take exactly (frames, elapsedMs) — no store or toggle input — measured arity ${fpsFromCount.length}`,
  );
  const meter = readFileSync(path.join(SRC, 'hooks', 'useFpsMeter.js'), 'utf8');
  assert.ok(
    !/\bframeLock\b/.test(meter),
    'useFpsMeter must not consult frameLock on this tree — the meter counts its own rAF callbacks',
  );
});

// D — the write path's shape: button and registry drive the same setter.
ok('D: the toggle write path (button → setter, registry channel) is intact', () => {
  const bar = readFileSync(path.join(SRC, 'components', 'MasterBar.jsx'), 'utf8');
  assert.ok(
    bar.includes('state.setFrameLock(!frameLock)'),
    'MasterBar 30FPS button must call state.setFrameLock(!frameLock) — if this shape changed, re-derive the write path before trusting group A',
  );
  const registry = readFileSync(path.join(SRC, 'agentUi', 'uiRegistry.mjs'), 'utf8');
  assert.ok(
    registry.includes("ctl('transport.frame-lock'") && registry.includes("store('setFrameLock'"),
    'uiRegistry transport.frame-lock must declare the setFrameLock store channel — the manifest and the button must drive the same setter',
  );
});

console.log(`frameLock.selfcheck: PASS (${n} groups)`);
