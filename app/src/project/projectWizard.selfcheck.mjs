// node src/project/projectWizard.selfcheck.mjs
// #1710 — the first-run wizard: the adoption ask. Pins, on the memory backend and a stand-in store:
//   · the trigger: desktop + never asked + no project ever opened here → the ask; with a saved doc it is the
//     ADOPTION ask, without one it goes straight to the creation offer; the browser build never asks
//   · asked exactly once across launches — the marker is set when the ask is shown, so dismissing counts as asked
//   · ADOPT lands the saved doc byte-faithful as session 01 (never the scene on stage) and puts it on stage, so the
//     first autosave writes nothing; the browser copy is left exactly where it was
//   · FRESH lands the blank doc as session 01 and on stage; SKIP leaves everything in the browser session
//   · a refused name and a cancelled folder pick keep the wizard where it was, the reason in plain words
//   · wiring: the boot reads the saved doc before the browser boot can roll over it; App shows the wizard after
//     the Play Me card and never over the tour.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProjectWizard, WIZARD_ASKED_KEY } from './projectWizard.mjs';
import { createProjectFolderLive, LAST_PROJECT_KEY } from './projectFolderLive.mjs';
import { createMemoryProjectFs } from '../state/projectFs.mjs';
import { parseProject, PIPELINE_KEY } from '../state/projectDocument.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, '');

function memStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
/** A stand-in store, the projectFolderLive selfcheck's shape: applyProject applies the parsed doc. */
function makeStore(seed) {
  const s = { seed, paletteId: 'praystation', layoutParams: { mode: 'grid', count: 60 }, enabledAssets: {}, quality: 'balanced' };
  s.applyProject = (doc) => Object.assign(s, parseProject(doc).doc);
  return s;
}
let t = 0;
const liveDeps = (fs, store, storage) => ({
  fs,
  getState: () => store,
  now: () => new Date(Date.UTC(2026, 10, 21, 0, 0, t++)).toISOString(),
  mintId: () => 'proj_wizard_0001',
  storage,
});
const P = '/Users/m/Projects';
const savedDoc = parseProject({ version: 1, seed: 777 }).doc;
const blankDoc = parseProject({ version: 1, seed: 5 }).doc;
const stubDeps = (over = {}) => ({
  storage: memStorage(),
  desktop: () => true,
  readSavedDoc: () => savedDoc,
  everOpened: () => false,
  createProject: async () => ({ ok: true, root: `${P}/KC1_Loot_X` }),
  blankDoc: () => blankDoc,
  ...over,
});

await ok('the trigger: adoption ask with a saved doc, creation offer without one, silence otherwise', () => {
  const w = createProjectWizard(stubDeps());
  assert.equal(w.begin(), 'adopt');
  assert.equal(w.savedDoc(), savedDoc);
  assert.equal(w.begin(), 'adopt', 'begin is idempotent once shown');

  const noDoc = createProjectWizard(stubDeps({ readSavedDoc: () => null }));
  assert.equal(noDoc.begin(), 'create', 'no prior autosave goes straight to project creation');

  const browserStorage = memStorage();
  const browser = createProjectWizard(stubDeps({ storage: browserStorage, desktop: () => false }));
  assert.equal(browser.begin(), 'done', 'the browser build never asks (folder projects are desktop-only)');
  assert.equal(browserStorage.getItem(WIZARD_ASKED_KEY), null, 'and the ask is not spent there');

  const asked = createProjectWizard(stubDeps({ storage: memStorage({ [WIZARD_ASKED_KEY]: '1' }) }));
  assert.equal(asked.begin(), 'done', 'already asked is already asked');

  const foldersInUse = createProjectWizard(stubDeps({ everOpened: () => true }));
  assert.equal(foldersInUse.begin(), 'done', 'a machine that already uses project folders is never asked');
});

await ok('asked exactly once across launches — shown is asked, dismissed is asked, answered is asked', async () => {
  // dismissed without answering
  const s1 = memStorage();
  const first = createProjectWizard(stubDeps({ storage: s1 }));
  assert.equal(first.begin(), 'adopt');
  assert.equal(s1.getItem(WIZARD_ASKED_KEY), '1', 'the marker is set when the ask is shown');
  first.skip();
  assert.equal(createProjectWizard(stubDeps({ storage: s1 })).begin(), 'done', 'the next launch does not nag');

  // shown and never answered at all (the launch just ended)
  const s2 = memStorage();
  assert.equal(createProjectWizard(stubDeps({ storage: s2 })).begin(), 'adopt');
  assert.equal(createProjectWizard(stubDeps({ storage: s2 })).begin(), 'done');

  // answered
  const s3 = memStorage();
  const w3 = createProjectWizard(stubDeps({ storage: s3 }));
  w3.begin();
  assert.equal((await w3.adopt('Gig')).ok, true);
  assert.equal(w3.phase(), 'done');
  assert.equal(createProjectWizard(stubDeps({ storage: s3 })).begin(), 'done');
});

