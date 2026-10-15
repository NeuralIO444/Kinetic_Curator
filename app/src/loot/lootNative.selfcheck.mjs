// node src/loot/lootNative.selfcheck.mjs
// #1479 slice 4 — the desktop check (one answer for the app, a superset of every old copy) and the thin JS side of the
// native commands: gated, never throwing, and treating every native reply as untrusted. Needs no Tauri.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isTauriRuntime, desktopGlobals, TAURI_GLOBALS, DESKTOP_CHECK_CONFIRMED } from '../platform/desktop.mjs';
import { createLootNative, shapeScan, seenLine, MAX_ENTRIES } from './lootNative.mjs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };

await ok('the desktop check knows Tauri 1 and 2, and is a superset of what every caller used to check', () => {
  assert.deepEqual([...TAURI_GLOBALS], ['__TAURI_IPC__', '__TAURI_METADATA__', '__TAURI_INTERNALS__', '__TAURI__']);
  assert.equal(isTauriRuntime({}), false, 'a plain browser window');
  assert.equal(isTauriRuntime(undefined) || false, false, 'node: no window');
  assert.equal(isTauriRuntime({ __TAURI_IPC__: () => {} }), true, 'Tauri 1: the IPC global');
  assert.equal(isTauriRuntime({ __TAURI_METADATA__: { currentWindow: { label: 'main' } } }), true, 'Tauri 1: the metadata');
  assert.equal(isTauriRuntime({ __TAURI_INTERNALS__: {} }), true, 'Tauri 2 (what the old copies checked)');
  assert.equal(isTauriRuntime({ __TAURI__: {} }), true, 'withGlobalTauri (what the old copies checked)');
  for (const falsy of [null, undefined, false]) assert.equal(isTauriRuntime({ __TAURI_IPC__: falsy }), false);
  assert.deepEqual(desktopGlobals({ __TAURI_IPC__: 1, __TAURI__: {}, other: 1 }), ['__TAURI_IPC__', '__TAURI__']);
  assert.deepEqual(desktopGlobals(null), []);
  const trap = new Proxy({}, { get() { throw new Error('boom'); } });
  assert.deepEqual(desktopGlobals(trap), [], 'a window that throws is not desktop, and does not throw');
  assert.equal(DESKTOP_CHECK_CONFIRMED, false, 'not confirmed on the Mac yet: flipped in its own PR once Matt has');
});

await ok('the three old copies are gone: one shared check', () => {
  for (const f of ['../panels/pipeline/stageWindow.js', '../curator/mindApple.js', '../curator/tasteLedger.js']) {
    const code = src(f);
    assert.ok(/platform\/desktop\.mjs/.test(code), `${f} imports the shared check`);
    assert.ok(!/__TAURI_INTERNALS__ \|\| window\.__TAURI__/.test(code), `${f} no longer carries its own copy`);
  }
});

await ok('the gate: web is "desktop only"; desktop is closed until confirmed, and says why', async () => {
  const calls = [];
  const invoke = async (cmd, args) => { calls.push([cmd, args]); return {}; };
  const web = createLootNative({ invoke, isDesktop: () => false, confirmed: true });
  assert.equal(web.unavailable(), 'desktop only');
  assert.deepEqual(await web.scan('/r'), { ok: false, reason: 'desktop only' });
  const unconfirmed = createLootNative({ invoke, isDesktop: () => true, confirmed: false });
  assert.equal(unconfirmed.unavailable(), 'desktop check not confirmed yet');
  assert.deepEqual(await unconfirmed.hash('/r', 'images/a.svg'), { ok: false, reason: 'desktop check not confirmed yet' });
  assert.equal(calls.length, 0, 'a closed gate never reaches the native side');
  const live = createLootNative({ invoke, isDesktop: () => true, confirmed: true });
  assert.equal(live.unavailable(), null);
});

