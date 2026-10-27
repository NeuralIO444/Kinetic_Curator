// node src/loot/lootWrite.selfcheck.mjs
//
// #1591 (Keeps K3) — the loot backends' write verb: the door the keeps
// exports go through. Until K3 the backends could only scan / hash /
// read; the write is deliberately narrow (KC-1's own files only):
//   - native: gated like every native call (desktop + confirmed),
//     bytes travel base64 through the one `loot_write` command, the
//     size cap refuses BEFORE anything is invoked;
//   - web: flat-in-a-subfolder only (the Rust command's rule, mirrored),
//     the subfolder is created when missing, the handle is asked in
//     readwrite mode, and a write round-trips through the read side.
// The Rust command itself (temp sibling + rename, symlink refusals)
// is covered by its own unit tests in src-tauri; the sandbox has no
// cargo, so CI's cargo-check is its compile + test gate.
import assert from 'node:assert/strict';
import { createLootNative, MAX_WRITE_BYTES } from './lootNative.mjs';
import { createLootWeb, WEB_PREFIX, FOLDER_NAME } from './lootWeb.mjs';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const enc = (s) => new TextEncoder().encode(s);

// ── native ──────────────────────────────────────────────────────────
await ok('native write: gates, validation, and the base64 payload', async () => {
  const calls = [];
  const inv = async (cmd, args) => {
    calls.push([cmd, args]);
    return null;
  };
  const b = createLootNative({ invoke: inv, isDesktop: () => true, confirmed: true });

  const r = await b.write('/loot', 'looks/k1.json', enc('{"id":"k1"}'));
  assert.deepEqual(r, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'loot_write');
  assert.equal(calls[0][1].root, '/loot');
  assert.equal(calls[0][1].rel, 'looks/k1.json');
  assert.equal(atob(calls[0][1].data), '{"id":"k1"}', 'bytes travel base64, exactly');

  assert.equal((await b.write('', 'looks/k1.json', enc('x'))).ok, false, 'no root, no write');
  assert.equal((await b.write('/loot', '', enc('x'))).ok, false, 'no rel, no write');
  assert.equal((await b.write('/loot', 'looks/k1.json', 'not bytes')).ok, false, 'bytes or nothing');
  const big = await b.write('/loot', 'looks/k1.json', new Uint8Array(MAX_WRITE_BYTES + 1));
  assert.equal(big.ok, false);
  assert.match(big.reason, /too large/);
  assert.equal(calls.length, 1, 'a refused write never reaches the native side');

  const off = createLootNative({ invoke: inv, isDesktop: () => false, confirmed: true });
  assert.equal((await off.write('/loot', 'looks/k1.json', enc('x'))).ok, false, 'not desktop: gated');
  const unconf = createLootNative({ invoke: inv, isDesktop: () => true, confirmed: false });
  assert.equal((await unconf.write('/loot', 'looks/k1.json', enc('x'))).ok, false, 'unconfirmed: gated');

  const boom = createLootNative({
    invoke: async () => {
      throw new Error('ipc gone');
    },
    isDesktop: () => true,
    confirmed: true,
  });
  assert.equal(
    (await boom.write('/loot', 'looks/k1.json', enc('x'))).ok,
    false,
    'a dead IPC is a refusal, not a throw',
  );
});

// ── web ─────────────────────────────────────────────────────────────
class WFile {
  constructor(name) {
    this.kind = 'file';
    this.name = name;
    this.bytes = null;
  }
  async createWritable() {
    const self = this;
    return {
      async write(b) {
        self.bytes = b;
      },
      async close() {},
    };
  }
  async getFile() {
    const b = this.bytes || new Uint8Array(0);
    return {
      size: b.length,
      lastModified: 1,
      arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    };
  }
}
class WDir {
  constructor(name) {
    this.kind = 'directory';
    this.name = name;
    this.kids = new Map();
  }
  async *entries() {
    for (const e of [...this.kids].sort((a, b) => (a[0] < b[0] ? -1 : 1))) yield e;
  }
  values() {
    const it = this.entries();
    return { next: () => it.next() };
  }
  async getDirectoryHandle(name, opts = {}) {
    const k = this.kids.get(name);
    if (k) {
      if (k.kind !== 'directory') throw Object.assign(new Error('type'), { name: 'TypeMismatchError' });
      return k;
    }
    if (!opts.create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
    const d = new WDir(name);
    this.kids.set(name, d);
    return d;
  }
  async getFileHandle(name, opts = {}) {
    let f = this.kids.get(name);
    if (!f) {
      if (!opts.create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
      f = new WFile(name);
      this.kids.set(name, f);
    }
    return f;
  }
  async queryPermission() {
    return 'granted';
  }
  async requestPermission() {
    return 'granted';
  }
}
const memStore = () => {
  const m = new Map();
  return {
    m,
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
    async put(k, v) {
      m.set(k, v);
      return true;
    },
    async del(k) {
      m.delete(k);
      return true;
    },
  };
};
const goodWin = (pick) => ({ isSecureContext: true, indexedDB: {}, showDirectoryPicker: pick });

await ok('web write: creates the subfolder, writes flat, reads back whole', async () => {
  const parent = new WDir('loot-src');
  const b = createLootWeb({ w: goodWin(async () => parent), store: memStore() });
  const p = await b.pickFolder();
  assert.equal(p.ok, true);
  const label = p.path;
  assert.equal(label, WEB_PREFIX + FOLDER_NAME);

  const bytes = enc('{"id":"k9","seed":9}');
  assert.deepEqual(await b.write(label, 'looks/k9.json', bytes), { ok: true });
  const back = await b.read(label, 'looks/k9.json');
  assert.equal(back.ok, true);
  assert.deepEqual([...back.bytes], [...bytes], 'the written file reads back byte-exact');

  assert.equal((await b.write(label, 'looks/sub/k9.json', bytes)).ok, false, 'no nesting: flat in a subfolder only');
  assert.equal((await b.write(label, 'k9.json', bytes)).ok, false, 'no root-level files');
  assert.equal((await b.write(label, 'looks/k9.json', 'nope')).ok, false, 'bytes or nothing');
  const big = await b.write(label, 'looks/k9.json', new Uint8Array(MAX_WRITE_BYTES + 1));
  assert.equal(big.ok, false);
  assert.match(big.reason, /too large/);
  assert.equal(
    (await b.write('web:Somebody Elses Folder', 'looks/k9.json', bytes)).ok,
    false,
    'a foreign label is refused',
  );
});

console.log(`lootWrite.selfcheck: PASS (${n} groups)`);
