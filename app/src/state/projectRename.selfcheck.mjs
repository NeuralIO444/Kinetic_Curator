// node src/state/projectRename.selfcheck.mjs
// #1711 — rename the open project, on the memory backend. One name, one truth: the folder, the manifest and every
// session file take the new name together, the open session keeps saving (into the renamed session file), and the
// project reopens under its new name with its sessions intact. Refusals: a collision in the parent, the name it
// already has, an invalid name, a rename while paused. Plus the fs op it rests on (rename a file inside the project).
import assert from 'node:assert/strict';
import { createProjectSession, SESSIONS_DIR, PAUSED_LINE } from './projectSession.mjs';
import { createMemoryProjectFs } from './projectFs.mjs';
import { serializeProject, parseProject } from './projectDocument.js';
import { MANIFEST_FILE, readManifest } from './projectFile.mjs';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const docOf = (seed) =>
  serializeProject({ seed, paletteId: 'praystation', layoutParams: { mode: 'grid' }, enabledAssets: {} });
const norm = (d) => JSON.parse(JSON.stringify(parseProject(d).doc));
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 21, 12, 0, tick++)).toISOString();
let ids = 0;
const mintId = () => `proj_test_${String(++ids).padStart(4, '0')}`;
const P = '/Users/m/Projects';
const mk = (fs) => createProjectSession({ fs, now, mintId, appVersion: 'test' });

await ok('fs.rename moves a file inside the project and refuses the rest', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const { path } = await fs.makeFolder(P, 'KC1_Loot_X');
  await fs.makeSubfolder(path, 'sessions');
  await fs.write(path, 'sessions/X_01.kcproject', 'one', { create: true });
  assert.equal((await fs.rename(path, 'sessions/X_01.kcproject', 'sessions/Y_01.kcproject')).ok, true);
  assert.equal((await fs.read(path, 'sessions/Y_01.kcproject')).text, 'one');
  assert.equal((await fs.read(path, 'sessions/X_01.kcproject')).ok, false);
  await fs.write(path, 'sessions/Y_02.kcproject', 'two', { create: true });
  const clash = await fs.rename(path, 'sessions/Y_01.kcproject', 'sessions/Y_02.kcproject');
  assert.deepEqual([clash.ok, clash.exists], [false, true], 'an existing target is refused');
  assert.equal((await fs.rename(path, 'sessions/nope', 'sessions/Z_01.kcproject')).ok, false, 'no such file');
  assert.equal((await fs.rename(path, '../escape', 'sessions/Z_01.kcproject')).ok, false, 'nothing leaves the project');
  assert.equal((await fs.rename(path, 'sessions', 'sessions2')).ok, false, 'a folder is not renamed by the file op');
});

await ok('rename: folder, manifest and session files take the new name; the session keeps saving', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const s = mk(fs);
  const c = await s.create({ parent: P, name: 'First', doc: docOf(1) });
  assert.equal(c.ok, true, c.reason);
  await s.newSession(docOf(2));
  const before = fs.files()[`${c.root}/${MANIFEST_FILE}`];
  const createdAt = readManifest(before).manifest.createdAt;

  const r = await s.rename('Second');
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.root, `${P}/KC1_Loot_Second`);
  assert.equal(s.status().name, 'Second');
  const files = fs.files();
  assert.ok(files[`${r.root}/sessions/Second_01.kcproject`], 'session 01 renamed');
  assert.ok(files[`${r.root}/sessions/Second_02.kcproject`], 'session 02 renamed');
  assert.ok(!Object.keys(files).some((f) => f.includes('KC1_Loot_First')), 'nothing left under the old name');
  const m = readManifest(files[`${r.root}/${MANIFEST_FILE}`]);
  assert.equal(m.manifest.name, 'Second', 'the manifest follows');
  assert.equal(m.manifest.createdAt, createdAt, 'identity preserved: same project, same birthday');
  assert.equal(m.manifest.projectId, readManifest(before).manifest.projectId);

  assert.equal((await s.save(docOf(3))).ok, true, 'the open session keeps saving after the rename');
  await s.close();
  const o = await s.open(r.root);
  assert.equal(o.ok, true, o.reason);
  assert.equal(o.session, 2);
  assert.deepEqual(norm(o.doc), norm(docOf(3)), 'the renamed project reopens with its latest session');
});

await ok('refusals: the name it already has, a collision, an invalid name — nothing moves', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const s = mk(fs);
  const c = await s.create({ parent: P, name: 'Mine', doc: docOf(1) });
  await fs.makeFolder(P, 'KC1_Loot_Theirs');
  assert.equal((await s.rename('Mine')).ok, false, 'its own name');
  const clash = await s.rename('Theirs');
  assert.deepEqual([clash.ok, clash.exists], [false, true], 'a sibling with that name refuses');
  assert.equal((await s.rename('bad/name')).ok, false, 'an invalid name refuses');
  assert.equal(s.status().root, c.root, 'nothing moved');
  assert.ok(fs.files()[`${c.root}/sessions/Mine_01.kcproject`], 'the session file stands');
});

await ok('sessions under both old names landing on one file refuse the rename whole', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const s = mk(fs);
  const c = await s.create({ parent: P, name: 'Alpha', doc: docOf(1) });
  await s.close();
  await fs.renameFolder(c.root, 'KC1_Loot_Beta'); // renamed outside KC-1: folder name wins, manifest still says Alpha
  const o = await s.open(`${P}/KC1_Loot_Beta`);
  assert.equal(o.ok, true, o.reason);
  assert.equal((await s.save(docOf(2))).ok, true, 'the save writes session 01 under the folder name');
  const files = Object.keys(fs.files());
  assert.ok(files.some((f) => f.endsWith('Alpha_01.kcproject')) && files.some((f) => f.endsWith('Beta_01.kcproject')));
  const r = await s.rename('Gamma');
  assert.equal(r.ok, false, 'both _01 files would land on Gamma_01');
  assert.equal(s.status().name, 'Beta', 'nothing was renamed');
  assert.ok(fs.files()[`${P}/KC1_Loot_Beta/sessions/Beta_01.kcproject`]);
});

await ok('while paused, rename refuses and pause-and-protect holds', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const s = mk(fs);
  const c = await s.create({ parent: P, name: 'Held', doc: docOf(1) });
  fs.detach(c.root);
  assert.equal((await s.save(docOf(2))).paused, true);
  const r = await s.rename('Moved');
  assert.deepEqual([r.ok, r.paused, r.reason], [false, true, PAUSED_LINE]);
  fs.attach(c.root);
  assert.equal((await s.resume()).ok, true);
  assert.equal((await s.rename('Moved')).ok, true, 'back from pause, the rename runs');
});

console.log(`projectRename.selfcheck: ${n} checks passed (#1711 — rename: one name, one truth)`);