await ok('ADOPT: the saved doc lands byte-faithful as session 01 and on stage; the browser copy is untouched', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  fs.picks.parent.push(P);
  const store = makeStore(99); // the stage holds something else — the scene the boot rolled, not the saved work
  const pipelineText = JSON.stringify({ version: 1, savedAt: '2026-11-20T00:00:00.000Z', doc: savedDoc });
  const storage = memStorage({ [PIPELINE_KEY]: pipelineText });
  const live = createProjectFolderLive(liveDeps(fs, store, storage));
  const wizard = createProjectWizard({
    storage,
    desktop: () => true,
    readSavedDoc: () => savedDoc,
    everOpened: () => false,
    createProject: (name, doc) => live.create(name, { doc, land: true }),
    blankDoc: () => blankDoc,
  });
  assert.equal(wizard.begin(), 'adopt');
  const r = await wizard.adopt('Gig');
  assert.equal(r.ok, true, r.reason);
  const file = JSON.parse(fs.files()[`${P}/KC1_Loot_Gig/sessions/Gig_01.kcproject`]);
  assert.deepEqual(file.doc, savedDoc, 'session 01 IS the saved doc, exactly as saved');
  assert.equal(store.seed, 777, 'the stage lands on the adopted work');
  assert.deepEqual(await live.save(), { ok: true, unchanged: true }, 'the first autosave writes nothing over it');
  assert.equal(storage.getItem(PIPELINE_KEY), pipelineText, 'the browser copy is left in place, byte for byte');
  assert.equal(storage.getItem(LAST_PROJECT_KEY), `${P}/KC1_Loot_Gig`, 'the next launch reopens the project');
});

await ok('FRESH: the blank doc becomes session 01 and the stage; from the creation offer and from the adoption ask', async () => {
  // no autosave: straight to creation
  const fs = createMemoryProjectFs({ folders: [P] });
  fs.picks.parent.push(P);
  const store = makeStore(99);
  const storage = memStorage();
  const live = createProjectFolderLive(liveDeps(fs, store, storage));
  const wizard = createProjectWizard({
    storage,
    desktop: () => true,
    readSavedDoc: () => null,
    everOpened: () => false,
    createProject: (name, doc) => live.create(name, { doc, land: true }),
    blankDoc: () => blankDoc,
  });
  assert.equal(wizard.begin(), 'create');
  assert.equal((await wizard.fresh('First')).ok, true);
  assert.deepEqual(JSON.parse(fs.files()[`${P}/KC1_Loot_First/sessions/First_01.kcproject`]).doc, blankDoc);
  assert.equal(store.seed, 5, 'the stage lands on the empty project');

  // with an autosave waiting: START FRESH still makes the empty project, not the saved work
  const fs2 = createMemoryProjectFs({ folders: [P] });
  fs2.picks.parent.push(P);
  const store2 = makeStore(99);
  const live2 = createProjectFolderLive(liveDeps(fs2, store2, memStorage()));
  const w2 = createProjectWizard({
    storage: memStorage(),
    desktop: () => true,
    readSavedDoc: () => savedDoc,
    everOpened: () => false,
    createProject: (name, doc) => live2.create(name, { doc, land: true }),
    blankDoc: () => blankDoc,
  });
  assert.equal(w2.begin(), 'adopt');
  assert.equal((await w2.fresh('Fresh')).ok, true);
  assert.deepEqual(JSON.parse(fs2.files()[`${P}/KC1_Loot_Fresh/sessions/Fresh_01.kcproject`]).doc, blankDoc);
  assert.equal(store2.seed, 5);
});

