// frameLockRemoval.selfcheck.mjs — #2545: the dead 30FPS toggle, removed clean.
//
// THE CLAIM: the 30FPS toggle is gone and nothing misses it. The A21 evidence
// (#2498) proved the toggle wrote a store field (`frameLock`, via
// `setFrameLock`) that nothing read — its consumer died in spine C — and Matt
// ruled removal over re-wiring (2026-11-26). This suite pins the removal so a
// future edit cannot quietly resurrect the control, its state, or its
// registry entry:
//
//   · the live store holds no `frameLock` key and no `setFrameLock` action;
//   · no production source under src/ names the field, the setter, or the
//     registry id (selfchecks are excluded — naming the dead thing is their
//     job), and the two surfaces that carried the label (MasterBar, the
//     registry) carry no `30FPS` text;
//   · the agent UI registry has no `transport.frame-lock` control;
//   · the committed agent-stress baseline no longer enumerates the control
//     (the runner fails a run when a baseline id is missing from the
//     manifest, so a stale entry would read as a break forever);
//   · the surroundings are untouched: the governor fields that sat beside
//     `frameLock` keep their defaults, and the performer's own pause — the
//     RUN/STOP button, driven by the RUN_SET bus event — is a different
//     mechanism and still stands in MasterBar next to the fps meter.
//
// Run: node src/state/frameLockRemoval.selfcheck.mjs

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useStore } from './store.js';
import { UI_CONTROLS, controlById } from '../agentUi/uiRegistry.mjs';
import { Events } from '../composition/eventBus.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');

let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n += 1;
};

// ── the dead state is out of the store ─────────────────────────────────────
{
  const state = useStore.getState();
  ok(!('frameLock' in state), 'store must not hold a frameLock field');
  ok(!('setFrameLock' in state), 'store must not hold a setFrameLock action');
  ok(typeof state.setFrameLock !== 'function', 'setFrameLock must not be callable');
}

// ── nothing in production source references the dead thing ─────────────────
{
  const DEAD = ['frameLock', 'setFrameLock', 'transport.frame-lock'];
  const files = readdirSync(SRC, { recursive: true })
    .filter((f) => /\.(js|jsx|mjs)$/.test(f) && !/\.selfcheck\.mjs$/.test(f))
    .map((f) => path.join(SRC, f));
  ok(files.length > 100, `source scan must cover the tree (saw ${files.length} files)`);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const token of DEAD) {
      ok(!text.includes(token), `${path.relative(SRC, file)} must not reference ${token}`);
    }
  }
  ok(!read('components/MasterBar.jsx').includes('30FPS'), 'MasterBar must not carry the 30FPS toggle label');
  ok(!read('agentUi/uiRegistry.mjs').includes('30FPS'), 'the registry must not carry the 30FPS label');
}

// ── the registry entry is gone ──────────────────────────────────────────────
{
  ok(controlById('transport.frame-lock') === null, 'transport.frame-lock must not resolve in the registry');
  ok(
    UI_CONTROLS.every((c) => !String(c.id).includes('frame-lock')),
    'no registry control id may name frame-lock',
  );
}

// ── the e2e baseline no longer enumerates the control ──────────────────────
{
  const baseline = read('../e2e/agent-stress.baseline.json');
  ok(!baseline.includes('transport.frame-lock'), 'agent-stress baseline must not enumerate transport.frame-lock');
}

// ── the surroundings stand: governor defaults + the performer's pause ─────
{
  const state = useStore.getState();
  ok(state.governorShedFps === 28, `governorShedFps default must stay 28 (saw ${state.governorShedFps})`);
  ok(state.governorRecoverFps === 30, `governorRecoverFps default must stay 30 (saw ${state.governorRecoverFps})`);
  ok(state.displayMaxFps === null, 'displayMaxFps must still boot unmeasured (null)');
  ok(state.running === true, 'the live loop must still boot running — RUN/STOP is untouched');
  ok(typeof Events.RUN_SET === 'string', 'the RUN_SET bus event (the performer pause channel) must exist');
  const bar = read('components/MasterBar.jsx');
  ok(bar.includes('fps-bar'), 'MasterBar must still render the fps meter');
  ok(bar.includes('RUN_SET'), 'MasterBar must still drive the loop through RUN_SET');
  ok(bar.includes('▶ RUN') && bar.includes('■ STOP'), 'MasterBar must still carry the RUN/STOP button');
}

console.log(
  `frameLockRemoval.selfcheck: ${n} checks passed (30FPS toggle, frameLock state and transport.frame-lock entry gone; governor defaults and RUN/STOP untouched)`,
);
