// node src/state/projectTauri.selfcheck.mjs
// #1709 — the desktop backend of projectFs. Pins: every command it invokes exists in src-tauri/src/project.rs, is
// registered in main.rs, and is called with exactly that command's arguments (Tauri 1 maps camelCase to snake_case);
// a native `unreachable:` message becomes { unreachable: true } so the session pauses and protects; replies are shaped
// (junk names dropped, a non-string read refused); the web build answers "desktop only" and never calls native; and the
// whole folder core (create, save, yank → pause, resume) runs through it unchanged against a native stand-in.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTauriProjectFs, DESKTOP_ONLY } from './projectTauri.mjs';
import { createMemoryProjectFs } from './projectFs.mjs';
import { createProjectSession } from './projectSession.mjs';
import { serializeProject } from './projectDocument.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const rs = readFileSync(new URL('../../../src-tauri/src/project.rs', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../../src-tauri/src/main.rs', import.meta.url), 'utf8');
const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
/** The native commands as declared: name → [arg names]. */
const NATIVE = Object.fromEntries(
  [...rs.matchAll(/#\[tauri::command\]\s*pub async fn (project_\w+)\(([^)]*)\)/g)].map((m) => [
    m[1],
    m[2]
      .split(',')
      .map((a) => a.trim().split(':')[0].trim())
      .filter(Boolean),
  ]),
);

/** A native stand-in: the memory backend answering in the Rust command's shape (values, or thrown messages). */
function nativeOver(mem, calls) {
  const fail = (r) => {
    throw new Error(r.unreachable ? `unreachable: ${r.reason}` : r.reason);
  };
  const handlers = {
    project_list_names: async ({ dir }) => {
      const r = await mem.listNames(dir);
      return r.ok ? r.names : fail(r);
    },
    project_make_folder: async ({ parent, name }) => {
      const r = await mem.makeFolder(parent, name);
      return r.ok ? r.path : fail(r);
    },
    project_reachable: async ({ root }) => (await mem.reachable(root)).reachable,
    project_list: async ({ root, rel }) => {
      const r = await mem.list(root, rel);
      return r.ok ? r.names : fail(r);
    },
    project_read: async ({ root, rel }) => {
      const r = await mem.read(root, rel);
      return r.ok ? r.text : fail(r);
    },
    project_write: async ({ root, rel, text, create }) => {
      const r = await mem.write(root, rel, text, { create });
      return r.ok ? null : fail(r);
    },
    project_make_subfolder: async ({ root, rel }) => {
      const r = await mem.makeSubfolder(root, rel);
      return r.ok ? null : fail(r);
    },
    project_rename_folder: async ({ root, newName }) => {
      const r = await mem.renameFolder(root, newName);
      return r.ok ? r.path : fail(r);
    },
  };
  return async (cmd, args) => {
    calls.push([cmd, args]);
    return handlers[cmd](args);
  };
}

await ok('every command it calls exists in project.rs, is registered, and gets exactly its arguments', async () => {
  assert.equal(Object.keys(NATIVE).length, 8, `the eight native commands (${Object.keys(NATIVE)})`);
  for (const cmd of Object.keys(NATIVE)) assert.ok(main.includes(`project::${cmd},`), `${cmd} registered in main.rs`);
  assert.ok(main.includes('mod project;'));
  const calls = [];
  const mem = createMemoryProjectFs({ folders: ['/P'] });
  const fs = createTauriProjectFs({ invoke: nativeOver(mem, calls), isDesktop: () => true });
  const { path } = await fs.makeFolder('/P', 'KC1_Loot_X');
  await fs.listNames('/P');
  await fs.reachable(path);
  await fs.makeSubfolder(path, 'sessions');
  await fs.write(path, 'sessions/X_01.kcproject', 'a', { create: true });
  await fs.read(path, 'sessions/X_01.kcproject');
  await fs.list(path, 'sessions');
  await fs.renameFolder(path, 'KC1_Loot_Y');
  assert.deepEqual([...new Set(calls.map((c) => c[0]))].sort(), Object.keys(NATIVE).sort(), 'every command exercised');
  for (const [cmd, args] of calls)
    assert.deepEqual(Object.keys(args).map(snake).sort(), [...NATIVE[cmd]].sort(), `${cmd}: argument names`);
});

