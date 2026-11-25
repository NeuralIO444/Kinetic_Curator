// node src/panels/pipeline/nativeLab.selfcheck.mjs
// Issue 2490 (session report numbering) — the DEV · NATIVE law: in a browser the native
// controls are disabled + labelled and never reach the IPC bridge; in the desktop app a
// genuine native failure surfaces plain words in the panel while the raw error string is
// recorded in the diagnostic log. Needs no Tauri: every path is driven through injected deps.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createNativeLab,
  recordNativeError,
  getNativeErrors,
  clearNativeErrors,
  nativeErrorLogSize,
  exportNativeErrorLogJSON,
  rawErrorText,
  NATIVE_APP_ONLY_LABEL,
  NATIVE_PLAIN_FAILURES,
  NATIVE_ERROR_LOG_SCHEMA,
  MAX_NATIVE_ERRORS,
} from './nativeLab.mjs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const RAW_IPC = 'window.__TAURI_IPC__ is not a function';
const spyInvoke = (impl) => {
  const calls = [];
  const fn = async (cmd, args) => {
    calls.push({ cmd, args });
    return impl(cmd, args);
  };
  fn.calls = calls;
  return fn;
};
const ALL_METHODS = (lab) => [
  () => lab.testDiskIO([1, 2, 3], '/tmp/x.png'),
  () => lab.metalInit({ width: 1, height: 1, particleCount: 1 }),
  () => lab.metalStep({}, {}),
  () => lab.curatorEval(),
  () => lab.mediaExport({ path: '/tmp/x.mov' }),
  () => lab.ecoreDump({ targetDir: '/tmp/x' }),
];

await ok('browser: every method is unavailable, invoke is never attempted, nothing is logged', async () => {
  clearNativeErrors();
  const invoke = spyInvoke(() => {
    throw new Error('must not be called');
  });
  const lab = createNativeLab({ invoke, isDesktop: () => false });
  assert.equal(lab.available(), false);
  for (const run of ALL_METHODS(lab)) {
    const r = await run();
    assert.equal(r.ok, false);
    assert.equal(r.unavailable, true);
    assert.equal(r.plain, NATIVE_APP_ONLY_LABEL);
  }
  assert.equal(invoke.calls.length, 0, 'no IPC attempt in the browser');
  assert.equal(nativeErrorLogSize(), 0, 'an unavailable call is not a failure and is not logged');
});

await ok('the default factory in node (no window) reports unavailable without touching the bridge', async () => {
  const lab = createNativeLab();
  assert.equal(lab.available(), false, 'node has no Tauri globals');
  const r = await lab.curatorEval();
  assert.equal(r.unavailable, true);
});

await ok('native failure: plain words for the panel, the raw string in the log, per command', async () => {
  clearNativeErrors();
  const invoke = spyInvoke(() => {
    throw new Error(RAW_IPC);
  });
  const lab = createNativeLab({ invoke, isDesktop: () => true });
  const expect = [
    ['test_disk_io', 'write_batch_frame'],
    ['metal_init', 'metal_init'],
    ['metal_step', 'metal_step_boids'],
    ['curator_eval', 'curator_evaluate_frame'],
    ['media_export', 'start_media_engine_export'],
    ['ecore_dump', 'dump_image_batch'],
  ];
  const runs = ALL_METHODS(lab);
  for (let i = 0; i < runs.length; i++) {
    const r = await runs[i]();
    assert.equal(r.ok, false);
    assert.equal(r.unavailable, undefined);
    assert.equal(r.plain, NATIVE_PLAIN_FAILURES[expect[i][0]], `plain words for ${expect[i][0]}`);
    assert.ok(!/TAURI|__/.test(r.plain), 'the panel words carry no raw IPC text');
  }
  const logged = getNativeErrors();
  assert.deepEqual(
    logged.map((e) => e.command),
    expect.map(([, cmd]) => cmd),
    'each failure recorded under its Tauri command (metal pass stops at the first failing command)',
  );
  for (const e of logged) assert.equal(e.raw, RAW_IPC, 'the raw string is in the log, verbatim');
});

