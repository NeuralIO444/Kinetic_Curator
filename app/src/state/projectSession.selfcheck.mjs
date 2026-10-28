// node src/state/projectSession.selfcheck.mjs
// #1709 — the project-folder core on the memory backend. The issue's done-when, each as a check:
//   · a project is created, saved, closed and reopened from its folder with its sessions intact
//   · an older-version file migrates on open (and the next save writes the current version)
//   · yanking the folder mid-session triggers pause-and-protect with ZERO writes anywhere else, the work held; saving
//     resumes when the folder returns, or when the performer points at its new home (and only if it is this project)
// Plus the rulings it rests on: strict names and refuse-on-collision at create, autosave in place, new session = max+1
// with the old session untouched, a newer file refused and left byte-identical, opening writes nothing.
import assert from 'node:assert/strict';
import { createProjectSession, SESSIONS_DIR, PAUSED_LINE } from './projectSession.mjs';
import { createMemoryProjectFs, isInsideRel } from './projectFs.mjs';
import { serializeProject, parseProject, PROJECT_VERSION } from './projectDocument.js';
import { MANIFEST_FILE } from './projectFile.mjs';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const docOf = (seed, count = 80) =>
  serializeProject({
    seed,
    paletteId: 'praystation',
    layoutParams: { mode: 'grid', count },
    enabledAssets: {},
    quality: 'performance',
  });
const norm = (d) => JSON.parse(JSON.stringify(parseProject(d).doc));
let tick = 0;
const now = () => new Date(Date.UTC(2026, 9, 27, 12, 0, tick++)).toISOString();
let ids = 0;
const mintId = () => `proj_test_${String(++ids).padStart(4, '0')}`;
const P = '/Users/m/Projects';
const mk = (fs) => createProjectSession({ fs, now, mintId, appVersion: 'test' });
const sessionText = (fs, root, file) => fs.files()[`${root}/${SESSIONS_DIR}/${file}`];

await ok('isInsideRel keeps every path inside the project', () => {
  for (const good of ['project.kc.json', 'sessions/a_01.kcproject']) assert.ok(isInsideRel(good), good);
  for (const bad of ['', '/etc/x', '../x', 'sessions/../../x', 'a//b', 'a\\b', './a', 'a/\0'])
    assert.ok(!isInsideRel(bad), bad);
});

await ok('create → save → close → reopen: the folder, the manifest, sessions intact', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const s = mk(fs);
  const c = await s.create({ parent: P, name: 'Night Migration', doc: docOf(1) });
  assert.equal(c.ok, true, c.reason);
  assert.equal(c.root, `${P}/KC1_Loot_Night Migration`);
  assert.equal(c.session, 1);
  assert.ok(fs.files()[`${c.root}/${MANIFEST_FILE}`]);
  assert.ok(sessionText(fs, c.root, 'Night Migration_01.kcproject'));
  assert.equal((await s.save(docOf(2))).ok, true, 'autosave in place');
  assert.equal(Object.keys(fs.files()).length, 2, 'still one manifest and one session: saving rewrites in place');
  assert.equal(s.status().state, 'saved');
  assert.equal((await s.close()).ok, true);
  assert.equal(s.status().state, 'closed');
  const o = await s.open(c.root);
  assert.equal(o.ok, true, o.reason);
  assert.equal(o.session, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(o.doc)), norm(docOf(2)), 'the saved composition comes back');
  assert.equal(o.migratedFrom, null);
});

await ok('create is strict: a bad name or a taken one is refused, nothing is made', async () => {
  const fs = createMemoryProjectFs({ folders: [P, `${P}/kc1_loot_taken`] });
  const s = mk(fs);
  const before = fs.writes.length;
  for (const name of ['a/b', ' lead', 'con', '']) {
    const r = await s.create({ parent: P, name, doc: docOf(1) });
    assert.equal(r.ok, false, name);
  }
  const taken = await s.create({ parent: P, name: 'Taken', doc: docOf(1) });
  assert.equal(taken.ok, false);
  assert.equal(taken.exists, true);
  assert.match(taken.reason, /Pick another name/);
  assert.equal(fs.writes.length, before, 'nothing was written for a refused name');
  assert.equal((await s.create({ parent: '/nowhere', name: 'x1', doc: docOf(1) })).ok, false);
});

