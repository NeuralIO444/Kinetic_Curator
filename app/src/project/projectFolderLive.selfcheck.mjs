// node src/project/projectFolderLive.selfcheck.mjs
// #1709 — the project folder wired to the instrument. Pins, on the memory backend and a stand-in store:
//   · NEW saves the scene on stage as session 01 and changes nothing on stage; it remembers the folder for next launch
//   · OPEN applies the latest session through applyProject and WRITES NOTHING — including the autosave that the apply
//     itself wakes (an unchanged scene is not written); the first edit is the first write
//   · while a project is open, saves go to the folder; when it is yanked the work is held and RECONNECT lands it
//   · CLOSE forgets the folder (next launch boots the browser session); it refuses while work is only held
//   · wiring: launch reopens the last folder BEFORE the browser boot (so no startup roll lands on a session), autosave
//     writes through the folder and not the browser slot while one is open, and the row sits in PIPELINE · PROJECT.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProjectFolderLive, projectStatusLine, LAST_PROJECT_KEY } from './projectFolderLive.mjs';
import { createMemoryProjectFs } from '../state/projectFs.mjs';
import { serializeProject, parseProject } from '../state/projectDocument.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, '');

/** A stand-in store: the fields serializeProject reads, and applyProject the way the app's does it (the parsed doc). */
function makeStore(seed) {
  const s = { seed, paletteId: 'praystation', layoutParams: { mode: 'grid', count: 60 }, enabledAssets: {}, quality: 'balanced' };
  s.applyProject = (doc) => Object.assign(s, parseProject(doc).doc);
  return s;
}
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
let t = 0;
const deps = (fs, store, storage) => ({
  fs,
  getState: () => store,
  now: () => new Date(Date.UTC(2026, 9, 28, 0, 0, t++)).toISOString(),
  mintId: () => 'proj_live_000001',
  storage,
});
const P = '/Users/m/Projects';

await ok('NEW saves the scene on stage as session 01, changes nothing on stage, and remembers the folder', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  fs.picks.parent.push(P);
  const store = makeStore(11);
  const before = JSON.stringify(serializeProject(store));
  const storage = memStorage();
  const live = createProjectFolderLive(deps(fs, store, storage));
  const r = await live.create('Gig');
  assert.equal(r.ok, true, r.reason);
  assert.equal(JSON.stringify(serializeProject(store)), before, 'the stage is untouched');
  const saved = JSON.parse(fs.files()[`${P}/KC1_Loot_Gig/sessions/Gig_01.kcproject`]);
  assert.equal(saved.doc.seed, 11);
  assert.equal(storage.getItem(LAST_PROJECT_KEY), `${P}/KC1_Loot_Gig`);
  assert.equal(live.isOpen(), true);
  assert.match(projectStatusLine(live.status()), /^Gig · session 01 — saved in its folder$/);
  // cancel at the picker: nothing happens, nothing is said
  const fs2 = createMemoryProjectFs({ folders: [P] });
  const l2 = createProjectFolderLive(deps(fs2, makeStore(1), memStorage()));
  assert.deepEqual(await l2.create('X1'), { ok: false, cancelled: true });
  assert.equal(fs2.writes.length, 0);
});

await ok('OPEN applies the latest session and writes nothing — not even the autosave the apply wakes', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  fs.picks.parent.push(P);
  const live = createProjectFolderLive(deps(fs, makeStore(21), memStorage()));
  await live.create('Set');
  await live.close();
  // a different scene is on stage now; open the project from another "launch"
  const store = makeStore(99);
  const storage = memStorage();
  const again = createProjectFolderLive(deps(fs, store, storage));
  const writesBefore = fs.writes.length;
  const snap = JSON.stringify(fs.files());
  const o = await again.open(`${P}/KC1_Loot_Set`);
  assert.equal(o.ok, true, o.reason);
  assert.equal(store.seed, 21, 'the session is on stage');
  const autosave = await again.save(); // what applyProject's store change triggers in the app
  assert.deepEqual(autosave, { ok: true, unchanged: true });
  assert.equal(fs.writes.length, writesBefore, 'opening wrote nothing');
  assert.equal(JSON.stringify(fs.files()), snap);
  // the first edit is the first write
  store.seed = 22;
  assert.equal((await again.save()).ok, true);
  assert.equal(JSON.parse(fs.files()[`${P}/KC1_Loot_Set/sessions/Set_01.kcproject`]).doc.seed, 22);
  assert.equal(storage.getItem(LAST_PROJECT_KEY), `${P}/KC1_Loot_Set`);
});

