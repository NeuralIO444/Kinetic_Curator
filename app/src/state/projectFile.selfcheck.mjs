// node src/state/projectFile.selfcheck.mjs
// #1709 — the .kcproject session file and the project manifest (Matt's ruling on #1567: versioned from day one,
// migrated forward on open, never written older, a newer app's file refused plainly). Pins: a written session file is
// kcproject/1 and reads back to the same composition through parseProject; the pre-folder browser autosave envelope
// and a bare document migrate forward (version 0 → 1) and say so; a newer format — or a newer composition inside — is
// refused with `newer`, and reading leaves the text untouched; junk is refused, never thrown; the writer refuses bad
// input rather than writing a file it could not read back; the manifest round-trips and refuses a newer one.
import assert from 'node:assert/strict';
import {
  readSessionFile,
  writeSessionFile,
  readManifest,
  writeManifest,
  isProjectId,
  KCPROJECT_VERSION,
  MIGRATIONS,
  MANIFEST_FILE,
} from './projectFile.mjs';
import { serializeProject, parseProject, PROJECT_VERSION } from './projectDocument.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const doc = serializeProject({
  seed: 0x1709,
  paletteId: 'praystation',
  layoutParams: { mode: 'grid', count: 90 },
  enabledAssets: {},
  quality: 'performance',
});
const ID = 'proj_0123456789';
const AT = '2026-10-27T12:00:00.000Z';
const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

ok('a written session file is kcproject/1 and reads back to the same composition', () => {
  assert.equal(KCPROJECT_VERSION, 1);
  const text = writeSessionFile({ doc, projectId: ID, session: 3, savedAt: AT, appVersion: '0.9.0' });
  assert.ok(text.endsWith('\n'));
  const env = JSON.parse(text);
  assert.equal(env.format, 'kcproject/1');
  assert.equal(env.session, 3);
  const r = readSessionFile(text);
  assert.equal(r.ok, true, r.error);
  same(r.doc, parseProject(doc).doc);
  assert.deepEqual(r.meta, {
    version: 1,
    migratedFrom: null,
    savedAt: AT,
    projectId: ID,
    session: 3,
    app: { version: '0.9.0' },
  });
});

ok('version 0 — the browser autosave envelope and a bare document — migrate forward and say so', () => {
  const envelope = JSON.stringify({ version: PROJECT_VERSION, savedAt: AT, doc });
  const a = readSessionFile(envelope);
  assert.equal(a.ok, true, a.error);
  assert.equal(a.meta.migratedFrom, 0);
  assert.equal(a.meta.version, 0);
  assert.equal(a.meta.savedAt, AT);
  assert.equal(a.meta.projectId, null, 'no project yet: the session that adopts it supplies one');
  same(a.doc, parseProject(doc).doc);
  const b = readSessionFile(JSON.stringify(doc));
  assert.equal(b.ok, true, b.error);
  assert.equal(b.meta.migratedFrom, 0);
  same(b.doc, a.doc);
  // every version below current has a step (the table is the only way forward)
  for (let v = 0; v < KCPROJECT_VERSION; v++) assert.equal(typeof MIGRATIONS[v], 'function', `step ${v} → ${v + 1}`);
  // what it writes next is the CURRENT version
  const rewritten = writeSessionFile({ doc: a.doc, projectId: ID, session: 1, savedAt: AT });
  assert.equal(JSON.parse(rewritten).format, `kcproject/${KCPROJECT_VERSION}`);
});

ok('a newer app’s file is refused plainly, and reading never changes the text', () => {
  const text = JSON.stringify({ format: 'kcproject/2', savedAt: AT, projectId: ID, session: 1, doc, future: [1, 2] });
  const before = text.slice();
  const r = readSessionFile(text);
  assert.equal(r.ok, false);
  assert.equal(r.newer, true);
  assert.equal(r.found, 2);
  assert.match(r.error, /newer version of KC-1/);
  assert.equal(text, before);
  // a current envelope around a composition from a newer app is a newer file too
  const inner = readSessionFile(
    JSON.stringify({ format: 'kcproject/1', savedAt: AT, projectId: ID, session: 1, doc: { ...doc, version: 9 } }),
  );
  assert.equal(inner.ok, false);
  assert.equal(inner.newer, true);
  assert.match(inner.error, /document v9/);
});

ok('junk is refused, never thrown', () => {
  for (const bad of [
    '',
    '{',
    'null',
    '[]',
    '42',
    JSON.stringify({ format: 'kcproject' }),
    JSON.stringify({ format: 'nope/1', doc }),
    JSON.stringify({ format: 7, doc }),
    JSON.stringify({ format: 'kcproject/1', savedAt: AT }),
    JSON.stringify({ format: 'kcproject/1', doc: { version: 1, seed: 'zzz' } }),
  ]) {
    const r = readSessionFile(bad);
    assert.equal(r.ok, false, bad);
    assert.equal(typeof r.error, 'string');
    assert.notEqual(r.newer, true, `${bad} is not a newer file`);
  }
  // a hand-edited envelope with junk metadata keeps the composition and drops the junk
  const r = readSessionFile(JSON.stringify({ format: 'kcproject/1', projectId: 'x', session: -2, app: 5, doc }));
  assert.equal(r.ok, true);
  assert.deepEqual([r.meta.projectId, r.meta.session, r.meta.app, r.meta.savedAt], [null, null, null, null]);
});

ok('the writer refuses input it could not read back', () => {
  const good = { doc, projectId: ID, session: 1, savedAt: AT };
  for (const bad of [
    { ...good, doc: null },
    { ...good, projectId: 'short' },
    { ...good, projectId: 'has space in it' },
    { ...good, session: 0 },
    { ...good, session: 1.5 },
    { ...good, savedAt: 1700000000000 },
  ])
    assert.throws(() => writeSessionFile(bad));
  assert.ok(isProjectId('abcdefgh') && isProjectId('A-b_9'.repeat(4)) && !isProjectId('a'.repeat(65)));
});

ok('the manifest round-trips, and a newer one is refused', () => {
  assert.equal(MANIFEST_FILE, 'project.kc.json');
  const text = writeManifest({ projectId: ID, name: 'Night Migration', createdAt: AT });
  const r = readManifest(text);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.manifest, { projectId: ID, name: 'Night Migration', createdAt: AT });
  const newer = readManifest(JSON.stringify({ ...JSON.parse(text), v: 2 }));
  assert.equal(newer.ok, false);
  assert.equal(newer.newer, true);
  for (const bad of [
    '{',
    '{}',
    JSON.stringify({ kind: 'kc-project', v: 1, projectId: ID }),
    JSON.stringify({ kind: 'x', v: 1 }),
  ])
    assert.equal(readManifest(bad).ok, false, bad);
  assert.throws(() => writeManifest({ projectId: ID, name: '', createdAt: AT }));
});

console.log(
  `projectFile.selfcheck: ${n} checks passed (#1709 — kcproject/${KCPROJECT_VERSION}, migrated forward, newer refused)`,
);