await ok('SKIP: nothing is created, nothing is written, the browser session carries on', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const storage = memStorage();
  const wizard = createProjectWizard({
    storage,
    desktop: () => true,
    readSavedDoc: () => savedDoc,
    everOpened: () => false,
    createProject: (name, doc) => createProjectFolderLive(liveDeps(fs, makeStore(1), storage)).create(name, { doc, land: true }),
    blankDoc: () => blankDoc,
  });
  assert.equal(wizard.begin(), 'adopt');
  wizard.skip();
  assert.equal(wizard.phase(), 'done');
  assert.equal(fs.writes.length, 0, 'skipping writes nothing anywhere');
  assert.deepEqual(Object.keys(fs.files()), []);
});

await ok('a refused name and a cancelled pick keep the wizard where it was, the reason in plain words', async () => {
  const fs = createMemoryProjectFs({ folders: [P] });
  const storage = memStorage();
  const live = createProjectFolderLive(liveDeps(fs, makeStore(1), storage));
  fs.picks.parent.push(P);
  assert.equal((await live.create('Gig')).ok, true);
  await live.close();
  storage.removeItem(LAST_PROJECT_KEY); // the wizard's own storage question is the asked marker, not this one

  const wizard = createProjectWizard({
    storage,
    desktop: () => true,
    readSavedDoc: () => savedDoc,
    everOpened: () => false,
    createProject: (name, doc) => live.create(name, { doc, land: true }),
    blankDoc: () => blankDoc,
  });
  assert.equal(wizard.begin(), 'adopt');
  // collision: refused, wizard stays, reason is plain
  fs.picks.parent.push(P);
  const clash = await wizard.adopt('Gig');
  assert.equal(clash.ok, false);
  assert.equal(wizard.phase(), 'adopt');
  assert.match(wizard.note(), /already there/);
  // a name a folder cannot have: refused the same way
  fs.picks.parent.push(P);
  assert.equal((await wizard.adopt('a/b')).ok, false);
  assert.equal(wizard.phase(), 'adopt');
  assert.match(wizard.note(), /cannot have/);
  // cancelled at the folder pick: silent, wizard stays, nothing written
  const writesBefore = fs.writes.length;
  const cancelled = await wizard.adopt('Other');
  assert.equal(cancelled.cancelled, true);
  assert.equal(wizard.phase(), 'adopt');
  assert.equal(wizard.note(), null);
  assert.equal(fs.writes.length, writesBefore);
});

await ok('wired: the boot reads the saved doc before the browser boot; App sequences the wizard after Play Me', () => {
  const hook = flat(readFileSync(new URL('../hooks/useProjectAutosave.js', import.meta.url), 'utf8'));
  const effect = hook.slice(hook.indexOf(flat('export function useProjectAutosave()')));
  const capture = effect.indexOf(flat('captureBootSavedDoc();'));
  assert.ok(capture > 0, 'the boot captures the saved doc');
  assert.ok(capture < effect.indexOf(flat('const lastRoot = folder.unavailable()')), 'captured before the folder reopen');
  assert.ok(capture < effect.indexOf(flat('browserBoot();')), 'captured before the browser boot (and its roll)');

  const wiring = flat(readFileSync(new URL('../hooks/useProjectWizard.js', import.meta.url), 'utf8'));
  assert.ok(wiring.includes(flat('bootSavedDoc = readPipelineAutosave().doc ?? null;')), 'the snapshot IS the autosave read');
  assert.ok(wiring.includes(flat('create(name, { doc, land: true })')), 'creation goes through the live create, landing the doc');
  assert.ok(wiring.includes(flat('live.isOpen() || live.lastRoot() != null')), 'ever-opened reads the live project');

  const app = flat(readFileSync(new URL('../App.jsx', import.meta.url), 'utf8'));
  assert.ok(app.includes(flat('onDismiss={() => setPlayMeGone(true)}')), 'App hears the Play Me dismissal');
  assert.ok(app.includes(flat('{playMeGone && !tourOpen ? <ProjectWizardOverlay /> : null}')), 'the wizard waits for Play Me and stays off the tour');
  assert.ok(
    app.indexOf(flat('<FirstRunOverlay')) < app.indexOf(flat('<ProjectWizardOverlay')),
    'the wizard renders after the Play Me card in the tree',
  );
  const firstRun = flat(readFileSync(new URL('../components/FirstRunOverlay.jsx', import.meta.url), 'utf8'));
  assert.ok(firstRun.includes(flat("if (typeof onDismiss === 'function') onDismiss();")), 'every dismissal reports');
});

console.log(`projectWizard.selfcheck: ${n} checks passed (#1710 — the first-run wizard asks once)`);