await ok('yanked mid-session: work held, RECONNECT lands it; FIND IT follows a moved folder', async () => {
  const fs = createMemoryProjectFs({ folders: [P, '/Volumes/Gig'] });
  fs.picks.parent.push(P);
  const store = makeStore(31);
  const storage = memStorage();
  const live = createProjectFolderLive(deps(fs, store, storage));
  const { root } = await live.create('Road');
  fs.detach(root);
  store.seed = 32;
  assert.equal((await live.save()).paused, true);
  assert.match(projectStatusLine(live.status()), /saving is paused/);
  assert.equal((await live.close()).ok, false, 'held work keeps the project open');
  fs.attach(root);
  assert.equal((await live.reconnect()).ok, true);
  assert.equal(JSON.parse(fs.files()[`${root}/sessions/Road_01.kcproject`]).doc.seed, 32);
  // moved: FIND IT
  fs.move(root, '/Volumes/Gig/KC1_Loot_Road');
  store.seed = 33;
  assert.equal((await live.save()).paused, true);
  fs.picks.project.push('/Volumes/Gig/KC1_Loot_Road');
  assert.equal((await live.reconnect({ pick: true })).ok, true);
  assert.equal(storage.getItem(LAST_PROJECT_KEY), '/Volumes/Gig/KC1_Loot_Road', 'next launch opens it where it is now');
  assert.equal(JSON.parse(fs.files()['/Volumes/Gig/KC1_Loot_Road/sessions/Road_01.kcproject']).doc.seed, 33);
});

await ok('NEW SESSION continues in _02 with the scene on stage; CLOSE forgets the folder', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  fs.picks.parent.push(P);
  const store = makeStore(41);
  const storage = memStorage();
  const live = createProjectFolderLive(deps(fs, store, storage));
  const { root } = await live.create('Branch');
  store.seed = 42;
  const ns = await live.newSession();
  assert.deepEqual([ns.ok, ns.session], [true, 2]);
  assert.equal(JSON.parse(fs.files()[`${root}/sessions/Branch_01.kcproject`]).doc.seed, 41, '_01 frozen');
  assert.equal(JSON.parse(fs.files()[`${root}/sessions/Branch_02.kcproject`]).doc.seed, 42);
  assert.equal((await live.close()).ok, true);
  assert.equal(storage.getItem(LAST_PROJECT_KEY), null);
  assert.equal(live.isOpen(), false);
  assert.match(projectStatusLine(live.status()), /lives in the browser/);
});

await ok('wired: launch reopens before the browser boot, autosave writes the folder not the browser slot, the row is in PIPELINE', () => {
  const hook = flat(readFileSync(new URL('../hooks/useProjectAutosave.js', import.meta.url), 'utf8'));
  const reopen = hook.indexOf(flat('const lastRoot = folder.unavailable() ? null : folder.lastRoot();'));
  assert.ok(reopen > 0, 'launch reads the last folder');
  assert.ok(hook.includes(flat('folder.open(lastRoot)')));
  const effect = hook.slice(hook.indexOf(flat('export function useProjectAutosave()')));
  assert.ok(
    effect.indexOf(flat('folder.open(lastRoot)')) < effect.indexOf(flat('browserBoot();')),
    'the folder is tried first; the browser boot (and its startup roll) runs only when it cannot open',
  );
  const write = effect.slice(effect.indexOf(flat('const doWrite = () => {')));
  assert.ok(
    write.indexOf(flat('if (folder.isOpen()) {')) < write.indexOf(flat('writePipelineAutosave(')),
    'an open project is saved before (and instead of) the browser slot',
  );
  assert.ok(write.includes(flat('folder.save().then(')));
  const panel = flat(readFileSync(new URL('../panels/PipelinePanel.jsx', import.meta.url), 'utf8'));
  assert.ok(panel.includes(flat('<div className="pipeline-section-label">PROJECT</div> <ProjectFolderRow />')));
});

console.log(`projectFolderLive.selfcheck: ${n} checks passed (#1709 — the project folder on stage)`);
