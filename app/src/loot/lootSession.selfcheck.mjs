// node src/loot/lootSession.selfcheck.mjs
// #1479 slice 5c — the session-only folder read (Safari, Firefox): the chooser's files for this visit, through the REAL
// scan planner, with fake File objects. Nothing is kept past the visit; a cancel is quiet; nothing throws.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLootSession, lootRelOf, sessionFolderSupport, SESSION_PREFIX } from './lootSession.mjs';
import { createLootBackend } from './lootBackend.mjs';
import { runScan } from './lootRun.mjs';
import { emptyIndex, withRoot } from './lootIndex.mjs';
import { MAX_BYTES } from './lootWeb.mjs';
import { rootLabel, SESSION_GONE, WEB_UNSUPPORTED } from './lootCopy.mjs';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const NOW = 9_000_000;
const OLD = NOW - 120_000;
const digest = async (buf) => createHash('sha256').update(Buffer.from(buf)).digest();
const file = (path, text, extra = {}) => {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  return {
    webkitRelativePath: path,
    size: bytes.length,
    lastModified: OLD,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    ...extra,
  };
};
/** A fake <input webkitdirectory>: click() answers with `files` (or a cancel). */
const fakeInput =
  (files, { cancel = false } = {}) =>
  () => {
    const l = {};
    return {
      files,
      addEventListener: (t, f) => {
        l[t] = f;
      },
      click() {
        queueMicrotask(() => (cancel ? l.cancel() : l.change()));
      },
    };
  };
const W = { document: { createElement: () => ({}) } }; // a browser whose input has no directory attribute
const GOOD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

await ok('lootRelOf: keeps the four subfolders, strips one wrapper folder, drops the rest', () => {
  assert.equal(lootRelOf('KC-1 Loot/images/a.svg'), 'images/a.svg');
  assert.equal(lootRelOf('Loot/Audio/x/k.wav'), 'Audio/x/k.wav');
  assert.equal(lootRelOf('KC-1 Loot/README.txt'), null);
  assert.equal(lootRelOf('a/b/images/c.svg'), null, 'two wrappers deep is not a loot folder');
  assert.equal(lootRelOf('KC-1 Loot/images'), null);
  assert.equal(lootRelOf('../images/a.svg'), null);
});

await ok('support is feature-detected: needs the chooser attribute', () => {
  assert.equal(sessionFolderSupport(undefined), WEB_UNSUPPORTED);
  assert.equal(sessionFolderSupport(W), WEB_UNSUPPORTED);
  assert.equal(sessionFolderSupport({ document: { createElement: () => ({ webkitdirectory: true }) } }), null);
});

const files = [
  file('KC-1 Loot/README.txt', 'note'),
  file('KC-1 Loot/images/a.svg', GOOD),
  file('KC-1 Loot/images/b.png', 'png-ish'),
  file('KC-1 Loot/palettes/p.json', '{"swatches":["#112233"]}'),
  file('KC-1 Loot/audio/huge.wav', 'x', { size: MAX_BYTES + 1 }),
];

await ok('pick, scan, hash, read: the real planner indexes the files for this visit', async () => {
  const s = createLootSession({
    w: { document: { createElement: () => ({ webkitdirectory: true }) } },
    makeInput: fakeInput(files),
    digest,
  });
  const p = await s.pickFolder();
  assert.equal(p.path, `${SESSION_PREFIX}KC-1 Loot`);
  const r = await runScan({ native: s, index: withRoot(emptyIndex(), p.path), nowMs: NOW });
  assert.equal(r.ok, true);
  const rels = Object.values(r.index.items)
    .map((i) => i.rel)
    .sort();
  assert.deepEqual(rels, ['images/a.svg', 'palettes/p.json']);
  const logged = r.index.log.map((l) => `${l.rel}: ${l.reason}`).join('\n');
  assert.match(logged, /images\/b\.png: raster not supported yet/);
  assert.match(logged, /audio\/huge\.wav: unreadable: file too large/);
  assert.doesNotMatch(logged, /README/, 'the note outside the subfolders is not ours');
  const a = Object.values(r.index.items).find((i) => i.rel === 'images/a.svg');
  assert.equal(a.hash, createHash('sha256').update(GOOD).digest('hex'));
  const read = await s.read(p.path, 'images/a.svg');
  assert.equal(new TextDecoder().decode(read.bytes), GOOD);
  assert.match((await s.read(p.path, 'audio/huge.wav')).reason, /too large/);
  assert.equal((await s.read(p.path, 'images/none.svg')).ok, false);
});

await ok('a cancel is quiet; an empty folder is a cancel; another visit is told to point again', async () => {
  const w = { document: { createElement: () => ({ webkitdirectory: true }) } };
  assert.deepEqual(await createLootSession({ w, makeInput: fakeInput([], { cancel: true }), digest }).pickFolder(), {
    ok: true,
    path: null,
  });
  assert.deepEqual(await createLootSession({ w, makeInput: fakeInput([]), digest }).pickFolder(), {
    ok: true,
    path: null,
  });
  const fresh = createLootSession({ w, makeInput: fakeInput(files), digest }); // a new visit: nothing held
  assert.equal((await fresh.scan(`${SESSION_PREFIX}KC-1 Loot`)).reason, SESSION_GONE);
  const r = await runScan({ native: fresh, index: withRoot(emptyIndex(), `${SESSION_PREFIX}KC-1 Loot`), nowMs: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.reason, SESSION_GONE);
});

await ok('forget drops the files; a web: label is not ours', async () => {
  const w = { document: { createElement: () => ({ webkitdirectory: true }) } };
  const s = createLootSession({ w, makeInput: fakeInput(files), digest });
  const p = await s.pickFolder();
  s.forget();
  assert.equal((await s.hash(p.path, 'images/a.svg')).reason, SESSION_GONE);
  assert.equal((await s.scan('web:KC-1 Loot')).reason, SESSION_GONE);
});

await ok('the chooser: desktop native, Chromium web, anything else the session read', () => {
  const N = {};
  const Wb = {};
  const S = {};
  assert.equal(createLootBackend({ isDesktop: () => true, native: N, web: Wb, session: S }), N);
  assert.equal(
    createLootBackend({ isDesktop: () => false, native: N, web: Wb, session: S, supportsWeb: () => true }),
    Wb,
  );
  assert.equal(
    createLootBackend({ isDesktop: () => false, native: N, web: Wb, session: S, supportsWeb: () => false }),
    S,
  );
});

await ok('the row names the folder as this visit only', () => {
  assert.equal(rootLabel('session:Loot'), 'Loot (this visit only)');
});

console.log(`lootSession.selfcheck: ${n} checks passed`);
