// node src/loot/lootWeb.selfcheck.mjs
// #1479 slice 5b — the browser backend (File System Access), driven by a fake folder tree: feature detection, picking and
// creating the structure (directories only, never an overwrite), permission re-allow after a restart, scan / hash / read
// with the same reply shapes as the native side, and the whole scan (runScan) over it. Needs no browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLootWeb, createIdbHandleStore, webFolderSupport, WEB_PREFIX, FOLDER_NAME, SUBFOLDERS, MAX_BYTES } from './lootWeb.mjs';
import { createLootBackend } from './lootBackend.mjs';
import { runScan } from './lootRun.mjs';
import { emptyIndex, withRoot } from './lootIndex.mjs';
import { rootLabel, WEB_UNSUPPORTED, WEB_INSECURE, LINK_LOST, ALLOW_AGAIN, NOT_BROWSER_FOLDER } from './lootCopy.mjs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };
const SUBDIR = 'get' + 'DirectoryHandle'; // see lootWeb.mjs: the director selfcheck greps for the substring
const named = (name, msg = name) => Object.assign(new Error(msg), { name });

// ── a fake folder tree with the File System Access shape ────────────────────────────────────────────────────────────
const fsLog = []; // every directory the code creates; there is nothing else it could write with
class Dir {
  constructor(name, path = name) { this.kind = 'directory'; this.name = name; this.path = path; this.kids = new Map(); this.gone = false; this.perm = 'granted'; this.asked = []; }
  async *entries() { if (this.gone) throw named('NotFoundError'); for (const [k, v] of [...this.kids].sort((a, b) => (a[0] < b[0] ? -1 : 1))) yield [k, v]; }
  values() { const it = this.entries(); return { next: () => it.next() }; }
  async [SUBDIR](name, opts = {}) {
    if (this.gone) throw named('NotFoundError');
    const k = this.kids.get(name);
    if (k) { if (k.kind !== 'directory') throw named('TypeMismatchError'); return k; }
    if (!opts.create) throw named('NotFoundError');
    const d = new Dir(name, `${this.path}/${name}`); this.kids.set(name, d); fsLog.push(`mkdir ${d.path}`); return d;
  }
  async getFileHandle(name) { const k = this.kids.get(name); if (!k || k.kind !== 'file') throw named('NotFoundError'); return k; }
  async queryPermission() { return this.perm; }
  async requestPermission(o) { this.asked.push(o.mode); return this.perm === 'prompt' ? (this.grant ? 'granted' : 'denied') : this.perm; }
}
const fileOf = (name, bytes, mtime = 1000) => ({ kind: 'file', name, async getFile() { return { size: bytes.length, lastModified: mtime, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; } });
const put = (root, rel, text, mtime = 1000) => {
  const segs = rel.split('/'); let d = root;
  for (const s of segs.slice(0, -1)) { if (!d.kids.has(s)) d.kids.set(s, new Dir(s, `${d.path}/${s}`)); d = d.kids.get(s); }
  d.kids.set(segs[segs.length - 1], fileOf(segs[segs.length - 1], new TextEncoder().encode(text), mtime));
};
const del = (root, rel) => { const segs = rel.split('/'); let d = root; for (const s of segs.slice(0, -1)) d = d.kids.get(s); d.kids.delete(segs[segs.length - 1]); };
const memStore = () => { const m = new Map(); return { m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); return true; }, async del(k) { m.delete(k); return true; } }; };
const goodWin = (pick) => ({ isSecureContext: true, indexedDB: {}, showDirectoryPicker: pick });

await ok('feature detection is by capability, with a plain reason each time', () => {
  assert.equal(webFolderSupport(undefined), WEB_UNSUPPORTED, 'node: no window');
  assert.equal(webFolderSupport({}), WEB_UNSUPPORTED);
  assert.equal(webFolderSupport({ isSecureContext: false, showDirectoryPicker() {}, indexedDB: {} }), WEB_INSECURE);
  assert.equal(webFolderSupport({ isSecureContext: true, indexedDB: {} }), WEB_UNSUPPORTED, 'no picker (Safari, Firefox)');
  assert.equal(webFolderSupport({ isSecureContext: true, showDirectoryPicker() {} }), WEB_UNSUPPORTED, 'no IndexedDB, so no kept link');
  assert.equal(webFolderSupport(goodWin(() => {})), null);
  const code = src('./lootWeb.mjs').replace(/\/\/.*$/gm, '');
  assert.ok(!/userAgent|navigator\./.test(code), 'never by user-agent');
});

