// node src/loot/shelfDiskPort.selfcheck.mjs
//
// #1646 — the disk-export wire speaks its unplanned stops. The runner
// names its planned stops itself (a refused write, a bad read-back);
// anything else that throws inside the check — the planner, the
// serializer, the store update — used to vanish into the port's
// catch-all, leaving a keep un-exported past its bound with no line.
// Pinned here, at the port level: a throwing runner produces ONE
// shelf line per episode, the episode closes when a run completes,
// and a quiet run says nothing.
import assert from 'node:assert/strict';
import { useStore } from '../state/store.js';
import { registerShelfDiskPort, kickShelfExports, clearShelfDiskPort } from './shelfDiskPort.mjs';

let checks = 0;
const ok = (name) => { checks += 1; console.log(`  [ok] ${name}`); };
const notice = () => useStore.getState().shelfNotice;
const LINE = 'export check stopped early — a keep may be waiting to move to the disk; nothing was half-moved';
const boom = async () => { throw new Error('planner exploded'); };
const quiet = async () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A kick is swallowed while another is in flight — and registering
// the port starts one (the real runner, whose own store writes can
// re-trigger the watch). runWith retries until the runner actually
// runs, so every assertion below drives the runner it names. Inside
// the blocks nothing changes the watch key, so no stray kick can
// land between an assertion's steps.
const runWith = async (fn) => {
  for (;;) {
    let ran = false;
    await kickShelfExports(async (...a) => { ran = true; return fn(...a); });
    if (ran) return;
    await sleep(10);
  }
};

registerShelfDiskPort({}, '/nowhere'); // arms the port + its watch
await runWith(quiet); // settle: the registration era's kicks have drained
await sleep(30);
await runWith(quiet); // and a completed run closed any episode they opened
useStore.getState().setShelfNotice(null);

// ── a throwing runner names the stop, once per episode ──
{
  await runWith(boom);
  assert.equal(notice(), LINE, 'the unplanned stop is on the shelf line');
  useStore.getState().setShelfNotice(null); // the performer dismisses it
  await runWith(boom);
  assert.equal(notice(), null, 'the same episode does not speak twice');
  ok('a throwing runner produces one line per episode');
}

// ── a completed run closes the episode ──
{
  await runWith(quiet);
  await runWith(boom);
  assert.equal(notice(), LINE, 'after a clean run, a new stop speaks again');
  ok('a completed run closes the episode');
}

// ── a quiet run says nothing ──
{
  useStore.getState().setShelfNotice(null);
  await runWith(quiet);
  assert.equal(notice(), null, 'no stop, no line');
  ok('a quiet run stays quiet');
}

clearShelfDiskPort();
console.log(`shelfDiskPort.selfcheck: ${checks} checks passed`);