await ok('new session: max+1, gaps never reused, the old session left exactly as it was', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const s = mk(fs);
  const { root } = await s.create({ parent: P, name: 'Moths', doc: docOf(1) });
  await s.save(docOf(2));
  const frozen = sessionText(fs, root, 'Moths_01.kcproject');
  const a = await s.newSession(docOf(3));
  assert.deepEqual([a.ok, a.session], [true, 2]);
  await s.save(docOf(4));
  assert.equal(sessionText(fs, root, 'Moths_01.kcproject'), frozen, 'session 01 never changes after the branch');
  // a gap (someone deleted _03 by hand, or a later session exists): max+1, never the gap
  const files = fs.files();
  files[`${root}/${SESSIONS_DIR}/Moths_05.kcproject`] = files[`${root}/${SESSIONS_DIR}/Moths_01.kcproject`];
  const fs2 = createMemoryProjectFs({ folders: [P], files });
  const s2 = mk(fs2);
  const o = await s2.open(root);
  assert.equal(o.session, 5, 'open takes the latest session');
  const b = await s2.newSession(docOf(6));
  assert.equal(b.session, 6);
});

await ok('opening writes nothing — the first write is the first save asked for', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const s = mk(fs);
  const { root } = await s.create({ parent: P, name: 'Quiet', doc: docOf(1) });
  await s.close();
  const before = fs.writes.length;
  const snap = JSON.stringify(fs.files());
  await s.open(root);
  assert.equal(fs.writes.length, before);
  assert.equal(JSON.stringify(fs.files()), snap);
});

await ok('an older file migrates on open; the next save writes the current version', async () => {
  const root = `${P}/KC1_Loot_Old`;
  const fs = createMemoryProjectFs({
    folders: [P, root, `${root}/${SESSIONS_DIR}`],
    files: {
      [`${root}/${MANIFEST_FILE}`]: JSON.stringify({
        kind: 'kc-project',
        v: 1,
        projectId: 'proj_old_0001',
        name: 'Old',
      }),
      // version 0: the pre-folder browser autosave envelope
      [`${root}/${SESSIONS_DIR}/Old_01.kcproject`]: JSON.stringify({
        version: PROJECT_VERSION,
        savedAt: 'x',
        doc: docOf(7),
      }),
    },
  });
  const s = mk(fs);
  const o = await s.open(root);
  assert.equal(o.ok, true, o.reason);
  assert.equal(o.migratedFrom, 0);
  await s.save(o.doc);
  const env = JSON.parse(sessionText(fs, root, 'Old_01.kcproject'));
  assert.equal(env.format, 'kcproject/1');
  assert.equal(env.projectId, 'proj_old_0001');
});

await ok('a newer file is refused plainly and left byte-identical', async () => {
  const root = `${P}/KC1_Loot_Future`;
  const future = JSON.stringify({ format: 'kcproject/3', projectId: 'proj_future01', session: 1, doc: docOf(1) });
  const fs = createMemoryProjectFs({
    folders: [P, root, `${root}/${SESSIONS_DIR}`],
    files: {
      [`${root}/${MANIFEST_FILE}`]: JSON.stringify({
        kind: 'kc-project',
        v: 1,
        projectId: 'proj_future01',
        name: 'Future',
      }),
      [`${root}/${SESSIONS_DIR}/Future_01.kcproject`]: future,
    },
  });
  const s = mk(fs);
  const o = await s.open(root);
  assert.equal(o.ok, false);
  assert.equal(o.newer, true);
  assert.match(o.reason, /newer version of KC-1/);
  assert.equal(sessionText(fs, root, 'Future_01.kcproject'), future);
  assert.equal(fs.writes.length, 0);
  assert.equal((await s.save(docOf(2))).ok, false, 'nothing is open, nothing can be saved over it');
});

