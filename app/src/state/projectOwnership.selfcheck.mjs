// node src/state/projectOwnership.selfcheck.mjs
// #1711 (PR-2) — two windows, one project. The first window owns the project and holds autosave; a second window on
// the same folder opens READ-ONLY — it can watch and perform, it never writes (no save, no new session, no rename,
// no takes into the folder: every write path runs through the session). Ownership is an honest signal: the status
// carries readOnly, a takeover is reported in the open result, and a window that loses its lock steps down on its
// next heartbeat instead of writing over the new owner. Release is a written marker (nothing deletes a file).
import assert from 'node:assert/strict';
import { createProjectSession, READONLY_LINE } from './projectSession.mjs';
import { createMemoryProjectFs } from './projectFs.mjs';
import { serializeProject } from './projectDocument.js';
import {
  LOCK_FILE,
  LOCK_STALE_MS,
  writeLock,
  readLock,
  lockIsStale,
  lockHeldByOther,
} from '../project/projectLock.mjs';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const docOf = (seed) =>
  serializeProject({ seed, paletteId: 'praystation', layoutParams: { mode: 'grid' }, enabledAssets: {} });
const P = '/Users/m/Projects';
let ids = 0;
const mintId = () => `proj_test_${String(++ids).padStart(4, '0')}`;
/** A clock that starts at `start` and advances `step` ms per call. */
const clock = (start, step = 1000) => {
  let t = Date.parse(start);
  return () => {
    t += step;
    return new Date(t).toISOString();
  };
};
const T0 = '2026-11-21T12:00:00.000Z';
const mk = (fs, now, instanceId) => createProjectSession({ fs, now, mintId, appVersion: 'test', instanceId });

await ok('the lock itself: round trip, corrupt reads as no lock, staleness is the named window', () => {
  const text = writeLock({ projectId: 'proj_x', owner: 'win-a', at: T0 });
  const r = readLock(text);
  assert.equal(r.ok, true);
  assert.deepEqual([r.lock.owner, r.lock.released], ['win-a', false]);
  assert.equal(readLock('not json').ok, false);
  assert.equal(readLock('{"kind":"other"}').ok, false);
  const at = (ms) => new Date(Date.parse(T0) + ms).toISOString();
  assert.equal(lockIsStale(r.lock, at(LOCK_STALE_MS)), false, 'exactly at the window: still held');
  assert.equal(lockIsStale(r.lock, at(LOCK_STALE_MS + 1)), true, 'past it: stale');
  assert.equal(lockHeldByOther(r.lock, 'win-b', at(5000)), true);
  assert.equal(lockHeldByOther(r.lock, 'win-a', at(5000)), false, 'our own lock is not "another window"');
  assert.equal(lockHeldByOther({ ...r.lock, released: true }, 'win-b', at(5000)), false, 'a released lock is free');
});

await ok('second window opens read-only and never writes; the owner is untouched', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const a = mk(fs, clock(T0), 'win-a');
  const c = await a.create({ parent: P, name: 'Duet', doc: docOf(1) });
  assert.equal(c.ok, true, c.reason);
  assert.equal(a.status().readOnly, false);

  const b = mk(fs, clock(T0), 'win-b');
  const o = await b.open(c.root);
  assert.equal(o.ok, true, o.reason);
  assert.deepEqual(
    [o.readOnly, b.status().readOnly],
    [true, true],
    'the second window is read-only, and its status says so',
  );
  const writesBefore = fs.writes.length;
  for (const attempt of [() => b.save(docOf(2)), () => b.newSession(docOf(2)), () => b.rename('Stolen')]) {
    const r = await attempt();
    assert.deepEqual([r.ok, r.readOnly, r.reason], [false, true, READONLY_LINE], 'every write path refuses, plainly');
  }
  assert.equal(fs.writes.length, writesBefore, 'not one write reached the folder');
  assert.equal((await a.save(docOf(3))).ok, true, 'the owner keeps saving');
  assert.equal((await a.heartbeat()).ok, true, 'the owner heartbeats');

  await b.close();
  const lock = readLock(fs.files()[`${c.root}/${LOCK_FILE}`]);
  assert.equal(lock.lock.owner, 'win-a', 'a read-only close never releases the owner\u2019s lock');
  const cWin = mk(fs, clock(T0), 'win-c');
  assert.equal((await cWin.open(c.root)).readOnly, true, 'a third window is read-only too while the owner lives');
});

await ok('a clean close releases: the next window owns at once, no takeover to report', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const a = mk(fs, clock(T0), 'win-a');
  const c = await a.create({ parent: P, name: 'Solo', doc: docOf(1) });
  await a.close();
  const lock = readLock(fs.files()[`${c.root}/${LOCK_FILE}`]);
  assert.equal(lock.lock.released, true, 'the close wrote the release (nothing deletes a file)');
  const b = mk(fs, clock(T0), 'win-b');
  const o = await b.open(c.root);
  assert.deepEqual([o.readOnly, o.tookOver], [false, false], 'owns immediately, nothing to take over');
  assert.equal((await b.save(docOf(2))).ok, true);
});

await ok('a crashed window: after the stale window the next open takes over — and says so', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const a = mk(fs, clock(T0), 'win-a');
  const c = await a.create({ parent: P, name: 'Crash', doc: docOf(1) });
  // win-a vanishes: no close, no heartbeat ever again
  const late = clock(new Date(Date.parse(T0) + LOCK_STALE_MS + 60_000).toISOString());
  const b = mk(fs, late, 'win-b');
  const o = await b.open(c.root);
  assert.deepEqual([o.readOnly, o.tookOver], [false, true], 'the takeover is reported in the open result');
  assert.equal((await b.save(docOf(2))).ok, true, 'the new owner writes');
  const lost = await a.heartbeat();
  assert.deepEqual([lost.ok, lost.lost], [false, true], 'the old window learns on its heartbeat and steps down');
  assert.equal(a.status().readOnly, true);
  const r = await a.save(docOf(9));
  assert.deepEqual([r.ok, r.readOnly], [false, true], 'and it never writes again');
});

console.log(
  `projectOwnership.selfcheck: ${n} checks passed (#1711 PR-2 — ownership: first window owns, second reads only)`,
);