await ok('a scan reply is shaped: junk entries dropped, numbers checked, caps held', async () => {
  const reply = {
    reachable: true, truncated: false,
    entries: [
      { rel: 'images/a.svg', size: 10, mtimeMs: 1000 }, { rel: '', size: 1, mtimeMs: 1 }, { rel: 'images/b.svg', size: -1, mtimeMs: 1 },
      { rel: 'images/c.svg', size: 'big', mtimeMs: 1 }, null, 7, { rel: 'x'.repeat(600), size: 1, mtimeMs: 1 }, { rel: 'images/d.svg', size: 5, mtimeMs: NaN },
    ],
    skipped: [{ rel: 'images/l.svg', reason: 'symlink (not followed)' }, { rel: 5 }, { rel: 'images/z', reason: 9 }],
  };
  const live = createLootNative({ invoke: async () => reply, isDesktop: () => true, confirmed: true });
  const r = await live.scan('/Users/me/Loot');
  assert.equal(r.ok, true); assert.equal(r.reachable, true);
  assert.deepEqual(r.entries, [{ rel: 'images/a.svg', size: 10, mtimeMs: 1000 }]);
  assert.deepEqual(r.skipped.map((s) => s.rel), ['images/l.svg', 'images/z']);
  assert.equal(r.skipped[1].reason, 'skipped');
  assert.deepEqual(shapeScan(null), { reachable: false, entries: [], skipped: [], truncated: false });
  assert.deepEqual(shapeScan({ reachable: 'yes' }).reachable, false, 'only a real true is reachable');
  const many = shapeScan({ reachable: true, entries: Array.from({ length: MAX_ENTRIES + 50 }, (_, i) => ({ rel: `images/${i}.svg`, size: 1, mtimeMs: 1 })) });
  assert.equal(many.entries.length, MAX_ENTRIES);
});

await ok('hash and read: shapes are checked, bytes decode, bad replies and thrown errors become a reason', async () => {
  const mk = (value, thrown) => createLootNative({
    invoke: async () => { if (thrown) throw new Error(thrown); return value; }, isDesktop: () => true, confirmed: true,
  });
  const good = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  assert.deepEqual(await mk(good).hash('/r', 'images/a.svg'), { ok: true, hash: good });
  assert.equal((await mk('not a hash').hash('/r', 'images/a.svg')).ok, false);
  assert.equal((await mk(7).hash('/r', 'images/a.svg')).ok, false);
  const b = await mk(Buffer.from('<svg/>').toString('base64')).read('/r', 'images/a.svg');
  assert.equal(b.ok, true); assert.equal(Buffer.from(b.bytes).toString(), '<svg/>');
  assert.equal((await mk('%%% not base64 %%%').read('/r', 'images/a.svg')).ok, false);
  assert.equal((await mk({ no: 'string' }).read('/r', 'images/a.svg')).ok, false);
  const err = await mk(null, 'file too large (80 MB)').read('/r', 'audio/big.wav');
  assert.deepEqual(err, { ok: false, reason: 'file too large (80 MB)' });
  const long = await mk(null, 'x'.repeat(900)).scan('/r');
  assert.ok(long.reason.length <= 160, 'reasons are bounded');
});

await ok('bad arguments never reach the native side', async () => {
  const calls = [];
  const live = createLootNative({ invoke: async (...a) => { calls.push(a); return {}; }, isDesktop: () => true, confirmed: true });
  for (const root of ['', null, undefined, 5, 'a\0b', 'x'.repeat(2000)]) assert.equal((await live.scan(root)).ok, false);
  assert.equal((await live.hash('/r', '')).ok, false);
  assert.equal((await live.read('/r', null)).ok, false);
  assert.equal(calls.length, 0);
});

await ok('the row can show what the check sees, so it can be confirmed by eye on the Mac', () => {
  assert.equal(seenLine({}), 'sees no desktop globals');
  assert.equal(seenLine({ __TAURI_IPC__: 1, __TAURI_METADATA__: {} }), 'sees __TAURI_IPC__, __TAURI_METADATA__');
});

await ok('loads in a browser and in node: the Tauri API is imported lazily, never at the top', () => {
  const code = src('./lootNative.mjs').replace(/\/\/.*$/gm, '');
  assert.ok(!/^import .*@tauri-apps/m.test(code), 'no static import of the Tauri API');
  assert.ok(/await import\('@tauri-apps\/api\/tauri'\)/.test(code), 'a lazy one, inside the call');
  assert.ok(!/localStorage|document\.|Date\.now|Math\.random/.test(code));
});

console.log(`lootNative.selfcheck: ${n} checks passed`);