await ok('a native "unreachable:" becomes { unreachable: true }; other failures stay plain', async () => {
  const fs = createTauriProjectFs({
    isDesktop: () => true,
    invoke: async (cmd) => {
      if (cmd === 'project_write') throw 'unreachable: No such file or directory (os error 2)';
      if (cmd === 'project_make_folder') throw 'KC1_Loot_A already exists';
      throw new Error('unwritable: disk full');
    },
  });
  const w = await fs.write('/P/KC1_Loot_A', 'sessions/A_01.kcproject', 'x');
  assert.deepEqual([w.ok, w.unreachable], [false, true]);
  const m = await fs.makeFolder('/P', 'KC1_Loot_A');
  assert.deepEqual([m.ok, m.exists, m.unreachable], [false, true, undefined]);
  const r = await fs.read('/P/KC1_Loot_A', 'x');
  assert.deepEqual([r.ok, r.unreachable, r.reason], [false, undefined, 'unwritable: disk full']);
});

await ok('replies are shaped: junk names dropped, a non-string read refused, bad paths never sent', async () => {
  const calls = [];
  const fs = createTauriProjectFs({
    isDesktop: () => true,
    invoke: async (cmd, args) => {
      calls.push(cmd);
      if (cmd === 'project_list_names')
        return [{ name: 'a', dir: true }, { name: '' }, null, { name: 7 }, { name: 'b' }];
      if (cmd === 'project_read') return { not: 'text' };
      return null;
    },
  });
  assert.deepEqual((await fs.listNames('/P')).names, [
    { name: 'a', dir: true },
    { name: 'b', dir: false },
  ]);
  assert.equal((await fs.read('/P', 'x')).ok, false);
  calls.length = 0;
  for (const p of ['', 'a\0b', 5, null]) assert.equal((await fs.listNames(p)).ok, false);
  assert.equal((await fs.write('/P', '', 'x')).ok, false);
  assert.equal((await fs.write('/P', 'x', 5)).ok, false);
  assert.deepEqual(calls, [], 'nothing invalid reaches native');
});

await ok('the web build answers "desktop only" and never calls native', async () => {
  let called = 0;
  const fs = createTauriProjectFs({
    isDesktop: () => false,
    invoke: async () => {
      called++;
    },
  });
  assert.equal(fs.unavailable(), DESKTOP_ONLY);
  for (const r of [await fs.pickParent(), await fs.listNames('/P'), await fs.write('/P', 'x', 'y')])
    assert.deepEqual(r, { ok: false, reason: DESKTOP_ONLY });
  assert.equal(called, 0);
});

await ok('the folder core runs through it unchanged: create, save, yank → paused, resume', async () => {
  const mem = createMemoryProjectFs({ folders: ['/Users/m'] });
  const fs = createTauriProjectFs({ invoke: nativeOver(mem, []), isDesktop: () => true });
  let t = 0;
  const s = createProjectSession({
    fs,
    now: () => new Date(Date.UTC(2026, 9, 27, 0, 0, t++)).toISOString(),
    mintId: () => 'proj_tauri_0001',
  });
  const doc = (seed) =>
    serializeProject({ seed, paletteId: 'praystation', layoutParams: { mode: 'grid' }, enabledAssets: {} });
  const c = await s.create({ parent: '/Users/m', name: 'Desk', doc: doc(1) });
  assert.equal(c.ok, true, c.reason);
  assert.equal((await s.save(doc(2))).ok, true);
  mem.detach(c.root);
  assert.equal((await s.save(doc(3))).paused, true);
  assert.equal(s.status().state, 'paused');
  mem.attach(c.root);
  assert.equal((await s.resume()).ok, true);
  await s.close();
  const o = await s.open(c.root);
  assert.equal(o.ok, true, o.reason);
  assert.equal(o.doc.seed, 3);
});

console.log(`projectTauri.selfcheck: ${n} checks passed (#1709 — the desktop backend matches project.rs)`);