await ok(
  'metal pass: a failure in the second command is still the one plain message, logged under that command',
  async () => {
    clearNativeErrors();
    const invoke = spyInvoke((cmd) => {
      if (cmd === 'metal_step_accum') throw new Error(RAW_IPC);
      return {};
    });
    const lab = createNativeLab({ invoke, isDesktop: () => true });
    const r = await lab.metalStep({}, {});
    assert.equal(r.ok, false);
    assert.equal(r.plain, NATIVE_PLAIN_FAILURES.metal_step);
    assert.deepEqual(
      invoke.calls.map((c) => c.cmd),
      ['metal_step_boids', 'metal_step_accum'],
    );
    assert.deepEqual(
      getNativeErrors().map((e) => e.command),
      ['metal_step_accum'],
    );
  },
);

await ok('native success: replies pass through untouched and nothing is logged', async () => {
  clearNativeErrors();
  const stats = { device_name: 'M-test', has_unified_memory: true, frame_counter: 7 };
  const invoke = spyInvoke((cmd) => {
    if (cmd === 'write_batch_frame') return 67;
    if (cmd === 'curator_evaluate_frame') return { score: 0.5, latency_ms: 1.5, compute_units: 'ANE' };
    if (cmd === 'metal_step_accum') return stats;
    return stats;
  });
  const lab = createNativeLab({ invoke, isDesktop: () => true });
  assert.equal(lab.available(), true);
  assert.deepEqual(await lab.testDiskIO([1], '/tmp/x.png'), { ok: true, value: 67 });
  assert.deepEqual(await lab.metalInit({}), { ok: true, value: stats });
  assert.deepEqual(await lab.metalStep({}, {}), { ok: true, value: stats });
  assert.deepEqual(
    invoke.calls.map((c) => c.cmd).slice(-2),
    ['metal_step_boids', 'metal_step_accum'],
    'the pass runs boids then accum, in order',
  );
  assert.equal((await lab.curatorEval()).value.score, 0.5);
  assert.equal(nativeErrorLogSize(), 0);
});

await ok('the log is a bounded ring: oldest dropped, export is schema-shaped JSON', () => {
  clearNativeErrors();
  for (let i = 0; i < MAX_NATIVE_ERRORS + 5; i++) recordNativeError({ command: `cmd_${i}`, raw: new Error(`e${i}`) });
  assert.equal(nativeErrorLogSize(), MAX_NATIVE_ERRORS);
  assert.equal(getNativeErrors()[0].command, 'cmd_5', 'the five oldest were dropped');
  const dump = JSON.parse(exportNativeErrorLogJSON());
  assert.equal(dump.schema, NATIVE_ERROR_LOG_SCHEMA);
  assert.equal(dump.count, MAX_NATIVE_ERRORS);
  assert.equal(dump.capacity, MAX_NATIVE_ERRORS);
  clearNativeErrors();
  assert.equal(nativeErrorLogSize(), 0);
});

await ok('raw error text: any shape becomes one bounded line', () => {
  assert.equal(rawErrorText(new Error('a  b\n c')), 'a b c');
  assert.equal(rawErrorText('plain string'), 'plain string');
  assert.equal(rawErrorText(undefined), 'failed');
  assert.equal(rawErrorText(new Error('x'.repeat(900))).length, 512);
});

await ok('the block itself: shared gate, labelled + disabled controls, no raw error reaches the panel', () => {
  const block = src('./NativeLabBlock.jsx');
  const core = src('./nativeLab.mjs');
  assert.ok(core.includes("from '../../platform/desktop.mjs'"), 'the core gates on the shared desktop check');
  assert.ok(block.includes("from '../../platform/desktop.mjs'"), 'the block reads the same gate for its controls');
  assert.ok(block.includes("from './nativeLab.mjs'"), 'the block calls through the gated core');
  assert.ok(!block.includes('@tauri-apps/api/tauri'), 'no static invoke import left in the block');
  assert.ok(!/err\?\.message|err\.message|\$\{err/.test(block), 'no handler interpolates a raw error any more');
  assert.equal(
    (block.match(/disabled=\{!desktop/g) || []).length,
    6,
    'all six native buttons disable on the gate (media, dump, disk I/O, metal init, metal pass, ANE)',
  );
  assert.ok(block.includes('NATIVE_APP_ONLY_LABEL'), 'the disabled controls carry the ruled label');
  assert.equal(NATIVE_APP_ONLY_LABEL, 'Native app only');
});

console.log(`[selfcheck] nativeLab: OK — ${n} checks (browser gate, plain-words split, bounded raw log)`);