await ok(
  'the folder is yanked mid-session: pause and protect — zero writes elsewhere, work held, resumes on return',
  async () => {
    const fs = createMemoryProjectFs({ folders: [P] });
    const s = mk(fs);
    const seen = [];
    s.subscribe((st) => seen.push(st.state));
    const { root } = await s.create({ parent: P, name: 'Yank', doc: docOf(1) });
    const before = JSON.stringify(fs.files());
    fs.detach(root); // unplugged
    const r = await s.save(docOf(2));
    assert.deepEqual([r.ok, r.paused], [false, true]);
    assert.equal(s.status().state, 'paused');
    assert.equal(s.status().reason, PAUSED_LINE);
    assert.equal(s.status().held, true, 'the session is held in memory');
    assert.equal((await s.save(docOf(3))).paused, true, 'later saves only update what is held');
    assert.equal((await s.newSession(docOf(3))).paused, true, 'no new session while paused');
    assert.equal((await s.close()).ok, false, 'closing would lose the held work: refused');
    // nothing landed anywhere: no write succeeded, and every attempted write was inside the project root
    assert.equal(JSON.stringify(fs.files()), before);
    for (const w of fs.writes) assert.ok(w.path.startsWith(root), `a write went outside the project: ${w.path}`);
    assert.equal((await s.resume()).ok, false, 'still gone: still paused');
    fs.attach(root); // back
    const back = await s.resume();
    assert.equal(back.ok, true, back.reason);
    assert.equal(s.status().state, 'saved');
    assert.deepEqual(
      JSON.parse(sessionText(fs, root, 'Yank_01.kcproject')).doc,
      docOf(3),
      'the LATEST held work lands',
    );
    assert.ok(seen.includes('paused') && seen.at(-1) === 'saved');
  },
);

await ok('the folder moved: resume at its new home — only this project, never another', async () => {
  const fs = createMemoryProjectFs({ folders: [P, '/Volumes/Gig'] });
  const s = mk(fs);
  const { root } = await s.create({ parent: P, name: 'Tour', doc: docOf(1) });
  fs.move(root, '/Volumes/Gig/KC1_Loot_Tour');
  assert.equal((await s.save(docOf(2))).paused, true);
  // a different project at the pointed-at place is refused, nothing written into it
  const s2 = mk(fs);
  const { root: wrong } = await s2.create({ parent: '/Volumes/Gig', name: 'Other', doc: docOf(9) });
  const wrongBefore = sessionText(fs, wrong, 'Other_01.kcproject');
  const refused = await s.resume(wrong);
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /different project/);
  assert.equal(sessionText(fs, wrong, 'Other_01.kcproject'), wrongBefore);
  assert.equal(s.status().state, 'paused');
  const moved = await s.resume('/Volumes/Gig/KC1_Loot_Tour');
  assert.equal(moved.ok, true, moved.reason);
  assert.equal(s.status().root, '/Volumes/Gig/KC1_Loot_Tour');
  assert.deepEqual(JSON.parse(sessionText(fs, '/Volumes/Gig/KC1_Loot_Tour', 'Tour_01.kcproject')).doc, docOf(2));
});

await ok('a failed write (disk full) is unsaved, not paused, and retries on the next save', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const s = mk(fs);
  const { root } = await s.create({ parent: P, name: 'Full', doc: docOf(1) });
  fs.failWrites(1, 'disk full');
  const r = await s.save(docOf(2));
  assert.deepEqual([r.ok, s.status().state, s.status().reason, s.status().held], [false, 'unsaved', 'disk full', true]);
  assert.equal((await s.save(docOf(3))).ok, true);
  assert.deepEqual(JSON.parse(sessionText(fs, root, 'Full_01.kcproject')).doc, docOf(3));
});

await ok('a folder renamed outside KC-1 still opens: the folder name wins, old session files still count', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const s = mk(fs);
  const { root } = await s.create({ parent: P, name: 'Before', doc: docOf(1) });
  await s.close();
  fs.move(root, `${P}/KC1_Loot_After`);
  const o = await s.open(`${P}/KC1_Loot_After`);
  assert.equal(o.ok, true, o.reason);
  assert.equal(s.status().name, 'After');
  assert.equal(o.session, 1);
  const nx = await s.newSession(o.doc);
  assert.equal(nx.ok, true);
  assert.ok(sessionText(fs, `${P}/KC1_Loot_After`, 'After_02.kcproject'), 'new sessions take the folder name');
});

console.log(`projectSession.selfcheck: ${n} checks passed (#1709 — the folder core on the memory backend)`);