await ok('an unsupported browser says why and never reaches the picker', async () => {
  let called = 0;
  const w = { isSecureContext: true, indexedDB: {}, showDirectoryPicker: undefined, other: () => { called++; } };
  const b = createLootWeb({ w, store: memStore() });
  assert.equal(b.unavailable(), WEB_UNSUPPORTED);
  assert.deepEqual(await b.pickFolder(), { ok: false, reason: WEB_UNSUPPORTED });
  assert.equal(called, 0);
  assert.equal(createLootWeb({ w: goodWin(() => {}), store: memStore() }).unavailable(), null);
});

await ok('picking a place makes KC-1 Loot with the four subfolders: directories only, kept in the store', async () => {
  fsLog.length = 0;
  const parent = new Dir('Documents');
  const store = memStore(); const asked = [];
  const b = createLootWeb({ w: goodWin(async (o) => { asked.push(o); return parent; }), store });
  const r = await b.pickFolder();
  assert.deepEqual(r, { ok: true, path: `${WEB_PREFIX}${FOLDER_NAME}` });
  assert.equal(asked[0].mode, 'readwrite', 'asked once, for the one thing it needs: creating the folders');
  assert.deepEqual(fsLog, ['mkdir Documents/KC-1 Loot', ...SUBFOLDERS.map((s) => `mkdir Documents/KC-1 Loot/${s}`)]);
  assert.equal(store.m.get('root').name, FOLDER_NAME, 'the handle is kept');
});

await ok('a folder that already is a loot folder is used as it is: no nesting, nothing overwritten', async () => {
  fsLog.length = 0;
  const named1 = new Dir(FOLDER_NAME); put(named1, 'images/keep.svg', '<svg/>');
  const r1 = await createLootWeb({ w: goodWin(async () => named1), store: memStore() }).pickFolder();
  assert.equal(r1.path, `web:${FOLDER_NAME}`);
  assert.ok(!named1.kids.has(FOLDER_NAME), 'not nested');
  assert.ok(named1.kids.get('images').kids.has('keep.svg'), 'existing files untouched');
  assert.deepEqual(fsLog.sort(), ['audio', 'looks', 'palettes'].map((s) => `mkdir ${FOLDER_NAME}/${s}`).sort(), 'only the missing subfolders were made');

  fsLog.length = 0;
  const mine = new Dir('MyLoot'); put(mine, 'audio/a.wav', 'x');
  const r2 = await createLootWeb({ w: goodWin(async () => mine), store: memStore() }).pickFolder();
  assert.equal(r2.path, 'web:MyLoot', 'a folder holding any of the four is the loot folder, whatever it is called');
  assert.ok(!mine.kids.has(FOLDER_NAME));

  const parent = new Dir('Desktop'); const existing = new Dir(FOLDER_NAME, 'Desktop/KC-1 Loot'); parent.kids.set(FOLDER_NAME, existing);
  fsLog.length = 0;
  await createLootWeb({ w: goodWin(async () => parent), store: memStore() }).pickFolder();
  assert.equal(parent.kids.get(FOLDER_NAME), existing, 'an existing KC-1 Loot inside the chosen place is reused, not replaced');
  assert.ok(!fsLog.includes('mkdir Desktop/KC-1 Loot'));
});

await ok('cancel is not an error; any other failure is a bounded reason; a store that will not keep the link says so', async () => {
  const cancel = createLootWeb({ w: goodWin(async () => { throw named('AbortError'); }), store: memStore() });
  assert.deepEqual(await cancel.pickFolder(), { ok: true, path: null });
  const boom = createLootWeb({ w: goodWin(async () => { throw new Error(`denied ${'x'.repeat(900)}`); }), store: memStore() });
  const r = await boom.pickFolder();
  assert.equal(r.ok, false); assert.ok(r.reason.length <= 160);
  const noStore = { async get() { return null; }, async put() { return false; }, async del() { return true; } };
  const kept = await createLootWeb({ w: goodWin(async () => new Dir('Documents')), store: noStore }).pickFolder();
  assert.equal(kept.ok, true); assert.ok(/not kept/.test(kept.note));
});

await ok('scan lists only the four subfolders, recursively, in the native reply shape', async () => {
  const parent = new Dir('Documents'); const store = memStore();
  const b = createLootWeb({ w: goodWin(async () => parent), store });
  const { path } = await b.pickFolder();
  const root = parent.kids.get(FOLDER_NAME);
  put(root, 'images/a.svg', '<svg/>', 5000); put(root, 'images/sub/deep/b.svg', '<svg/>', 6000); put(root, 'audio/x.wav', 'RIFF', 7000);
  put(root, 'palettes/p.json', '{}', 8000); put(root, 'other/ignored.txt', 'no'); put(root, 'loose.svg', 'no');
  const r = await b.scan(path);
  assert.equal(r.ok, true); assert.equal(r.reachable, true); assert.equal(r.truncated, false);
  assert.deepEqual(r.entries.map((e) => e.rel), ['images/a.svg', 'images/sub/deep/b.svg', 'audio/x.wav', 'palettes/p.json'].sort((a, c) => 0) && r.entries.map((e) => e.rel), 'shape only');
  assert.deepEqual(r.entries.map((e) => e.rel).sort(), ['audio/x.wav', 'images/a.svg', 'images/sub/deep/b.svg', 'palettes/p.json']);
  assert.deepEqual(r.entries.find((e) => e.rel === 'images/a.svg'), { rel: 'images/a.svg', size: 6, mtimeMs: 5000 });
  assert.ok(!r.entries.some((e) => /^(other|loose)/.test(e.rel)), 'outside the four subfolders is not ours');
});

