// saveTake.selfcheck.mjs — #1938: a take is saved natively on desktop, the browser way elsewhere, and never lost.
//
//   A names     a take's file name cannot leave the takes folder; `.kcperf` is kept
//   B desktop   desktop → bytes written under <appData>/takes via createDir + writeBinaryFile, the path reported, no download
//   C browser   not desktop → the browser download only, no native call, an empty note
//   D failure   a failed native write never loses the take (download as the last try, honest note); nothing throws
//   E doors     empty / wrong-typed / oversize bytes are refused before any native call
import assert from 'node:assert/strict';
import { safeTakeName, saveTake, saveTakeNative, TAKES_DIR, MAX_TAKE_BYTES } from './saveTake.mjs';

// ---- A: names
assert.equal(safeTakeName('take-2026.kcperf'), 'take-2026.kcperf');
assert.equal(safeTakeName('../../etc/passwd'), 'passwd.kcperf', 'no traversal');
assert.equal(safeTakeName('..\\..\\evil.kcperf'), 'evil.kcperf', 'no windows traversal');
assert.equal(safeTakeName('/abs/path/x.kcperf'), 'x.kcperf', 'last segment only');
assert.equal(safeTakeName('a<b>:"c|d?e*.kcperf'), 'a_b___c_d_e_.kcperf', 'reserved characters flattened');
assert.equal(safeTakeName('.hidden'), 'hidden.kcperf', 'no leading dots');
assert.equal(safeTakeName(''), 'take.kcperf');
assert.equal(safeTakeName(null), 'take.kcperf');
assert.equal(safeTakeName('x.KCPERF'), 'x.KCPERF', 'extension case is kept');

const fake = () => {
  const log = { dirs: [], writes: [], downloads: [] };
  return {
    log,
    deps: {
      isDesktop: () => true,
      appDataDir: async () => '/Users/m/Library/Application Support/com.neuralio.kineticcurator',
      join: async (...p) => p.join('/'),
      createDir: async (dir, opt) => void log.dirs.push([dir, opt]),
      writeBinaryFile: async (path, bytes) => void log.writes.push([path, bytes]),
      download: (bytes, name) => void log.downloads.push([bytes, name]),
    },
  };
};
const BYTES = new Uint8Array([31, 139, 8, 0, 1, 2, 3]);

// ---- B: desktop
{
  const { log, deps } = fake();
  const r = await saveTakeNative(BYTES, 'take-1.kcperf', deps);
  assert.equal(r.ok, true);
  assert.equal(r.path, `/Users/m/Library/Application Support/com.neuralio.kineticcurator/${TAKES_DIR}/take-1.kcperf`);
  assert.deepEqual(log.dirs, [
    [`/Users/m/Library/Application Support/com.neuralio.kineticcurator/${TAKES_DIR}`, { recursive: true }],
  ]);
  assert.equal(log.writes.length, 1, 'one native write');
  assert.equal(log.writes[0][0], r.path);
  assert.deepEqual([...log.writes[0][1]], [...BYTES], 'the bytes are written untouched');
  assert.equal(log.downloads.length, 0, 'no synthetic download on desktop');
  const note = await saveTake(BYTES, 'take-2.kcperf', fake().deps);
  assert.match(note, /^saved to .*takes\/take-2\.kcperf$/, 'the note names where it went');
  // a hostile name cannot escape the takes folder
  const { log: l2, deps: d2 } = fake();
  const r2 = await saveTakeNative(BYTES, '../../../.ssh/authorized_keys', d2);
  assert.ok(r2.path.endsWith(`/${TAKES_DIR}/authorized_keys.kcperf`), 'stays in the takes folder');
  assert.equal(l2.writes[0][0], r2.path);
}

// ---- C: browser
{
  const { log, deps } = fake();
  deps.isDesktop = () => false;
  const note = await saveTake(BYTES, 'take-3.kcperf', deps);
  assert.equal(note, '', 'a plain download has nothing to say');
  assert.equal(log.downloads.length, 1, 'the browser download runs');
  assert.equal(log.writes.length + log.dirs.length, 0, 'no native call in a browser');
  const r = await saveTakeNative(BYTES, 'x.kcperf', deps);
  assert.deepEqual(r, { ok: false, reason: 'desktop only' });
}

// ---- D: a failed native write never loses the take
{
  const { log, deps } = fake();
  deps.writeBinaryFile = async () => {
    throw new Error('scope: path not allowed');
  };
  const note = await saveTake(BYTES, 'take-4.kcperf', deps);
  assert.match(note, /could not save the take natively \(scope: path not allowed\)/, 'honest about it');
  assert.equal(log.downloads.length, 1, 'the browser download is the last try');
  assert.deepEqual([...log.downloads[0][0]], [...BYTES]);
  const { deps: d2 } = fake();
  d2.appDataDir = async () => {
    throw 'no app dir';
  };
  assert.equal((await saveTakeNative(BYTES, 'x.kcperf', d2)).ok, false, 'a thrown string is shaped, not thrown');
  const { deps: d3 } = fake();
  d3.createDir = async () => {
    throw new Error('x'.repeat(500));
  };
  assert.ok((await saveTakeNative(BYTES, 'x.kcperf', d3)).reason.length <= 160, 'the reason is capped');
}

// ---- E: doors
{
  const { log, deps } = fake();
  for (const bad of [new Uint8Array(0), null, [1, 2, 3], 'text', new ArrayBuffer(4)]) {
    const r = await saveTakeNative(bad, 'x.kcperf', deps);
    assert.deepEqual(r, { ok: false, reason: 'nothing to save' });
  }
  const big = { length: MAX_TAKE_BYTES + 1 };
  Object.setPrototypeOf(big, Uint8Array.prototype);
  assert.deepEqual(await saveTakeNative(big, 'x.kcperf', deps), { ok: false, reason: 'take too large' });
  assert.equal(log.dirs.length + log.writes.length, 0, 'nothing reached the native side');
}
console.log('saveTake.selfcheck: ok');
