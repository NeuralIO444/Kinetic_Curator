// rollGuard.selfcheck.mjs — a dead roll is dealt again; a living one is left alone (#1107).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { frameHealth, isDeadFrame, DEAD_COVERAGE, DEAD_LUMA_GAP } from './frameHealth.js';
import { createRollGuard, MAX_REDEALS } from './rollGuard.js';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };

// synthetic 40×40 frames
const frame = (bg, ink, share) => {
  const px = new Uint8ClampedArray(40 * 40 * 4); const cut = Math.round(1600 * share);
  for (let i = 0; i < 1600; i++) { const c = i < cut ? ink : bg; px.set([c[0], c[1], c[2], 255], i * 4); }
  return px;
};
const ALIVE = frame([10, 10, 20], [240, 80, 60], 0.3);

await ok('frameHealth: bold ink on a dark ground is alive; empty, pale-on-pale, dark-on-dark and black are dead', () => {
  assert.equal(DEAD_COVERAGE, 0.01); assert.equal(DEAD_LUMA_GAP, 0.15);
  assert.ok(!isDeadFrame(frameHealth(ALIVE)));
  assert.ok(!isDeadFrame(frameHealth(frame([240, 235, 225], [20, 20, 40], 0.2))), 'dark ink on paper is alive');
  assert.ok(isDeadFrame(frameHealth(frame([10, 10, 20], [240, 80, 60], 0))), 'no ink: a flat frame');
  assert.ok(isDeadFrame(frameHealth(frame([10, 10, 20], [240, 80, 60], 0.005))), 'a speck is not a picture');
  assert.ok(isDeadFrame(frameHealth(frame([235, 230, 220], [205, 200, 190], 0.5))), 'pale on pale');
  assert.ok(isDeadFrame(frameHealth(frame([12, 12, 14], [40, 40, 44], 0.5))), 'dark on dark');
  assert.ok(isDeadFrame(frameHealth(new Uint8ClampedArray(40 * 40 * 4))), 'all black');
  assert.ok(isDeadFrame(null) && isDeadFrame(frameHealth(new Uint8ClampedArray(0))), 'no data is not alive');
});

// a fake world: a list of frames the capture will return, one per deal
const world = (frames, { edit = null } = {}) => {
  let dealt = 0; let undone = 0; let captures = 0; let state = { v: 0 }; const log = [];
  const g = createRollGuard({
    settle: async () => {},
    capture: async () => { captures += 1; if (edit && captures === edit.at) state = { v: 99 }; const f = frames[Math.min(dealt, frames.length - 1)]; return f === 'none' ? null : { pixels: f }; },
    unchanged: (b) => b === state,
    redeal: (kind) => { undone += 1; dealt += 1; log.push(kind); state = { v: dealt }; return state; },
  });
  return { g, stats: () => ({ dealt, undone, captures, log }), start: () => state };
};

await ok('a living roll is left alone: no undo, no re-deal', async () => {
  const w = world([ALIVE]); const r = await w.g.check('chaos', w.start());
  assert.deepEqual(r, { redeals: 0, dead: false, cancelled: false }); assert.equal(w.stats().dealt, 0);
});

await ok('a dead roll is undone and dealt again, with its own kind, until one lives', async () => {
  const dead = frame([10, 10, 20], [240, 80, 60], 0);
  const w = world([dead, dead, ALIVE]); const r = await w.g.check('curate', w.start());
  assert.deepEqual(r, { redeals: 2, dead: false, cancelled: false }); assert.deepEqual(w.stats().log, ['curate', 'curate']);
});

await ok('it never loops: after MAX_REDEALS it stops and keeps what it has', async () => {
  const dead = frame([10, 10, 20], [240, 80, 60], 0);
  const w = world([dead]); const r = await w.g.check('chaos', w.start());
  assert.equal(MAX_REDEALS, 3); assert.deepEqual(r, { redeals: 3, dead: true, cancelled: false }); assert.equal(w.stats().dealt, 3);
});

await ok('it never touches what a person did: an edit after the roll cancels the check', async () => {
  const dead = frame([10, 10, 20], [240, 80, 60], 0);
  const w = world([dead], { edit: { at: 1 } }); const r = await w.g.check('chaos', w.start());
  assert.equal(r.cancelled, true); assert.equal(w.stats().dealt, 0);
});

await ok('a newer press cancels the older check (hammering KIN never stacks guards)', async () => {
  const dead = frame([10, 10, 20], [240, 80, 60], 0);
  let release; const gate = new Promise((r) => { release = r; });
  let state = { v: 0 };
  const g = createRollGuard({ settle: () => gate, capture: async () => ({ pixels: dead }), unchanged: (b) => b === state, redeal: () => { state = { v: 1 }; return state; } });
  const first = g.check('chaos', state); const second = g.check('chaos', state);
  release(); const [a, b] = await Promise.all([first, second]);
  assert.equal(a.cancelled, true); assert.equal(b.cancelled, false);
});

await ok('it cannot see (no capture): it trusts the roll; a capture that throws does the same', async () => {
  const w = world(['none']); assert.deepEqual(await w.g.check('chaos', w.start()), { redeals: 0, dead: false, cancelled: false });
  const g = createRollGuard({ settle: async () => {}, capture: async () => { throw new Error('gl lost'); }, unchanged: () => true, redeal: () => assert.fail('must not re-deal') });
  assert.equal((await g.check('chaos', {})).dead, false);
});

await ok('wired: every roll path announces itself, and the hook is mounted before the boot roll', () => {
  const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  assert.match(r('../panels/layout/KineticButton.jsx'), /emit\(Events\.ROLL_GUARD, \{ kind: /);
  assert.match(r('../panels/layout/CuratorBar.jsx'), /emit\(Events\.ROLL_GUARD, \{ kind: 'curate' \}\)/);
  assert.match(r('../hooks/useProjectAutosave.js'), /st\.kineticRoll\(\);\s*\n\s*st\.setRunning\(true\);\s*\n\s*emit\(Events\.ROLL_GUARD, \{ kind: 'chaos' \}\)/);
  const app = r('../App.jsx'); assert.ok(app.indexOf('useRollGuard(glLoopRef)') > 0 && app.indexOf('useRollGuard(glLoopRef)') < app.indexOf('  useProjectAutosave();'));
  const hook = r('../hooks/useRollGuard.js');
  assert.match(hook, /s\.undo\(\)/); assert.match(hook, /chaos: \(s\) => s\.kineticRoll\(\)/); assert.match(hook, /curate: \(s\) => s\.curateUnlocked\(\)/);
});

console.log(`rollGuard.selfcheck: ${n} checks passed`);
