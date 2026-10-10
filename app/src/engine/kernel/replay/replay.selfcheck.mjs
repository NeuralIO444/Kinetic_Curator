// node src/engine/kernel/replay/replay.selfcheck.mjs
// #1313 — the golden harness: replay every checked-in golden and compare
// frame hashes. Same seed + same event log → byte-identical hashes, every
// run, every process. A golden moves ONLY with a KERNEL_VERSION bump (#1247):
// if the kernel drifts, this fails loudly instead of silently.
//
// Cross-hardware: goldens are tagged with the architecture they were
// recorded on. Until deterministic trig (#1240) closes the x64/arm64 gap,
// cross-hardware replay is explicitly OUT OF SCOPE — a mismatched arch
// skips the hash comparison with a loud note, never a silent pass.

import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVENT_TYPES,
  createEventLog,
  appendEvent,
  eventCount,
  eventsAt,
  maxEventFrame,
  sortedEvents,
  serializeEventLog,
  parseEventLog,
  quantizeEnergy,
  EventLogError,
} from './eventLog.js';
import { replay, normalizeRecipe, ReplayError, REPLAY_MODULES } from './replayer.js';
import { KERNEL_VERSION } from '../version.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDENS = join(HERE, 'goldens');

function sha(parts) {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
}

function assertThrows(fn, needle, what) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  assert.ok(err, `${what}: expected a throw`);
  assert.ok(
    String(err && err.message).includes(needle),
    `${what}: error should mention "${needle}" (got: ${err && err.message})`,
  );
}

// ── eventLog unit checks ──────────────────────────────────────────────────
{
  const log = createEventLog();
  assert.strictEqual(eventCount(log), 0);
  appendEvent(log, 0, 'seed', { seed: 7 });
  appendEvent(log, 10, 'pointer', { x: 100, y: 200 });
  appendEvent(log, 10, 'audio-envelope', { energy: 0.123456 }); // quantized on ingest
  appendEvent(log, 5, 'param-set', { params: { damping: 0.9 } });
  assert.strictEqual(eventCount(log), 4);
  assert.strictEqual(maxEventFrame(log), 10);
  const ordered = sortedEvents(log).map((e) => `${e.frame}:${e.type}`);
  assert.deepStrictEqual(ordered, [
    '0:seed',
    '5:param-set',
    '10:pointer',
    '10:audio-envelope',
  ], 'events apply in (frame, seq) order');
  assert.strictEqual(eventsAt(log, 10).length, 2);
  const env = eventsAt(log, 10)[1];
  assert.strictEqual(env.payload.energy, 0.123, 'audio envelope is frame-quantized on ingest');
  assert.strictEqual(quantizeEnergy(0.9999), 1, 'quantize clamps + rounds');
  const clampedLog = createEventLog();
  appendEvent(clampedLog, 0, 'audio-envelope', { energy: 2 });
  assert.strictEqual(eventsAt(clampedLog, 0)[0].payload.energy, 1, 'energy clamps to 1');

  // Fail-closed validation.
  assertThrows(() => appendEvent(log, -1, 'seed', { seed: 1 }), 'non-negative integer', 'negative frame');
  assertThrows(() => appendEvent(log, 1.5, 'seed', { seed: 1 }), 'non-negative integer', 'fractional frame');
  assertThrows(() => appendEvent(log, 0, 'nope', {}), 'unknown event type', 'unknown type');
  assertThrows(() => appendEvent(log, 0, 'seed', { seed: NaN }), 'finite', 'NaN seed');
  assertThrows(() => appendEvent(log, 0, 'pointer', { x: 1, y: Infinity }), 'finite', 'infinite coord');
  assertThrows(
    () => appendEvent(log, 0, 'pointer', { x: 1, y: 2, timestamp: 123 }),
    'wall-clocked',
    'wall-clock key rejected',
  );
  assertThrows(
    () => appendEvent(log, 0, 'pointer', { x: 1, y: 2, dateNow: 123 }),
    'wall-clocked',
    'dateNow rejected',
  );
  assertThrows(() => appendEvent(log, 0, 'seed', { seed: () => 1 }), 'JSON-safe', 'function payload');
  assertThrows(() => appendEvent(log, 0, 'dish-module-toggle', { module: 'x' }), 'boolean', 'toggle needs enabled');
  assert.ok(new EventLogError('x') instanceof Error, 'EventLogError is an Error');

  // Serialize → parse round-trip preserves application order and payloads.
  const rt = parseEventLog(serializeEventLog(log));
  assert.deepStrictEqual(
    sortedEvents(rt).map((e) => [e.frame, e.type, e.payload]),
    sortedEvents(log).map((e) => [e.frame, e.type, e.payload]),
    'serialize/parse round-trip is lossless',
  );
  assertThrows(() => parseEventLog({ version: 999, events: [] }), 'unsupported', 'version gate');
  assertThrows(() => parseEventLog({ version: 1, events: [{ frame: 0, type: 'seed' }] }), 'plain object', 'entry needs payload');
}