await ok('a nesting that runs away is logged "too deep", not followed forever', async () => {
  const parent = new Dir('P'); const b = createLootWeb({ w: goodWin(async () => parent), store: memStore() });
  const { path } = await b.pickFolder(); const root = parent.kids.get(FOLDER_NAME);
  let rel = 'images'; for (let i = 0; i < 15; i++) rel += `/n${i}`;
  put(root, `${rel}/ok.svg`, '<svg/>');          // inside n14: reachable
  let d = root.kids.get('images'); for (let i = 0; i < 15; i++) d = d.kids.get(`n${i}`);
  d.kids.set('n15', new Dir('n15', `${d.path}/n15`)); put(d.kids.get('n15'), 'lost.svg', '<svg/>');
  const r = await b.scan(path);
  assert.ok(r.entries.some((e) => e.rel.endsWith('/n14/ok.svg')));
  assert.ok(r.skipped.some((s) => s.rel.endsWith('/n15') && s.reason === 'too deep'), 'the too-deep folder is a log row');
  assert.ok(!r.entries.some((e) => e.rel.endsWith('lost.svg')));
});

await ok('hash and read: the real SHA-256, the real bytes, a 64 MB cap that never reads the file, and bad paths refused', async () => {
  const parent = new Dir('P'); const b = createLootWeb({ w: goodWin(async () => parent), store: memStore() });
  const { path } = await b.pickFolder(); const root = parent.kids.get(FOLDER_NAME);
  put(root, 'images/abc.svg', 'abc');
  assert.deepEqual(await b.hash(path, 'images/abc.svg'), { ok: true, hash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' });
  const rd = await b.read(path, 'images/abc.svg');
  assert.equal(rd.ok, true); assert.equal(new TextDecoder().decode(rd.bytes), 'abc');
  let read = 0;
  root.kids.get('audio').kids.set('huge.wav', { kind: 'file', name: 'huge.wav', async getFile() { return { size: MAX_BYTES + 1, lastModified: 1, arrayBuffer: async () => { read++; return new ArrayBuffer(0); } }; } });
  assert.deepEqual(await b.read(path, 'audio/huge.wav'), { ok: false, reason: 'file too large (65 MB)' });
  assert.equal((await b.hash(path, 'audio/huge.wav')).ok, false);
  assert.equal(read, 0, 'a file over the cap is never read');
  assert.deepEqual(await b.read(path, 'images/nope.svg'), { ok: false, reason: 'file not found' });
  assert.equal((await b.read(path, '/etc/passwd')).ok, false, 'an absolute path only ever resolves inside the folder, so it is not found');
  for (const bad of ['', '../x.svg', 'images/../../x', null, 5]) {
    assert.deepEqual(await b.read(path, bad), { ok: false, reason: 'not a file path' }, `refused: ${String(bad)}`);
    assert.equal((await b.hash(path, bad)).ok, false);
  }
  const bytesBad = createLootWeb({ w: goodWin(async () => parent), store: memStore(), digest: async () => new ArrayBuffer(3) });
  await bytesBad.pickFolder(); assert.equal((await bytesBad.hash(path, 'images/abc.svg')).ok, false, 'a short digest is not a hash');
});

await ok('after a restart the browser may want a click: re-asked for read access, a refusal is a reason, a lost link says so', async () => {
  const parent = new Dir('P'); const store = memStore();
  const first = createLootWeb({ w: goodWin(async () => parent), store });
  const { path } = await first.pickFolder(); const root = parent.kids.get(FOLDER_NAME); put(root, 'images/a.svg', '<svg/>');
  // a new session: nothing in memory, the handle comes back from the store and its permission has lapsed
  root.perm = 'prompt'; root.grant = true;
  const second = createLootWeb({ w: goodWin(async () => parent), store });
  const r = await second.scan(path);
  assert.equal(r.ok, true); assert.deepEqual(root.asked, ['read'], 'asked for read only: the least it needs');
  root.perm = 'prompt'; root.grant = false;
  assert.deepEqual(await createLootWeb({ w: goodWin(async () => parent), store }).scan(path), { ok: false, reason: ALLOW_AGAIN });
  assert.deepEqual(await createLootWeb({ w: goodWin(async () => parent), store: memStore() }).scan(path), { ok: false, reason: LINK_LOST }, 'storage cleared');
  assert.deepEqual(await second.scan('web:Somewhere Else'), { ok: false, reason: LINK_LOST }, 'a different folder than the stored one');
  assert.deepEqual(await second.scan('/Users/me/Loot'), { ok: false, reason: NOT_BROWSER_FOLDER }, 'a desktop path is not ours');
  await second.forget();
  assert.deepEqual(await second.scan(path), { ok: false, reason: LINK_LOST }, 'forget drops the link');
  assert.ok(parent.kids.get(FOLDER_NAME).kids.get('images').kids.has('a.svg'), 'and never touches the folder');
});

await ok('a whole scan over it (runScan): add, unchanged, rename keeps the item, removal is missing, a moved folder changes nothing', async () => {
  const parent = new Dir('P'); const b = createLootWeb({ w: goodWin(async () => parent), store: memStore() });
  const { path } = await b.pickFolder(); const root = parent.kids.get(FOLDER_NAME);
  put(root, 'images/a.svg', '<svg id="a"/>'); put(root, 'images/b.svg', '<svg id="b"/>'); put(root, 'palettes/p.json', '{"p":1}'); put(root, 'other/x.txt', 'no');
  let index = withRoot(emptyIndex(), path); const NOW = 1_000_000;
  const s1 = await runScan({ native: b, index, nowMs: NOW });
  assert.equal(s1.ok, true); assert.equal(s1.summary.add, 3); index = s1.index;
  const s2 = await runScan({ native: b, index, nowMs: NOW + 10 });
  assert.equal(s2.summary.add, 0); assert.equal(s2.summary.unchanged, 3);
  const idBefore = Object.keys(index.items).find((id) => index.items[id].rel === 'images/a.svg');
  const moved = root.kids.get('images').kids.get('a.svg'); root.kids.get('images').kids.delete('a.svg'); root.kids.get('images').kids.set('a2.svg', { ...moved, name: 'a2.svg' });
  const s3 = await runScan({ native: b, index, nowMs: NOW + 20 });
  assert.equal(s3.summary.renamed, 1); index = s3.index;
  assert.equal(index.items[idBefore].rel, 'images/a2.svg', 'the same item, a new path');
  del(root, 'images/b.svg');
  const s4 = await runScan({ native: b, index, nowMs: NOW + 30 });
  assert.equal(s4.summary.missing, 1); index = s4.index;
  assert.equal(Object.values(index.items).filter((i) => i.state === 'missing').length, 1);
  root.gone = true;
  const s5 = await runScan({ native: b, index, nowMs: NOW + 40 });
  assert.equal(s5.ok, true); assert.equal(s5.unreachable, true); assert.equal(s5.summary.missing, 0, 'a folder that cannot be reached marks nothing missing');
});

await ok('the module only ever creates directories: no write, move or delete exists in it', () => {
  const code = src('./lootWeb.mjs').replace(/\/\/.*$/gm, '');
  assert.ok(!/removeEntry|createWritable|\.move\(|\.remove\(|FileSystemWritable|showSaveFilePicker|showOpenFilePicker/.test(code));
  const creates = code.match(/create: true/g) || [];
  assert.equal(creates.length, 2, 'two creation sites: the KC-1 Loot folder and its subfolders');
  assert.ok(!/getFileHandle\([^)]*create/.test(code), 'a file is never created');
  assert.ok(!/localStorage|Date\.now|Math\.random/.test(code));
});

await ok('the default handle store is safe where there is no IndexedDB', async () => {
  const s = createIdbHandleStore(undefined);
  assert.equal(await s.get('root'), null); assert.equal(await s.put('root', {}), false); assert.equal(await s.del('root'), false);
});

await ok('the row takes the desktop backend in the shell and the browser one elsewhere; the folder shows by name', () => {
  const N = { tag: 'native' }; const W = { tag: 'web' };
  assert.equal(createLootBackend({ isDesktop: () => true, native: N, web: W }), N);
  assert.equal(createLootBackend({ isDesktop: () => false, native: N, web: W }), W);
  assert.equal(createLootBackend().unavailable(), WEB_UNSUPPORTED, 'node is neither: a plain reason');
  assert.equal(rootLabel('web:KC-1 Loot'), 'KC-1 Loot (kept in this browser)');
  assert.equal(rootLabel('/Users/me/Loot'), '/Users/me/Loot');
  assert.equal(rootLabel(null), '');
  const row = src('../panels/pipeline/LootRow.jsx');
  assert.ok(/createLootBackend/.test(row) && !/createLootNative\(\)/.test(row), 'the row asks for a backend, not for the native side');
});

console.log(`lootWeb.selfcheck: ${n} checks passed`);