// ── replayer contract checks ──────────────────────────────────────────────
{
  assertThrows(() => replay(NaN, createEventLog(), 10), 'finite', 'NaN seed');
  assertThrows(() => replay(1, createEventLog(), 0), 'positive integer', 'zero frames');
  assertThrows(() => normalizeRecipe({ sampler: 'nope' }), 'unknown sampler', 'unknown sampler');
  assertThrows(() => normalizeRecipe({ field: 'nope' }), 'unknown field', 'unknown field');
  assertThrows(() => normalizeRecipe({ params: { nope: 1 } }), 'unknown recipe param', 'unknown param');
  assert.deepStrictEqual(REPLAY_MODULES, ['audio', 'field', 'attractor'], 'module order is pinned');
  assert.deepStrictEqual(
    [...EVENT_TYPES].sort(),
    ['audio-envelope', 'dish-module-toggle', 'param-set', 'pointer', 'recipe-load', 'seed'].sort(),
    'event vocabulary is pinned',
  );
  // Events past the run end are never silently dropped.
  const log = createEventLog();
  appendEvent(log, 500, 'pointer', { x: 1, y: 1 });
  assertThrows(() => replay(1, log, 10), 'never silently dropped', 'event beyond frameCount');
  // Unknown module toggle fails at apply time, not at log time.
  const log2 = createEventLog();
  appendEvent(log2, 0, 'dish-module-toggle', { module: 'nope', enabled: true });
  assertThrows(() => replay(1, log2, 4), 'unknown module', 'unknown module toggle');
  assert.ok(new ReplayError('x') instanceof Error, 'ReplayError is an Error');
}

// ── golden harness ────────────────────────────────────────────────────────
{
  const files = readdirSync(GOLDENS).filter((f) => f.endsWith('.json')).sort();
  assert.ok(files.length >= 3, `expected at least 3 goldens (found ${files.length})`);
  console.log(`replay.selfcheck: ${files.length} goldens`);

  for (const file of files) {
    const fixture = JSON.parse(readFileSync(join(GOLDENS, file), 'utf8'));
    assert.strictEqual(fixture.kernelVersion, KERNEL_VERSION,
      `${fixture.name}: pinned at ${fixture.kernelVersion}, kernel is ${KERNEL_VERSION} — ` +
      'a golden moves ONLY with a KERNEL_VERSION bump (#1247). If the kernel changed ' +
      'behaviour, bump KERNEL_VERSION in kernel/version.js and regenerate the goldens; ' +
      'if it should not have changed, the drift is a bug.');
    assert.ok(Array.isArray(fixture.frameHashes) && fixture.frameHashes.length === fixture.frameCount,
      `${fixture.name}: frameHashes length must equal frameCount`);

    if (fixture.arch !== process.arch) {
      // Documented, not silent: cross-hardware replay is out of scope until #1240.
      console.log(`  ${fixture.name}: SKIP hash compare — recorded on ${fixture.arch}, running on ${process.arch} (cross-hardware replay out of scope until #1240)`);
      continue;
    }

    const run = (snapEvery) => replay(fixture.seed, fixture.eventLog, fixture.frameCount, {
      snapshotEvery: snapEvery,
    });
    const a = run(0);
    assert.deepStrictEqual(a.frameHashes, fixture.frameHashes,
      `${fixture.name}: frame hashes drifted — same seed + same log must give identical bits`);
    // Determinism across runs (separate replay calls = separate sessions).
    const b = run(0);
    assert.deepStrictEqual(b.frameHashes, a.frameHashes,
      `${fixture.name}: two in-process replays diverged`);
    // Snapshots are deterministic too, and land on the right frames.
    const c = run(30);
    assert.deepStrictEqual(c.frameHashes, a.frameHashes, `${fixture.name}: snapshots must not move hashes`);
    assert.ok(c.snapshots.length > 0, `${fixture.name}: expected snapshots`);
    for (const s of c.snapshots) {
      assert.strictEqual(s.frame % 30, 0, `${fixture.name}: snapshot frame alignment`);
      assert.strictEqual(s.count, fixture.recipe.count, `${fixture.name}: snapshot lane count`);
      for (const v of s.columns.x) assert.ok(Number.isFinite(v), `${fixture.name}: snapshot x finite`);
    }
    const d = run(30);
    assert.deepStrictEqual(d.snapshots, c.snapshots, `${fixture.name}: snapshots deterministic`);

    const top = sha(a.frameHashes).slice(0, 16);
    console.log(`  ${fixture.name}: OK — ${fixture.frameCount} frames, ${a.eventCount} events, top ${top}`);
  }
}

console.log('replay.selfcheck: green');
